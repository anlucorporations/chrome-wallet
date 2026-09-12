/**
 * `e2e/04-enviar.spec.ts` — Envío de 1 ETH con recibo `status 1` (H4, tarea 4.18; §3.4.7).
 *
 * `CA-RF-08`: 1 ETH entre cuentas de Anvil devuelve un hash `0x` + 64 hex y el recibo es
 * `status 1`. La prueba aprueba en la **ventana única** (no firma nada por su cuenta) y comprueba
 * el recibo consultando **directamente** al nodo con `eth_getTransactionReceipt`.
 *
 * Evidencia: `RepoTecnico/evidencia/H4/04-enviar-<fecha>.json`.
 */

import {
  DAPP_ORIGIN,
  ESPERA_FIRMA_MS,
  aprobarEnLaVentana,
  archivarEvidencia,
  conectarDapp,
  consultarAlNodo,
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

/** Cuenta #0 de Anvil (la que autoriza la sesión de la dApp). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Cuenta #1 de Anvil (destino externo). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** 1 ETH en wei hexadecimal. */
const UN_ETH = '0xde0b6b3a7640000';

/** Campos del recibo de transacción que consulta esta prueba. */
interface ReciboDeTransaccion {
  status?: string;
  blockNumber?: string;
  from?: string;
  to?: string;
}

test.describe('04 · envío de 1 ETH con aprobación y recibo status 1 (CA-RF-08)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la dApp recibe el hash al aprobar y el recibo del nodo es status 1', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    const conexion = await conectarDapp(context, dapp, { indice: 0 });
    expect(conexion.ok, `la conexión de la dApp falló: ${conexion.resultado}`).toBe(true);

    const saldoAntes = (await consultarAlNodo('eth_getBalance', [CUENTA_0, 'latest'])) as string;

    await iniciarPeticionDeFirma(dapp, 'eth_sendTransaction', [
      { from: CUENTA_0, to: CUENTA_1, value: UN_ETH },
    ]);
    const ventana = await esperarVentanaDeDecision(context);
    await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);
    const contador = await leerContadorDeLaVentana(ventana);
    expect(contador).toBe('1 solicitud en espera');
    expect(ventanasDeDecision(context)).toHaveLength(1);

    await aprobarEnLaVentana(ventana);
    const resultado = await esperarResultadoDeFirma(dapp, ESPERA_FIRMA_MS);
    expect(resultado.estado, `la dApp devolvió un error: ${JSON.stringify(resultado)}`).toBe('ok');
    const hash = resultado.estado === 'ok' ? resultado.valor : null;
    expect(typeof hash).toBe('string');
    expect(hash as string).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Recibo consultado DIRECTAMENTE al nodo (contraste externo, sin pasar por el provider).
    const observado: { recibo: ReciboDeTransaccion | null } = { recibo: null };
    await expect
      .poll(
        async () => {
          const respuesta = (await consultarAlNodo('eth_getTransactionReceipt', [
            hash,
          ])) as ReciboDeTransaccion | null;
          observado.recibo = respuesta;
          return respuesta?.status ?? null;
        },
        { message: 'la transacción no llegó a confirmarse (recibo sin status)', timeout: 30_000 },
      )
      .toBe('0x1');

    const recibo = observado.recibo;
    expect(recibo?.from?.toLowerCase()).toBe(CUENTA_0.toLowerCase());
    expect(recibo?.to?.toLowerCase()).toBe(CUENTA_1.toLowerCase());

    // El saldo de la cuenta #0 bajó exactamente 1 ETH más la comisión pagada.
    const saldoDespues = BigInt((await consultarAlNodo('eth_getBalance', [CUENTA_0, 'latest'])) as string);
    const gastado = BigInt(saldoAntes) - saldoDespues;
    expect(gastado).toBeGreaterThanOrEqual(BigInt(UN_ETH));
    expect(gastado).toBeLessThan(BigInt(UN_ETH) + 10n ** 16n);

    // `CA-RF-41`: la cola persistida queda vacía tras aprobar.
    const cola = (await background.evaluate(async () => {
      const items = (await chrome.storage.local.get('truekeate_pending_requests')) as Record<
        string,
        unknown
      >;
      return items.truekeate_pending_requests ?? {};
    })) as Record<string, unknown>;
    expect(Object.keys(cola)).toEqual([]);

    archivarEvidencia('04-enviar', {
      flujo: 'eth_sendTransaction · 1 ETH entre cuentas de Anvil',
      dapp: DAPP_ORIGIN,
      contadorVentana: contador,
      ventanasDeDecision: ventanasDeDecision(context).length,
      hash,
      reciboStatus: recibo?.status ?? null,
      gastadoWei: gastado.toString(),
      colaVacia: Object.keys(cola).length === 0,
    });
  });
});
