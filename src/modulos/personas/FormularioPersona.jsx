import { useState } from 'react';
import { CIUDADES, TIPOS_PERSONA_POR_VALOR } from '../../lib/constantes.js';
import { recortar, formatearCodigo } from '../../lib/formato.js';
import { crearRegistroPersona } from '../../lib/api.js';
import { guardarCodigo, olvidarCodigo } from '../../lib/almacenamiento.js';
import { generarCodigo, generarId } from '../../lib/identificadores.js';
import { encolar } from '../../lib/cola.js';
import { interpretarError } from '../../lib/supabase.js';
import Mensaje from '../../componentes/Mensaje.jsx';
import AvisoPrivacidad from '../../componentes/AvisoPrivacidad.jsx';

/**
 * Un solo formulario para los dos casos ("busco a alguien" y "estoy bien"),
 * con los textos adaptados. Mantenerlos separados duplicaría el código sin
 * ganar nada: los campos son los mismos.
 */
export default function FormularioPersona({ tipoRegistro, alCrear, alCerrar }) {
  const info = TIPOS_PERSONA_POR_VALOR[tipoRegistro];
  const buscando = tipoRegistro === 'busco_a_alguien';

  const [nombre, establecerNombre] = useState('');
  const [edad, establecerEdad] = useState('');
  const [zona, establecerZona] = useState('');
  const [ciudad, establecerCiudad] = useState('');
  const [descripcion, establecerDescripcion] = useState('');
  const [contacto, establecerContacto] = useState('');
  const [autorizado, establecerAutorizado] = useState(false);
  const [enviando, establecerEnviando] = useState(false);
  const [error, establecerError] = useState(null);
  const [resultado, establecerResultado] = useState(null);

  const nombreLimpio = recortar(nombre, 80);
  const contactoLimpio = recortar(contacto, 60);
  const puedeEnviar =
    nombreLimpio.length >= 3 &&
    contactoLimpio.length >= 5 &&
    ciudad &&
    autorizado &&
    !enviando;

  async function alEnviar(evento) {
    evento.preventDefault();
    if (!puedeEnviar) return;

    establecerEnviando(true);
    establecerError(null);

    // Id y código se generan aquí, antes de tocar la red: el registro puede
    // encolarse sin conexión y reintentarse sin riesgo de duplicarlo.
    const envio = {
      id: generarId(),
      codigo: generarCodigo(),
      tipoRegistro,
      nombreCompleto: nombreLimpio,
      contacto: contactoLimpio,
      ciudad,
      edad: edad === '' ? null : Number(edad),
      zona: recortar(zona, 80) || null,
      descripcion: recortar(descripcion, 400) || null,
    };

    guardarCodigo('persona', envio.id, envio.codigo);

    if (navigator.onLine === false) {
      encolar('persona', envio);
      establecerResultado({ codigo: envio.codigo, pendiente: true });
      alCrear?.();
      establecerEnviando(false);
      return;
    }

    try {
      await crearRegistroPersona(envio);
      establecerResultado({ codigo: envio.codigo, pendiente: false });
      alCrear?.();
    } catch (bruto) {
      const fallo = interpretarError(bruto);

      if (fallo.motivo === 'red') {
        encolar('persona', envio);
        establecerResultado({ codigo: envio.codigo, pendiente: true });
        alCrear?.();
      } else {
        olvidarCodigo('persona', envio.id);
        establecerError(fallo);
      }
    } finally {
      establecerEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="confirmacion">
        <p className="confirmacion-icono" aria-hidden="true">
          {resultado.pendiente ? '📥' : '✅'}
        </p>

        {resultado.pendiente ? (
          <>
            <h3>Guardado en tu teléfono</h3>
            <p>
              No hay conexión ahora mismo. El registro quedó guardado y se publicará
              solo en cuanto vuelva la señal. Puedes cerrar la aplicación sin perderlo.
            </p>
          </>
        ) : (
          <>
            <h3>{buscando ? 'Búsqueda publicada' : 'Aviso publicado'}</h3>
            <p>
              {buscando
                ? 'Ya aparece en el buscador. Si alguien tiene información, te llamará al número que dejaste.'
                : 'Quien te esté buscando podrá encontrar este aviso por tu nombre.'}
            </p>
          </>
        )}

        <div className="codigo-caja">
          <p className="codigo-etiqueta">
            Tu código para {buscando ? 'marcar como encontrada' : 'editar o borrar'}{' '}
            este registro:
          </p>
          <p className="codigo-valor">{formatearCodigo(resultado.codigo)}</p>
          <p className="codigo-nota">
            Quedó guardado en este dispositivo. Anótalo también en papel: si cambias de
            teléfono o borras los datos del navegador, es la única forma de recuperar el
            control del registro.
          </p>
        </div>

        <button type="button" className="boton boton-primario" onClick={alCerrar}>
          Volver al buscador
        </button>
      </div>
    );
  }

  return (
    <form className="formulario" onSubmit={alEnviar} noValidate>
      <p className="formulario-intro">
        <span aria-hidden="true">{info?.emoji}</span>{' '}
        {buscando
          ? 'Publica los datos de la persona que estás buscando.'
          : 'Avisa que estás bien para que quien te busque te encuentre.'}
      </p>

      <AvisoPrivacidad />

      {error && <Mensaje tipo="error">{error.message}</Mensaje>}

      <div className="campo">
        <label className="etiqueta" htmlFor="nombre">
          {buscando ? 'Nombre completo de la persona' : 'Tu nombre completo'}{' '}
          <span className="obligatorio">*</span>
        </label>
        <input
          id="nombre"
          className="entrada"
          type="text"
          value={nombre}
          onChange={(e) => establecerNombre(e.target.value)}
          placeholder="Ej.: María Fernanda Ríos Gómez"
          maxLength={80}
          autoComplete="off"
          required
        />
        <p className="ayuda">Escríbelo completo y bien: es la forma en que se busca.</p>
      </div>

      <div className="campo-doble">
        <div className="campo">
          <label className="etiqueta" htmlFor="edad">
            Edad aproximada
          </label>
          <input
            id="edad"
            className="entrada"
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            value={edad}
            onChange={(e) => establecerEdad(e.target.value)}
            placeholder="35"
          />
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="ciudad-persona">
            Ciudad <span className="obligatorio">*</span>
          </label>
          <select
            id="ciudad-persona"
            className="entrada"
            value={ciudad}
            onChange={(e) => establecerCiudad(e.target.value)}
            required
          >
            <option value="">Elige…</option>
            {CIUDADES.map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="zona">
          Barrio o zona
        </label>
        <input
          id="zona"
          className="entrada"
          type="text"
          value={zona}
          onChange={(e) => establecerZona(e.target.value)}
          placeholder="Ej.: Barrio Obrero, comuna 3"
          maxLength={80}
          autoComplete="off"
        />
        <p className="ayuda ayuda-alerta">
          Solo el barrio o la zona. <strong>Nunca la dirección exacta.</strong>
        </p>
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="descripcion-persona">
          {buscando ? 'Señas y dónde se le vio por última vez' : 'Mensaje (opcional)'}
        </label>
        <textarea
          id="descripcion-persona"
          className="entrada entrada-area"
          value={descripcion}
          onChange={(e) => establecerDescripcion(e.target.value)}
          placeholder={
            buscando
              ? 'Ropa que llevaba, estatura, señas particulares, última vez que se le vio…'
              : 'Ej.: Estoy en el albergue del coliseo, sin señal en el celular.'
          }
          maxLength={400}
          rows={4}
        />
        <p className="ayuda">{descripcion.length}/400</p>
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="contacto-persona">
          Tu teléfono de contacto <span className="obligatorio">*</span>
        </label>
        <input
          id="contacto-persona"
          className="entrada"
          type="tel"
          inputMode="tel"
          value={contacto}
          onChange={(e) => establecerContacto(e.target.value)}
          placeholder="300 000 0000"
          maxLength={60}
          autoComplete="tel"
          required
        />
        <p className="ayuda ayuda-alerta">
          Será público. Es cómo te contactará quien tenga información.
        </p>
      </div>

      <label className="casilla casilla-destacada">
        <input
          type="checkbox"
          checked={autorizado}
          onChange={(e) => establecerAutorizado(e.target.checked)}
        />
        <span>
          Entiendo que esta información será pública y autorizo su publicación con el
          fin de localizar a la persona.
        </span>
      </label>

      <button
        type="submit"
        className="boton boton-primario boton-grande"
        disabled={!puedeEnviar}
      >
        {enviando ? 'Publicando…' : 'Publicar'}
      </button>
    </form>
  );
}
