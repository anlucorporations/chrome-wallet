/**
 * M14 — `src/background/approvals/queue.ts`
 * Cola persistida de solicitudes de aprobación: `truekeate_pending_requests` como
 * **`Record<approvalId, PendingRequest>`** (H4, tareas 4.1, 4.6 y 4.8 de `plan_desarrollo.md` §3.4.5).
 *
 * FUENTE NORMATIVA
 * - `diccionario_datos.md` §2.8 (forma de la cola, reglas de escritura H-08, cardinalidad H-18 y
 *   ventana única P-21), §2.12 (`truekeate_inflight_tx`) y §2.13 (`truekeate_rate_windows`).
 * - `documento_tecnico.md` §2.3 (invariantes MV3: correlación persistida, escritura serializada,
 *   dueño único del plazo, cardinalidad y tasa) y §3.1 (flujo de aprobación).
 * - `documento_tecnico.md` §3.9 y `diccionario_datos.md` §3.9 (cota de 64 KiB, ADT-21 / D-L).
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **RMW serializado (`rmwLock`)**: toda mutación pasa por {@link withRmwLock}, una promesa
 *    encadenada; dos solicitudes simultáneas **coexisten** sin sobrescribirse (`CA-RF-37`). Nunca
 *    se escriben subclaves: se escribe la clave COMPLETA (`get` → mutar copia → `set`).
 * 2. **Único escritor**: solo el Service Worker escribe la cola; los demás contextos leen por
 *    mensaje o por el puerto (M17).
 * 3. **Cardinalidad** (`truekeate_settings`: 8 globales / 1 por origen / 6 por minuto). Al exceder
 *    se responde `4001` **inmediato, sin persistir, sin abrir ventana y sin contar para el badge**.
 * 4. **Cota de payload**: `params` > `MAX_PAYLOAD_BYTES` (64 KiB) → `-32602` **sin persistir**.
 * 5. **Serialización por cuenta**: la marca persistida `truekeate_inflight_tx` garantiza «máximo 1
 *    transacción en vuelo por `from`»: `phase: 'signing'` bloquea la cuenta y `'broadcast'` la
 *    libera (`diccionario_datos.md` §2.12).
 * 6. **Cero temporizadores**: el plazo lo posee M15 (`chrome.alarms`); aquí no hay `setTimeout` ni
 *    `setInterval` (prohibidos en un Service Worker MV3).
 */

import type {
  Address,
  ApprovalMethod,
  ApprovalStatus,
  ChainIdHex,
  Eip1193Error,
  InflightTx,
  InflightTxByAccount,
  LogCategory,
  LogEntry,
  LogEventName,
  LogLevel,
  PendingRequest,
  PendingRequestsMap,
  PersonalSignPreview,
  RateWindow,
  RateWindowsByOrigin,
  TxPreview,
  TypedDataPreview,
  Uuid,
} from '../../shared/types';
import {
  EXTENSION_ORIGIN,
  INFLIGHT_TTL_MS,
  MAX_PAYLOAD_BYTES,
  SIGN_TIMEOUT_MS,
  logLimit,
  pendingRequestsMax,
  pendingRequestsMaxPerOrigin,
  pendingRequestsPerMinute,
} from '../../shared/constants';
import {
  createEip1193Error,
  duplicateApprovalIdError,
  inflightTxInProgressError,
  internalError,
  storageQuotaExceededError,
  tooManyPendingRequestsError,
} from '../rpc/errors';
import { normalizeRateWindow, readRateWindowsFromSnapshot } from '../rpc/rateLimit';
import { measurePayloadBytes } from '../security/redaction';
import { normalizeOrigin } from '../security/senderGuard';
// `decisions.ts` solo CONSUME el tipo `ResolvedRequest` de este módulo (`import type`), de modo que
// la dirección real de la dependencia es cola → decisions y no hay ciclo en tiempo de ejecución.
import { settleApprovalDecision } from './decisions';
import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
  type StorageLocalLike,
  type StorageSnapshot,
} from '../state/schema';

// ---------------------------------------------------------------------------
// Cerrojo de escritura serializada (rmwLock, H-08)
// ---------------------------------------------------------------------------

/** Cerrojo FIFO: encadena las tareas de lectura-modificación-escritura. */
export interface SerialLock {
  /**
   * Ejecuta `task` cuando todas las tareas anteriores hayan terminado. La promesa devuelta
   * resuelve o rechaza con el resultado de `task`; un fallo NO rompe la cadena.
   */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tareas encadenadas pendientes de terminar (diagnóstico y pruebas). */
  depth(): number;
}

/** Crea un cerrojo FIFO independiente. */
export const createSerialLock = (): SerialLock => {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(() => task());
      tail = result.then(
        () => {
          pending -= 1;
        },
        () => {
          pending -= 1;
        },
      );
      return result;
    },
    depth: () => pending,
  };
};

/**
 * `rmwLock` (estado VOLÁTIL admisible, reconstruible): es el cerrojo que serializa TODA mutación
 * de `truekeate_pending_requests` y de sus claves hermanas (§2.13). No es fuente de verdad.
 */
export const rmwLock: SerialLock = createSerialLock();

/** Ejecuta `task` bajo el `rmwLock`. Todo RMW de la cola pasa por aquí. */
export const withRmwLock = <T>(task: () => Promise<T>): Promise<T> => rmwLock.run(task);

// ---------------------------------------------------------------------------
// Identificadores y utilidades
// ---------------------------------------------------------------------------

/** ¿Es un objeto plano utilizable como mapa persistido? */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Genera un `approvalId` (uuid v4) único en el espacio global de identificadores. */
export const newApprovalId = (): Uuid => {
  const cryptoApi: unknown = (globalThis as { crypto?: unknown }).crypto;
  if (typeof cryptoApi === 'object' && cryptoApi !== null) {
    const randomUUID = (cryptoApi as { randomUUID?: unknown }).randomUUID;
    if (typeof randomUUID === 'function') {
      return (randomUUID as () => string).call(cryptoApi);
    }
  }
  return `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Plazo aplicable a un método aprobable de la cola: firma/aprobación = 120 s (RF-40, H-07). */
export const timeoutMsForMethod = (_method: ApprovalMethod): number => SIGN_TIMEOUT_MS;

// ---------------------------------------------------------------------------
// Proyección de `truekeate_pending_requests`
// ---------------------------------------------------------------------------

/** Proyecta una entrada persistida; `null` si no es utilizable (no se inventan campos). */
export const asPendingRequest = (approvalId: string, value: unknown): PendingRequest | null => {
  if (!isRecord(value) || typeof value.method !== 'string') {
    return null;
  }
  const status = value.status;
  const request: PendingRequest = {
    approvalId: typeof value.approvalId === 'string' ? value.approvalId : approvalId,
    method: value.method as ApprovalMethod,
    params: Array.isArray(value.params) ? [...value.params] : [],
    origin: typeof value.origin === 'string' ? value.origin : '',
    tabId: typeof value.tabId === 'number' ? value.tabId : null,
    frameId: typeof value.frameId === 'number' ? value.frameId : null,
    account: (typeof value.account === 'string' ? value.account : '0x') as Address,
    chainId: (typeof value.chainId === 'string' ? value.chainId : '0x0') as ChainIdHex,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    // `expiresAt` se conserva TAL CUAL si no es numérico: una entrada sin plazo utilizable no se
    // declara vencida (nunca se pierde una solicitud por un campo ausente).
    expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : Number.NaN,
    status:
      status === 'approved' || status === 'rejected' || status === 'expired' ? status : 'pending',
  };
  if (value.txPreview !== undefined) {
    request.txPreview = value.txPreview as TxPreview;
  }
  if (value.typedDataPreview !== undefined) {
    request.typedDataPreview = value.typedDataPreview as TypedDataPreview;
  }
  if (value.signMessagePreview !== undefined) {
    request.signMessagePreview = value.signMessagePreview as PersonalSignPreview;
  }
  if (typeof value.resolvedAt === 'number') {
    request.resolvedAt = value.resolvedAt;
  }
  if (typeof value.errorCode === 'number') {
    request.errorCode = value.errorCode;
  }
  return request;
};

/** Proyecta el mapa COMPLETO desde una instantánea del almacén (función pura). */
export const readPendingRequestsFromSnapshot = (snapshot: StorageSnapshot): PendingRequestsMap => {
  const raw: unknown = snapshot[STORAGE_KEYS.pendingRequests];
  if (!isRecord(raw)) {
    return {};
  }
  const map: PendingRequestsMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const request = asPendingRequest(key, value);
    if (request !== null) {
      map[key] = request;
    }
  }
  return map;
};

/** Lee `truekeate_pending_requests` del almacén. */
export const readPendingRequests = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<PendingRequestsMap> =>
  readPendingRequestsFromSnapshot(await readStorage([STORAGE_KEYS.pendingRequests], storage));

/** ¿La entrada está `pending`? Es el ÚNICO estado que ocupa la cola (§2.8). */
export const isPending = (request: PendingRequest | null | undefined): boolean =>
  request !== null && request !== undefined && request.status === 'pending';

/**
 * ¿Venció la entrada? Solo un `expiresAt` NUMÉRICO en el pasado la declara vencida: una entrada
 * sin plazo utilizable nunca se considera vencida por esta vía.
 */
export const isExpired = (request: PendingRequest, now: number = Date.now()): boolean =>
  Number.isFinite(request.expiresAt) && request.expiresAt <= now;

/**
 * Índice DERIVADO de la cola: número de entradas `pending` (mismo valor que alimenta el badge y
 * el contador «N en espera» de la ventana única, §2.8). No es un campo persistido.
 */
export const pendingCount = (map: PendingRequestsMap): number =>
  Object.values(map).filter((request) => request.status === 'pending').length;

/** Entradas `pending` de un origen (clave canónica normalizada). */
export const pendingForOrigin = (map: PendingRequestsMap, origin: string): PendingRequest[] => {
  const key = normalizeOrigin(origin) ?? origin;
  return Object.values(map).filter(
    (request) => request.status === 'pending' && (normalizeOrigin(request.origin) ?? request.origin) === key,
  );
};

/**
 * Selección FIFO de la ventana única: la `pending` con `createdAt` más antiguo (empate por
 * `approvalId` ascendente, para que el orden sea determinista). `null` si no queda ninguna.
 */
export const oldestPending = (map: PendingRequestsMap): PendingRequest | null => {
  const pendings = Object.values(map).filter((request) => request.status === 'pending');
  if (pendings.length === 0) {
    return null;
  }
  return pendings.sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.approvalId.localeCompare(right.approvalId),
  )[0] ?? null;
};

/** Lee una entrada concreta; `null` si no existe o si ya no está `pending`. */
export const readPendingRequest = async (
  approvalId: Uuid,
  options: { storage?: StorageLocalLike | null; now?: number } = {},
): Promise<PendingRequest | null> => {
  const map = await readPendingRequests(options.storage);
  const request = map[approvalId];
  if (request === undefined || request.status !== 'pending') {
    return null;
  }
  if (isExpired(request, options.now ?? Date.now())) {
    return null;
  }
  return request;
};

// ---------------------------------------------------------------------------
// Purga
// ---------------------------------------------------------------------------

/** Resultado de una purga: el mapa limpio y lo que se ha retirado, con el motivo. */
export interface QueuePurgePlan {
  /** Mapa resultante (solo entradas `pending`). */
  map: PendingRequestsMap;
  /** Entradas `pending` con el plazo vencido: son las HUÉRFANAS que reciben `4001`. */
  expired: PendingRequest[];
  /** Entradas ya resueltas (`status !== 'pending'`): se retiran sin más trámite. */
  resolved: PendingRequest[];
  /** `true` cuando el mapa difiere del leído (hay que reescribirlo). */
  changed: boolean;
}

/**
 * Plan de purga de `diccionario_datos.md` §2.8 regla 3: se eliminan las entradas con
 * `status !== 'pending'` y las `pending` con `expiresAt <= now` (estas últimas se devuelven en
 * `expired` para entregarles `4001`). Es una función PURA: no toca el almacén.
 */
export const planQueuePurge = (map: PendingRequestsMap, now: number): QueuePurgePlan => {
  const next: PendingRequestsMap = {};
  const expired: PendingRequest[] = [];
  const resolved: PendingRequest[] = [];
  for (const [approvalId, request] of Object.entries(map)) {
    if (request.status !== 'pending') {
      resolved.push(request);
      continue;
    }
    if (isExpired(request, now)) {
      expired.push(request);
      continue;
    }
    next[approvalId] = request;
  }
  expired.sort((left, right) => left.createdAt - right.createdAt);
  resolved.sort((left, right) => left.createdAt - right.createdAt);
  return { map: next, expired, resolved, changed: expired.length > 0 || resolved.length > 0 };
};

/**
 * Aplica el plan de purga al almacén bajo el `rmwLock`. Devuelve el mapa resultante y las
 * huérfanas detectadas (el llamador —M16 o M15— es quien entrega su `4001`).
 */
export const purgePendingRequests = async (
  options: { now?: number; storage?: StorageLocalLike | null } = {},
): Promise<QueuePurgePlan> =>
  withRmwLock(async () => {
    const now = options.now ?? Date.now();
    const map = await readPendingRequests(options.storage);
    const plan = planQueuePurge(map, now);
    if (!plan.changed) {
      return plan;
    }
    const written = await writeStorage(
      { [STORAGE_KEYS.pendingRequests]: plan.map },
      options.storage,
    );
    if (!written) {
      // Un fallo de escritura NO invalida el plan: la purga se reintenta en el siguiente arranque.
      console.warn('[truekeate] no se pudo persistir la purga de la cola de aprobaciones');
    }
    return plan;
  });

// ---------------------------------------------------------------------------
// Alta en la cola (tarea 4.1, 4.6 y 4.8)
// ---------------------------------------------------------------------------

/** Solicitud tal y como la propone el llamador (M19/M3): sin estado ni marcas de tiempo. */
export interface PendingRequestDraft {
  method: ApprovalMethod;
  /** Parámetros ORIGINALES de la llamada: es el payload de firma (§2.8). */
  params: unknown[];
  /** Origen normalizado de la dApp, o `extension` si nace en el popup. */
  origin: string;
  /** `null` si la solicitud nace en un contexto de la extensión. */
  tabId?: number | null;
  frameId?: number | null;
  account: Address;
  chainId: ChainIdHex;
  txPreview?: TxPreview;
  typedDataPreview?: TypedDataPreview;
  signMessagePreview?: PersonalSignPreview;
  /** Plazo en ms; por defecto `SIGN_TIMEOUT_MS` (120 s), anclado a `createdAt`. */
  timeoutMs?: number;
}

/** Opciones del alta (todas inyectables para las pruebas). */
export interface EnqueueOptions {
  /** Reloj inyectable: `createdAt` y `expiresAt` se anclan a este instante. */
  now?: number;
  storage?: StorageLocalLike | null;
  /** Identificador explícito (pruebas); por defecto, uuid v4 nuevo. */
  approvalId?: Uuid;
  /** Cotas: por defecto las de `truekeate_settings` (8 / 1 / 6). */
  maxPending?: number;
  maxPendingPerOrigin?: number;
  perMinute?: number;
  /** Tope de payload en bytes; por defecto `MAX_PAYLOAD_BYTES` (64 KiB). */
  maxPayloadBytes?: number;
}

/** Alta aceptada: la entrada persistida y el estado derivado de la cola. */
export interface EnqueueAccepted {
  ok: true;
  request: PendingRequest;
  /** Índice derivado tras el alta (badge y contador «N en espera»). */
  pendingCount: number;
  /** Huérfanas retiradas en la misma pasada (el llamador les entrega `4001`). */
  purgedExpired: PendingRequest[];
  /** `true` cuando esta entrada es la que debe mostrar la ventana única (FIFO). */
  shouldShow: boolean;
}

/** Alta rechazada: SIEMPRE con `code` numérico y SIN haber persistido nada. */
export interface EnqueueRejected {
  ok: false;
  error: Eip1193Error;
}

/** Resultado del alta. */
export type EnqueueResult = EnqueueAccepted | EnqueueRejected;

/**
 * Da de alta una solicitud en `truekeate_pending_requests` con el orden EXACTO de §2.8:
 *
 *   0. cota de payload (`params` > `MAX_PAYLOAD_BYTES` → `-32602`, sin persistir y sin ventana);
 *   1. duplicado de identificador → `-32603`;
 *   2. cardinalidad global (8) → `4001`;
 *   3. cardinalidad por origen (1) → `4001`;
 *   4. ventana de 6 solicitudes / 60 s por origen → `4001`;
 *   5. escritura de la cola y de la ventana de tasa en el MISMO `set` (RMW serializado).
 *
 * `expiresAt = createdAt + SIGN_TIMEOUT_MS`, **anclado a `createdAt`** (H-07): el plazo NO se
 * cuenta desde el instante de abrir la ventana.
 */
export const enqueueApprovalRequest = async (
  draft: PendingRequestDraft,
  options: EnqueueOptions = {},
): Promise<EnqueueResult> => {
  const now = options.now ?? Date.now();
  const maxPayloadBytes = options.maxPayloadBytes ?? MAX_PAYLOAD_BYTES;

  // 0. Cota de payload (ADT-21 / D-L): ANTES de crear la entrada y sin abrir ventana.
  const payloadBytes = measurePayloadBytes(draft.params);
  if (payloadBytes > maxPayloadBytes) {
    return {
      ok: false,
      error: createEip1193Error('payloadTooLarge', {}, { payloadBytes, maxPayloadBytes }),
    };
  }

  // Origen canónico: los contextos de la extensión (popup) usan la clave `extension`.
  const resolvedOrigin =
    normalizeOrigin(draft.origin) ??
    (draft.tabId === null || draft.tabId === undefined ? EXTENSION_ORIGIN : null);
  if (resolvedOrigin === null) {
    return { ok: false, error: internalError({ reason: 'invalid-approval-origin' }) };
  }

  const approvalId = options.approvalId ?? newApprovalId();
  const timeoutMs = draft.timeoutMs ?? timeoutMsForMethod(draft.method);
  const maxPending = options.maxPending ?? pendingRequestsMax;
  const maxPendingPerOrigin = options.maxPendingPerOrigin ?? pendingRequestsMaxPerOrigin;
  const perMinute = options.perMinute ?? pendingRequestsPerMinute;

  return withRmwLock(async () => {
    // Lectura ÚNICA de las dos claves que se van a escribir (cola y ventana de tasa).
    const snapshot = await readStorage(
      [STORAGE_KEYS.pendingRequests, STORAGE_KEYS.rateWindows],
      options.storage,
    );
    const stored = readPendingRequestsFromSnapshot(snapshot);

    // 1. Identificador duplicado (§2.8): `-32603`, sin tocar el almacén.
    if (stored[approvalId] !== undefined) {
      return { ok: false, error: duplicateApprovalIdError() };
    }

    // Purga perezosa de lo ya resuelto y de lo vencido (esto último es huérfano → `4001`).
    const plan = planQueuePurge(stored, now);
    const map = plan.map;

    // 2. Cardinalidad global y 3. por origen: `4001` inmediato, sin persistir.
    if (pendingCount(map) >= maxPending) {
      return {
        ok: false,
        error: tooManyPendingRequestsError({
          reason: 'global-limit',
          pendingCount: pendingCount(map),
          maxPending,
        }),
      };
    }
    if (pendingForOrigin(map, resolvedOrigin).length >= maxPendingPerOrigin) {
      return {
        ok: false,
        error: tooManyPendingRequestsError({
          reason: 'origin-limit',
          origin: resolvedOrigin,
          maxPendingPerOrigin,
        }),
      };
    }

    // 4. Ventana de tasa por origen (6 por 60 s), persistida en `truekeate_rate_windows`.
    const rateWindows: RateWindowsByOrigin = readRateWindowsFromSnapshot(snapshot);
    const window = normalizeRateWindow(rateWindows[resolvedOrigin], now);
    if (window.approvalsInWindow >= perMinute) {
      return {
        ok: false,
        error: tooManyPendingRequestsError({
          reason: 'rate-limit',
          origin: resolvedOrigin,
          perMinute,
        }),
      };
    }
    const nextWindow: RateWindow = {
      ...window,
      approvalsInWindow: window.approvalsInWindow + 1,
      updatedAt: now,
    };

    // 5. Alta: `expiresAt` anclado a `createdAt`.
    const request: PendingRequest = {
      approvalId,
      method: draft.method,
      params: [...draft.params],
      origin: resolvedOrigin,
      tabId: draft.tabId ?? null,
      frameId: draft.frameId ?? null,
      account: draft.account,
      chainId: draft.chainId,
      createdAt: now,
      expiresAt: now + timeoutMs,
      status: 'pending',
    };
    if (draft.txPreview !== undefined) {
      request.txPreview = draft.txPreview;
    }
    if (draft.typedDataPreview !== undefined) {
      request.typedDataPreview = draft.typedDataPreview;
    }
    if (draft.signMessagePreview !== undefined) {
      request.signMessagePreview = draft.signMessagePreview;
    }

    const nextMap: PendingRequestsMap = { ...map, [approvalId]: request };
    const written = await writeStorage(
      {
        [STORAGE_KEYS.pendingRequests]: nextMap,
        // §2.13: las solicitudes aprobables persisten su ventana de tasa en el MISMO `set`.
        [STORAGE_KEYS.rateWindows]: { ...rateWindows, [resolvedOrigin]: nextWindow },
      },
      options.storage,
    );
    if (!written) {
      // Clave crítica: la operación se ABORTA y el estado no queda a medias (§2.15).
      return { ok: false, error: storageQuotaExceededError() };
    }

    const oldest = oldestPending(nextMap);
    // Badge derivado: se recalcula tras CADA escritura de la cola (§2.8, RF-38).
    await purgeBadge(pendingCount(nextMap));
    return {
      ok: true,
      request,
      pendingCount: pendingCount(nextMap),
      purgedExpired: plan.expired,
      shouldShow: oldest !== null && oldest.approvalId === approvalId,
    };
  });
};

// ---------------------------------------------------------------------------
// Resolución de una entrada (aprobar / rechazar / vencer)
// ---------------------------------------------------------------------------

/** Estado final de una entrada de la cola. */
export type ResolvedStatus = Exclude<ApprovalStatus, 'pending'>;

/** Entrada resuelta y PURGADA de la cola persistida (`CA-RF-41`). */
export interface ResolvedRequest {
  request: PendingRequest;
  /** Estado efectivo aplicado (puede diferir del pedido si el plazo ya venció). */
  status: ResolvedStatus;
  resolvedAt: number;
  /** `4001` en rechazo y vencimiento; ausente en la aprobación. */
  errorCode?: number;
}

/** Opciones de la resolución. */
export interface ResolveOptions {
  now?: number;
  storage?: StorageLocalLike | null;
}

/**
 * Marca la entrada con su `resolvedAt`/`errorCode` y la PURGA de la cola en la misma operación
 * (`CA-RF-41`: «la entrada desaparece de la cola persistida»).
 *
 * Reglas duras:
 * - Una entrada que ya no está `pending` devuelve `null`: **respuesta duplicada ignorada** (X-06),
 *   el SW nunca firma ni difunde dos veces.
 * - Si el plazo ya venció, **prevalece `expired`** aunque la decisión fuera aprobar o rechazar
 *   (`documento_tecnico.md` §2.3, «Cierre por ventana o pestaña»).
 */
export const resolveApprovalRequest = async (
  approvalId: Uuid,
  status: ResolvedStatus,
  options: ResolveOptions = {},
): Promise<ResolvedRequest | null> =>
  withRmwLock(async () => {
    const now = options.now ?? Date.now();
    const map = await readPendingRequests(options.storage);
    const entry = map[approvalId];
    if (entry === undefined || entry.status !== 'pending') {
      return null;
    }
    const effective: ResolvedStatus =
      status !== 'expired' && isExpired(entry, now) ? 'expired' : status;
    const resolved: ResolvedRequest = {
      request: { ...entry, status: effective, resolvedAt: now },
      status: effective,
      resolvedAt: now,
      ...(effective === 'approved' ? {} : { errorCode: 4001 }),
    };
    const next = { ...map };
    delete next[approvalId];
    const written = await writeStorage({ [STORAGE_KEYS.pendingRequests]: next }, options.storage);
    if (!written) {
      console.warn('[truekeate] no se pudo persistir la resolución de la solicitud', approvalId);
    }
    // Badge derivado: al resolver, el contador baja (§2.8).
    await purgeBadge(pendingCount(next));
    // Desenlace a quien esperaba la decisión (la petición en vuelo del router): es el ÚNICO punto
    // de notificación, así que las tres vías de cierre (SIGN_RESPONSE, X de la ventana y
    // `chrome.alarms`) despiertan a la misma promesa sin lógica duplicada (M14.b).
    settleApprovalDecision(resolved);
    return resolved;
  });

/** Retira una entrada sin resolverla (purga de la reconciliación). Devuelve la entrada retirada. */
export const dropPendingRequest = async (
  approvalId: Uuid,
  options: ResolveOptions = {},
): Promise<PendingRequest | null> =>
  withRmwLock(async () => {
    const map = await readPendingRequests(options.storage);
    const entry = map[approvalId];
    if (entry === undefined) {
      return null;
    }
    const next = { ...map };
    delete next[approvalId];
    await writeStorage({ [STORAGE_KEYS.pendingRequests]: next }, options.storage);
    return entry;
  });

// ---------------------------------------------------------------------------
// Marca persistida de «transacción en vuelo» por cuenta (§2.12 / tarea 4.6)
// ---------------------------------------------------------------------------

/** Proyecta una entrada de `truekeate_inflight_tx`; `null` si no es utilizable. */
export const asInflightTx = (account: string, value: unknown): InflightTx | null => {
  if (!isRecord(value)) {
    return null;
  }
  const phase = value.phase === 'signing' ? 'signing' : 'broadcast';
  return {
    account: (typeof value.account === 'string' ? value.account : account) as Address,
    approvalId: typeof value.approvalId === 'string' ? value.approvalId : '',
    phase,
    ...(typeof value.nonce === 'number' ? { nonce: value.nonce } : {}),
    txHash: typeof value.txHash === 'string' ? (value.txHash as InflightTx['txHash']) : null,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : 0,
    expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : Number.NaN,
  };
};

/** Proyecta el mapa completo `truekeate_inflight_tx` (función pura). */
export const readInflightTxFromSnapshot = (snapshot: StorageSnapshot): InflightTxByAccount => {
  const raw: unknown = snapshot[STORAGE_KEYS.inflightTx];
  if (!isRecord(raw)) {
    return {};
  }
  const map: InflightTxByAccount = {};
  for (const [account, value] of Object.entries(raw)) {
    const entry = asInflightTx(account, value);
    if (entry !== null) {
      setInflight(map, account, entry);
    }
  }
  return map;
};

/**
 * Lectura/escritura de una marca por cuenta sin `any`: el índice del mapa es un `Address`, pero las
 * claves que se manejan en el arranque (alarmas, `Object.entries`) son `string`.
 */
export const inflightFor = (
  map: InflightTxByAccount,
  account: string,
): InflightTx | undefined => (map as Record<string, InflightTx | undefined>)[account];

/** Asigna una marca por cuenta (mismo criterio que {@link inflightFor}). */
export const setInflight = (
  map: InflightTxByAccount,
  account: string,
  entry: InflightTx,
): void => {
  (map as Record<string, InflightTx>)[account] = entry;
};

/** Elimina una marca por cuenta (mismo criterio que {@link inflightFor}). */
export const deleteInflight = (map: InflightTxByAccount, account: string): void => {
  delete (map as Record<string, InflightTx | undefined>)[account];
};

/** Lee `truekeate_inflight_tx` del almacén. */
export const readInflightTx = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<InflightTxByAccount> =>
  readInflightTxFromSnapshot(await readStorage([STORAGE_KEYS.inflightTx], storage));

/** ¿Sigue vigente la marca? (`expiresAt > now`; sin `expiresAt` numérico, NO es vigente). */
export const isInflightVigente = (entry: InflightTx | null | undefined, now: number): boolean =>
  entry !== null && entry !== undefined && Number.isFinite(entry.expiresAt) && entry.expiresAt > now;

/** Estado de exclusión mutua de una cuenta: `free`, bloqueada por `signing` o en `broadcast`. */
export type AccountLockState = 'free' | 'signing' | 'broadcast';

/** Estado de la cuenta según la marca persistida (`diccionario_datos.md` §2.12 regla 2). */
export const accountLockState = (
  map: InflightTxByAccount,
  account: Address,
  now: number = Date.now(),
): AccountLockState => {
  const entry = inflightFor(map, account);
  if (!isInflightVigente(entry, now)) {
    return 'free';
  }
  return entry?.phase === 'signing' ? 'signing' : 'broadcast';
};

/** Opciones de `beginInflightTx`. */
export interface BeginInflightOptions {
  account: Address;
  approvalId: Uuid;
  nonce?: number;
  now?: number;
  storage?: StorageLocalLike | null;
  ttlMs?: number;
}

/** Resultado de intentar tomar la exclusión mutua de una cuenta. */
export type BeginInflightResult =
  | { ok: true; entry: InflightTx }
  | { ok: false; error: Eip1193Error; holder: InflightTx | null };

/**
 * Escribe `phase: 'signing'` **antes** de firmar (§2.12 regla 1: nunca después de difundir).
 *
 * Si la cuenta ya tiene una marca `signing` VIGENTE, NO se firma ni se difunde: se devuelve el
 * conflicto con el literal de `inflightTxInProgress` de §4.3 (v1.10) y el detalle en `data`, y la
 * solicitud permanece `pending` (§2.12 regla 5). NO es un exceso de cardinalidad: por eso ya no se
 * responde `tooManyPendingRequests`.
 */
export const beginInflightTx = async (
  options: BeginInflightOptions,
): Promise<BeginInflightResult> =>
  withRmwLock(async () => {
    const now = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? INFLIGHT_TTL_MS;
    const map = await readInflightTx(options.storage);
    const state = accountLockState(map, options.account, now);
    if (state === 'signing') {
      const holder = inflightFor(map, options.account) ?? null;
      return {
        ok: false,
        error: inflightTxInProgressError({
          reason: 'inflight-signing',
          account: options.account,
          approvalId: holder?.approvalId ?? null,
        }),
        holder,
      };
    }
    const entry: InflightTx = {
      account: options.account,
      approvalId: options.approvalId,
      phase: 'signing',
      ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
      txHash: null,
      startedAt: now,
      expiresAt: now + ttlMs,
    };
    const written = await writeStorage(
      { [STORAGE_KEYS.inflightTx]: { ...map, [options.account]: entry } },
      options.storage,
    );
    if (!written) {
      return { ok: false, error: storageQuotaExceededError(), holder: null };
    }
    return { ok: true, entry };
  });

/** Opciones de `markInflightBroadcast`. */
export interface BroadcastInflightOptions {
  account: Address;
  txHash: InflightTx['txHash'];
  nonce?: number;
  now?: number;
  storage?: StorageLocalLike | null;
}

/**
 * Reescribe la MISMA entrada con `phase: 'broadcast'` y el hash devuelto por el nodo: la marca
 * deja de bloquear la cuenta porque el nonce ya está consumido (§2.12 regla 2).
 */
export const markInflightBroadcast = async (
  options: BroadcastInflightOptions,
): Promise<InflightTx | null> =>
  withRmwLock(async () => {
    const now = options.now ?? Date.now();
    const map = await readInflightTx(options.storage);
    const previous = inflightFor(map, options.account);
    if (previous === undefined) {
      return null;
    }
    const entry: InflightTx = {
      ...previous,
      phase: 'broadcast',
      txHash: options.txHash,
      ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
    };
    await writeStorage(
      { [STORAGE_KEYS.inflightTx]: { ...map, [options.account]: entry } },
      options.storage,
    );
    void now;
    return entry;
  });

/** Libera la marca de una cuenta (al confirmar, fallar o vencer). Devuelve si existía. */
export const releaseInflightTx = async (
  account: Address,
  options: { now?: number; storage?: StorageLocalLike | null } = {},
): Promise<boolean> =>
  withRmwLock(async () => {
    const map = await readInflightTx(options.storage);
    if (inflightFor(map, account) === undefined) {
      return false;
    }
    const next = { ...map };
    deleteInflight(next, account);
    await writeStorage({ [STORAGE_KEYS.inflightTx]: next }, options.storage);
    return true;
  });

// ---------------------------------------------------------------------------
// Badge derivado (índice de la cola, §2.8)
// ---------------------------------------------------------------------------

/**
 * Purga/actualiza el badge del icono con el índice DERIVADO de la cola (`pending` total). El badge
 * no se persiste: se recalcula tras cada escritura o purga y, si el total es 0, se limpia con
 * `setBadgeText({ text: '' })` (§2.8, H-07/H-18). Nunca rompe el flujo si la API no está.
 */
export const purgeBadge = async (pending: number): Promise<void> => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  const action: unknown =
    typeof chromeNs === 'object' && chromeNs !== null
      ? (chromeNs as { action?: unknown }).action
      : undefined;
  const setBadgeText: unknown =
    typeof action === 'object' && action !== null
      ? (action as { setBadgeText?: unknown }).setBadgeText
      : undefined;
  if (typeof setBadgeText !== 'function') {
    return;
  }
  try {
    await (setBadgeText as (details: { text: string }) => unknown).call(action, {
      text: pending > 0 ? String(pending) : '',
    });
  } catch (error) {
    console.warn('[truekeate] no se pudo actualizar el badge', error);
  }
};

// ---------------------------------------------------------------------------
// Log mínimo del Service Worker (M30 llega en H5)
// ---------------------------------------------------------------------------

/** Genera un identificador de entrada de log. */
const newLogId = (): string => {
  const cryptoApi: unknown = (globalThis as { crypto?: unknown }).crypto;
  if (typeof cryptoApi === 'object' && cryptoApi !== null) {
    const randomUUID = (cryptoApi as { randomUUID?: unknown }).randomUUID;
    if (typeof randomUUID === 'function') {
      return (randomUUID as () => string).call(cryptoApi);
    }
  }
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Opciones de {@link appendLogEntry}. */
export interface AppendLogOptions {
  now?: number;
  storage?: StorageLocalLike | null;
  origin?: string;
  method?: string;
  txHash?: string;
}

/** Entrada de log SIN `id` ni `ts`: lo que aporta el llamador para cada evento. */
export interface LogEntryInput {
  event: LogEventName;
  category: LogCategory;
  level: LogLevel;
  message: string;
  data: unknown;
  origin?: string;
  method?: string;
  txHash?: string;
}

/**
 * Escribe VARIAS entradas en `truekeate_logs` con **una sola** lectura y **una sola** escritura
 * (retención FIFO por `ts`). Es lo que permite que la reconciliación deje su traza y las de las
 * huérfanas sin pagar N ciclos de almacén: la cota de < 1 s de RNF-08 lo exige.
 *
 * En H4 solo se instrumentan los eventos imprescindibles (`sw_reconcile`, `approval_expired`,
 * `approval_resolved`, `rpc_error` de trazas): el catálogo completo de 24 eventos y su redacción
 * son de M30/M31 en H5. La entrada la escribe SIEMPRE el Service Worker y con `data` ya redactado
 * por el llamador (nunca payloads íntegros: RNF-09).
 */
export const appendLogEntries = async (
  items: readonly LogEntryInput[],
  options: { now?: number; storage?: StorageLocalLike | null } = {},
): Promise<LogEntry[]> => {
  if (items.length === 0) {
    return [];
  }
  const ts = options.now ?? Date.now();
  const created: LogEntry[] = items.map((item) => ({
    id: newLogId(),
    ts,
    level: item.level,
    category: item.category,
    event: item.event,
    message: item.message,
    origin: item.origin ?? EXTENSION_ORIGIN,
    method: item.method ?? '',
    data: item.data,
    ...(item.txHash === undefined ? {} : { txHash: item.txHash as LogEntry['txHash'] }),
  }));
  try {
    const stored = await readStorage([STORAGE_KEYS.logs], options.storage);
    const current = stored[STORAGE_KEYS.logs];
    const entries: LogEntry[] = Array.isArray(current) ? (current as LogEntry[]) : [];
    entries.push(...created);
    const retained = entries.length > logLimit ? entries.slice(entries.length - logLimit) : entries;
    const written = await writeStorage({ [STORAGE_KEYS.logs]: retained }, options.storage);
    return written ? created : [];
  } catch (error) {
    console.warn('[truekeate] no se pudieron escribir las entradas de log', error);
    return [];
  }
};

/**
 * Escribe **1** entrada en `truekeate_logs`. Delega en {@link appendLogEntries} para que la
 * retención FIFO y la política de escritura tengan UNA sola implementación.
 */
export const appendLogEntry = async (
  event: LogEventName,
  category: LogCategory,
  level: LogLevel,
  message: string,
  data: unknown,
  options: AppendLogOptions = {},
): Promise<LogEntry | null> => {
  const created = await appendLogEntries(
    [
      {
        event,
        category,
        level,
        message,
        data,
        ...(options.origin === undefined ? {} : { origin: options.origin }),
        ...(options.method === undefined ? {} : { method: options.method }),
        ...(options.txHash === undefined ? {} : { txHash: options.txHash }),
      },
    ],
    options,
  );
  return created[0] ?? null;
};
