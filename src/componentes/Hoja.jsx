import { useEffect, useRef } from 'react';

/**
 * Panel deslizante desde abajo ("bottom sheet").
 *
 * En móvil funciona mejor que un diálogo centrado: aparece donde está el pulgar
 * y deja ver el mapa detrás. Se cierra con Escape, con el botón o tocando fuera.
 */
export default function Hoja({ abierta, titulo, alCerrar, children, alto = 'auto' }) {
  const refPanel = useRef(null);
  const refDevolverFoco = useRef(null);

  useEffect(() => {
    if (!abierta) return undefined;

    refDevolverFoco.current = document.activeElement;

    const alTeclado = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        alCerrar();
      }
    };
    document.addEventListener('keydown', alTeclado);

    // Bloquea el desplazamiento del fondo mientras la hoja está abierta.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // El foco entra al panel para que un lector de pantalla lo anuncie.
    const t = setTimeout(() => refPanel.current?.focus(), 0);

    return () => {
      document.removeEventListener('keydown', alTeclado);
      document.body.style.overflow = overflowPrevio;
      clearTimeout(t);
      if (refDevolverFoco.current instanceof HTMLElement) {
        refDevolverFoco.current.focus();
      }
    };
  }, [abierta, alCerrar]);

  if (!abierta) return null;

  return (
    <div
      className="hoja-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div
        className="hoja"
        style={alto === 'alta' ? { maxHeight: '92dvh', height: '92dvh' } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={refPanel}
      >
        <div className="hoja-cabecera">
          <span className="hoja-agarre" aria-hidden="true" />
          <h2 className="hoja-titulo">{titulo}</h2>
          <button
            type="button"
            className="hoja-cerrar"
            onClick={alCerrar}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="hoja-cuerpo">{children}</div>
      </div>
    </div>
  );
}
