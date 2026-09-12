/**
 * M18 — `src/background/approvals/focus.ts`
 * Ventana de decisión **GLOBAL ÚNICA** (`notification.html`, P-21): abrir o reutilizar por
 * `windowId`, re-descubrir por URL y mostrar la `pending` más antigua con su contador
 * (H4, tarea 4.4 de `plan_desarrollo.md` §3.4.5).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §2.3 (invariantes «Ventana de confirmación global», «Estado de la ventana
 *   recargado» y «Cierre por ventana o pestaña») y §3.1 regla 4.
 * - `diccionario_datos.md` §2.14 (`truekeate_approval_window`), §2.8 (FIFO y contador) y §3.8
 *   (contrato de apertura, solicitud mostrada, cierre con la X).
 *
 * INVARIANTES QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Como máximo UNA `notification.html` en toda la extensión**: `windowId !== null` implica
 *    exactamente una ventana. Dos solicitudes simultáneas de orígenes distintos producen **una
 *    sola** llamada a `chrome.windows.create` (el «leer → decidir → crear» va bajo un cerrojo).
 * 2. `shownApprovalId` es SIEMPRE la `pending` con `createdAt` más antiguo (FIFO). Las demás
 *    esperan en la cola de M14, sin ventana y sin estado propio.
 * 3. Cuando la mostrada deja de estar `pending`, la MISMA ventana pasa a la siguiente; si no queda
 *    ninguna, se cierra y se escribe `windowId: null`.
 * 4. **Cerrar con la X equivale a RECHAZO (`4001`)**, salvo que el plazo ya haya vencido, en cuyo
 *    caso prevalece `expired` (§3.8). Para no confundir ese cierre con los nuestros, la ventana se
 *    marca cerrada en `truekeate_approval_window` **antes** de llamar a `windows.remove`.
 * 5. El estado de la ventana es PERSISTIDO (`truekeate_approval_window`), no memoria: sobrevive a la
 *    suspensión del SW y la reconciliación lo contrasta con `chrome.windows.getAll`.
 *
 * ORDEN DE CERROJOS (importante): se toma SIEMPRE `focusLock` antes que el `rmwLock` de M14, y
 * nunca se anida el mismo cerrojo dos veces. Por eso las funciones públicas con cerrojo delegan en
 * una implementación interna SIN cerrojo, que es la que pueden reutilizar entre sí.
 */

import type {
  ApprovalWindow,
  PendingRequest,
  PendingRequestsMap,
  Uuid,
} from '../../shared/types';
import { SIGN_TIMEOUT_MS } from '../../shared/constants';
import { EXTENSION_ROUTE_NOTIFICATION } from '../../shared/protocol';
import { approvalWindowClosedError, timeoutError } from '../rpc/errors';
import { EXTENSION_URL_SCHEME, getRuntimeId, isExtensionUrl } from '../security/senderGuard';
import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
  type StorageLocalLike,
  type StorageSnapshot,
} from '../state/schema';
import {
  appendLogEntry,
  createSerialLock,
  isExpired,
  oldestPending,
  pendingCount,
  purgeBadge,
  readPendingRequestsFromSnapshot,
  resolveApprovalRequest,
} from './queue';
import {
  deliverApprovalResolution,
  pushApprovalRequest,
  type ApprovalDelivery,
} from './ports';

// ---------------------------------------------------------------------------
// Medidas y superficie de `chrome.windows` (sin `any`)
// ---------------------------------------------------------------------------

/** Medidas normativas de la ventana de decisión (P3, `documento_tecnico.md` §2.4). */
export const NOTIFICATION_WINDOW_WIDTH = 420 as const;
export const NOTIFICATION_WINDOW_HEIGHT = 640 as const;

/** Superficie mínima de `chrome.windows` que usa el SW. */
export interface WindowsApiLike {
  create(createData: {
    url: string;
    type?: string;
    width?: number;
    height?: number;
    focused?: boolean;
  }): Promise<unknown> | undefined;
  get(windowId: number, getInfo?: { populate?: boolean }): Promise<unknown> | undefined;
  getAll(query?: { populate?: boolean }): Promise<readonly unknown[]> | undefined;
  update?(windowId: number, updateInfo: { focused?: boolean }): Promise<unknown> | undefined;
  remove(windowId: number): Promise<unknown> | undefined;
  onRemoved?: { addListener(listener: (windowId: number, info: unknown) => void): void };
}

/** Devuelve `chrome.windows` sin `any`, o `null` si la API no está disponible. */
export const getWindowsApi = (): WindowsApiLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const windows: unknown = (chromeNs as { windows?: unknown }).windows;
  if (typeof windows !== 'object' || windows === null) {
    return null;
  }
  const candidate = windows as { create?: unknown; get?: unknown; getAll?: unknown };
  if (
    typeof candidate.create !== 'function' ||
    typeof candidate.get !== 'function' ||
    typeof candidate.getAll !== 'function'
  ) {
    return null;
  }
  return windows as WindowsApiLike;
};

/** Resuelve `chrome.runtime.getURL`; cae a la ruta relativa si no está disponible. */
export const getUrlResolver = (): ((path: string) => string) => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  const runtime: unknown =
    typeof chromeNs === 'object' && chromeNs !== null
      ? (chromeNs as { runtime?: unknown }).runtime
      : undefined;
  const getURL: unknown =
    typeof runtime === 'object' && runtime !== null
      ? (runtime as { getURL?: unknown }).getURL
      : undefined;
  if (typeof getURL === 'function') {
    return (path: string) => (getURL as (p: string) => string).call(runtime, path);
  }
  return (path: string) => path;
};

/** Correlador y origen que la ventana lee de su propia URL (`App.tsx`: `readApprovalBootstrap`). */
export interface NotificationWindowParams {
  /** `approvalId` de la solicitud MOSTRADA (`shownApprovalId`); se publica en `?approvalId=`. */
  approvalId?: string | null;
  /** Origen de la dApp que la ventana pinta mientras llega el cuerpo (`?origin=`). */
  origin?: string | null;
}

/**
 * URL absoluta de la ventana única: `chrome-extension://<id>/notification.html` y, cuando se
 * conoce la solicitud que debe mostrar, **`?approvalId=<shownApprovalId>`** (y `&origin=<origen>`).
 *
 * Sin ese correlador la ventana no tiene nada que pedir y declara el hueco (M50): es la mitad
 * «abrir» del hueco de integración de H4. La otra mitad es el cuerpo, que viaja en la respuesta del
 * `RESUME` y en el empuje por mensaje (`ports.ts`).
 */
export const notificationWindowUrl = (
  getUrl: (path: string) => string = getUrlResolver(),
  params: NotificationWindowParams = {},
): string => {
  const base = getUrl(EXTENSION_ROUTE_NOTIFICATION);
  const query = new URLSearchParams();
  if (typeof params.approvalId === 'string' && params.approvalId.length > 0) {
    query.set('approvalId', params.approvalId);
  }
  if (typeof params.origin === 'string' && params.origin.length > 0) {
    query.set('origin', params.origin);
  }
  const suffix = query.toString();
  return suffix.length === 0 ? base : `${base}?${suffix}`;
};

/**
 * ¿Es la URL de una pestaña la de la ventana única? (tolerante a `?query` y `#hash`).
 *
 * D-H4-E5 (corregido): la comparación exige el **origen de ESTA extensión**, no solo el `pathname`.
 * Comparar únicamente la ruta hacía que una página de la dApp servida en `/notification.html`
 * (`http://localhost:5174/notification.html`) se reconociera como la ventana de decisión: el
 * re-descubrimiento de M18 la habría dado por buena y **no se habría abierto la ventana de verdad**,
 * dejando la solicitud sin mostrar hasta su vencimiento. La ruta se compara sobre el `pathname`
 * (`/notification.html`), sin barra inicial y sin distinguir mayúsculas, y el origen debe ser
 * `chrome-extension://<runtime.id>`.
 */
export const isNotificationTabUrl = (url: unknown): boolean => {
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(url);
    // `chrome-extension:` no expone `origin` en todos los motores, así que el origen se comprueba
    // por esquema + host (el `id` de la extensión), que es su forma canónica.
    if (!isExtensionUrl(url) || parsed.protocol !== 'chrome-extension:') {
      return false;
    }
    const runtimeId = getRuntimeId();
    if (runtimeId.length > 0 && parsed.host !== runtimeId) {
      return false;
    }
    return parsed.pathname.replace(/^\/+/, '').toLowerCase() === EXTENSION_ROUTE_NOTIFICATION;
  } catch {
    // URL no parseable: se exige el esquema de la extensión ADEMÁS de la ruta.
    return (
      url.trim().toLowerCase().startsWith(EXTENSION_URL_SCHEME) &&
      url.toLowerCase().includes(EXTENSION_ROUTE_NOTIFICATION)
    );
  }
};

/** ¿Es un objeto plano utilizable? */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Extrae `id` numérico de una ventana o pestaña devuelta por la API. */
const numericId = (value: unknown): number | null => {
  const record = asRecord(value);
  return typeof record?.id === 'number' ? record.id : null;
};

// ---------------------------------------------------------------------------
// `truekeate_approval_window` (clave canónica de M33)
// ---------------------------------------------------------------------------

/** Valor inicial exacto de §2.14. */
export const INITIAL_APPROVAL_WINDOW: ApprovalWindow = {
  windowId: null,
  shownApprovalId: null,
  openedAt: null,
  updatedAt: 0,
};

/** Proyecta `truekeate_approval_window` (función pura). */
export const readApprovalWindowFromSnapshot = (snapshot: StorageSnapshot): ApprovalWindow => {
  const raw = asRecord(snapshot[STORAGE_KEYS.approvalWindow]);
  if (raw === null) {
    return { ...INITIAL_APPROVAL_WINDOW };
  }
  return {
    windowId: typeof raw.windowId === 'number' ? raw.windowId : null,
    shownApprovalId: typeof raw.shownApprovalId === 'string' ? raw.shownApprovalId : null,
    openedAt: typeof raw.openedAt === 'number' ? raw.openedAt : null,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
};

/** Lee el estado persistido de la ventana única. */
export const readApprovalWindow = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<ApprovalWindow> =>
  readApprovalWindowFromSnapshot(await readStorage([STORAGE_KEYS.approvalWindow], storage));

/** Escribe el estado de la ventana única (objeto completo, con `updatedAt`). */
export const writeApprovalWindow = async (
  patch: Partial<ApprovalWindow>,
  options: { now?: number; storage?: StorageLocalLike | null } = {},
): Promise<ApprovalWindow | null> => {
  const next: ApprovalWindow = {
    ...INITIAL_APPROVAL_WINDOW,
    ...patch,
    updatedAt: options.now ?? Date.now(),
  };
  const written = await writeStorage({ [STORAGE_KEYS.approvalWindow]: next }, options.storage);
  return written ? next : null;
};

// ---------------------------------------------------------------------------
// Cerrojo de la ventana única
// ---------------------------------------------------------------------------

/**
 * Cerrojo propio de la ventana única: serializa el «leer estado → decidir → crear/reutilizar/cerrar»
 * para que dos solicitudes simultáneas NO creen dos ventanas (invariante 1 de §2.14). Es un cerrojo
 * INDEPENDIENTE del `rmwLock` de la cola y se toma SIEMPRE antes que él.
 */
export const focusLock = createSerialLock();

/** Ejecuta `task` bajo el cerrojo de la ventana única. */
export const withFocusLock = <T>(task: () => Promise<T>): Promise<T> => focusLock.run(task);

// ---------------------------------------------------------------------------
// Localización de la ventana
// ---------------------------------------------------------------------------

/** Ventana `notification.html` localizada. */
export interface NotificationWindowRef {
  windowId: number;
  /**
   * Pestaña de la ventana que carga `notification.html`, si la API la dio a conocer. Es el destino
   * del empuje del cuerpo de la solicitud a la ventana ya abierta (`pushApprovalRequest`).
   */
  tabId: number | null;
  /** `true` cuando se localizó por re-descubrimiento de URL y no por el `windowId` persistido. */
  rediscovered: boolean;
}

/** Primera pestaña de una ventana cuya URL es la de la ventana única; `null` si no hay ninguna. */
const notificationTabId = (record: Record<string, unknown> | null): number | null => {
  const tabs = record !== null && Array.isArray(record.tabs) ? record.tabs : [];
  for (const tab of tabs) {
    const tabRecord = asRecord(tab);
    if (isNotificationTabUrl(tabRecord?.url)) {
      return numericId(tab);
    }
  }
  return null;
};

/**
 * Re-descubre la ventana única filtrando `chrome.windows.getAll({ populate: true })` por la URL
 * `chrome-extension://<id>/notification.html` (§2.14 regla 4).
 */
export const findNotificationWindow = async (
  windows: WindowsApiLike | null = getWindowsApi(),
): Promise<NotificationWindowRef | null> => {
  if (windows === null) {
    return null;
  }
  try {
    const all = (await windows.getAll({ populate: true })) ?? [];
    for (const entry of all) {
      const record = asRecord(entry);
      const windowId = numericId(entry);
      if (record === null || windowId === null) {
        continue;
      }
      const tabId = notificationTabId(record);
      if (tabId !== null) {
        return { windowId, tabId, rediscovered: true };
      }
    }
  } catch (error) {
    console.warn('[truekeate] no se pudieron enumerar las ventanas', error);
  }
  return null;
};

/**
 * Resuelve la ventana única: primero por el `windowId` persistido y, si se perdió (o no lo hay), por
 * re-descubrimiento de URL. Es lo que impide abrir una SEGUNDA ventana cuando el estado persistido
 * quedó desincronizado.
 *
 * Se pide `{ populate: true }` para conocer la PESTAÑA de la ventana: es el destinatario del empuje
 * del cuerpo cuando la misma ventana pasa a mostrar la siguiente `pending`.
 */
export const resolveNotificationWindow = async (
  state: ApprovalWindow,
  windows: WindowsApiLike | null = getWindowsApi(),
): Promise<NotificationWindowRef | null> => {
  if (windows === null) {
    return null;
  }
  if (state.windowId !== null) {
    try {
      const found = await windows.get(state.windowId, { populate: true });
      if (found !== undefined && found !== null) {
        return {
          windowId: state.windowId,
          tabId: notificationTabId(asRecord(found)),
          rediscovered: false,
        };
      }
    } catch {
      // Ventana perdida: se intenta el re-descubrimiento por URL.
    }
  }
  return findNotificationWindow(windows);
};

/** Enfoca la ventana única: `chrome.windows.update` solo al abrir o al cambiar de solicitud (§3.8). */
const focusWindow = async (windowId: number, windows: WindowsApiLike): Promise<void> => {
  if (typeof windows.update !== 'function') {
    return;
  }
  try {
    await windows.update(windowId, { focused: true });
  } catch (error) {
    console.warn('[truekeate] no se pudo enfocar la ventana única', error);
  }
};

// ---------------------------------------------------------------------------
// Mostrar la siguiente solicitud (o cerrar)
// ---------------------------------------------------------------------------

/** Acción observable de una pasada de la ventana única. */
export type FocusAction = 'opened' | 're-rendered' | 'focused' | 'closed' | 'unchanged' | 'none';

/** Resultado de {@link showOldestPending}. */
export interface FocusOutcome {
  action: FocusAction;
  windowId: number | null;
  shownApprovalId: Uuid | null;
  /** Índice derivado de la cola: «N en espera» y badge (§2.8). */
  pendingCount: number;
  /** Motivo de la acción, para diagnóstico y pruebas. */
  reason: string;
}

/** Opciones de la ventana única (todas inyectables para las pruebas). */
export interface ShowOldestOptions {
  now?: number;
  storage?: StorageLocalLike | null;
  windows?: WindowsApiLike | null;
  getUrl?: (path: string) => string;
  /**
   * **Re-entrega del cuerpo** (cierre de la carrera de D-H4-E10): cuando la pasada encuentra la
   * MISMA solicitud ya mostrada, vuelve a empujarle el cuerpo a la ventana. Hace falta porque la
   * respuesta de `SIGN_RESPONSE` puede llegar a la ventana DESPUÉS del empuje de la siguiente
   * solicitud y dejar su vista marcada como resuelta (botón deshabilitado) aunque el cuerpo sea el
   * correcto; una segunda entrega idempotente la rehabilita. Sin esta opción el comportamiento es
   * el de siempre (`unchanged` sin tocar la ventana).
   */
  repush?: boolean;
}

/**
 * ¿Es la solicitud PRESENTABLE en la ventana única? Una entrada persistida a la que le faltan los
 * campos que la ventana necesita para pintarse (método, origen, cuenta y plazo) NO se muestra: no
 * hay nada que decidir con ella y abrir una ventana en blanco sería peor que esperar a su purga.
 * La entrada, eso sí, sigue ocupando la cola y bloqueando el reset (§3.9).
 */
export const isPresentable = (request: PendingRequest): boolean =>
  request.approvalId.length > 0 &&
  request.origin.length > 0 &&
  request.account.length > 2 &&
  typeof request.createdAt === 'number' &&
  typeof request.expiresAt === 'number' &&
  Array.isArray(request.params);

/** Primera `pending` presentable en orden FIFO (`createdAt` más antiguo). */
export const oldestPresentable = (map: PendingRequestsMap): PendingRequest | null => {
  const candidate = oldestPending(map);
  if (candidate === null || isPresentable(candidate)) {
    return candidate;
  }
  // La más antigua no es presentable: se busca la siguiente por orden FIFO.
  const rest: PendingRequestsMap = { ...map };
  delete rest[candidate.approvalId];
  return oldestPresentable(rest);
};

/** Implementación SIN cerrojo de {@link showOldestPending}. */
const runShowOldestPending = async (options: ShowOldestOptions): Promise<FocusOutcome> => {
  const now = options.now ?? Date.now();
  const storage = options.storage;
  const windows = options.windows === undefined ? getWindowsApi() : options.windows;
  const snapshot = await readStorage(
    [STORAGE_KEYS.pendingRequests, STORAGE_KEYS.approvalWindow],
    storage,
  );
  const map = readPendingRequestsFromSnapshot(snapshot);
  const state = readApprovalWindowFromSnapshot(snapshot);
  const pending = pendingCount(map);
  const candidate = oldestPresentable(map);

  if (windows === null) {
    return {
      action: 'none',
      windowId: state.windowId,
      shownApprovalId: state.shownApprovalId,
      pendingCount: pending,
      reason: 'sin-api-de-ventanas',
    };
  }

  // Sin solicitud que mostrar: se cierra la ventana si existía.
  if (candidate === null) {
    const existing = await resolveNotificationWindow(state, windows);
    if (existing === null) {
      if (state.windowId === null && state.shownApprovalId === null) {
        return {
          action: 'none',
          windowId: null,
          shownApprovalId: null,
          pendingCount: pending,
          reason: 'sin-pendientes-ni-ventana',
        };
      }
      await writeApprovalWindow({ windowId: null, shownApprovalId: null, openedAt: null }, {
        now,
        storage,
      });
      return {
        action: 'unchanged',
        windowId: null,
        shownApprovalId: null,
        pendingCount: pending,
        reason: 'estado-normalizado',
      };
    }
    // Se marca cerrada ANTES de eliminar: así `onRemoved` no lo interpreta como cierre del usuario.
    await writeApprovalWindow({ windowId: null, shownApprovalId: null, openedAt: null }, {
      now,
      storage,
    });
    try {
      await windows.remove(existing.windowId);
    } catch (error) {
      console.warn('[truekeate] no se pudo cerrar la ventana única', error);
    }
    await purgeBadge(pending);
    return {
      action: 'closed',
      windowId: null,
      shownApprovalId: null,
      pendingCount: pending,
      reason: 'sin-pendientes',
    };
  }

  const existing = await resolveNotificationWindow(state, windows);
  if (existing === null) {
    // Ninguna ventana viva: se abre la ÚNICA, con el correlador de la solicitud que mostrará
    // (`?approvalId=<shownApprovalId>&origin=…`): sin él la ventana no tiene nada que pedir.
    let created: unknown;
    try {
      created = await windows.create({
        url: notificationWindowUrl(options.getUrl ?? getUrlResolver(), {
          approvalId: candidate.approvalId,
          origin: candidate.origin,
        }),
        type: 'popup',
        width: NOTIFICATION_WINDOW_WIDTH,
        height: NOTIFICATION_WINDOW_HEIGHT,
        focused: true,
      });
    } catch (error) {
      console.warn('[truekeate] no se pudo abrir la ventana única', error);
      return {
        action: 'none',
        windowId: null,
        shownApprovalId: null,
        pendingCount: pending,
        reason: 'fallo-al-abrir',
      };
    }
    const windowId = numericId(created);
    if (windowId === null) {
      return {
        action: 'none',
        windowId: null,
        shownApprovalId: null,
        pendingCount: pending,
        reason: 'ventana-sin-id',
      };
    }
    await writeApprovalWindow(
      { windowId, shownApprovalId: candidate.approvalId, openedAt: state.openedAt ?? now },
      { now, storage },
    );
    await focusWindow(windowId, windows);
    await purgeBadge(pending);
    return {
      action: 'opened',
      windowId,
      shownApprovalId: candidate.approvalId,
      pendingCount: pending,
      reason: 'primera-apertura',
    };
  }

  // La ventana ya existe: si mostraba otra solicitud, se re-renderiza la MISMA (no se crea ni
  // cierra). La página no vuelve a leer su URL, así que el cuerpo de la NUEVA solicitud se EMPUJA.
  if (state.shownApprovalId !== candidate.approvalId) {
    await writeApprovalWindow(
      { windowId: existing.windowId, shownApprovalId: candidate.approvalId, openedAt: state.openedAt ?? now },
      { now, storage },
    );
    await focusWindow(existing.windowId, windows);
    await pushApprovalRequest(candidate, { pendingCount: pending, tabId: existing.tabId });
    await purgeBadge(pending);
    return {
      action: 're-rendered',
      windowId: existing.windowId,
      shownApprovalId: candidate.approvalId,
      pendingCount: pending,
      reason: 'siguiente-solicitud',
    };
  }

  if (existing.rediscovered) {
    // La ventana se localizó por URL: se repara el `windowId` persistido, se la enfoca y se le
    // vuelve a entregar el cuerpo (pudo quedarse sin él tras una suspensión del SW).
    await writeApprovalWindow(
      { windowId: existing.windowId, shownApprovalId: candidate.approvalId, openedAt: state.openedAt ?? now },
      { now, storage },
    );
    await focusWindow(existing.windowId, windows);
    await pushApprovalRequest(candidate, { pendingCount: pending, tabId: existing.tabId });
    return {
      action: 'focused',
      windowId: existing.windowId,
      shownApprovalId: candidate.approvalId,
      pendingCount: pending,
      reason: 're-descubierta-por-url',
    };
  }

  // Pasada de RE-ENTREGA (`repush`, ver {@link ShowOldestOptions}): la ventana ya mostraba esta
  // solicitud, pero la respuesta de la decisión puede haber llegado después del empuje y haber
  // dejado su vista marcada como resuelta. Se le vuelve a entregar el cuerpo: es idempotente y la
  // ventana lo usa para rearmar la vista de la solicitud que sigue `pending`.
  if (options.repush === true) {
    await pushApprovalRequest(candidate, { pendingCount: pending, tabId: existing.tabId });
  }

  return {
    action: 'unchanged',
    windowId: existing.windowId,
    shownApprovalId: state.shownApprovalId,
    pendingCount: pending,
    reason: options.repush === true ? 're-entrega-del-cuerpo' : 'ya-mostraba-la-misma',
  };
};

/**
 * Restablece el invariante de la ventana única: **una sola** `notification.html` mostrando la
 * `pending` de menor `createdAt` y su contador; sin `pending`, la cierra.
 *
 * Es idempotente y NO escribe cuando no hay nada que cambiar (un arranque sin solicitudes no toca
 * `truekeate_approval_window`).
 */
export const showOldestPending = (options: ShowOldestOptions = {}): Promise<FocusOutcome> =>
  withFocusLock(() => runShowOldestPending(options));

/** Implementación SIN cerrojo de {@link closeApprovalWindow}. */
const runCloseApprovalWindow = async (options: ShowOldestOptions): Promise<boolean> => {
  const now = options.now ?? Date.now();
  const storage = options.storage;
  const windows = options.windows === undefined ? getWindowsApi() : options.windows;
  const state = await readApprovalWindow(storage);
  const existing = await resolveNotificationWindow(state, windows);
  if (windows === null || existing === null) {
    if (state.windowId !== null || state.shownApprovalId !== null) {
      await writeApprovalWindow({ windowId: null, shownApprovalId: null, openedAt: null }, {
        now,
        storage,
      });
    }
    return false;
  }
  await writeApprovalWindow({ windowId: null, shownApprovalId: null, openedAt: null }, {
    now,
    storage,
  });
  try {
    await windows.remove(existing.windowId);
    return true;
  } catch (error) {
    console.warn('[truekeate] no se pudo cerrar la ventana única', error);
    return false;
  }
};

/** Cierra la ventana única si existe (marca el estado ANTES de eliminar la ventana). */
export const closeApprovalWindow = (options: ShowOldestOptions = {}): Promise<boolean> =>
  withFocusLock(() => runCloseApprovalWindow(options));

// ---------------------------------------------------------------------------
// Cierre con la X: rechazo (4001) salvo vencimiento
// ---------------------------------------------------------------------------

/** Resultado de atender el cierre de una ventana. */
export interface WindowRemovedOutcome {
  /** `true` cuando el cierre lo provocó el usuario sobre la ventana mostrada. */
  handled: boolean;
  reason: string;
  /** Estado aplicado a la solicitud mostrada. */
  status: 'rejected' | 'expired' | null;
  approvalId: Uuid | null;
  delivery: ApprovalDelivery | 'none';
  /** Pasada posterior de la ventana única (muestra la siguiente o cierra). */
  refresh: FocusOutcome | null;
  pendingCount: number;
}

/** Implementación SIN cerrojo de {@link handleApprovalWindowRemoved}. */
const runWindowRemoved = async (
  windowId: number,
  options: ShowOldestOptions,
): Promise<WindowRemovedOutcome> => {
  const now = options.now ?? Date.now();
  const storage = options.storage;
  const snapshot = await readStorage(
    [STORAGE_KEYS.pendingRequests, STORAGE_KEYS.approvalWindow],
    storage,
  );
  const state = readApprovalWindowFromSnapshot(snapshot);
  if (state.windowId !== windowId) {
    const map = readPendingRequestsFromSnapshot(snapshot);
    return {
      handled: false,
      reason: 'cierre-propio-o-ajeno',
      status: null,
      approvalId: null,
      delivery: 'none',
      refresh: null,
      pendingCount: pendingCount(map),
    };
  }

  const map = readPendingRequestsFromSnapshot(snapshot);
  const shownId = state.shownApprovalId;
  // La ventana ya no existe: el estado se limpia ANTES de cualquier otra cosa.
  await writeApprovalWindow({ windowId: null, shownApprovalId: null, openedAt: null }, {
    now,
    storage,
  });
  const entry: PendingRequest | undefined = shownId === null ? undefined : map[shownId];

  if (entry === undefined || entry.status !== 'pending') {
    const refresh = await runShowOldestPending({ ...options, now, storage });
    return {
      handled: false,
      reason: 'no-habia-solicitud-mostrada',
      status: null,
      approvalId: shownId,
      delivery: 'none',
      refresh,
      pendingCount: refresh.pendingCount,
    };
  }

  const expired = isExpired(entry, now);
  const status = expired ? 'expired' : 'rejected';
  const resolved = await resolveApprovalRequest(entry.approvalId, status, { now, storage });
  const error = expired
    ? timeoutError(Math.round(SIGN_TIMEOUT_MS / 1000))
    : approvalWindowClosedError();
  const delivery: ApprovalDelivery | 'none' =
    resolved === null ? 'none' : await deliverApprovalResolution(resolved.request, { error });

  await appendLogEntry(
    'approval_resolved',
    'event',
    expired ? 'warn' : 'info',
    expired
      ? 'Solicitud de aprobación vencida al cerrarse la ventana'
      : 'Ventana de confirmación cerrada sin respuesta',
    { approvalId: entry.approvalId, status, errorCode: error.code },
    { now, storage, origin: entry.origin, method: entry.method },
  );

  const refresh = await runShowOldestPending({ ...options, now, storage });
  await purgeBadge(refresh.pendingCount);
  return {
    handled: true,
    reason: expired ? 'cerrada-con-plazo-vencido' : 'cerrada-por-el-usuario',
    status,
    approvalId: entry.approvalId,
    delivery,
    refresh,
    pendingCount: refresh.pendingCount,
  };
};

/**
 * Atiende el cierre de la ventana única (`chrome.windows.onRemoved`).
 *
 * - Si el `windowId` cerrado NO es el persistido, el cierre lo hicimos nosotros (o es ajeno): no hay
 *   rechazo que aplicar (por eso se marca el estado ANTES de `windows.remove`).
 * - Si es el nuestro, el cierre con la X equivale a **rechazo (`4001`)** de la solicitud mostrada,
 *   salvo que el plazo ya haya vencido, en cuyo caso prevalece `expired` (§3.8).
 * - Después se muestra la siguiente `pending` (o se cierra del todo) y se purga el badge.
 */
export const handleApprovalWindowRemoved = (
  windowId: number,
  options: ShowOldestOptions = {},
): Promise<WindowRemovedOutcome> =>
  withFocusLock(() => runWindowRemoved(windowId, options));

/** Opciones del listener de ventanas. */
export interface WindowListenerOptions {
  windows?: WindowsApiLike | null;
  onRemoved?: (windowId: number) => Promise<unknown>;
}

/**
 * Registra el listener de `chrome.windows.onRemoved`. Se registra de forma SÍNCRONA al evaluar el
 * SW: el cierre de la ventana única (X) debe marcar el rechazo aunque el SW estuviera dormido.
 */
export const registerApprovalWindowListeners = (options: WindowListenerOptions = {}): boolean => {
  const windows = options.windows === undefined ? getWindowsApi() : options.windows;
  if (windows?.onRemoved === undefined || typeof windows.onRemoved.addListener !== 'function') {
    return false;
  }
  const onRemoved = options.onRemoved ?? ((windowId: number) => handleApprovalWindowRemoved(windowId));
  windows.onRemoved.addListener((windowId) => {
    void onRemoved(windowId).catch((error: unknown) => {
      console.warn('[truekeate] fallo al atender el cierre de la ventana única', windowId, error);
    });
  });
  return true;
};

/** Contador «N en espera» de la ventana: es el índice DERIVADO de la cola (§2.8). */
export { pendingCount };
