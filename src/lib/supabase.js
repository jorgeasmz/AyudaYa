/**
 * Cliente mínimo de Supabase, escrito a mano sobre `fetch`.
 *
 * ¿Por qué no `@supabase/supabase-js`? Porque pesa 58 KB comprimidos y trae
 * Storage, Edge Functions y un cliente de Postgres completo que aquí no se
 * usan. Supabase expone PostgREST y GoTrue como APIs HTTP normales, así que
 * hablar con ellas directamente cuesta ~150 líneas y 0 KB.
 *
 * De la familia oficial solo se carga `@supabase/realtime-js` (17 KB), y
 * encima de forma diferida: los reportes se pintan antes de que el WebSocket
 * exista siquiera. En una 3G saturada esos 41 KB de diferencia son varios
 * segundos de pantalla vacía.
 *
 * Lo que sí se conserva íntegro es el modelo de seguridad: la clave pública va
 * en cada petición y son las políticas de Row Level Security del servidor las
 * que deciden qué se puede leer y escribir.
 */

import { leer, escribir, borrar } from './almacenamiento.js';

export const URL_SUPABASE = String(import.meta.env.VITE_SUPABASE_URL || '').replace(
  /\/+$/,
  ''
);
export const CLAVE_SUPABASE = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const estaConfigurado = Boolean(URL_SUPABASE && CLAVE_SUPABASE);

const BASE_REST = `${URL_SUPABASE}/rest/v1`;
const BASE_AUTH = `${URL_SUPABASE}/auth/v1`;
const TOPE_MS = 12000;

/**
 * Tope más corto para los envíos que se pueden encolar. Si publicar no sale en
 * 8 segundos, esperar más no aporta nada: la cola lo reintentará sola, y quien
 * está reportando recupera el control de la pantalla enseguida.
 */
export const TOPE_ENVIO_MS = 8000;

/**
 * Error con un `motivo` legible, para decidir el mensaje y si conviene
 * reintentar.
 *   'red'           -> sin conexión o servidor inalcanzable (se reintenta)
 *   'validacion'    -> el servidor rechazó los datos (NO se reintenta)
 *   'limite'        -> demasiados envíos desde la misma IP (NO se reintenta)
 *   'permiso'       -> sesión caducada o sin autorización
 *   'configuracion' -> faltan variables de entorno
 *   'cancelado'     -> la petición se abortó a propósito
 */
export class ErrorApp extends Error {
  constructor(mensaje, motivo = 'desconocido', causa = null) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.motivo = motivo;
    this.causa = causa;
  }
}

// ===========================================================================
//  Sesión (solo la usa el panel de moderación)
// ===========================================================================

const CLAVE_SESION = 'sesion.admin';

let sesion = leer(CLAVE_SESION, null);

function guardarSesion(datos) {
  sesion = datos;
  if (datos) escribir(CLAVE_SESION, datos);
  else borrar(CLAVE_SESION);
}

export function sesionGuardada() {
  return sesion;
}

/** Token válido, renovándolo si le queda menos de un minuto. */
async function tokenVigente() {
  if (!sesion?.access_token) return null;

  if (sesion.expira_en && sesion.expira_en - Date.now() > 60000) {
    return sesion.access_token;
  }

  if (!sesion.refresh_token) {
    guardarSesion(null);
    return null;
  }

  try {
    const datos = await peticionAuth('token?grant_type=refresh_token', {
      refresh_token: sesion.refresh_token,
    });
    guardarSesion(normalizarSesion(datos));
    return sesion.access_token;
  } catch {
    // El refresh caducó: hay que volver a escribir la contraseña.
    guardarSesion(null);
    return null;
  }
}

function normalizarSesion(datos) {
  return {
    access_token: datos.access_token,
    refresh_token: datos.refresh_token,
    expira_en: Date.now() + (Number(datos.expires_in) || 3600) * 1000,
    correo: datos.user?.email || null,
  };
}

// ===========================================================================
//  HTTP
// ===========================================================================

function abortadorConTope(señalExterna, tope = TOPE_MS) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort('tope'), tope);

  if (señalExterna) {
    if (señalExterna.aborted) control.abort();
    else señalExterna.addEventListener('abort', () => control.abort(), { once: true });
  }

  return { señal: control.signal, limpiar: () => clearTimeout(t) };
}

async function leerCuerpo(respuesta) {
  if (respuesta.status === 204) return null;
  const texto = await respuesta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/** Convierte una respuesta de error de PostgREST o GoTrue en un `ErrorApp`. */
function errorDeRespuesta(estado, cuerpo) {
  const codigo = cuerpo?.code || cuerpo?.error_code || '';
  const mensaje =
    cuerpo?.message || cuerpo?.msg || cuerpo?.error_description || cuerpo?.error || '';

  // P0001 = `raise exception` de nuestras funciones SQL. El mensaje ya viene
  // escrito en español y pensado para el usuario final.
  if (codigo === 'P0001') {
    const esLimite = /demasiad|varios reportes|varios registros|muchas denuncias/i.test(
      mensaje
    );
    return new ErrorApp(mensaje, esLimite ? 'limite' : 'validacion');
  }

  if (String(codigo).startsWith('23') || codigo === '22P02') {
    return new ErrorApp(
      'Algún dato no es válido. Revisa el formulario e inténtalo de nuevo.',
      'validacion'
    );
  }

  if (estado === 401 || estado === 403 || codigo === '42501' || codigo === 'PGRST301') {
    return new ErrorApp(
      'Tu sesión expiró o no tienes permiso para esta acción.',
      'permiso'
    );
  }

  if (estado === 429) {
    return new ErrorApp(
      'El servidor está recibiendo demasiadas peticiones. Espera un momento.',
      'limite'
    );
  }

  if (estado >= 500) {
    return new ErrorApp(
      'El servidor no responde bien en este momento. Reintentaremos.',
      'red'
    );
  }

  return new ErrorApp(mensaje || 'Ocurrió un error inesperado.', 'validacion');
}

/** Petición autenticada a PostgREST. */
async function peticion(
  ruta,
  { metodo = 'GET', cuerpo, cabeceras = {}, señal, tope } = {}
) {
  if (!estaConfigurado) {
    throw new ErrorApp(
      'La aplicación no está configurada. Faltan VITE_SUPABASE_URL y ' +
        'VITE_SUPABASE_ANON_KEY.',
      'configuracion'
    );
  }

  const token = (await tokenVigente()) || CLAVE_SUPABASE;
  const { señal: señalFinal, limpiar } = abortadorConTope(señal, tope);

  let respuesta;
  try {
    respuesta = await fetch(`${BASE_REST}/${ruta}`, {
      method: metodo,
      signal: señalFinal,
      headers: {
        apikey: CLAVE_SUPABASE,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...cabeceras,
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (fallo) {
    if (señal?.aborted) throw new ErrorApp('Petición cancelada.', 'cancelado');
    // `fetch` rechaza sin código de estado tanto si no hay red como si saltó
    // nuestro propio tope de tiempo. En ambos casos conviene reintentar.
    throw new ErrorApp('Sin conexión o red muy lenta. Reintentaremos.', 'red', fallo);
  } finally {
    limpiar();
  }

  const datos = await leerCuerpo(respuesta);
  if (!respuesta.ok) throw errorDeRespuesta(respuesta.status, datos);
  return datos;
}

/** Petición a GoTrue (autenticación del panel de moderación). */
async function peticionAuth(ruta, cuerpo, { metodo = 'POST', token } = {}) {
  const { señal, limpiar } = abortadorConTope();

  let respuesta;
  try {
    respuesta = await fetch(`${BASE_AUTH}/${ruta}`, {
      method: metodo,
      // `signal: señal`, nunca la abreviatura `signal`: el nombre en español no
      // coincide con el de la opción y la referencia quedaría sin definir.
      signal: señal,
      headers: {
        apikey: CLAVE_SUPABASE,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (fallo) {
    throw new ErrorApp('Sin conexión con el servidor.', 'red', fallo);
  } finally {
    limpiar();
  }

  const datos = await leerCuerpo(respuesta);
  if (!respuesta.ok) throw errorDeRespuesta(respuesta.status, datos);
  return datos;
}

// ===========================================================================
//  PostgREST: consultas
// ===========================================================================

/**
 * Construye la cadena de consulta.
 * `filtros` es una lista de `[columna, operador, valor]`, p. ej.
 * `['ciudad', 'eq', 'Cali']` o `['nombre_normalizado', 'ilike', '%jose%']`.
 */
function construirConsulta({ columnas, filtros = [], orden = [], limite }) {
  const partes = [];

  // `select` y `order` se componen solo con nombres de columna definidos en el
  // código, nunca con entrada del usuario: van sin codificar para no convertir
  // las comas separadoras en %2C. Los VALORES de los filtros sí se codifican.
  if (columnas) partes.push(`select=${columnas}`);

  filtros.forEach(([columna, operador, valor]) => {
    if (valor === undefined || valor === null || valor === '') return;
    partes.push(`${columna}=${operador}.${encodeURIComponent(valor)}`);
  });

  if (orden.length) {
    partes.push(`order=${orden.map(([c, d]) => `${c}.${d}`).join(',')}`);
  }

  if (limite) partes.push(`limit=${limite}`);

  return partes.join('&');
}

export async function seleccionar(tabla, opciones = {}) {
  const consulta = construirConsulta(opciones);
  const datos = await peticion(`${tabla}?${consulta}`, { señal: opciones.señal });
  return Array.isArray(datos) ? datos : [];
}

export async function llamarRpc(nombre, argumentos = {}, opciones = {}) {
  return peticion(`rpc/${nombre}`, {
    metodo: 'POST',
    cuerpo: argumentos,
    señal: opciones.señal,
    tope: opciones.tope,
  });
}

export async function actualizar(tabla, id, cambios) {
  return peticion(`${tabla}?id=eq.${encodeURIComponent(id)}`, {
    metodo: 'PATCH',
    cuerpo: cambios,
    // Sin `return=representation` no hace falta permiso de lectura sobre la
    // fila modificada, y la respuesta viaja vacía.
    cabeceras: { Prefer: 'return=minimal' },
  });
}

export async function eliminar(tabla, id) {
  return peticion(`${tabla}?id=eq.${encodeURIComponent(id)}`, {
    metodo: 'DELETE',
    cabeceras: { Prefer: 'return=minimal' },
  });
}

// ===========================================================================
//  GoTrue: autenticación del panel
// ===========================================================================

export async function autenticar(correo, contrasena) {
  try {
    const datos = await peticionAuth('token?grant_type=password', {
      email: correo,
      password: contrasena,
    });
    guardarSesion(normalizarSesion(datos));
    return sesion;
  } catch (error) {
    if (error.motivo === 'permiso' || error.motivo === 'validacion') {
      throw new ErrorApp('Correo o contraseña incorrectos.', 'permiso', error);
    }
    throw error;
  }
}

export async function cerrarSesion() {
  const token = sesion?.access_token;
  guardarSesion(null);
  if (!token) return;
  try {
    await peticionAuth('logout', undefined, { token });
  } catch {
    // El token local ya se borró: el cierre de sesión es efectivo igualmente.
  }
}

/** Sesión utilizable, renovando el token si hace falta. */
export async function recuperarSesion() {
  const token = await tokenVigente();
  return token ? sesion : null;
}

// ===========================================================================
//  Realtime (carga diferida)
// ===========================================================================

let promesaRealtime = null;

function obtenerClienteRealtime() {
  if (!promesaRealtime) {
    promesaRealtime = import('@supabase/realtime-js')
      .then(({ RealtimeClient }) => {
        const urlSocket = `${URL_SUPABASE.replace(/^http/, 'ws')}/realtime/v1`;
        return new RealtimeClient(urlSocket, {
          // `apikey` es obligatorio: el cliente lanza excepción sin él.
          // `eventsPerSecond` limita la ráfaga de mensajes, que en una red
          // saturada es tan dañina como la falta de datos.
          params: { apikey: CLAVE_SUPABASE, eventsPerSecond: 2 },
        });
      })
      .catch((fallo) => {
        // Que un fallo de red al cargar el trozo no envenene la promesa para
        // siempre: el siguiente intento vuelve a probar.
        promesaRealtime = null;
        throw new ErrorApp('No se pudo activar el modo en vivo.', 'red', fallo);
      });
  }
  return promesaRealtime;
}

/**
 * Escucha los cambios de una tabla. Devuelve una función para darse de baja.
 */
export async function escucharTabla(tabla, alCambiar, alEstado) {
  const cliente = await obtenerClienteRealtime();

  // Si hay sesión de moderación, el socket la usa para evaluar la RLS.
  const token = await tokenVigente();
  if (token) await cliente.setAuth(token);

  const canal = cliente
    .channel(`publico-${tabla}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, (carga) => {
      alCambiar({
        evento: carga.eventType,
        nuevo: carga.new && Object.keys(carga.new).length ? carga.new : null,
        viejo: carga.old && Object.keys(carga.old).length ? carga.old : null,
      });
    })
    .subscribe((estado) => alEstado?.(estado));

  return () => {
    try {
      cliente.removeChannel(canal);
    } catch {
      /* el canal ya estaba cerrado */
    }
  };
}

/** Normaliza cualquier excepción a un `ErrorApp`. */
export function interpretarError(error) {
  if (error instanceof ErrorApp) return error;
  if (!error) return new ErrorApp('Ocurrió un error inesperado.', 'desconocido');

  const esFalloDeRed =
    error.name === 'TypeError' ||
    error.name === 'AbortError' ||
    /failed to fetch|load failed|networkerror/i.test(error.message || '');

  if (esFalloDeRed) {
    return new ErrorApp('Sin conexión. Reintentaremos solos.', 'red', error);
  }

  return new ErrorApp(
    error.message || 'Ocurrió un error inesperado.',
    'desconocido',
    error
  );
}
