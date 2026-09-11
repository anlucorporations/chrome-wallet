/**
 * M27 — `src/background/events.ts`
 * Propagación de eventos EIP-1193 del Service Worker a **todas las pestañas** (H3, tarea 3.8).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §2.5.1: `TRUEKEATE_EVENT { type, eventName, data }` viaja del SW al
 *   content script y este lo reenvía **literalmente** a la página (dos saltos, sin transformar).
 * - `plan_desarrollo.md` §3.3.5 tarea 3.8 y §3.3.6 `CA-RF-15`/`CA-RF-24` (parte `accountsChanged`):
 *   el evento llega a **todas** las pestañas, con la cuenta nueva cuando cambia desde el popup.
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Canal único**: `chrome.tabs.sendMessage` con `{ frameId }` SOLO cuando el origen del evento
 *    es el frame distinto de 0 (DEC-40/ADT-07: al top frame se le responde sin opciones).
 * 2. **Sin fallo en cascada**: una pestaña sin content script (o cerrada entre la consulta y el
 *    envío) NO rompe la propagación; su error se ignora y el resto sigue recibiendo el evento.
 * 3. **Servicio Worker puro**: no usa `setTimeout`/`setInterval` (prohibidos en MV3) ni escribe en
 *    `truekeate_logs` (la observabilidad de actividad es de H5).
 */

import type { Address, ChainIdHex, ProviderEventName } from '../shared/types';

/** Mensaje de evento tal y como lo consume el content script (M38). */
export interface TruekeateEventEnvelope {
  type: 'TRUEKEATE_EVENT';
  eventName: ProviderEventName;
  /** Se reenvía LITERALMENTE a la página: aquí no se filtra ni se transforma nada. */
  data: unknown;
}

/** Opciones de entrega de un evento a una pestaña concreta. */
export interface EventDeliveryOptions {
  tabId: number;
  /** Solo se usa cuando es distinto de 0 (DEC-40). */
  frameId?: number | null;
}

/** Superficie mínima de `chrome.tabs` que usa el propagador (sin `any`). */
export interface TabsLike {
  query(queryInfo: Record<string, unknown>): Promise<unknown[]>;
  sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
}

/** Superficie inyectable: en producción, `chrome.tabs`; en pruebas, un doble. */
export interface EventsDeps {
  tabs: TabsLike | null;
}

/** Opciones del propagador (todas con su valor real por defecto). */
export interface EmitOptions {
  /** Pestañas concretas; si se omite, se emite a TODAS las pestañas abiertas. */
  tabIds?: readonly number[];
  /** Frame destino; `0` o `null` = top frame (sin opciones de `sendMessage`). */
  frameId?: number | null;
  deps?: EventsDeps;
}

/** Devuelve `chrome.tabs` sin `any`, o `null` si la API no está disponible. */
export const getTabsApi = (): TabsLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const tabs: unknown = (chromeNs as { tabs?: unknown }).tabs;
  if (typeof tabs !== 'object' || tabs === null) {
    return null;
  }
  const candidate = tabs as { query?: unknown; sendMessage?: unknown };
  if (typeof candidate.query !== 'function' || typeof candidate.sendMessage !== 'function') {
    return null;
  }
  return tabs as TabsLike;
};

/** Dependencias reales: `chrome.tabs`. */
export const defaultEventsDeps = (): EventsDeps => ({ tabs: getTabsApi() });

/** Ids de todas las pestañas abiertas (vacío si la API no está o falla). */
export const allTabIds = async (tabs: TabsLike | null): Promise<number[]> => {
  if (tabs === null) {
    return [];
  }
  try {
    const found = await tabs.query({});
    return found
      .map((entry) => {
        const record = typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }) : {};
        return typeof record.id === 'number' ? record.id : null;
      })
      .filter((tabId): tabId is number => tabId !== null);
  } catch {
    return [];
  }
};

/**
 * Entrega UN evento a UNA pestaña (y a su frame, si procede).
 *
 * Es el ÚNICO punto que llama a `chrome.tabs.sendMessage`: con `frameId !== 0` la respuesta viaja
 * SOLO a ese frame (DEC-40/ADT-07) y en ningún caso se usa `sender.tab.url` para deducir origen.
 */
export const sendEventToTab = async (
  envelope: TruekeateEventEnvelope,
  options: EventDeliveryOptions,
  tabs: TabsLike | null = getTabsApi(),
): Promise<boolean> => {
  if (tabs === null) {
    return false;
  }
  const frameId = options.frameId ?? null;
  try {
    if (frameId !== null && frameId !== 0) {
      await tabs.sendMessage(options.tabId, envelope, { frameId });
    } else {
      await tabs.sendMessage(options.tabId, envelope);
    }
    return true;
  } catch {
    // Pestaña sin content script, cerrada o frame inexistente: el evento no se pierde para las
    // demás pestañas, que se recorren por separado.
    return false;
  }
};

/**
 * Emite un evento del catálogo de 5 a TODAS las pestañas (o a las indicadas) y devuelve cuántas
 * lo recibieron. `accountsChanged` es el único que transporta una dirección; los demás llevan su
 * `data` tal cual (`connect` → `{ chainId }`, `disconnect` → `{ code }`, `message` → el payload).
 */
export const emitProviderEvent = async (
  eventName: ProviderEventName,
  data: unknown,
  options: EmitOptions = {},
): Promise<number> => {
  const deps = options.deps ?? defaultEventsDeps();
  const tabIds = options.tabIds ?? (await allTabIds(deps.tabs));
  const envelope: TruekeateEventEnvelope = { type: 'TRUEKEATE_EVENT', eventName, data };
  let delivered = 0;
  for (const tabId of tabIds) {
    const sent = await sendEventToTab(
      envelope,
      { tabId, frameId: options.frameId ?? null },
      deps.tabs,
    );
    if (sent) {
      delivered += 1;
    }
  }
  return delivered;
};

/** `accountsChanged` con la cuenta nueva (`[]` al revocar). */
export const emitAccountsChanged = (accounts: readonly Address[], options: EmitOptions = {}): Promise<number> =>
  emitProviderEvent('accountsChanged', [...accounts], options);

/**
 * `connect`: se emite al crear la sesión de un origen (o al recuperarla tras una recarga).
 * El `chainId` viaja en hexadecimal, como exige EIP-1193.
 */
export const emitConnect = (chainId: ChainIdHex, options: EmitOptions = {}): Promise<number> =>
  emitProviderEvent('connect', { chainId }, options);

/** `disconnect`: el nodo dejó de responder (`4900`) o la sesión se perdió. */
export const emitDisconnect = (
  error: { code: number; message: string },
  options: EmitOptions = {},
): Promise<number> => emitProviderEvent('disconnect', error, options);

/**
 * `message`: carga arbitraria de la dApp. **NO** se emite en H3 (no hay ningún método que lo
 * produzca); se publica aquí para que H4/H5 tengan el canal ya cerrado.
 */
export const emitMessage = (payload: unknown, options: EmitOptions = {}): Promise<number> =>
  emitProviderEvent('message', payload, options);
