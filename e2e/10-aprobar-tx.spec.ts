/**
 * `e2e/10-aprobar-tx.spec.ts` — Aprobación de una transacción con foco, origen y ventana única
 * (H4, tarea 4.18; §3.4.7). Criterios: `CA-RF-19` (vista previa decodificada) y `CA-RF-35`
 * (como máximo UNA `notification.html`, con su contador).
 *
 * Evidencia: `RepoTecnico/evidencia/H4/10-aprobar-tx-<fecha>.png`.
 */

import { join } from 'node:path';

import {
  DAPP_ORIGIN,
  EVIDENCE_DIR,
  aprobarEnLaVentana,
  conectarDapp,
  distDisponible,
  esperarProvider,
  esperarResultadoDeFirma,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  leerContadorDeLaVentana,
  openDapp,
  test,
  ventanasDeDecision,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuenta #0 de Anvil (la de la sesión de la dApp). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Destino: un contrato ficticio (la tabla local de selectores de M66 decodifica el calldata). */
const CONTRATO_TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

/** `approve(address,uint256)` con la allowance MÁXIMA (`2^256-1`) → aviso de riesgo (H-11b). */
const APPROVE_ILIMITADO = `0x095ea7b3${'0'.repeat(24)}${'1'.repeat(40)}${'f'.repeat(64)}`;

const MOTIVO_SIN_DIST_ALT = MOTIVO_SIN_DIST;

test.describe('10 · aprobación de una transacción: foco, origen y ventana única (CA-RF-19/35)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST_ALT);

  test('la vista previa decodifica el calldata, la ventana es única y está enfocada', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    const conexion = await conectarDapp(context, dapp, { indice: 0 });
    expect(conexion.ok, `la conexión de la dApp falló: ${conexion.resultado}`).toBe(true);

    await iniciarPeticionDeFirma(dapp, 'eth_sendTransaction', [
      { from: CUENTA_0, to: CONTRATO_TOKEN, value: '0x0', data: APPROVE_ILIMITADO },
    ]);

    const ventana = await esperarVentanaDeDecision(context);

    // --- CA-RF-35: UNA sola ventana, enfocada, con el origen y el contador visibles -------------
    expect(ventanasDeDecision(context)).toHaveLength(1);
    await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);
    expect(await leerContadorDeLaVentana(ventana)).toBe('1 solicitud en espera');
    await expect(ventana.locator('.tk-origin .tk-section__title')).toHaveText('Envío de transacción');
    expect(await ventana.evaluate(() => document.hasFocus())).toBe(true);

    // Solo dos acciones posibles: aprobar o rechazar (la ventana NO firma).
    const acciones = ventana.locator('.tk-approval__actions button');
    await expect(acciones).toHaveCount(2);
    await expect(acciones.nth(0)).toHaveText('Rechazar');
    await expect(acciones.nth(1)).toHaveText('Aprobar');

    // --- CA-RF-19: la vista previa muestra selector, función y parámetros decodificados ---------
    const resumen = ventana.locator('.tk-summary');
    await expect(resumen.filter({ hasText: 'Destino' }).first()).toBeVisible();
    for (const etiqueta of ['Cuenta', 'Destino', 'Valor', 'Red', 'Comisión estimada']) {
      await expect(ventana.locator('.tk-summary__label', { hasText: etiqueta }).first()).toBeVisible();
    }
    await expect(ventana.getByText('2 (EIP-1559)', { exact: false })).toBeVisible();
    const llamada = ventana.locator('.tk-section', { hasText: 'Llamada a contrato' });
    await expect(llamada).toBeVisible();
    await expect(llamada.locator('.tk-summary__label', { hasText: 'Selector' })).toBeVisible();
    await expect(llamada.getByText('0x095ea7b3', { exact: false })).toBeVisible();
    await expect(llamada.locator('.tk-summary__label', { hasText: 'Función' })).toBeVisible();
    await expect(llamada.getByText('approve', { exact: false }).first()).toBeVisible();
    await expect(llamada.locator('.tk-summary__label', { hasText: 'Datos' })).toBeVisible();

    // El aviso de allowance ilimitada es visible antes de decidir (RNF-05).
    await expect(ventana.locator('.tk-risk')).toContainText('ilimitada');

    await ventana.screenshot({ path: join(EVIDENCE_DIR, `10-aprobar-tx-${new Date().toISOString().slice(0, 10)}.png`) });

    await aprobarEnLaVentana(ventana);
    const resultado = await esperarResultadoDeFirma(dapp);
    expect(resultado.estado, `la dApp devolvió un error: ${JSON.stringify(resultado)}`).toBe('ok');
    expect(String(resultado.estado === 'ok' ? resultado.valor : '')).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Tras aprobar, la MISMA ventana pasa a la siguiente o se cierra: nunca quedan dos.
    await expect.poll(() => ventanasDeDecision(context).length, { timeout: 15_000 }).toBeLessThanOrEqual(1);
  });
});
