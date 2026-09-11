/**
 * M35 — `src/inject/provider.ts`
 * Objeto EIP-1193 publicado en la página: `request` / `on` / `removeListener`.
 *
 * Alcance de H1 (andamiaje): el catálogo RPC del provider está CERRADO y VACÍO. `request`
 * devuelve SIEMPRE una promesa rechazada con el error EIP-1193 `4200 Unsupported method`,
 * y lo hace SIN lanzar de forma síncrona (`plan_desarrollo.md` §3.1.5, tarea 1.12).
 *
 * El objeto publicado NO se puede sustituir ni borrar por la página: `inject/index.ts` lo
 * define con `Object.defineProperty(..., { writable: false, configurable: false })`
 * (ADT-26 / D-S).
 */

import {
  PROVIDER_NAME,
  PROVIDER_RDNS,
  PROVIDER_UUID,
  PROVIDER_EVENTS,
} from '../shared/constants';
import type {
  ChainIdHex,
  Eip1193Error,
  Eip6963ProviderInfo,
  ProviderEventName,
  ProviderListener,
  RequestArguments,
  TruekeateProvider,
} from '../shared/types';

/** Error EIP-1193 `4200` mientras el catálogo siga vacío (mensaje de diccionario §4.3). */
export const UNSUPPORTED_METHOD_ERROR: Eip1193Error = {
  code: 4200,
  message: 'El método solicitado no está soportado por TrueKeate Wallet.',
};

/** `info` del anuncio EIP-6963 (valores vinculantes de RT-13 / D-A). */
export const providerInfo = (icon: string): Eip6963ProviderInfo => ({
  uuid: PROVIDER_UUID,
  name: PROVIDER_NAME,
  icon,
  rdns: PROVIDER_RDNS,
});

/** Piezas devueltas por la fábrica: el provider y el emisor interno de eventos. */
export interface TruekeateProviderHandle {
  provider: TruekeateProvider;
  /** Emite un evento del catálogo a las escuchas de la página (uso interno del puente). */
  emit(eventName: ProviderEventName, data: unknown): void;
}

/**
 * Construye el objeto provider y su emisor de eventos. Es una fábrica (y no un singleton de
 * módulo) para que `inject/index.ts` publique exactamente UNA instancia y su alias apunte a
 * ella.
 */
export const createTruekeateProvider = (): TruekeateProviderHandle => {
  /** Registro de escuchas por evento. Estado volátil del contexto de la página. */
  const listeners = new Map<ProviderEventName, Set<ProviderListener>>();

  const provider: TruekeateProvider = {
    isTrueKeate: true,
    chainId: null as ChainIdHex | null,
    selectedAddress: null,

    /**
     * Toda petición se rechaza como PROMESA (nunca lanza de forma síncrona). En H1 no hay
     * ningún método implementado, así que la respuesta es `4200` en todos los casos.
     */
    request(args: RequestArguments): Promise<unknown> {
      void args;
      return Promise.reject({
        code: UNSUPPORTED_METHOD_ERROR.code,
        message: UNSUPPORTED_METHOD_ERROR.message,
      });
    },

    on(eventName: ProviderEventName, listener: ProviderListener): TruekeateProvider {
      if (!PROVIDER_EVENTS.includes(eventName)) {
        // Evento fuera del catálogo cerrado: se ignora sin romper la página.
        return provider;
      }
      const bucket = listeners.get(eventName) ?? new Set<ProviderListener>();
      bucket.add(listener);
      listeners.set(eventName, bucket);
      return provider;
    },

    removeListener(eventName: ProviderEventName, listener: ProviderListener): TruekeateProvider {
      listeners.get(eventName)?.delete(listener);
      return provider;
    },
  };

  const emit = (eventName: ProviderEventName, data: unknown): void => {
    const bucket = listeners.get(eventName);
    if (bucket === undefined) {
      return;
    }
    bucket.forEach((listener) => {
      listener(data);
    });
  };

  return { provider, emit };
};
