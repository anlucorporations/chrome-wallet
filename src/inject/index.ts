/**
 * M37 — `src/inject/index.ts`
 * Entrada SÍNCRONA de `document_start`: publica el provider y su alias, instala el anuncio
 * EIP-6963 y conecta con el content script (M38).
 *
 * Contrato de publicación (ADT-26 / D-S, DEC-21):
 * - `window.truekeate` y `window.codecrypto` apuntan al **MISMO objeto**: no hay copia ni
 *   envoltorio.
 * - Ambos se definen con `Object.defineProperty(..., { writable: false,
 *   configurable: false, enumerable: true })`: la página **no** puede reasignarlos ni
 *   borrarlos para suplantar el provider.
 *
 * Este fichero es el entry de Vite (`inject.js`, formato IIFE) y ejecuta la instalación.
 */

import { PROVIDER_WINDOW_ALIAS, PROVIDER_WINDOW_KEY } from '../shared/constants';
import { installEip6963Announce } from './eip6963';
import { createTruekeateProvider, providerInfo } from './provider';
import type { Eip1193Error, ProviderEventName, TruekeateProvider } from '../shared/types';

/** Marca de instalación: impide publicar el provider dos veces en el mismo documento. */
const INSTALL_FLAG = '__truekeateProviderInstalled__';

/** Peticiones en vuelo: `id` de la página → resolución de la promesa. */
interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Eip1193Error): void;
}

/** Identificador único de petición generado en el contexto de la página. */
const newRequestId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Comprueba si el provider ya está publicado en este documento. */
const alreadyInstalled = (): boolean =>
  (window as unknown as Record<string, unknown>)[INSTALL_FLAG] === true;

/** Mensajes del protocolo que el puente acepta desde el content script. */
const isRelayMessageType = (type: unknown): boolean =>
  type === 'TRUEKEATE_RESPONSE' || type === 'TRUEKEATE_EVENT' || type === 'TRUEKEATE_ANNOUNCE';

/** Publica el provider, el alias, el anuncio EIP-6963 y el puente con el content script. */
export const installProvider = (): TruekeateProvider => {
  const { provider, emit } = createTruekeateProvider();

  /** Correlación de peticiones de la página; se activa de verdad en H3. */
  const pending = new Map<string, PendingCall>();
  void newRequestId;
  void pending;

  /**
   * Puerto de salida hacia el content script. En H1 el catálogo está VACÍO, así que la
   * petición se resuelve con `4200` sin lanzar de forma síncrona (el `request` original ya
   * devuelve una promesa rechazada). La ruta página → content → SW se abre en H3.
   */
  const requestFromPage = provider.request.bind(provider);

  // Puerto de entrada: respuestas y eventos reenviados por el content script.
  window.addEventListener('message', (event: MessageEvent) => {
    // Validación obligatoria del canal externo: `event.source === window` y
    // `event.origin === location.origin`; cualquier otro mensaje se descarta.
    if (event.source !== window || event.origin !== location.origin) {
      return;
    }
    const data: unknown = event.data;
    if (typeof data !== 'object' || data === null) {
      return;
    }
    const message = data as {
      type?: unknown;
      id?: unknown;
      error?: unknown;
      result?: unknown;
      eventName?: unknown;
    };
    if (!isRelayMessageType(message.type)) {
      return;
    }
    if (message.type === 'TRUEKEATE_RESPONSE') {
      const id = typeof message.id === 'string' ? message.id : null;
      if (id === null) {
        return;
      }
      const call = pending.get(id);
      if (call === undefined) {
        return;
      }
      pending.delete(id);
      if (message.error !== undefined) {
        call.reject(message.error as Eip1193Error);
      } else {
        call.resolve(message.result);
      }
      return;
    }
    if (message.type === 'TRUEKEATE_EVENT') {
      emit(message.eventName as ProviderEventName, message.result);
      return;
    }
    // `TRUEKEATE_ANNOUNCE` viaja en sentido inject → content: aquí solo se ignora.
  });

  // Publicación con definición NO configurable: la página no puede suplantar el provider.
  const descriptor: PropertyDescriptor = {
    value: provider,
    writable: false,
    configurable: false,
    enumerable: true,
  };
  Object.defineProperty(window, PROVIDER_WINDOW_KEY, descriptor);
  Object.defineProperty(window, PROVIDER_WINDOW_ALIAS, descriptor);

  // Anuncio EIP-6963: listener síncrono + auto-anuncio + re-anuncio en DOMContentLoaded.
  // El aviso `onAnnounce` reenvía el `detail` al content script (M38) por si su listener no
  // estaba registrado cuando el provider se publicó en `document_start`.
  installEip6963Announce(provider, (detail) => {
    window.postMessage({ type: 'TRUEKEATE_ANNOUNCE', info: detail }, location.origin);
  });

  // Saludo al content script (M38). El primer anuncio reenvía este mensaje de forma SÍNCRONA;
  // un segundo intento a los 100 ms cubre el caso de que el relay se registre un instante
  // después (ambos saltos ocurren en `document_start`).
  const announceToRelay = (): void => {
    window.postMessage({ type: 'TRUEKEATE_ANNOUNCE', info: providerInfo('') }, location.origin);
  };
  setTimeout(announceToRelay, 100);

  // Marca de instalación: no enumerable y no configurable.
  Object.defineProperty(window, INSTALL_FLAG, {
    value: true,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  // `requestFromPage` queda referenciado para el puente de H3; en H1 se usa el original.
  void requestFromPage;

  return provider;
};

if (!alreadyInstalled()) {
  installProvider();
}
