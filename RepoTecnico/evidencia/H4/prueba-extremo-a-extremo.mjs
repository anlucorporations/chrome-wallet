/**
 * `RepoTecnico/evidencia/H4/prueba-extremo-a-extremo.mjs` — PRUEBA REAL de extremo a extremo de H4.
 *
 * Qué demuestra, con el producto tal cual queda en `dist/` (no con dobles):
 *   1. `test.html` (dApp servida por Vite en `http://localhost:5174`) envía una transacción de 1 ETH
 *      con el provider inyectado (`window.truekeate`).
 *   2. El Service Worker abre **UNA** ventana `notification.html` con la **preview decodificada** y
 *      el **contador** de solicitudes en espera.
 *   3. Al aprobar, la dApp recibe **el hash al difundir** (`0x` + 64 hex).
 *   4. El recibo consultado DIRECTAMENTE al nodo (`eth_getTransactionReceipt`) es `status 0x1`.
 *   5. La cola `truekeate_pending_requests` queda VACÍA y la marca `truekeate_inflight_tx` pasa a
 *      `phase: 'broadcast'` con ese hash (la cuenta queda LIBERADA; `diccionario_datos.md` §2.12
 *      regla 2).
 *
 * Se ejecuta con `node RepoTecnico/evidencia/H4/prueba-extremo-a-extremo.mjs` teniendo Anvil en
 * `127.0.0.1:8545` y `npm run dev` sirviendo la dApp. NO forma parte del arnés `e2e/**`: es una
 * sonda de evidencia independiente que lee el almacén desde el propio Service Worker.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(AQUI, '..', '..', '..');
const DIST_DIR = resolve(REPO_ROOT, 'dist');
const DAPP_URL = process.env.TK_DAPP_URL ?? 'http://localhost:5174/test.html';
const RPC_URL = 'http://127.0.0.1:8545';
const RUN_DATE = new Date().toISOString().slice(0, 10);

const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const UN_ETH = '0xde0b6b3a7640000';
const ANVIL_ADDRESSES = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
];

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

const consultarAlNodo = async (method, params = []) => {
  const respuesta = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  });
  const cuerpo = await respuesta.json();
  return cuerpo.result;
};

/** Reintenta `comprobar` hasta que devuelva un valor verdadero o se agote el plazo. */
const esperarA = async (comprobar, { timeout = 30_000, intervalo = 250, que = 'condición' } = {}) => {
  const limite = Date.now() + timeout;
  let ultimo = null;
  while (Date.now() < limite) {
    ultimo = await comprobar();
    if (ultimo) return ultimo;
    await dormir(intervalo);
  }
  throw new Error(`[extremo-a-extremo] no se cumplió: ${que} (último valor: ${JSON.stringify(ultimo)})`);
};

const perfil = mkdtempSync(join(tmpdir(), 'tk-extremo-'));
const contexto = await chromium.launchPersistentContext(perfil, {
  channel: 'chromium',
  headless: process.env.E2E_HEADLESS !== 'false',
  args: [
    `--disable-extensions-except=${DIST_DIR}`,
    `--load-extension=${DIST_DIR}`,
    '--no-sandbox',
    '--enable-clipboard-read-write',
    '--enable-features=ClipboardReadWrite',
  ],
});

const evidencia = { flujo: 'prueba real de extremo a extremo de H4', fecha: RUN_DATE, dapp: DAPP_URL };
try {
  const sw = contexto.serviceWorkers()[0] ?? (await contexto.waitForEvent('serviceworker', { timeout: 15_000 }));

  // 1. Cartera sembrada (misma siembra que el arnés, desde el Service Worker).
  await sw.evaluate(async (direcciones) => {
    await chrome.storage.local.set({
      truekeate_mnemonic: 'test test test test test test test test test test test junk',
      truekeate_accounts: direcciones,
      truekeate_current_account: 'idx:0',
      truekeate_imported_accounts: [],
      truekeate_settings: {
        derivedAccountCount: 5,
        accountLabels: {},
        hiddenAccounts: [],
        language: 'es',
        encryptionEnabled: false,
        requirePasswordOnOpen: false,
        schemaVersion: '1.4',
        devNoticeAcceptedAt: 1,
      },
    });
  }, ANVIL_ADDRESSES);

  // 2. Conexión de la dApp (ventana `connect.html`).
  const dapp = await contexto.newPage();
  await dapp.goto(DAPP_URL);
  await dapp.waitForFunction(() => typeof window.truekeate === 'object', undefined, { timeout: 15_000 });
  const esperaConnect = contexto.waitForEvent('page', { timeout: 20_000 });
  await dapp.click('#btn-conectar');
  const ventanaConnect = await esperaConnect;
  await ventanaConnect.waitForLoadState('domcontentloaded');
  await ventanaConnect.locator('.tk-connect-row').first().waitFor({ state: 'visible', timeout: 15_000 });
  await ventanaConnect.getByRole('button', { name: 'Conectar' }).click();
  await dapp.waitForFunction(
    () => (document.getElementById('resultado-conectar')?.className ?? '').includes('resultado--ok'),
    undefined,
    { timeout: 20_000 },
  );
  evidencia.cuentaAutorizada = CUENTA_0;

  const saldoAntes = await consultarAlNodo('eth_getBalance', [CUENTA_0, 'latest']);

  // 3. `test.html` ENVÍA 1 ETH con el provider inyectado (la promesa queda pendiente).
  await dapp.evaluate(
    ({ from, to, value }) => {
      const global = window;
      global.__tkFirma = { estado: 'pendiente' };
      void global.truekeate
        .request({ method: 'eth_sendTransaction', params: [{ from, to, value }] })
        .then(
          (valor) => {
            global.__tkFirma = { estado: 'ok', valor };
          },
          (error) => {
            global.__tkFirma = { estado: 'error', code: error?.code ?? null, message: String(error?.message ?? error) };
          },
        );
    },
    { from: CUENTA_0, to: CUENTA_1, value: UN_ETH },
  );

  // 4. UNA sola ventana de decisión, con origen, preview decodificada y contador.
  const ventana = await esperarA(
    () => contexto.pages().find((pagina) => pagina.url().includes('notification.html')),
    { timeout: 20_000, que: 'la ventana notification.html' },
  );
  await ventana.waitForLoadState('domcontentloaded');
  await ventana.locator('.tk-summary__label').first().waitFor({ state: 'visible', timeout: 15_000 });
  const ventanasAbiertas = contexto.pages().filter((pagina) => pagina.url().includes('notification.html')).length;
  const origenMostrado = (await ventana.locator('.tk-origin__url').textContent())?.trim() ?? '';
  const contador = (await ventana.locator('.tk-header__badge').textContent())?.trim() ?? '';
  const previewVisible = await ventana
    .locator('.tk-summary__label')
    .allTextContents()
    .then((etiquetas) => etiquetas.map((texto) => texto.trim()));
  const tituloPanel = (await ventana.locator('.tk-section__title').first().textContent())?.trim() ?? '';
  mkdirSync(AQUI, { recursive: true });
  await ventana.screenshot({ path: join(AQUI, `extremo-a-extremo-${RUN_DATE}.png`) });
  evidencia.ventana = {
    ventanasAbiertas,
    origenMostrado,
    contador,
    tituloPanel,
    etiquetasPreview: previewVisible,
    avisosDeRiesgo: await ventana.locator('.tk-risk').count(),
  };

  // 5. El usuario APRUEBA en la ventana única (la ventana decide; el SW firma y difunde).
  const casillaRiesgo = ventana.locator('#tk-risk-ack');
  if ((await casillaRiesgo.count()) > 0 && !(await casillaRiesgo.isChecked())) {
    await casillaRiesgo.check();
  }
  await ventana.getByRole('button', { name: 'Aprobar' }).click();

  const desenlace = await esperarA(
    async () => {
      const actual = await dapp.evaluate(() => window.__tkFirma ?? null);
      return actual !== null && actual.estado !== 'pendiente' ? actual : null;
    },
    { timeout: 45_000, que: 'el desenlace de la firma en la dApp' },
  );
  const hash = desenlace.estado === 'ok' ? String(desenlace.valor) : null;
  evidencia.desenlaceDapp = desenlace;
  evidencia.hash = hash;
  if (hash === null || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error(`[extremo-a-extremo] la dApp no recibió un hash válido: ${JSON.stringify(desenlace)}`);
  }

  // 6. Recibo consultado DIRECTAMENTE al nodo (contraste externo).
  const recibo = await esperarA(
    async () => {
      const respuesta = await consultarAlNodo('eth_getTransactionReceipt', [hash]);
      return respuesta?.status === '0x1' ? respuesta : null;
    },
    { timeout: 30_000, que: 'el recibo con status 0x1' },
  );
  evidencia.recibo = { status: recibo.status, blockNumber: recibo.blockNumber, from: recibo.from, to: recibo.to };

  // 7. Estado persistido leído DESDE el Service Worker: cola vacía y marca en vuelo liberada.
  const almacen = await sw.evaluate(async () => {
    const items = await chrome.storage.local.get([
      'truekeate_pending_requests',
      'truekeate_inflight_tx',
      'truekeate_logs',
    ]);
    return items;
  });
  const cola = almacen.truekeate_pending_requests ?? {};
  const inflight = almacen.truekeate_inflight_tx ?? {};
  const entradas = Object.values(inflight);
  const trazasTx = (Array.isArray(almacen.truekeate_logs) ? almacen.truekeate_logs : [])
    .filter((entrada) => entrada && (entrada.event === 'tx_sent' || entrada.event === 'tx_confirmed'))
    .map((entrada) => ({ event: entrada.event, txHash: entrada.txHash ?? null, origin: entrada.origin ?? null }));
  const saldoDespues = await consultarAlNodo('eth_getBalance', [CUENTA_0, 'latest']);

  evidencia.estadoPersistido = {
    colaVacia: Object.keys(cola).length === 0,
    entradasEnCola: Object.keys(cola).length,
    inflight: entradas,
    marcaEnVueloLiberada: entradas.length === 0 || entradas.every((entrada) => entrada.phase !== 'signing'),
    fasesInflight: entradas.map((entrada) => entrada.phase ?? null),
    trazasTx,
  };
  evidencia.saldo = {
    antesWei: String(saldoAntes),
    despuesWei: String(saldoDespues),
    gastadoWei: (BigInt(saldoAntes) - BigInt(saldoDespues)).toString(),
  };

  writeFileSync(join(AQUI, `extremo-a-extremo-${RUN_DATE}.json`), `${JSON.stringify(evidencia, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidencia, null, 2));
} finally {
  await contexto.close();
  rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
