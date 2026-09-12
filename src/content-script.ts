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
 * 7. **Transporte con espera acotada y reintento seguro (cierre de D-H4-E10)**: un
 *    `chrome.runtime.sendMessage` que vuelve vacío **no** se traduce en `-32603` inmediato —el SW
 *    puede estar suspendido y despertar después, que es justo lo que hace la alarma de M15—. El
 *    relay **reintenta** solo cuando el fallo garantiza que el mensaje no se entregó a nadie
 *    (`Could not establish connection. Receiving end does not exist.`) y, en cualquier otro fallo
 *    de transporte, **espera** la resolución que el SW empuja (por el puerto o por
 *    `chrome.tabs.sendMessage`) hasta agotar `SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS` (H-07:
 *    la capa content es solo red de seguridad con margen superior al dueño del plazo). Solo
 *    entonces responde `-32603`.
 * 8. **Correlación del salto 1 (cierre de D-H4-E10)**: el `id` que la página generó viaja al SW
 *    como `requestId` del sobre `TRUEKEATE_RPC`; el SW lo persiste con la solicitud aprobable y la
 *    resolución empujada vuelve con ESE `id`, de modo que la promesa correcta de la dApp se
 *    resuelve (y ninguna otra recibe una respuesta ajena). El relay además OBSERVA el `approvalId`
 *    que acompaña a la resolución para su `RESUME` de reconexión, sin transformar el sobre (H-39).
 *
 * Ningún secreto cruza `window.postMessage` ni este relay (RNF-09): solo método, `params` y el
 * resultado público del catálogo.
 */

import {
  APPROVAL_PORT_NAME,
  PORT_RECONNECT_BASE_MS,
  PORT_RECONNECT_MAX_MS,
  SIGN_TIMEOUT_MS,
  TIMEOUT_SAFETY_MARGIN_MS,
} from './shared/constants';
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

/**
 * Cota de TRANSPORTE del relay: el plazo del SW (dueño único del reloj) más el margen de seguridad
 * de H-07. Mientras no se agote NO se responde `-32603`: el SW puede estar suspendido y volver por
 * la alarma de M15, y su resolución llegará empujada hasta aquí.
 */
const TRANSPORT_TIMEOUT_MS = SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS;

/** Primer retardo del reintento de transporte y tope del backoff (temporizadores LOCALES). */
const TRANSPORT_RETRY_BASE_MS = 250;
const TRANSPORT_RETRY_MAX_MS = 2_000;

/**
 * Fallo de transporte que GARANTIZA que el mensaje no llegó a ningún receptor: reintentarlo es
 * seguro (no hay efecto duplicado) y es lo que despierta a un Service Worker dormido.
 */
const UNRECEIVED_TRANSPORT_PATTERN = /could not establish connection|receiving end does not exist/i;

/**
 * Fallo de transporte IRRECUPERABLE: la extensión se recargó o quedó huérfana y ya no existe a
 * quién entregar la petición. Se responde de inmediato en lugar de esperar en balde.
 *
 * OJO: el cierre del canal con el SW suspendido (`The message port closed before a response was
 * received.`) **no** es un fallo irrecuperable —D-H4-E10 consistía justo en tratarlo como tal—: en
 * ese caso el SW puede seguir trabajando en la solicitud y despertar después por `chrome.alarms`.
 */
const FATAL_TRANSPORT_PATTERN = /extension context invalidated/i;

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
  /**
   * `id` de correlación del salto 1: es el `id` que la página puso en su `TRUEKEATE_REQUEST` y
   * viaja LITERAL para que el SW lo persista con la solicitud aprobable y la resolución empujada
   * vuelva con él (D-H4-E10). El SW **no** lo interpreta (§2.2): no decide nada.
   */
  requestId: string;
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
  /** Error de la última llamada: se lee SÍNCRONAMENTE dentro del callback de `sendMessage`. */
  lastError?: { message?: string };
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

/**
 * Petición de la página EN VUELO, indexada por el `id` del salto 1.
 *
 * Es estado VOLÁTIL del relay (no fuente de verdad: la verdad es la cola persistida del SW) y
 * existe para dos cosas: no responder `-32603` antes de agotar la cota de transporte y aceptar como
 * propia la resolución que el SW empuje. Los temporizadores son LOCALES a este contexto (permitidos:
 * no son plazos de aprobación, el plazo lo posee `chrome.alarms` en el SW).
 */
interface InFlightCall {
  /** Sobre del salto 2 que se reintenta (el mismo `requestId` en cada intento). */
  message: RelayRpcMessage;
  /** Intentos de ESCRITURA realizados (diagnóstico y backoff). */
  attempts: number;
  /** Reintento programado, si lo hay. */
  retryTimer: number | null;
  /** Cota de transporte: al agotarse y sin respuesta, se responde `-32603`. */
  deadlineTimer: number;
}

/** Peticiones de página en vuelo: `id` de la página → llamada viva. */
const inFlight = new Map<string, InFlightCall>();

/** Retardo del siguiente reintento de transporte: 250/500/1000/2000 ms (tope). */
const nextRetryDelayMs = (attempts: number): number =>
  Math.min(TRANSPORT_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), TRANSPORT_RETRY_MAX_MS);

/** Cancela los temporizadores de una llamada en vuelo y la retira del índice. */
const forgetCall = (id: string, call: InFlightCall | undefined): void => {
  inFlight.delete(id);
  if (call === undefined) {
    return;
  }
  if (call.retryTimer !== null) {
    window.clearTimeout(call.retryTimer);
  }
  window.clearTimeout(call.deadlineTimer);
};

/** Entrega a la página la respuesta de una llamada y la da por cerrada (una sola respuesta). */
const respondOnce = (id: string, message: unknown): void => {
  const call = inFlight.get(id);
  forgetCall(id, call);
  postToPage(message);
};

/**
 * Cota de transporte agotada: nadie respondió a la petición de la página. La capa inject tiene su
 * propia red de seguridad con el MISMO margen (H-07); aquí se responde el error interno tipado para
 * no dejar la promesa pendiente si esa red no llegara a dispararse.
 */
const onTransportDeadline = (id: string): void => {
  if (!inFlight.has(id)) {
    return;
  }
  respondOnce(id, { type: 'TRUEKEATE_RESPONSE', id, error: internalTransportError() });
};

/** Lectura SÍNCRONA del `lastError` de `chrome.runtime` (solo válida dentro del callback). */
const lastTransportMessage = (): string => {
  const message: unknown = runtimeApi()?.lastError?.message;
  return typeof message === 'string' ? message : '';
};

/** Escribe (o reescribe) el sobre del salto 2 y decide qué hacer con un fallo de transporte. */
const writeRpc = (id: string): void => {
  const call = inFlight.get(id);
  if (call === undefined) {
    return;
  }
  call.attempts += 1;
  const runtime = runtimeApi();
  if (runtime === undefined || typeof runtime.sendMessage !== 'function') {
    // Sin API de mensajería (la extensión se recargó o el documento no es suyo): error tipado.
    respondOnce(id, { type: 'TRUEKEATE_RESPONSE', id, error: internalTransportError() });
    return;
  }
  try {
    runtime.sendMessage(call.message, (response: unknown) => {
      onRpcResponse(id, response);
    });
  } catch {
    // `sendMessage` lanzó de forma síncrona: el contexto de la extensión ya no es válido.
    respondOnce(id, { type: 'TRUEKEATE_RESPONSE', id, error: internalTransportError() });
  }
};

/**
 * Respuesta del salto 2 (o su AUSENCIA). Un sobre válido se entrega tal cual; un fallo de
 * transporte **no** se convierte en error definitivo mientras quede margen (D-H4-E10).
 */
const onRpcResponse = (id: string, response: unknown): void => {
  const call = inFlight.get(id);
  if (call === undefined) {
    // La petición ya se resolvió por la vía empujada: la respuesta tardía se descarta (X-06).
    return;
  }
  if (asRecord(response) !== null) {
    respondOnce(id, buildResponse(id, response));
    return;
  }
  const transport = lastTransportMessage();
  if (FATAL_TRANSPORT_PATTERN.test(transport)) {
    // Extensión recargada/desinstalada: no hay a quién entregar la petición.
    respondOnce(id, { type: 'TRUEKEATE_RESPONSE', id, error: internalTransportError() });
    return;
  }
  if (UNRECEIVED_TRANSPORT_PATTERN.test(transport) && call.retryTimer === null) {
    // El mensaje no llegó a nadie: reescribirlo es seguro y es lo que despierta al SW dormido.
    call.retryTimer = window.setTimeout(() => {
      call.retryTimer = null;
      writeRpc(id);
    }, nextRetryDelayMs(call.attempts));
    return;
  }
  // Cualquier otro fallo (p. ej. el canal se cerró con el SW ya trabajando en la solicitud): NO se
  // reescribe —sería un efecto duplicado— y se espera la resolución empujada hasta la cota.
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
    // Correlación del salto 1 (D-H4-E10): el `id` de la página viaja LITERAL hasta la cola.
    requestId: id,
  };

  // Un `id` repetido no puede dejar dos promesas vivas: la anterior se descarta con su error.
  const previous = inFlight.get(id);
  if (previous !== undefined) {
    respondOnce(id, { type: 'TRUEKEATE_RESPONSE', id, error: internalTransportError() });
  }
  inFlight.set(id, {
    message,
    attempts: 0,
    retryTimer: null,
    deadlineTimer: window.setTimeout(() => {
      onTransportDeadline(id);
    }, TRANSPORT_TIMEOUT_MS),
  });
  writeRpc(id);
};

// ---------------------------------------------------------------------------
// Salto 2 → salto 1: respuestas empujadas y eventos
// ---------------------------------------------------------------------------

/**
 * Reenvía LITERALMENTE a la página un sobre llegado de la extensión (respuesta empujada o
 * evento). El objeto NO se reconstruye: `eventName`, `data` y cualquier campo extra (p. ej. el
 * `origin` del sobre) viajan idénticos (nota H-39).
 *
 * Efectos de OBSERVACIÓN (no de transformación), los dos necesarios para cerrar D-H4-E10:
 * - una respuesta empujada que correlaciona con una petición en vuelo la da por resuelta aquí (así
 *   no se responde `-32603` por la cota de transporte ni se entrega una segunda respuesta);
 * - el `approvalId` que acompaña a la resolución se recuerda para el `RESUME` de reconexión.
 */
const forwardToPage = (message: unknown): void => {
  const envelope = asRecord(message);
  const type: unknown = envelope?.type;
  if (typeof type !== 'string' || !FORWARDED_TO_PAGE.includes(type)) {
    return;
  }
  if (type === 'TRUEKEATE_RESPONSE') {
    const id: unknown = envelope?.id;
    if (typeof id === 'string' && inFlight.has(id)) {
      // Resolución EMPUJADA por el SW (aprobación, rechazo o vencimiento): cierra la llamada y se
      // entrega una sola vez, con el `id` de la página que el SW conservó en `requestId`.
      respondOnce(id, message);
      return;
    }
  }
  const approvalId: unknown = envelope?.approvalId;
  if (typeof approvalId === 'string' && approvalId !== '') {
    state.lastApprovalId = approvalId;
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
  /**
   * Último `approvalId` OBSERVADO en una resolución empujada por el SW, para el `RESUME` de la
   * reconexión (H-02/ADT-15). Antes estaba declarado y nunca se asignaba (D-H4-E10); ahora lo
   * alimenta {@link forwardToPage}. La correlación de la RESPUESTA con la promesa de la dApp no
   * depende de él: la hace el `requestId` persistido en la cola (§8 de la cabecera).
   */
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

    // `RESUME` al conectar: se envía solo si ya se OBSERVÓ un `approvalId` (lo publica una
    // resolución empujada por el SW), tal y como exige H-02/ADT-15: el puerto es canal de
    // transporte y correlación, nunca un *keep-alive*.
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
