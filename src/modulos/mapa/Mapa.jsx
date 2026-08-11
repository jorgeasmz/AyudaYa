/**
 * Envoltorio de Leaflet.
 *
 * Se usa Leaflet directamente en lugar de `react-leaflet` (≈12 KB extra) porque
 * lo único que necesitamos es sincronizar una lista de marcadores, y eso son
 * treinta líneas de diff manual.
 *
 * Este archivo se carga con `lazy()`: leaflet y su CSS no se descargan hasta
 * que la vista del mapa está en pantalla.
 */

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tipoDe, VISTA_INICIAL } from '../../lib/constantes.js';
import { estadoEfectivo } from '../../lib/formato.js';

/**
 * Icono como `divIcon` con un emoji: cero peticiones de imagen frente a las
 * dos que gasta el marcador por defecto de Leaflet (icono + sombra).
 */
function crearIcono(tipo, verificado, caducado, pendiente) {
  const info = tipoDe(tipo);
  const clases = [
    'marcador',
    verificado ? 'es-verificado' : '',
    caducado ? 'es-caducado' : '',
    pendiente ? 'es-pendiente' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sello = pendiente
    ? '<span class="marcador-sello es-espera">⏳</span>'
    : verificado
      ? '<span class="marcador-sello">✓</span>'
      : '';

  return L.divIcon({
    className: 'marcador-envoltorio',
    html:
      `<span class="${clases}" style="--color-tipo:${info.color}">` +
      `<span class="marcador-emoji">${info.emoji}</span>${sello}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });
}

export default function Mapa({
  reportes,
  alSeleccionar,
  seleccionadoId,
  modoUbicacion,
  ubicacionElegida,
  alElegirUbicacion,
  vistaSolicitada,
}) {
  const refContenedor = useRef(null);
  const refMapa = useRef(null);
  const refMarcadores = useRef(new Map());
  const refCallbacks = useRef({ alSeleccionar, alElegirUbicacion });

  // Los callbacks se leen desde una ref para no tener que volver a registrar
  // los manejadores de Leaflet en cada render.
  refCallbacks.current = { alSeleccionar, alElegirUbicacion };

  // --- Crear el mapa una sola vez ------------------------------------------
  useEffect(() => {
    if (refMapa.current || !refContenedor.current) return undefined;

    const mapa = L.map(refContenedor.current, {
      center: VISTA_INICIAL.centro,
      zoom: VISTA_INICIAL.zoom,
      // Los controles se recolocan abajo: el botón flotante de "Reportar" ocupa
      // la esquina inferior derecha, que es donde Leaflet los pone por defecto.
      zoomControl: false,
      attributionControl: false,
      // En gama baja el zoom animado va a tirones; sin él se siente más rápido.
      zoomAnimation: false,
      preferCanvas: true,
      tap: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 5,
      // Menos teselas en vuelo = menos cola en una red saturada.
      updateWhenIdle: true,
      keepBuffer: 1,
      crossOrigin: true,
      attribution:
        '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(mapa);

    // Reparto de esquinas para que nada se pise en una pantalla de teléfono:
    //   arriba-derecha  -> zoom (el pulgar llega, y no tapa el mapa)
    //   abajo-izquierda -> atribución de OpenStreetMap (obligatoria por licencia)
    //   abajo-derecha   -> botón flotante de "Reportar" (fuera de este archivo)
    L.control.zoom({ position: 'topright' }).addTo(mapa);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(mapa);

    mapa.on('click', (e) => {
      refCallbacks.current.alElegirUbicacion?.([e.latlng.lat, e.latlng.lng]);
    });

    refMapa.current = mapa;

    // Leaflet mide mal el contenedor si arranca mientras se está animando.
    const t = setTimeout(() => mapa.invalidateSize(), 120);

    return () => {
      clearTimeout(t);
      mapa.remove();
      refMapa.current = null;
      refMarcadores.current.clear();
    };
  }, []);

  // --- Sincronizar marcadores con la lista de reportes ---------------------
  const firma = useMemo(
    () =>
      reportes
        .map(
          (r) =>
            `${r.id}:${r.tipo}:${r.verificado ? 1 : 0}:${r.estado}:` +
            `${r.actualizado_en}:${r._pendiente ? 1 : 0}`
        )
        .join('|'),
    [reportes]
  );

  useEffect(() => {
    const mapa = refMapa.current;
    if (!mapa) return;

    const marcadores = refMarcadores.current;
    const vistos = new Set();

    reportes.forEach((reporte) => {
      vistos.add(reporte.id);
      const caducado = estadoEfectivo(reporte) === 'caducado';
      const icono = crearIcono(
        reporte.tipo,
        reporte.verificado,
        caducado,
        reporte._pendiente
      );
      const existente = marcadores.get(reporte.id);

      if (existente) {
        const [latPrevia, lngPrevia] = [
          existente.getLatLng().lat,
          existente.getLatLng().lng,
        ];
        if (latPrevia !== reporte.lat || lngPrevia !== reporte.lng) {
          existente.setLatLng([reporte.lat, reporte.lng]);
        }
        existente.setIcon(icono);
        return;
      }

      const marcador = L.marker([reporte.lat, reporte.lng], {
        icon: icono,
        // El título se muestra como tooltip nativo; el navegador lo escapa.
        title: reporte.titulo,
        riseOnHover: true,
        keyboard: true,
        alt: `${tipoDe(reporte.tipo).etiqueta}: ${reporte.titulo}`,
      });

      // Sin popups de Leaflet: al tocar se abre una hoja renderizada por React.
      // Así el contenido del usuario nunca se inyecta como HTML: React lo
      // escapa por nosotros y desaparece toda una clase de XSS.
      marcador.on('click', () => refCallbacks.current.alSeleccionar?.(reporte.id));

      marcador.addTo(mapa);
      marcadores.set(reporte.id, marcador);
    });

    // Retira los que ya no están (borrados o pasados de denuncias).
    marcadores.forEach((marcador, id) => {
      if (!vistos.has(id)) {
        mapa.removeLayer(marcador);
        marcadores.delete(id);
      }
    });
    // `firma` resume los cambios relevantes; `reportes` cambia de identidad en
    // cada render aunque el contenido sea idéntico.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  // --- Resaltar el marcador seleccionado -----------------------------------
  useEffect(() => {
    refMarcadores.current.forEach((marcador, id) => {
      const el = marcador.getElement();
      if (el) el.classList.toggle('es-seleccionado', id === seleccionadoId);
    });
  }, [seleccionadoId, firma]);

  // --- Encuadre solicitado desde fuera (elegir ciudad, "mi ubicación") -----
  useEffect(() => {
    if (!vistaSolicitada || !refMapa.current) return;
    const { centro, zoom } = vistaSolicitada;
    if (!centro) return;
    refMapa.current.setView(centro, zoom ?? refMapa.current.getZoom());
  }, [vistaSolicitada]);

  // --- Modo "elegir ubicación": pin arrastrable + cruz central -------------
  const refPin = useRef(null);

  useEffect(() => {
    const mapa = refMapa.current;
    if (!mapa) return undefined;

    if (!modoUbicacion) {
      if (refPin.current) {
        mapa.removeLayer(refPin.current);
        refPin.current = null;
      }
      return undefined;
    }

    const posicion = ubicacionElegida || [mapa.getCenter().lat, mapa.getCenter().lng];

    if (!refPin.current) {
      refPin.current = L.marker(posicion, {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
          className: 'marcador-envoltorio',
          html: '<span class="pin-ubicacion">📍</span>',
          iconSize: [40, 40],
          iconAnchor: [20, 36],
        }),
      }).addTo(mapa);

      refPin.current.on('dragend', () => {
        const p = refPin.current.getLatLng();
        refCallbacks.current.alElegirUbicacion?.([p.lat, p.lng]);
      });
    } else {
      refPin.current.setLatLng(posicion);
    }

    return undefined;
  }, [modoUbicacion, ubicacionElegida]);

  return (
    <div
      className="mapa"
      ref={refContenedor}
      role="application"
      aria-label="Mapa de necesidades y recursos"
    />
  );
}
