import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TarjetaPersona from './TarjetaPersona.jsx';
import FormularioPersona from './FormularioPersona.jsx';
import Hoja from '../../componentes/Hoja.jsx';
import Mensaje from '../../componentes/Mensaje.jsx';
import AvisoConexion from '../../componentes/AvisoConexion.jsx';
import AvisoPrivacidad from '../../componentes/AvisoPrivacidad.jsx';
import { EsqueletoLista } from '../../componentes/Esqueleto.jsx';
import { buscarPersonas } from '../../lib/api.js';
import { interpretarError } from '../../lib/supabase.js';
import { useConexion } from '../../lib/usarConexion.js';
import { useCola } from '../../lib/usarCola.js';
import { CIUDADES, LIMITE_PERSONAS } from '../../lib/constantes.js';

export default function VistaPersonas() {
  // Se desestructura a propósito: `useConexion` devuelve un objeto nuevo en cada
  // render, así que meterlo entero en las dependencias de `buscar` provocaría un
  // bucle infinito de búsquedas. Los dos callbacks sí son estables.
  const { estado: estadoConexion, registrarFallo, registrarExito } = useConexion();

  const [texto, establecerTexto] = useState('');
  const [ciudad, establecerCiudad] = useState('');
  const [tipoRegistro, establecerTipoRegistro] = useState('');
  const [incluirEncontrados, establecerIncluirEncontrados] = useState(false);

  const [personas, establecerPersonas] = useState([]);
  const [cargando, establecerCargando] = useState(true);
  const [error, establecerError] = useState(null);
  const [formulario, establecerFormulario] = useState(null); // tipo_registro o null

  const cola = useCola('persona');

  const montado = useRef(true);
  const peticionRef = useRef(0);

  const buscar = useCallback(async () => {
    const miPeticion = ++peticionRef.current;
    establecerCargando(true);

    try {
      const datos = await buscarPersonas({
        texto,
        ciudad,
        tipoRegistro,
        incluirEncontrados,
      });
      // Descarta respuestas de búsquedas ya superadas: con la red lenta llegan
      // desordenadas y una vieja podría pisar a la actual.
      if (!montado.current || miPeticion !== peticionRef.current) return;

      establecerPersonas(datos);
      establecerError(null);
      registrarExito();
    } catch (bruto) {
      if (!montado.current || miPeticion !== peticionRef.current) return;
      const err = interpretarError(bruto);
      establecerError(err);
      if (err.motivo === 'red') registrarFallo();
    } finally {
      if (montado.current && miPeticion === peticionRef.current) {
        establecerCargando(false);
      }
    }
  }, [texto, ciudad, tipoRegistro, incluirEncontrados, registrarExito, registrarFallo]);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Rebote de 350 ms: en 3G, buscar en cada tecla satura la conexión y hace que
  // el teclado se sienta pegajoso.
  useEffect(() => {
    const t = setTimeout(buscar, texto ? 350 : 0);
    return () => clearTimeout(t);
  }, [buscar, texto]);

  const alCambiarPersona = useCallback((id, cambios) => {
    establecerPersonas((previas) => {
      if (cambios === null) return previas.filter((p) => p.id !== id);
      return previas.map((p) => (p.id === id ? { ...p, ...cambios } : p));
    });
  }, []);

  // Los registros que aún no han salido del dispositivo van arriba del todo:
  // quien los escribió necesita ver que no se perdieron.
  const listadas = useMemo(() => {
    if (!cola.pendientes.length) return personas;

    const yaPublicados = new Set(personas.map((p) => p.id));
    const enEspera = cola.pendientes
      .filter((e) => !yaPublicados.has(e.datos.id))
      .map((e) => ({
        id: e.datos.id,
        tipo_registro: e.datos.tipoRegistro,
        nombre_completo: e.datos.nombreCompleto,
        edad_aprox: e.datos.edad,
        zona_barrio: e.datos.zona,
        ciudad: e.datos.ciudad,
        descripcion: e.datos.descripcion,
        contacto_reportante: e.datos.contacto,
        estado: 'buscando',
        reportes_abuso: 0,
        created_at: e.encoladoEn,
        actualizado_en: e.encoladoEn,
        _pendiente: true,
      }));

    return [...enEspera, ...personas];
  }, [personas, cola.pendientes]);

  const hayFiltros = Boolean(texto || ciudad || tipoRegistro);

  return (
    <div className="vista-personas">
      <AvisoConexion estado={estadoConexion} alReintentar={buscar} />

      {cola.pendientes.length > 0 && (
        <div className="aviso-cola" role="status" aria-live="polite">
          <span aria-hidden="true">📥</span>
          <span className="aviso-cola-texto">
            <strong>
              {cola.pendientes.length}{' '}
              {cola.pendientes.length === 1
                ? 'registro sin enviar'
                : 'registros sin enviar'}
            </strong>
            . Salen solos cuando vuelva la señal.
          </span>
          <button
            type="button"
            className="aviso-cola-boton"
            onClick={cola.reintentar}
            disabled={cola.reintentando}
          >
            {cola.reintentando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        </div>
      )}

      <div className="acciones-principales">
        <button
          type="button"
          className="boton-accion es-buscar"
          onClick={() => establecerFormulario('busco_a_alguien')}
        >
          <span className="boton-accion-emoji" aria-hidden="true">
            🔎
          </span>
          <span className="boton-accion-texto">
            <strong>Busco a alguien</strong>
            <small>Publica los datos de quien buscas</small>
          </span>
        </button>

        <button
          type="button"
          className="boton-accion es-bien"
          onClick={() => establecerFormulario('estoy_bien')}
        >
          <span className="boton-accion-emoji" aria-hidden="true">
            💚
          </span>
          <span className="boton-accion-texto">
            <strong>Estoy bien, quiero avisar</strong>
            <small>Para que quien te busca te encuentre</small>
          </span>
        </button>
      </div>

      <AvisoPrivacidad />

      <div className="buscador">
        <label className="etiqueta" htmlFor="busqueda">
          Buscar por nombre
        </label>
        <input
          id="busqueda"
          className="entrada entrada-busqueda"
          type="search"
          value={texto}
          onChange={(e) => establecerTexto(e.target.value)}
          placeholder="Ej.: maria rios"
          autoComplete="off"
          enterKeyHint="search"
        />
        <p className="ayuda">No hace falta escribir tildes ni el nombre completo.</p>

        <div className="buscador-filtros">
          <select
            className="entrada entrada-compacta"
            value={ciudad}
            onChange={(e) => establecerCiudad(e.target.value)}
            aria-label="Filtrar por ciudad"
          >
            <option value="">Todas las ciudades</option>
            {CIUDADES.map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>

          <select
            className="entrada entrada-compacta"
            value={tipoRegistro}
            onChange={(e) => establecerTipoRegistro(e.target.value)}
            aria-label="Filtrar por tipo de registro"
          >
            <option value="">Todos los avisos</option>
            <option value="busco_a_alguien">Se busca</option>
            <option value="estoy_bien">Estoy bien</option>
          </select>
        </div>

        <label className="casilla">
          <input
            type="checkbox"
            checked={incluirEncontrados}
            onChange={(e) => establecerIncluirEncontrados(e.target.checked)}
          />
          <span>Incluir personas ya encontradas</span>
        </label>
      </div>

      {error && error.motivo !== 'red' && (
        <Mensaje tipo="error">{error.message}</Mensaje>
      )}

      <div className="lista-personas">
        {cargando && !listadas.length && <EsqueletoLista filas={3} />}

        {!cargando && !listadas.length && (
          <div className="lista-vacia">
            {hayFiltros ? (
              <>
                <p>
                  <strong>Sin resultados.</strong>
                </p>
                <p>
                  Prueba con menos letras del nombre, o quita los filtros de ciudad y
                  tipo. También puede que aún nadie haya publicado.
                </p>
              </>
            ) : (
              <>
                <p>
                  <strong>Todavía no hay registros.</strong>
                </p>
                <p>
                  Usa los botones de arriba para publicar una búsqueda o avisar de que
                  estás bien.
                </p>
              </>
            )}
          </div>
        )}

        {listadas.map((p) => (
          <TarjetaPersona key={p.id} persona={p} alCambiar={alCambiarPersona} />
        ))}

        {personas.length >= LIMITE_PERSONAS && (
          <Mensaje tipo="aviso">
            Se muestran los {LIMITE_PERSONAS} registros más recientes. Afina la búsqueda
            por nombre o ciudad para ver el resto.
          </Mensaje>
        )}
      </div>

      <Hoja
        abierta={Boolean(formulario)}
        alto="alta"
        titulo={formulario === 'busco_a_alguien' ? 'Busco a alguien' : 'Estoy bien'}
        alCerrar={() => establecerFormulario(null)}
      >
        {formulario && (
          <FormularioPersona
            tipoRegistro={formulario}
            alCrear={buscar}
            alCerrar={() => establecerFormulario(null)}
          />
        )}
      </Hoja>
    </div>
  );
}
