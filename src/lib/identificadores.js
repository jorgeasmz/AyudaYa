/**
 * Identificadores generados en el navegador.
 *
 * El `id` de fila y el código de edición se crean aquí, no en el servidor, y de
 * eso dependen dos cosas:
 *
 *   1. Se puede rellenar y "publicar" un reporte sin conexión: quien reporta ve
 *      su código al instante y el envío queda encolado.
 *   2. Los envíos son idempotentes. Si una petición llega al servidor pero se
 *      pierde la respuesta, el reintento manda el mismo `id` y el servidor lo
 *      ignora en vez de crear un duplicado.
 *
 * Todo sale de `crypto.getRandomValues`, que es un generador criptográfico y
 * está disponible también fuera de contextos seguros (a diferencia de
 * `crypto.randomUUID`, que exige HTTPS y fallaría en pruebas por IP local).
 */

function bytesAleatorios(n) {
  const buffer = new Uint8Array(n);
  crypto.getRandomValues(buffer);
  return buffer;
}

/** UUID v4 conforme a RFC 4122. */
export function generarId() {
  const b = bytesAleatorios(16);

  b[6] = (b[6] & 0x0f) | 0x40; // versión 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/*
 * Alfabeto de 32 símbolos, sin I, L, O ni U:
 *   - 32 es potencia de dos, así que `byte & 31` reparte uniforme y no hace
 *     falta descartar valores para evitar sesgo.
 *   - Las letras excluidas son las que la gente confunde al copiar un código
 *     a mano desde la pantalla de un teléfono roto.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LONGITUD_CODIGO = 12; // 12 x 5 bits = 60 bits de entropía

/** Código de edición con formato XXXX-XXXX-XXXX. */
export function generarCodigo() {
  const b = bytesAleatorios(LONGITUD_CODIGO);

  let bruto = '';
  for (let i = 0; i < LONGITUD_CODIGO; i += 1) bruto += ALFABETO[b[i] & 31];

  return bruto.replace(/(.{4})(?=.)/g, '$1-');
}
