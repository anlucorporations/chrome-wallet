/**
 * Configuracion de Vitest (RNF-17 / `documento_tecnico.md` §7.4 y §7.5.2).
 *
 * El bloque `test` vive en `vite.config.ts` (§7.5.2, literal) y ademas §2.4 lista este fichero,
 * asi que aqui NO se duplican valores: se reutiliza el mismo objeto exportado, de modo que
 * `npm run test` y `npm run coverage` corren exactamente la configuracion documentada.
 *
 * Nota: cuando existe `vitest.config.ts`, Vitest no lee `vite.config.ts`, por lo que el plugin de
 * React se declara tambien aqui (los specs pueden importar modulos `.tsx` de la UI).
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { testConfig } from './vite.config';

export default defineConfig({
  plugins: [react()],
  test: testConfig,
});
