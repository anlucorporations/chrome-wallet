/**
 * `src/inject/windowContract.spec.ts` — Contrato del provider publicado en `window` (§3.1.7).
 *
 * Verifica sobre jsdom + el stub de `chrome.*` (`test/setup/chrome-stub.ts`):
 *   - `window.truekeate === window.codecrypto`: el alias es el MISMO objeto (H-15 / DEC-21);
 *   - la publicación es NO escribible y NO configurable: la página no puede suplantarla (ADT-26);
 *   - `request` devuelve SIEMPRE una promesa rechazada con `4200` y NUNCA lanza de forma síncrona
 *     mientras el catálogo de H1 está vacío (tarea 1.12);
 *   - el anuncio EIP-6963 responde con `name`, `rdns` y `uuid` congelados (CA-RT-13).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PROVIDER_NAME, PROVIDER_RDNS, PROVIDER_UUID } from '../shared/constants';
import { UNSUPPORTED_METHOD_ERROR, createTruekeateProvider } from './provider';
import { EIP6963_ANNOUNCE_EVENT, EIP6963_REQUEST_EVENT } from './eip6963';
import { unsupportedMethodError } from '../background/rpc/errors';
import { STUB_EXTENSION_ID, isChromeStubInstalled } from '../../test/setup/chrome-stub';
import type { Eip6963ProviderDetail, TruekeateProvider } from '../shared/types';

/** Ventana vista como mapa para leer las propiedades que publica `inject.js`. */
const ventana = (): Record<string, unknown> => window as unknown as Record<string, unknown>;

/** `detail` del último anuncio EIP-6963 observado. */
interface AnuncioObservado {
  info: { name: string; rdns: string; uuid: string; icon: string };
  provider: unknown;
}

/** Anuncia EIP-6963 y devuelve el `detail` observado (o lanza si no hubo anuncio). */
const observarAnuncio = (): AnuncioObservado => {
  const observados: AnuncioObservado[] = [];
  const captura = (evento: Event): void => {
    const detail = (evento as CustomEvent<AnuncioObservado>).detail;
    if (detail !== undefined) observados.push(detail);
  };
  window.addEventListener(EIP6963_ANNOUNCE_EVENT, captura);
  window.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
  window.removeEventListener(EIP6963_ANNOUNCE_EVENT, captura);
  const ultimo = observados.at(-1);
  if (ultimo === undefined) throw new Error('el provider no respondió a eip6963:requestProvider');
  return ultimo;
};

// ---------------------------------------------------------------------------
// Catálogo vacío: `4200` como promesa, jamás como excepción síncrona
// ---------------------------------------------------------------------------

describe('Catálogo vacío de H1: `request` responde 4200 sin lanzar (tarea 1.12)', () => {
  it('rechaza como PROMESA con el literal de `diccionario_datos.md` §4.3', async () => {
    const { provider } = createTruekeateProvider();
    let capturada: Promise<unknown> | undefined;
    expect(() => {
      capturada = provider.request({ method: 'eth_getBalance', params: [] });
    }, 'request lanzó de forma síncrona').not.toThrow();
    expect(capturada).toBeDefined();
    await expect(capturada as Promise<unknown>).rejects.toMatchObject({
      code: UNSUPPORTED_METHOD_ERROR.code,
      message: UNSUPPORTED_METHOD_ERROR.message,
    });
  });

  it('usa EXACTAMENTE el mensaje 4200 de `errors.ts` para cualquier método', async () => {
    const { provider } = createTruekeateProvider();
    for (const method of ['eth_sign', 'eth_requestAccounts', 'personal_sign', 'metodo_inventado']) {
      await expect(provider.request({ method })).rejects.toMatchObject({
        code: 4200,
        message: unsupportedMethodError().message,
      });
    }
  });

  it('publica el catálogo cerrado de 5 eventos EIP-1193 en `on`/`removeListener`', () => {
    const { provider, emit } = createTruekeateProvider();
    const vistos: unknown[] = [];
    const escucha = (dato: unknown): void => {
      vistos.push(dato);
    };

    expect(provider.on('chainChanged', escucha)).toBe(provider);
    emit('chainChanged', '0x7a69');
    expect(vistos).toEqual(['0x7a69']);

    expect(provider.removeListener('chainChanged', escucha)).toBe(provider);
    emit('chainChanged', '0x1');
    expect(vistos).toEqual(['0x7a69']);

    // Evento fuera del catálogo cerrado: se ignora sin romper la página.
    expect(provider.on('eventoInventado' as 'message', escucha)).toBe(provider);
  });
});

// ---------------------------------------------------------------------------
// Publicación en `window`: un único objeto con dos nombres
// ---------------------------------------------------------------------------

describe('Publicación en `window`: `truekeate` y su alias son el MISMO objeto', () => {
  beforeAll(async () => {
    // `inject/index.ts` instala al importarse; se recarga el módulo para ejecutar la
    // instalación de forma explícita y observable en este fichero.
    vi.resetModules();
    await import('./index');
  });

  it('publica los dos nombres apuntando al mismo objeto y con la superficie EIP-1193', () => {
    const provider = ventana().truekeate as TruekeateProvider | undefined;
    expect(provider).toBeDefined();
    expect(ventana().codecrypto).toBe(provider);
    expect(provider?.isTrueKeate).toBe(true);
    expect(typeof provider?.request).toBe('function');
    expect(typeof provider?.on).toBe('function');
    expect(typeof provider?.removeListener).toBe('function');
  });

  it('define las dos propiedades como no escribibles y no configurables (ADT-26)', () => {
    for (const nombre of ['truekeate', 'codecrypto']) {
      const descriptor = Object.getOwnPropertyDescriptor(window, nombre);
      expect(descriptor, `${nombre} no está definido en window`).toBeDefined();
      expect(descriptor?.writable).toBe(false);
      expect(descriptor?.configurable).toBe(false);
      expect(descriptor?.enumerable).toBe(true);
    }
  });

  it('impide que la página sustituya o borre el provider', () => {
    const mapa = ventana();
    expect(() => {
      mapa.truekeate = { request: (): void => undefined };
    }).toThrow(TypeError);
    expect(() => {
      Object.defineProperty(window, 'truekeate', { value: {} });
    }).toThrow(TypeError);
    expect(() => {
      delete mapa.truekeate;
    }).toThrow(TypeError);
    // El provider sigue siendo el original tras los intentos.
    expect(ventana().codecrypto).toBe(ventana().truekeate);
  });

  it('responde 4200 desde el provider ya publicado, sin lanzar de forma síncrona', async () => {
    const provider = ventana().truekeate as TruekeateProvider;
    let capturada: Promise<unknown> | undefined;
    expect(() => {
      capturada = provider.request({ method: 'eth_chainId' });
    }).not.toThrow();
    await expect(capturada as Promise<unknown>).rejects.toMatchObject({ code: 4200 });
  });
});

// ---------------------------------------------------------------------------
// Anuncio EIP-6963
// ---------------------------------------------------------------------------

describe('Anuncio EIP-6963 con identidad congelada (CA-RT-13)', () => {
  it('responde a `eip6963:requestProvider` con name, rdns y uuid literales', () => {
    const detail = observarAnuncio();
    expect(detail.info.name).toBe(PROVIDER_NAME);
    expect(detail.info.rdns).toBe(PROVIDER_RDNS);
    expect(detail.info.uuid).toBe(PROVIDER_UUID);
    // El `detail` referencia el MISMO objeto publicado en `window`.
    expect(detail.provider).toBe(ventana().truekeate);
  });

  it('usa el tipo `Eip6963ProviderDetail` del contrato compartido', () => {
    const detail = observarAnuncio() as unknown as Eip6963ProviderDetail;
    expect(JSON.parse(JSON.stringify(detail.info.uuid))).toBe(PROVIDER_UUID);
  });
});

// ---------------------------------------------------------------------------
// Entorno de pruebas: el stub de `chrome.*` está instalado
// ---------------------------------------------------------------------------

describe('Stub de `chrome.*` activo durante la suite (tarea 1.15)', () => {
  it('publica un `chrome.runtime.id` sintético y resuelve `getURL`', () => {
    expect(isChromeStubInstalled()).toBe(true);
    expect(chrome.runtime.id).toBe(STUB_EXTENSION_ID);
    expect(chrome.runtime.getURL('brand/truekeate-mark-96.png')).toBe(
      `chrome-extension://${STUB_EXTENSION_ID}/brand/truekeate-mark-96.png`,
    );
  });
});
