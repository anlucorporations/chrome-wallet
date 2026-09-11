/**
 * M37 — `src/inject/index.ts`
 * Entrada **SÍNCRONA** de `document_start`: publica el provider y su alias, instala el anuncio
 * EIP-6963, inyecta el puente con el content script (M38) y correlaciona las respuestas.
 *
 * CONTRATO DE PUBLICACIÓN (ADT-26 / D-S, DEC-21; `plan_desarrollo.md` §3.3.6 `CA-RF-13`)
 * - `window.truekeate` y `window.codecrypto` apuntan al **MISMO objeto**: no hay copia ni
 *   envoltorio.
 * - Ambos se definen con `Object.defineProperty(..., { writable: false, configurable: false,
 *   enumerable: true })`: la página **no** puede reasignarlos ni borrarlos para suplantar al
 *   provider.
 *
 * SALTO 1 DEL PROTOCOLO (`diccionario_datos.md` §4.1 y `documento_tecnico.md` §2.5.1)
 * - Salida: `TRUEKEATE_REQUEST { type, id, method, params }` y `TRUEKEATE_ANNOUNCE { type, info }`.
 * - Entrada: `TRUEKEATE_RESPONSE { type, id, result | error }` y `TRUEKEATE_EVENT
 *   { type, eventName, data }`.
 * - **Todo** `postMessage` saliente usa `targetOrigin = location.origin`, **nunca** `'*'` (H-32,
 *   RNF-10), y todo mensaje entrante se valida con `event.source === window` **y**
 *   `event.origin === location.origin`.
 * - Ningún secreto cruza el canal (RNF-09): solo método, `params` y resultado público.
 *
 * Este fichero es el entry de Vite (`inject.js`, formato IIFE) y ejecuta la instalación.
 */

import {
  PROVIDER_WINDOW_ALIAS,
  PROVIDER_WINDOW_KEY,
  SIGN_TIMEOUT_MS,
  TIMEOUT_SAFETY_MARGIN_MS,
} from '../shared/constants';
import type { TruekeateRequestMessage } from '../shared/protocol';
import type { Eip1193Error, Eip6963ProviderInfo, TruekeateProvider } from '../shared/types';
import { installEip6963Announce } from './eip6963';
import {
  createTruekeateProvider,
  internalTransportError,
  isProviderEvent,
  pageTimeoutError,
  type ProviderRelay,
  type ProviderRelayOutcome,
} from './provider';

/**
 * Atributo con el que el relay (M38) marca la etiqueta `<script>` que inyecta. Es la **prueba de
 * inyección** que este módulo exige para creer que hay content script al otro lado: ninguna otra
 * ruta de carga (importación directa en el arnés de pruebas, o una copia que la propia página
 * cargue con el mismo `src` para suplantar al provider) lleva la marca.
 */
const RELAY_INJECT_ATTRIBUTE = 'data-truekeate-inject';

/** Marca de instalación: impide publicar el provider dos veces en el mismo documento. */
const INSTALL_FLAG = '__truekeateProviderInstalled__';

/**
 * Red de seguridad de la capa inject/content (**H-07**): el plazo del Service Worker más un
 * margen, de modo que la red del SW venza siempre ANTES que la de la página y el error que ve la
 * dApp siga siendo el del dueño único del plazo (`4xxx` del catálogo de §4.3).
 */
const PAGE_REQUEST_TIMEOUT_MS = SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS;

/** Segundos que declara el literal de vencimiento de §4.3 (120 s de firma/aprobación). */
const PAGE_REQUEST_TIMEOUT_SECONDS = Math.round(SIGN_TIMEOUT_MS / 1_000);

/** Identificador único de petición, generado en el contexto de la página. */
const newRequestId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Saludo EIP-6963 hacia el relay (§4.1: `TRUEKEATE_ANNOUNCE → { type, info }`).
 *
 * NOTA DE CONTRATO (desviación declarada). §4.1.1 define el `detail` del anuncio como
 * `{ info, provider }`, pero `provider` contiene funciones y `window.postMessage` clona el
 * mensaje con el algoritmo de *structured clone*: enviar el `detail` completo lanza
 * `DataCloneError`. El saludo transporta por tanto el objeto `info` (los 4 campos clonables:
 * `uuid`, `name`, `icon` y `rdns`); el `detail` íntegro se entrega a la página por `CustomEvent`,
 * que NO clona nada (M36). El mensaje no tiene respuesta (§4.1).
 */
interface RelayAnnounceMessage {
  type: 'TRUEKEATE_ANNOUNCE';
  info: Eip6963ProviderInfo;
}

/** Peticiones en vuelo: `id` de la página → resolución de la promesa del puente. */
interface PendingCall {
  settle(outcome: ProviderRelayOutcome): void;
  timer: number;
}

/** Comprueba si el provider ya está publicado en este documento. */
const alreadyInstalled = (): boolean =>
  (window as unknown as Record<string, unknown>)[INSTALL_FLAG] === true;

/** ¿Es un objeto plano utilizable como mensaje? */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** ¿Es `value` un error EIP-1193 con `code` numérico (ACU-05 / RNF-06)? */
const isEip1193Error = (value: unknown): value is Eip1193Error => {
  const record = asRecord(value);
  return typeof record?.code === 'number' && typeof record.message === 'string';
};

/**
 * Prueba de INYECCIÓN: el relay (M38) es quien inyecta este bundle en la página y lo marca con
 * {@link RELAY_INJECT_ATTRIBUTE}. Si el bundle se evalúa de otra forma, no hay content script al
 * que preguntar y el provider responde `4200` en lugar de dejar la promesa colgada.
 */
const relayAttached = (): boolean => {
  if (typeof document === 'undefined' || typeof HTMLScriptElement === 'undefined') {
    return false;
  }
  const script: unknown = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) {
    return false;
  }
  return script.getAttribute(RELAY_INJECT_ATTRIBUTE) === '1';
};

/** Publica el provider, el alias, el anuncio EIP-6963 y el puente con el content script. */
export const installProvider = (): TruekeateProvider => {
  /** Correlación de peticiones de la página por `id`. */
  const pending = new Map<string, PendingCall>();

  /** Resuelve (una sola vez) la petición `id`: quita la entrada y cancela su temporizador. */
  const settle = (id: string, outcome: ProviderRelayOutcome): void => {
    const call = pending.get(id);
    if (call === undefined) {
      return;
    }
    pending.delete(id);
    window.clearTimeout(call.timer);
    call.settle(outcome);
  };

  /** Único punto de escritura hacia el content script: `targetOrigin` SIEMPRE cerrado (H-32). */
  const postToRelay = (message: unknown): void => {
    window.postMessage(message, location.origin);
  };

  const bridge: ProviderRelay = {
    attached: relayAttached(),

    send(method, params): Promise<ProviderRelayOutcome> {
      return new Promise<ProviderRelayOutcome>((resolve) => {
        // `id` de CORRELACIÓN de esta petición. No es la identidad del provider: `PROVIDER_UUID`
        // es un literal congelado (ADT-19/D-N) y no se genera nunca en runtime.
        const message: TruekeateRequestMessage = {
          type: 'TRUEKEATE_REQUEST',
          id: newRequestId(),
          method,
          params,
        };
        // Red de seguridad (H-07): la promesa NUNCA queda colgada.
        const timer = window.setTimeout(() => {
          settle(message.id, { error: pageTimeoutError(PAGE_REQUEST_TIMEOUT_SECONDS) });
        }, PAGE_REQUEST_TIMEOUT_MS);
        pending.set(message.id, {
          timer,
          settle: (outcome) => {
            window.clearTimeout(timer);
            resolve(outcome);
          },
        });
        try {
          postToRelay(message);
        } catch {
          // `params` no clonables (`DataCloneError`): error tipado, jamás una excepción síncrona.
          settle(message.id, { error: internalTransportError() });
        }
      });
    },
  };

  const { provider, emit } = createTruekeateProvider(bridge);

  /** Puerto de entrada: respuestas y eventos reenviados por el content script. */
  window.addEventListener('message', (event: MessageEvent) => {
    // Validación obligatoria del canal externo: `event.source === window` y
    // `event.origin === location.origin`; cualquier otro mensaje se descarta sin más.
    if (event.source !== window || event.origin !== location.origin) {
      return;
    }
    const message = asRecord(event.data);
    if (message === null) {
      return;
    }
    if (message.type === 'TRUEKEATE_RESPONSE') {
      // Salto 1 de la respuesta: `{ type, id, result | error }` (§4.1).
      const id: unknown = message.id;
      if (typeof id !== 'string') {
        return;
      }
      const error: unknown = message.error;
      settle(id, isEip1193Error(error) ? { error } : { result: message.result });
      return;
    }
    if (message.type === 'TRUEKEATE_EVENT') {
      // El evento llega REENVIADO LITERALMENTE por el relay: el campo útil es `data` (§4.1).
      const eventName: unknown = message.eventName;
      if (isProviderEvent(eventName)) {
        emit(eventName, message.data);
      }
      return;
    }
    // `TRUEKEATE_ANNOUNCE` viaja en sentido inject → content: aquí no hay nada que hacer.
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

  // Anuncio EIP-6963: listener síncrono + auto-anuncio + re-anuncio en DOMContentLoaded. Cada
  // anuncio se saluda también al relay (M38), que ya está escuchando porque es quien inyecta
  // este bundle; §4.1 no define respuesta para `TRUEKEATE_ANNOUNCE`.
  installEip6963Announce(provider, (detail) => {
    const announce: RelayAnnounceMessage = { type: 'TRUEKEATE_ANNOUNCE', info: detail.info };
    try {
      postToRelay(announce);
    } catch {
      // El saludo es informativo: si no se puede clonar, el provider sigue operativo.
    }
  });

  // Marca de instalación: no enumerable y no configurable.
  Object.defineProperty(window, INSTALL_FLAG, {
    value: true,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  return provider;
};

if (!alreadyInstalled()) {
  installProvider();
}
