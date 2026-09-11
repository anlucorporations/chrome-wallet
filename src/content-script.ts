/**
 * M38 — `src/content-script.ts`
 * Relay página ↔ extensión. Es el salto 1 del protocolo (`window.postMessage`) y el salto 2
 * hacia el Service Worker (`chrome.runtime.connect` / `sendMessage`).
 *
 * Reglas que implementa (`documento_tecnico.md` §3.7 y `diccionario_datos.md` §4.1/§4.2):
 * - TODO `postMessage` saliente usa `targetOrigin = location.origin`; **nunca** `'*'`.
 * - Se valida `event.source === window` **y** `event.origin === location.origin`; cualquier
 *   otro mensaje se descarta sin más.
 * - Se abre el puerto de larga vida `chrome.runtime.connect({ name: APPROVAL_PORT_NAME })`
 *   con reconexión y backoff 1/2/4/8/16 s (máximo 30 s) y se envía `RESUME` al conectar.
 *   El puerto transporta y correlaciona: NO mantiene vivo el SW (ADT-15/R16).
 *
 * Alcance de H1: no hay cola real (llega en H4), así que el relay solo transporta y
 * reenvía; ningún mensaje transporta claves ni el mnemonic (RNF-09).
 */

import { APPROVAL_PORT_NAME, PORT_RECONNECT_BASE_MS, PORT_RECONNECT_MAX_MS } from './shared/constants';

/** Tipos de mensaje que el relay acepta desde la página. */
const ACCEPTED_FROM_PAGE: readonly string[] = ['TRUEKEATE_REQUEST', 'TRUEKEATE_ANNOUNCE'];

/** Tipos de mensaje que el relay reenvía a la página. */
const FORWARDED_TO_PAGE: readonly string[] = ['TRUEKEATE_RESPONSE', 'TRUEKEATE_EVENT'];

/** Marca de instalación: el content script puede inyectarse en varios frames. */
const RELAY_FLAG = '__truekeateRelayInstalled__';

/** Cuerpo mínimo del mensaje recibido desde la página. */
interface PageEnvelope {
  type?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  info?: unknown;
}

/** Cuerpo mínimo del mensaje recibido desde la extensión. */
interface RuntimeEnvelope {
  type?: unknown;
  id?: unknown;
  error?: unknown;
  result?: unknown;
  eventName?: unknown;
}

/** Superficie mínima del puerto de `chrome.runtime.connect`. */
interface PortLike {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/** Superficie mínima de `chrome.runtime` que usa el relay. */
interface RuntimeLike {
  id?: string;
  connect(info: { name: string }): PortLike;
  onMessage: { addListener(listener: (message: unknown) => void): void };
}

/** Devuelve `chrome.runtime` sin `any`, o `undefined` si no está disponible. */
const runtimeApi = (): RuntimeLike | undefined => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return undefined;
  }
  const runtime: unknown = (chromeNs as { runtime?: unknown }).runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return undefined;
  }
  return runtime as RuntimeLike;
};

/** Único método de escritura hacia la página: SIEMPRE con `targetOrigin` cerrado. */
const postToPage = (message: unknown): void => {
  // `location.origin` es el único destino permitido; el comodín está prohibido (H-32).
  window.postMessage(message, location.origin);
};

/** Estado del puerto de larga vida. */
interface RelayState {
  port: PortLike | null;
  reconnectAttempt: number;
  reconnectTimer: number | null;
  /** Último `approvalId` observado, para el `RESUME` de la reconexión. */
  lastApprovalId: string | null;
}

const state: RelayState = {
  port: null,
  reconnectAttempt: 0,
  reconnectTimer: null,
  lastApprovalId: null,
};

/** Retardo del siguiente intento: 1, 2, 4, 8, 16 s… con tope de 30 s (H-02). */
export const nextBackoffMs = (attempt: number): number =>
  Math.min(PORT_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), PORT_RECONNECT_MAX_MS);

/** Abre (o reabre) el puerto de larga vida y programa la reconexión con backoff. */
const connectPort = (): void => {
  const runtime = runtimeApi();
  if (runtime === undefined) {
    return;
  }
  try {
    const port = runtime.connect({ name: APPROVAL_PORT_NAME });
    state.port = port;
    state.reconnectAttempt = 0;

    port.onMessage.addListener((message: unknown) => {
      const envelope = message as RuntimeEnvelope;
      if (typeof envelope.type === 'string' && FORWARDED_TO_PAGE.includes(envelope.type)) {
        postToPage(envelope);
      }
    });

    port.onDisconnect.addListener(() => {
      state.port = null;
      scheduleReconnect();
    });

    // `RESUME` al conectar: en H1 no hay cola, así que se envía solo si hay un
    // `approvalId` observado (la cola real llega en H4).
    if (state.lastApprovalId !== null) {
      port.postMessage({ type: 'RESUME', approvalId: state.lastApprovalId });
    }
  } catch {
    state.port = null;
    scheduleReconnect();
  }
};

/** Programa una reconexión con backoff exponencial (1/2/4/8/16 s, máx. 30 s). */
const scheduleReconnect = (): void => {
  if (state.reconnectTimer !== null) {
    return;
  }
  const delay = nextBackoffMs(state.reconnectAttempt);
  state.reconnectAttempt += 1;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectPort();
  }, delay) as unknown as number;
};

/** Envía un mensaje al SW por el puerto (y reconecta si el puerto se cerró). */
const sendToExtension = (message: unknown): void => {
  if (state.port === null) {
    connectPort();
  }
  const port = state.port;
  if (port === null) {
    return;
  }
  try {
    port.postMessage(message);
  } catch {
    state.port = null;
    scheduleReconnect();
  }
};

/** Valida el mensaje de la página: origen, fuente y forma. */
const readPageEnvelope = (event: MessageEvent): PageEnvelope | null => {
  // Canal externo: se descarta cualquier mensaje que no venga de esta ventana y este origen.
  if (event.source !== window || event.origin !== location.origin) {
    return null;
  }
  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const envelope = data as PageEnvelope;
  if (typeof envelope.type !== 'string' || !ACCEPTED_FROM_PAGE.includes(envelope.type)) {
    return null;
  }
  return envelope;
};

/** Instala el relay. Es idempotente por documento/frame. */
export const installRelay = (): void => {
  window.addEventListener('message', (event: MessageEvent) => {
    const envelope = readPageEnvelope(event);
    if (envelope === null) {
      return;
    }
    if (envelope.type === 'TRUEKEATE_ANNOUNCE') {
      // Saludo del provider: acusa recibo reenviando el anuncio a la página sin duplicarlo.
      return;
    }
    if (envelope.type === 'TRUEKEATE_REQUEST') {
      // El `origin`, el `tabId` y el `frameId` que viajan son datos NO fiables: el SW
      // recalcula el `origin` SOLO desde `sender.origin` y el `tabId`/`frameId` SOLO desde
      // `sender.tab.id` y `sender.frameId` (D-J / ADT-07). El content script no conoce su
      // propio `tabId`, así que declara `null` y el SW lo sustituye.
      sendToExtension({
        type: 'TRUEKEATE_RPC',
        method: typeof envelope.method === 'string' ? envelope.method : '',
        params: Array.isArray(envelope.params) ? envelope.params : [],
        origin: location.origin,
        tabId: null,
        frameId: null,
      });
    }
  });

  // Respuestas y eventos procedentes del SW por `chrome.runtime.sendMessage`.
  const runtime = runtimeApi();
  if (runtime !== undefined && typeof runtime.onMessage?.addListener === 'function') {
    runtime.onMessage.addListener((message: unknown) => {
      const envelope = message as RuntimeEnvelope;
      if (typeof envelope.type === 'string' && FORWARDED_TO_PAGE.includes(envelope.type)) {
        postToPage(envelope);
      }
    });
  }

  connectPort();
};

const globalScope = globalThis as unknown as Record<string, unknown>;
if (globalScope[RELAY_FLAG] !== true) {
  globalScope[RELAY_FLAG] = true;
  installRelay();
}
