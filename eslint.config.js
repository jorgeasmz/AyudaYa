/**
 * Configuración mínima de ESLint.
 *
 * Existe por un motivo concreto: `vite build` compila sin quejarse aunque una
 * variable no exista. Un `signal` escrito donde tocaba `señal` pasó el build,
 * se desplegó y rompió el inicio de sesión del panel en producción. `no-undef`
 * lo detecta en menos de un segundo.
 *
 * No es un linter de estilo: de eso se encarga Prettier. Aquí solo van reglas
 * que atrapan errores reales.
 */

import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Vite las sustituye al compilar.
        'import.meta': 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { react, 'react-hooks': reactHooks },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Sin esto, cada componente importado para usarse en JSX se marca
      // como no usado y el ruido tapa los avisos que sí importan.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // Detecta hooks mal usados y dependencias olvidadas, que en esta app ya
      // provocaron un bucle infinito de búsquedas.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'require-atomic-updates': 'off',
    },
  },
  {
    // El service worker corre en otro contexto global.
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules: { 'no-undef': 'error' },
  },
];
