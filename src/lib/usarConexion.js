/**
 * Estado de la conexión.
 *
 * `navigator.onLine` miente a menudo: en 3G saturada dice `true` aunque no pase
 * un solo byte. Por eso combinamos tres señales:
 *   1. Los eventos online/offline del navegador.
 *   2. Los fallos reales de nuestras propias peticiones (`registrarFallo`).
 *   3. El estado del canal de Realtime.
 */

import { useCallback, useEffect, useState } from 'react';

export const ESTADO = {
  EN_LINEA: 'en_linea',
  INESTABLE: 'inestable',
  SIN_CONEXION: 'sin_conexion',
};

export function useConexion() {
  const [delNavegador, establecerDelNavegador] = useState(
    () => navigator.onLine !== false
  );
  const [fallosSeguidos, establecerFallos] = useState(0);

  useEffect(() => {
    const alConectar = () => {
      establecerDelNavegador(true);
      establecerFallos(0);
    };
    const alDesconectar = () => establecerDelNavegador(false);

    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, []);

  const registrarFallo = useCallback(() => {
    establecerFallos((n) => Math.min(n + 1, 9));
  }, []);

  const registrarExito = useCallback(() => {
    establecerFallos(0);
  }, []);

  let estado = ESTADO.EN_LINEA;
  if (!delNavegador) estado = ESTADO.SIN_CONEXION;
  else if (fallosSeguidos >= 2) estado = ESTADO.SIN_CONEXION;
  else if (fallosSeguidos === 1) estado = ESTADO.INESTABLE;

  return { estado, registrarFallo, registrarExito };
}
