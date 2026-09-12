/**
 * `src/inject/inject.spec.ts` — Superficie publicada del provider (H3, tareas 3.8 y 3.9).
 *
 * Cubre `CA-RF-13` (alias `window.truekeate === window.codecrypto` y superficie
 * `request`/`on`/`removeListener`), `CA-RF-14`/`CA-RF-45` (método fuera del catálogo → `4200` con
 * el literal de `diccionario_datos.md` §4.3 y **nunca** un lanzamiento síncrono) y
 * `CA-RF-15` (las escuchas de `on` reciben el evento y `removeListener` deja de invocarlas).
 *
 * Las aserciones NO son tautológicas: el literal del provider se compara con el MISMO literal que
 * responde el Service Worker (`background/rpc/errors.ts`), de modo que una divergencia entre las
 * dos capas rompe la suite; y el icono EIP-6963 se decodifica del data-URI para medir sus 96 px
 * reales en la cabecera IHDR del PNG.
 *
 * El módulo `./index` es un entry con efecto de instalación: al importarlo publica el provider con
 * `Object.defineProperty(..., { writable: false, configurable: false })`. En jsdom no hay
 * `document.currentScript` marcado por el relay, así que la superficie se publica SIN catálogo
 * remoto: es justo el caso «sin content script al otro lado» que exige responder `4200`.
 *
 * Módulo(s) de contrato: M35, M37 y M56.
 */

import { describe, expect, it, vi } from 'vitest';

import { unsupportedMethodError as serviceWorkerUnsupportedMethodError } from '../background/rpc/errors';
import {
  PROVIDER_NAME,
  PROVIDER_RDNS,
  PROVIDER_UUID,
  PROVIDER_WINDOW_ALIAS,
  PROVIDER_WINDOW_KEY,
} from '../shared/constants';
import type { ProviderEventName, TruekeateProvider } from '../shared/types';
import { manifest } from '../manifest';
import { EIP6963_ANNOUNCE_EVENT, EIP6963_REQUEST_EVENT } from './eip6963';
import {
  createTruekeateProvider,
  providerInfo,
  UNSUPPORTED_METHOD_ERROR,
  type ProviderRelay,
} from './provider';
// Entry real (M37): instala el provider, el alias, el anuncio EIP-6963 y el puente.
import './index';

/** Provider publicado en `window` por el entry `./index`. */
const publicado = (globalThis as unknown as Record<string, unknown>)[
  PROVIDER_WINDOW_KEY
] as TruekeateProvider;

/** Alias publicado en `window` por el entry `./index`. */
const alias = (globalThis as unknown as Record<string, unknown>)[
  PROVIDER_WINDOW_ALIAS
] as unknown;

/** Relay de prueba: `attached` decide si el provider cree tener content script al otro lado. */
const relayOf = (outcome: unknown, attached = true): ProviderRelay => ({
  attached,
  send: vi.fn(async () => outcome as { result: unknown }),
});

describe('M37 · publicación del provider y su alias (CA-RF-13)', () => {
  it('el content script se inyecta en TODAS las páginas y frames (`all_frames` + `document_start`)', () => {
    const contentScripts = manifest.content_scripts;
    expect(contentScripts).toHaveLength(1);
    expect([...(contentScripts[0]?.matches ?? [])]).toContain('<all_urls>');
    expect(contentScripts[0]?.all_frames, 'sin `all_frames` el iframe no tendría provider').toBe(true);
    expect(contentScripts[0]?.run_at).toBe('document_start');
    expect([...(contentScripts[0]?.js ?? [])]).toEqual(['content-script.js']);
    // Lista CERRADA de exclusiones: solo donde ya hay otro provider declarado (§2.4).
    expect([...(contentScripts[0]?.exclude_matches ?? [])]).toEqual([
      'https://metamask.io/*',
      'https://*.metamask.io/*',
    ]);
  });

  it('publica `window.truekeate` y `window.codecrypto` como el MISMO objeto', () => {
    expect(publicado).toBeDefined();
    expect(alias).toBeDefined();
    expect(alias, 'el alias debe ser EXACTAMENTE el mismo objeto que window.truekeate').toBe(
      publicado,
    );
    expect(publicado.isTrueKeate).toBe(true);
  });

  it('expone `request`, `on` y `removeListener` como funciones encadenables', () => {
    for (const nombre of ['request', 'on', 'removeListener'] as const) {
      expect(typeof publicado[nombre], `falta ${nombre} en la superficie del provider`).toBe(
        'function',
      );
    }
    const escucha = (): void => undefined;
    expect(publicado.on('accountsChanged', escucha)).toBe(publicado);
    expect(publicado.removeListener('accountsChanged', escucha)).toBe(publicado);
  });

  it('define las dos claves como NO configurables y NO escribibles (la página no suplanta)', () => {
    for (const clave of [PROVIDER_WINDOW_KEY, PROVIDER_WINDOW_ALIAS]) {
      const descriptor = Object.getOwnPropertyDescriptor(window, clave);
      expect(descriptor, `falta el descriptor de window.${clave}`).toBeDefined();
      expect(descriptor?.configurable).toBe(false);
      expect(descriptor?.writable).toBe(false);
      expect(typeof descriptor?.value).toBe('object');
      // `Reflect.deleteProperty` sobre una propiedad no configurable devuelve `false`.
      expect(Reflect.deleteProperty(window, clave)).toBe(false);
      expect((globalThis as unknown as Record<string, unknown>)[clave]).toBe(publicado);
    }
  });
});

describe('M35 · catálogo cerrado del provider (CA-RF-14 / CA-RF-45)', () => {
  it('un método fuera del catálogo (`eth_sign`) responde 4200 con el literal de §4.3, sin lanzar', async () => {
    // Ningún método puede lanzar de forma SÍNCRONA: `request` devuelve siempre una promesa.
    let promesa: Promise<unknown> | null = null;
    expect(() => {
      promesa = publicado.request({ method: 'eth_sign' });
    }).not.toThrow();
    expect(promesa).toBeInstanceOf(Promise);

    await expect(promesa as unknown as Promise<unknown>).rejects.toEqual({
      code: 4200,
      message: 'El método solicitado no está soportado por TrueKeate Wallet.',
    });
  });

  it('el literal del provider es EL MISMO que responde el Service Worker (fuente única)', () => {
    // El bundle de `inject.js` no importa módulos del SW (§2.2): el literal se transcribe. Si las
    // dos capas divergen, la página vería dos mensajes distintos para la misma causa.
    expect(UNSUPPORTED_METHOD_ERROR).toEqual(serviceWorkerUnsupportedMethodError());
    expect(providerInfo('x')).toMatchObject({ name: PROVIDER_NAME, rdns: PROVIDER_RDNS });
  });

  it('sin relay (sin content script) todo método del catálogo responde 4200 en vez de colgarse', async () => {
    // El entry se cargó en jsdom sin `data-truekeate-inject="1"`: `relayAttached()` es false.
    await expect(publicado.request({ method: 'eth_chainId' })).rejects.toEqual(
      serviceWorkerUnsupportedMethodError(),
    );
    await expect(publicado.request({ method: 'eth_requestAccounts' })).rejects.toEqual(
      serviceWorkerUnsupportedMethodError(),
    );
  });

  it('un `args` malformado no lanza: se responde el error tipado del catálogo', async () => {
    await expect(
      publicado.request(undefined as unknown as { method: string }),
    ).rejects.toMatchObject({ code: 4200 });
    await expect(
      publicado.request({ method: '' } as unknown as { method: string }),
    ).rejects.toMatchObject({ code: 4200 });
  });
});

describe('M35 · escuchas y cachés del provider (CA-RF-15)', () => {
  it('`on` entrega el evento y refresca `selectedAddress`; `removeListener` deja de invocarlo', () => {
    const { provider, emit } = createTruekeateProvider(relayOf({ result: [] }));
    const escucha = vi.fn();
    provider.on('accountsChanged', escucha);

    emit('accountsChanged', ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']);
    expect(escucha).toHaveBeenCalledTimes(1);
    expect(escucha).toHaveBeenLastCalledWith(['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']);
    expect(provider.selectedAddress).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');

    provider.removeListener('accountsChanged', escucha);
    emit('accountsChanged', ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8']);
    // La escucha NO vuelve a invocarse, pero la caché del provider SÍ se actualiza (es estado suyo).
    expect(escucha).toHaveBeenCalledTimes(1);
    expect(provider.selectedAddress).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  });

  it('`eth_chainId` con relay responde y deja `chainId` cacheado; `disconnect` limpia las cachés', async () => {
    const { provider, emit } = createTruekeateProvider(relayOf({ result: '0x7a69' }));
    expect(provider.chainId).toBeNull();

    await expect(provider.request({ method: 'eth_chainId' })).resolves.toBe('0x7a69');
    expect(provider.chainId).toBe('0x7a69');

    emit('accountsChanged', ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']);
    emit('disconnect', { code: 4900, message: 'Sin conexión con la red local (Anvil).' });
    expect(provider.chainId).toBeNull();
    expect(provider.selectedAddress).toBeNull();
  });

  it('un evento fuera del catálogo se ignora y una escucha hostil no rompe al resto', () => {
    const { provider, emit } = createTruekeateProvider(relayOf({ result: [] }));
    const hostil = vi.fn(() => {
      throw new Error('escucha hostil');
    });
    const sana = vi.fn();
    provider.on('accountsChanged', hostil);
    provider.on('accountsChanged', sana);

    // `accountsChanged` está en el catálogo cerrado de 5: el hostil falla, el sano recibe igual.
    expect(() => {
      emit('accountsChanged', []);
    }).not.toThrow();
    expect(hostil).toHaveBeenCalledTimes(1);
    expect(sana).toHaveBeenCalledTimes(1);

    // Un nombre fuera de `PROVIDER_EVENTS` no registra nada ni lanza.
    const fantasma = vi.fn();
    provider.on('eventoInventado' as ProviderEventName, fantasma);
    emit('eventoInventado' as ProviderEventName, { x: 1 });
    expect(fantasma).not.toHaveBeenCalled();
  });

  it('el error de §4.3 viaja como objeto clonable (cruzará `window.postMessage`)', () => {
    // `postMessage` clona con el algoritmo de *structured clone*: el error debe sobrevivir.
    const clon = structuredClone(UNSUPPORTED_METHOD_ERROR) as { code: number; message: string };
    expect(clon).toEqual(UNSUPPORTED_METHOD_ERROR);
    expect(clon.code).toBe(4200);
  });
});

describe('M36 · anuncio EIP-6963 (CA-RF-45 / RT-13)', () => {
  it('responde a `eip6963:requestProvider` con uuid literal, name, rdns e icono PNG de 96 px', () => {
    const anuncios: Array<{ info: Record<string, unknown>; provider: unknown }> = [];
    window.addEventListener(EIP6963_ANNOUNCE_EVENT, (evento) => {
      const detail = (evento as CustomEvent<{ info: Record<string, unknown>; provider: unknown }>)
        .detail;
      anuncios.push(detail);
    });

    window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));

    expect(anuncios.length, 'el listener de requestProvider no anunció nada').toBeGreaterThan(0);
    const ultimo = anuncios[anuncios.length - 1];
    expect(ultimo).toBeDefined();

    // `detail.provider` debe ser EL MISMO objeto publicado en `window.truekeate` (§4.1.1).
    expect(ultimo?.provider).toBe(publicado);
    expect(ultimo?.info.uuid).toBe(PROVIDER_UUID);
    expect(ultimo?.info.uuid).toBe('9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90');
    expect(ultimo?.info.name).toBe('TrueKeate');
    expect(ultimo?.info.rdns).toBe('academy.codecrypto.truekeate');

    // El icono es un PNG REAL de 96×96: se leen los 8 bytes de firma y el IHDR.
    const icon = String(ultimo?.info.icon ?? '');
    expect(icon.startsWith('data:image/png;base64,')).toBe(true);
    const bytes = Buffer.from(icon.slice('data:image/png;base64,'.length), 'base64');
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect(bytes.readUInt32BE(16), 'ancho del icono del anuncio').toBe(96);
    expect(bytes.readUInt32BE(20), 'alto del icono del anuncio').toBe(96);
  });

  it('el `uuid` es un literal congelado: dos anuncios seguidos publican el mismo', () => {
    const uuids: unknown[] = [];
    const recoger = (evento: Event): void => {
      uuids.push((evento as CustomEvent<{ info: { uuid: unknown } }>).detail.info.uuid);
    };
    window.addEventListener(EIP6963_ANNOUNCE_EVENT, recoger);
    window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
    window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
    window.removeEventListener(EIP6963_ANNOUNCE_EVENT, recoger);

    expect(uuids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(uuids).size).toBe(1);
    expect(uuids[0]).toBe(PROVIDER_UUID);
  });
});
