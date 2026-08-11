import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { iniciarProcesadoAutomatico } from './lib/cola.js';
import './estilos.css';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/*
 * La cola de envíos pendientes se vacía sola. Se arranca aquí, fuera del árbol
 * de React, para que siga funcionando aunque quien creó el envío haya cambiado
 * de pestaña o cerrado el formulario.
 */
iniciarProcesadoAutomatico();

/*
 * Service worker: solo en producción y después de `load`, para no competir por
 * ancho de banda con el primer renderizado, que es lo que le importa a quien
 * abre la página con una barra de señal.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual, solo que sin respaldo offline.
    });
  });
}
