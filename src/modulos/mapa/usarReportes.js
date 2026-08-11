/**
 * Estado de los reportes del mapa: carga inicial, Realtime, caché y reintentos.
 *
 * Decisión de diseño: la lista completa vive en memoria y los filtros se
 * aplican en el navegador. A la escala de esta herramienta (cientos de
 * reportes, no cientos de miles) sale mucho más barato que ir al servidor cada
 * vez que alguien marca o desmarca una casilla: y en 3G eso importa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listarReportes, suscribirseAReportes } from '../../lib/api.js';
import { guardarCache, leerCache } from '../../lib/almacenamiento.js';
import { interpretarError } from '../../lib/supabase.js';
import { tiempoRelativo } from '../../lib/formato.js';
import { useCola } from '../../lib/usarCola.js';

/**
 * Un envío en cola se pinta como un reporte más, pero marcado como pendiente.
 * Quien lo escribió tiene que verlo en el mapa: si no, parece que se perdió.
 */
function comoReporte(elemento) {
  const d = elemento.datos;
  return {
    id: d.id,
    tipo: d.tipo,
    titulo: d.titulo,
    descripcion: d.descripcion,
    lat: d.lat,
    lng: d.lng,
    ciudad: d.ciudad,
    contacto: d.contacto,
    estado: 'activo',
    verificado: false,
    fuente_verificacion: null,
    reportes_abuso: 0,
    created_at: elemento.encoladoEn,
    actualizado_en: elemento.encoladoEn,
    _pendiente: true,
    _intentos: elemento.intentos,
  };
}

export function useReportes({ registrarFallo, registrarExito }) {
  const [reportes, establecerReportes] = useState([]);
  const [cargando, establecerCargando] = useState(true);
  const [error, establecerError] = useState(null);
  const [enVivo, establecerEnVivo] = useState(false);
  const [origenCache, establecerOrigenCache] = useState(null);

  const montado = useRef(true);
  const reintentoRef = useRef(null);

  // --- Carga inicial / recarga manual --------------------------------------
  const cargar = useCallback(
    async ({ silenciosa = false } = {}) => {
      if (!silenciosa) establecerCargando(true);
      try {
        const datos = await listarReportes();
        if (!montado.current) return;

        establecerReportes(datos);
        establecerError(null);
        establecerOrigenCache(null);
        guardarCache('reportes', datos);
        registrarExito?.();
      } catch (bruto) {
        if (!montado.current) return;
        const err = interpretarError(bruto);
        establecerError(err);
        if (err.motivo === 'red') registrarFallo?.();

        // Sin red: mejor el último estado conocido, siempre con su antigüedad
        // a la vista, que un mapa vacío que parezca "aquí no pasa nada".
        establecerReportes((previos) => {
          if (previos.length) return previos;
          const cache = leerCache('reportes');
          if (cache) {
            establecerOrigenCache(tiempoRelativo(new Date(cache.en).toISOString()));
            return cache.datos;
          }
          return previos;
        });
      } finally {
        if (montado.current) establecerCargando(false);
      }
    },
    [registrarFallo, registrarExito]
  );

  useEffect(() => {
    montado.current = true;
    cargar();
    return () => {
      montado.current = false;
    };
  }, [cargar]);

  // --- Realtime ------------------------------------------------------------
  useEffect(() => {
    let cancelar = null;
    let vigente = true;

    suscribirseAReportes(
      ({ evento, nuevo, viejo }) => {
        if (!montado.current) return;

        establecerReportes((previos) => {
          if (evento === 'DELETE') {
            const id = viejo?.id;
            return id ? previos.filter((r) => r.id !== id) : previos;
          }
          if (!nuevo?.id) return previos;

          const indice = previos.findIndex((r) => r.id === nuevo.id);

          // La RLS oculta lo que pasa de 5 denuncias, pero un UPDATE que cruza
          // ese umbral igual nos llega: lo retiramos a mano.
          if ((nuevo.reportes_abuso ?? 0) > 5) {
            return indice === -1 ? previos : previos.filter((r) => r.id !== nuevo.id);
          }

          if (indice === -1) return [nuevo, ...previos];
          const copia = previos.slice();
          copia[indice] = { ...copia[indice], ...nuevo };
          return copia;
        });
      },
      (estadoCanal) => {
        if (!montado.current) return;
        establecerEnVivo(estadoCanal === 'SUBSCRIBED');
      }
    )
      .then((baja) => {
        if (!vigente) baja();
        else cancelar = baja;
      })
      .catch(() => {
        // Sin Realtime la app sigue: solo hay que recargar a mano.
        if (montado.current) establecerEnVivo(false);
      });

    return () => {
      vigente = false;
      cancelar?.();
    };
  }, []);

  // --- Reintento automático mientras haya error de red ---------------------
  useEffect(() => {
    if (!error || error.motivo !== 'red') return undefined;

    reintentoRef.current = setTimeout(() => cargar({ silenciosa: true }), 15000);
    return () => clearTimeout(reintentoRef.current);
  }, [error, cargar]);

  // --- Volver a la app tras dejarla en segundo plano -----------------------
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar({ silenciosa: true });
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  /** Inserta un reporte recién creado sin esperar a que llegue por Realtime. */
  const agregarLocal = useCallback((reporte) => {
    establecerReportes((previos) =>
      previos.some((r) => r.id === reporte.id) ? previos : [reporte, ...previos]
    );
  }, []);

  /** Aplica un cambio local (marcar resuelto, denunciar) al instante. */
  const actualizarLocal = useCallback((id, cambios) => {
    establecerReportes((previos) =>
      previos.map((r) => (r.id === id ? { ...r, ...cambios } : r))
    );
  }, []);

  // --- Envíos aún sin salir del dispositivo --------------------------------
  const cola = useCola('reporte_mapa');
  const { pendientes } = cola;

  // Cuando la cola se vacía, los reportes que salieron ya están en el servidor:
  // conviene refrescar por si Realtime no está activo.
  const cuantosPendientes = pendientes.length;
  const previosPendientes = useRef(cuantosPendientes);
  useEffect(() => {
    if (previosPendientes.current > 0 && cuantosPendientes === 0) {
      cargar({ silenciosa: true });
    }
    previosPendientes.current = cuantosPendientes;
  }, [cuantosPendientes, cargar]);

  const conPendientes = useMemo(() => {
    if (!pendientes.length) return reportes;

    // Si el reporte ya llegó al servidor, la fila real manda sobre la pendiente.
    const yaPublicados = new Set(reportes.map((r) => r.id));
    const soloEnCola = pendientes
      .filter((e) => !yaPublicados.has(e.datos.id))
      .map(comoReporte);

    return [...soloEnCola, ...reportes];
  }, [reportes, pendientes]);

  return {
    reportes: conPendientes,
    cargando,
    error,
    enVivo,
    origenCache,
    recargar: cargar,
    agregarLocal,
    actualizarLocal,
    cola,
  };
}
