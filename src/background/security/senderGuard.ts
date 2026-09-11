/**
 * M20 — `src/background/security/senderGuard.ts`
 * Guardas del canal interno (content script / popup ↔ Service Worker).
 *
 * Controles que implementa (`documento_tecnico.md` §3.7 y `diccionario_datos.md` §4.2):
 * 1. `sender.id === chrome.runtime.id`; si no, `4100`.
 * 2. Allowlist de rutas: `SIGN_RESPONSE` solo desde `notification.html`,
 *    `CONNECT_RESPONSE` solo desde `connect.html`; otra ruta → `4200`.
 * 3. Allowlist de métodos internos: los `wallet_*` solo desde páginas de la extensión
 *    (`sender.tab === undefined`); desde un content script → `4200`.
 * 4. El `origin` se recalcula SOLO desde `sender.origin`. Con `sender.frameId !== 0`
 *    queda PROHIBIDO respaldarse en `sender.tab.url` (D-J / ADT-07): en un iframe
 *    cross-origin ese `url` es el del top y el iframe heredaría la sesión del anfitrión.
 *
 * Este módulo no toca la cola ni la ventana: solo decide si el mensaje puede continuar
 * y hacia dónde debe volver la respuesta.
 */

import type { Eip1193Error, WalletMethod } from '../../shared/types';
import {
  EXTENSION_ORIGIN,
  PROVIDER_WINDOW_ALIAS,
  PROVIDER_WINDOW_KEY,
} from '../../shared/constants';
import {
  EXTENSION_ROUTE_CONNECT,
  EXTENSION_ROUTE_NOTIFICATION,
  EXTENSION_ROUTE_POPUP,
} from '../../shared/protocol';
import { INTERNAL_METHODS } from '../rpc/catalog';
import { methodNotAllowedInContextError, unauthorizedOriginError } from '../rpc/errors';

/** Rutas internas permitidas como emisoras de mensajes (allowlist cerrada). */
export const EXTENSION_ROUTE_ALLOWLIST: readonly string[] = [
  EXTENSION_ROUTE_POPUP,
  EXTENSION_ROUTE_CONNECT,
  EXTENSION_ROUTE_NOTIFICATION,
];

/** Rutas admitidas para cada respuesta interna del protocolo. */
export const ROUTE_BY_RESPONSE_TYPE = {
  SIGN_RESPONSE: EXTENSION_ROUTE_NOTIFICATION,
  CONNECT_RESPONSE: EXTENSION_ROUTE_CONNECT,
} as const;

/** Datos de emisor que el Service Worker recibe de `chrome.runtime`. */
export interface SenderLike {
  id?: string | undefined;
  origin?: string | undefined;
  /** NO FIABLE para derivar el origen: con `frameId !== 0` apunta al top frame. */
  url?: string | undefined;
  tab?: { id?: number | undefined } | undefined;
  frameId?: number | undefined;
}

/** Datos que el mensaje declara; son datos NO fiables. */
export interface DeclaredContext {
  /** `origin` declarado por la página: se ignora y se recalcula. */
  origin?: string | undefined;
  tabId?: number | null | undefined;
  frameId?: number | null | undefined;
}

/** Contexto confiable ya validado por la guarda. */
export interface TrustedSenderContext {
  runtimeId: string;
  /** Origen normalizado: se deriva SOLO de `sender.origin` o de la propia extensión. */
  origin: string;
  /** `true` cuando el emisor es una página de la extensión (popup / connect / notification). */
  isExtensionContext: boolean;
  /** Ruta interna del emisor, si es un contexto de la extensión. */
  route: string | null;
  tabId: number | null;
  frameId: number;
  /** Con `frameId !== 0` la respuesta vuelve SOLO a ese frame (D-J / ADT-07). */
  respondToFrameOnly: boolean;
  /** `origin` declarado por el mensaje, conservado SOLO para detectar discrepancias. */
  declaredOrigin: string | null;
}

/** Resultado discriminado de la guarda de emisor. */
export type SenderGuardResult =
  | { ok: true; context: TrustedSenderContext }
  | { ok: false; error: Eip1193Error };

/** Extrae `runtime.id` sin `any` y sin fallar cuando `chrome` no está disponible. */
export const getRuntimeId = (): string => {
  const runtime: unknown = chrome.runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return '';
  }
  const id: unknown = (runtime as { id?: unknown }).id;
  return typeof id === 'string' ? id : '';
};

/**
 * Normaliza un origen a la clave canónica: minúsculas, sin barra final y conservando el
 * puerto (`diccionario_datos.md` §1 y §2.7). Devuelve `null` si no es utilizable.
 */
export const normalizeOrigin = (raw: string | undefined): string | null => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  let candidate = raw.trim();
  if (candidate.length === 0) {
    return null;
  }
  if (candidate.endsWith('/')) {
    candidate = candidate.slice(0, -1);
  }
  return candidate.toLowerCase();
};

/** Extrae la ruta interna (`connect.html`, …) de una URL de `chrome-extension://`. */
export const routeFromUrl = (url: string | undefined): string | null => {
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, '');
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
};

/**
 * Deriva el origen confiable. Regla dura: SOLO desde `sender.origin`; para los contextos
 * de la propia extensión (que no tienen origen de página) se usa `extension`.
 * Nunca se usa `sender.tab.url` (D-J / ADT-07).
 */
export const resolveOrigin = (sender: SenderLike): string => {
  const fromSender = normalizeOrigin(sender.origin);
  if (fromSender !== null) {
    return fromSender;
  }
  // Contextos de la extensión: popup, connect.html y notification.html no tienen origen web.
  if (sender.tab === undefined) {
    return EXTENSION_ORIGIN;
  }
  // Página sin origen utilizable: la solicitud se rechaza más arriba con 4100.
  return '';
};

/** ¿Es un contexto de la propia extensión? `sender.tab === undefined` y ruta en allowlist. */
export const isExtensionSender = (sender: SenderLike): boolean => {
  if (sender.tab !== undefined) {
    return false;
  }
  const route = routeFromUrl(sender.url);
  return route !== null && EXTENSION_ROUTE_ALLOWLIST.includes(route);
};

/**
 * Nombres de los métodos internos `wallet_*`. Se derivan del catálogo (M4) para que la
 * allowlist del contrato §5.1.1 tenga una ÚNICA fuente y no pueda divergir.
 */
export const INTERNAL_METHOD_NAMES: readonly string[] = INTERNAL_METHODS;

/** ¿Es el método uno de los internos `wallet_*` del contrato de §5.1.1? */
export const isInternalMethodName = (method: string): boolean =>
  INTERNAL_METHOD_NAMES.includes(method);

/**
 * Guarda principal del canal interno.
 *
 * @param sender Emisor según `chrome.runtime`.
 * @param declared Contexto declarado por el mensaje (dato NO fiable).
 * @param method Método solicitado, si el mensaje es un `TRUEKEATE_RPC`.
 */
export const guardSender = (
  sender: SenderLike,
  declared: DeclaredContext = {},
  method?: WalletMethod,
): SenderGuardResult => {
  // 1. Emisor autorizado: cualquier otro `id` se descarta con 4100.
  const runtimeId = getRuntimeId();
  if (runtimeId.length > 0 && sender.id !== runtimeId) {
    return { ok: false, error: unauthorizedOriginError() };
  }

  const isExtensionContext = isExtensionSender(sender);
  const route = routeFromUrl(sender.url);
  const origin = resolveOrigin(sender);

  // Una página con `tab` presente pero sin origen utilizable no puede tener sesión.
  if (origin.length === 0) {
    return { ok: false, error: unauthorizedOriginError() };
  }

  // 3. Allowlist de métodos internos: los `wallet_*` solo desde la extensión.
  if (method !== undefined && isInternalMethodName(method) && !isExtensionContext) {
    return { ok: false, error: methodNotAllowedInContextError() };
  }

  // El `frameId` declarado se ignora: manda el del emisor real.
  const frameId = typeof sender.frameId === 'number' ? sender.frameId : 0;
  const tabId = typeof sender.tab?.id === 'number' ? sender.tab.id : null;

  return {
    ok: true,
    context: {
      runtimeId,
      origin,
      isExtensionContext,
      route,
      tabId,
      frameId,
      respondToFrameOnly: frameId !== 0,
      // Dato NO fiable, conservado solo para detectar (y registrar) una discrepancia.
      declaredOrigin: normalizeOrigin(declared.origin),
    },
  };
};

/** Comprueba la allowlist de rutas de un mensaje de respuesta interna. */
export const guardResponseRoute = (
  type: keyof typeof ROUTE_BY_RESPONSE_TYPE,
  sender: SenderLike,
): SenderGuardResult => {
  const runtimeId = getRuntimeId();
  if (runtimeId.length > 0 && sender.id !== runtimeId) {
    return { ok: false, error: unauthorizedOriginError() };
  }
  const route = routeFromUrl(sender.url);
  const expected = ROUTE_BY_RESPONSE_TYPE[type];
  if (route !== expected) {
    // Ruta fuera de la allowlist → 4200 (no es un problema de sesión).
    return { ok: false, error: methodNotAllowedInContextError() };
  }
  return {
    ok: true,
    context: {
      runtimeId,
      origin: EXTENSION_ORIGIN,
      isExtensionContext: true,
      route,
      tabId: typeof sender.tab?.id === 'number' ? sender.tab.id : null,
      frameId: typeof sender.frameId === 'number' ? sender.frameId : 0,
      respondToFrameOnly: false,
      declaredOrigin: null,
    },
  };
};

/** Opciones de entrega de la respuesta: con `frameId !== 0`, solo a ese frame. */
export interface ResponseTarget {
  tabId: number | null;
  frameId: number | null;
}

/** Calcula el destino exacto de la respuesta a partir del contexto confiable. */
export const responseTargetFor = (context: TrustedSenderContext): ResponseTarget => {
  if (context.tabId === null) {
    // Contexto de la extensión: la respuesta vuelve por el mismo canal de mensajes.
    return { tabId: null, frameId: null };
  }
  return {
    tabId: context.tabId,
    // A un top frame se le responde sin opciones; a un iframe, SOLO a su frame.
    frameId: context.respondToFrameOnly ? context.frameId : null,
  };
};

/** Nombres de las claves del provider publicadas en `window` (para mensajes de error). */
export const PROVIDER_NAMES: readonly string[] = [PROVIDER_WINDOW_KEY, PROVIDER_WINDOW_ALIAS];
