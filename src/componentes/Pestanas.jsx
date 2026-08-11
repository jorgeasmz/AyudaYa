import { RUTAS } from '../lib/enrutador.js';

/**
 * Navegación inferior: en un celular el pulgar llega ahí sin recolocar la mano.
 */
export default function Pestanas({ ruta, alNavegar }) {
  const opciones = [
    { destino: RUTAS.MAPA, emoji: '🗺️', etiqueta: 'Mapa' },
    { destino: RUTAS.PERSONAS, emoji: '🔎', etiqueta: 'Personas' },
  ];

  return (
    <nav className="pestanas" aria-label="Secciones">
      {opciones.map((o) => {
        const activa = ruta === o.destino;
        return (
          <button
            key={o.destino}
            type="button"
            className={`pestana ${activa ? 'es-activa' : ''}`}
            onClick={() => alNavegar(o.destino)}
            aria-current={activa ? 'page' : undefined}
          >
            <span className="pestana-emoji" aria-hidden="true">
              {o.emoji}
            </span>
            <span>{o.etiqueta}</span>
          </button>
        );
      })}
    </nav>
  );
}
