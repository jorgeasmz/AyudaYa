import { useState } from 'react';
import {
  moderarCambiarEstado,
  moderarDescartarDenuncias,
  moderarEliminar,
  moderarQuitarVerificacion,
  moderarVerificar,
} from '../../lib/api.js';
import { interpretarError } from '../../lib/supabase.js';
import { fechaCompleta, estadoEfectivo, tiempoRelativo } from '../../lib/formato.js';
import { tipoDe, TIPOS_PERSONA_POR_VALOR, UMBRAL_ABUSO } from '../../lib/constantes.js';
import Mensaje from '../../componentes/Mensaje.jsx';

export default function FilaModeracion({ recurso, elemento, alCambiar }) {
  const esMapa = recurso === 'reporte_mapa';
  const [ocupado, establecerOcupado] = useState(false);
  const [error, establecerError] = useState(null);
  const [pidiendoFuente, establecerPidiendoFuente] = useState(false);
  const [fuente, establecerFuente] = useState('');

  const oculto = (elemento.reportes_abuso || 0) > UMBRAL_ABUSO;

  async function ejecutar(operacion, cambios) {
    establecerOcupado(true);
    establecerError(null);
    try {
      await operacion();
      alCambiar(elemento.id, cambios);
    } catch (bruto) {
      establecerError(interpretarError(bruto));
    } finally {
      establecerOcupado(false);
    }
  }

  async function alVerificar() {
    const limpia = fuente.trim();
    if (limpia.length < 3) {
      establecerError({
        message: 'Escribe quién verificó la información (mínimo 3 caracteres).',
      });
      return;
    }
    await ejecutar(() => moderarVerificar(elemento.id, limpia), {
      verificado: true,
      fuente_verificacion: limpia,
      reportes_abuso: 0,
    });
    establecerPidiendoFuente(false);
    establecerFuente('');
  }

  async function alEliminar() {
    const etiqueta = esMapa ? elemento.titulo : elemento.nombre_completo;
    if (!window.confirm(`¿Eliminar definitivamente "${etiqueta}"?`)) return;
    await ejecutar(() => moderarEliminar(recurso, elemento.id), null);
  }

  return (
    <article className={`fila-moderacion ${oculto ? 'es-oculto' : ''}`}>
      <div className="fila-moderacion-cabecera">
        <div>
          <h3>
            {esMapa ? (
              <>
                <span aria-hidden="true">{tipoDe(elemento.tipo).emoji}</span>{' '}
                {elemento.titulo}
              </>
            ) : (
              <>
                <span aria-hidden="true">
                  {TIPOS_PERSONA_POR_VALOR[elemento.tipo_registro]?.emoji}
                </span>{' '}
                {elemento.nombre_completo}
              </>
            )}
          </h3>
          <p className="fila-moderacion-meta">
            {elemento.ciudad} · {fechaCompleta(elemento.created_at)} ·{' '}
            {tiempoRelativo(elemento.created_at)}
          </p>
        </div>

        <div className="fila-moderacion-marcas">
          {(elemento.reportes_abuso || 0) > 0 && (
            <span className={`insignia ${oculto ? 'es-grave' : 'es-aviso'}`}>
              🚩 {elemento.reportes_abuso}
            </span>
          )}
          {esMapa && elemento.verificado && (
            <span className="insignia es-ok">✓ Verificado</span>
          )}
          <span className="insignia">
            {esMapa ? estadoEfectivo(elemento) : elemento.estado}
          </span>
        </div>
      </div>

      {oculto && (
        <p className="fila-moderacion-alerta">
          Oculto al público por superar {UMBRAL_ABUSO} denuncias.
        </p>
      )}

      {esMapa ? (
        <>
          {elemento.descripcion && (
            <p className="fila-moderacion-texto">{elemento.descripcion}</p>
          )}
          <p className="fila-moderacion-datos">
            <span>{tipoDe(elemento.tipo).etiqueta}</span>
            {elemento.contacto && <span>📞 {elemento.contacto}</span>}
            <span>
              📍 {Number(elemento.lat).toFixed(5)}, {Number(elemento.lng).toFixed(5)}
            </span>
            {elemento.fuente_verificacion && (
              <span>Fuente: {elemento.fuente_verificacion}</span>
            )}
          </p>
        </>
      ) : (
        <>
          {elemento.descripcion && (
            <p className="fila-moderacion-texto">{elemento.descripcion}</p>
          )}
          <p className="fila-moderacion-datos">
            {elemento.edad_aprox != null && <span>{elemento.edad_aprox} años</span>}
            {elemento.zona_barrio && <span>🏘️ {elemento.zona_barrio}</span>}
            <span>📞 {elemento.contacto_reportante}</span>
          </p>
        </>
      )}

      {error && (
        <Mensaje tipo="error" alCerrar={() => establecerError(null)}>
          {error.message}
        </Mensaje>
      )}

      {pidiendoFuente && (
        <div className="caja-codigo-entrada">
          <label className="etiqueta" htmlFor={`fuente-${elemento.id}`}>
            ¿Quién verificó esta información?
          </label>
          <input
            id={`fuente-${elemento.id}`}
            className="entrada"
            type="text"
            value={fuente}
            onChange={(e) => establecerFuente(e.target.value)}
            placeholder="Ej.: Cruz Roja Cali, brigada del barrio"
            maxLength={80}
            autoComplete="off"
          />
          <div className="caja-codigo-acciones">
            <button
              type="button"
              className="boton boton-plano"
              onClick={() => {
                establecerPidiendoFuente(false);
                establecerFuente('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="boton boton-primario"
              onClick={alVerificar}
              disabled={ocupado || fuente.trim().length < 3}
            >
              Verificar
            </button>
          </div>
        </div>
      )}

      <div className="fila-moderacion-acciones">
        {esMapa &&
          (elemento.verificado ? (
            <button
              type="button"
              className="boton boton-secundario"
              disabled={ocupado}
              onClick={() =>
                ejecutar(() => moderarQuitarVerificacion(elemento.id), {
                  verificado: false,
                  fuente_verificacion: null,
                })
              }
            >
              Quitar verificación
            </button>
          ) : (
            <button
              type="button"
              className="boton boton-exito"
              disabled={ocupado}
              onClick={() => establecerPidiendoFuente(true)}
            >
              ✓ Verificar
            </button>
          ))}

        {esMapa && (
          <>
            <button
              type="button"
              className="boton boton-secundario"
              disabled={ocupado || elemento.estado === 'resuelto'}
              onClick={() =>
                ejecutar(() => moderarCambiarEstado(recurso, elemento.id, 'resuelto'), {
                  estado: 'resuelto',
                })
              }
            >
              Resuelto
            </button>
            <button
              type="button"
              className="boton boton-secundario"
              disabled={ocupado || elemento.estado === 'caducado'}
              onClick={() =>
                ejecutar(() => moderarCambiarEstado(recurso, elemento.id, 'caducado'), {
                  estado: 'caducado',
                })
              }
            >
              Caducado
            </button>
            {elemento.estado !== 'activo' && (
              <button
                type="button"
                className="boton boton-secundario"
                disabled={ocupado}
                onClick={() =>
                  ejecutar(() => moderarCambiarEstado(recurso, elemento.id, 'activo'), {
                    estado: 'activo',
                  })
                }
              >
                Reactivar
              </button>
            )}
          </>
        )}

        {!esMapa && (
          <button
            type="button"
            className="boton boton-secundario"
            disabled={ocupado || elemento.estado === 'encontrado'}
            onClick={() =>
              ejecutar(() => moderarCambiarEstado(recurso, elemento.id, 'encontrado'), {
                estado: 'encontrado',
              })
            }
          >
            Marcar encontrada
          </button>
        )}

        {(elemento.reportes_abuso || 0) > 0 && (
          <button
            type="button"
            className="boton boton-secundario"
            disabled={ocupado}
            onClick={() =>
              ejecutar(() => moderarDescartarDenuncias(recurso, elemento.id), {
                reportes_abuso: 0,
              })
            }
          >
            Descartar denuncias
          </button>
        )}

        <button
          type="button"
          className="boton boton-peligro"
          disabled={ocupado}
          onClick={alEliminar}
        >
          🗑️ Eliminar
        </button>
      </div>
    </article>
  );
}
