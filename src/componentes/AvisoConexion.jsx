import { ESTADO } from '../lib/usarConexion.js';

/**
 * Franja de estado de red. Se muestra solo cuando algo va mal: en condiciones
 * normales no ocupa un píxel.
 */
export default function AvisoConexion({ estado, alReintentar, edadDatos }) {
  if (estado === ESTADO.EN_LINEA) return null;

  const sinConexion = estado === ESTADO.SIN_CONEXION;

  return (
    <div
      className={`aviso-conexion ${sinConexion ? 'es-grave' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="aviso-conexion-punto" aria-hidden="true" />
      <span className="aviso-conexion-texto">
        {sinConexion ? (
          <>
            <strong>Sin conexión.</strong> Reintentando solos…
            {edadDatos ? ` Mostrando datos de ${edadDatos}.` : ''}
          </>
        ) : (
          <>
            <strong>Conexión inestable.</strong> Los datos pueden tardar.
          </>
        )}
      </span>
      {alReintentar && (
        <button type="button" className="aviso-conexion-boton" onClick={alReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}
