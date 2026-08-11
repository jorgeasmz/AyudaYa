import { useState } from 'react';
import { TELEFONOS_OFICIALES } from '../lib/constantes.js';

/**
 * Banner fijo. Es lo primero que se ve y no se puede cerrar del todo:
 * solo se contrae, y el número 123 queda siempre visible.
 */
export default function BannerOficial() {
  const [expandido, establecerExpandido] = useState(false);

  return (
    <div className="banner" role="region" aria-label="Aviso importante">
      <button
        type="button"
        className="banner-principal"
        onClick={() => establecerExpandido((v) => !v)}
        aria-expanded={expandido}
      >
        <span className="banner-texto">
          <strong>Herramienta comunitaria, no oficial.</strong> En emergencia real llama
          al{' '}
          <a href="tel:123" onClick={(e) => e.stopPropagation()}>
            123
          </a>
          .
        </span>
        <span className="banner-flecha" aria-hidden="true">
          {expandido ? '▲' : '▼'}
        </span>
      </button>

      {expandido && (
        <div className="banner-detalle">
          <p>
            Esta página la alimentan personas voluntarias. La información puede estar
            incompleta o desactualizada.{' '}
            <strong>Reporta también a los canales oficiales:</strong> Cruz Roja
            Colombiana, UNGRD y la alcaldía de tu ciudad.
          </p>
          <ul className="banner-telefonos">
            {TELEFONOS_OFICIALES.map((t) => (
              <li key={t.numero}>
                <a href={`tel:${t.numero}`}>
                  <span>{t.nombre}</span>
                  <strong>{t.numero}</strong>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
