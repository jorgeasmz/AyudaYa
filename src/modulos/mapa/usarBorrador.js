/**
 * Borrador del formulario de reporte.
 *
 * Vive fuera del formulario por dos razones, y las dos duelen en la práctica:
 *
 *   1. Al pulsar "Señalar en el mapa" el formulario se desmonta para dejar ver
 *      el mapa. Si el estado estuviera dentro del componente, volver al
 *      formulario devolvería todos los campos en blanco.
 *
 *   2. En un Android de gama baja, cambiar a la cámara o a otra app hace que el
 *      navegador descarte la pestaña. Guardar el borrador en el dispositivo
 *      significa que al volver sigue ahí, con la red caída o sin ella.
 */

import { useCallback, useState } from 'react';
import { leer, escribir, borrar } from '../../lib/almacenamiento.js';

const CLAVE = 'borrador.reporte';

const VACIO = {
  tipo: '',
  titulo: '',
  descripcion: '',
  ciudad: '',
  contacto: '',
};

function inicial() {
  const guardado = leer(CLAVE);
  if (!guardado || typeof guardado !== 'object') return VACIO;
  // Solo campos conocidos: si en el futuro cambia la forma, un borrador viejo
  // no debe inyectar claves inesperadas.
  return {
    tipo: String(guardado.tipo || ''),
    titulo: String(guardado.titulo || ''),
    descripcion: String(guardado.descripcion || ''),
    ciudad: String(guardado.ciudad || ''),
    contacto: String(guardado.contacto || ''),
  };
}

export function useBorradorReporte() {
  const [borrador, establecerBorrador] = useState(inicial);

  const cambiar = useCallback((campo, valor) => {
    establecerBorrador((previo) => {
      const siguiente = { ...previo, [campo]: valor };
      escribir(CLAVE, siguiente);
      return siguiente;
    });
  }, []);

  const limpiar = useCallback(() => {
    borrar(CLAVE);
    establecerBorrador(VACIO);
  }, []);

  /** Rellena la ciudad si aún está vacía (al elegirla en la barra del mapa). */
  const sugerirCiudad = useCallback((nombre) => {
    if (!nombre) return;
    establecerBorrador((previo) => {
      if (previo.ciudad) return previo;
      const siguiente = { ...previo, ciudad: nombre };
      escribir(CLAVE, siguiente);
      return siguiente;
    });
  }, []);

  /** ¿Hay algo escrito que merezca la pena conservar? */
  const tieneContenido = Boolean(
    borrador.tipo || borrador.titulo.trim() || borrador.descripcion.trim()
  );

  return { borrador, cambiar, limpiar, sugerirCiudad, tieneContenido };
}
