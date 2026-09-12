/**
 * `e2e/07-provider.spec.ts` — Provider publicado en la página (H3, tarea 3.16).
 *
 * §3.3.7: «`07-provider.spec.ts` (alias, ID de extensión estable entre ejecuciones)» y §3.3.6
 * `CA-RF-13`/`CA-RF-45`: `window.truekeate === window.codecrypto` (el MISMO objeto), la superficie
 * `request`/`on`/`removeListener`, la inyección en todas las páginas y el anuncio EIP-6963 con el
 * `uuid` literal, `name: 'TrueKeate'`, `rdns` y un icono PNG de 96 px.
 *
 * El ID de la extensión NUNCA se escribe a mano: se descubre del Service Worker y se contrasta con
 * el derivado de la `key` del manifest (`expectedExtensionId`). Evidencia: `07-provider-<fecha>.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DAPP_ORIGIN,
  EVIDENCE_DIR,
  RUN_DATE,
  anvilResponde,
  consultarAlNodo,
  distDisponible,
  esperarProvider,
  expect,
  expectedExtensionId,
  extensionUrl,
  openDapp,
  pedirALaDapp,
  readChromeStorage,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

/** Motivo accionable del salto cuando `dist/` no existe. */
const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Datos del anuncio EIP-6963 medidos EN la página. */
interface AnuncioMedido {
  uuid: string;
  name: string;
  rdns: string;
  icon: string;
  providerEsElPublicado: boolean;
  ancho: number;
  alto: number;
  firmaPng: number[];
}

/**
 * Evidencia ACUMULADA del fichero: cada prueba aporta su medición y vuelca el documento completo en
 * `07-provider-<fecha>.json`. Así el artefacto final reúne el alias, el ID estable, el anuncio
 * EIP-6963 y las lecturas contra Anvil, sin que una prueba pise lo que midió la anterior.
 */
const evidencia: Record<string, unknown> = { fecha: RUN_DATE };

/** Vuelca la evidencia acumulada más lo que aporta la prueba actual. */
function escribirEvidencia(aporte: Record<string, unknown>): void {
  Object.assign(evidencia, aporte);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, `07-provider-${RUN_DATE}.json`),
    `${JSON.stringify(evidencia, null, 2)}\n`,
    'utf8',
  );
}

test.describe('07 · Provider, alias e identidad EIP-6963', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test.beforeEach(async ({ background }) => {
    // Cartera con las 5 cuentas de Anvil: la dApp necesita un estado coherente (no dañado).
    await seedWallet(background);
  });

  test('la dApp recibe `window.truekeate === window.codecrypto` con la superficie completa', async ({
    context,
    extensionId,
    page,
  }) => {
    await openDapp(page);

    const superficie = await page.evaluate(() => {
      const global = window as unknown as Record<string, unknown>;
      const provider = global.truekeate as
        | { isTrueKeate?: unknown; request?: unknown; on?: unknown; removeListener?: unknown }
        | undefined;
      const descriptor = Object.getOwnPropertyDescriptor(window, 'truekeate');
      const descriptorAlias = Object.getOwnPropertyDescriptor(window, 'codecrypto');
      const inyectado = document.querySelector('script[data-truekeate-inject="1"]');
      return {
        aliasEsElMismoObjeto: provider !== undefined && provider === global.codecrypto,
        isTrueKeate: provider?.isTrueKeate === true,
        metodos: ['request', 'on', 'removeListener'].filter(
          (nombre) => typeof (provider as Record<string, unknown> | undefined)?.[nombre] === 'function',
        ),
        configurable: descriptor?.configurable,
        escribible: descriptor?.writable,
        aliasConfigurable: descriptorAlias?.configurable,
        srcInyectado: inyectado?.getAttribute('src') ?? null,
      };
    });

    expect(superficie.aliasEsElMismoObjeto, 'window.codecrypto no es el MISMO objeto').toBe(true);
    expect(superficie.isTrueKeate).toBe(true);
    expect(superficie.metodos).toEqual(['request', 'on', 'removeListener']);
    // La página NO puede suplantar al provider: la propiedad es no configurable y no escribible.
    expect(superficie.configurable).toBe(false);
    expect(superficie.escribible).toBe(false);
    expect(superficie.aliasConfigurable).toBe(false);
    // La prueba de inyección del relay (M38): el bundle va marcado con `data-truekeate-inject="1"`.
    const srcInyectado = String(superficie.srcInyectado);
    expect(srcInyectado).toMatch(/^chrome-extension:\/\/[^/]+\/inject\.js$/);
    // `use_dynamic_url: true` (manifest): el recurso se sirve con un identificador DINÁMICO por
    // sesión en lugar del ID de la extensión, de modo que una página no puede correlacionarlo.
    const hostDelRecurso = new URL(srcInyectado).host;
    expect(hostDelRecurso).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(hostDelRecurso).not.toBe(extensionId);

    // El destino de la inyección es el origen de la dApp, no una página interna de la extensión.
    expect(await page.evaluate(() => window.location.origin)).toBe(DAPP_ORIGIN);
    expect(await context.pages().length).toBeGreaterThan(0);
  });

  test('el ID de la extensión es el derivado de la `key` del manifest (estable entre ejecuciones)', async ({
    extensionId,
    background,
  }) => {
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    expect(extensionId).toBe(expectedExtensionId());
    // Y el Service Worker vive en ESE ID: el oráculo no depende del orden de arranque.
    expect(background.url()).toBe(extensionUrl(extensionId, 'background.js'));

    // La siembra del catálogo la hace el ARRANQUE del Service Worker: se espera la condición
    // observable (la clave existe) en lugar de suponer que ya se escribió (mismo criterio que el
    // resto del arnés: sin esperas fijas). El oráculo no cambia.
    await expect
      .poll(
        async () =>
          Object.keys(await readChromeStorage(background, 'truekeate_networks')).length,
        { message: 'la red por defecto no se sembró al arrancar el SW', timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    const almacen = await readChromeStorage(background, 'truekeate_networks');
    expect(almacen).toHaveProperty('truekeate_networks');

    // Evidencia del hito (§7.4.1.f).
    escribirEvidencia({
      flujoAliasYId: 'provider: alias e ID estable',
      extensionIdDescubierto: extensionId,
      extensionIdDerivadoDeLaKey: expectedExtensionId(),
      coincide: extensionId === expectedExtensionId(),
      backgroundUrl: background.url(),
      origenDeLaDapp: DAPP_ORIGIN,
    });
  });

  test('el anuncio EIP-6963 publica uuid literal, name, rdns y un icono PNG de 96 px', async ({
    page,
    extensionId,
  }) => {
    await openDapp(page);

    const anuncio = await page.evaluate(async (): Promise<AnuncioMedido | null> => {
      const capturado = await new Promise<{
        info: { uuid: string; name: string; rdns: string; icon: string };
        provider: unknown;
      } | null>((resolve) => {
        const temporizador = setTimeout(() => {
          resolve(null);
        }, 4_000);
        window.addEventListener(
          'eip6963:announceProvider',
          (evento) => {
            clearTimeout(temporizador);
            resolve((evento as CustomEvent<never>).detail as never);
          },
          { once: true },
        );
        // El listener se registra ANTES de pedir el anuncio: si no, se perdería.
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      });
      if (capturado === null) {
        return null;
      }
      const icono = capturado.info.icon;
      const bytes = Uint8Array.from(atob(icono.split(',')[1] ?? ''), (caracter) =>
        caracter.charCodeAt(0),
      );
      const vista = new DataView(bytes.buffer);
      return {
        uuid: capturado.info.uuid,
        name: capturado.info.name,
        rdns: capturado.info.rdns,
        icon: icono.slice(0, 22),
        providerEsElPublicado:
          capturado.provider === (window as unknown as { truekeate?: unknown }).truekeate,
        ancho: vista.getUint32(16),
        alto: vista.getUint32(20),
        firmaPng: [...bytes.slice(0, 8)],
      };
    });

    expect(anuncio, 'la dApp no recibió `eip6963:announceProvider`').not.toBeNull();
    expect(anuncio?.uuid).toBe('9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90');
    expect(anuncio?.name).toBe('TrueKeate');
    expect(anuncio?.rdns).toBe('academy.codecrypto.truekeate');
    expect(anuncio?.providerEsElPublicado, 'el `provider` del detail no es window.truekeate').toBe(
      true,
    );
    expect(anuncio?.icon).toBe('data:image/png;base64,');
    expect(anuncio?.firmaPng).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(anuncio?.ancho, 'el icono del anuncio no mide 96 px de ancho').toBe(96);
    expect(anuncio?.alto, 'el icono del anuncio no mide 96 px de alto').toBe(96);

    escribirEvidencia({
      flujoEip6963: 'provider: anuncio EIP-6963',
      extensionId,
      uuid: anuncio?.uuid,
      name: anuncio?.name,
      rdns: anuncio?.rdns,
      icono: `${anuncio?.icon}… (${anuncio?.ancho}×${anuncio?.alto} px)`,
      firmaPng: anuncio?.firmaPng,
      providerDelDetailEsElPublicado: anuncio?.providerEsElPublicado,
    });
  });

  test('el provider responde 4200 SIN lanzar de forma síncrona ante un método desconocido', async ({
    page,
  }) => {
    await openDapp(page);

    const observado = await page.evaluate(async () => {
      const provider = (window as unknown as { truekeate: { request(args: unknown): Promise<unknown> } })
        .truekeate;
      let sincrono = false;
      let promesa: Promise<unknown> | null = null;
      try {
        promesa = provider.request({ method: 'eth_sign' });
      } catch {
        sincrono = true;
      }
      let error: unknown = null;
      try {
        await promesa;
      } catch (causa) {
        error = causa;
      }
      return { sincrono, error };
    });

    expect(observado.sincrono, 'el provider lanzó de forma síncrona').toBe(false);
    expect(observado.error).toEqual({
      code: 4200,
      message: 'El método solicitado no está soportado por TrueKeate Wallet.',
    });
  });

  test('la dApp lee `eth_chainId` 0x7a69, bloque ≥ 1 y el SALDO real de Anvil (CA-RF-18)', async ({
    page,
  }) => {
    await openDapp(page);
    await esperarProvider(page);
    // El contraste es el propio nodo: sin él la prueba no mediría nada.
    expect(await anvilResponde()).toBe(true);

    const chainId = await pedirALaDapp(page, 'eth_chainId');
    expect(chainId).toEqual({ ok: true, valor: '0x7a69' });
    expect(await consultarAlNodo('eth_chainId')).toBe('0x7a69');

    // Un Anvil recién arrancado está en el bloque 0: se minan dos bloques para que la cota «≥ 1»
    // de CA-RF-18 sea observable. La mina se pide AL NODO (no al provider) y luego se contrasta.
    await consultarAlNodo('anvil_mine', ['0x2']);
    const bloqueDelNodo = await consultarAlNodo('eth_blockNumber');
    const numeroDeBloque = Number.parseInt(String(bloqueDelNodo), 16);
    expect(numeroDeBloque, 'eth_blockNumber debe ser ≥ 1').toBeGreaterThanOrEqual(1);

    const bloque = await pedirALaDapp(page, 'eth_blockNumber');
    expect(bloque.ok).toBe(true);
    // El provider devuelve EXACTAMENTE el número de bloque del nodo.
    expect(bloque.ok ? bloque.valor : null).toBe(bloqueDelNodo);

    // El saldo que ve la dApp es EXACTAMENTE el que responde Anvil (misma magnitud, otra vía).
    const saldo = await pedirALaDapp(page, 'eth_getBalance', [ANVIL_ADDRESSES[0], 'latest']);
    expect(saldo.ok).toBe(true);
    const saldoDelNodo = await consultarAlNodo('eth_getBalance', [ANVIL_ADDRESSES[0], 'latest']);
    expect(saldo.ok ? saldo.valor : null).toBe(saldoDelNodo);
    expect(BigInt(String(saldoDelNodo))).toBeGreaterThan(0n);

    escribirEvidencia({
      flujoLecturas: 'provider: lecturas contra Anvil',
      ethChainId: chainId.ok ? chainId.valor : null,
      ethBlockNumber: bloque.ok ? bloque.valor : null,
      ethBlockNumberDelNodo: bloqueDelNodo,
      ethBlockNumberDecimal: numeroDeBloque,
      bloqueDelNodoDecimal: Number.parseInt(String(bloqueDelNodo), 16),
      ethGetBalance: saldo.ok ? saldo.valor : null,
      ethGetBalanceDelNodo: saldoDelNodo,
      coincideConElNodo: (saldo.ok ? saldo.valor : null) === saldoDelNodo,
      coincideElBloque: (bloque.ok ? bloque.valor : null) === bloqueDelNodo,
    });
  });
});
