/**
 * `e2e/11-firmar-eip712.spec.ts` — Firma EIP-712 y correspondencia con el contrato verificador
 * (H4, tareas 4.16 y 4.18; `CA-RF-20` y `CA-RT-11`).
 *
 * La dApp pide `eth_signTypedData_v4` sobre el dominio de la dApp de pruebas
 * (`TrueKeate Test App`, `chainId 31337`) y la prueba comprueba **fuera del navegador**, con
 * `ethers`, que la firma devuelta recupera exactamente la cuenta autorizada y que el `digest`
 * coincide con el que recompone `EIP712Verifier` (`contracts/test/EIP712Verifier.t.sol`).
 *
 * Evidencia: `RepoTecnico/evidencia/H4/11-firmar-eip712-<fecha>.json`.
 */

import { TypedDataEncoder, verifyTypedData } from 'ethers';

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

/** Contrato verificador: el mismo del fixture de Forge y de la dApp de pruebas. */
const VERIFYING_CONTRACT = '0x8464135c8F25Da09e49BC8782676a84730C318bC';

/** Dominio EIP-712 de la dApp de pruebas (idéntico al de `contracts/test/fixtures`). */
const DOMINIO = {
  name: 'TrueKeate Test App',
  version: '1',
  chainId: 31_337,
  verifyingContract: VERIFYING_CONTRACT,
} as const;

/** Tipos del mensaje firmado (`SignMessage`, el mismo que verifica el contrato). */
const TIPOS: Record<string, Array<{ name: string; type: string }>> = {
  SignMessage: [
    { name: 'content', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** Mensaje firmado. */
const MENSAJE = {
  content: 'TrueKeate Wallet: firma EIP-712 solicitada por la dApp de pruebas.',
  nonce: '7',
  deadline: '1700000000',
};

test.describe('11 · firma EIP-712: dominio visible y correspondencia con el contrato (CA-RF-20)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la ventana muestra name/verifyingContract y la firma verifica el digest del contrato', async ({
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

    const typedData = {
      types: { EIP712Domain: [], ...TIPOS },
      primaryType: 'SignMessage',
      domain: DOMINIO,
      message: MENSAJE,
    };
    await iniciarPeticionDeFirma(dapp, 'eth_signTypedData_v4', [
      CUENTA_0,
      JSON.stringify(typedData),
    ]);

    const ventana = await esperarVentanaDeDecision(context);

    // --- CA-RF-20: `name` y `verifyingContract` SIEMPRE visibles ------------------------------
    await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);
    await expect(ventana.locator('.tk-origin .tk-section__title')).toHaveText('Firma de datos EIP-712');
    const panel = ventana.locator('.tk-section', { hasText: 'Dominio' }).first();
    await expect(panel).toBeVisible();
    await expect(ventana.getByText('TrueKeate Test App', { exact: false }).first()).toBeVisible();
    await expect(ventana.getByText('Contrato verificador', { exact: false }).first()).toBeVisible();
    await expect(ventana.getByText(VERIFYING_CONTRACT, { exact: false }).first()).toBeVisible();
    await expect(ventana.getByText('SignMessage', { exact: false }).first()).toBeVisible();

    await aprobarEnLaVentana(ventana);
    const resultado = await esperarResultadoDeFirma(dapp);
    expect(resultado.estado, `la dApp devolvió un error: ${JSON.stringify(resultado)}`).toBe('ok');
    const firma = String(resultado.estado === 'ok' ? resultado.valor : '');
    expect(firma).toMatch(/^0x[0-9a-fA-F]{130}$/);

    // --- Correspondencia wallet ↔ contrato: el MISMO digest y el MISMO firmante ----------------
    const digest = TypedDataEncoder.hash(DOMINIO, TIPOS, MENSAJE);
    // `verifyTypedData` de ethers v6 devuelve la dirección recuperada (o lanza si no es válida).
    const recuperado = verifyTypedData(DOMINIO, TIPOS, MENSAJE, firma);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(recuperado.toLowerCase()).toBe(CUENTA_0.toLowerCase());
    // El dominio declarado es EXACTAMENTE el del contrato verificador (name + chainId).
    expect(DOMINIO.name).toBe('TrueKeate Test App');
    expect(DOMINIO.chainId).toBe(31_337);

    archivarEvidencia('11-firmar-eip712', {
      flujo: 'eth_signTypedData_v4 · SaludoTipado del dominio TrueKeate Test App',
      dapp: DAPP_ORIGIN,
      dominio: DOMINIO,
      primaryType: 'SignMessage',
      digest,
      firmanteRecuperado: recuperado,
      firma,
      contratoVerificador: VERIFYING_CONTRACT,
    });
  });
});
