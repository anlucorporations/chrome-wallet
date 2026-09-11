/**
 * `e2e/06-reset.spec.ts` — Reset destructivo con la cola vacía y bloqueado (tarea 2.17).
 *
 * Demuestra `CA-RF-11` (parte 1) y el orden de comprobación de §3.9 (R-09b / DEC-46):
 *   · con la cola `pending` vacía y sin transacción en vuelo, el diálogo **enumera** las cuentas
 *     importadas que se pierden y el reset borra cartera y sesiones **conservando**
 *     `truekeate_logs` (RF-32);
 *   · con la cola no vacía, el reset se **bloquea** con `-32000` y no toca el almacén.
 *
 * Deja la evidencia JSON `H2/reset-<fecha>.json` (§3.2.7).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADDRESS_KEY_TWO,
  ANVIL_ADDRESSES,
  KEY_TWO,
  activeSession,
  seedWallet,
  storedValue,
} from './fixtures/h2';
import {
  DIST_DIR,
  EVIDENCE_DIR,
  RUN_DATE,
  distDisponible,
  expect,
  openPopupReady,
  readChromeStorage,
  test,
} from './fixtures/extension';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

/** Entrada de log que debe sobrevivir al reset (RF-32). */
const LOG_SURVIVOR = {
  ts: 1,
  event: 'sw_started',
  category: 'system',
  level: 'info',
  origin: 'extension',
  message: 'Service Worker arrancado',
};

/** Abre la pestaña «Seguridad». */
const abrirSeguridad = async (page: Awaited<ReturnType<typeof openPopupReady>>): Promise<void> => {
  await page.getByRole('tab', { name: 'Seguridad' }).click();
  await expect(page.getByRole('heading', { name: 'Reset de la cartera' })).toBeVisible();
};

test.describe('06 · Reset de la cartera', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el reset enumera las importadas, borra cartera y sesiones y CONSERVA los logs (CA-RF-11 / RF-32)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
      connectedSites: activeSession(ANVIL_ADDRESSES[0]),
      logs: [LOG_SURVIVOR],
    });
    const page = await openPopupReady(context, extensionId);
    await abrirSeguridad(page);

    await page.getByRole('button', { name: 'Reset wallet' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Reset wallet' });
    await expect(dialogo).toBeVisible();
    // El diálogo destructivo ENUMERA la importada que se perderá, con su etiqueta y su dirección.
    await expect(dialogo).toContainText('Estas cuentas importadas se perderán y no se pueden volver a derivar');
    await expect(dialogo.locator('.tk-list__item')).toHaveCount(1);
    await expect(dialogo.locator('.tk-list__item')).toContainText('Ahorros');
    await expect(dialogo.locator('.tk-list__item')).toContainText(ADDRESS_KEY_TWO);
    // Y avisa de que el registro de actividad se conserva.
    await expect(dialogo).toContainText('El registro de actividad (`truekeate_logs`) se conserva');

    await dialogo.getByRole('button', { name: 'Resetear cartera' }).click();
    await expect(page.locator('.tk-status--success')).toContainText('Cartera reseteada');
    // El popup vuelve al inicio (estado vacío).
    await expect(page.locator('.tk-empty__title')).toHaveText('Sin cartera');
    await expect(page.locator('.tk-account')).toHaveCount(0);

    // Almacén: la frase, las cuentas y las sesiones desaparecen; los logs SOBREVIVEN.
    await expect.poll(async () => storedValue(background, 'truekeate_mnemonic')).toBeUndefined();
    expect(await storedValue(background, 'truekeate_accounts')).toBeUndefined();
    expect(await storedValue(background, 'truekeate_imported_accounts')).toBeUndefined();
    expect(await storedValue(background, 'truekeate_connected_sites')).toBeUndefined();
    const logs = await storedValue(background, 'truekeate_logs');
    expect(Array.isArray(logs)).toBe(true);
    expect((logs as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logs)).toContain('sw_started');

    const almacen = await readChromeStorage(background, null);
    expect(JSON.stringify(almacen)).not.toContain(KEY_TWO);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `reset-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'reset con la cola vacía',
          fecha: RUN_DATE,
          clavesTrasElReset: Object.keys(almacen).sort(),
          logsConservados: (logs as unknown[]).length,
          importadasEnumeradasEnElDialogo: 1,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('con una solicitud `pending` el reset se bloquea con `-32000` y no toca el almacén (DEC-46)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
      logs: [LOG_SURVIVOR],
      pendingRequests: {
        'id-1': { status: 'pending', method: 'eth_sendTransaction' },
        'id-2': { status: 'approved', method: 'personal_sign' },
      },
    });
    const page = await openPopupReady(context, extensionId);
    await abrirSeguridad(page);
    await page.getByRole('button', { name: 'Reset wallet' }).click();

    // La guarda bloquea: mensaje de §4.3 con el número EXACTO de pendientes y sin diálogo.
    await expect(page.locator('.tk-status__code').first()).toHaveText('-32000');
    await expect(page.locator('.tk-status__message').first()).toContainText(
      'quedan 1 solicitudes pendientes',
    );
    await expect(page.getByRole('dialog', { name: 'Reset wallet' })).toHaveCount(0);

    // El estado sigue intacto: cartera, importada y logs.
    expect(await storedValue(background, 'truekeate_mnemonic')).toBeDefined();
    expect(await storedValue(background, 'truekeate_accounts')).toBeDefined();
    expect((await readChromeStorage(background, 'truekeate_imported_accounts'))).toBeTruthy();
    await expect(page.locator('.tk-account')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Cuentas' }).click();
    await expect(page.locator('.tk-account')).toHaveCount(6);
  });

  test('con una transacción en vuelo vigente el reset también se bloquea (DEC-46)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, {
      inflightTx: { [ANVIL_ADDRESSES[0]]: { txHash: '0xabc', expiresAt: Date.now() + 180_000 } },
    });
    const page = await openPopupReady(context, extensionId);
    await abrirSeguridad(page);
    await page.getByRole('button', { name: 'Reset wallet' }).click();

    await expect(page.locator('.tk-status__code').first()).toHaveText('-32000');
    await expect(page.locator('.tk-status__message').first()).toContainText('No se puede resetear la cartera');
    await expect(page.getByRole('dialog', { name: 'Reset wallet' })).toHaveCount(0);
    expect(await storedValue(background, 'truekeate_mnemonic')).toBeDefined();
  });
});
