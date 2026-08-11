import { Component } from 'react';
import { TELEFONOS_OFICIALES } from '../lib/constantes.js';

/**
 * Red de seguridad: si un componente lanza una excepción, en vez de dejar la
 * pantalla en blanco mostramos algo útil, incluidos los teléfonos oficiales.
 * En una emergencia, una pantalla en blanco es un fallo grave.
 */
export default class LimiteDeError extends Component {
  constructor(props) {
    super(props);
    this.state = { fallo: null };
  }

  static getDerivedStateFromError(error) {
    return { fallo: error };
  }

  componentDidCatch(error) {
    // Sin servicio de telemetría: la consola basta para depurar en campo.
    console.error('[AyudaYa] fallo no controlado:', error);
  }

  render() {
    if (!this.state.fallo) return this.props.children;

    return (
      <div className="pantalla-fallo">
        <h1>Algo se rompió</h1>
        <p>
          La aplicación tuvo un problema inesperado. Recarga la página; si el problema
          sigue, usa directamente los canales oficiales.
        </p>
        <button
          type="button"
          className="boton boton-primario"
          onClick={() => window.location.reload()}
        >
          Recargar la página
        </button>

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

        <details className="detalle-tecnico">
          <summary>Detalle técnico</summary>
          <pre>{String(this.state.fallo?.message || this.state.fallo)}</pre>
        </details>
      </div>
    );
  }
}
