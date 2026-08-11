import { useState } from 'react';
import { TIPOS_REPORTE, CIUDADES } from '../../lib/constantes.js';
import { recortar, formatearCodigo } from '../../lib/formato.js';
import { crearReporte } from '../../lib/api.js';
import { guardarCodigo, olvidarCodigo } from '../../lib/almacenamiento.js';
import { generarCodigo, generarId } from '../../lib/identificadores.js';
import { encolar } from '../../lib/cola.js';
import { interpretarError } from '../../lib/supabase.js';
import Mensaje from '../../componentes/Mensaje.jsx';

/**
 * Formulario de reporte.
 *
 * Orden pensado para el pulgar: primero el tipo (una rejilla de botones
 * grandes), luego el título, y la ubicación con dos caminos -GPS o tocar el
 * mapa- porque en una emergencia el GPS a veces no engancha.
 *
 * Los campos NO viven aquí: el borrador lo guarda `VistaMapa`. Al pulsar
 * "Señalar en el mapa" este componente se desmonta, y si el estado estuviera
 * dentro se perderia todo lo escrito. Ver `useBorradorReporte`.
 */
export default function FormularioReporte({
  borrador,
  alCambiar,
  ubicacion,
  alPedirElegirEnMapa,
  alUsarMiUbicacion,
  buscandoUbicacion,
  errorUbicacion,
  alCrear,
  alCerrar,
}) {
  const [enviando, establecerEnviando] = useState(false);
  const [error, establecerError] = useState(null);
  const [resultado, establecerResultado] = useState(null);

  const { tipo, titulo, descripcion, ciudad, contacto } = borrador;
  const tituloLimpio = recortar(titulo, 90);
  const puedeEnviar =
    tipo && tituloLimpio.length >= 3 && ciudad && ubicacion && !enviando;

  async function alEnviar(evento) {
    evento.preventDefault();
    if (!puedeEnviar) return;

    establecerEnviando(true);
    establecerError(null);

    // El id y el código se crean antes de tocar la red: así el reporte existe
    // para quien lo escribió aunque el envío tenga que esperar, y reintentarlo
    // nunca duplica nada.
    const envio = {
      id: generarId(),
      codigo: generarCodigo(),
      titulo: tituloLimpio,
      descripcion: recortar(descripcion, 400) || null,
      lat: ubicacion[0],
      lng: ubicacion[1],
      ciudad,
      contacto: recortar(contacto, 60) || null,
    };

    guardarCodigo('reporte_mapa', envio.id, envio.codigo);

    const filaLocal = {
      id: envio.id,
      tipo: envio.tipo,
      titulo: envio.titulo,
      descripcion: envio.descripcion,
      lat: envio.lat,
      lng: envio.lng,
      ciudad: envio.ciudad,
      contacto: envio.contacto,
      estado: 'activo',
      verificado: false,
      fuente_verificacion: null,
      reportes_abuso: 0,
      created_at: new Date().toISOString(),
    };

    // Si el navegador ya sabe que no hay red, no se gasta ni un segundo
    // esperando a un `fetch` que va a fallar: directo a la cola.
    if (navigator.onLine === false) {
      encolar('reporte_mapa', envio);
      alCrear(filaLocal, true);
      establecerResultado({ codigo: envio.codigo, pendiente: true });
      establecerEnviando(false);
      return;
    }

    try {
      await crearReporte(envio);
      alCrear(filaLocal, false);
      establecerResultado({ codigo: envio.codigo, pendiente: false });
    } catch (bruto) {
      const fallo = interpretarError(bruto);

      // Sin red no se pierde nada: el envío se guarda y sale solo más tarde.
      if (fallo.motivo === 'red') {
        encolar('reporte_mapa', envio);
        // El marcador lo pinta la cola, no `agregarLocal`: así solo hay una
        // fuente para lo pendiente y no aparece dos veces.
        alCrear(filaLocal, true);
        establecerResultado({ codigo: envio.codigo, pendiente: true });
      } else {
        olvidarCodigo('reporte_mapa', envio.id);
        establecerError(fallo);
      }
    } finally {
      establecerEnviando(false);
    }
  }

  // --- Confirmación --------------------------------------------------------
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
              No hay conexión ahora mismo. El reporte quedó guardado y se enviará solo
              en cuanto vuelva la señal. Puedes cerrar la aplicación sin perderlo.
            </p>
          </>
        ) : (
          <>
            <h3>Publicado en el mapa</h3>
            <p>Ya aparece en el mapa para que otros vean la necesidad o el recurso.</p>
          </>
        )}

        <div className="codigo-caja">
          <p className="codigo-etiqueta">
            Guarda este código por si cambias de teléfono. Te sirve para marcar el
            reporte como resuelto:
          </p>
          <p className="codigo-valor">{formatearCodigo(resultado.codigo)}</p>
          <p className="codigo-nota">
            Ya quedó guardado en este dispositivo. No lo compartas con nadie.
          </p>
        </div>

        <button type="button" className="boton boton-primario" onClick={alCerrar}>
          Volver al mapa
        </button>
      </div>
    );
  }

  // --- Formulario ----------------------------------------------------------
  return (
    <form className="formulario" onSubmit={alEnviar} noValidate>
      {error && <Mensaje tipo="error">{error.message}</Mensaje>}

      <fieldset className="campo">
        <legend className="etiqueta">
          ¿Qué necesitas o estás reportando? <span className="obligatorio">*</span>
        </legend>
        <div className="rejilla-tipos">
          {TIPOS_REPORTE.map((t) => (
            <button
              key={t.valor}
              type="button"
              className={`tarjeta-tipo ${tipo === t.valor ? 'es-activa' : ''}`}
              style={tipo === t.valor ? { '--color-tipo': t.color } : undefined}
              onClick={() => alCambiar('tipo', t.valor)}
              aria-pressed={tipo === t.valor}
            >
              <span className="tarjeta-tipo-emoji" aria-hidden="true">
                {t.emoji}
              </span>
              <span className="tarjeta-tipo-nombre">{t.etiqueta}</span>
            </button>
          ))}
        </div>
        {tipo && (
          <p className="ayuda">{TIPOS_REPORTE.find((t) => t.valor === tipo)?.ayuda}</p>
        )}
      </fieldset>

      <div className="campo">
        <label className="etiqueta" htmlFor="titulo">
          Título corto <span className="obligatorio">*</span>
        </label>
        <input
          id="titulo"
          className="entrada"
          type="text"
          value={titulo}
          onChange={(e) => alCambiar('titulo', e.target.value)}
          placeholder="Ej.: Se necesitan pañales en el colegio"
          maxLength={90}
          autoComplete="off"
          enterKeyHint="next"
          required
        />
        <p className="ayuda">{tituloLimpio.length}/90</p>
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="descripcion">
          Detalles (opcional)
        </label>
        <textarea
          id="descripcion"
          className="entrada entrada-area"
          value={descripcion}
          onChange={(e) => alCambiar('descripcion', e.target.value)}
          placeholder="Qué hace falta, cuántas personas lo necesitan, cuándo y dónde…"
          maxLength={400}
          rows={3}
        />
        <p className="ayuda">{descripcion.length}/400</p>
      </div>

      <fieldset className="campo">
        <legend className="etiqueta">
          Ubicación <span className="obligatorio">*</span>
        </legend>

        <div className="botones-ubicacion">
          <button
            type="button"
            className="boton boton-secundario"
            onClick={alUsarMiUbicacion}
            disabled={buscandoUbicacion}
          >
            {buscandoUbicacion ? 'Buscando…' : '📡 Usar mi ubicación'}
          </button>
          <button
            type="button"
            className="boton boton-secundario"
            onClick={alPedirElegirEnMapa}
          >
            🗺️ Señalar en el mapa
          </button>
        </div>

        {errorUbicacion && <p className="ayuda ayuda-error">{errorUbicacion}</p>}

        {ubicacion ? (
          <p className="ayuda ayuda-ok">
            ✔ Ubicación marcada ({ubicacion[0].toFixed(5)}, {ubicacion[1].toFixed(5)})
          </p>
        ) : (
          <p className="ayuda">
            Todavía sin ubicación. Sin ella el reporte no sirve a quien busca ayuda
            cerca.
          </p>
        )}
      </fieldset>

      <div className="campo">
        <label className="etiqueta" htmlFor="ciudad">
          Ciudad <span className="obligatorio">*</span>
        </label>
        <select
          id="ciudad"
          className="entrada"
          value={ciudad}
          onChange={(e) => alCambiar('ciudad', e.target.value)}
          required
        >
          <option value="">Elige una…</option>
          {CIUDADES.map((c) => (
            <option key={c.nombre} value={c.nombre}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label className="etiqueta" htmlFor="contacto">
          Teléfono de contacto (opcional)
        </label>
        <input
          id="contacto"
          className="entrada"
          type="tel"
          inputMode="tel"
          value={contacto}
          onChange={(e) => alCambiar('contacto', e.target.value)}
          placeholder="300 000 0000"
          maxLength={60}
          autoComplete="off"
        />
        <p className="ayuda">Este número será público. Déjalo vacío si prefieres.</p>
      </div>

      <button
        type="submit"
        className="boton boton-primario boton-grande"
        disabled={!puedeEnviar}
      >
        {enviando ? 'Publicando…' : 'Publicar reporte'}
      </button>

      {!puedeEnviar && !enviando && (
        <p className="ayuda ayuda-centro">
          Faltan: {!tipo && 'tipo'}
          {!tipo && (tituloLimpio.length < 3 || !ciudad || !ubicacion) && ', '}
          {tituloLimpio.length < 3 && 'título'}
          {tituloLimpio.length < 3 && (!ciudad || !ubicacion) && ', '}
          {!ubicacion && 'ubicación'}
          {!ubicacion && !ciudad && ', '}
          {!ciudad && 'ciudad'}
        </p>
      )}
    </form>
  );
}
