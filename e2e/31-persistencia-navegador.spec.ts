/**
 * `e2e/31-persistencia-navegador.spec.ts` — Persistencia **al cerrar y reabrir el NAVEGADOR**
 * (Fase 4 · RF-09 / RF-10, `CA-RF-09` / `CA-RF-10`, RNF-08).
 *
 * HUECO QUE CIERRA: `05-persistencia.spec.ts` demuestra que reabrir el **popup** y suspender el
 * **Service Worker** por CDP no pierde nada, pero ninguna prueba cerraba el navegador ENTERO. Es la
 * única forma de comprobar lo que el usuario hace de verdad —cerrar Chrome y volver a abrirlo—, y
 * la única que pone a prueba el perfil persistente y no la memoria del proceso.
 *
 * METODOLOGÍA: se lanza un contexto persistente sobre un perfil NUEVO (`mkdtemp`), se siembra una
 * cartera completa, se operan los flujos, se **cierra el navegador** con `context.close()`, se
 * relanza Chromium sobre el MISMO directorio de perfil y se vuelve a leer todo. El ID de la
 * extensión NO se escribe a mano: se descubre del Service Worker en cada arranque y además se exige
 * que sea el mismo en los dos (la `key` fija del manifest da el ID estable, ADT-19).
 *
 * Evidencia: `RepoTecnico/evidencia/Fase4/31-persistencia-navegador-<fecha>.json`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Worker } from '@playwright/test';

import {
  DIST_DIR,
  archivarEvidencia,
  distDisponible,
  expect,
  getBackgroundWorker,
  getExtensionId,
  lanzarContextoPersistente,
  openPopupReady,
  readChromeStorage,
  test,
} from './fixtures/extension';
import {
  ADDRESS_KEY_TWO,
  ANVIL_ADDRESSES,
  ANVIL_MNEMONIC,
  DAPP_ORIGIN,
  KEY_TWO,
  activeSession,
  seedWallet,
  storedAccounts,
  storedImported,
  storedValue,
} from './fixtures/h2';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

/** Entrada de `truekeate_logs` sembrada antes del reinicio: debe sobrevivir (RF-32). */
const ENTRADA_SEMBRADA = {
  event: 'sw_started',
  category: 'system',
  level: 'info',
  message: 'marca de la prueba de reinicio del navegador',
  ts: 1,
  origin: 'extension',
};

test.describe('31 · Persistencia tras cerrar y reabrir el navegador (CA-RF-09 / CA-RF-10)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('cerrar Chromium y reabrirlo sobre el mismo perfil restaura cartera, cuenta activa, importadas, sesiones y registro', async () => {
    test.setTimeout(240_000);

    // Perfil NUEVO y propio de la prueba (jamás compartido, §7.4.1.b).
    const perfil = mkdtempSync(join(tmpdir(), 'tk-e2e-reinicio-'));
    let primero: BrowserContext | null = null;
    let segundo: BrowserContext | null = null;

    try {
      // ---------------------------------------------------------------------------------------
      // 1. Primer arranque del navegador: se opera sobre una cartera completa
      // ---------------------------------------------------------------------------------------
      primero = await lanzarContextoPersistente(perfil);
      const idPrimero = await getExtensionId(primero);
      const swPrimero: Worker = await getBackgroundWorker(primero);

      await seedWallet(swPrimero, {
        imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
        currentAccount: 'idx:3',
        connectedSites: activeSession(ANVIL_ADDRESSES[0]),
        logs: [ENTRADA_SEMBRADA],
      });

      const popupPrimero = await openPopupReady(primero, idPrimero);
      await expect(popupPrimero.locator('.tk-account--active .tk-account__label')).toHaveText('Cuenta 4');
      await expect(popupPrimero.locator('.tk-account')).toHaveCount(6);
      await expect(
        popupPrimero.locator('.tk-account').filter({ hasText: 'Ahorros' }).locator('.tk-account__kind'),
      ).toHaveText('importada');

      const almacenAntes = await readChromeStorage(swPrimero, null);
      expect(almacenAntes.truekeate_mnemonic).toBe(ANVIL_MNEMONIC);
      expect(almacenAntes.truekeate_current_account).toBe('idx:3');

      // ---------------------------------------------------------------------------------------
      // 2. Se CIERRA EL NAVEGADOR por completo (no el popup: el proceso entero)
      // ---------------------------------------------------------------------------------------
      await primero.close();
      primero = null;

      // ---------------------------------------------------------------------------------------
      // 3. Segundo arranque sobre el MISMO perfil
      // ---------------------------------------------------------------------------------------
      segundo = await lanzarContextoPersistente(perfil);
      const idSegundo = await getExtensionId(segundo);
      // La `key` fija del manifest hace que el ID de la extensión sea el mismo (ADT-19): sin eso,
      // `chrome.storage.local` sería el de otra extensión y la persistencia no mediría nada.
      expect(idSegundo, 'el ID de la extensión cambió entre arranques').toBe(idPrimero);

      const swSegundo: Worker = await getBackgroundWorker(segundo);
      const almacenDespues = await readChromeStorage(swSegundo, null);

      // Sin pedir la frase ni la contraseña: la cartera se restaura sola (CA-RF-09 / CA-RF-10).
      expect(almacenDespues.truekeate_mnemonic).toBe(ANVIL_MNEMONIC);
      expect(await storedAccounts(swSegundo)).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
      expect(await storedValue(swSegundo, 'truekeate_current_account')).toBe('idx:3');

      const importadas = await storedImported(swSegundo);
      expect(importadas).toHaveLength(1);
      expect(importadas[0]?.label).toBe('Ahorros');
      expect(importadas[0]?.privateKey, 'la clave privada importada no sobrevivió al reinicio').toBe(
        KEY_TWO,
      );

      // La sesión de la dApp y la red activa también se conservan (RF-25 / RF-23).
      const sesiones = (await storedValue(swSegundo, 'truekeate_connected_sites')) as Record<
        string,
        unknown
      >;
      expect(Object.keys(sesiones)).toEqual([DAPP_ORIGIN]);
      expect(await storedValue(swSegundo, 'truekeate_chain_id')).toBe('0x7a69');

      // Y el registro persistente conserva la entrada sembrada (RF-32: sobrevive al reset).
      const logs = (await storedValue(swSegundo, 'truekeate_logs')) as Array<Record<string, unknown>>;
      expect(
        logs.some((entrada) => entrada.message === ENTRADA_SEMBRADA.message),
        'la entrada de truekeate_logs no sobrevivió al reinicio del navegador',
      ).toBe(true);

      // ---------------------------------------------------------------------------------------
      // 4. Y la UI del popup, en el navegador nuevo, pinta el mismo estado
      // ---------------------------------------------------------------------------------------
      const popupSegundo = await openPopupReady(segundo, idSegundo);
      await expect(popupSegundo.locator('.tk-account--active .tk-account__label')).toHaveText('Cuenta 4');
      await expect(popupSegundo.locator('.tk-account')).toHaveCount(6);
      await expect(popupSegundo.locator('.tk-account').nth(5).locator('.tk-account__label')).toHaveText(
        'Ahorros',
      );
      // Sin prompt de contraseña y sin pedir la frase de recuperación en ningún momento.
      await expect(popupSegundo.locator('input[type="password"]')).toHaveCount(0);
      await expect(popupSegundo.locator('#import-mnemonic')).toHaveCount(0);

      archivarEvidencia('31-persistencia-navegador', {
        flujo: 'cerrar el navegador y reabrirlo sobre el mismo perfil',
        idExtensionPrimero: idPrimero,
        idExtensionSegundo: idSegundo,
        clavesPersistidas: Object.keys(almacenDespues).sort(),
        mnemonicConservado: true,
        cuentaActiva: 'idx:3',
        importadasConservadas: importadas.length,
        sesionesConservadas: Object.keys(sesiones).length,
        chainIdConservado: '0x7a69',
        entradasDeLogConservadas: logs.length,
      });
    } finally {
      if (primero !== null) await primero.close().catch(() => undefined);
      if (segundo !== null) await segundo.close().catch(() => undefined);
      rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});
