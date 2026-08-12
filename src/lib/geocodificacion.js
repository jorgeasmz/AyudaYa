/**
 * Búsqueda de direcciones contra Nominatim (el geocodificador de OpenStreetMap).
 *
 * Es gratis y sin clave, pero su política de uso es estricta: como máximo una
 * petición por segundo y hay que identificar la aplicación. Por eso:
 *
 *   - Se espera a que la persona deje de escribir (rebote en quien llama).
 *   - Se serializan las peticiones con un intervalo mínimo (`INTERVALO_MINIMO`).
 *   - Las cabeceras de despliegue envían el origen como Referer.
 *
 * Aviso importante: lo que se teclea en el campo de dirección viaja a
 * openstreetmap.org. Es un tercero. Con tráfico alto conviene cambiar a un
 * proveedor con capa gratuita y contrato (Photon, MapTiler, LocationIQ):
 * basta con reescribir `buscarDirecciones`.
 */

/**
 * Configurable con `VITE_URL_GEOCODIFICACION`. Sirve para dos cosas: cambiar de
 * proveedor sin tocar código, y apuntar a un servidor de pruebas en lugar de
 * castigar al servicio público de OpenStreetMap.
 */
const URL_BUSQUEDA =
  import.meta.env.VITE_URL_GEOCODIFICACION ||
  'https://nominatim.openstreetmap.org/search';

/** Nominatim admite 1 petición por segundo. Nos quedamos algo por debajo. */
const INTERVALO_MINIMO = 1100;

let ultimaPeticion = 0;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Prioriza lo que de verdad ayuda a llegar a un sitio.
 * Una dirección con número de casa va antes que un barrio entero.
 */
function precision(resultado) {
  const direccion = resultado.address || {};
  if (direccion.house_number) return 0;
  if (direccion.road) return 1;
  if (resultado.class === 'amenity' || resultado.class === 'building') return 2;
  return 3;
}

/** Texto corto para la primera línea de la sugerencia. */
function titulo(resultado) {
  const d = resultado.address || {};
  if (d.house_number && d.road) return `${d.road} ${d.house_number}`;
  return resultado.name || d.road || resultado.display_name.split(',')[0];
}

/** El resto de la dirección, sin repetir el título. */
function detalle(resultado) {
  const completo = resultado.display_name || '';
  const cabeza = titulo(resultado);
  const resto = completo.startsWith(cabeza)
    ? completo.slice(cabeza.length).replace(/^[,\s]+/, '')
    : completo;
  return resto || completo;
}

/**
 * Radio de la caja de búsqueda alrededor del municipio elegido, en grados.
 * 0,4 son unos 44 km: cubre de sobra el casco urbano y su entorno rural sin
 * llegar al departamento vecino.
 */
const RADIO_CAJA = 0.4;

/**
 * Busca direcciones y lugares.
 *
 * @param {string} texto      lo que se está escribiendo
 * @param {object} opciones   { ciudad, centro, señal }
 * @returns {Promise<Array>}  sugerencias listas para pintar
 */
export async function buscarDirecciones(texto, { ciudad, centro, señal } = {}) {
  const termino = String(texto || '').trim();
  if (termino.length < 4) return [];

  // Respeta el intervalo mínimo entre llamadas al servicio.
  const desde = Date.now() - ultimaPeticion;
  if (desde < INTERVALO_MINIMO) await esperar(INTERVALO_MINIMO - desde);
  if (señal?.aborted) return [];
  ultimaPeticion = Date.now();

  const url = new URL(URL_BUSQUEDA);
  // Añadir la ciudad acota muchísimo: "Carrera 5 #12-34" existe en medio país.
  url.searchParams.set('q', ciudad ? `${termino}, ${ciudad}` : termino);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('countrycodes', 'co');
  url.searchParams.set('accept-language', 'es');
  url.searchParams.set('dedupe', '1');

  // Acotar a una caja alrededor del municipio no es un lujo: hay nombres
  // repetidos en varios departamentos. "La Unión" sin acotar resuelve a Sucre,
  // a 700 km, y el reporte acabaría al otro lado del país.
  if (centro) {
    const [lat, lng] = centro;
    url.searchParams.set(
      'viewbox',
      [lng - RADIO_CAJA, lat + RADIO_CAJA, lng + RADIO_CAJA, lat - RADIO_CAJA].join(',')
    );
    url.searchParams.set('bounded', '1');
  }

  const respuesta = await fetch(url, { signal: señal });
  if (!respuesta.ok) throw new Error('No pudimos buscar la dirección ahora mismo.');

  const datos = await respuesta.json();

  return datos
    .map((r) => ({
      id: r.place_id,
      titulo: titulo(r),
      detalle: detalle(r),
      // Lo que se guarda en el reporte: la dirección completa tal cual.
      direccion: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      precision: precision(r),
    }))
    .sort((a, b) => a.precision - b.precision);
}
