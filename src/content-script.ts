/**
 * M38 — `src/content-script.ts`
 * Relay página ↔ extensión en los **DOS saltos** del protocolo (H3, tarea 3.8).
 *
 * FUENTE NORMATIVA
 * - `diccionario_datos.md` §4.1 (salto 1, `window.postMessage`) y §4.2 (salto 2, `chrome.runtime`),
 *   con la nota de reenvío **H-39**: el mismo `TRUEKEATE_EVENT` recorre dos saltos consecutivos.
 * - `documento_tecnico.md` §2.2 (responsabilidad única del content script), §2.5.1 y §3.7.
 * - `plan_desarrollo.md` §3.3.5 tareas 3.8 y 3.9 y §3.3.6 (`CA-RF-14`, `CA-RF-15`, `CA-RF-45`).
 *
 * REGLAS QUE IMPLEMENTA
 * 1. **Inyección del provider**: el content script inyecta `inject.js` (declarado
 *    `web_accessible_resource` en el manifest, sin el permiso `scripting` que H-36/D-P retiró) en
 *    `document_start`: primero registra su propio canal de ENTRADA —para no perder el saludo ni la
 *    primera petición— y acto seguido inyecta el bundle, de modo que `window.truekeate` exista
 *    antes de cualquier script de la página. La etiqueta `<script>` va marcada con
 *    `data-truekeate-inject="1"`: es la prueba de inyección que M37 exige para creer que hay relay.
 * 2. **Salto 1 (página → relay)**: se valida `event.source === window` **Y**
 *    `event.origin === location.origin`; cualquier otro mensaje se descarta sin más. Un
 *    `TRUEKEATE_REQUEST { type, id, method, params }` se traduce al sobre `TRUEKEATE_RPC` del
 *    salto 2 y su respuesta se devuelve como `TRUEKEATE_RESPONSE { type, id, result | error }`.
 * 3. **Salto 2 (relay → SW)**: `chrome.runtime.sendMessage` con el método declarado tal cual (el
 *    relay **no** interpreta parámetros ni decide permisos: §2.2) y `origin`/`tabId`/`frameId`
 *    como datos **NO fiables** que el SW recalcula desde `sender` (§4.2, D-J/ADT-07). El campo
 *    `origin` de ese sobre es el origen WEB de la página y **no** debe confundirse con el
 *    `event.origin` del `MessageEvent` que valida este fichero.
 * 4. **Reenvío LITERAL de eventos (SW → relay → página)**: el `TRUEKEATE_EVENT` se publica tal y
 *    como llegó, **sin transformar, filtrar ni añadir campos** (nota H-39); si el sobre trae
 *    campos extra (p. ej. un `origin`), viajan con él.
 * 5. **`targetOrigin` CERRADO**: todo `postMessage` saliente usa `location.origin`, **nunca**
 *    `'*'` (H-32, RNF-10).
 * 6. **Puerto de larga vida** `truekeate_approval` con reconexión y backoff 1/2/4/8/16 s (tope
 *    30 s) y `RESUME` al conectar (H-02/ADT-15): es un canal de transporte y correlación, **no**
 *    un *keep-alive* del Service Worker.
 *
 * Ningún secreto cruza `window.postMessage` ni este relay (RNF-09): solo método, `params` y el
 * resultado público del catálogo.
 */

import { APPROVAL_PORT_NAME, PORT_RECONNECT_BASE_MS, PORT_RECONNECT_MAX_MS } from './shared/constants';
import type { Eip1193Error } from './shared/types';

/** Ruta del bundle del provider dentro del paquete (entry `inject.js`, IIFE). */
const INJECT_SCRIPT_PATH = 'inject.js';

/**
 * Prueba de inyección que marca la etiqueta `<script>` de `inject.js` (ver M37, que la comprueba):
 * el provider solo cree que hay relay cuando el propio relay lo ha inyectado.
 */
const RELAY_INJECT_ATTRIBUTE = 'data-truekeate-inject';

/** Marca de instalación: el content script puede inyectarse en varios frames. */
const RELAY_FLAG = '__truekeateRelayInstalled__';

/** Tipos del salto 1 que la página puede enviar al relay (§4.1). */
const ACCEPTED_FROM_PAGE: readonly string[] = ['TRUEKEATE_REQUEST', 'TRUEKEATE_ANNOUNCE'];

/**
 * Tipos del protocolo que el relay reenvía a la página. Es el MISMO conjunto cerrado en las dos
 * direcciones de salida: la respuesta correlacionada del salto 2 (y la que el SW empuja con
 * `chrome.tabs.sendMessage` a este frame) y el evento de la nota H-39.
 */
const FORWARDED_TO_PAGE: readonly string[] = ['TRUEKEATE_RESPONSE', 'TRUEKEATE_EVENT'];

/**
 * Error EIP-1193 `-32603` (fila «Fallo no clasificado del SW» de `diccionario_datos.md` §4.3)
 * para el fallo de TRANSPORTE del propio relay: el Service Worker no respondió a la petición.
 * El bundle del content script no importa módulos del Service Worker, así que el literal se
 * transcribe aquí, igual que hace el popup en `popupErrors.ts` (RNF-14). Nunca hay un error sin
 * `code` hacia la página (ACU-05 / RNF-06).
 */
const internalTransportError = (): Eip1193Error => ({
  code: -32603,
  message: 'Error interno de la cartera.',
});

// ---------------------------------------------------------------------------
// Forma de los sobres del protocolo (diccionario_datos.md §4.1 y §4.2)
// ---------------------------------------------------------------------------

/** Cuerpo crudo de un mensaje de la página, antes de validarlo. */
interface RawPageEnvelope {
  type: string;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  info?: unknown;
}

/**
 * Sobre `TRUEKEATE_RPC` tal y como lo construye el relay (§4.2).
 *
 * - `method` viaja como `string`, no como la unión `WalletMethod`: el content script NO interpreta
 *   el método (§2.2); quien lo valida contra el catálogo cerrado (M4) y responde `4200` es el SW.
 * - `origin` es el origen WEB declarado y es **dato no fiable**: el SW lo recalcula SOLO desde
 *   `sender.origin` (D-J/ADT-07). No confundir con `event.origin`, el campo del `MessageEvent`.
 * - `tabId`/`frameId` van a `null` porque el content script no conoce su propia pestaña: el SW los
 *   sustituye por `sender.tab.id` y `sender.frameId`.
 */
interface RelayRpcMessage {
  type: 'TRUEKEATE_RPC';
  method: string;
  params: unknown[];
  origin: string;
  tabId: number | null;
  frameId: number | null;
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
  getURL(path: string): string;
  connect(info: { name: string }): PortLike;
  sendMessage(message: unknown, callback: (response: unknown) => void): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
}

// ---------------------------------------------------------------------------
// Utilidades de plataforma (sin `any`, tolerantes a entornos sin `chrome`)
// ---------------------------------------------------------------------------

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

/** Único método de escritura hacia la página: SIEMPRE con `targetOrigin` cerrado (H-32). */
const postToPage = (message: unknown): void => {
  try {
    // `location.origin` es el único destino permitido; el comodín está prohibido (H-32, RNF-10).
    window.postMessage(message, location.origin);
  } catch {
    // Resultado del SW no clonable: la promesa de la página queda a cargo de la red de H-07.
  }
};

/**
 * Inyecta `inject.js` en el MUNDO DE LA PÁGINA con una etiqueta `<script>` marcada.
 *
 * Se hace así (y no con `chrome.scripting`) porque el manifest de mínimos privilegios retiró el
 * permiso `scripting` (H-36/D-P) y declara `inject.js` como `web_accessible_resource`. La marca
 * {@link RELAY_INJECT_ATTRIBUTE} permite a M37 distinguir esta inyección legítima de cualquier
 * otra carga del mismo bundle.
 */
const injectProviderBundle = (): void => {
  const runtime = runtimeApi();
  if (runtime === undefined || typeof runtime.getURL !== 'function') {
    return;
  }
  try {
    const script = document.createElement('script');
    script.src = runtime.getURL(INJECT_SCRIPT_PATH);
    // `async = false`: la ejecución respeta el orden de inserción respecto del resto de scripts.
    script.async = false;
    script.setAttribute(RELAY_INJECT_ATTRIBUTE, '1');
    const parent = document.head ?? document.documentElement;
    if (parent === null) {
      return;
    }
    parent.appendChild(script);
  } catch {
    // Documento sin DOM escribible (marco de sólo lectura): el provider no se puede publicar.
  }
};

// ---------------------------------------------------------------------------
// Salto 1: página → relay → Service Worker → relay → página
// ---------------------------------------------------------------------------

/** Valida el mensaje de la página: origen, fuente y forma (§4.1). */
const readPageEnvelope = (event: MessageEvent): RawPageEnvelope | null => {
  // Canal externo: se descarta cualquier mensaje que no venga de esta ventana y de este origen.
  if (event.source !== window || event.origin !== location.origin) {
    return null;
  }
  const data = asRecord(event.data);
  if (data === null) {
    return null;
  }
  const type: unknown = data.type;
  if (typeof type !== 'string' || !ACCEPTED_FROM_PAGE.includes(type)) {
    return null;
  }
  return { ...data, type };
};

/**
 * Construye la respuesta del salto 1 (`{ type, id, result | error }` de §4.1).
 *
 * La respuesta del SW (salto 2) es `{ result }` o `{ error }`; si no llega ninguna —no hay
 * receptor o el canal se cerró— se responde con el error interno tipado en lugar de dejar la
 * promesa de la página pendiente hasta la red de seguridad de H-07.
 */
const buildResponse = (id: string, response: unknown): unknown => {
  const envelope = asRecord(response);
  if (envelope === null) {
    return { type: 'TRUEKEATE_RESPONSE', id, error: internalTransportError() };
  }
  const error: unknown = envelope.error;
  if (isEip1193Error(error)) {
    return { type: 'TRUEKEATE_RESPONSE', id, error };
  }
  if (!('result' in envelope)) {
    return { type: 'TRUEKEATE_RESPONSE', id, error: internalTransportError() };
  }
  return { type: 'TRUEKEATE_RESPONSE', id, result: envelope.result };
};

/** Envía el sobre del salto 2 al Service Worker y entrega su respuesta (nunca lanza). */
const sendRpcToExtension = (
  message: RelayRpcMessage,
  onResponse: (response: unknown) => void,
): void => {
  const runtime = runtimeApi();
  if (runtime === undefined || typeof runtime.sendMessage !== 'function') {
    // Sin API de mensajería (página abierta fuera de la extensión): error tipado.
    onResponse(undefined);
    return;
  }
  try {
    runtime.sendMessage(message, onResponse);
  } catch {
    // Extensión recargada o canal no disponible: error tipado, jamás una excepción que rompa la
    // página. El content script NO interpreta ni decide nada sobre el método (§2.2).
    onResponse(undefined);
  }
};

/** Traduce un `TRUEKEATE_REQUEST` de la página al salto 2 y devuelve la respuesta al salto 1. */
const handlePageRequest = (envelope: RawPageEnvelope): void => {
  const id: unknown = envelope.id;
  if (typeof id !== 'string' || id === '') {
    // Sin `id` no hay correlación posible: el proveedor siempre envía uno, así que se descarta.
    return;
  }
  const method: unknown = envelope.method;
  const params: unknown = envelope.params;
  const message: RelayRpcMessage = {
    type: 'TRUEKEATE_RPC',
    // El método viaja LITERAL (aunque no exista en el catálogo): el SW responde `4200` con el
    // literal de §4.3, de modo que el error tiene una sola fuente.
    method: typeof method === 'string' ? method : '',
    params: Array.isArray(params) ? params : [],
    // Origen WEB (dato NO fiable) y ubicación desconocida para el propio content script: el SW lo
    // recalcula desde `sender.origin`, `sender.tab.id` y `sender.frameId` (§4.2, D-J/ADT-07).
    origin: location.origin,
    tabId: null,
    frameId: null,
  };
  sendRpcToExtension(message, (response) => {
    postToPage(buildResponse(id, response));
  });
};

// ---------------------------------------------------------------------------
// Salto 2 → salto 1: respuestas empujadas y eventos
// ---------------------------------------------------------------------------

/**
 * Reenvía LITERALMENTE a la página un sobre llegado de la extensión (respuesta empujada o
 * evento). El objeto NO se reconstruye: `eventName`, `data` y cualquier campo extra (p. ej. el
 * `origin` del sobre) viajan idénticos (nota H-39).
 */
const forwardToPage = (message: unknown): void => {
  const envelope = asRecord(message);
  const type: unknown = envelope?.type;
  if (typeof type !== 'string' || !FORWARDED_TO_PAGE.includes(type)) {
    return;
  }
  postToPage(message);
};

// ---------------------------------------------------------------------------
// Puerto de larga vida (H-02 / ADT-15): canal y correlación, NO keep-alive
// ---------------------------------------------------------------------------

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
  if (runtime === undefined || typeof runtime.connect !== 'function') {
    return;
  }
  try {
    const port = runtime.connect({ name: APPROVAL_PORT_NAME });
    state.port = port;
    state.reconnectAttempt = 0;

    // El puerto también puede transportar respuestas y eventos: se reenvían literalmente.
    port.onMessage.addListener((message: unknown) => {
      forwardToPage(message);
    });

    port.onDisconnect.addListener(() => {
      state.port = null;
      scheduleReconnect();
    });

    // `RESUME` al conectar: la cola persistida real llega con M17/H4, así que solo se envía si ya
    // se había observado un `approvalId`.
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

// ---------------------------------------------------------------------------
// Instalación del relay
// ---------------------------------------------------------------------------

/** Instala el relay. Es idempotente por documento/frame. */
export const installRelay = (): void => {
  // 1. Canal externo de ENTRADA (salto 1): ANTES de inyectar el provider, para que el saludo
  //    EIP-6963 y la primera petición encuentren siempre al relay escuchando.
  window.addEventListener('message', (event: MessageEvent) => {
    const envelope = readPageEnvelope(event);
    if (envelope === null) {
      return;
    }
    if (envelope.type === 'TRUEKEATE_ANNOUNCE') {
      // Saludo EIP-6963 del provider hacia el relay (§4.1): el mensaje NO tiene respuesta y el
      // relay no interpreta su contenido; se acepta para que la validación sea completa.
      return;
    }
    handlePageRequest(envelope);
  });

  // 2. Canal interno de ENTRADA (salto 2): respuestas empujadas por el SW (`chrome.tabs.sendMessage`
  //    a este frame, §4.2 guarda 5) y eventos, que se reenvían literalmente a la página.
  const runtime = runtimeApi();
  if (runtime !== undefined && typeof runtime.onMessage?.addListener === 'function') {
    runtime.onMessage.addListener((message: unknown) => {
      forwardToPage(message);
    });
  }

  // 3. Inyección SÍNCRONA del provider en `document_start`: `window.truekeate` debe existir antes
  //    de cualquier script de la página y de las dApp que consultan EIP-6963 de forma síncrona.
  injectProviderBundle();

  // 4. Puerto de larga vida `truekeate_approval` (canal de aprobaciones de H4).
  connectPort();
};

const globalScope = globalThis as unknown as Record<string, unknown>;
if (globalScope[RELAY_FLAG] !== true) {
  globalScope[RELAY_FLAG] = true;
  installRelay();
}
