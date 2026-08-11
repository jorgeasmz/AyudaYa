import { useEffect, useState } from 'react';
import { buscarReportesCercanos, confirmarReporte } from '../../lib/api.js';
import { marcarConfirmado, yaConfirmado } from '../../lib/almacenamiento.js';
import { tiempoRelativo } from '../../lib/formato.js';
import { RADIO_DUPLICADOS } from '../../lib/constantes.js';

/**
 * Avisa de reportes iguales cerca del punto elegido, antes de publicar.
 *
 * Es la pieza que evita que el mapa se llene de la misma olla comunitaria diez
 * veces. En lugar de bloquear al usuario, le ofrece el camino mejor: confirmar
 * el reporte que ya existe. Un duplicado se convierte así en una señal que
 * refuerza el original en vez de en ruido.
 *
 * No impide publicar: puede haber dos puntos de agua en la misma manzana.
 */
export default function AvisoRepetidos({ tipo, ubicacion, alConfirmarExistente }) {
  const [cercanos, establecerCercanos] = useState([]);
  const [confirmando, establecerConfirmando] = useState(null);

  useEffect(() => {
    if (!tipo || !ubicacion) {
      establecerCercanos([]);
      return undefined;
    }

    const controlador = new AbortController();

    buscarReportesCercanos({
      tipo,
      lat: ubicacion[0],
      lng: ubicacion[1],
      señal: controlador.signal,
    })
      .then((encontrados) => {
        if (controlador.signal.aborted) return;
        // No se filtran los ya confirmados por este dispositivo: saber que el
        // reporte existe es lo importante. Lo que cambia es el botón.
        establecerCercanos(encontrados);
      })
      .catch(() => {
        // Sin red no se avisa de repetidos, pero publicar sigue funcionando.
        if (!controlador.signal.aborted) establecerCercanos([]);
      });

    return () => controlador.abort();
  }, [tipo, ubicacion]);

  async function confirmar(reporte) {
    establecerConfirmando(reporte.id);
    try {
      await confirmarReporte(reporte.id);
      marcarConfirmado(reporte.id);
      alConfirmarExistente(reporte);
    } catch (fallo) {
      // El servidor lleva la cuenta por IP, no por dispositivo. Si esta IP ya
      // había confirmado (otro móvil en la misma red, o datos del navegador
      // borrados), no es un error: el reporte existe y es el que buscaba.
      if (/ya habías confirmado/i.test(fallo?.message || '')) {
        marcarConfirmado(reporte.id);
        alConfirmarExistente(reporte);
        return;
      }
      // Cualquier otro fallo: el aviso sigue ahí y siempre puede publicar el suyo.
      establecerConfirmando(null);
    }
  }

  if (!cercanos.length) return null;

  return (
    <div className="aviso-repetidos" role="status">
      <p className="aviso-repetidos-titulo">
        Ya hay {cercanos.length === 1 ? 'un reporte parecido' : 'reportes parecidos'} a
        menos de {RADIO_DUPLICADOS} m
      </p>
      <p className="aviso-repetidos-intro">
        Si es el mismo, confírmalo en vez de publicarlo otra vez: ayuda más y no
        duplica el mapa.
      </p>

      <ul className="lista-repetidos">
        {cercanos.map((r) => (
          <li key={r.id}>
            <div className="repetido-datos">
              <strong>{r.titulo}</strong>
              <span>
                {tiempoRelativo(r.actualizado_en || r.created_at)}
                {r.confirmaciones > 0 &&
                  ` · ${r.confirmaciones} ${
                    r.confirmaciones === 1 ? 'confirmación' : 'confirmaciones'
                  }`}
              </span>
            </div>
            {yaConfirmado(r.id) ? (
              <button
                type="button"
                className="boton boton-secundario"
                onClick={() => alConfirmarExistente(r)}
              >
                Es este
              </button>
            ) : (
              <button
                type="button"
                className="boton boton-exito"
                onClick={() => confirmar(r)}
                disabled={confirmando === r.id}
              >
                {confirmando === r.id ? 'Confirmando…' : 'Es este'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
