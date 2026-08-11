/**
 * Acceso a `localStorage` a prueba de fallos.
 *
 * En navegación privada de iOS, con cuota llena o con cookies bloqueadas,
 * `localStorage` lanza excepción. Aquí nunca debe tumbar la aplicación: si no
 * se puede guardar, se sigue funcionando (el usuario solo pierde el código de
 * edición y la caché entre sesiones).
 */

const PREFIJO = 'ayudaya.';

function almacen() {
  try {
    const a = window.localStorage;
    const prueba = `${PREFIJO}__prueba`;
    a.setItem(prueba, '1');
    a.removeItem(prueba);
    return a;
  } catch {
    return null;
  }
}

const ALMACEN = almacen();
export const hayAlmacenamiento = ALMACEN !== null;

export function leer(clave, porDefecto = null) {
  if (!ALMACEN) return porDefecto;
  try {
    const crudo = ALMACEN.getItem(PREFIJO + clave);
    return crudo === null ? porDefecto : JSON.parse(crudo);
  } catch {
    return porDefecto;
  }
}

export function escribir(clave, valor) {
  if (!ALMACEN) return false;
  try {
    ALMACEN.setItem(PREFIJO + clave, JSON.stringify(valor));
    return true;
  } catch {
    // Cuota llena: soltamos la caché de datos, que es lo único prescindible.
    try {
      ALMACEN.removeItem(`${PREFIJO}cache.reportes`);
      ALMACEN.setItem(PREFIJO + clave, JSON.stringify(valor));
      return true;
    } catch {
      return false;
    }
  }
}

export function borrar(clave) {
  if (!ALMACEN) return;
  try {
    ALMACEN.removeItem(PREFIJO + clave);
  } catch {
    /* nada que hacer */
  }
}

// ---------------------------------------------------------------------------
//  Códigos de edición
//
//  Son la única prueba de que este dispositivo creó un registro. No se envían
//  al servidor salvo al usarlos, y el servidor solo guarda su hash.
// ---------------------------------------------------------------------------

const CLAVE_CODIGOS = { reporte_mapa: 'codigos.reportes', persona: 'codigos.personas' };

export function guardarCodigo(recurso, id, codigo) {
  const clave = CLAVE_CODIGOS[recurso];
  if (!clave) return;
  const actuales = leer(clave, {}) || {};
  actuales[id] = codigo;
  escribir(clave, actuales);
}

export function obtenerCodigo(recurso, id) {
  const clave = CLAVE_CODIGOS[recurso];
  if (!clave) return null;
  const actuales = leer(clave, {}) || {};
  return actuales[id] || null;
}

export function olvidarCodigo(recurso, id) {
  const clave = CLAVE_CODIGOS[recurso];
  if (!clave) return;
  const actuales = leer(clave, {}) || {};
  delete actuales[id];
  escribir(clave, actuales);
}

/** ¿Este dispositivo creó ese registro? */
export function esMio(recurso, id) {
  return Boolean(obtenerCodigo(recurso, id));
}

// ---------------------------------------------------------------------------
//  Denuncias ya enviadas desde este dispositivo
//
//  El servidor también lo impide (una denuncia por IP y recurso), pero
//  recordarlo aquí evita el viaje de red y el mensaje de error.
// ---------------------------------------------------------------------------

export function marcarDenunciado(recurso, id) {
  const denunciados = leer('denunciados', {}) || {};
  denunciados[`${recurso}:${id}`] = 1;
  escribir('denunciados', denunciados);
}

export function yaDenunciado(recurso, id) {
  const denunciados = leer('denunciados', {}) || {};
  return Boolean(denunciados[`${recurso}:${id}`]);
}

/** Igual que las denuncias: el servidor también lo impide, pero evita el viaje. */
export function marcarConfirmado(id) {
  const confirmados = leer('confirmados', {}) || {};
  confirmados[id] = 1;
  escribir('confirmados', confirmados);
}

export function yaConfirmado(id) {
  const confirmados = leer('confirmados', {}) || {};
  return Boolean(confirmados[id]);
}

// ---------------------------------------------------------------------------
//  Caché de la última consulta
//
//  Sirve para que, al abrir la app sin señal, se vea el último estado conocido
//  en lugar de un mapa vacío. Siempre se muestra con su antigüedad a la vista.
// ---------------------------------------------------------------------------

export function guardarCache(nombre, datos) {
  escribir(`cache.${nombre}`, { en: Date.now(), datos });
}

export function leerCache(nombre, maxEdadMs = 12 * 60 * 60 * 1000) {
  const guardado = leer(`cache.${nombre}`);
  if (!guardado || !Array.isArray(guardado.datos)) return null;
  if (Date.now() - guardado.en > maxEdadMs) return null;
  return guardado;
}
