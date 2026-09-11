// eslint.config.js — Configuracion plana de ESLint 9 (documento_tecnico.md §2.4).
//
// Objetivo: cubrir TypeScript + React sin reglas que bloqueen el build (la puerta de calidad del
// proyecto son `npm run typecheck`, `npm run test` y `npm run lint:prohibited`). Por eso los
// hallazgos de estilo son avisos y solo las reglas de correccion son errores.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Artefactos, dependencias y documentacion: no se lintan.
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'RepoTecnico/**',
      'TrueKeate/**',
      'contracts/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Contextos de la extension y tooling.
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    rules: {
      // TypeScript ya resuelve los identificadores y los tipos: `no-undef` solo da falsos positivos.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Avisos (nunca errores) para no bloquear el pipeline.
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
      'no-console': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    // Reglas de React solo en los modulos con JSX.
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Ficheros de script Node (MJS): globals de Node y sin exigir tipos.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
