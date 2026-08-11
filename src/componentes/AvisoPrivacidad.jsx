/**
 * Aviso de una línea sobre el módulo de personas.
 *
 * No pone límites a lo que se puede escribir: en una emergencia, una dirección
 * exacta puede ser justo el dato que hace falta. Solo deja claro que lo
 * publicado es visible para cualquiera, que es un hecho, no un consejo.
 */
export default function AvisoPrivacidad() {
  return (
    <div className="aviso-privacidad" role="note">
      <strong>Todo lo que publiques aquí es público.</strong> Lo verá cualquiera
      que entre, incluido el teléfono que dejes.
    </div>
  );
}
