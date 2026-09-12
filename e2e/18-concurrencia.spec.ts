/**
 * `e2e/18-concurrencia.spec.ts` — 2 solicitudes simultáneas → **una sola** ventana con contador `2`
 * (H4, tarea 4.18; `CA-RF-35` y `CA-RF-37`).
 *
 * La cardinalidad por origen es **1 solicitud `pending` por origen** (§2.8), así que las dos
 * solicitudes simultáneas se piden desde **dos orígenes distintos** del mismo servidor de pruebas
 * (`http://localhost:5174` y `http://127.0.0.1:5174`): el oráculo del hito es que **nunca** haya
 * dos `notification.html` abiertas y que el contador marque `2`.
 *
 * Evidencia: `RepoTecnico/evidencia/H4/18-concurrencia-<fecha>.json`.
 */

import {
  DAPP_URL,
  aprobarEnLaVentana,
  archivarEvidencia,
  conectarDapp,
  contarPendientes,
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

/** Cuenta #0 de Anvil: la que autorizan las dos sesiones. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Segundo origen del MISMO servidor de pruebas (origen distinto → cardinalidad independiente). */
const SEGUNDO_ORIGEN = DAPP_URL.replace('localhost', '127.0.0.1');

/** Textos distintos para poder atribuir cada decisión a su solicitud. */
const MENSAJE_A = 'Solicitud A de la prueba de concurrencia de TrueKeate.';
const MENSAJE_B = 'Solicitud B de la prueba de concurrencia de TrueKeate.';

test.describe('18 · concurrencia: una ventana única con contador 2 (CA-RF-35/37)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('dos solicitudes simultáneas de orígenes distintos comparten UNA ventana con contador 2', async ({
    context,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background);

    // --- Los dos orígenes con sesión autorizada -------------------------------------------------
    const dappA = await context.newPage();
    await openDapp(dappA);
    await esperarProvider(dappA);
    const conexionA = await conectarDapp(context, dappA, { indice: 0 });
    expect(conexionA.ok, `la conexión A falló: ${conexionA.resultado}`).toBe(true);

    const dappB = await context.newPage();
    await openDapp(dappB, SEGUNDO_ORIGEN);
    await esperarProvider(dappB);
    const conexionB = await conectarDapp(context, dappB, { indice: 0 });
    expect(conexionB.ok, `la conexión B falló: ${conexionB.resultado}`).toBe(true);

    // --- Las DOS solicitudes a la vez -----------------------------------------------------------
    await iniciarPeticionDeFirma(dappA, 'personal_sign', [MENSAJE_A, CUENTA_0]);
    await iniciarPeticionDeFirma(dappB, 'personal_sign', [MENSAJE_B, CUENTA_0]);

    // Condición observable: la cola persistida tiene EXACTAMENTE 2 pendientes (CA-RF-37).
    await expect
      .poll(() => contarPendientes(background), {
        message: 'las dos solicitudes no llegaron a coexistir en la cola persistida',
        timeout: 30_000,
      })
      .toBe(2);

    // Y sigue habiendo UNA sola ventana: es el oráculo bloqueante de `CA-RF-35`. La apertura es
    // ASÍNCRONA y POSTERIOR a la escritura de la cola (§2.14: `enqueue` → `showOldestPending` →
    // `chrome.windows.create`), así que primero se espera la condición observable y solo entonces se
    // cuenta: la expectativa del corpus («nunca dos `notification.html`») no cambia.
    const ventana = await esperarVentanaDeDecision(context);
    expect(ventanasDeDecision(context)).toHaveLength(1);

    // El contador de la ventana es el índice derivado de la cola: se lee tras re-pedir el registro
    // persistido (una recarga de la MISMA ventana, que es lo que haría el SW al re-renderizarla).
    await expect
      .poll(async () => {
        await ventana.reload();
        return leerContadorDeLaVentana(ventana);
      }, { message: 'el contador de la ventana única no llegó a marcar 2', timeout: 30_000 })
      .toBe('2 solicitudes en espera');

    // --- Se resuelven las dos desde la MISMA ventana --------------------------------------------
    await aprobarEnLaVentana(ventana);
    const resultadoA = await esperarResultadoDeFirma(dappA);
    expect(resultadoA.estado, `la dApp A devolvió un error: ${JSON.stringify(resultadoA)}`).toBe('ok');

    await expect
      .poll(() => contarPendientes(background), { timeout: 30_000 })
      .toBe(1);
    await expect
      .poll(async () => leerContadorDeLaVentana(ventana), { timeout: 30_000 })
      .toBe('1 solicitud en espera');

    await aprobarEnLaVentana(ventana);
    const resultadoB = await esperarResultadoDeFirma(dappB);
    expect(resultadoB.estado, `la dApp B devolvió un error: ${JSON.stringify(resultadoB)}`).toBe('ok');

    await expect.poll(() => contarPendientes(background), { timeout: 30_000 }).toBe(0);
    expect(ventanasDeDecision(context).length).toBeLessThanOrEqual(1);

    const firmaA = String(resultadoA.estado === 'ok' ? resultadoA.valor : '');
    const firmaB = String(resultadoB.estado === 'ok' ? resultadoB.valor : '');
    expect(firmaA).toMatch(/^0x[0-9a-fA-F]{130}$/);
    expect(firmaB).toMatch(/^0x[0-9a-fA-F]{130}$/);
    expect(firmaA).not.toBe(firmaB);

    archivarEvidencia('18-concurrencia', {
      flujo: '2 personal_sign simultáneos desde 2 orígenes',
      origenes: [DAPP_URL, SEGUNDO_ORIGEN],
      pendientesCoexistentes: 2,
      contadorVentana: '2 solicitudes en espera',
      ventanasDeDecisionMaximas: 1,
      firmaA,
      firmaB,
      colaFinal: 0,
    });
  });
});
