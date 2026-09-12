/**
 * `e2e/11-firmar-mensaje.spec.ts` — `personal_sign` (H4, tarea 4.18; `CA-RF-21`).
 *
 * La dApp pide firmar un texto UTF-8, la ventana única lo muestra **legible** y la firma se
 * verifica fuera del navegador con `ethers.verifyMessage` (equivalente a `personal_sign` con el
 * prefijo `\x19Ethereum Signed Message:\n<longitud>`).
 */

import { verifyMessage } from 'ethers';

import {
  DAPP_ORIGIN,
  aprobarEnLaVentana,
  archivarEvidencia,
  conectarDapp,
  distDisponible,
  esperarProvider,
  esperarResultadoDeFirma,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  openDapp,
  test,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuenta #0 de Anvil: la que autoriza la sesión de la dApp. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Texto UTF-8 que se firma (legible y con acentos: la ventana debe mostrarlo tal cual). */
const TEXTO = 'TrueKeate Wallet: autorizo esta sesión de pruebas el 11/09/2026.';

test.describe('11 · personal_sign: texto legible y firma verificable (CA-RF-21)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la ventana muestra el texto y la firma recupera la cuenta autorizada', async ({
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

    await iniciarPeticionDeFirma(dapp, 'personal_sign', [TEXTO, CUENTA_0]);

    const ventana = await esperarVentanaDeDecision(context);
    await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);
    await expect(ventana.locator('.tk-origin .tk-section__title')).toHaveText('Firma de mensaje');
    // CA-RF-21: el texto UTF-8 se muestra LEGIBLE, byte a byte igual al solicitado.
    const mensaje = ventana.locator('pre.tk-message');
    await expect(mensaje).toBeVisible();
    expect((await mensaje.textContent())?.trim()).toBe(TEXTO);
    // Y la ventana NO avisa de contenido ilegible (es texto, no bytes hex).
    await expect(ventana.locator('.tk-warning-band')).toHaveCount(0);

    await aprobarEnLaVentana(ventana);
    const resultado = await esperarResultadoDeFirma(dapp);
    expect(resultado.estado, `la dApp devolvió un error: ${JSON.stringify(resultado)}`).toBe('ok');
    const firma = String(resultado.estado === 'ok' ? resultado.valor : '');
    expect(firma).toMatch(/^0x[0-9a-fA-F]{130}$/);
    // `verifyMessage` aplica el prefijo EIP-191: el mismo camino que `personal_sign`.
    expect(verifyMessage(TEXTO, firma).toLowerCase()).toBe(CUENTA_0.toLowerCase());

    archivarEvidencia('11-firmar-mensaje', {
      flujo: 'personal_sign · texto UTF-8',
      dapp: DAPP_ORIGIN,
      texto: TEXTO,
      firma,
      firmanteRecuperado: verifyMessage(TEXTO, firma),
    });
  });
});
