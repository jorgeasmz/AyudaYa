/**
 * Puente entre la cola de envíos (que vive fuera de React) y los componentes.
 */

import { useCallback, useEffect, useState } from 'react';
import { descartar, obtenerPendientes, procesar, suscribirse } from './cola.js';

export function useCola(tipo) {
  const [pendientes, establecerPendientes] = useState(() => obtenerPendientes(tipo));
  const [reintentando, establecerReintentando] = useState(false);

  useEffect(() => {
    // Al suscribirse se vuelve a leer: la cola pudo cambiar entre el primer
    // render y este efecto.
    establecerPendientes(obtenerPendientes(tipo));
    return suscribirse(() => establecerPendientes(obtenerPendientes(tipo)));
  }, [tipo]);

  const reintentar = useCallback(async () => {
    establecerReintentando(true);
    try {
      return await procesar({ forzar: true });
    } finally {
      establecerReintentando(false);
    }
  }, []);

  return { pendientes, reintentando, reintentar, descartar };
}
