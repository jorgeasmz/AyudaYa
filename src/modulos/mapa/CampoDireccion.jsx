import { useEffect, useRef, useState } from 'react';
import { buscarDirecciones } from '../../lib/geocodificacion.js';

/**
 * Campo de dirección con sugerencias, al estilo de un buscador de mapas.
 *
 * Es la forma principal de fijar la ubicación: escribir es más rápido y menos
 * incómodo que arrastrar un pin en una pantalla pequeña.
 *
 * Dos cosas independientes a propósito:
 *
 *   - El TEXTO de la dirección se guarda siempre, se elija sugerencia o no.
 *   - Las COORDENADAS solo se fijan al elegir una sugerencia (o con el GPS, o
 *     tocando el mapa).
 *
 * Esa separación importa aquí: en barrios informales muchas direcciones no
 * existen en OpenStreetMap. Quien las escriba conserva su texto y fija el punto
 * por otra vía, en lugar de quedarse bloqueado.
 */
export default function CampoDireccion({
  valor,
  alCambiarTexto,
  alElegirSugerencia,
  ciudad,
  ubicacionFijada,
}) {
  const [sugerencias, establecerSugerencias] = useState([]);
  const [buscando, establecerBuscando] = useState(false);
  const [error, establecerError] = useState(null);
  const [abierto, establecerAbierto] = useState(false);

  // Tras elegir una sugerencia no hay que volver a buscar con ese mismo texto:
  // se reabriría la lista sola justo después de cerrarla.
  const textoElegido = useRef(null);

  useEffect(() => {
    const termino = valor.trim();

    if (termino.length < 4 || termino === textoElegido.current) {
      establecerSugerencias([]);
      establecerBuscando(false);
      establecerError(null);
      return undefined;
    }

    const controlador = new AbortController();
    establecerBuscando(true);
    establecerError(null);

    // 600 ms: por debajo, se dispararían más peticiones de las que permite la
    // política de uso de Nominatim.
    const t = setTimeout(async () => {
      try {
        const encontrados = await buscarDirecciones(termino, {
          ciudad,
          señal: controlador.signal,
        });
        if (controlador.signal.aborted) return;
        establecerSugerencias(encontrados);
        establecerAbierto(true);
      } catch (fallo) {
        if (controlador.signal.aborted) return;
        establecerSugerencias([]);
        establecerError(
          fallo?.name === 'TypeError'
            ? 'Sin conexión para buscar direcciones. Puedes escribirla igual.'
            : 'No pudimos buscar la dirección. Puedes escribirla igual.'
        );
      } finally {
        if (!controlador.signal.aborted) establecerBuscando(false);
      }
    }, 600);

    return () => {
      clearTimeout(t);
      controlador.abort();
    };
  }, [valor, ciudad]);

  function elegir(sugerencia) {
    textoElegido.current = sugerencia.direccion;
    alElegirSugerencia(sugerencia);
    establecerSugerencias([]);
    establecerAbierto(false);
  }

  const hayTexto = valor.trim().length >= 4;

  return (
    <div className="campo campo-direccion">
      <label className="etiqueta" htmlFor="direccion">
        Dirección <span className="obligatorio">*</span>
      </label>

      <input
        id="direccion"
        className="entrada"
        type="text"
        value={valor}
        onChange={(e) => {
          textoElegido.current = null;
          alCambiarTexto(e.target.value);
        }}
        onFocus={() => establecerAbierto(true)}
        placeholder="Ej.: Carrera 5 #12-34"
        maxLength={140}
        autoComplete="off"
        enterKeyHint="search"
        role="combobox"
        aria-expanded={abierto && sugerencias.length > 0}
        aria-autocomplete="list"
        aria-controls="sugerencias-direccion"
      />

      {!valor.trim() && (
        <p className="ayuda">
          Escribe la dirección exacta y elige una de las opciones que aparezcan.
        </p>
      )}

      {buscando && <p className="ayuda">Buscando direcciones…</p>}
      {error && <p className="ayuda ayuda-error">{error}</p>}

      {abierto && sugerencias.length > 0 && (
        <ul
          className="lista-sugerencias"
          id="sugerencias-direccion"
          role="listbox"
          aria-label="Direcciones encontradas"
        >
          {sugerencias.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="sugerencia"
                onClick={() => elegir(s)}
                role="option"
                aria-selected="false"
              >
                <span className="sugerencia-titulo">📍 {s.titulo}</span>
                <span className="sugerencia-detalle">{s.detalle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!buscando && !error && hayTexto && !ubicacionFijada && sugerencias.length === 0 && (
        <p className="ayuda">
          No encontramos esa dirección en el mapa. Tu texto se guarda igual:
          marca el punto con tu ubicación o tocando el mapa.
        </p>
      )}

      {ubicacionFijada && (
        <p className="ayuda ayuda-ok">✔ Punto fijado en el mapa</p>
      )}
    </div>
  );
}
