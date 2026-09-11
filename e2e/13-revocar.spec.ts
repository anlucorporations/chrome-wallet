/**
 * `e2e/13-revocar.spec.ts` — Revocación desde el popup (H3, tarea 3.16).
 *
 * §3.3.7: «`13-revocar.spec.ts`»; §3.3.6 `CA-RF-26`: revocar un origen lo elimina de
 * `truekeate_connected_sites`, la dApp recibe `accountsChanged []` y su `eth_accounts` pasa a `[]`,
 * **sin crear ninguna entrada en la cola de aprobaciones** (el popup es contexto de la extensión).
 *
 * La revocación se ejecuta por la UI real («Sitios» → origen → Revocar permiso → confirmación) y
 * con el origen escrito en MAYÚSCULAS y con barra final: la clave canónica se normaliza (§2.7).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DAPP_ORIGIN,
  CLAVES_VOLATILES,
  EVIDENCE_DIR,
  RUN_DATE,
  conectarDapp,
  cuentasDeLaDapp,
  distDisponible,
  esperarProvider,
  expect,
  leerEventosDeLaDapp,
  llamarDesdeLaExtension,
  openDapp,
  openPopupReady,
  readChromeStorage,
  registrarEventosDeLaDapp,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Mapa persistido `truekeate_connected_sites`. */
const sitiosPersistidos = async (
  background: Parameters<typeof readChromeStorage>[0],
): Promise<Record<string, unknown>> => {
  const almacen = await readChromeStorage(background, 'truekeate_connected_sites');
  return (almacen.truekeate_connected_sites ?? {}) as Record<string, unknown>;
};

test.describe('13 · Revocación de la sesión de una dApp desde el popup', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test.beforeEach(async ({ background }) => {
    await seedWallet(background);
  });

  test('revocar elimina la sesión, emite accountsChanged [] y NO crea cola de aprobaciones', async ({
    context,
    extensionId,
    page,
    background,
  }) => {
    await openDapp(page);
    await esperarProvider(page);
    expect(await registrarEventosDeLaDapp(page)).toBe(5);

    const desenlace = await conectarDapp(context, page);
    expect(desenlace.ok, `el flujo de conexión falló: ${desenlace.resultado}`).toBe(true);
    expect(await sitiosPersistidos(background)).toHaveProperty(DAPP_ORIGIN);

    // --- Revocación por la UI del popup ----------------------------------------------------------
    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Sitios' }).click();

    // Origen deliberadamente irregular: mayúsculas y barra final (se normaliza a la clave §2.7).
    await popup.locator('#sitios-origen').fill('HTTP://LOCALHOST:5174/');
    await popup.getByRole('button', { name: 'Revocar permiso' }).click();

    const dialogo = popup.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toHaveAttribute('aria-modal', 'true');
    await dialogo.getByRole('button', { name: 'Revocar permiso' }).click();

    await expect(popup.getByText(/Permiso revocado para http:\/\/localhost:5174/)).toBeVisible();

    // --- Efectos en el almacén y en la dApp ------------------------------------------------------
    const sitios = await sitiosPersistidos(background);
    expect(Object.keys(sitios), 'la sesión revocada sigue en truekeate_connected_sites').toEqual([]);

    await expect
      .poll(
        async () =>
          (await leerEventosDeLaDapp(page)).filter((evento) => evento.eventName === 'accountsChanged')
            .length,
        { message: 'la dApp no recibió accountsChanged', timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(1);
    const eventos = (await leerEventosDeLaDapp(page)).filter(
      (evento) => evento.eventName === 'accountsChanged',
    );
    expect(JSON.stringify(eventos[eventos.length - 1]?.data)).toBe('[]');
    expect(await cuentasDeLaDapp(page)).toEqual([]);

    // --- El popup NO crea ninguna entrada en la cola (CA-RF-26) -----------------------------------
    const cola = await readChromeStorage(background, 'truekeate_pending_requests');
    expect(cola.truekeate_pending_requests ?? {}).toEqual({});

    // --- Idempotencia: la segunda revocación no falla, no emite y no borra nada más ---------------
    const antes = (await leerEventosDeLaDapp(page)).filter(
      (evento) => evento.eventName === 'accountsChanged',
    ).length;
    const segunda = (await llamarDesdeLaExtension(popup, 'wallet_revokePermissions', [
      { origin: DAPP_ORIGIN },
    ])) as { result?: { revoked?: boolean } };
    expect(segunda.result?.revoked, 'revocar dos veces no puede volver a revocar').toBe(false);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1_000);
    });
    const despues = (await leerEventosDeLaDapp(page)).filter(
      (evento) => evento.eventName === 'accountsChanged',
    ).length;
    expect(despues, 'una revocación sin efecto no debe emitir otro evento').toBe(antes);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `13-revocar-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'revocar permiso desde el popup',
          fecha: RUN_DATE,
          origenNormalizado: DAPP_ORIGIN,
          cuentaRevocada: ANVIL_ADDRESSES[0],
          sesionesTrasRevocar: Object.keys(sitios),
          eventosAccountsChanged: eventos.map((evento) => evento.data),
          cuentasDeLaDappTrasRevocar: await cuentasDeLaDapp(page),
          colaDeAprobaciones: cola.truekeate_pending_requests ?? {},
          revocacionIdempotente: segunda.result ?? null,
          clavesVolatilesExcluidas: CLAVES_VOLATILES,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });
});
