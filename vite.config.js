import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Android de gama baja: navegadores Chrome/WebView antiguos siguen siendo comunes.
    target: 'es2018',
    cssCodeSplit: true,
    // Los mapas de origen inflan el despliegue y no aportan nada en producción.
    sourcemap: false,
    // Avisa si algún trozo se pasa de tamaño: el objetivo es entrar rápido en 3G.
    chunkSizeWarningLimit: 220,
    rollupOptions: {
      output: {
        // Trozos separados para que el arranque no espere ni al mapa ni a la
        // librería de datos: la cáscara de la página pinta primero.
        manualChunks(id) {
          if (id.includes('node_modules/leaflet')) return 'leaflet';
          if (id.includes('node_modules/@supabase')) return 'tiempo-real';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },

  server: {
    port: 5173,
    host: true,
  },
});
