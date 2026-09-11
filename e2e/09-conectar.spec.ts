/**
 * `e2e/09-conectar.spec.ts` — `eth_requestAccounts` y `connect.html` (H3, tarea 3.16).
 *
 * §3.3.7: «`09-conectar.spec.ts` (elección y test negativo)»; §3.3.6 `CA-RF-16`/`CA-RF-36`:
 * la ventana lista **todas** las cuentas con su **saldo real**, es **seleccionable por teclado**,
 * elegir la cuenta 2 resuelve `['<cuenta2>']` y rechazar responde `4001`. `CA-RF-17`/`CA-RF-25`:
 * un origen **no conectado** devuelve `[]` **sin abrir ninguna ventana**, y una vez conectado la
 * cuenta autorizada vuelve **sin nuevo prompt** tras recargar la dApp y tras reiniciar el SW.
 *
 * Evidencia: `09-conectar-<fecha>.png` (la ventana con cuentas y saldos) y
 * `09-conectar-<fecha>.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DAPP_ORIGIN,
  EVIDENCE_DIR,
  RUN_DATE,
  conectarDapp,
  cuentasDeLaDapp,
  distDisponible,
  esperarProvider,
  expect,
  openDapp,
  openPopup,
  readChromeStorage,
  stopServiceWorker,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Sesión persistida de la dApp de pruebas, si existe. */
const sesionDeLaDapp = async (
  background: Parameters<typeof readChromeStorage>[0],
): Promise<Record<string, unknown> | null> => {
  const almacen = await readChromeStorage(background, 'truekeate_connected_sites');
  const sitios = almacen.truekeate_connected_sites as Record<string, Record<string, unknown>> | undefined;
  return sitios?.[DAPP_ORIGIN] ?? null;
};

test.describe('09 · Conexión de la dApp: test negativo, elección y sesión de 24 h', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test.beforeEach(async ({ background }) => {
    await seedWallet(background);
  });

  test('un origen NO conectado devuelve [] y NO abre ninguna ventana (sin prompt implícito)', async ({
    context,
    page,
    background,
  }) => {
    await openDapp(page);
    await esperarProvider(page);

    const ventanasAntes = context.pages().length;
    const cuentas = await cuentasDeLaDapp(page);

    expect(cuentas, 'un origen sin sesión debe recibir []').toEqual([]);
    // La respuesta de `eth_accounts` llega DESPUÉS de cualquier apertura de ventana: si el SW
    // hubiera abierto `connect.html`, la página ya estaría contada aquí.
    expect(context.pages().length, 'eth_accounts abrió una ventana').toBe(ventanasAntes);
    expect(await sesionDeLaDapp(background), 'eth_accounts no puede crear sesión').toBeNull();

    // Y el test negativo se mantiene tras varias consultas seguidas del mismo origen.
    for (let intento = 0; intento < 3; intento += 1) {
      expect(await cuentasDeLaDapp(page)).toEqual([]);
    }
    expect(context.pages().length).toBe(ventanasAntes);
  });

  test('elegir la cuenta 2 resuelve [cuenta2], persiste 24 h y no vuelve a pedir tras recargar ni tras reiniciar el SW', async ({
    context,
    extensionId,
    page,
    background,
  }) => {
    await openDapp(page);
    await esperarProvider(page);

    // --- La ventana lista TODAS las cuentas con su SALDO REAL y es navegable por teclado ---------
    const esperaVentana = context.waitForEvent('page', { timeout: 20_000 });
    await page.click('#btn-conectar');
    const ventana = await esperaVentana;
    await ventana.waitForLoadState('domcontentloaded');

    const filas = ventana.locator('.tk-connect-row');
    await expect(filas).toHaveCount(5);
    await expect(ventana.locator('.tk-connect__origin')).toHaveText(DAPP_ORIGIN);
    // El saldo se pide al nodo: la primera fila muestra un importe en ETH, no el hueco «—».
    await expect(ventana.locator('.tk-connect-row__balance').first()).toContainText('ETH', {
      timeout: 20_000,
    });
    const saldosVisibles = await ventana.locator('.tk-connect-row__balance').allTextContents();
    expect(saldosVisibles.filter((texto) => texto.includes('ETH')).length).toBeGreaterThanOrEqual(5);

    // Navegación por teclado (CA-RF-36): flecha abajo mueve la selección a la segunda cuenta.
    await filas.first().locator('input[type="radio"]').focus();
    await ventana.keyboard.press('ArrowDown');
    await expect(filas.nth(1).locator('input[type="radio"]')).toBeChecked();
    await expect(filas.nth(1)).toHaveClass(/tk-connect-row--selected/);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await ventana.screenshot({ path: join(EVIDENCE_DIR, `09-conectar-${RUN_DATE}.png`) });

    // --- Confirmar: la dApp recibe EXACTAMENTE la cuenta elegida ---------------------------------
    await ventana.getByRole('button', { name: 'Conectar' }).click();
    await expect(page.locator('#resultado-conectar')).toHaveClass(/resultado--ok/, { timeout: 20_000 });
    const cuerpo = (await page.locator('#resultado-conectar .resultado__cuerpo').textContent()) ?? '';
    expect(cuerpo).toContain(ANVIL_ADDRESSES[1]);
    expect(cuerpo).not.toContain(ANVIL_ADDRESSES[0]);
    expect(await cuentasDeLaDapp(page)).toEqual([ANVIL_ADDRESSES[1]]);

    // --- La sesión queda persistida con el TTL de 24 h renovable ---------------------------------
    const sesion = await sesionDeLaDapp(background);
    expect(sesion?.account).toBe(ANVIL_ADDRESSES[1]);
    expect(sesion?.chainId).toBe('0x7a69');
    expect((sesion?.expiresAt as number) - (sesion?.lastUsedAt as number)).toBe(86_400_000);

    // --- CA-RF-25: recargar la dApp NO vuelve a pedir conexión -----------------------------------
    const ventanasAntes = context.pages().length;
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await esperarProvider(page);
    expect(await cuentasDeLaDapp(page)).toEqual([ANVIL_ADDRESSES[1]]);
    expect(context.pages().length, 'la recarga abrió una ventana de conexión').toBe(ventanasAntes);

    // --- CA-RF-25: y con el Service Worker SUSPENDIDO tampoco (la sesión vive en el almacén) -----
    const popup = await openPopup(context, extensionId);
    const watch = await stopServiceWorker(context, extensionId, { page: popup });
    expect(watch.status()).toBe('stopped');

    const rearme = watch.waitUntilRunning();
    const trasSuspension = await cuentasDeLaDapp(page);
    await rearme;
    expect(trasSuspension).toEqual([ANVIL_ADDRESSES[1]]);
    expect(watch.status()).toBe('running');
    await watch.detach();

    // La renovación en el uso quedó escrita: `lastUsedAt` avanzó y `expiresAt` sigue a 24 h.
    const renovada = await sesionDeLaDapp(background);
    expect((renovada?.expiresAt as number) - (renovada?.lastUsedAt as number)).toBe(86_400_000);
    expect(renovada?.lastUsedAt as number).toBeGreaterThanOrEqual(sesion?.lastUsedAt as number);

    writeFileSync(
      join(EVIDENCE_DIR, `09-conectar-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'conectar: elección de la cuenta 2',
          fecha: RUN_DATE,
          origen: DAPP_ORIGIN,
          cuentasOfrecidas: saldosVisibles.length,
          saldosVisibles: saldosVisibles.map((texto) => texto.trim()),
          cuentaElegida: ANVIL_ADDRESSES[1],
          resultadoDelFlujo: cuerpo.trim(),
          ttlMs: 86_400_000,
          trasRecargar: [ANVIL_ADDRESSES[1]],
          trasReiniciarElSW: trasSuspension,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('rechazar en connect.html responde 4001 y NO persiste ninguna sesión', async ({
    page,
    background,
  }) => {
    await openDapp(page);
    await esperarProvider(page);

    const desenlace = await conectarDapp(page.context(), page, { rechazar: true });
    expect(desenlace.ok, 'el flujo debía terminar en error').toBe(false);
    expect(desenlace.resultado).toContain('Error 4001');
    expect(desenlace.resultado).toContain('Operación cancelada por el usuario.');

    expect(await sesionDeLaDapp(background), 'un rechazo no puede persistir sesión').toBeNull();
    expect(await cuentasDeLaDapp(page)).toEqual([]);
  });
});
