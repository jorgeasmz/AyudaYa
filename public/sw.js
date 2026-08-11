/*
 * Service worker mínimo, escrito a mano (sin Workbox: son ~15 KB extra que aquí
 * no se justifican).
 *
 * Objetivo único: que abrir la app con la red saturada o caída muestre la
 * interfaz en lugar de un error del navegador.
 *
 * Estrategias:
 *   - Navegaciones (HTML): red primero con 4 s de tope, caché de respaldo.
 *     Así una versión nueva llega enseguida, pero sin red igual abre.
 *   - /assets/* : caché primero. Vite les pone hash en el nombre, así que una
 *     URL cacheada nunca puede quedar obsoleta.
 *   - Teselas del mapa y llamadas a Supabase: NO se tocan (datos vivos; una
 *     tesela vieja o un reporte viejo confunden más de lo que ayudan).
 */

const VERSION = 'v1';
const CACHE_CASCARA = `cascara-${VERSION}`;
const CACHE_ESTATICOS = `estaticos-${VERSION}`;
const TOPE_RED_MS = 4000;

const PRECARGA = ['/', '/icono.svg', '/manifest.webmanifest'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_CASCARA)
      .then((cache) => cache.addAll(PRECARGA))
      .catch(() => undefined) // sin red durante la instalación: no es fatal
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((c) => c !== CACHE_CASCARA && c !== CACHE_ESTATICOS)
            .map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

function conTope(promesa, ms) {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error('tiempo agotado')), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      (e) => {
        clearTimeout(t);
        rechazar(e);
      }
    );
  });
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  let url;
  try {
    url = new URL(peticion.url);
  } catch {
    return;
  }

  // Todo lo externo (teselas, Supabase) va directo a la red.
  if (url.origin !== self.location.origin) return;

  // --- Navegaciones: red primero, caché de respaldo -----------------------
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      conTope(fetch(peticion), TOPE_RED_MS)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_CASCARA).then((c) => c.put('/', copia));
          return respuesta;
        })
        .catch(() =>
          caches
            .match('/', { ignoreSearch: true })
            .then(
              (r) =>
                r ||
                new Response(
                  '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
                    '<body style="font-family:system-ui;padding:24px;text-align:center">' +
                    '<h1>Sin conexión</h1><p>No pudimos cargar la aplicación. ' +
                    'Revisa tu señal e intenta de nuevo.</p>' +
                    '<p>Emergencias: <strong>123</strong></p></body>',
                  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                )
            )
        )
    );
    return;
  }

  // --- Recursos con hash en el nombre: caché primero ----------------------
  if (url.pathname.startsWith('/assets/') || url.pathname === '/icono.svg') {
    evento.respondWith(
      caches.match(peticion).then(
        (enCache) =>
          enCache ||
          fetch(peticion).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(CACHE_ESTATICOS).then((c) => c.put(peticion, copia));
            }
            return respuesta;
          })
      )
    );
  }
});
