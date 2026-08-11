/**
 * Enrutador mínimo (~40 líneas) en lugar de react-router (~15 KB comprimidos).
 *
 * La app solo tiene tres rutas y ninguna con parámetros, así que no hay nada
 * que justifique la librería.
 */

import { useCallback, useEffect, useState } from 'react';

export const RUTAS = {
  MAPA: '/',
  PERSONAS: '/personas',
  ADMIN: '/admin',
};

function rutaActual() {
  const camino = window.location.pathname.replace(/\/+$/, '') || '/';
  if (camino === RUTAS.PERSONAS) return RUTAS.PERSONAS;
  if (camino === RUTAS.ADMIN) return RUTAS.ADMIN;
  return RUTAS.MAPA;
}

export function useRuta() {
  const [ruta, establecerRuta] = useState(rutaActual);

  useEffect(() => {
    const alNavegar = () => establecerRuta(rutaActual());
    window.addEventListener('popstate', alNavegar);
    return () => window.removeEventListener('popstate', alNavegar);
  }, []);

  const navegar = useCallback((destino, { reemplazar = false } = {}) => {
    if (destino === rutaActual()) return;
    const metodo = reemplazar ? 'replaceState' : 'pushState';
    window.history[metodo]({}, '', destino);
    establecerRuta(destino);
    // Al cambiar de pestaña siempre se empieza por arriba.
    window.scrollTo(0, 0);
  }, []);

  return [ruta, navegar];
}
