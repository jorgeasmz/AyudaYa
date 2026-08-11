/**
 * Aviso de privacidad para el módulo de personas.
 *
 * Se muestra ANTES de cualquier formulario, no detrás de un enlace: lo que la
 * Ley 1581 de 2012 llama "autorización previa, expresa e informada" no se
 * cumple con una casilla que nadie lee.
 */
export default function AvisoPrivacidad({ compacto = false }) {
  if (compacto) {
    return (
      <div className="aviso-privacidad es-compacto" role="note">
        <strong>Esta información es pública.</strong> No incluyas direcciones exactas:
        solo el barrio o la zona.
      </div>
    );
  }

  return (
    <div className="aviso-privacidad" role="note">
      <h3>Antes de continuar, léelo</h3>
      <ul>
        <li>
          <strong>Todo lo que escribas aquí es público.</strong> Cualquiera con el
          enlace puede verlo, incluidos buscadores.
        </li>
        <li>
          <strong>Nunca pongas una dirección exacta.</strong> Solo el barrio o la zona.
          Una dirección concreta pone en riesgo a quien vive ahí, sobre todo con
          reportes de saqueos.
        </li>
        <li>
          <strong>Publica solo datos necesarios</strong> para reconocer a la persona:
          nombre, edad aproximada, ropa, señas particulares.
        </li>
        <li>
          <strong>El teléfono que dejes será visible</strong> para que quien tenga
          información pueda contactarte.
        </li>
        <li>
          Al publicar recibirás un <strong>código</strong> que te permite marcar el
          registro como encontrado o borrarlo cuando quieras.
        </li>
      </ul>
      <p className="aviso-privacidad-legal">
        Tratamos estos datos solo para localizar personas tras el sismo, según la Ley
        1581 de 2012 (Habeas Data). Puedes borrar tu registro en cualquier momento con
        tu código. Los registros se eliminan automáticamente a los 90 días.
      </p>
    </div>
  );
}
