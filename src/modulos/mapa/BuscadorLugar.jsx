import { useEffect, useState } from 'react';

const URL_BUSQUEDA = 'https://nominatim.openstreetmap.org/search';

function resumirLugar(resultado) {
  return resultado.name || resultado.display_name.split(',')[0] || 'Lugar público';
}

function formatearCategoria(resultado) {
  const partes = [resultado.class, resultado.type].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Lugar público';
}

function esLugarUtil(resultado) {
  const tipo = `${resultado.class || ''} ${resultado.type || ''}`.toLowerCase();
  if (!tipo.trim()) return true;

  const descartes = ['house', 'residential', 'road', 'path', 'track', 'footway', 'steps', 'service'];
  return !descartes.some((fragmento) => tipo.includes(fragmento));
}

export default function BuscadorLugar({ alElegirLugar, referenciaElegida }) {
  const [consulta, establecerConsulta] = useState('');
  const [resultados, establecerResultados] = useState([]);
  const [cargando, establecerCargando] = useState(false);
  const [error, establecerError] = useState(null);
  const [seleccionado, establecerSeleccionado] = useState(null);

  useEffect(() => {
    const termino = consulta.trim();
    if (termino.length < 3) {
      establecerResultados([]);
      establecerCargando(false);
      establecerError(null);
      return undefined;
    }

    const controlador = new AbortController();
    establecerCargando(true);
    establecerError(null);

    const t = setTimeout(async () => {
      try {
        const url = new URL(URL_BUSQUEDA);
        url.searchParams.set('q', termino);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('namedetails', '1');
        url.searchParams.set('extratags', '1');
        url.searchParams.set('limit', '6');
        url.searchParams.set('countrycodes', 'co');
        url.searchParams.set('accept-language', 'es');
        url.searchParams.set('dedupe', '1');

        const respuesta = await fetch(url, { signal: controlador.signal });
        if (!respuesta.ok) throw new Error('No pudimos buscar lugares ahora mismo.');

        const datos = await respuesta.json();
        if (controlador.signal.aborted) return;

        establecerResultados(
          datos
            .filter(esLugarUtil)
            .map((resultado) => ({
              id: resultado.place_id,
              nombre: resumirLugar(resultado),
              detalle: resultado.display_name,
              categoria: formatearCategoria(resultado),
              lat: Number(resultado.lat),
              lng: Number(resultado.lon),
            }))
        );
      } catch (bruto) {
        if (controlador.signal.aborted) return;
        establecerResultados([]);
        establecerError(
          bruto instanceof Error ? bruto.message : 'No pudimos buscar lugares ahora mismo.'
        );
      } finally {
        if (!controlador.signal.aborted) establecerCargando(false);
      }
    }, 320);

    return () => {
      clearTimeout(t);
      controlador.abort();
    };
  }, [consulta]);

  function alSeleccionar(resultado) {
    establecerSeleccionado(resultado);
    alElegirLugar(resultado);
  }

  return (
    <div className="buscador-lugar">
      <div className="buscador-lugar-texto">
        <p className="buscador-lugar-titulo">Buscar un lugar público</p>
        <p className="buscador-lugar-intro">
          Prueba con hospitales, colegios, parques, iglesias o estaciones conocidas.
          No se guarda la dirección exacta; sólo el punto elegido.
        </p>
      </div>

      <label className="etiqueta buscador-lugar-label" htmlFor="busqueda-lugar">
        Lugar o referencia pública
      </label>
      <input
        id="busqueda-lugar"
        className="entrada"
        type="search"
        value={consulta}
        onChange={(e) => establecerConsulta(e.target.value)}
        placeholder="Ej.: Hospital Universitario del Valle"
        autoComplete="off"
        enterKeyHint="search"
      />

      {referenciaElegida && (
        <p className="buscador-lugar-elegido">
          Referencia elegida: <strong>{referenciaElegida}</strong>
        </p>
      )}

      {cargando && <p className="buscador-lugar-estado">Buscando lugares…</p>}
      {error && <p className="buscador-lugar-estado ayuda-error">{error}</p>}

      {!cargando && consulta.trim().length >= 3 && !error && resultados.length === 0 && (
        <p className="buscador-lugar-estado">
          No encontramos coincidencias claras. Prueba con otro nombre público.
        </p>
      )}

      {resultados.length > 0 && (
        <div className="lista-lugares" role="listbox" aria-label="Sugerencias de lugares">
          {resultados.map((resultado) => (
            <button
              key={resultado.id}
              type="button"
              className={`lugar-sugerencia ${
                seleccionado?.id === resultado.id ? 'es-activo' : ''
              }`}
              onClick={() => alSeleccionar(resultado)}
            >
              <span className="lugar-sugerencia-nombre">{resultado.nombre}</span>
              <span className="lugar-sugerencia-meta">{resultado.categoria}</span>
              <span className="lugar-sugerencia-detalle">{resultado.detalle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}