import { useState } from 'react';
import { tipoDe, CONFIRMACIONES_DESTACADO } from '../../lib/constantes.js';
import {
  contactoComoTelefono,
  contactoComoWhatsapp,
  enlaceComoLlegar,
  estadoEfectivo,
  tiempoRelativo,
} from '../../lib/formato.js';
import {
  denunciar,
  actualizarEstadoReporte,
  confirmarReporte,
} from '../../lib/api.js';
import {
  marcarConfirmado,
  marcarDenunciado,
  obtenerCodigo,
  olvidarCodigo,
  yaConfirmado,
  yaDenunciado,
} from '../../lib/almacenamiento.js';
import { descartar } from '../../lib/cola.js';
import { interpretarError } from '../../lib/supabase.js';
import Mensaje from '../../componentes/Mensaje.jsx';

/**
 * Ficha de un reporte.
 *
 * Todo el contenido lo escribe React como texto, nunca como HTML: por eso un
 * título con `<script>` se ve tal cual, escapado, en lugar de ejecutarse.
 */
export default function DetalleReporte({ reporte, alActualizar, alCerrar }) {
  const [accionando, establecerAccionando] = useState(false);
  const [error, establecerError] = useState(null);
  const [aviso, establecerAviso] = useState(null);
  const [denunciadoAqui, establecerDenunciadoAqui] = useState(() =>
    yaDenunciado('reporte_mapa', reporte.id)
  );
  const [confirmadoAqui, establecerConfirmadoAqui] = useState(() =>
    yaConfirmado(reporte.id)
  );

  const confirmaciones = reporte.confirmaciones || 0;
  const info = tipoDe(reporte.tipo);
  const estado = estadoEfectivo(reporte);
  const codigoPropio = obtenerCodigo('reporte_mapa', reporte.id);
  const telefono = contactoComoTelefono(reporte.contacto);
  const whatsapp = contactoComoWhatsapp(reporte.contacto);

  async function alDenunciar() {
    if (denunciadoAqui || accionando) return;

    const confirmado = window.confirm(
      '¿Reportar esta información como falsa o ya resuelta?\n\n' +
        'Con varias denuncias, el reporte se oculta hasta que alguien lo revise.'
    );
    if (!confirmado) return;

    establecerAccionando(true);
    establecerError(null);
    try {
      const total = await denunciar('reporte_mapa', reporte.id);
      marcarDenunciado('reporte_mapa', reporte.id);
      establecerDenunciadoAqui(true);
      alActualizar?.(reporte.id, { reportes_abuso: total });
      establecerAviso('Gracias. Un moderador lo revisará.');
    } catch (bruto) {
      const err = interpretarError(bruto);
      // "Ya habías reportado esto" no es un fallo: es el resultado esperado.
      if (/ya habías reportado/i.test(err.message)) {
        marcarDenunciado('reporte_mapa', reporte.id);
        establecerDenunciadoAqui(true);
        establecerAviso('Ya habías reportado este contenido.');
      } else {
        establecerError(err);
      }
    } finally {
      establecerAccionando(false);
    }
  }

  async function alConfirmar() {
    if (confirmadoAqui || accionando) return;

    establecerAccionando(true);
    establecerError(null);
    try {
      const total = await confirmarReporte(reporte.id);
      marcarConfirmado(reporte.id);
      establecerConfirmadoAqui(true);
      alActualizar?.(reporte.id, {
        confirmaciones: total,
        actualizado_en: new Date().toISOString(),
      });
      establecerAviso('Gracias. Tu confirmación ayuda a que otros se fíen.');
    } catch (bruto) {
      const err = interpretarError(bruto);
      // "Ya lo habías confirmado" no es un fallo, es el resultado esperado.
      if (/ya habías confirmado/i.test(err.message)) {
        marcarConfirmado(reporte.id);
        establecerConfirmadoAqui(true);
        establecerAviso('Ya habías confirmado este reporte.');
      } else {
        establecerError(err);
      }
    } finally {
      establecerAccionando(false);
    }
  }

  function alCancelarEnvio() {
    const confirmado = window.confirm(
      '¿Descartar este reporte antes de que se envíe?\n\nNo se podrá recuperar.'
    );
    if (!confirmado) return;

    descartar(reporte.id);
    olvidarCodigo('reporte_mapa', reporte.id);
    alCerrar();
  }

  async function alMarcarResuelto() {
    if (!codigoPropio || accionando) return;

    establecerAccionando(true);
    establecerError(null);
    try {
      const nuevoEstado = reporte.estado === 'resuelto' ? 'activo' : 'resuelto';
      await actualizarEstadoReporte(reporte.id, codigoPropio, nuevoEstado);
      alActualizar?.(reporte.id, {
        estado: nuevoEstado,
        actualizado_en: new Date().toISOString(),
      });
      establecerAviso(
        nuevoEstado === 'resuelto'
          ? 'Marcado como resuelto.'
          : 'Reactivado y con el reloj de 48 h puesto a cero.'
      );
    } catch (bruto) {
      establecerError(interpretarError(bruto));
    } finally {
      establecerAccionando(false);
    }
  }

  return (
    <div className="detalle">
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

      <div className="detalle-cabecera">
        <span
          className="detalle-emoji"
          style={{ '--color-tipo': info.color }}
          aria-hidden="true"
        >
          {info.emoji}
        </span>
        <div>
          <h3 className="detalle-titulo">{reporte.titulo}</h3>
          <p className="detalle-meta">
            {info.etiqueta} · {reporte.ciudad} ·{' '}
            {tiempoRelativo(reporte.actualizado_en || reporte.created_at)}
          </p>
        </div>
      </div>

      <div className="etiquetas">
        {reporte._pendiente && (
          <span className="etiqueta-estado es-pendiente">⏳ Sin enviar todavía</span>
        )}
        {confirmaciones > 0 && (
          <span
            className={`etiqueta-estado ${
              confirmaciones >= CONFIRMACIONES_DESTACADO ? 'es-confirmado' : 'es-neutro'
            }`}
          >
            ✓ Confirmado por {confirmaciones}{' '}
            {confirmaciones === 1 ? 'persona' : 'personas'}
          </span>
        )}
        {confirmaciones === 0 && !reporte._pendiente && (
          <span className="etiqueta-estado es-neutro">Sin confirmar</span>
        )}
        {estado === 'resuelto' && (
          <span className="etiqueta-estado es-resuelto">Resuelto</span>
        )}
        {estado === 'caducado' && (
          <span className="etiqueta-estado es-caducado">
            Sin actualizar hace más de 48 h
          </span>
        )}
        {reporte.reportes_abuso > 0 && (
          <span className="etiqueta-estado es-alerta">
            {reporte.reportes_abuso}{' '}
            {reporte.reportes_abuso === 1 ? 'denuncia' : 'denuncias'}
          </span>
        )}
      </div>

      {reporte._pendiente ? (
        <p className="nota-verificacion">
          Este reporte todavía está en tu teléfono. Se enviará solo en cuanto vuelva la
          señal; nadie más puede verlo aún.
        </p>
      ) : (
        confirmaciones === 0 && (
          <p className="nota-verificacion">
            Nadie más ha confirmado este reporte todavía. Si puedes, llama antes de
            desplazarte.
          </p>
        )
      )}

      {reporte.direccion && (
        <p className="detalle-direccion">
          <span aria-hidden="true">📍</span> {reporte.direccion}
        </p>
      )}

      {reporte.descripcion && (
        <p className="detalle-descripcion">{reporte.descripcion}</p>
      )}

      {reporte.contacto && (
        <div className="detalle-contacto">
          <span className="etiqueta">Contacto</span>
          <div className="botones-contacto">
            {telefono ? (
              <a className="boton boton-secundario" href={`tel:${telefono}`}>
                📞 Llamar
              </a>
            ) : (
              <span className="texto-contacto">{reporte.contacto}</span>
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
        </div>
      )}

      <div className="detalle-acciones">
        <a
          className="boton boton-secundario"
          href={enlaceComoLlegar(reporte.lat, reporte.lng)}
          target="_blank"
          rel="noopener noreferrer"
        >
          🧭 Cómo llegar
        </a>

        {!reporte._pendiente && (
          <button
            type="button"
            className="boton boton-exito"
            onClick={alConfirmar}
            disabled={accionando || confirmadoAqui}
          >
            {confirmadoAqui ? '✓ Ya lo confirmaste' : '👍 Sigue aquí, lo confirmo'}
          </button>
        )}

        {codigoPropio && !reporte._pendiente && (
          <button
            type="button"
            className="boton boton-secundario"
            onClick={alMarcarResuelto}
            disabled={accionando}
          >
            {reporte.estado === 'resuelto'
              ? '↩️ Reactivar mi reporte'
              : '✅ Marcar como resuelto'}
          </button>
        )}

        {reporte._pendiente ? (
          <button
            type="button"
            className="boton boton-peligro"
            onClick={alCancelarEnvio}
            disabled={accionando}
          >
            🗑️ Cancelar este envío
          </button>
        ) : (
          <button
            type="button"
            className="boton boton-peligro"
            onClick={alDenunciar}
            disabled={accionando || denunciadoAqui}
          >
            {denunciadoAqui ? '✓ Ya lo reportaste' : '🚩 Reportar falso o resuelto'}
          </button>
        )}
      </div>

      {codigoPropio && (
        <p className="ayuda ayuda-centro">
          Este reporte lo creaste tú desde este dispositivo.
        </p>
      )}

      <button type="button" className="boton boton-plano" onClick={alCerrar}>
        Cerrar
      </button>
    </div>
  );
}
