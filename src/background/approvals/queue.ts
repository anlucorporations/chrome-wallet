/**
 * M14 â€” `src/background/approvals/queue.ts`
 * Cola persistida de solicitudes de aprobaciÃ³n: `truekeate_pending_requests` como
 * **`Record<approvalId, PendingRequest>`** (H4, tareas 4.1, 4.6 y 4.8 de `plan_desarrollo.md` Â§3.4.5).
 *
 * FUENTE NORMATIVA
 * - `diccionario_datos.md` Â§2.8 (forma de la cola, reglas de escritura H-08, cardinalidad H-18 y
 *   ventana Ãºnica P-21), Â§2.12 (`truekeate_inflight_tx`) y Â§2.13 (`truekeate_rate_windows`).
 * - `documento_tecnico.md` Â§2.3 (invariantes MV3: correlaciÃ³n persistida, escritura serializada,
 *   dueÃ±o Ãºnico del plazo, cardinalidad y tasa) y Â§3.1 (flujo de aprobaciÃ³n).
 * - `documento_tecnico.md` Â§3.9 y `diccionario_datos.md` Â§3.9 (cota de 64 KiB, ADT-21 / D-L).
 *
 * REGLAS QUE ESTE MÃ“DULO HACE CUMPLIR
 * 1. **RMW serializado (`rmwLock`)**: toda mutaciÃ³n pasa por {@link withRmwLock}, una promesa
 *    encadenada; dos solicitudes simultÃ¡neas **coexisten** sin sobrescribirse (`CA-RF-37`). Nunca
 *    se escriben subclaves: se escribe la clave COMPLETA (`get` â†’ mutar copia â†’ `set`).
 * 2. **Ãšnico escritor**: solo el Service Worker escribe la cola; los demÃ¡s contextos leen por
 *    mensaje o por el puerto (M17).
 * 3. **Cardinalidad** (`truekeate_settings`: 8 globales / 1 por origen / 6 por minuto). Al exceder
 *    se responde `4001` **inmediato, sin persistir, sin abrir ventana y sin contar para el badge**.
 * 4. **Cota de payload**: `params` > `MAX_PAYLOAD_BYTES` (64 KiB) â†’ `-32602` **sin persistir**.
 * 5. **SerializaciÃ³n por cuenta**: la marca persistida `truekeate_inflight_tx` garantiza Â«mÃ¡ximo 1
 *    transacciÃ³n en vuelo por `from`Â»: `phase: 'signing'` bloquea la cuenta y `'broadcast'` la
 *    libera (`diccionario_datos.md` Â§2.12).
 * 6. **Cero temporizadores**: el plazo lo posee M15 (`chrome.alarms`); aquÃ­ no hay `setTimeout` ni
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
import { createSerialLock, type SerialLock } from '../state/serialLock';
import { measurePayloadBytes } from '../security/redaction';
import { normalizeOrigin } from '../security/senderGuard';
// `decisions.ts` solo CONSUME el tipo `ResolvedRequest` de este mÃ³dulo (`import type`), de modo que
// la direcciÃ³n real de la dependencia es cola â†’ decisions y no hay ciclo en tiempo de ejecuciÃ³n.
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

/**
 * El cerrojo FIFO vive desde la fase 4 en `state/serialLock.ts` (M33.b), para que M26
 * (`sessions.ts`) y M26.b (`connections.ts`) usen la MISMA implementación y no una copia. Se
 * REEXPORTA aquí sin cambiar ningún nombre: `createSerialLock`, `SerialLock` y `withRmwLock`
 * siguen siendo el contrato que ya importaban `focus.ts` y las pruebas.
 */
export { createSerialLock, type SerialLock } from '../state/serialLock';

/**
 * `rmwLock` (estado VOLÃTIL admisible, reconstruible): es el cerrojo que serializa TODA mutaciÃ³n
 * de `truekeate_pending_requests` y de sus claves hermanas (Â§2.13). No es fuente de verdad.
 */
export const rmwLock: SerialLock = createSerialLock();

/** Ejecuta `task` bajo el `rmwLock`. Todo RMW de la cola pasa por aquÃ­. */
export const withRmwLock = <T>(task: () => Promise<T>): Promise<T> => rmwLock.run(task);

// ---------------------------------------------------------------------------
// Identificadores y utilidades
// ---------------------------------------------------------------------------

/** Â¿Es un objeto plano utilizable como mapa persistido? */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Genera un `approvalId` (uuid v4) Ãºnico en el espacio global de identificadores. */
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

/** Plazo aplicable a un mÃ©todo aprobable de la cola: firma/aprobaciÃ³n = 120 s (RF-40, H-07). */
export const timeoutMsForMethod = (_method: ApprovalMethod): number => SIGN_TIMEOUT_MS;

// ---------------------------------------------------------------------------
// ProyecciÃ³n de `truekeate_pending_requests`
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
    // `expiresAt` se conserva TAL CUAL si no es numÃ©rico: una entrada sin plazo utilizable no se
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
  // CorrelaciÃ³n del salto 1 (D-H4-E10): se conserva tal cual llegÃ³, sin inventarla.
  if (typeof value.requestId === 'string' && value.requestId.length > 0) {
    request.requestId = value.requestId;
  }
  return request;
};

/** Proyecta el mapa COMPLETO desde una instantÃ¡nea del almacÃ©n (funciÃ³n pura). */
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

/** Lee `truekeate_pending_requests` del almacÃ©n. */
export const readPendingRequests = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<PendingRequestsMap> =>
  readPendingRequestsFromSnapshot(await readStorage([STORAGE_KEYS.pendingRequests], storage));

/** Â¿La entrada estÃ¡ `pending`? Es el ÃšNICO estado que ocupa la cola (Â§2.8). */
export const isPending = (request: PendingRequest | null | undefined): boolean =>
  request !== null && request !== undefined && request.status === 'pending';

/**
 * Â¿VenciÃ³ la entrada? Solo un `expiresAt` NUMÃ‰RICO en el pasado la declara vencida: una entrada
 * sin plazo utilizable nunca se considera vencida por esta vÃ­a.
 */
export const isExpired = (request: PendingRequest, now: number = Date.now()): boolean =>
  Number.isFinite(request.expiresAt) && request.expiresAt <= now;

/**
 * Ãndice DERIVADO de la cola: nÃºmero de entradas `pending` (mismo valor que alimenta el badge y
 * el contador Â«N en esperaÂ» de la ventana Ãºnica, Â§2.8). No es un campo persistido.
 */
export const pendingCount = (map: PendingRequestsMap): number =>
  Object.values(map).filter((request) => request.status === 'pending').length;

/** Entradas `pending` de un origen (clave canÃ³nica normalizada). */
export const pendingForOrigin = (map: PendingRequestsMap, origin: string): PendingRequest[] => {
  const key = normalizeOrigin(origin) ?? origin;
  return Object.values(map).filter(
    (request) => request.status === 'pending' && (normalizeOrigin(request.origin) ?? request.origin) === key,
  );
};

/**
 * SelecciÃ³n FIFO de la ventana Ãºnica: la `pending` con `createdAt` mÃ¡s antiguo (empate por
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

/** Lee una entrada concreta; `null` si no existe o si ya no estÃ¡ `pending`. */
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
  /** Entradas `pending` con el plazo vencido: son las HUÃ‰RFANAS que reciben `4001`. */
  expired: PendingRequest[];
  /** Entradas ya resueltas (`status !== 'pending'`): se retiran sin mÃ¡s trÃ¡mite. */
  resolved: PendingRequest[];
  /** `true` cuando el mapa difiere del leÃ­do (hay que reescribirlo). */
  changed: boolean;
}

/**
 * Plan de purga de `diccionario_datos.md` Â§2.8 regla 3: se eliminan las entradas con
 * `status !== 'pending'` y las `pending` con `expiresAt <= now` (estas Ãºltimas se devuelven en
 * `expired` para entregarles `4001`). Es una funciÃ³n PURA: no toca el almacÃ©n.
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
 * Aplica el plan de purga al almacÃ©n bajo el `rmwLock`. Devuelve el mapa resultante y las
 * huÃ©rfanas detectadas (el llamador â€”M16 o M15â€” es quien entrega su `4001`).
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
  /** ParÃ¡metros ORIGINALES de la llamada: es el payload de firma (Â§2.8). */
  params: unknown[];
  /** Origen normalizado de la dApp, o `extension` si nace en el popup. */
  origin: string;
  /** `null` si la solicitud nace en un contexto de la extensiÃ³n. */
  tabId?: number | null;
  frameId?: number | null;
  account: Address;
  chainId: ChainIdHex;
  /**
   * `id` de correlaciÃ³n del salto 1 (`TRUEKEATE_REQUEST.id` de la pÃ¡gina), cuando la solicitud
   * llegÃ³ por el relay. Se persiste con la entrada para que la resoluciÃ³n empujada (H-07,
   * D-H4-E10) llegue a la promesa correcta de la dApp incluso despuÃ©s de una suspensiÃ³n del SW.
   */
  requestId?: string;
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
  /** Identificador explÃ­cito (pruebas); por defecto, uuid v4 nuevo. */
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
  /** Ãndice derivado tras el alta (badge y contador Â«N en esperaÂ»). */
  pendingCount: number;
  /** HuÃ©rfanas retiradas en la misma pasada (el llamador les entrega `4001`). */
  purgedExpired: PendingRequest[];
  /** `true` cuando esta entrada es la que debe mostrar la ventana Ãºnica (FIFO). */
  shouldShow: boolean;
}

/** Alta rechazada: SIEMPRE con `code` numÃ©rico y SIN haber persistido nada. */
export interface EnqueueRejected {
  ok: false;
  error: Eip1193Error;
}

/** Resultado del alta. */
export type EnqueueResult = EnqueueAccepted | EnqueueRejected;

/**
 * Da de alta una solicitud en `truekeate_pending_requests` con el orden EXACTO de Â§2.8:
 *
 *   0. cota de payload (`params` > `MAX_PAYLOAD_BYTES` â†’ `-32602`, sin persistir y sin ventana);
 *   1. duplicado de identificador â†’ `-32603`;
 *   2. cardinalidad global (8) â†’ `4001`;
 *   3. cardinalidad por origen (1) â†’ `4001`;
 *   4. ventana de 6 solicitudes / 60 s por origen â†’ `4001`;
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

  // Origen canÃ³nico: los contextos de la extensiÃ³n (popup) usan la clave `extension`.
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
    // Lectura ÃšNICA de las dos claves que se van a escribir (cola y ventana de tasa).
    const snapshot = await readStorage(
      [STORAGE_KEYS.pendingRequests, STORAGE_KEYS.rateWindows],
      options.storage,
    );
    const stored = readPendingRequestsFromSnapshot(snapshot);

    // 1. Identificador duplicado (Â§2.8): `-32603`, sin tocar el almacÃ©n.
    if (stored[approvalId] !== undefined) {
      return { ok: false, error: duplicateApprovalIdError() };
    }

    // Purga perezosa de lo ya resuelto y de lo vencido (esto Ãºltimo es huÃ©rfano â†’ `4001`).
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
    // CorrelaciÃ³n del salto 1 (D-H4-E10): solo se persiste si el emisor la declarÃ³ no vacÃ­a.
    if (typeof draft.requestId === 'string' && draft.requestId.length > 0) {
      request.requestId = draft.requestId;
    }
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
        // Â§2.13: las solicitudes aprobables persisten su ventana de tasa en el MISMO `set`.
        [STORAGE_KEYS.rateWindows]: { ...rateWindows, [resolvedOrigin]: nextWindow },
      },
      options.storage,
    );
    if (!written) {
      // Clave crÃ­tica: la operaciÃ³n se ABORTA y el estado no queda a medias (Â§2.15).
      return { ok: false, error: storageQuotaExceededError() };
    }

    const oldest = oldestPending(nextMap);
    // Badge derivado: se recalcula tras CADA escritura de la cola (Â§2.8, RF-38).
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
// ResoluciÃ³n de una entrada (aprobar / rechazar / vencer)
// ---------------------------------------------------------------------------

/** Estado final de una entrada de la cola. */
export type ResolvedStatus = Exclude<ApprovalStatus, 'pending'>;

/** Entrada resuelta y PURGADA de la cola persistida (`CA-RF-41`). */
export interface ResolvedRequest {
  request: PendingRequest;
  /** Estado efectivo aplicado (puede diferir del pedido si el plazo ya venciÃ³). */
  status: ResolvedStatus;
  resolvedAt: number;
  /** `4001` en rechazo y vencimiento; ausente en la aprobaciÃ³n. */
  errorCode?: number;
}

/** Opciones de la resoluciÃ³n. */
export interface ResolveOptions {
  now?: number;
  storage?: StorageLocalLike | null;
}

/**
 * Marca la entrada con su `resolvedAt`/`errorCode` y la PURGA de la cola en la misma operaciÃ³n
 * (`CA-RF-41`: Â«la entrada desaparece de la cola persistidaÂ»).
 *
 * Reglas duras:
 * - Una entrada que ya no estÃ¡ `pending` devuelve `null`: **respuesta duplicada ignorada** (X-06),
 *   el SW nunca firma ni difunde dos veces.
 * - Si el plazo ya venciÃ³, **prevalece `expired`** aunque la decisiÃ³n fuera aprobar o rechazar
 *   (`documento_tecnico.md` Â§2.3, Â«Cierre por ventana o pestaÃ±aÂ»).
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
      console.warn('[truekeate] no se pudo persistir la resoluciÃ³n de la solicitud', approvalId);
    }
    // Badge derivado: al resolver, el contador baja (Â§2.8).
    await purgeBadge(pendingCount(next));
    // Desenlace a quien esperaba la decisiÃ³n (la peticiÃ³n en vuelo del router): es el ÃšNICO punto
    // de notificaciÃ³n, asÃ­ que las tres vÃ­as de cierre (SIGN_RESPONSE, X de la ventana y
    // `chrome.alarms`) despiertan a la misma promesa sin lÃ³gica duplicada (M14.b).
    settleApprovalDecision(resolved);
    return resolved;
  });

/** Retira una entrada sin resolverla (purga de la reconciliaciÃ³n). Devuelve la entrada retirada. */
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
// Marca persistida de Â«transacciÃ³n en vueloÂ» por cuenta (Â§2.12 / tarea 4.6)
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

/** Proyecta el mapa completo `truekeate_inflight_tx` (funciÃ³n pura). */
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
 * Lectura/escritura de una marca por cuenta sin `any`: el Ã­ndice del mapa es un `Address`, pero las
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

/** Lee `truekeate_inflight_tx` del almacÃ©n. */
export const readInflightTx = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<InflightTxByAccount> =>
  readInflightTxFromSnapshot(await readStorage([STORAGE_KEYS.inflightTx], storage));

/** Â¿Sigue vigente la marca? (`expiresAt > now`; sin `expiresAt` numÃ©rico, NO es vigente). */
export const isInflightVigente = (entry: InflightTx | null | undefined, now: number): boolean =>
  entry !== null && entry !== undefined && Number.isFinite(entry.expiresAt) && entry.expiresAt > now;

/** Estado de exclusiÃ³n mutua de una cuenta: `free`, bloqueada por `signing` o en `broadcast`. */
export type AccountLockState = 'free' | 'signing' | 'broadcast';

/** Estado de la cuenta segÃºn la marca persistida (`diccionario_datos.md` Â§2.12 regla 2). */
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

/** Resultado de intentar tomar la exclusiÃ³n mutua de una cuenta. */
export type BeginInflightResult =
  | { ok: true; entry: InflightTx }
  | { ok: false; error: Eip1193Error; holder: InflightTx | null };

/**
 * Escribe `phase: 'signing'` **antes** de firmar (Â§2.12 regla 1: nunca despuÃ©s de difundir).
 *
 * Si la cuenta ya tiene una marca `signing` VIGENTE, NO se firma ni se difunde: se devuelve el
 * conflicto con el literal de `inflightTxInProgress` de Â§4.3 (v1.10) y el detalle en `data`, y la
 * solicitud permanece `pending` (Â§2.12 regla 5). NO es un exceso de cardinalidad: por eso ya no se
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
 * deja de bloquear la cuenta porque el nonce ya estÃ¡ consumido (Â§2.12 regla 2).
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

/** Libera la marca de una cuenta (al confirmar, fallar o vencer). Devuelve si existÃ­a. */
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
// Badge derivado (Ã­ndice de la cola, Â§2.8)
// ---------------------------------------------------------------------------

/**
 * Purga/actualiza el badge del icono con el Ã­ndice DERIVADO de la cola (`pending` total). El badge
 * no se persiste: se recalcula tras cada escritura o purga y, si el total es 0, se limpia con
 * `setBadgeText({ text: '' })` (Â§2.8, H-07/H-18). Nunca rompe el flujo si la API no estÃ¡.
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
// Log del Service Worker: implementación ÚNICA en M30 (`logging/logger.ts`)
// ---------------------------------------------------------------------------

/**
 * La escritura de `truekeate_logs` vive en **M30** (`src/background/logging/logger.ts`): la
 * retención FIFO por `ts` (M32), la política de reintento por cuota (§2.15) y el contador de
 * descartes tienen UNA sola implementación. Desde H5 este módulo solo la REEXPORTA, para que
 * M14/M15/M16/M18/M19.b sigan importando `appendLogEntry`/`appendLogEntries` como hasta ahora
 * sin que exista un segundo camino de escritura (tarea 5.6: exactamente 1 entrada por evento).
 */
export {
  appendLogEntries,
  appendLogEntry,
  type AppendLogOptions,
  type LogEntryInput,
} from '../logging/logger';
