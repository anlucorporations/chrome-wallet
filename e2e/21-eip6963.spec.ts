/**
 * `e2e/21-eip6963.spec.ts` — Descubrimiento EIP-6963 del provider (H5).
 *
 * `plan_desarrollo.md` §3.5.7 incluye `21-eip6963.spec.ts` en la suite del hito: la dApp de pruebas
 * (`test.html`) registra el escucha de `eip6963:announceProvider` ANTES de pedir el anuncio y
 * publica lo recibido, de modo que el anuncio se comprueba sobre la página REAL y no sobre una
 * sonda inyectada:
 *
 *   · `name` = «TrueKeate», `rdns` = `academy.codecrypto.truekeate` y `uuid` **literal y congelado**
 *     (RT-13 / ADT-19 / D-N: el mismo en cada anuncio y entre recargas);
 *   · `icon` como **data-URI PNG** incrustado (RT-03: sin `fetch` ni recursos remotos);
 *   · `detail.provider` es EXACTAMENTE `window.truekeate` (el alias congelado `window.codecrypto`
 *     apunta al mismo objeto, D-N).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EVIDENCE_DIR,
  RUN_DATE,
  distDisponible,
  esperarProvider,
  expect,
  openDapp,
  test,
} from './fixtures/extension';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Valores vinculantes del anuncio (RT-13 / `diccionario_datos.md` §1). */
const PROVIDER_NAME = 'TrueKeate';
const PROVIDER_RDNS = 'academy.codecrypto.truekeate';

/** Anuncio EIP-6963 tal y como lo ve la dApp (subconjunto comprobable sin cruzar contextos). */
interface AnuncioEip6963 {
  info: { uuid: string; name: string; icon: string; rdns: string };
  /** `true` cuando `detail.provider` es el MISMO objeto que `window.truekeate`. */
  mismoProvider: boolean;
  /** `true` cuando el alias `window.codecrypto` apunta al mismo provider. */
  aliasCongelado: boolean;
}

/** Lee los anuncios capturados por `test.html` (`window.__tkEip6963`). */
const leerAnuncios = (page: Parameters<typeof esperarProvider>[0]): Promise<AnuncioEip6963[]> =>
  page.evaluate(() => {
    const global = window as unknown as {
      __tkEip6963?: Array<{ info: AnuncioEip6963['info']; provider: unknown }>;
      truekeate?: unknown;
      codecrypto?: unknown;
    };
    const recibidos = Array.isArray(global.__tkEip6963) ? global.__tkEip6963 : [];
    return recibidos.map((detalle) => ({
      info: {
        uuid: String(detalle.info.uuid),
        name: String(detalle.info.name),
        icon: String(detalle.info.icon),
        rdns: String(detalle.info.rdns),
      },
      mismoProvider: detalle.provider === global.truekeate,
      aliasCongelado: global.codecrypto === global.truekeate,
    }));
  });

test.describe('21 · EIP-6963: anuncio del provider', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la dApp recibe el anuncio con la identidad vinculante y el icono incrustado', async ({
    context,
  }) => {
    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);

    // `test.html` pide el anuncio al arrancar; el anuncio llega como evento síncrono.
    await expect
      .poll(async () => (await leerAnuncios(dapp)).length, {
        message: 'la dApp no recibió ningún eip6963:announceProvider',
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1);

    const anuncios = await leerAnuncios(dapp);
    const primero = anuncios[0];
    expect(primero).toBeDefined();
    if (primero === undefined) return;

    expect(primero.info.name).toBe(PROVIDER_NAME);
    expect(primero.info.rdns).toBe(PROVIDER_RDNS);
    // UUID v4 con forma canónica y NO regenerado entre anuncios (ADT-19 / D-N).
    expect(primero.info.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(new Set(anuncios.map((anuncio) => anuncio.info.uuid)).size).toBe(1);
    // Icono: data-URI PNG incrustado (RT-03: sin red ni CDN).
    expect(primero.info.icon.startsWith('data:image/png;base64,')).toBe(true);
    expect(primero.info.icon.length).toBeGreaterThan(100);
    // El `provider` anunciado ES el provider de la página, y el alias está congelado.
    expect(primero.mismoProvider).toBe(true);
    expect(primero.aliasCongelado).toBe(true);

    // Un segundo `eip6963:requestProvider` re-anuncia SIN cambiar la identidad.
    const antes = anuncios.length;
    await dapp.click('#btn-eip6963');
    await expect
      .poll(async () => (await leerAnuncios(dapp)).length, {
        message: 'el re-anuncio de eip6963:requestProvider no llegó',
        timeout: 15_000,
      })
      .toBeGreaterThan(antes);
    const despues = await leerAnuncios(dapp);
    expect(despues[despues.length - 1]?.info.uuid).toBe(primero.info.uuid);
    expect(despues[despues.length - 1]?.info.rdns).toBe(PROVIDER_RDNS);
    // El historial de la página deja constancia del anuncio (evidencia observable en pantalla).
    await expect(dapp.locator('#eip6963-lista')).toContainText(PROVIDER_RDNS);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `21-eip6963-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'anuncio EIP-6963 recibido por la dApp de pruebas',
          fecha: RUN_DATE,
          anuncios: anuncios.map((anuncio) => ({
            name: anuncio.info.name,
            rdns: anuncio.info.rdns,
            uuid: anuncio.info.uuid,
            iconBytes: anuncio.info.icon.length,
          })),
          anunciosTrasSolicitar: despues.length,
          uuidEstable: despues[despues.length - 1]?.info.uuid === primero.info.uuid,
          providerIdentico: primero.mismoProvider,
          aliasCongelado: primero.aliasCongelado,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });
});
