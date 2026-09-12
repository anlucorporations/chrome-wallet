/**
 * M15 — `src/background/approvals/timeout.ts`
 * Dueño ÚNICO del plazo de las solicitudes de aprobación, con `chrome.alarms` (H4, tarea 4.2 de
 * `plan_desarrollo.md` §3.4.5).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §2.3, invariantes «Dueño único del plazo» y «Disparador del plazo».
 * - `diccionario_datos.md` §3.4 («Vencimiento con `chrome.alarms`»), §2.8 (`expiresAt`) y §2.12
 *   (rearme del *alarm* de liberación de la marca de transacción en vuelo).
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **El Service Worker es el único dueño del plazo**: `expiresAt = createdAt + SIGN_TIMEOUT_MS`
 *    (120 000 ms) **anclado a `createdAt`**, o `+ CONNECT_TIMEOUT_MS` (60 000 ms) para la conexión.
 *    La capa inject/content script NO fija plazo propio: solo tiene una red de seguridad con
 *    margen superior ({@link safetyTimeoutMs}) que delega siempre en el `approvalId`.
 * 2. **Disparador**: `chrome.alarms.create('truekeate_expire:<approvalId>', { when: expiresAt })`.
 *    **Prohibidos `setTimeout` y `setInterval`**: no sobreviven a la suspensión del SW y el plazo
 *    nunca dispararía (`documento_tecnico.md` §2.3, R17). Este fichero no contiene ninguno.
 * 3. **Efecto del vencimiento**: la entrada se marca `expired` con `resolvedAt` y `errorCode: 4001`
 *    (persistido), se entrega a la página un objeto **EIP-1193** con `code: 4001`, la ventana única
 *    pasa a la siguiente `pending` o se cierra, y el badge derivado se purga.
 * 4. **Idempotencia**: si la entrada ya no está `pending` (respuesta duplicada, X-06), el
 *    vencimiento no hace nada salvo limpiar su alarma.
 */

import type {
  ApprovalMethod,
  Eip1193Error,
  InflightTxByAccount,
  PendingRequest,
  PendingRequestsMap,
  Uuid,
} from '../../shared/types';
import {
  CONNECT_TIMEOUT_MS,
  EXPIRE_ALARM_PREFIX,
  SIGN_TIMEOUT_MS,
  TIMEOUT_SAFETY_MARGIN_MS,
} from '../../shared/constants';
import { timeoutError } from '../rpc/errors';
import type { StorageLocalLike } from '../state/schema';
import {
  appendLogEntry,
  isExpired,
  isInflightVigente,
  pendingCount,
  purgeBadge,
  readPendingRequests,
  resolveApprovalRequest,
} from './queue';
import { deliverApprovalResolution, type ApprovalDelivery, type ApprovalResponse } from './ports';
import { showOldestPending } from './focus';

// ---------------------------------------------------------------------------
// Purga del badge derivado (implementación en M14)
// ---------------------------------------------------------------------------

/**
 * Purga del badge derivado: la implementación vive en M14 (`queue.ts`), que es el módulo dueño del
 * índice `pending` (§2.8). Se reexporta aquí porque el vencimiento es uno de sus disparadores.
 */
export { purgeBadge };

// ---------------------------------------------------------------------------
// Superficie de `chrome.alarms` (sin `any`)
// ---------------------------------------------------------------------------

/** Información de programación de una alarma (`chrome.alarms.create`). */
export interface AlarmInfoLike {
  when?: number;
  delayInMinutes?: number;
  periodInMinutes?: number;
}

/** Alarma leída con `chrome.alarms.getAll`. */
export interface AlarmLike {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

/** Superficie mínima de `chrome.alarms` que usa el SW. */
export interface AlarmsLike {
  create(name: string, alarmInfo: AlarmInfoLike): unknown;
  clear(name?: string): Promise<unknown> | unknown;
  getAll(): Promise<readonly AlarmLike[]> | undefined;
  onAlarm?: { addListener(listener: (alarm: AlarmLike) => void): void };
}

/** Devuelve `chrome.alarms` sin `any`, o `null` si la API no está disponible. */
export const getAlarmsApi = (): AlarmsLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const alarms: unknown = (chromeNs as { alarms?: unknown }).alarms;
  if (typeof alarms !== 'object' || alarms === null) {
    return null;
  }
  const candidate = alarms as { create?: unknown; clear?: unknown; getAll?: unknown };
  if (
    typeof candidate.create !== 'function' ||
    typeof candidate.clear !== 'function' ||
    typeof candidate.getAll !== 'function'
  ) {
    return null;
  }
  return alarms as AlarmsLike;
};

// ---------------------------------------------------------------------------
// Nombres de alarma y cómputo del plazo
// ---------------------------------------------------------------------------

/** Nombre canónico de la alarma de vencimiento: `truekeate_expire:<approvalId>`. */
export const expiryAlarmName = (approvalId: Uuid): string =>
  `${EXPIRE_ALARM_PREFIX}${approvalId}`;

/** `approvalId` de una alarma de vencimiento; `null` si la alarma no es nuestra. */
export const approvalIdFromExpiryAlarm = (name: string): string | null =>
  name.startsWith(EXPIRE_ALARM_PREFIX) ? name.slice(EXPIRE_ALARM_PREFIX.length) : null;

/** Marca de las alarmas de LIBERACIÓN de una marca `inflight` `signing` (§2.12). */
export const INFLIGHT_ALARM_MARK = 'inflight:' as const;

/** Prefijo completo de las alarmas de liberación. */
const INFLIGHT_ALARM_PREFIX = `${EXPIRE_ALARM_PREFIX}${INFLIGHT_ALARM_MARK}`;

/** ¿Es una alarma de liberación de `truekeate_inflight_tx`? */
export const isInflightReleaseAlarm = (name: string): boolean =>
  name.startsWith(INFLIGHT_ALARM_PREFIX);

/** Nombre de la alarma de liberación de una cuenta. */
export const inflightReleaseAlarmName = (account: string): string =>
  `${INFLIGHT_ALARM_PREFIX}${account.toLowerCase()}`;

/** Cuenta de una alarma de liberación; `null` si la alarma no lo es. */
export const accountFromInflightReleaseAlarm = (name: string): string | null =>
  isInflightReleaseAlarm(name) ? name.slice(INFLIGHT_ALARM_PREFIX.length) : null;

/**
 * Plazo de un método aprobable de la cola: **120 s para los seis** (RF-40;
 * `wallet_switchEthereumChain` y `wallet_addEthereumChain` incluidos: §4.3 fija 120 s para su
 * rechazo o vencimiento). Los 60 s de `CONNECT_TIMEOUT_MS` son de `truekeate_connect_request`, que
 * NO vive en esta cola (§2.9).
 */
export const timeoutMsFor = (_method: ApprovalMethod): number => SIGN_TIMEOUT_MS;

/** `expiresAt` de una firma/aprobación, **anclado a `createdAt`** (nunca a la apertura de ventana). */
export const signExpiresAt = (createdAt: number): number => createdAt + SIGN_TIMEOUT_MS;

/** `expiresAt` de una solicitud de conexión (§2.9: 60 s). NO vive en esta cola. */
export const connectExpiresAt = (createdAt: number): number => createdAt + CONNECT_TIMEOUT_MS;

/**
 * Red de seguridad de la capa inject/content (H-07): `SIGN_TIMEOUT_MS + 5 s`. NUNCA es el dueño
 * del plazo; solo evita dejar a la página esperando si el SW no responde.
 */
export const safetyTimeoutMs = (): number => SIGN_TIMEOUT_MS + TIMEOUT_SAFETY_MARGIN_MS;

/** Segundos que se citan en el literal de vencimiento de §4.3. */
export const timeoutSeconds = (ms: number = SIGN_TIMEOUT_MS): number => Math.round(ms / 1000);

/** ¿Venció la entrada? Reexporta la regla de M14 (solo un `expiresAt` numérico vence). */
export const isApprovalExpired = (request: PendingRequest, now: number = Date.now()): boolean =>
  isExpired(request, now);

// ---------------------------------------------------------------------------
// Armado, rearme y cancelación
// ---------------------------------------------------------------------------

/** Arma una alarma con `when: expiresAt`. Si el instante ya pasó, Chrome la dispara de inmediato. */
export const armAlarm = (
  name: string,
  expiresAt: number,
  alarms: AlarmsLike | null = getAlarmsApi(),
): boolean => {
  if (alarms === null) {
    return false;
  }
  try {
    alarms.create(name, { when: expiresAt });
    return true;
  } catch (error) {
    console.warn('[truekeate] no se pudo armar la alarma', name, error);
    return false;
  }
};

/** Cancela una alarma por nombre. */
export const cancelAlarm = async (
  name: string,
  alarms: AlarmsLike | null = getAlarmsApi(),
): Promise<boolean> => {
  if (alarms === null) {
    return false;
  }
  try {
    await alarms.clear(name);
    return true;
  } catch (error) {
    console.warn('[truekeate] no se pudo cancelar la alarma', name, error);
    return false;
  }
};

/** Arma la alarma de vencimiento de una solicitud. */
export const armExpiryAlarm = (
  approvalId: Uuid,
  expiresAt: number,
  alarms: AlarmsLike | null = getAlarmsApi(),
): boolean => armAlarm(expiryAlarmName(approvalId), expiresAt, alarms);

/** Cancela la alarma de vencimiento de una solicitud (al resolverla o al vencer). */
export const cancelExpiryAlarm = (
  approvalId: Uuid,
  alarms: AlarmsLike | null = getAlarmsApi(),
): Promise<boolean> => cancelAlarm(expiryAlarmName(approvalId), alarms);

/** Arma la alarma de liberación de una marca `inflight` `signing` (§2.12). */
export const armInflightReleaseAlarm = (
  account: string,
  expiresAt: number,
  alarms: AlarmsLike | null = getAlarmsApi(),
): boolean => armAlarm(inflightReleaseAlarmName(account), expiresAt, alarms);

/** Cancela la alarma de liberación de una cuenta. */
export const cancelInflightReleaseAlarm = (
  account: string,
  alarms: AlarmsLike | null = getAlarmsApi(),
): Promise<boolean> => cancelAlarm(inflightReleaseAlarmName(account), alarms);

/** Nombres de TODAS las alarmas de vencimiento programadas (solicitudes y liberaciones). */
export const listExpiryAlarmNames = async (
  alarms: AlarmsLike | null = getAlarmsApi(),
): Promise<string[]> => {
  if (alarms === null) {
    return [];
  }
  try {
    const all = (await alarms.getAll()) ?? [];
    return all.map((alarm) => alarm.name).filter((name) => name.startsWith(EXPIRE_ALARM_PREFIX));
  } catch (error) {
    console.warn('[truekeate] no se pudieron leer las alarmas', error);
    return [];
  }
};

/** Cancela TODAS las alarmas de vencimiento (paso 4 del reset de §3.9). Devuelve cuántas. */
export const cancelAllExpiryAlarms = async (
  alarms: AlarmsLike | null = getAlarmsApi(),
): Promise<number> => {
  if (alarms === null) {
    return 0;
  }
  let cancelled = 0;
  for (const name of await listExpiryAlarmNames(alarms)) {
    if (await cancelAlarm(name, alarms)) {
      cancelled += 1;
    }
  }
  return cancelled;
};

/** Informe del rearme de alarmas de un arranque. */
export interface RearmReport {
  /** Alarmas de solicitudes armadas desde el `expiresAt` persistido. */
  armed: number;
  /** Alarmas HUÉRFANAS (de solicitudes que ya no existen) retiradas. */
  cleared: number;
  /** Entradas `pending` que seguían en la cola. */
  pending: number;
}

/**
 * Rearma las alarmas de todas las entradas `pending` desde su `expiresAt` **persistido** y retira
 * las alarmas de vencimiento huérfanas (de solicitudes ya resueltas antes de la suspensión). Las
 * alarmas de liberación de `inflight` NO se tocan aquí: las gobierna
 * {@link reconcileInflightAlarms}. Una entrada sin `expiresAt` numérico se rearma con
 * `now + SIGN_TIMEOUT_MS`: nunca se deja una solicitud sin plazo.
 */
export const rearmExpiryAlarms = async (
  map: PendingRequestsMap,
  options: { now?: number; alarms?: AlarmsLike | null } = {},
): Promise<RearmReport> => {
  const alarms = options.alarms ?? getAlarmsApi();
  const now = options.now ?? Date.now();
  const pendings = Object.values(map).filter((request) => request.status === 'pending');
  const expected = new Set<string>();
  let armed = 0;
  for (const request of pendings) {
    const expiresAt = Number.isFinite(request.expiresAt) ? request.expiresAt : now + SIGN_TIMEOUT_MS;
    expected.add(expiryAlarmName(request.approvalId));
    if (armExpiryAlarm(request.approvalId, expiresAt, alarms)) {
      armed += 1;
    }
  }
  let cleared = 0;
  for (const name of await listExpiryAlarmNames(alarms)) {
    if (expected.has(name) || isInflightReleaseAlarm(name)) {
      continue;
    }
    if (await cancelAlarm(name, alarms)) {
      cleared += 1;
    }
  }
  return { armed, cleared, pending: pendings.length };
};

/** Informe del rearme de las alarmas de liberación de `truekeate_inflight_tx`. */
export interface InflightAlarmReport {
  armed: number;
  cleared: number;
}

/**
 * Rearma la alarma de liberación de cada marca `signing` VIGENTE (`expiresAt > now`) y retira las
 * alarmas de liberación que ya no corresponden a ninguna marca (§2.12, fila «`signing` con
 * `expiresAt > now`: se conserva la marca y se rearma el `alarm` de liberación en `expiresAt`»).
 */
export const reconcileInflightAlarms = async (
  map: InflightTxByAccount,
  options: { now?: number; alarms?: AlarmsLike | null } = {},
): Promise<InflightAlarmReport> => {
  const alarms = options.alarms ?? getAlarmsApi();
  const now = options.now ?? Date.now();
  const expected = new Set<string>();
  let armed = 0;
  for (const entry of Object.values(map)) {
    if (entry.phase !== 'signing' || !isInflightVigente(entry, now)) {
      continue;
    }
    expected.add(inflightReleaseAlarmName(entry.account));
    if (armInflightReleaseAlarm(entry.account, entry.expiresAt, alarms)) {
      armed += 1;
    }
  }
  let cleared = 0;
  for (const name of await listExpiryAlarmNames(alarms)) {
    if (!isInflightReleaseAlarm(name) || expected.has(name)) {
      continue;
    }
    if (await cancelAlarm(name, alarms)) {
      cleared += 1;
    }
  }
  return { armed, cleared };
};

// ---------------------------------------------------------------------------
// Efecto del vencimiento
// ---------------------------------------------------------------------------

/** Dependencias del vencimiento (todas con su valor real por defecto). */
export interface ExpiryDeps {
  now?: number;
  storage?: StorageLocalLike | null;
  alarms?: AlarmsLike | null;
  /** Entrega del `4001` al solicitante (M17). */
  deliver?: (request: PendingRequest, response: ApprovalResponse) => Promise<ApprovalDelivery>;
  /** Re-render de la siguiente `pending` en la ventana única o cierre (M18). */
  refreshWindow?: () => Promise<unknown>;
  /** Purga del badge derivado (§2.8: índice `pending`). */
  purgeBadge?: (pending: number) => Promise<void>;
  /** Escritura de la traza `approval_expired` (M30 la formaliza en H5). */
  log?: boolean;
}

/** Resultado observable de un vencimiento. */
export interface ExpiryOutcome {
  approvalId: Uuid;
  /** `true` solo si esta llamada fue la que resolvió la entrada. */
  expired: boolean;
  request: PendingRequest | null;
  /** Objeto EIP-1193 entregado a la página (`code: 4001`); `null` si no había nada que vencer. */
  error: Eip1193Error | null;
  delivery: ApprovalDelivery | 'already-resolved';
  windowAction: string | null;
  pendingCount: number;
}

/**
 * Vence una solicitud: la marca `expired` con `resolvedAt` y `errorCode: 4001`, entrega a la página
 * el objeto EIP-1193 del literal de §4.3 («El usuario no respondió en el plazo establecido (120 s);
 * la solicitud ha caducado.»), deja la ventana única en la siguiente `pending` (o la cierra) y purga
 * el badge. Es **idempotente**: repetirla no hace nada.
 */
export const expireApprovalRequest = async (
  approvalId: Uuid,
  options: ExpiryDeps = {},
): Promise<ExpiryOutcome> => {
  const now = options.now ?? Date.now();
  const alarms = options.alarms ?? getAlarmsApi();
  const resolved = await resolveApprovalRequest(approvalId, 'expired', {
    now,
    storage: options.storage,
  });
  if (resolved === null) {
    // Ya no estaba `pending`: se limpia su alarma y no se entrega nada (respuesta duplicada, X-06).
    await cancelExpiryAlarm(approvalId, alarms);
    const map = await readPendingRequests(options.storage);
    return {
      approvalId,
      expired: false,
      request: null,
      error: null,
      delivery: 'already-resolved',
      windowAction: null,
      pendingCount: pendingCount(map),
    };
  }

  const error = timeoutError(timeoutSeconds());
  const deliver = options.deliver ?? deliverApprovalResolution;
  const delivery = await deliver(resolved.request, { error });

  // Re-render de la siguiente `pending` en la ventana única, o cierre si no queda ninguna.
  let windowAction: string | null = null;
  const refresh = options.refreshWindow ?? showOldestPending;
  try {
    const outcome = await refresh();
    windowAction =
      typeof outcome === 'object' && outcome !== null && 'action' in outcome
        ? String((outcome as { action: unknown }).action)
        : null;
  } catch (refreshError) {
    console.warn('[truekeate] no se pudo refrescar la ventana única tras el vencimiento', refreshError);
  }

  const map = await readPendingRequests(options.storage);
  const pending = pendingCount(map);
  await (options.purgeBadge ?? purgeBadge)(pending);

  if (options.log !== false) {
    await appendLogEntry(
      'approval_expired',
      'event',
      'warn',
      'Solicitud de aprobación vencida',
      {
        approvalId,
        method: resolved.request.method,
        origin: resolved.request.origin,
        errorCode: error.code,
        segundos: timeoutSeconds(),
      },
      {
        now,
        storage: options.storage,
        origin: resolved.request.origin,
        method: resolved.request.method,
      },
    );
  }

  return {
    approvalId,
    expired: true,
    request: resolved.request,
    error,
    delivery,
    windowAction,
    pendingCount: pending,
  };
};

/** Opciones del listener de alarmas. */
export interface AlarmListenerOptions {
  /** Atiende el vencimiento de una solicitud. */
  handler?: (approvalId: Uuid, alarm: AlarmLike) => Promise<unknown>;
  /** Atiende la liberación de una marca `inflight` `signing` vencida (§2.12). */
  onInflightRelease?: (account: string, alarm: AlarmLike) => Promise<unknown>;
  alarms?: AlarmsLike | null;
}

/**
 * Registra el listener de `chrome.alarms.onAlarm` y atiende SOLO las alarmas del módulo
 * (`truekeate_expire:*`, incluidas las de liberación de `inflight`). Se registra de forma SÍNCRONA
 * al evaluar el SW, porque una alarma puede ser justamente el evento que lo despierte.
 *
 * El handler NO se envuelve en el `rmwLock`: `expireApprovalRequest` ya toma ese cerrojo donde debe
 * (dentro de M14) y anidarlo dos veces bloquearía la cadena para siempre.
 */
export const registerExpiryAlarmListener = (options: AlarmListenerOptions = {}): boolean => {
  const alarms = options.alarms ?? getAlarmsApi();
  if (alarms?.onAlarm === undefined || typeof alarms.onAlarm.addListener !== 'function') {
    return false;
  }
  const handler = options.handler ?? ((approvalId: Uuid) => expireApprovalRequest(approvalId));
  const onInflightRelease = options.onInflightRelease;
  alarms.onAlarm.addListener((alarm) => {
    const account = accountFromInflightReleaseAlarm(alarm.name);
    if (account !== null) {
      if (onInflightRelease === undefined) {
        return;
      }
      void onInflightRelease(account, alarm).catch((error: unknown) => {
        console.warn('[truekeate] fallo al liberar la marca en vuelo', alarm.name, error);
      });
      return;
    }
    const approvalId = approvalIdFromExpiryAlarm(alarm.name);
    if (approvalId === null) {
      return;
    }
    void handler(approvalId, alarm).catch((error: unknown) => {
      console.warn('[truekeate] fallo al atender la alarma de vencimiento', alarm.name, error);
    });
  });
  return true;
};
