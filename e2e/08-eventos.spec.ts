/**
 * `e2e/08-eventos.spec.ts` — `accountsChanged` en DOS pestañas (H3, tarea 3.16).
 *
 * §3.3.7: «`08-eventos.spec.ts` (2 pestañas)»; §3.3.6 `CA-RF-15`/`CA-RF-24` (parte
 * `accountsChanged`): el evento del catálogo llega a **todas las pestañas conectadas** con el
 * mismo `data` (reenvío LITERAL, nota H-39) y la caché `selectedAddress` del provider de cada
 * pestaña queda coherente.
 *
 * H3 tiene DOS emisores de `accountsChanged`, y este fichero cubre los dos:
 *   1. la **revocación** del permiso desde el popup (tarea 3.11), que publica la lista VACÍA;
 *   2. el **cambio de cuenta activa** desde el popup (`CA-RF-15`, cierre de `D-H3-A`/`D-H3-B`),
 *      que publica la cuenta NUEVA y deja `eth_accounts` y la sesión persistida apuntando a ella.
 *
 * El control que distingue «todas las pestañas conectadas» de «todas las pestañas» es una tercera
 * pestaña del mismo origen que nunca pidió las cuentas: no debe recibir ninguno de los dos eventos
 * (el cambio de cuenta lleva una DIRECCIÓN y publicarla a un origen sin sesión rompería RNF-11).
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
  leerEventosDeLaDapp,
  llamarDesdeLaExtension,
  openDapp,
  openPopupReady,
  readChromeStorage,
  registrarEventosDeLaDapp,
  test,
  type EventoDeLaDapp,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** `accountsChanged` capturados por una pestaña, en orden. */
const cambiosDeCuentas = async (page: Parameters<typeof leerEventosDeLaDapp>[0]): Promise<EventoDeLaDapp[]> =>
  (await leerEventosDeLaDapp(page)).filter((evento) => evento.eventName === 'accountsChanged');

/** Espera a que la pestaña haya recibido al menos un `accountsChanged`. */
const esperarCambioDeCuentas = async (
  page: Parameters<typeof leerEventosDeLaDapp>[0],
  timeout = 20_000,
): Promise<void> => {
  await expect
    .poll(async () => (await cambiosDeCuentas(page)).length, {
      message: 'la pestaña no recibió `accountsChanged`',
      timeout,
    })
    .toBeGreaterThanOrEqual(1);
};

/** Sesiones persistidas en `truekeate_connected_sites`, sin tipar. */
const sesionesPersistidas = async (
  background: Parameters<typeof readChromeStorage>[0],
): Promise<Record<string, { account?: string }>> =>
  (await readChromeStorage(background, 'truekeate_connected_sites'))[
    'truekeate_connected_sites'
  ] as Record<string, { account?: string }>;

test.describe('08 · Eventos del provider en dos pestañas', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('`accountsChanged []` llega a las DOS pestañas conectadas y a ninguna más', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);

    // Tres pestañas de la MISMA dApp: A conecta, B usa la sesión, C nunca pide las cuentas.
    const tabA = await context.newPage();
    await openDapp(tabA);
    const tabB = await context.newPage();
    await openDapp(tabB);
    const tabC = await context.newPage();
    await openDapp(tabC);
    for (const tab of [tabA, tabB, tabC]) {
      await esperarProvider(tab);
      expect(await registrarEventosDeLaDapp(tab), 'no se pudieron registrar las escuchas').toBe(5);
    }

    // --- Conexión desde A (ventana `connect.html`) ---------------------------------------------
    const desenlace = await conectarDapp(context, tabA);
    expect(desenlace.ok, `el flujo de conexión falló: ${desenlace.resultado}`).toBe(true);
    expect(await cuentasDeLaDapp(tabA)).toEqual([ANVIL_ADDRESSES[0]]);
    // B comparte la sesión del MISMO origen y queda registrada como pestaña conectada.
    expect(await cuentasDeLaDapp(tabB)).toEqual([ANVIL_ADDRESSES[0]]);
    // C no ha pedido nada: no está conectada (aunque su origen sea el mismo).
    expect(await cambiosDeCuentas(tabC)).toEqual([]);

    // --- Revocación desde el popup ---------------------------------------------------------------
    const popup = await openPopupReady(context, extensionId);
    const respuesta = (await llamarDesdeLaExtension(popup, 'wallet_revokePermissions', [
      { origin: DAPP_ORIGIN },
    ])) as { result?: { origin?: string; revoked?: boolean } };
    expect(respuesta.result?.revoked).toBe(true);
    expect(respuesta.result?.origin).toBe(DAPP_ORIGIN);

    // --- El evento llega a A y a B con la lista VACÍA (reenvío literal) ---------------------------
    await esperarCambioDeCuentas(tabA);
    await esperarCambioDeCuentas(tabB);

    const eventosA = await cambiosDeCuentas(tabA);
    const eventosB = await cambiosDeCuentas(tabB);
    const eventosC = await cambiosDeCuentas(tabC);

    for (const [nombre, tab, eventos] of [
      ['A', tabA, eventosA],
      ['B', tabB, eventosB],
    ] as const) {
      const ultimo = eventos[eventos.length - 1];
      expect(JSON.stringify(ultimo?.data), `la pestaña ${nombre} recibió otro payload`).toBe('[]');
      // La caché del provider se limpia con el evento (no queda la cuenta revocada).
      expect(
        await tab.evaluate(
          () => (window as unknown as { truekeate: { selectedAddress: unknown } }).truekeate.selectedAddress,
        ),
      ).toBeNull();
    }

    // C sigue sin recibirlo: no era una pestaña conectada.
    expect(eventosC).toEqual([]);

    // Presupuesto de tasa: el bucket del origen es de 6 solicitudes/60 s. Hasta aquí se han usado
    // 3 (eth_requestAccounts + 2 eth_accounts); quedan 3 para comprobar el `[]` posterior.
    const cuentasATras = await cuentasDeLaDapp(tabA);
    const cuentasBTras = await cuentasDeLaDapp(tabB);
    expect(cuentasATras).toEqual([]);
    expect(cuentasBTras).toEqual([]);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `08-eventos-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'eventos: accountsChanged en dos pestañas',
          fecha: RUN_DATE,
          origen: DAPP_ORIGIN,
          cuentaAutorizada: ANVIL_ADDRESSES[0],
          pestanaA: eventosA,
          pestanaB: eventosB,
          pestanaCNoConectada: eventosC,
          cuentasTrasRevocar: { A: cuentasATras, B: cuentasBTras },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('el cambio de cuenta activa desde el popup emite `accountsChanged` con la cuenta nueva (CA-RF-15)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);

    // Dos pestañas de la misma dApp conectadas + una tercera que nunca pide las cuentas.
    const tabA = await context.newPage();
    await openDapp(tabA);
    const tabB = await context.newPage();
    await openDapp(tabB);
    const tabC = await context.newPage();
    await openDapp(tabC);
    for (const tab of [tabA, tabB, tabC]) {
      await esperarProvider(tab);
      expect(await registrarEventosDeLaDapp(tab)).toBe(5);
    }

    const desenlace = await conectarDapp(context, tabA);
    expect(desenlace.ok, `el flujo de conexión falló: ${desenlace.resultado}`).toBe(true);
    expect(await cuentasDeLaDapp(tabA)).toEqual([ANVIL_ADDRESSES[0]]);
    // B comparte la sesión del mismo origen y queda registrada como pestaña conectada.
    expect(await cuentasDeLaDapp(tabB)).toEqual([ANVIL_ADDRESSES[0]]);
    expect(await cambiosDeCuentas(tabA)).toEqual([]);
    expect(await cambiosDeCuentas(tabB)).toEqual([]);
    // `connect` sí se emitió al autorizar el origen; se cuenta para probar que el cambio de cuenta
    // NO lo vuelve a emitir (no se inventa semántica).
    const conectaA = (await leerEventosDeLaDapp(tabA)).filter((e) => e.eventName === 'connect').length;
    const conectaB = (await leerEventosDeLaDapp(tabB)).filter((e) => e.eventName === 'connect').length;

    // --- Cambio de cuenta activa desde el POPUP (D-H3-A) -----------------------------------------
    const popup = await openPopupReady(context, extensionId);
    const respuesta = (await llamarDesdeLaExtension(popup, 'wallet_setCurrentAccount', [
      { ref: 'idx:1' },
    ])) as { result?: { currentAccountRef?: string } };
    expect(respuesta.result?.currentAccountRef).toBe('idx:1');

    // --- El evento llega a A y a B con la cuenta NUEVA ------------------------------------------
    await esperarCambioDeCuentas(tabA);
    await esperarCambioDeCuentas(tabB);
    const eventosA = await cambiosDeCuentas(tabA);
    const eventosB = await cambiosDeCuentas(tabB);
    const esperado = JSON.stringify([ANVIL_ADDRESSES[1]]);
    /** `selectedAddress` REALMENTE leído en cada pestaña tras el evento. */
    const seleccionadas: Record<string, unknown> = {};

    for (const [nombre, tab, eventos] of [
      ['A', tabA, eventosA],
      ['B', tabB, eventosB],
    ] as const) {
      const ultimo = eventos[eventos.length - 1];
      expect(JSON.stringify(ultimo?.data), `la pestaña ${nombre} recibió otro payload`).toBe(esperado);
      // La caché `selectedAddress` del provider ya apunta a la cuenta nueva (reenvío literal).
      const seleccionada = await tab.evaluate(
        () => (window as unknown as { truekeate: { selectedAddress: unknown } }).truekeate.selectedAddress,
      );
      expect(seleccionada, `la caché del provider de la pestaña ${nombre} quedó obsoleta`).toBe(
        ANVIL_ADDRESSES[1],
      );
      seleccionadas[nombre] = seleccionada;
      // Y no se inventó ningún `connect`: la sesión no se ha vuelto a autorizar.
      const conectaTras = (await leerEventosDeLaDapp(tab)).filter((e) => e.eventName === 'connect').length;
      expect(conectaTras).toBe(nombre === 'A' ? conectaA : conectaB);
    }

    // C nunca pidió las cuentas: el cambio NO publica direcciones a orígenes sin sesión (RNF-11).
    expect(await cambiosDeCuentas(tabC)).toEqual([]);

    // --- D-H3-B: la sesión vigente y `eth_accounts` comparten ya la cuenta nueva -----------------
    const cuentasATras = await cuentasDeLaDapp(tabA);
    const cuentasBTras = await cuentasDeLaDapp(tabB);
    expect(cuentasATras).toEqual([ANVIL_ADDRESSES[1]]);
    expect(cuentasBTras).toEqual([ANVIL_ADDRESSES[1]]);
    const sesiones = await sesionesPersistidas(background);
    expect(sesiones[DAPP_ORIGIN]?.account).toBe(ANVIL_ADDRESSES[1]);
    const estado = (await llamarDesdeLaExtension(popup, 'wallet_getState')) as {
      result?: { currentAccountRef?: string; connectedSites?: { origin?: string; account?: string }[] };
    };
    expect(estado.result?.currentAccountRef).toBe('idx:1');
    expect(estado.result?.connectedSites?.[0]?.account).toBe(ANVIL_ADDRESSES[1]);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `08-cambio-cuenta-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'CA-RF-15: cambio de cuenta activa desde el popup',
          fecha: RUN_DATE,
          origen: DAPP_ORIGIN,
          peticion: "wallet_setCurrentAccount { ref: 'idx:1' }",
          respuestaDelSw: respuesta.result ?? null,
          cuentaAnterior: ANVIL_ADDRESSES[0],
          cuentaNueva: ANVIL_ADDRESSES[1],
          accountsChangedPestanaA: eventosA,
          accountsChangedPestanaB: eventosB,
          accountsChangedPestanaCNoConectada: await cambiosDeCuentas(tabC),
          selectedAddressTrasElEvento: seleccionadas,
          ethAccountsTrasElCambio: { A: cuentasATras, B: cuentasBTras },
          sesionPersistida: sesiones[DAPP_ORIGIN] ?? null,
          walletGetState: estado.result ?? null,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });
});
