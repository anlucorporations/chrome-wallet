/**
 * `e2e/15-logs.spec.ts` — Observabilidad: panel de actividad y exportación JSON (H5, tareas 5.6 a 5.10).
 *
 * `plan_desarrollo.md` §3.5.7 («método/origen/`ts` con el popup cerrado, rojo en errores,
 * operaciones, exportación») y §3.5.6:
 *   · `CA-RF-28` / `CA-RF-29` — una entrada por llamada del catálogo con `method`, `origin` y `ts`,
 *     escrita SIEMPRE por el Service Worker: también con el popup **cerrado**;
 *   · `CA-RF-30` — los errores se pintan **en rojo** y con su `code` numérico;
 *   · `CA-RF-31` — las transacciones y las firmas muestran su hash/firma;
 *   · RNF-16 — el histórico es exportable en JSON y no lleva claves ni payloads íntegros.
 *
 * El registro se lee SIEMPRE desde el Service Worker (`chrome.storage.local`, §7.4.1.b), que es la
 * fuente de verdad; el popup solo lo pinta (`wallet_getLogs`) y lo exporta a un fichero local.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EVIDENCE_DIR,
  RUN_DATE,
  distDisponible,
  esperarEntradaDeLog,
  esperarProvider,
  expect,
  leerLogsPersistidos,
  openDapp,
  openPopupReady,
  pedirALaDapp,
  test,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Instante base de las entradas sembradas (determinista para las aserciones de `ts`). */
const TS_SEMBRADO = 1_700_000_000_000;

/** Entradas de `truekeate_logs` que se siembran para verificar el PANEL (lectura y pintado). */
const entradasSembradas = (): Array<Record<string, unknown>> => [
  {
    id: 'log-rpc-call',
    ts: TS_SEMBRADO,
    level: 'info',
    category: 'call',
    event: 'rpc_call',
    message: 'Llamada a eth_getBalance de http://localhost:5174',
    origin: 'http://localhost:5174',
    method: 'eth_getBalance',
    data: { params: [{ address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }] },
  },
  {
    id: 'log-tx',
    ts: TS_SEMBRADO + 1_000,
    level: 'info',
    category: 'tx',
    event: 'tx_sent',
    message: 'Transacción difundida; pendiente de confirmación.',
    origin: 'http://localhost:5174',
    method: 'eth_sendTransaction',
    data: { state: 'pending' },
    txHash: `0x${'ab'.repeat(32)}`,
  },
  {
    id: 'log-firma',
    ts: TS_SEMBRADO + 2_000,
    level: 'success',
    category: 'sign',
    event: 'sign_personal',
    message: 'Firma de texto plano (personal_sign)',
    origin: 'http://localhost:5174',
    method: 'personal_sign',
    data: { signature: `0x${'1b'.repeat(65)}`, truncated: true },
  },
  {
    id: 'log-cuota',
    ts: TS_SEMBRADO + 3_000,
    level: 'error',
    category: 'system',
    event: 'storage_quota_exceeded',
    message: 'No se pudo guardar el registro por falta de espacio',
    origin: 'extension',
    method: '',
    data: { code: -32603, message: 'no se pudo guardar el registro por falta de espacio', retried: true },
  },
];

test.describe('15 · Observabilidad: `truekeate_logs` y panel de actividad', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la llamada de la dApp se registra con método, origen y `ts` con el POPUP CERRADO (CA-RF-28)', async ({
    context,
    background,
  }) => {
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);

    // NINGUNA pestaña del popup está abierta: el registro lo escribe el Service Worker.
    const popupsAbiertos = context
      .pages()
      .filter((page) => page.url().includes('index.html'))
      .length;
    expect(popupsAbiertos, 'el popup no puede estar abierto en esta prueba').toBe(0);

    // UNA llamada del catálogo ⇒ EXACTAMENTE UNA entrada nueva (RNF-16).
    const antes = (await leerLogsPersistidos(background)).filter(
      (entrada) => entrada.method === 'eth_chainId',
    ).length;
    const respuesta = await pedirALaDapp(dapp, 'eth_chainId');
    expect(respuesta.ok).toBe(true);

    const entrada = await esperarEntradaDeLog(
      background,
      (fila) => fila.method === 'eth_chainId' && fila.origin === 'http://localhost:5174',
    );
    expect(entrada.event).toBe('rpc_call');
    expect(entrada.category).toBe('call');
    expect(entrada.level).toBe('info');
    expect(entrada.origin).toBe('http://localhost:5174');
    expect(entrada.method).toBe('eth_chainId');
    expect(typeof entrada.ts).toBe('number');
    expect(entrada.ts as number).toBeGreaterThan(0);
    // El `data` viaja REDACTADO por M22: nunca el payload íntegro.
    expect(JSON.stringify(entrada)).not.toContain('privateKey');
    expect(JSON.stringify(entrada)).not.toContain('mnemonic');

    const despues = (await leerLogsPersistidos(background)).filter(
      (fila) => fila.method === 'eth_chainId',
    ).length;
    expect(despues, 'una llamada tiene que dejar UNA sola entrada').toBe(antes + 1);

    // El error también se registra con su `code` (CA-RF-29). Se usa una lectura con parámetros
    // inválidos: el proveedor inyectado responde `4200` LOCALMENTE para los métodos fuera del
    // catálogo (H-11a/DEC-22) sin cruzar el puente, así que la traza del SW se comprueba con un
    // fallo REAL del catálogo.
    const fallo = await pedirALaDapp(dapp, 'eth_getBalance', []);
    expect(fallo.ok).toBe(false);
    if (fallo.ok) return;
    const entradaError = await esperarEntradaDeLog(
      background,
      (fila) => fila.event === 'rpc_error' && fila.method === 'eth_getBalance',
    );
    const datosError = entradaError.data as { code?: number };
    expect(typeof datosError.code).toBe('number');
    expect(datosError.code, 'el `code` de la traza es el que recibió la página').toBe(fallo.code);
    expect(entradaError.category).toBe('call');
    expect(entradaError.origin).toBe('http://localhost:5174');

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `15-logs-sw-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'llamada registrada por el SW con el popup cerrado',
          fecha: RUN_DATE,
          popupCerrado: popupsAbiertos === 0,
          entradaDeLaLlamada: entrada,
          entradaDelError: entradaError,
          entradasDeEthChainId: { antes, despues },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  test('el panel pinta método/origen/`ts`, los ERRORES en rojo con su `code` y las operaciones con su hash (CA-RF-30/31)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, { logs: entradasSembradas() });

    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Actividad' }).click();

    // Además de las 4 entradas sembradas, el panel muestra las trazas REALES que el Service Worker
    // escribe para las propias llamadas del popup (`wallet_getState`, `wallet_getLogs`…), así que no
    // se fija un total: se comprueba que las 4 sembradas están y que el orden es el de `ts`.
    const filas = popup.locator('#actividad-entradas > li');
    // Las trazas REALES de las llamadas del propio popup también son `rpc_call`: la entrada
    // sembrada se identifica por su ORIGEN (la dApp), que es único en el registro.
    await expect(
      popup.locator('li[data-event="rpc_call"][data-origin="http://localhost:5174"]'),
      'la entrada rpc_call sembrada no está en el panel',
    ).toHaveCount(1);
    for (const evento of ['tx_sent', 'sign_personal', 'storage_quota_exceeded']) {
      await expect(
        popup.locator(`li[data-event="${evento}"]`),
        `la entrada ${evento} no está en el panel`,
      ).toHaveCount(1);
    }

    // La llamada sembrada muestra su método, su origen y su instante (CA-RF-28).
    const filaLlamada = popup.locator('li[data-event="rpc_call"][data-origin="http://localhost:5174"]');
    await expect(filaLlamada).toHaveCount(1);
    await expect(filaLlamada).toHaveAttribute('data-category', 'call');
    await expect(filaLlamada.locator('.tk-log__event')).toHaveText('rpc_call');
    await expect(filaLlamada.locator('.tk-log__meta')).toContainText('http://localhost:5174');
    await expect(filaLlamada.locator('.tk-log__meta')).toContainText('eth_getBalance');
    await expect(filaLlamada.locator('.tk-log__time')).not.toBeEmpty();

    // La operación muestra su hash y la firma se muestra recortada (CA-RF-31).
    await expect(popup.locator('li[data-event="tx_sent"] .tk-log__hash')).toContainText('0xabab');
    await expect(popup.locator('li[data-event="sign_personal"] .tk-log__hash')).toContainText('0x1b1b');

    // El ERROR va en ROJO, con su clase, su nivel y su `code` numérico (CA-RF-30).
    const filaError = popup.locator('li[data-event="storage_quota_exceeded"]');
    await expect(filaError).toHaveClass(/tk-log--error/);
    await expect(filaError).toHaveAttribute('data-level', 'error');
    await expect(filaError.locator('.tk-log__code')).toHaveText('code -32603');

    /** Color REAL con el que se pinta el nivel de la fila de error. */
    const colorError = await filaError
      .locator('.tk-log__level')
      .evaluate((nodo) => getComputedStyle(nodo).color);
    /** Color real del nivel de una fila que NO es error, como contraste. */
    const colorInfo = await filaLlamada
      .locator('.tk-log__level')
      .evaluate((nodo) => getComputedStyle(nodo).color);
    // `--tk-danger-dark` = #A62F2F (tokens.css, única fuente de color del proyecto).
    expect(colorError).toBe('rgb(166, 47, 47)');
    expect(colorInfo).not.toBe(colorError);

    // El contador de descartes por cuota está a la vista (R13) y el filtro por nivel funciona.
    await expect(popup.locator('#actividad-cuota')).toBeVisible();
    await expect(popup.locator('#actividad-descartes')).toHaveText('0');
    await popup.locator('#actividad-filtro-nivel').selectOption('error');
    // Las llamadas del propio popup son correctas: el ÚNICO error del registro es el sembrado.
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toHaveAttribute('data-event', 'storage_quota_exceeded');  });

  test('la exportación JSON descarga el histórico SIN red y con las entradas del panel (RNF-16)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background, { logs: entradasSembradas() });

    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Actividad' }).click();
    await expect(popup.locator('li[data-event="tx_sent"]')).toHaveCount(1);

    // Se vigilan TODAS las peticiones que hace el popup durante la exportación: no puede haber red.
    const peticiones: string[] = [];
    popup.on('request', (peticion) => {
      peticiones.push(peticion.url());
    });

    await popup.locator('#actividad-exportar').click();
    const enlace = popup.locator('#actividad-descarga');
    await expect(enlace).toBeVisible();

    const nombre = await enlace.getAttribute('download');
    expect(nombre).toMatch(/^truekeate-logs-\d{4}-\d{2}-\d{2}\.json$/);
    const href = await enlace.getAttribute('href');
    expect(href?.startsWith('blob:'), 'la exportación tiene que ser un fichero local (Blob)').toBe(true);

    // Contenido REAL del fichero exportado, leído desde la propia página.
    const contenido = await popup.evaluate(async (url) => {
      const respuesta = await fetch(url as string);
      return respuesta.text();
    }, href);
    const exportado = JSON.parse(contenido) as {
      exportedAt: number;
      entries: Array<Record<string, unknown>>;
      totalEntries: number;
      dropped: number;
      truncated: boolean;
    };
    expect(typeof exportado.exportedAt).toBe('number');
    expect(exportado.entries.length).toBeGreaterThanOrEqual(4);
    expect(exportado.totalEntries).toBe(exportado.entries.length);
    expect(exportado.dropped).toBe(0);
    expect(exportado.entries.some((entrada) => entrada.event === 'tx_sent')).toBe(true);
    expect(contenido).toContain('0xabab');
    // Y no se filtra ningún secreto al fichero exportado.
    expect(contenido).not.toContain('mnemonic');
    expect(contenido).not.toContain('privateKey');

    const peticionesHttp = peticiones.filter((url) => url.startsWith('http'));
    expect(peticionesHttp, 'la exportación no puede hacer ninguna petición de red').toEqual([]);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(join(EVIDENCE_DIR, `logs-export-${RUN_DATE}.json`), contenido, 'utf8');
    writeFileSync(
      join(EVIDENCE_DIR, `15-logs-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'exportación JSON del histórico desde el panel de actividad',
          fecha: RUN_DATE,
          fichero: nombre,
          blobUrl: href,
          bytes: contenido.length,
          entradas: exportado.entries.length,
          dropped: exportado.dropped,
          truncated: exportado.truncated,
          peticionesDeRedDuranteLaExportacion: peticionesHttp,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });
});
