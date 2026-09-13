/**
 * `e2e/32-aprobacion-vence-y-cierre.spec.ts` — Desenlaces de la ventana única **sin aprobar**:
 * vencimiento del plazo, cierre con la X y «Rechazar» (Fase 4 · RF-40, §3.8, `CA-RF-35`/`CA-RF-46`).
 *
 * HUECO QUE CIERRA: la suite tenía el rechazo de una firma EIP-712 (`22-dapp.spec.ts`) y el
 * vencimiento provocado por la suspensión del Service Worker (`29-sw-suspendido.spec.ts`), pero
 * **ninguna** prueba dejaba vencer el plazo con la ventana abierta, **ninguna** cerraba la ventana
 * con la X y **ninguna** pulsaba «Rechazar» sobre una `eth_sendTransaction`.
 *
 * Los tres desenlaces comparten el mismo oráculo, que es el que importa al usuario:
 *   · la dApp recibe `4001` (nunca se queda colgada),
 *   · la cola persistida queda VACÍA,
 *   · **el nodo no recibe ninguna transacción** (ni saldo ni nonce del origen cambian),
 *   · `truekeate_logs` registra `approval_resolved` con su `status` (`expired` / `rejected`).
 *
 * Evidencia: `RepoTecnico/evidencia/Fase4/32-aprobacion-vence-y-cierre-<fecha>.json`.
 */

import type { BrowserContext, Page, Worker } from '@playwright/test';

import {
  DAPP_ORIGIN,
  ESPERA_FIRMA_MS,
  archivarEvidencia,
  consultarAlNodo,
  contarPendientes,
  distDisponible,
  esperarEntradaDeLog,
  esperarProvider,
  esperarResultadoDeFirma,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  leerLogsPersistidos,
  openDapp,
  rechazarEnLaVentana,
  test,
  ventanasDeDecision,
} from './fixtures/extension';
import { activeSession, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuenta #0 de Anvil: origen y firmante de las transacciones de esta suite. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Cuenta #1 de Anvil: destino. */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** 1 ETH en wei hexadecimal. */
const UN_ETH = '0xde0b6b3a7640000';

/**
 * Entrada del registro que demuestra una firma ANTERIOR: sin ella, la ventana única añade el aviso
 * bloqueante de «primera firma» (RNF-23), que tiene su propia prueba dedicada
 * (`26-avisos.spec.ts`). El plazo de firma que inyecta el arnés es de 3 s (`VITE_SIGN_TIMEOUT_MS`),
 * así que estas pruebas no pueden gastar interacciones en un aviso ajeno a lo que miden.
 */
const FIRMA_PREVIA = {
  event: 'approval_resolved',
  category: 'approval',
  level: 'info',
  message: 'firma previa sembrada por la prueba de la ventana única',
  ts: 1,
  origin: DAPP_ORIGIN,
  method: 'eth_sendTransaction',
  data: { status: 'approved' },
};

/** Instantánea del nodo que demuestra «no se difundió nada». */
interface InstantaneaDelNodo {
  saldoOrigen: string;
  saldoDestino: string;
  nonceOrigen: string;
}

/** Lee del nodo los tres valores que cambiarían si la transacción se hubiera difundido. */
async function instantaneaDelNodo(): Promise<InstantaneaDelNodo> {
  const [saldoOrigen, saldoDestino, nonceOrigen] = await Promise.all([
    consultarAlNodo('eth_getBalance', [CUENTA_0, 'latest']),
    consultarAlNodo('eth_getBalance', [CUENTA_1, 'latest']),
    consultarAlNodo('eth_getTransactionCount', [CUENTA_0, 'latest']),
  ]);
  return {
    saldoOrigen: String(saldoOrigen),
    saldoDestino: String(saldoDestino),
    nonceOrigen: String(nonceOrigen),
  };
}

/** Exige que el nodo no haya cambiado: cada campo delata un camino distinto de difusión. */
function exigirNodoIntacto(antes: InstantaneaDelNodo, despues: InstantaneaDelNodo): void {
  expect(despues.nonceOrigen, 'el nonce del origen cambió: la transacción se difundió').toBe(
    antes.nonceOrigen,
  );
  expect(despues.saldoOrigen, 'el saldo del origen cambió: la transacción se difundió').toBe(
    antes.saldoOrigen,
  );
  expect(despues.saldoDestino, 'el saldo del destino cambió: la transacción se difundió').toBe(
    antes.saldoDestino,
  );
}

/**
 * Prepara una dApp con sesión vigente y deja una `eth_sendTransaction` esperando en la ventana única.
 *
 * La sesión se SIEMBRA (`activeSession`) en vez de recorrerse por `connect.html`: esta prueba mide
 * el desenlace de la ventana única (vencimiento, X, rechazo), no la conexión, y el arnés inyecta un
 * plazo de conexión de solo 2 s (`VITE_CONNECT_TIMEOUT_MS`) que bajo carga vencía antes de que el
 * arnés pudiera pulsar «Conectar» —un fallo ajeno a lo que aquí se comprueba—. El sembrado de la
 * sesión es el mismo camino que ya usa `25-recuperacion.spec.ts` para su guarda `-32000`.
 */
async function prepararEnvioPendiente(
  context: BrowserContext,
  background: Worker,
): Promise<{ dapp: Page; ventana: Page }> {
  await seedWallet(background, {
    connectedSites: activeSession(CUENTA_0),
    logs: [FIRMA_PREVIA],
  });
  const dapp = await context.newPage();
  await openDapp(dapp);
  await esperarProvider(dapp);
  await iniciarPeticionDeFirma(dapp, 'eth_sendTransaction', [
    { from: CUENTA_0, to: CUENTA_1, value: UN_ETH },
  ]);
  const ventana = await esperarVentanaDeDecision(context);
  await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);
  return { dapp, ventana };
}

/** Entrada `approval_resolved` del registro persistente con el `status` pedido, si ya existe. */
const entradaDeResolucion = async (
  background: Worker,
  status: string,
): Promise<Record<string, unknown> | undefined> =>
  (await leerLogsPersistidos(background)).find(
    (entrada) =>
      entrada.event === 'approval_resolved' &&
      (entrada.data as { status?: unknown } | undefined)?.status === status,
  );

test.describe('32 · Ventana única: vencimiento del plazo, cierre con la X y rechazo (RF-40 / CA-RF-46)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('dejar vencer el plazo (3 s inyectados) cierra la ventana, entrega 4001 y NO difunde la transacción', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    const antes = await instantaneaDelNodo();
    const { dapp, ventana } = await prepararEnvioPendiente(context, background);
    // El plazo lo posee el Service Worker con `chrome.alarms`; el arnés lo inyecta a 3 s (§7.4.1.d).
    await expect(ventana.locator('.tk-header__badge')).toHaveText('1 solicitud en espera');

    // NO se decide nada: se espera la condición observable «ya no hay ventana de decisión».
    await expect
      .poll(() => ventanasDeDecision(context).length, {
        message: 'la ventana única no se cerró sola al vencer el plazo',
        timeout: 30_000,
      })
      .toBe(0);

    const resultado = await esperarResultadoDeFirma(dapp, ESPERA_FIRMA_MS);
    expect(
      resultado.estado,
      `la dApp no recibió el 4001 de vencimiento: ${JSON.stringify(resultado)}`,
    ).toBe('error');
    if (resultado.estado !== 'error') return;
    expect(resultado.code).toBe(4001);
    expect(String(resultado.message)).toContain('plazo');

    // La cola persistida queda vacía y el nodo intacto: no hubo firma ni difusión.
    await expect.poll(() => contarPendientes(background), { timeout: 20_000 }).toBe(0);
    exigirNodoIntacto(antes, await instantaneaDelNodo());

    /**
     * Traza del vencimiento. El dueño del plazo es la ALARMA de M15 (`chrome.alarms`), y su camino
     * escribe `approval_expired` con el `errorCode` y los SEGUNDOS que aplicó: aquí se comprueba que
     * son los que el arnés inyectó (`VITE_SIGN_TIMEOUT_MS = 3000` ⇒ 3 s), no un valor inventado.
     */
    const entrada = await esperarEntradaDeLog(
      background,
      (fila) => fila.event === 'approval_expired',
      20_000,
    );
    const datosDelVencimiento = entrada.data as { errorCode?: unknown; segundos?: unknown };
    expect(datosDelVencimiento.errorCode).toBe(4001);
    expect(datosDelVencimiento.segundos, 'el vencimiento no usó el plazo inyectado (3 s)').toBe(3);

    archivarEvidencia('32-aprobacion-vence-y-cierre', {
      flujo: 'vencimiento del plazo sin decidir',
      code: resultado.code,
      mensaje: resultado.message,
      colaFinal: 0,
      nodoIntacto: true,
      log: entrada,
    });
  });

  test('cerrar la ventana con la X equivale a RECHAZAR: 4001, cola vacía, sin difusión y la siguiente solicitud vuelve a abrir ventana', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    const antes = await instantaneaDelNodo();
    const { dapp, ventana } = await prepararEnvioPendiente(context, background);

    // La X del usuario: se cierra la ventana de `chrome.windows.create` sin pulsar nada.
    await ventana.close();

    const resultado = await esperarResultadoDeFirma(dapp, ESPERA_FIRMA_MS);
    expect(resultado.estado, `la dApp no recibió el 4001 de cierre: ${JSON.stringify(resultado)}`).toBe(
      'error',
    );
    if (resultado.estado !== 'error') return;
    expect(resultado.code).toBe(4001);
    // El literal de §4.3 para `4001` es el mismo para todas las causas de «cancelada por el
    // usuario»; lo que distingue la X del botón «Rechazar» es la TRAZA, que se comprueba abajo.
    expect(String(resultado.message)).toContain('Operación cancelada por el usuario');

    await expect.poll(() => contarPendientes(background), { timeout: 20_000 }).toBe(0);
    expect(ventanasDeDecision(context)).toHaveLength(0);
    exigirNodoIntacto(antes, await instantaneaDelNodo());

    /**
     * La TRAZA de la resolución prueba que la solicitud quedó RECHAZADA (no «approved», no
     * «expired») con el `errorCode` de §4.3. El mensaje que deja es el de `SIGN_RESPONSE` y no el
     * genérico del cierre de ventana porque `notification.html` adelanta el rechazo en su
     * `pagehide` (`src/notification/App.tsx:1247-1266`: «Cierre de la ventana (X) sin decidir:
     * equivale a rechazo»), que es la vía que gana cuando la página puede avisar; el camino de
     * `chrome.windows.onRemoved` (`focus.ts`) es el respaldo para cuando no puede. Lo que exige el
     * requisito —`4001`, cola vacía, sin difusión y la siguiente solicitud con ventana— se comprueba
     * aquí y abajo.
     */
    const entrada = await entradaDeResolucion(background, 'rejected');
    expect(entrada, 'no se registró `approval_resolved` con status `rejected`').toBeDefined();
    expect((entrada?.data as { errorCode?: unknown }).errorCode).toBe(4001);
    expect(entrada?.origin, 'la traza debe nombrar el origen que pidió la firma').toBe(DAPP_ORIGIN);
    expect(entrada?.method).toBe('eth_sendTransaction');

    /**
     * REGRESIÓN QUE ESTA PRUEBA PROTEGE: `truekeate_approval_window` guarda el `windowId` y el
     * `shownApprovalId` de la ventana abierta. Si el cierre con la X no limpiase ese estado, el
     * Service Worker creería que la ventana sigue abierta y **la siguiente solicitud no volvería a
     * mostrar nada**: la dApp quedaría colgada hasta el vencimiento. Se comprueba pidiendo otra.
     */
    await iniciarPeticionDeFirma(dapp, 'eth_sendTransaction', [
      { from: CUENTA_0, to: CUENTA_1, value: UN_ETH },
    ]);
    const segunda = await esperarVentanaDeDecision(context, 20_000);
    await expect(segunda.locator('.tk-header__badge')).toHaveText('1 solicitud en espera');
    await rechazarEnLaVentana(segunda);
    const segundoResultado = await esperarResultadoDeFirma(dapp, ESPERA_FIRMA_MS);
    expect(segundoResultado.estado).toBe('error');
    await expect.poll(() => contarPendientes(background), { timeout: 20_000 }).toBe(0);

    archivarEvidencia('32-aprobacion-vence-y-cierre', {
      flujo: 'cierre de la ventana con la X (= rechazo) y reapertura para la siguiente solicitud',
      code: resultado.code,
      mensaje: resultado.message,
      ventanaReabierta: true,
      colaFinal: 0,
      nodoIntacto: true,
      log: entrada,
    });
  });

  test('el botón «Rechazar» de una transacción no difunde nada y devuelve 4001 (CA-RF-46)', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    const antes = await instantaneaDelNodo();
    const { dapp, ventana } = await prepararEnvioPendiente(context, background);

    await rechazarEnLaVentana(ventana);

    const resultado = await esperarResultadoDeFirma(dapp, ESPERA_FIRMA_MS);
    expect(resultado.estado, `la dApp no recibió el 4001 de rechazo: ${JSON.stringify(resultado)}`).toBe(
      'error',
    );
    if (resultado.estado !== 'error') return;
    expect(resultado.code).toBe(4001);

    await expect.poll(() => contarPendientes(background), { timeout: 20_000 }).toBe(0);
    exigirNodoIntacto(antes, await instantaneaDelNodo());
    // La ventana se cierra al resolver (no queda ninguna pestaña colgando).
    await expect.poll(() => ventanasDeDecision(context).length, { timeout: 20_000 }).toBe(0);

    // La traza del botón «Rechazar» (camino `SIGN_RESPONSE`, distinto del cierre por la X).
    const entrada = await entradaDeResolucion(background, 'rejected');
    expect(entrada?.message).toBe('Solicitud de aprobación rechazada por el usuario');

    archivarEvidencia('32-aprobacion-vence-y-cierre', {
      flujo: 'rechazo explícito de una eth_sendTransaction',
      code: resultado.code,
      mensaje: resultado.message,
      ventanasRestantes: ventanasDeDecision(context).length,
      colaFinal: 0,
      nodoIntacto: true,
      log: entrada,
    });
  });
});
