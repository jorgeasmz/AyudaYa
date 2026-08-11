/**
 * Todas las operaciones de datos de la aplicación.
 *
 * Dos garantías para conexiones malas:
 *   - Tope de tiempo (en `supabase.js`, vía AbortController): una petición
 *     colgada nunca deja la interfaz esperando para siempre.
 *   - Reintentos con espera creciente, SOLO en fallos de red. Un error de
 *     validación o de límite de envíos no se reintenta jamás: repetirlo daría
 *     el mismo resultado y gastaría la cuota del usuario.
 */

import {
  ErrorApp,
  TOPE_ENVIO_MS,
  actualizar,
  autenticar,
  cerrarSesion,
  eliminar,
  escucharTabla,
  interpretarError,
  llamarRpc,
  recuperarSesion,
  seleccionar,
} from './supabase.js';
import { LIMITE_REPORTES, LIMITE_PERSONAS } from './constantes.js';
import { prepararBusqueda } from './formato.js';

const MOTIVOS_REINTENTABLES = new Set(['red']);

const COLUMNAS_REPORTE =
  'id,tipo,titulo,descripcion,lat,lng,ciudad,contacto,estado,verificado,' +
  'fuente_verificacion,reportes_abuso,created_at,actualizado_en';

const COLUMNAS_PERSONA =
  'id,tipo_registro,nombre_completo,edad_aprox,zona_barrio,ciudad,descripcion,' +
  'contacto_reportante,estado,reportes_abuso,created_at,actualizado_en';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function conReintentos(operacion, { intentos = 3, señal } = {}) {
  let ultimoError;

  for (let intento = 0; intento < intentos; intento += 1) {
    if (señal?.aborted) throw new ErrorApp('Operación cancelada.', 'cancelado');

    try {
      return await operacion();
    } catch (bruto) {
      const error = interpretarError(bruto);
      ultimoError = error;

      const ultimoIntento = intento === intentos - 1;
      if (!MOTIVOS_REINTENTABLES.has(error.motivo) || ultimoIntento) throw error;

      // 600 ms, 1.8 s: deja respirar a una red saturada sin desesperar a quien
      // está mirando la pantalla.
      await esperar(600 * 3 ** intento);
    }
  }

  throw ultimoError;
}

/** Las RPC de creación devuelven el uuid de la fila, que es el que enviamos. */
function confirmarId(resultado, esperado, mensajeSiFalta) {
  const id = Array.isArray(resultado) ? resultado[0] : resultado;
  if (!id || id !== esperado) throw new ErrorApp(mensajeSiFalta, 'desconocido');
  return id;
}

// ===========================================================================
//  MAPA
// ===========================================================================

export function listarReportes({ señal } = {}) {
  return conReintentos(
    () =>
      seleccionar('reportes_mapa', {
        columnas: COLUMNAS_REPORTE,
        orden: [['actualizado_en', 'desc']],
        limite: LIMITE_REPORTES,
        señal,
      }),
    { señal }
  );
}

/**
 * `datos` debe traer `id` y `codigo` ya generados en el navegador
 * (ver identificadores.js). La RPC es idempotente, así que reintentar es
 * seguro: el servidor reconoce el `id` y no crea una segunda fila.
 */
export function crearReporte(datos) {
  return conReintentos(
    async () =>
      confirmarId(
        await llamarRpc(
          'crear_reporte_mapa',
          {
            p_id: datos.id,
            p_codigo: datos.codigo,
            p_tipo: datos.tipo,
            p_titulo: datos.titulo,
            p_lat: datos.lat,
            p_lng: datos.lng,
            p_ciudad: datos.ciudad || 'Otra',
            p_descripcion: datos.descripcion || null,
            p_contacto: datos.contacto || null,
          },
          { tope: TOPE_ENVIO_MS }
        ),
        datos.id,
        'El servidor no confirmó el reporte.'
      ),
    // Un solo intento: quien reintenta de verdad es la cola de envíos, que no
    // deja a nadie mirando "Publicando…" durante medio minuto.
    { intentos: 1 }
  );
}

export function actualizarEstadoReporte(id, codigo, estado) {
  return conReintentos(
    () =>
      llamarRpc('actualizar_estado_reporte', {
        p_id: id,
        p_codigo: codigo,
        p_estado: estado,
      }),
    { intentos: 2 }
  );
}

// ===========================================================================
//  PERSONAS
// ===========================================================================

export function buscarPersonas({
  texto = '',
  ciudad = '',
  tipoRegistro = '',
  incluirEncontrados = false,
  señal,
} = {}) {
  const filtros = [];

  const termino = prepararBusqueda(texto);
  if (termino) {
    // `nombre_normalizado` es una columna generada sin tildes ni mayúsculas,
    // así que "jose" encuentra "José" y "MARÍA" encuentra "maria".
    filtros.push(['nombre_normalizado', 'ilike', `%${termino}%`]);
  }
  if (ciudad) filtros.push(['ciudad', 'eq', ciudad]);
  if (tipoRegistro) filtros.push(['tipo_registro', 'eq', tipoRegistro]);
  if (!incluirEncontrados) filtros.push(['estado', 'eq', 'buscando']);

  return conReintentos(
    () =>
      seleccionar('personas_busqueda', {
        columnas: COLUMNAS_PERSONA,
        filtros,
        orden: [['created_at', 'desc']],
        limite: LIMITE_PERSONAS,
        señal,
      }),
    { señal }
  );
}

/** Idempotente igual que `crearReporte`. */
export function crearRegistroPersona(datos) {
  return conReintentos(
    async () =>
      confirmarId(
        await llamarRpc(
          'crear_registro_persona',
          {
            p_id: datos.id,
            p_codigo: datos.codigo,
            p_tipo_registro: datos.tipoRegistro,
            p_nombre_completo: datos.nombreCompleto,
            p_contacto_reportante: datos.contacto,
            p_ciudad: datos.ciudad || 'Otra',
            p_edad_aprox:
              datos.edad === '' || datos.edad == null ? null : Number(datos.edad),
            p_zona_barrio: datos.zona || null,
            p_descripcion: datos.descripcion || null,
          },
          { tope: TOPE_ENVIO_MS }
        ),
        datos.id,
        'El servidor no confirmó el registro.'
      ),
    { intentos: 1 }
  );
}

export function marcarPersonaEncontrada(id, codigo) {
  return conReintentos(
    () => llamarRpc('marcar_persona_encontrada', { p_id: id, p_codigo: codigo }),
    { intentos: 2 }
  );
}

export function eliminarRegistroPersona(id, codigo) {
  return conReintentos(
    () => llamarRpc('eliminar_registro_persona', { p_id: id, p_codigo: codigo }),
    { intentos: 2 }
  );
}

// ===========================================================================
//  DENUNCIAS
// ===========================================================================

export function denunciar(recurso, id) {
  return conReintentos(
    () => llamarRpc('reportar_abuso', { p_recurso: recurso, p_id: id }),
    { intentos: 2 }
  );
}

// ===========================================================================
//  MODERACIÓN
//  La sesión solo es la mitad del control: la RLS comprueba además que el
//  usuario esté en `privado.administradores`.
// ===========================================================================

export const iniciarSesionAdmin = autenticar;
export const cerrarSesionAdmin = cerrarSesion;
export const sesionActual = recuperarSesion;

export async function verificarEsAdmin() {
  return (await llamarRpc('es_admin')) === true;
}

export function listarReportesModeracion() {
  return conReintentos(() =>
    seleccionar('reportes_mapa', {
      columnas: COLUMNAS_REPORTE,
      orden: [
        ['reportes_abuso', 'desc'],
        ['created_at', 'desc'],
      ],
      limite: 300,
    })
  );
}

export function listarPersonasModeracion() {
  return conReintentos(() =>
    seleccionar('personas_busqueda', {
      columnas: COLUMNAS_PERSONA,
      orden: [
        ['reportes_abuso', 'desc'],
        ['created_at', 'desc'],
      ],
      limite: 300,
    })
  );
}

const TABLA = { reporte_mapa: 'reportes_mapa', persona: 'personas_busqueda' };

function tablaDe(recurso) {
  const tabla = TABLA[recurso];
  if (!tabla) throw new ErrorApp('Recurso desconocido.', 'validacion');
  return tabla;
}

export function moderarVerificar(id, fuente) {
  return actualizar('reportes_mapa', id, {
    verificado: true,
    fuente_verificacion: fuente,
    // Verificar reinicia el contador: las denuncias previas quedan resueltas
    // por decisión del moderador.
    reportes_abuso: 0,
    actualizado_en: new Date().toISOString(),
  });
}

export function moderarQuitarVerificacion(id) {
  return actualizar('reportes_mapa', id, {
    verificado: false,
    fuente_verificacion: null,
    actualizado_en: new Date().toISOString(),
  });
}

export function moderarCambiarEstado(recurso, id, estado) {
  return actualizar(tablaDe(recurso), id, {
    estado,
    actualizado_en: new Date().toISOString(),
  });
}

/** Descarta las denuncias acumuladas y devuelve el registro a la vista pública. */
export function moderarDescartarDenuncias(recurso, id) {
  return actualizar(tablaDe(recurso), id, {
    reportes_abuso: 0,
    actualizado_en: new Date().toISOString(),
  });
}

export function moderarEliminar(recurso, id) {
  return eliminar(tablaDe(recurso), id);
}

// ===========================================================================
//  REALTIME
// ===========================================================================

export function suscribirseAReportes(alCambiar, alEstadoCanal) {
  return escucharTabla('reportes_mapa', alCambiar, alEstadoCanal);
}
