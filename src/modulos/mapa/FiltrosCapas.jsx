import { TIPOS_REPORTE } from '../../lib/constantes.js';

/**
 * Filtros por capa. Fila con desplazamiento horizontal: cabe en cualquier
 * pantalla sin robarle altura al mapa.
 */
export default function FiltrosCapas({
  activos,
  alAlternar,
  alAlternarTodos,
  conteos,
  soloVerificados,
  alCambiarSoloVerificados,
  mostrarCaducados,
  alCambiarMostrarCaducados,
}) {
  const todosActivos = activos.size === TIPOS_REPORTE.length;

  return (
    <div className="filtros">
      <div className="filtros-fila" role="group" aria-label="Filtrar por tipo">
        <button
          type="button"
          className={`chip chip-todos ${todosActivos ? 'es-activo' : ''}`}
          onClick={() => alAlternarTodos(!todosActivos)}
          aria-pressed={todosActivos}
        >
          {todosActivos ? 'Ninguno' : 'Todos'}
        </button>

        {TIPOS_REPORTE.map((tipo) => {
          const activo = activos.has(tipo.valor);
          const n = conteos[tipo.valor] || 0;
          return (
            <button
              key={tipo.valor}
              type="button"
              className={`chip ${activo ? 'es-activo' : ''}`}
              style={activo ? { '--color-chip': tipo.color } : undefined}
              onClick={() => alAlternar(tipo.valor)}
              aria-pressed={activo}
              title={tipo.ayuda}
            >
              <span aria-hidden="true">{tipo.emoji}</span>
              <span className="chip-etiqueta">{tipo.etiqueta}</span>
              <span className="chip-conteo">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="filtros-opciones">
        <label className="casilla">
          <input
            type="checkbox"
            checked={soloVerificados}
            onChange={(e) => alCambiarSoloVerificados(e.target.checked)}
          />
          <span>Solo verificados</span>
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={mostrarCaducados}
            onChange={(e) => alCambiarMostrarCaducados(e.target.checked)}
          />
          <span>Mostrar caducados (+48 h)</span>
        </label>
      </div>
    </div>
  );
}
