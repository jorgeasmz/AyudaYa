/** Bloque de mensaje: error, aviso o confirmación. */
export default function Mensaje({ tipo = 'error', children, alCerrar }) {
  return (
    <div
      className={`mensaje es-${tipo}`}
      role={tipo === 'error' ? 'alert' : 'status'}
      aria-live={tipo === 'error' ? 'assertive' : 'polite'}
    >
      <span className="mensaje-icono" aria-hidden="true">
        {tipo === 'error' ? '⚠️' : tipo === 'exito' ? '✅' : 'ℹ️'}
      </span>
      <div className="mensaje-texto">{children}</div>
      {alCerrar && (
        <button
          type="button"
          className="mensaje-cerrar"
          onClick={alCerrar}
          aria-label="Cerrar mensaje"
        >
          ✕
        </button>
      )}
    </div>
  );
}
