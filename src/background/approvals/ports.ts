/**
 * M17 — `src/background/approvals/ports.ts`
 * Puerto de larga vida `truekeate_approval` en el Service Worker: registro de puertos, mensaje
 * `RESUME { approvalId }` y entrega de la respuesta (H4, tarea 4.3 de `plan_desarrollo.md` §3.4.5).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §2.3 (invariante «Puerto de larga vida») y §2.5.1.
 * - `diccionario_datos.md` §3.4, tabla de estado volátil (`portsByApprovalId`) y la tabla de
 *   correlación `approvalId ↔ tabId/frameId` con su orden de recuperación.
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **El puerto es un canal de transporte y correlación, NO un *keep-alive***: no impide que el
 *    navegador suspenda el SW a los ~30 s de inactividad (ADT-15/R16). La verdad está en
 *    `chrome.storage.local`; la reconexión con backoff 1→2→4→8→16→30 s y el `RESUME` los emite la
 *    capa content (`src/content-script.ts`).
 * 2. **Respuesta desde el registro persistido**: un `RESUME` con un `approvalId` que sigue
 *    `pending` obtiene la solicitud persistida; si ya no está `pending` (o venció), obtiene `4001`.
 * 3. **La respuesta del `RESUME` lleva la solicitud COMPLETA** ({@link ResumeResult}): el
 *    correlador, el método, los parámetros, el origen, la cuenta, la red, el plazo, el contador de
 *    pendientes **y las tres previews** (`txPreview`/`typedDataPreview`/`signMessagePreview`). Es
 *    el hueco de integración que cerraba la ventana de confirmación: sin el cuerpo no hay nada que
 *    mostrar y «Aprobar» queda deshabilitado. La MISMA vista se empuja a la ventana ya abierta
 *    cuando el SW re-renderiza la siguiente `pending` (§2.14) —{@link pushApprovalRequest}—, con
 *    el sobre de `TRUEKEATE_RESPONSE` que la ventana ya consume (ningún tipo de mensaje nuevo).
 * 4. **Recuperación en orden de preferencia**: (1) puerto vivo → entrega por el puerto y se cierra;
 *    (2) puerto cerrado + pestaña viva → `chrome.tabs.sendMessage(tabId, …, { frameId })` con el
 *    frame EXACTO (D-J/ADT-07); (3) sin destinatario → la solicitud se marca y se registra, nunca
 *    se resuelve «en el vacío».
 * 5. `portsByApprovalId` es estado VOLÁTIL admisible: solo índice de transporte, reconstruible.
 * 6. **El cuerpo de la solicitud NO se difunde fuera de la extensión**: el empuje del cuerpo a la
 *    ventana ya abierta viaja por `chrome.runtime.sendMessage`, que entrega a las **páginas de la
 *    extensión** (`notification.html`, popup, `connect.html`) y **no** a los content scripts —
 *    medido: la dApp no recibe nada (ver {@link pushApprovalRequest})—, de modo que la solicitud
 *    nunca alcanza a la página que la pidió ni a otra dApp (RNF-09).
 */

import type {
  ApprovalMethod,
  Address,
  ChainIdHex,
  Eip1193Error,
  PendingRequest,
  PersonalSignPreview,
  TxPreview,
  TypedDataPreview,
  Uuid,
} from '../../shared/types';
import { APPROVAL_PORT_NAME } from '../../shared/constants';
import { isTruekeateMessageType } from '../../shared/protocol';
import { timeoutError, unsupportedMethodError, userRejectedError } from '../rpc/errors';
import type { StorageLocalLike } from '../state/schema';
import { isExpired, pendingCount, readPendingRequests } from './queue';

// ---------------------------------------------------------------------------
// Formas del protocolo
// ---------------------------------------------------------------------------

/** Respuesta que viaja al solicitante: `{ result }` o `{ error }`, nunca las dos (§4.2). */
export type ApprovalResponse = { result: unknown } | { error: Eip1193Error };

/** Destino por el que se entregó una respuesta. */
export type ApprovalDelivery = 'port' | 'tab' | 'none';

/**
 * Vista de la solicitud persistida que se entrega al reanudar (RESUME) **y** la que el SW empuja a
 * la ventana ya abierta.
 *
 * Contrato consumido por `src/notification/App.tsx` (`normalizeRequest`): todos los campos de
 * presentación de §2.8, las **tres previews** de §3.1/§3.2/§3.3 cuando la solicitud las tiene,
 * el contador derivado `pendingCount` (§2.14) y el favicon ya saneado (§3.8). `request` es además
 * la solicitud COMPLETA persistida, de modo que la ventana no necesita leer el almacén (RNF-14).
 */
export interface ResumeResult {
  approvalId: Uuid;
  status: 'pending';
  method: ApprovalMethod;
  /** Parámetros ORIGINALES de la llamada: es el payload de firma (§2.8). */
  params: unknown[];
  origin: string;
  /** `null` si la solicitud nació en un contexto de la extensión. */
  tabId: number | null;
  /** `0` = top frame; distinto de 0 exige responder SOLO a ese frame (§3.4). */
  frameId: number | null;
  account: Address;
  chainId: ChainIdHex;
  /** Vista previa de `eth_sendTransaction` (M19, §3.1). */
  txPreview?: TxPreview;
  /** Vista previa de `eth_signTypedData_v4` (M19, §3.2). */
  typedDataPreview?: TypedDataPreview;
  /** Vista previa de `personal_sign` (M19, §3.3). */
  signMessagePreview?: PersonalSignPreview;
  createdAt: number;
  expiresAt: number;
  /** Índice derivado: cuántas solicitudes siguen `pending` (badge y contador de la ventana). */
  pendingCount: number;
  /** La solicitud completa persistida (§2.8), con sus previews. */
  request: PendingRequest;
  /** Favicon ya saneado del origen (`chrome-extension://…`); `null` si no se pudo resolver. */
  favicon: string | null;
}

/** Superficie mínima de `chrome.runtime.Port` que usa el SW. */
export interface ApprovalPortLike {
  name: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown, port: unknown) => void): void };
  onDisconnect: { addListener(listener: (port: unknown) => void): void };
}

/** Superficie mínima de `chrome.runtime.onConnect`. */
export interface OnConnectLike {
  addListener(listener: (port: ApprovalPortLike) => void): void;
}

/** Superficie mínima de `chrome.tabs.sendMessage`. */
export interface TabsSendLike {
  sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
}

/**
 * Superficie mínima de `chrome.runtime.sendMessage` — el canal de las **páginas de la extensión**
 * (`notification.html`, popup, `connect.html`). Es el único que alcanza a `notification.html`: ver
 * la medición en {@link pushApprovalRequest}.
 */
export interface RuntimeSendLike {
  sendMessage(message: unknown): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Estado volátil admisible
// ---------------------------------------------------------------------------

/**
 * `portsByApprovalId`: puertos vivos indexados por solicitud. Estado VOLÁTIL admisible (solo
 * índice de transporte, reconstruible): el SW puede suspenderse y perderlo; el content script se
 * reconecta con backoff y reenvía `RESUME`.
 */
const portsByApprovalId = new Map<Uuid, ApprovalPortLike>();

/** ¿Es un objeto plano utilizable como mensaje? */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Acceso de pruebas/diagnóstico al índice de transporte (copia). */
export const boundApprovalIds = (): Uuid[] => [...portsByApprovalId.keys()];

/** Número de puertos vivos (diagnóstico). */
export const countOpenPorts = (): number => portsByApprovalId.size;

/** Vincula un puerto a una solicitud (lo hace el `RESUME`). */
export const bindPort = (approvalId: Uuid, port: ApprovalPortLike): void => {
  portsByApprovalId.set(approvalId, port);
};

/** Descarta el vínculo de una solicitud. Devuelve cuántos vínculos se retiraron. */
export const unbindPort = (approvalId: Uuid): number =>
  portsByApprovalId.delete(approvalId) ? 1 : 0;

/** Vacía el índice de transporte (reconciliación y pruebas). */
export const clearPorts = (): void => {
  portsByApprovalId.clear();
};

/** Devuelve `chrome.runtime` sin `any`, o `null`. */
const runtimeApi = (): { onConnect?: OnConnectLike } | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const runtime: unknown = (chromeNs as { runtime?: unknown }).runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return null;
  }
  return runtime as { onConnect?: OnConnectLike };
};

/** Devuelve `chrome.runtime.getURL` sin `any`, o `null`. */
const runtimeUrlResolver = (): ((path: string) => string) | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const runtime: unknown = (chromeNs as { runtime?: unknown }).runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return null;
  }
  const getURL: unknown = (runtime as { getURL?: unknown }).getURL;
  if (typeof getURL !== 'function') {
    return null;
  }
  return (path: string) => (getURL as (p: string) => string).call(runtime, path);
};

/** Devuelve `chrome.tabs.sendMessage` sin `any`, o `null`. */
export const getTabsSend = (): TabsSendLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const tabs: unknown = (chromeNs as { tabs?: unknown }).tabs;
  if (typeof tabs !== 'object' || tabs === null) {
    return null;
  }
  const candidate = tabs as { sendMessage?: unknown };
  return typeof candidate.sendMessage === 'function' ? (tabs as TabsSendLike) : null;
};

/** Devuelve `chrome.runtime.sendMessage` sin `any`, o `null` (canal de las páginas de la extensión). */
export const getRuntimeSend = (): RuntimeSendLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const runtime: unknown = (chromeNs as { runtime?: unknown }).runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return null;
  }
  const candidate = runtime as { sendMessage?: unknown };
  if (typeof candidate.sendMessage !== 'function') {
    return null;
  }
  const send = candidate.sendMessage as (message: unknown) => Promise<unknown>;
  return {
    sendMessage: (message: unknown): Promise<unknown> => send.call(runtime, message),
  };
};

// ---------------------------------------------------------------------------
// Entrega de la SOLICITUD a la ventana de decisión (hueco de integración de H4)
// ---------------------------------------------------------------------------

/**
 * Favicon del origen servido por el navegador (`/_favicon`, permiso `favicon`), ya saneado por
 * construcción: SIEMPRE es un recurso del propio paquete (`chrome-extension://…`), nunca remoto ni
 * `data:` (ADT-22 / §3.8). `null` para orígenes no `http(s)` o sin API de runtime.
 */
export const originFaviconUrl = (origin: string | null): string | null => {
  if (origin === null || !/^https?:\/\//i.test(origin)) {
    return null;
  }
  const getUrl = runtimeUrlResolver();
  if (getUrl === null) {
    return null;
  }
  try {
    return getUrl(`/_favicon/?pageUrl=${encodeURIComponent(origin)}&size=32`);
  } catch (error) {
    console.warn('[truekeate] no se pudo resolver el favicon del origen', error);
    return null;
  }
};

/** Construye la vista completa de una solicitud `pending` para la ventana de decisión. */
export const resumeResultFor = (
  request: PendingRequest,
  pendingCountValue: number,
  favicon: string | null = originFaviconUrl(request.origin),
): ResumeResult => ({
  approvalId: request.approvalId,
  status: 'pending',
  method: request.method,
  params: [...request.params],
  origin: request.origin,
  tabId: request.tabId,
  frameId: request.frameId,
  account: request.account,
  chainId: request.chainId,
  ...(request.txPreview === undefined ? {} : { txPreview: request.txPreview }),
  ...(request.typedDataPreview === undefined ? {} : { typedDataPreview: request.typedDataPreview }),
  ...(request.signMessagePreview === undefined
    ? {}
    : { signMessagePreview: request.signMessagePreview }),
  createdAt: request.createdAt,
  expiresAt: request.expiresAt,
  pendingCount: pendingCountValue,
  request: { ...request },
  favicon,
});

/**
 * Sobre con el que el SW entrega la SOLICITUD a la ventana de decisión.
 *
 * Es el mismo que responde al `RESUME` por el puerto (§3.4): `TRUEKEATE_RESPONSE` con
 * `id: 'RESUME'` y el resultado completo. La ventana ya consume esa forma
 * (`deliveryFrom`/`normalizeRequest` de `App.tsx`), así que **no** se añade ningún tipo de mensaje
 * al protocolo cerrado de §4.2 (`naming.spec.ts` fija los 8). `pendingCount` y `favicon` viajan
 * también en el sobre para que la entrega sea autosuficiente.
 */
export const approvalDeliveryMessage = (
  request: PendingRequest,
  pendingCountValue: number,
): {
  type: 'TRUEKEATE_RESPONSE';
  id: 'RESUME';
  result: ResumeResult;
  pendingCount: number;
  favicon: string | null;
} => {
  const favicon = originFaviconUrl(request.origin);
  return {
    type: 'TRUEKEATE_RESPONSE',
    id: 'RESUME',
    result: resumeResultFor(request, pendingCountValue, favicon),
    pendingCount: pendingCountValue,
    favicon,
  };
};

/** Opciones del empuje de la solicitud a la ventana ya abierta (§2.14 / P-21). */
export interface ApprovalPushOptions {
  /** Solicitudes `pending` en la cola en este momento (contador visible). */
  pendingCount: number;
  /** Pestaña de la ventana única (`null` si no se pudo resolver: no se empuja nada). */
  tabId: number | null;
  /** `chrome.tabs.sendMessage` inyectable (pruebas); por defecto, la API real. */
  tabs?: TabsSendLike | null;
  /** `chrome.runtime.sendMessage` inyectable (pruebas); por defecto, la API real. */
  runtime?: RuntimeSendLike | null;
}

/**
 * Empuja la solicitud a la ventana de decisión **ya abierta**.
 *
 * La ventana única reutiliza su página para la SIGUIENTE `pending` (§2.14) y esa página no vuelve
 * a leer su URL, así que el cuerpo tiene que llegarle.
 *
 * CANAL (D-H4-E10, medido en este repositorio con Chromium 153 / Playwright 1.63):
 *   1. `chrome.runtime.sendMessage` — **es el único canal que alcanza `notification.html`**. La
 *      ventana es una PÁGINA DE LA EXTENSIÓN, no un content script.
 *   2. `chrome.tabs.sendMessage(tabId, …)` — se conserva como respaldo, pero **no** sirve para este
 *      caso: medido, responde `Could not establish connection. Receiving end does not exist.` para
 *      una página `chrome-extension://`, y además su `tabId` no se puede resolver sin el permiso
 *      `tabs` (retirado en H-36): con `windows.getAll({ populate: true })` el campo `url` de las
 *      pestañas llega a `null`.
 *
 * RNF-09 queda a salvo: medido también que un `chrome.runtime.sendMessage` emitido por el SW **no**
 * llega a los content scripts (la dApp no recibe nada; el relay no reenvía ningún mensaje), de modo
 * que el cuerpo de la solicitud no se difunde fuera de los contextos confiables de la extensión.
 *
 * Devuelve `true` solo si el mensaje se entregó; un fallo se registra y NO rompe la pasada de la
 * ventana (la solicitud sigue `pending` y el usuario puede reabrirla/enfocarla).
 */
export const pushApprovalRequest = async (
  request: PendingRequest,
  options: ApprovalPushOptions,
): Promise<boolean> => {
  const message = approvalDeliveryMessage(request, options.pendingCount);

  // 1. Canal de las páginas de la extensión: alcanza a `notification.html`.
  const runtime = options.runtime === undefined ? getRuntimeSend() : options.runtime;
  if (runtime !== null) {
    try {
      await runtime.sendMessage(message);
      return true;
    } catch (error) {
      console.warn('[truekeate] no se pudo empujar la solicitud por el canal del runtime', error);
    }
  }

  // 2. Respaldo por pestaña: solo alcanza a content scripts; para la ventana única no hay ninguno.
  if (options.tabId === null) {
    return false;
  }
  const tabs = options.tabs === undefined ? getTabsSend() : options.tabs;
  if (tabs === null) {
    return false;
  }
  try {
    await tabs.sendMessage(options.tabId, message);
    return true;
  } catch (error) {
    console.warn('[truekeate] no se pudo empujar la solicitud a la ventana de decisión', error);
    return false;
  }
};

// ---------------------------------------------------------------------------
// RESUME
// ---------------------------------------------------------------------------

/** Resultado del `RESUME`: la solicitud persistida, o su `4001`. */
export type ResumeOutcome =
  | { ok: true; result: ResumeResult }
  | { ok: false; error: Eip1193Error };

/** Opciones del `RESUME` (inyectables para las pruebas). */
export interface ResumeOptions {
  now?: number;
  storage?: StorageLocalLike | null;
  /** Publica la respuesta por el puerto; por defecto, `port.postMessage`. */
  respond?: (message: unknown) => void;
}

/**
 * Atiende `RESUME { approvalId }` con la ÚNICA fuente de verdad posible: el registro persistido.
 *
 * - Entrada `pending` vigente → se vincula el puerto a la solicitud y se responde con la
 *   **solicitud completa** (correlador, método, parámetros, origen, cuenta, red, plazo, contador y
 *   las tres previews): es lo que permite a la ventana pintar la solicitud y decidirla.
 * - Entrada vencida → `4001` con el literal de vencimiento de §4.3 (el plazo ya no da más de sí).
 * - Entrada inexistente o ya resuelta → `4001` (rechazo): nunca se deja al llamante sin respuesta.
 */
export const handleResume = async (
  approvalId: Uuid,
  port: ApprovalPortLike,
  options: ResumeOptions = {},
): Promise<ResumeOutcome> => {
  const now = options.now ?? Date.now();
  const respond = options.respond ?? ((message: unknown) => port.postMessage(message));
  const map = await readPendingRequests(options.storage);
  const request = map[approvalId];

  if (request !== undefined && request.status === 'pending' && !isExpired(request, now)) {
    bindPort(approvalId, port);
    const count = pendingCount(map);
    // La MISMA vista que el empuje: la ventana no necesita pedir nada más (ni leer el almacén).
    respond(approvalDeliveryMessage(request, count));
    return { ok: true, result: resumeResultFor(request, count) };
  }

  const error =
    request !== undefined && request.status === 'pending' && isExpired(request, now)
      ? timeoutError(Math.round((request.expiresAt - request.createdAt) / 1000))
      : userRejectedError({ reason: 'approval-not-pending' });
  unbindPort(approvalId);
  respond({ type: 'TRUEKEATE_RESPONSE', id: 'RESUME', error });
  return { ok: false, error };
};

// ---------------------------------------------------------------------------
// Entrega de la respuesta
// ---------------------------------------------------------------------------

/**
 * `id` de correlación con el que viaja una respuesta al solicitante (§4.1/§4.2).
 *
 * Si la solicitud llegó por el relay (salto 1), la promesa de la dApp está esperando el `id` que
 * generó la capa inject y que el relay transportó en `requestId`; responder con `approvalId` la
 * dejaría COLGADA hasta su red de seguridad (D-H4-E10, H-07). Sin correlación declarada —solicitud
 * nacida en la extensión o emisor que no la envió— se conserva `approvalId`.
 */
export const responseCorrelationId = (request: PendingRequest): string =>
  typeof request.requestId === 'string' && request.requestId.length > 0
    ? request.requestId
    : request.approvalId;

/**
 * Sobre con el que se entrega una resolución al solicitante.
 *
 * `approvalId` viaja además del `id` de correlación por dos motivos: el relay lo OBSERVA para su
 * `RESUME` de reconexión (H-02 / ADT-15) y no cambia el reenvío LITERAL a la página (nota H-39: los
 * campos extra viajan con el sobre; la capa inject solo lee `id`, `result` y `error`).
 */
const resolutionEnvelope = (
  request: PendingRequest,
  response: ApprovalResponse,
): Record<string, unknown> => ({
  type: 'TRUEKEATE_RESPONSE',
  id: responseCorrelationId(request),
  approvalId: request.approvalId,
  ...response,
});

/**
 * Entrega la respuesta de una solicitud por el orden de preferencia del diccionario §3.4:
 *
 * 1. **puerto vivo** → se publica por él y se CIERRA el puerto (la correlación se agota);
 * 2. **pestaña viva** → `chrome.tabs.sendMessage(tabId, mensaje, { frameId })`, con `frameId` SOLO
 *    cuando es distinto de 0 (D-J/ADT-07);
 * 3. **sin destinatario** → `none`: el llamador decide (la reconciliación marca y registra).
 */
export const deliverApprovalResolution = async (
  request: PendingRequest,
  response: ApprovalResponse,
  options: { tabs?: TabsSendLike | null } = {},
): Promise<ApprovalDelivery> => {
  const message = resolutionEnvelope(request, response);
  const port = portsByApprovalId.get(request.approvalId);
  if (port !== undefined) {
    try {
      port.postMessage(message);
    } catch (error) {
      console.warn('[truekeate] el puerto de aprobación estaba cerrado al responder', error);
    } finally {
      unbindPort(request.approvalId);
      try {
        port.disconnect();
      } catch {
        // Un puerto ya cerrado no impide dar la respuesta por entregada.
      }
    }
    return 'port';
  }

  if (request.tabId === null) {
    return 'none';
  }
  const tabs = options.tabs ?? getTabsSend();
  if (tabs === null) {
    return 'none';
  }
  try {
    if (request.frameId !== null && request.frameId !== 0) {
      await tabs.sendMessage(request.tabId, message, { frameId: request.frameId });
    } else {
      await tabs.sendMessage(request.tabId, message);
    }
    return 'tab';
  } catch (error) {
    console.warn('[truekeate] no se pudo entregar la respuesta a la pestaña', request.tabId, error);
    return 'none';
  }
};

// ---------------------------------------------------------------------------
// Listener del puerto
// ---------------------------------------------------------------------------

/** Opciones del listener del puerto. */
export interface PortListenerOptions {
  now?: number;
  storage?: StorageLocalLike | null;
  /** Runtime (inyectable en pruebas); por defecto `chrome.runtime`. */
  runtime?: { onConnect?: OnConnectLike } | null;
  /** Atiende un mensaje que no es del protocolo o no es `RESUME`. */
  onUnhandled?: (message: unknown, port: ApprovalPortLike) => void;
}

/** Responde `4200` por el puerto sin romper el listener si ya estaba cerrado. */
const replyUnsupported = (port: ApprovalPortLike, type: unknown): void => {
  try {
    port.postMessage({
      type: 'TRUEKEATE_RESPONSE',
      id: typeof type === 'string' ? type : 'TRUEKEATE_RPC',
      error: unsupportedMethodError(),
    });
  } catch {
    // Puerto cerrado: nada que responder.
  }
};

/**
 * Registra el listener de `chrome.runtime.onConnect` para el puerto `truekeate_approval`.
 *
 * Se registra de forma SÍNCRONA al evaluar el Service Worker: un `onConnect` puede ser justamente
 * el evento que lo despierte, así que el listener debe existir antes del primer `await` del
 * arranque.
 */
export const registerApprovalPortListener = (options: PortListenerOptions = {}): boolean => {
  const runtime = options.runtime === undefined ? runtimeApi() : options.runtime;
  if (runtime?.onConnect === undefined || typeof runtime.onConnect.addListener !== 'function') {
    return false;
  }
  runtime.onConnect.addListener((port) => {
    if (port.name !== APPROVAL_PORT_NAME) {
      return;
    }
    port.onMessage.addListener((message) => {
      const record = asRecord(message);
      const type = record?.type;
      if (isTruekeateMessageType(type) && type === 'RESUME') {
        const approvalId = typeof record?.approvalId === 'string' ? record.approvalId : '';
        void handleResume(approvalId, port, {
          now: options.now,
          storage: options.storage,
        }).catch((error: unknown) => {
          console.warn('[truekeate] fallo al atender el RESUME del puerto de aprobación', error);
        });
        return;
      }
      if (options.onUnhandled !== undefined) {
        options.onUnhandled(message, port);
        return;
      }
      // Cualquier otra petición por este puerto: catálogo público no implementado → 4200.
      replyUnsupported(port, type);
    });
    port.onDisconnect.addListener(() => {
      // El índice es volátil: al desconectarse, se retira el vínculo de esa instancia concreta.
      for (const [approvalId, bound] of [...portsByApprovalId.entries()]) {
        if (bound === port) {
          portsByApprovalId.delete(approvalId);
        }
      }
    });
  });
  return true;
};
