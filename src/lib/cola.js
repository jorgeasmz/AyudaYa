/**
 * Cola de envíos pendientes.
 *
 * Sin esto, quien rellena un reporte justo cuando se cae la red pierde el
 * trabajo y, con él, la información. Con esto, el envío se guarda en el
 * dispositivo y sale solo en cuanto vuelve la señal.
 *
 * Es un almacén a nivel de módulo, no un contexto de React, por dos razones:
 * la cola tiene que seguir vaciándose aunque quien la llenó haya cambiado de
 * pestaña, y así ningún componente necesita estar montado para que funcione.
 *
 * Seguridad frente a duplicados: cada elemento lleva el `id` y el `codigo` que
 * generó el navegador, y las funciones RPC son idempotentes. Reintentar un
 * envío que sí llegó no crea una segunda fila.
 */

import { leer, escribir } from './almacenamiento.js';
import { crearReporte, crearRegistroPersona } from './api.js';
import { interpretarError } from './supabase.js';

const CLAVE = 'cola.envios';

/** Tras estos intentos fallidos damos por perdido el envío. */
const MAX_INTENTOS = 25;

/** Espera entre barridos automáticos mientras quede algo pendiente. */
const INTERVALO_MS = 30000;

/** Si el servidor responde "límite de envíos", esperamos más antes de insistir. */
const ESPERA_TRAS_LIMITE_MS = 3 * 60 * 1000;

let pendientes = cargar();
let procesando = false;
let proximoIntento = 0;
let temporizador = null;
let iniciado = false;

const suscriptores = new Set();

function cargar() {
  const guardado = leer(CLAVE, []);
  return Array.isArray(guardado) ? guardado.filter((e) => e && e.id && e.tipo) : [];
}

function persistir() {
  escribir(CLAVE, pendientes);
  suscriptores.forEach((fn) => {
    try {
      fn(pendientes);
    } catch {
      /* un suscriptor roto no debe frenar a los demás */
    }
  });
}

// ---------------------------------------------------------------------------
//  API pública
// ---------------------------------------------------------------------------

export function obtenerPendientes(tipo) {
  return tipo ? pendientes.filter((e) => e.tipo === tipo) : pendientes;
}

export function suscribirse(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

/**
 * Guarda un envío para más tarde.
 * `datos` es exactamente el objeto que espera la función de `api.js`,
 * incluidos `id` y `codigo`.
 */
export function encolar(tipo, datos) {
  pendientes = [
    ...pendientes,
    {
      id: datos.id,
      tipo,
      datos,
      encoladoEn: new Date().toISOString(),
      intentos: 0,
      ultimoError: null,
    },
  ];
  persistir();
  programar(1000);
  return datos.id;
}

export function descartar(id) {
  pendientes = pendientes.filter((e) => e.id !== id);
  persistir();
}

export function estaEnCola(id) {
  return pendientes.some((e) => e.id === id);
}

// ---------------------------------------------------------------------------
//  Procesado
// ---------------------------------------------------------------------------

const ENVIADORES = {
  reporte_mapa: crearReporte,
  persona: crearRegistroPersona,
};

/**
 * Intenta vaciar la cola. Los elementos salen de uno en uno y en orden: enviar
 * en paralelo agotaría el límite por IP y desordenaría los reportes.
 *
 * Devuelve un resumen para que la interfaz pueda avisar de lo ocurrido.
 */
export async function procesar({ forzar = false } = {}) {
  if (procesando || !pendientes.length)
    return { enviados: 0, restantes: pendientes.length };
  if (!forzar && Date.now() < proximoIntento) {
    return { enviados: 0, restantes: pendientes.length, esperando: true };
  }
  if (navigator.onLine === false && !forzar) {
    return { enviados: 0, restantes: pendientes.length, sinConexion: true };
  }

  procesando = true;
  let enviados = 0;
  let descartadosPorError = 0;
  let corteDeRed = false;

  try {
    // Copia: `pendientes` se reasigna dentro del bucle.
    for (const elemento of [...pendientes]) {
      const enviar = ENVIADORES[elemento.tipo];
      if (!enviar) {
        pendientes = pendientes.filter((e) => e.id !== elemento.id);
        continue;
      }

      try {
        await enviar(elemento.datos);
        pendientes = pendientes.filter((e) => e.id !== elemento.id);
        enviados += 1;
      } catch (bruto) {
        const error = interpretarError(bruto);

        if (error.motivo === 'red') {
          // Sigue sin haber red: no tiene sentido seguir con el resto.
          corteDeRed = true;
          anotarIntento(elemento.id, error.message);
          break;
        }

        if (error.motivo === 'limite') {
          // La cuota por IP está agotada. Se conserva y se espera de verdad.
          anotarIntento(elemento.id, error.message);
          proximoIntento = Date.now() + ESPERA_TRAS_LIMITE_MS;
          break;
        }

        // Validación o permiso: reintentarlo daría siempre el mismo error,
        // así que se descarta en vez de dejarlo atascado para siempre.
        pendientes = pendientes.filter((e) => e.id !== elemento.id);
        descartadosPorError += 1;
      }
    }
  } finally {
    procesando = false;
    persistir();
    if (pendientes.length) programar(corteDeRed ? INTERVALO_MS : 5000);
  }

  return {
    enviados,
    descartadosPorError,
    restantes: pendientes.length,
    corteDeRed,
  };
}

function anotarIntento(id, mensaje) {
  pendientes = pendientes
    .map((e) =>
      e.id === id ? { ...e, intentos: e.intentos + 1, ultimoError: mensaje } : e
    )
    .filter((e) => e.intentos < MAX_INTENTOS);
}

function programar(retrasoMs) {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => procesar(), retrasoMs);
}

/**
 * Engancha los disparadores automáticos. Se llama una vez, al arrancar la app.
 *
 * `visibilitychange` importa tanto como `online`: en Android es muy habitual
 * volver a la app con la red ya recuperada sin que se haya disparado ningún
 * evento `online`.
 */
export function iniciarProcesadoAutomatico() {
  if (iniciado) return;
  iniciado = true;

  const intentar = () => {
    proximoIntento = 0;
    procesar();
  };

  window.addEventListener('online', intentar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') procesar();
  });

  if (pendientes.length) programar(2000);
}
