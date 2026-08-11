import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { useReportes } from './usarReportes.js';
import { useBorradorReporte } from './usarBorrador.js';
import BuscadorLugar from './BuscadorLugar.jsx';
import FiltrosCapas from './FiltrosCapas.jsx';
import FormularioReporte from './FormularioReporte.jsx';
import DetalleReporte from './DetalleReporte.jsx';
import Hoja from '../../componentes/Hoja.jsx';
import Mensaje from '../../componentes/Mensaje.jsx';
import AvisoConexion from '../../componentes/AvisoConexion.jsx';
import { EsqueletoMapa } from '../../componentes/Esqueleto.jsx';
import { useConexion } from '../../lib/usarConexion.js';
import { CIUDADES, TIPOS_REPORTE, LIMITE_REPORTES } from '../../lib/constantes.js';
import { estadoEfectivo } from '../../lib/formato.js';

// Leaflet + su CSS (≈45 KB comprimidos) solo se descargan aquí.
const Mapa = lazy(() => import('./Mapa.jsx'));

const TODOS_LOS_TIPOS = new Set(TIPOS_REPORTE.map((t) => t.valor));

export default function VistaMapa() {
  const conexion = useConexion();
  const {
    reportes,
    cargando,
    error,
    enVivo,
    origenCache,
    recargar,
    agregarLocal,
    actualizarLocal,
    cola,
  } = useReportes(conexion);

  // --- Filtros -------------------------------------------------------------
  const [tiposActivos, establecerTiposActivos] = useState(TODOS_LOS_TIPOS);
  const [soloVerificados, establecerSoloVerificados] = useState(false);
  const [mostrarCaducados, establecerMostrarCaducados] = useState(false);

  // --- Interfaz ------------------------------------------------------------
  const [seleccionadoId, establecerSeleccionadoId] = useState(null);
  const [formularioAbierto, establecerFormularioAbierto] = useState(false);
  const [modoUbicacion, establecerModoUbicacion] = useState(false);
  const [ubicacion, establecerUbicacion] = useState(null);
  const [buscandoUbicacion, establecerBuscandoUbicacion] = useState(false);
  const [errorUbicacion, establecerErrorUbicacion] = useState(null);
  const [vistaSolicitada, establecerVistaSolicitada] = useState(null);
  const [ciudadSugerida, establecerCiudadSugerida] = useState('');
  const [referenciaUbicacion, establecerReferenciaUbicacion] = useState(null);

  // El borrador se guarda fuera del formulario: al ir a señalar la ubicación el
  // formulario se desmonta, y lo escrito no puede perderse.
  const borradorReporte = useBorradorReporte();

  // --- Derivados -----------------------------------------------------------
  const ahora = Date.now();

  const conteos = useMemo(() => {
    const acumulado = {};
    reportes.forEach((r) => {
      if (!mostrarCaducados && estadoEfectivo(r, ahora) !== 'activo') return;
      acumulado[r.tipo] = (acumulado[r.tipo] || 0) + 1;
    });
    return acumulado;
    // `ahora` cambia en cada render; el recuento es barato y así refleja la
    // caducidad sin necesidad de un temporizador.
  }, [reportes, mostrarCaducados, ahora]);

  const visibles = useMemo(
    () =>
      reportes.filter((r) => {
        if (!tiposActivos.has(r.tipo)) return false;
        if (soloVerificados && !r.verificado) return false;
        if (!mostrarCaducados && estadoEfectivo(r, ahora) !== 'activo') return false;
        return true;
      }),
    [reportes, tiposActivos, soloVerificados, mostrarCaducados, ahora]
  );

  const seleccionado = useMemo(
    () => reportes.find((r) => r.id === seleccionadoId) || null,
    [reportes, seleccionadoId]
  );

  // --- Acciones ------------------------------------------------------------
  const alternarTipo = useCallback((valor) => {
    establecerTiposActivos((previos) => {
      const copia = new Set(previos);
      if (copia.has(valor)) copia.delete(valor);
      else copia.add(valor);
      return copia;
    });
  }, []);

  const alternarTodos = useCallback((activar) => {
    establecerTiposActivos(activar ? new Set(TODOS_LOS_TIPOS) : new Set());
  }, []);

  const usarMiUbicacion = useCallback(() => {
    if (!navigator.geolocation) {
      establecerErrorUbicacion(
        'Tu navegador no permite ubicarte. Señala el punto en el mapa.'
      );
      return;
    }

    establecerBuscandoUbicacion(true);
    establecerErrorUbicacion(null);

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const punto = [posicion.coords.latitude, posicion.coords.longitude];
        establecerUbicacion(punto);
        establecerReferenciaUbicacion('Tu ubicación actual');
        establecerVistaSolicitada({ centro: punto, zoom: 16 });
        establecerBuscandoUbicacion(false);
      },
      (fallo) => {
        establecerBuscandoUbicacion(false);
        const mensajes = {
          1: 'No diste permiso de ubicación. Puedes señalar el punto en el mapa.',
          2: 'No pudimos ubicarte (sin señal de GPS). Señálalo en el mapa.',
          3: 'La ubicación tardó demasiado. Señálala en el mapa.',
        };
        establecerErrorUbicacion(
          mensajes[fallo.code] || 'No pudimos obtener tu ubicación.'
        );
      },
      // Sin `enableHighAccuracy`: en interiores y con la red saturada, el GPS
      // fino puede tardar más de un minuto. Bastan 50-100 m de precisión.
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  const pedirElegirEnMapa = useCallback(() => {
    establecerModoUbicacion(true);
    establecerFormularioAbierto(false);
    establecerErrorUbicacion(null);
    establecerReferenciaUbicacion(null);
  }, []);

  const confirmarUbicacion = useCallback(() => {
    establecerModoUbicacion(false);
    establecerFormularioAbierto(true);
  }, []);

  const cerrarDetalle = useCallback(() => {
    establecerSeleccionadoId(null);
  }, []);

  const cerrarFormulario = useCallback(() => {
    establecerFormularioAbierto(false);
  }, []);

  const { sugerirCiudad, limpiar: limpiarBorrador } = borradorReporte;

  const irACiudad = useCallback(
    (nombre) => {
      const ciudad = CIUDADES.find((c) => c.nombre === nombre);
      establecerCiudadSugerida(nombre);
      sugerirCiudad(nombre);
      if (ciudad?.centro) {
        establecerVistaSolicitada({ centro: ciudad.centro, zoom: ciudad.zoom });
      }
    },
    [sugerirCiudad]
  );

  const alCrearReporte = useCallback(
    (reporte, pendiente) => {
      // Lo pendiente lo pinta la cola (ver `useReportes`); añadirlo también
      // aquí lo duplicaría en el mapa.
      if (!pendiente) agregarLocal(reporte);
      establecerUbicacion(null);
      establecerReferenciaUbicacion(null);
      limpiarBorrador();
    },
    [agregarLocal, limpiarBorrador]
  );

  const alElegirLugar = useCallback((lugar) => {
    const punto = [lugar.lat, lugar.lng];
    establecerUbicacion(punto);
    establecerReferenciaUbicacion(lugar.nombre);
    establecerVistaSolicitada({ centro: punto, zoom: 16 });
  }, []);

  const alCambiarUbicacion = useCallback(
    (punto) => {
      // Tocar el mapa solo mueve el pin cuando se está eligiendo ubicación:
      // fuera de ese modo, un toque accidental no debe hacer nada.
      if (modoUbicacion) {
        establecerUbicacion(punto);
        establecerReferenciaUbicacion(null);
      }
    },
    [modoUbicacion]
  );

  const topeAlcanzado = reportes.length >= LIMITE_REPORTES;

  return (
    <div className="vista-mapa">
      <AvisoConexion
        estado={conexion.estado}
        alReintentar={() => recargar()}
        edadDatos={origenCache}
      />

      {cola.pendientes.length > 0 && (
        <div className="aviso-cola" role="status" aria-live="polite">
          <span aria-hidden="true">📥</span>
          <span className="aviso-cola-texto">
            <strong>
              {cola.pendientes.length}{' '}
              {cola.pendientes.length === 1
                ? 'reporte sin enviar'
                : 'reportes sin enviar'}
            </strong>
            . Salen solos cuando vuelva la señal.
          </span>
          <button
            type="button"
            className="aviso-cola-boton"
            onClick={cola.reintentar}
            disabled={cola.reintentando}
          >
            {cola.reintentando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        </div>
      )}

      <div className="barra-superior">
        <select
          className="entrada entrada-compacta"
          value={ciudadSugerida}
          onChange={(e) => irACiudad(e.target.value)}
          aria-label="Ir a una ciudad"
        >
          <option value="">Toda la zona</option>
          {CIUDADES.filter((c) => c.centro).map((c) => (
            <option key={c.nombre} value={c.nombre}>
              {c.nombre}
            </option>
          ))}
        </select>

        <span
          className={`indicador-vivo ${enVivo ? 'es-activo' : ''}`}
          title={
            enVivo
              ? 'Los reportes nuevos aparecen solos'
              : 'Sin actualización automática: usa el botón de recargar'
          }
        >
          <span className="indicador-punto" aria-hidden="true" />
          {enVivo ? 'En vivo' : 'Manual'}
        </span>

        <button
          type="button"
          className="boton boton-icono"
          onClick={() => recargar()}
          aria-label="Recargar reportes"
          disabled={cargando}
        >
          {cargando ? '…' : '↻'}
        </button>
      </div>

      <FiltrosCapas
        activos={tiposActivos}
        alAlternar={alternarTipo}
        alAlternarTodos={alternarTodos}
        conteos={conteos}
        soloVerificados={soloVerificados}
        alCambiarSoloVerificados={establecerSoloVerificados}
        mostrarCaducados={mostrarCaducados}
        alCambiarMostrarCaducados={establecerMostrarCaducados}
      />

      <div className="mapa-envoltorio">
        <Suspense fallback={<EsqueletoMapa />}>
          <Mapa
            reportes={visibles}
            alSeleccionar={establecerSeleccionadoId}
            seleccionadoId={seleccionadoId}
            modoUbicacion={modoUbicacion}
            ubicacionElegida={ubicacion}
            alElegirUbicacion={alCambiarUbicacion}
            vistaSolicitada={vistaSolicitada}
          />
        </Suspense>

        {modoUbicacion && (
          <div className="capa-ubicacion">
            <div className="capa-ubicacion-aviso">
              Busca un lugar público o toca el mapa para ajustar el punto exacto.
            </div>
            <BuscadorLugar
              alElegirLugar={alElegirLugar}
              referenciaElegida={referenciaUbicacion}
            />
            <div className="capa-ubicacion-acciones">
              <button
                type="button"
                className="boton boton-plano"
                onClick={() => {
                  establecerModoUbicacion(false);
                  establecerFormularioAbierto(true);
                  establecerReferenciaUbicacion(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton-primario"
                onClick={confirmarUbicacion}
                disabled={!ubicacion}
              >
                Confirmar ubicación
              </button>
            </div>
          </div>
        )}

        {!modoUbicacion && (
          <button
            type="button"
            className="boton-flotante"
            onClick={() => establecerFormularioAbierto(true)}
          >
            <span aria-hidden="true">＋</span> Reportar
          </button>
        )}

        {!cargando && !visibles.length && !modoUbicacion && (
          <div className="mapa-vacio">
            {reportes.length === 0
              ? 'Todavía no hay reportes. Sé la primera persona en publicar uno.'
              : 'Ningún reporte coincide con los filtros.'}
          </div>
        )}
      </div>

      {error && error.motivo !== 'red' && (
        <div className="franja-error">
          <Mensaje tipo="error">{error.message}</Mensaje>
        </div>
      )}

      {topeAlcanzado && (
        <div className="franja-error">
          <Mensaje tipo="aviso">
            Se están mostrando los {LIMITE_REPORTES} reportes más recientes. Puede haber
            más sin mostrar; filtra por ciudad para acotar.
          </Mensaje>
        </div>
      )}

      <Hoja
        abierta={Boolean(seleccionado)}
        titulo="Detalle del reporte"
        alCerrar={cerrarDetalle}
      >
        {seleccionado && (
          <DetalleReporte
            reporte={seleccionado}
            alActualizar={actualizarLocal}
            alCerrar={cerrarDetalle}
          />
        )}
      </Hoja>

      <Hoja
        abierta={formularioAbierto}
        titulo="Publicar un reporte"
        alto="alta"
        alCerrar={cerrarFormulario}
      >
        <FormularioReporte
          borrador={borradorReporte.borrador}
          alCambiar={borradorReporte.cambiar}
          ubicacion={ubicacion}
          alPedirElegirEnMapa={pedirElegirEnMapa}
          alUsarMiUbicacion={usarMiUbicacion}
          buscandoUbicacion={buscandoUbicacion}
          errorUbicacion={errorUbicacion}
          alCrear={alCrearReporte}
          alCerrar={cerrarFormulario}
        />
      </Hoja>
    </div>
  );
}
