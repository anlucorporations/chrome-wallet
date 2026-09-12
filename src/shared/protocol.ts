/**
 * M56 — `src/shared/protocol.ts`
 * Tipos y nombres de los mensajes internos: qué `type` viaja por cada canal, en qué
 * dirección y con qué guarda.
 *
 * Fuente normativa: `documento_tecnico.md` §2.5.1 y `diccionario_datos.md` §4.1 y §4.2.
 * Son **8** tipos de mensaje (ADT-29), no 6: la tabla heredada de nomenclatura omitía
 * `TRUEKEATE_ANNOUNCE` y `RESUME`.
 *
 * Requisitos: RF-13, RF-15, RF-24, RF-37 y RF-45 (RNF-10, RT-13).
 */

import type {
  Address,
  ApprovalMethod,
  Eip1193Error,
  Eip6963ProviderDetail,
  InternalMethod,
  PageMethod,
  ProviderEventName,
  Uuid,
} from './types';
import { APPROVAL_PORT_NAME, EXPIRE_ALARM_PREFIX } from './constants';

// Reexportación: la fuente única de los literales es `constants.ts` (M57).
export { APPROVAL_PORT_NAME, EXPIRE_ALARM_PREFIX };

/** Nombre del canal de larga vida entre la página y el Service Worker. */
export const APPROVAL_PORT = APPROVAL_PORT_NAME;

/** Prefijo de las alarmas de vencimiento gestionadas por el SW (M15). */
export const EXPIRE_ALARM = EXPIRE_ALARM_PREFIX;

/** Los 8 tipos de mensaje del protocolo, cerrados. */
export type TruekeateMessageType =
  | 'TRUEKEATE_REQUEST'
  | 'TRUEKEATE_RESPONSE'
  | 'TRUEKEATE_EVENT'
  | 'TRUEKEATE_ANNOUNCE'
  | 'TRUEKEATE_RPC'
  | 'SIGN_RESPONSE'
  | 'CONNECT_RESPONSE'
  | 'RESUME';

/** Los 8 nombres como valor en tiempo de ejecución (verificación de nomenclatura). */
export const TRUEKEATE_MESSAGE_TYPES: readonly TruekeateMessageType[] = [
  'TRUEKEATE_REQUEST',
  'TRUEKEATE_RESPONSE',
  'TRUEKEATE_EVENT',
  'TRUEKEATE_ANNOUNCE',
  'TRUEKEATE_RPC',
  'SIGN_RESPONSE',
  'CONNECT_RESPONSE',
  'RESUME',
] as const;

// ---------------------------------------------------------------------------
// Salto 1: página ↔ content script (`window.postMessage`)
// ---------------------------------------------------------------------------

/** inject → content: petición de la dApp. */
export interface TruekeateRequestMessage {
  type: 'TRUEKEATE_REQUEST';
  id: string;
  method: string;
  params?: unknown[];
}

/** content → inject → página: respuesta; `error` es siempre un objeto EIP-1193. */
export interface TruekeateResponseMessage {
  type: 'TRUEKEATE_RESPONSE';
  id: string;
  result?: unknown;
  error?: Eip1193Error;
}

/** SW → content → inject → página: se reenvía LITERALMENTE, sin transformar ni filtrar. */
export interface TruekeateEventMessage {
  type: 'TRUEKEATE_EVENT';
  eventName: ProviderEventName;
  data: unknown;
}

/** inject → content: anuncio EIP-6963 (objeto `detail` completo). */
export interface TruekeateAnnounceMessage {
  type: 'TRUEKEATE_ANNOUNCE';
  info: Eip6963ProviderDetail;
}

/** Mensajes que viajan por `window.postMessage`. */
export type PageMessage =
  | TruekeateRequestMessage
  | TruekeateResponseMessage
  | TruekeateEventMessage
  | TruekeateAnnounceMessage;

// ---------------------------------------------------------------------------
// Salto 2: content script / popup ↔ Service Worker (`chrome.runtime`)
// ---------------------------------------------------------------------------

/**
 * content / popup → SW. El campo `origin` es dato NO fiable: el SW lo recalcula
 * SOLO desde `sender.origin` (D-J / ADT-07).
 */
export interface TruekeateRpcMessage {
  type: 'TRUEKEATE_RPC';
  method: PageMethod | InternalMethod | ApprovalMethod;
  params?: unknown[];
  /** Dato NO fiable: el SW lo recalcula desde `sender.origin`. */
  origin: string;
  /** `null` si la solicitud nace en el popup. */
  tabId: number | null;
  /** `0` = top frame; distinto de 0 exige responder SOLO a ese frame. */
  frameId: number | null;
  /**
   * **Correlación del salto 1** (H-07, D-H4-E10): `id` que la página (capa inject) puso en su
   * `TRUEKEATE_REQUEST`. Es dato NO fiable y el SW **no** lo interpreta: solo lo persiste con la
   * solicitud aprobable para que la resolución empujada vuelva con el `id` que la promesa de la
   * dApp está esperando. Ausente en los emisores internos (popup, ventanas de la extensión).
   */
  requestId?: string;
}

/** `notification.html` → SW: decisión del usuario sobre una aprobación. */
export interface SignResponseMessage {
  type: 'SIGN_RESPONSE';
  approvalId: Uuid;
  success: boolean;
  error?: Eip1193Error;
}

/** `connect.html` → SW: decisión del usuario sobre una conexión. */
export interface ConnectResponseMessage {
  type: 'CONNECT_RESPONSE';
  requestId: Uuid;
  success: boolean;
  account?: Address;
  accountIndex?: number;
  error?: Eip1193Error;
}

/** content / popup → SW por el puerto: reanudación tras reconexión con backoff. */
export interface ResumeMessage {
  type: 'RESUME';
  approvalId: Uuid;
}

/** Mensajes que viajan por `chrome.runtime.sendMessage` o por el puerto. */
export type RuntimeMessage =
  | TruekeateRpcMessage
  | SignResponseMessage
  | ConnectResponseMessage
  | ResumeMessage;

/** Unión de los 8 tipos: útil para el discriminante del router (M3). */
export type TruekeateMessage =
  | PageMessage
  | RuntimeMessage;

/** Comprueba, sin `any`, si un valor es un mensaje del protocolo con `type` conocido. */
export const isTruekeateMessageType = (value: unknown): value is TruekeateMessageType =>
  typeof value === 'string' && (TRUEKEATE_MESSAGE_TYPES as readonly string[]).includes(value);

/** Ruta interna del popup (allowlist de contextos confiables). */
export const EXTENSION_ROUTE_POPUP = 'index.html' as const;

/** Ruta interna de la ventana de conexión. */
export const EXTENSION_ROUTE_CONNECT = 'connect.html' as const;

/** Ruta interna de la ventana única de confirmación. */
export const EXTENSION_ROUTE_NOTIFICATION = 'notification.html' as const;
