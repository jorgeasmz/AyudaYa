import { useState } from 'react';
import { TIPOS_PERSONA_POR_VALOR } from '../../lib/constantes.js';
import {
  contactoComoTelefono,
  contactoComoWhatsapp,
  formatearCodigo,
  tiempoRelativo,
} from '../../lib/formato.js';
import {
  denunciar,
  eliminarRegistroPersona,
  marcarPersonaEncontrada,
} from '../../lib/api.js';
import {
  guardarCodigo,
  marcarDenunciado,
  obtenerCodigo,
  olvidarCodigo,
  yaDenunciado,
} from '../../lib/almacenamiento.js';
import { descartar } from '../../lib/cola.js';
import { interpretarError } from '../../lib/supabase.js';
import Mensaje from '../../componentes/Mensaje.jsx';

export default function TarjetaPersona({ persona, alCambiar }) {
  const [accionando, establecerAccionando] = useState(false);
  const [error, establecerError] = useState(null);
  const [aviso, establecerAviso] = useState(null);
  const [pidiendoCodigo, establecerPidiendoCodigo] = useState(false);
  const [codigoEscrito, establecerCodigoEscrito] = useState('');
  const [denunciadoAqui, establecerDenunciadoAqui] = useState(() =>
    yaDenunciado('persona', persona.id)
  );

  const info = TIPOS_PERSONA_POR_VALOR[persona.tipo_registro];
  const codigoGuardado = obtenerCodigo('persona', persona.id);
  const telefono = contactoComoTelefono(persona.contacto_reportante);
  const whatsapp = contactoComoWhatsapp(persona.contacto_reportante);
  const encontrada = persona.estado === 'encontrado';
  const pendiente = Boolean(persona._pendiente);

  /** Código a usar: el del dispositivo, o el que la persona acaba de escribir. */
  function codigoEnUso() {
    return codigoGuardado || codigoEscrito.trim();
  }

  async function conManejo(operacion, mensajeExito) {
    establecerAccionando(true);
    establecerError(null);
    try {
      await operacion();
      establecerAviso(mensajeExito);
      return true;
    } catch (bruto) {
      establecerError(interpretarError(bruto));
      return false;
    } finally {
      establecerAccionando(false);
    }
  }

  async function alMarcarEncontrada() {
    const codigo = codigoEnUso();
    if (!codigo) {
      establecerPidiendoCodigo(true);
      return;
    }

    const ok = await conManejo(async () => {
      await marcarPersonaEncontrada(persona.id, codigo);
      // Si el código vino escrito a mano y funcionó, lo guardamos: esta persona
      // ha demostrado ser quien creó el registro.
      if (!codigoGuardado) guardarCodigo('persona', persona.id, codigo);
    }, '¡Qué alegría! Marcada como encontrada.');

    if (ok) {
      establecerPidiendoCodigo(false);
      alCambiar?.(persona.id, { estado: 'encontrado' });
    }
  }

  async function alEliminar() {
    const codigo = codigoEnUso();
    if (!codigo) {
      establecerPidiendoCodigo(true);
      return;
    }

    const confirmado = window.confirm(
      '¿Borrar este registro definitivamente?\n\nNo se puede deshacer.'
    );
    if (!confirmado) return;

    const ok = await conManejo(
      () => eliminarRegistroPersona(persona.id, codigo),
      'Registro borrado.'
    );

    if (ok) {
      olvidarCodigo('persona', persona.id);
      alCambiar?.(persona.id, null); // null = quitar de la lista
    }
  }

  async function alDenunciar() {
    if (denunciadoAqui) return;
    const confirmado = window.confirm(
      '¿Reportar este registro como falso o inapropiado?'
    );
    if (!confirmado) return;

    establecerAccionando(true);
    establecerError(null);
    try {
      const total = await denunciar('persona', persona.id);
      marcarDenunciado('persona', persona.id);
      establecerDenunciadoAqui(true);
      alCambiar?.(persona.id, { reportes_abuso: total });
      establecerAviso('Gracias. Un moderador lo revisará.');
    } catch (bruto) {
      const err = interpretarError(bruto);
      if (/ya habías reportado/i.test(err.message)) {
        marcarDenunciado('persona', persona.id);
        establecerDenunciadoAqui(true);
        establecerAviso('Ya habías reportado este contenido.');
      } else {
        establecerError(err);
      }
    } finally {
      establecerAccionando(false);
    }
  }

  return (
    <article
      className={`tarjeta-persona ${encontrada ? 'es-encontrada' : ''} ${
        pendiente ? 'es-pendiente' : ''
      }`}
    >
      <header className="tarjeta-persona-cabecera">
        {pendiente && (
          <span className="etiqueta-estado es-pendiente">⏳ Sin enviar</span>
        )}
        <span className="etiqueta-tipo" style={{ '--color-tipo': info?.color }}>
          <span aria-hidden="true">{info?.emoji}</span> {info?.etiqueta}
        </span>
        {encontrada && (
          <span className="etiqueta-estado es-resuelto">💚 Encontrada</span>
        )}
        <span className="tarjeta-persona-fecha">
          {tiempoRelativo(persona.created_at)}
        </span>
      </header>

      <h3 className="tarjeta-persona-nombre">{persona.nombre_completo}</h3>

      <p className="tarjeta-persona-meta">
        {persona.edad_aprox != null && `${persona.edad_aprox} años · `}
        {persona.ciudad}
        {persona.zona_barrio ? ` · ${persona.zona_barrio}` : ''}
      </p>

      {persona.descripcion && (
        <p className="tarjeta-persona-descripcion">{persona.descripcion}</p>
      )}

      <div className="botones-contacto">
        {telefono ? (
          <a className="boton boton-secundario" href={`tel:${telefono}`}>
            📞 Llamar a quien reportó
          </a>
        ) : (
          <span className="texto-contacto">{persona.contacto_reportante}</span>
        )}
        {whatsapp && (
          <a
            className="boton boton-secundario"
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 WhatsApp
          </a>
        )}
      </div>

      {error && (
        <Mensaje tipo="error" alCerrar={() => establecerError(null)}>
          {error.message}
        </Mensaje>
      )}
      {aviso && (
        <Mensaje tipo="exito" alCerrar={() => establecerAviso(null)}>
          {aviso}
        </Mensaje>
      )}

      {pidiendoCodigo && !codigoGuardado && (
        <div className="caja-codigo-entrada">
          <label className="etiqueta" htmlFor={`codigo-${persona.id}`}>
            Escribe el código que recibiste al publicar
          </label>
          <input
            id={`codigo-${persona.id}`}
            className="entrada"
            type="text"
            value={codigoEscrito}
            onChange={(e) => establecerCodigoEscrito(formatearCodigo(e.target.value))}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={14}
            autoComplete="off"
            autoCapitalize="characters"
          />
          <div className="caja-codigo-acciones">
            <button
              type="button"
              className="boton boton-plano"
              onClick={() => {
                establecerPidiendoCodigo(false);
                establecerCodigoEscrito('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="boton boton-primario"
              onClick={alMarcarEncontrada}
              disabled={accionando || codigoEscrito.length < 12}
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      <footer className="tarjeta-persona-acciones">
        {pendiente && (
          <button
            type="button"
            className="boton boton-peligro"
            onClick={() => {
              if (
                window.confirm(
                  '¿Descartar este registro antes de que se envíe?\n\nNo se podrá recuperar.'
                )
              ) {
                descartar(persona.id);
                olvidarCodigo('persona', persona.id);
              }
            }}
          >
            🗑️ Cancelar este envío
          </button>
        )}

        {!pendiente && !encontrada && (
          <button
            type="button"
            className="boton boton-exito"
            onClick={alMarcarEncontrada}
            disabled={accionando}
          >
            💚 Ya apareció
          </button>
        )}

        {!pendiente && codigoGuardado && (
          <button
            type="button"
            className="boton boton-peligro"
            onClick={alEliminar}
            disabled={accionando}
          >
            🗑️ Borrar mi registro
          </button>
        )}

        {!pendiente && (
          <button
            type="button"
            className="boton boton-plano"
            onClick={alDenunciar}
            disabled={accionando || denunciadoAqui}
          >
            {denunciadoAqui ? '✓ Reportado' : '🚩 Reportar'}
          </button>
        )}
      </footer>

      {pendiente ? (
        <p className="ayuda ayuda-centro">
          Todavía en tu teléfono. Se publicará solo en cuanto vuelva la señal.
        </p>
      ) : (
        codigoGuardado && (
          <p className="ayuda ayuda-centro">Publicaste esto desde este dispositivo.</p>
        )
      )}
    </article>
  );
}
