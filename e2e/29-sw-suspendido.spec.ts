/**
 * `e2e/29-sw-suspendido.spec.ts` — Suspensión del Service Worker a mitad de una aprobación, por CDP
 * (H4, tarea 4.18; `CA-RF-41` y **RNF-08**).
 *
 * Qué demuestra, con oráculos observables y sin esperas fijas:
 *  1. Con el SW **suspendido** y una solicitud `pending` en `truekeate_pending_requests`, la
 *     solicitud NO se pierde: el dueño del plazo es `chrome.alarms` (M15), que **despierta** al SW.
 *  2. Al re-arrancar, la reconciliación purga la entrada vencida, entrega `4001` a la dApp y mide
 *     **< 1 s** (RNF-08).
 *  3. **0 doble difusión**: el `nonce` de la cuenta no avanza y `truekeate_inflight_tx` queda vacío
 *     (no se firmó ni se difundió nada).
 *
 * Evidencia: `RepoTecnico/evidencia/H4/29-sw-suspendido-<fecha>.json`.
 */

import {
  ANVIL_RPC_URL,
  DAPP_ORIGIN,
  EVIDENCE_DIR,
  RUN_DATE,
  archivarEvidencia,
  conectarDapp,
  consultarAlNodo,
  distDisponible,
  esperarProvider,
  esperarResultadoDeFirma,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  openPopupReady,
  openDapp,
  stopServiceWorker,
  test,
  ventanasDeDecision,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuenta #0 de Anvil: la que autoriza la sesión de la dApp. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Destino del envío que se queda a medias. */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Claves de la cola y de la marca en vuelo (nunca se escribe el ID de la extensión a mano). */
const CLAVE_COLA = 'truekeate_pending_requests';
const CLAVE_INFLIGHT = 'truekeate_inflight_tx';

/** Lee una clave de `chrome.storage.local` desde una página de la extensión (sin despertar el SW). */
async function leerAlmacen(
  page: import('@playwright/test').Page,
  clave: string,
): Promise<unknown> {
  return page.evaluate(async (nombre) => {
    const items = (await chrome.storage.local.get(nombre)) as Record<string, unknown>;
    return items[nombre];
  }, clave);
}

test.describe('29 · SW suspendido a mitad de una aprobación (RNF-08)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la alarma despierta al SW: 4001 sin doble difusión y reconstrucción < 1 s', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background);

    const popup = await openPopupReady(context, extensionId);
    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    const conexion = await conectarDapp(context, dapp, { indice: 0 });
    expect(conexion.ok, `la conexión de la dApp falló: ${conexion.resultado}`).toBe(true);

    const nonceAntes = (await consultarAlNodo('eth_getTransactionCount', [
      CUENTA_0,
      'latest',
    ])) as string;

    await iniciarPeticionDeFirma(dapp, 'eth_sendTransaction', [
      { from: CUENTA_0, to: CUENTA_1, value: '0x1' },
    ]);

    const ventana = await esperarVentanaDeDecision(context);
    await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);
    expect(ventanasDeDecision(context)).toHaveLength(1);

    // La solicitud está PERSISTIDA antes de suspender: es la verdad que sobrevive al SW.
    await expect
      .poll(async () => Object.keys(((await leerAlmacen(popup, CLAVE_COLA)) ?? {}) as object).length, {
        message: 'la solicitud no llegó a persistirse antes de suspender el SW',
        timeout: 20_000,
      })
      .toBe(1);
    const colaAntes = (await leerAlmacen(popup, CLAVE_COLA)) as Record<string, unknown>;
    const approvalId = Object.keys(colaAntes)[0] ?? '';

    // --- Suspensión por CDP: el SW queda `stopped` con la aprobación a medias -------------------
    const watch = await stopServiceWorker(context, extensionId, { page: ventana });
    const estadoTrasSuspender = watch.status();
    expect(estadoTrasSuspender).toBe('stopped');

    // --- La alarma (3 s inyectados) DESPIERTA al SW, que reconcilia al arrancar -----------------
    const inicioEspera = performance.now();
    await watch.waitUntilRunning(30_000);
    const msHastaArrancar = performance.now() - inicioEspera;

    // Reconstrucción: desde que el SW está `running` hasta que la cola queda sin huérfanas.
    //
    // MEDICIÓN de H5: se muestrea con intervalo FIJO de 50 ms (`intervals: [50]`). El intervalo
    // adaptativo por defecto de `expect.poll` (50 → 100 → 250 → 500 → 1000 ms) añadía hasta ~1,5 s
    // de sobrecoste PROPIO del arnés a una medida que se compara con el umbral de < 1 s de RNF-08,
    // de modo que la prueba medía su propia espera y no la reconstrucción del Service Worker. El
    // umbral NO cambia.  ✓
    const inicioReconstruccion = performance.now();
    await expect
      .poll(async () => Object.keys(((await leerAlmacen(popup, CLAVE_COLA)) ?? {}) as object).length, {
        message: 'la solicitud huérfana no se purgó al re-arrancar el SW',
        timeout: 20_000,
        intervals: [50],
      })
      .toBe(0);
    const msReconstruccion = performance.now() - inicioReconstruccion;
    await watch.detach();

    // --- El solicitante recibe el 4001 de vencimiento (nunca se queda colgado) -----------------
    const resultado = await esperarResultadoDeFirma(dapp);
    expect(resultado.estado).toBe('error');
    expect(resultado.estado === 'error' ? resultado.code : null).toBe(4001);
    expect(resultado.estado === 'error' ? resultado.message : '').toContain('plazo establecido');

    // --- 0 doble difusión ----------------------------------------------------------------------
    const nonceDespues = (await consultarAlNodo('eth_getTransactionCount', [
      CUENTA_0,
      'latest',
    ])) as string;
    expect(nonceDespues, 'el nonce avanzó: hubo difusión durante la suspensión').toBe(nonceAntes);
    expect((await leerAlmacen(popup, CLAVE_INFLIGHT)) ?? {}).toEqual({});

    expect(msReconstruccion).toBeLessThan(1_000);
    expect(colaAntes[approvalId]).toBeTruthy();

    const evidencia = {
      flujo: 'SW suspendido por CDP con una aprobación pendiente',
      rpc: ANVIL_RPC_URL,
      approvalId,
      estadoTrasSuspender,
      msHastaArrancar: Math.round(msHastaArrancar),
      msReconstruccion: Math.round(msReconstruccion),
      errorAlSolicitante: resultado,
      nonceAntes,
      nonceDespues,
      dobleDifusion: nonceDespues !== nonceAntes,
      inflightVacio: true,
    };
    const destino = archivarEvidencia('29-sw-suspendido', evidencia);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `29-sw-suspendido-${RUN_DATE}.log`),
      [
        `# 29-sw-suspendido — ${RUN_DATE}`,
        `approvalId: ${approvalId}`,
        `estado tras suspender (CDP): ${estadoTrasSuspender}`,
        `ms hasta que el SW vuelve a estar running: ${Math.round(msHastaArrancar)}`,
        `ms de reconstrucción (running → cola sin huérfanas): ${Math.round(msReconstruccion)}`,
        `error entregado a la dApp: ${JSON.stringify(resultado)}`,
        `nonce antes/después: ${nonceAntes} / ${nonceDespues}`,
        `evidencia JSON: ${destino}`,
      ].join('\n'),
      'utf8',
    );
  });
});
