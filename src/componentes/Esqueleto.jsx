/** Marcadores de carga. Dan sensación de avance sin animaciones costosas. */

export function EsqueletoLista({ filas = 3 }) {
  return (
    <div className="esqueleto-lista" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <div className="esqueleto-tarjeta" key={i}>
          <div className="esqueleto-barra" style={{ width: '55%' }} />
          <div className="esqueleto-barra" style={{ width: '85%' }} />
          <div className="esqueleto-barra" style={{ width: '35%' }} />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoMapa({ mensaje = 'Cargando el mapa…' }) {
  return (
    <div className="esqueleto-mapa" role="status">
      <div className="esqueleto-mapa-texto">
        <span className="giro" aria-hidden="true" />
        <p>{mensaje}</p>
      </div>
    </div>
  );
}
