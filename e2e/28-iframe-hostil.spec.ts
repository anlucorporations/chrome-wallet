/**
 * `e2e/28-iframe-hostil.spec.ts` — Un iframe cross-origin NO hereda la sesión del top (H3).
 *
 * §3.3.7: «`28-iframe-hostil.spec.ts`» y §3.3.8 (riesgo BLOQUEANTE, DEC-40/ADT-07): con
 * `sender.frameId !== 0`, el Service Worker tiene PROHIBIDO deducir el origen de `sender.tab.url`
 * (que en un iframe cross-origin es la URL del TOP) y la respuesta debe volver SOLO a ese frame.
 *
 * El iframe se sirve desde un origen DISTINTO (un servidor HTTP efímero en `127.0.0.1:<puerto>`)
 * mientras el top es la dApp de `http://localhost:5174`: si el SW cayera en la herencia, el iframe
 * recibiría la cuenta del top. Evidencia: `28-iframe-hostil-<fecha>.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import type { Frame } from '@playwright/test';

import {
  DAPP_ORIGIN,
  EVIDENCE_DIR,
  RUN_DATE,
  conectarDapp,
  cuentasDeLaDapp,
  distDisponible,
  esperarProvider,
  expect,
  openDapp,
  readChromeStorage,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Documento mínimo del iframe hostil: cualquier página web real sirve como anfitrión. */
const HTML_HOSTIL = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><title>Iframe de otro origen</title></head>
  <body><h1 id="hostil">Iframe de otro origen</h1></body>
</html>`;

/** Petición del catálogo hecha DESDE un frame concreto (mismo contrato que `window.truekeate`). */
const pedirDesdeElFrame = async (frame: Frame, method: string): Promise<unknown> =>
  frame.evaluate(async (metodo) => {
    const provider = (
      window as unknown as { truekeate: { request(args: unknown): Promise<unknown> } }
    ).truekeate;
    return provider.request({ method: metodo, params: [] });
  }, method);

test.describe('28 · Iframe cross-origin: aislamiento de la sesión del top', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el iframe de otro origen recibe [] y nunca la cuenta del top', async ({
    context,
    page,
    background,
  }) => {
    test.setTimeout(120_000);
    await seedWallet(background);

    // Servidor efímero del iframe: un origen DISTINTO (127.0.0.1:<puerto> frente a localhost:5174).
    const servidor: Server = createServer((_peticion, respuesta) => {
      respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      respuesta.end(HTML_HOSTIL);
    });
    await new Promise<void>((resolver) => {
      servidor.listen(0, '127.0.0.1', resolver);
    });
    const puerto = (servidor.address() as AddressInfo).port;
    const origenHostil = `http://127.0.0.1:${puerto}`;
    const urlDelIframe = `${origenHostil}/hostil.html`;
    expect(origenHostil).not.toBe(DAPP_ORIGIN);

    try {
      // --- El TOP se conecta de verdad: hay una sesión vigente que podría heredarse ---------------
      await openDapp(page);
      await esperarProvider(page);
      const desenlace = await conectarDapp(context, page);
      expect(desenlace.ok, `el flujo de conexión falló: ${desenlace.resultado}`).toBe(true);
      expect(await cuentasDeLaDapp(page)).toEqual([ANVIL_ADDRESSES[0]]);

      // --- El iframe cross-origin se inyecta en la página del top ----------------------------------
      await page.evaluate(
        (url) =>
          new Promise<void>((resolver) => {
            const marco = document.createElement('iframe');
            marco.id = 'iframe-hostil';
            marco.src = url;
            marco.addEventListener('load', () => resolver(), { once: true });
            document.body.appendChild(marco);
          }),
        urlDelIframe,
      );
      const frame = page.frames().find((candidato) => candidato.url() === urlDelIframe);
      expect(frame, 'no se localizó el frame del iframe hostil').toBeDefined();
      if (frame === undefined) {
        throw new Error('[28-iframe-hostil] frame no encontrado');
      }

      // `all_frames: true` + `document_start`: el provider también existe DENTRO del iframe.
      await frame.waitForFunction(
        () => typeof (window as unknown as { truekeate?: unknown }).truekeate === 'object',
        undefined,
        { timeout: 15_000 },
      );
      expect(await frame.evaluate(() => window.location.origin)).toBe(origenHostil);

      // --- La lectura del iframe NO hereda la sesión del top ---------------------------------------
      const cuentasDelIframe = await pedirDesdeElFrame(frame, 'eth_accounts');
      expect(cuentasDelIframe, 'el iframe heredó la sesión del top').toEqual([]);

      // El top sigue con su cuenta y el mapa de sesiones no ganó ninguna entrada del iframe.
      expect(await cuentasDeLaDapp(page)).toEqual([ANVIL_ADDRESSES[0]]);
      const almacen = await readChromeStorage(background, 'truekeate_connected_sites');
      const sitios = (almacen.truekeate_connected_sites ?? {}) as Record<string, unknown>;
      expect(Object.keys(sitios)).toEqual([DAPP_ORIGIN]);

      // --- `eth_requestAccounts` del iframe entra en SU conexión, no en la del top -----------------
      const esperaVentana = context.waitForEvent('page', { timeout: 20_000 });
      const desenlaceDelIframe = frame.evaluate(async () => {
        const provider = (window as unknown as { truekeate: { request(args: unknown): Promise<unknown> } })
          .truekeate;
        try {
          const cuentas = await provider.request({ method: 'eth_requestAccounts', params: [] });
          return `resuelto:${JSON.stringify(cuentas)}`;
        } catch (error) {
          return `rechazado:${String((error as { code?: unknown }).code)}`;
        }
      });
      const ventana = await esperaVentana;
      await ventana.waitForLoadState('domcontentloaded');
      // La ventana de conexión muestra el origen del IFRAME (nunca el del top).
      await expect(ventana.locator('.tk-connect__origin')).toHaveText(origenHostil, { timeout: 15_000 });
      const origenMostrado = (await ventana.locator('.tk-connect__origin').textContent()) ?? null;
      // Sin decisión del usuario, el plazo inyectado del arnés (2 s) cancela con 4001.
      await expect(desenlaceDelIframe).resolves.toBe('rechazado:4001');
      await ventana.close();

      expect(await cuentasDeLaDapp(page), 'el top perdió o cambió su sesión').toEqual([
        ANVIL_ADDRESSES[0],
      ]);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        join(EVIDENCE_DIR, `28-iframe-hostil-${RUN_DATE}.json`),
        `${JSON.stringify(
          {
            flujo: 'iframe cross-origin: aislamiento de la sesión',
            fecha: RUN_DATE,
            origenDelTop: DAPP_ORIGIN,
            origenDelIframe: origenHostil,
            cuentaDelTop: ANVIL_ADDRESSES[0],
            cuentasTop: await cuentasDeLaDapp(page),
            cuentasIframe: cuentasDelIframe,
            sesionesPersistidas: Object.keys(sitios),
            ethRequestAccountsDelIframe: 'rechazado:4001',
            origenMostradoEnConnectHtml: origenMostrado,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    } finally {
      await new Promise<void>((resolver) => {
        servidor.close(() => resolver());
      });
    }
  });
});
