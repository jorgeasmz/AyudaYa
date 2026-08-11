/** Utilidades de texto, fechas y enlaces. Sin dependencias. */

import { HORAS_CADUCIDAD } from './constantes.js';

// Rangos escritos con escapes Unicode a propósito: los caracteres literales
// (marcas combinantes, caracteres de control) son invisibles en el editor y se
// corrompen con facilidad al copiar y pegar.
const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;
const CARACTERES_CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Quita tildes y pasa a minúscula.
 * Debe dar el MISMO resultado que `public.normalizar_texto()` en el esquema SQL:
 * si los dos divergen, la búsqueda por nombre deja de encontrar coincidencias.
 */
export function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .toLowerCase();
}

/**
 * Prepara un término de búsqueda para el filtro `ilike` de PostgREST.
 * Los caracteres `,` `.` `(` `)` `*` y `%` tienen significado propio en la
 * sintaxis de PostgREST; si llegaran sin filtrar romperían la consulta.
 */
export function prepararBusqueda(texto) {
  return normalizar(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Recorta espacios y limita longitud, igual que hace el servidor. */
export function recortar(texto, max) {
  return String(texto ?? '')
    .replace(CARACTERES_CONTROL, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, max);
}

const UN_MINUTO = 60 * 1000;
const UNA_HORA = 60 * UN_MINUTO;
const UN_DIA = 24 * UNA_HORA;

/** "hace 5 min", "hace 3 horas", "hace 2 días". */
export function tiempoRelativo(fechaIso, ahora = Date.now()) {
  const t = new Date(fechaIso).getTime();
  if (!Number.isFinite(t)) return '';

  const delta = Math.max(0, ahora - t);

  if (delta < UN_MINUTO) return 'hace un momento';
  if (delta < UNA_HORA) {
    return `hace ${Math.floor(delta / UN_MINUTO)} min`;
  }
  if (delta < UN_DIA) {
    const h = Math.floor(delta / UNA_HORA);
    return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const d = Math.floor(delta / UN_DIA);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

/** Fecha completa para el panel de moderación. */
export function fechaCompleta(fechaIso) {
  const f = new Date(fechaIso);
  if (Number.isNaN(f.getTime())) return '';
  try {
    return f.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return f.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * Estado real de un reporte, calculado en el navegador.
 *
 * La base de datos también caduca reportes (`marcar_caducados`), pero solo de
 * forma oportunista o por cron. Calcularlo aquí garantiza que un reporte de
 * hace 50 horas no se muestre como vigente aunque el cron no esté activo.
 */
export function estadoEfectivo(reporte, ahora = Date.now()) {
  if (!reporte) return 'caducado';
  if (reporte.estado !== 'activo') return reporte.estado;

  const referencia = new Date(reporte.actualizado_en || reporte.created_at).getTime();
  if (!Number.isFinite(referencia)) return 'activo';

  return ahora - referencia > HORAS_CADUCIDAD * UNA_HORA ? 'caducado' : 'activo';
}

/** ¿El texto de contacto parece un teléfono marcable? */
export function contactoComoTelefono(contacto) {
  const soloDigitos = String(contacto || '').replace(/[^\d+]/g, '');
  const digitos = soloDigitos.replace(/\D/g, '');
  if (digitos.length < 7 || digitos.length > 13) return null;
  return soloDigitos;
}

/** Número en formato internacional para el enlace de WhatsApp. */
export function contactoComoWhatsapp(contacto) {
  const tel = contactoComoTelefono(contacto);
  if (!tel) return null;
  const digitos = tel.replace(/\D/g, '');
  // Celular colombiano sin indicativo: 10 dígitos que empiezan por 3.
  if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`;
  if (digitos.length >= 11 && digitos.length <= 13) return digitos;
  return null;
}

/** Enlace a OpenStreetMap para "cómo llegar". No requiere cuenta ni API key. */
export function enlaceComoLlegar(lat, lng) {
  return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}#map=16/${lat}/${lng}`;
}

/** Formatea el código de edición como XXXX-XXXX-XXXX. */
export function formatearCodigo(codigo) {
  return String(codigo || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(.{4})(?=.)/g, '$1-');
}
