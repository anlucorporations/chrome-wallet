/**
 * `e2e/22-dapp.spec.ts` — Los SIETE flujos de `test.html` (H5, tarea 5.11 / `CA-RF-46`).
 *
 * `plan_desarrollo.md` §3.5.5 tarea 5.11: detectar, conectar, saldo, enviar, EIP-712, cambiar red y
 * eventos, «cada uno con resultado en pantalla en **< 5000 ms**», y los errores `4001`, `4900` y
 * `4901` mostrados **con su acción sugerida** (§3.5.6 `CA-RF-46`).
 *
 * CÓMO SE MIDE EL PLAZO: la página pinta el resultado en cuanto lo tiene y, si a los 5000 ms sigue
 * esperando, pinta su estado «en espera» con el tiempo transcurrido. La prueba comprueba las dos
 * cosas: el instante del primer resultado en pantalla —medido con el reloj de Playwright, no con el
 * de la página— y el atributo `data-ms` que publica la fila.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import {
  EVIDENCE_DIR,
  RUN_DATE,
  SECONDARY_ANVIL_CHAIN_ID_HEX,
  SECONDARY_ANVIL_RPC_URL,
  anvilResponde,
  anvilSecundarioResponde,
  aprobarEnLaVentana,
  arrancarAnvil,
  arrancarAnvilSecundario,
  detenerAnvil,
  distDisponible,
  esperarAnvil,
  esperarAnvilSecundario,
  esperarProvider,
  esperarVentanaDeDecision,
  expect,
  openDapp,
  pulsarFlujoConVentana,
  readChromeStorage,
  rechazarEnLaVentana,
  resolverConexionEnVentana,
  test,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Plazo normativo de la tarea 5.11: el resultado del flujo tiene que verse en < 5000 ms. */
const LIMITE_MS = 5_000;

/** Fila de resultado de un flujo en `test.html`. */
const fila = (dapp: Page, id: string) => dapp.locator(`#${id}`);

/** Cuerpo (texto de resultado) de la fila de un flujo. */
const cuerpo = (dapp: Page, id: string): Promise<string> =>
  dapp.locator(`#${id} .resultado__cuerpo`).textContent().then((texto) => texto ?? '');

/**
 * Pulsa el botón de un flujo y comprueba que hay RESULTADO EN PANTALLA en menos de 5000 ms: se mide
 * con el reloj de Playwright y se contrasta con el `data-ms` que publica la propia fila.
 */
const pulsarYEsperarResultadoEnPlazo = async (
  dapp: Page,
  boton: string,
  idFila: string,
): Promise<number> => {
  const inicio = Date.now();
  await dapp.locator(`#${boton}`).click();
  await expect(dapp.locator(`#${idFila}`)).toHaveClass(/resultado--(ok|error|pendiente)/, {
    timeout: LIMITE_MS,
  });
  const transcurrido = Date.now() - inicio;
  expect(transcurrido, `el flujo ${idFila} no dio resultado en pantalla en ${LIMITE_MS} ms`).toBeLessThan(
    LIMITE_MS,
  );
  const propio = Number((await dapp.locator(`#${idFila}`).getAttribute('data-ms')) ?? 'NaN');
  if (Number.isFinite(propio)) {
    expect(propio, `la página midió más de ${LIMITE_MS} ms en ${idFila}`).toBeLessThan(LIMITE_MS);
  }
  return transcurrido;
};

/** Espera a que la fila de un flujo quede en `ok` (tras aprobar su solicitud). */
const esperarOk = async (dapp: Page, idFila: string): Promise<void> => {
  await expect(dapp.locator(`#${idFila}`)).toHaveClass(/resultado--ok/, { timeout: 45_000 });
};

/** Espera a que la fila de un flujo quede en `error` y devuelve su `code`. */
const esperarError = async (dapp: Page, idFila: string, timeout = 45_000): Promise<number> => {
  await expect(dapp.locator(`#${idFila}`)).toHaveClass(/resultado--error/, { timeout });
  const code = await dapp.locator(`#${idFila}`).getAttribute('data-code');
  return Number(code);
};

/** Siembra la segunda red (31338) para el flujo de cambio de red. */
const sembrarSegundaRed = async (
  background: Parameters<typeof readChromeStorage>[0],
): Promise<void> => {
  await background.evaluate(async (red) => {
    const almacen = await chrome.storage.local.get(['truekeate_networks']);
    const redes = (almacen.truekeate_networks ?? {}) as Record<string, unknown>;
    redes['0x7a6a'] = red;
    await chrome.storage.local.set({ truekeate_networks: redes, truekeate_chain_id: '0x7a69' });
  }, {
    chainId: SECONDARY_ANVIL_CHAIN_ID_HEX,
    chainIdDecimal: 31338,
    name: 'Anvil Secundario',
    rpcUrl: SECONDARY_ANVIL_RPC_URL,
    symbol: 'ETH',
    decimals: 18,
    isTestnet: true,
    isDefault: false,
  });
};

test.describe('22 · dApp de pruebas: los siete flujos (CA-RF-46)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  /**
   * NOTA DE ARNÉS (política de tasa REAL, §2.13): cada origen dispone de **6 solicitudes por ventana
   * de 60 s** (`pendingRequestsPerMinute`), así que los 7 flujos se reparten en DOS pruebas con
   * perfil nuevo cada una (los contadores viven en `truekeate_rate_windows`, que se reinicia con el
   * perfil). No se relaja ninguna aserción: lo único que cambia es el reparto.
   */
  test('flujos 1 a 4 (detectar, conectar, saldo y envío) con resultado en pantalla en menos de 5000 ms', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);

    /** Tiempos REALES medidos por la prueba, por flujo. */
    const tiempos: Record<string, number> = {};

    // --- Flujo 1 · Detectar el provider (se ejecuta al cargar la página) ------------------------
    const inicioDeteccion = Date.now();
    await expect(dapp.locator('#estado-texto')).toContainText('provider detectado', {
      timeout: LIMITE_MS,
    });
    tiempos.detectar = Date.now() - inicioDeteccion;
    await expect(dapp.locator('#detalle')).toContainText('propiedad no configurable: true');
    await expect(dapp.locator('#eip6963-lista')).toContainText('TrueKeate');

    // --- Flujo 2 · Conectar (ventana `connect.html`) -------------------------------------------
    // Se registra la espera de la ventana ANTES del clic y se mide el resultado en pantalla del
    // flujo (estado «en espera») antes de decidir en la ventana.
    const inicioConexion = Date.now();
    const ventanaConexion = await pulsarFlujoConVentana(context, dapp, 'btn-conectar');
    await expect(dapp.locator('#resultado-conectar')).toHaveClass(/resultado--pendiente/, {
      timeout: LIMITE_MS,
    });
    tiempos.conectar = Date.now() - inicioConexion;
    expect(tiempos.conectar).toBeLessThan(LIMITE_MS);
    const conexion = await resolverConexionEnVentana(ventanaConexion, dapp, { indice: 0 });
    expect(conexion.ok, `el flujo de conexión falló: ${conexion.resultado}`).toBe(true);
    await esperarOk(dapp, 'resultado-conectar');

    // --- Flujo 3 · Consultar saldo -------------------------------------------------------------
    tiempos.saldo = await pulsarYEsperarResultadoEnPlazo(dapp, 'btn-saldo', 'resultado-saldo');
    await esperarOk(dapp, 'resultado-saldo');
    expect(await cuerpo(dapp, 'resultado-saldo')).toContain('Saldo');

    // --- Flujo 4 · Enviar transacción (aprobación en la ventana única) --------------------------
    // La espera de la ventana se registra ANTES del clic: el plazo inyectado es de 3 s y la ventana
    // puede abrirse y cerrarse dentro de ese margen.
    const inicioEnvio = Date.now();
    const ventanaEnvio = await pulsarFlujoConVentana(context, dapp, 'btn-enviar');
    await expect(dapp.locator('#resultado-enviar')).toHaveClass(/resultado--pendiente/, {
      timeout: LIMITE_MS,
    });
    tiempos.enviar = Date.now() - inicioEnvio;
    expect(tiempos.enviar).toBeLessThan(LIMITE_MS);
    await aprobarEnLaVentana(ventanaEnvio);
    await esperarOk(dapp, 'resultado-enviar');
    const hash = (await cuerpo(dapp, 'resultado-enviar')).trim().replace(/"/g, '');
    expect(hash, 'el envío tiene que devolver el hash de la transacción').toMatch(/^0x[0-9a-f]{64}$/);

    // Ningún flujo marcado como «pendiente de hito» y ninguno se queda «en espera».
    await expect(dapp.locator('.pendiente')).toHaveCount(0);
    for (const id of ['resultado-conectar', 'resultado-saldo', 'resultado-enviar']) {
      await expect(dapp.locator(`#${id}`)).not.toHaveClass(/resultado--pendiente/);
    }
    // El historial de la página conserva las operaciones (no se borra entre flujos).
    const registro = await dapp.locator('#registro').textContent();
    expect(registro).toContain('eth_requestAccounts');
    expect(registro).toContain('eth_sendTransaction');

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `22-dapp-flujos-1-4-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'flujos 1 a 4 de test.html con resultado en pantalla',
          fecha: RUN_DATE,
          limiteMs: LIMITE_MS,
          tiemposMedidosPorLaPrueba: tiempos,
          hashDeLaTransaccion: hash,
          historial: registro,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('flujos 5 a 7 (EIP-712, cambio de red y eventos) con resultado en pantalla en menos de 5000 ms', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    const haySegundaRed = await anvilSecundarioResponde();
    test.skip(!haySegundaRed, `el Anvil secundario no responde en ${SECONDARY_ANVIL_RPC_URL}: flujo 6 NO VERIFICADO`);
    if (!haySegundaRed) return;

    await seedWallet(background);
    await sembrarSegundaRed(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);

    /** Tiempos REALES medidos por la prueba, por flujo. */
    const tiempos: Record<string, number> = {};

    // La sesión es requisito de los dos métodos aprobables (RNF-11): se conecta primero.
    const ventanaConexion = await pulsarFlujoConVentana(context, dapp, 'btn-conectar');
    const conexion = await resolverConexionEnVentana(ventanaConexion, dapp, { indice: 0 });
    expect(conexion.ok, `el flujo de conexión falló: ${conexion.resultado}`).toBe(true);
    await esperarOk(dapp, 'resultado-conectar');

    // --- Flujo 5 · Firmar EIP-712 --------------------------------------------------------------
    const inicioFirma = Date.now();
    const ventanaFirma = await pulsarFlujoConVentana(context, dapp, 'btn-eip712');
    await expect(dapp.locator('#resultado-eip712')).toHaveClass(/resultado--pendiente/, {
      timeout: LIMITE_MS,
    });
    tiempos.eip712 = Date.now() - inicioFirma;
    expect(tiempos.eip712).toBeLessThan(LIMITE_MS);
    await aprobarEnLaVentana(ventanaFirma);
    await esperarOk(dapp, 'resultado-eip712');
    expect((await cuerpo(dapp, 'resultado-eip712')).trim().replace(/"/g, '')).toMatch(
      /^0x[0-9a-f]{130}$/,
    );

    // --- Flujo 6 · Cambiar de red --------------------------------------------------------------
    await dapp.locator('#red-destino').fill(SECONDARY_ANVIL_CHAIN_ID_HEX);
    const inicioCambio = Date.now();
    const ventanaCambio = await pulsarFlujoConVentana(context, dapp, 'btn-cambiar-red');
    await expect(dapp.locator('#resultado-cambiar-red')).toHaveClass(/resultado--pendiente/, {
      timeout: LIMITE_MS,
    });
    tiempos.cambiarRed = Date.now() - inicioCambio;
    expect(tiempos.cambiarRed).toBeLessThan(LIMITE_MS);
    await aprobarEnLaVentana(ventanaCambio);
    await esperarOk(dapp, 'resultado-cambiar-red');
    expect(await cuerpo(dapp, 'resultado-cambiar-red')).toContain(SECONDARY_ANVIL_CHAIN_ID_HEX);
    const almacen = await readChromeStorage(background, ['truekeate_chain_id']);
    expect(almacen.truekeate_chain_id).toBe(SECONDARY_ANVIL_CHAIN_ID_HEX);

    // --- Flujo 7 · Escuchar eventos ------------------------------------------------------------
    tiempos.eventos = await pulsarYEsperarResultadoEnPlazo(dapp, 'btn-eventos', 'resultado-eventos');
    await esperarOk(dapp, 'resultado-eventos');
    expect(await cuerpo(dapp, 'resultado-eventos')).toContain('Suscripción activa');

    // Ningún flujo marcado como «pendiente de hito» y ninguno se queda «en espera».
    await expect(dapp.locator('.pendiente')).toHaveCount(0);
    for (const id of ['resultado-eip712', 'resultado-cambiar-red', 'resultado-eventos']) {
      await expect(dapp.locator(`#${id}`)).not.toHaveClass(/resultado--pendiente/);
    }
    // El historial conserva las operaciones de estos flujos.
    const registro = await dapp.locator('#registro').textContent();
    expect(registro).toContain('eth_signTypedData_v4');
    expect(registro).toContain('wallet_switchEthereumChain');
    expect(registro).toContain('chainChanged');

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `22-dapp-flujos-5-7-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'flujos 5 a 7 de test.html con resultado en pantalla',
          fecha: RUN_DATE,
          limiteMs: LIMITE_MS,
          tiemposMedidosPorLaPrueba: tiempos,
          firmaEip712: await cuerpo(dapp, 'resultado-eip712'),
          redActiva: almacen.truekeate_chain_id,
          historial: registro,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('los errores 4001 y 4901 se muestran con su código y su acción sugerida', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);

    // --- 4001: el usuario rechaza la conexión en `connect.html` ---------------------------------
    const inicioRechazo = Date.now();
    const ventanaConexion = await pulsarFlujoConVentana(context, dapp, 'btn-conectar');
    await expect(dapp.locator('#resultado-conectar')).toHaveClass(/resultado--pendiente/, {
      timeout: LIMITE_MS,
    });
    expect(Date.now() - inicioRechazo).toBeLessThan(LIMITE_MS);
    const rechazo = await resolverConexionEnVentana(ventanaConexion, dapp, { rechazar: true });
    expect(rechazo.ok).toBe(false);
    const code4001 = await esperarError(dapp, 'resultado-conectar');
    expect(code4001).toBe(4001);
    await expect(dapp.locator('#resultado-conectar .resultado__accion')).toHaveText(
      'Acción sugerida: Volver a solicitarla desde la dApp',
    );

    // --- 4901: cambio a una red NO dada de alta (sin ventana de confirmación) -------------------
    await dapp.locator('#red-destino').fill('0x89');
    await pulsarYEsperarResultadoEnPlazo(dapp, 'btn-cambiar-red', 'resultado-cambiar-red');
    const code4901 = await esperarError(dapp, 'resultado-cambiar-red');
    expect(code4901).toBe(4901);
    expect(await cuerpo(dapp, 'resultado-cambiar-red')).toContain('La red solicitada no está dada de alta');
    await expect(dapp.locator('#resultado-cambiar-red .resultado__accion')).toHaveText(
      'Acción sugerida: Darla de alta con wallet_addEthereumChain',
    );
    // `4901` se resuelve ANTES de encolar: no se abre ninguna ventana de confirmación.
    expect(context.pages().filter((page) => page.url().includes('notification.html'))).toHaveLength(0);
  });

  test('el error 4900 (RPC local caído) se muestra con su acción sugerida y el nodo se restaura', async ({
    context,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);

    // La sesión se abre ANTES de tumbar el nodo (la conexión necesita el RPC y una cuenta).
    const ventanaConexion = await pulsarFlujoConVentana(context, dapp, 'btn-conectar');
    const conexion = await resolverConexionEnVentana(ventanaConexion, dapp, { indice: 0 });
    expect(conexion.ok, `la conexión falló: ${conexion.resultado}`).toBe(true);
    await esperarOk(dapp, 'resultado-conectar');

    const pids = detenerAnvil();
    expect(pids.length, 'no se pudo detener Anvil (¿no estaba arrancado?)').toBeGreaterThan(0);
    try {
      // El resultado en pantalla llega en plazo (estado «en espera»); el error REAL del nodo, con
      // su acción sugerida, se pinta en cuanto el Service Worker agota sus reintentos.
      const transcurrido = await pulsarYEsperarResultadoEnPlazo(dapp, 'btn-saldo', 'resultado-saldo');
      expect(transcurrido).toBeLessThan(LIMITE_MS);
      const code4900 = await esperarError(dapp, 'resultado-saldo', 60_000);
      expect(code4900).toBe(4900);
      expect(await cuerpo(dapp, 'resultado-saldo')).toContain('Sin conexión con la red local');
      await expect(dapp.locator('#resultado-saldo .resultado__accion')).toHaveText(
        'Acción sugerida: Arrancar Anvil en 127.0.0.1:8545',
      );
    } finally {
      // Restauración SIEMPRE: el resto de la suite necesita el nodo principal y el secundario.
      arrancarAnvil();
      arrancarAnvilSecundario();
    }

    expect(await esperarAnvil(), 'el Anvil principal no volvió a responder').toBe(true);
    expect(
      await esperarAnvilSecundario(),
      'el Anvil secundario no volvió a responder',
    ).toBe(true);
    expect(await anvilResponde()).toBe(true);
    expect(await anvilSecundarioResponde()).toBe(true);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `22-dapp-4900-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: '4900 con el RPC local caído',
          fecha: RUN_DATE,
          pidsDetenidos: pids,
          code: 4900,
          cuerpo: await cuerpo(dapp, 'resultado-saldo'),
          accion: await dapp.locator('#resultado-saldo .resultado__accion').textContent(),
          anvilRestaurado: await anvilResponde(),
          anvilSecundarioRestaurado: await anvilSecundarioResponde(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('un rechazo del usuario en una firma EIP-712 deja el 4001 con su acción (CA-RF-46)', async ({
    context,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);

    const inicioConexion = Date.now();
    const ventanaConexion = await pulsarFlujoConVentana(context, dapp, 'btn-conectar');
    await expect(dapp.locator('#resultado-conectar')).toHaveClass(/resultado--pendiente/, {
      timeout: LIMITE_MS,
    });
    expect(Date.now() - inicioConexion).toBeLessThan(LIMITE_MS);
    const conexion = await resolverConexionEnVentana(ventanaConexion, dapp, { indice: 0 });
    expect(conexion.ok).toBe(true);
    await esperarOk(dapp, 'resultado-conectar');

    const inicioFirma = Date.now();
    const ventanaFirma = await pulsarFlujoConVentana(context, dapp, 'btn-eip712');
    await expect(dapp.locator('#resultado-eip712')).toHaveClass(/resultado--pendiente/, {
      timeout: LIMITE_MS,
    });
    expect(Date.now() - inicioFirma).toBeLessThan(LIMITE_MS);
    await rechazarEnLaVentana(ventanaFirma);
    const code = await esperarError(dapp, 'resultado-eip712');
    expect(code).toBe(4001);
    await expect(dapp.locator('#resultado-eip712 .resultado__accion')).toHaveText(
      'Acción sugerida: Volver a solicitarla desde la dApp',
    );

    // El rechazo queda anotado en el historial de la página y no rompe la sesión de la dApp.
    expect(await dapp.locator('#registro').textContent()).toContain(
      'eth_signTypedData_v4 falló: Error 4001',
    );
  });
});
