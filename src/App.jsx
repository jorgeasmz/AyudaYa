import { Suspense, lazy } from 'react';
import BannerOficial from './componentes/BannerOficial.jsx';
import Pestanas from './componentes/Pestanas.jsx';
import LimiteDeError from './componentes/LimiteDeError.jsx';
import { EsqueletoMapa } from './componentes/Esqueleto.jsx';
import Mensaje from './componentes/Mensaje.jsx';
import { RUTAS, useRuta } from './lib/enrutador.js';
import { estaConfigurado } from './lib/supabase.js';

// Cada vista es un trozo aparte: quien entra al mapa no descarga el panel de
// moderación, y viceversa.
const VistaMapa = lazy(() => import('./modulos/mapa/VistaMapa.jsx'));
const VistaPersonas = lazy(() => import('./modulos/personas/VistaPersonas.jsx'));
const VistaAdmin = lazy(() => import('./modulos/admin/VistaAdmin.jsx'));

export default function App() {
  const [ruta, navegar] = useRuta();

  if (!estaConfigurado) return <SinConfigurar />;

  const esAdmin = ruta === RUTAS.ADMIN;

  return (
    <LimiteDeError>
      <div className={`app ${esAdmin ? 'es-admin' : ''}`}>
        <BannerOficial />

        <main className="contenido">
          <Suspense fallback={<EsqueletoMapa mensaje="Cargando…" />}>
            {ruta === RUTAS.MAPA && <VistaMapa />}
            {ruta === RUTAS.PERSONAS && <VistaPersonas />}
            {ruta === RUTAS.ADMIN && <VistaAdmin alSalir={() => navegar(RUTAS.MAPA)} />}
          </Suspense>
        </main>

        {/* El panel de moderación no lleva navegación pública. */}
        {!esAdmin && <Pestanas ruta={ruta} alNavegar={navegar} />}
      </div>
    </LimiteDeError>
  );
}

/** Pantalla de ayuda cuando faltan las variables de entorno. */
function SinConfigurar() {
  return (
    <div className="app">
      <BannerOficial />
      <main className="contenido contenido-centrado">
        <Mensaje tipo="error">
          <strong>Falta configurar la aplicación.</strong>
          <p>
            No están definidas <code>VITE_SUPABASE_URL</code> y{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </p>
          <p>
            En local: copia <code>.env.example</code> como <code>.env</code>, pega los
            valores de tu proyecto de Supabase y reinicia <code>npm run dev</code>.
          </p>
          <p>
            En Vercel o Netlify: añádelas en las variables de entorno del proyecto y
            vuelve a desplegar (las variables <code>VITE_*</code> se incrustan al
            compilar, no al ejecutar).
          </p>
        </Mensaje>
      </main>
    </div>
  );
}
