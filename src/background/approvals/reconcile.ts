/**
 * M16 — `src/background/approvals/reconcile.ts`
 * Reconciliación al arrancar el Service Worker (H4, tarea 4.5 de `plan_desarrollo.md` §3.4.5).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §2.3, invariante «Reconciliación al arrancar» (H-02, ACU-21, ADT-23/D-R).
 * - `diccionario_datos.md` §3.4 (7 pasos de la reconciliación), §2.12 (tabla de reconstrucción de
 *   `truekeate_inflight_tx`), §2.13 (reconstrucción de `truekeate_rate_windows`) y §2.14 (ventana
 *   única).
 *
 * QUÉ HACE, EN ORDEN
 * 1. **Una sola lectura** de `truekeate_pending_requests`, `truekeate_inflight_tx`,
 *    `truekeate_rate_windows` y `truekeate_approval_window`.
 * 2. **Purga** de las entradas con `status !== 'pending'` o `expiresAt <= now`.
 * 3. **`4001` a las huérfanas** (las `pending` vencidas): se entrega por el puerto vivo o por su
 *    pestaña/frame; sin destinatario se descarta la entrada y se deja traza.
 * 4. **Rearme de `chrome.alarms`** desde el `expiresAt` persistido (y retirada de las huérfanas).
 * 5. **Reconstrucción de `truekeate_inflight_tx`** con la tabla de §2.12 (liberación por TTL,
 *    recibo si hay consulta inyectada, rearme del *alarm* de liberación).
 * 6. **Reconstrucción de `truekeate_rate_windows`** (recarga perezosa, purga por inactividad y
 *    reinicio de la ventana de 60 s) reutilizando M3.b: la lógica no se duplica.
 * 7. **Ventana única**: se restablece el invariante «una sola ventana, mostrando la `pending` más
 *    antigua» (M18).
 * 8. **UNA** entrada `sw_reconcile` en `truekeate_logs`, más las trazas de lo descartado.
 *
 * COTA: **< 1 s con 50 pendientes** y reloj inyectado (RNF-08, `CA-RF-41`). Por eso el estado se lee
 * una vez, las escrituras se agrupan y las trazas se escriben en un solo `set`.
 *
 * Sin `setTimeout` ni `setInterval`: el dueño del plazo es M15 (`chrome.alarms`).
 */

import type { Address, InflightTxByAccount, PendingRequest } from '../../shared/types';
import { SIGN_TIMEOUT_MS } from '../../shared/constants';
import { timeoutError } from '../rpc/errors';
import { reconcileRateWindows } from '../rpc/rateLimit';
import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
  type StorageLocalLike,
} from '../state/schema';
import {
  appendLogEntries,
  inflightFor,
  isInflightVigente,
  pendingCount,
  planQueuePurge,
  purgeBadge,
  readInflightTx,
  readInflightTxFromSnapshot,
  readPendingRequestsFromSnapshot,
  releaseInflightTx,
  setInflight,
  type LogEntryInput,
} from './queue';
import {
  getAlarmsApi,
  rearmExpiryAlarms,
  reconcileInflightAlarms,
  timeoutSeconds,
  type AlarmsLike,
  type RearmReport,
} from './timeout';
import {
  deliverApprovalResolution,
  type ApprovalDelivery,
  type ApprovalResponse,
} from './ports';
import {
  getWindowsApi,
  showOldestPending,
  type FocusOutcome,
  type WindowsApiLike,
} from './focus';

/** Resultado de la reconstrucción de la marca de transacción en vuelo (§2.12). */
export interface InflightReconcileReport {
  /** `signing` VENCIDAS: la cuenta se libera y se registra `rpc_error -32603`. */
  released: number;
  /** `broadcast` vencidas sin recibo: se elimina la marca y se registra `rpc_error -32603`. */
  dropped: number;
  /** Marcas conservadas (siguen vigentes y sin recibo, o `signing` vigentes). */
  retained: number;
  /** `broadcast` con recibo `status 0x1`: se elimina la marca y se registra `tx_confirmed`. */
  confirmed: number;
  /** `broadcast` con recibo `status 0x0`: se elimina la marca y se registra `tx_failed`. */
  failed: number;
  /** Alarmas de liberación rearmadas. */
  alarmsArmed: number;
  /** Alarmas de liberación huérfanas retiradas. */
  alarmsCleared: number;
  /** `true` cuando el mapa persistido cambió y se reescribió. */
  persisted: boolean;
}

/** Resultado de la reconstrucción de la ventana de tasa por origen (M3.b). */
export interface RateWindowReconcileReport {
  purged: number;
  reset: number;
  retained: number;
  /** `false` cuando la reconstrucción se omitió por opción. */
  applied: boolean;
}

/** Informe completo de la reconciliación. */
export interface ReconcileReport {
  /** Instante de inicio según el reloj inyectado. */
  startedAt: number;
  /** Instante lógico usado por la reconciliación. */
  now: number;
  /** Coste medido con el reloj inyectado (cota: < 1 s, RNF-08). */
  elapsedMs: number;
  pendingBefore: number;
  pendingAfter: number;
  /** Entradas ya resueltas que se retiraron. */
  purgedResolved: number;
  /** Entradas `pending` vencidas (huérfanas) que se retiraron. */
  purgedExpired: number;
  /** Huérfanas que recibieron su `4001` por puerto o pestaña. */
  orphansDelivered: number;
  /** Huérfanas sin destinatario: se descartaron con traza. */
  orphansUndelivered: number;
  rearm: RearmReport;
  inflight: InflightReconcileReport;
  rateWindows: RateWindowReconcileReport;
  /** Pasada de la ventana única (M18). */
  window: FocusOutcome | null;
  /** `true` cuando se escribió la entrada `sw_reconcile`. */
  logWritten: boolean;
}

/** Consulta del recibo de una difusión interrumpida (`eth_getTransactionReceipt`, M5/M7). */
export type ReceiptLookup = (txHash: string) => Promise<'confirmed' | 'failed' | null>;

/** Entrega de la respuesta a una solicitud (M17); inyectable en las pruebas. */
export type DeliverFn = (
  request: PendingRequest,
  response: ApprovalResponse,
) => Promise<ApprovalDelivery>;

/** Opciones de la reconciliación (todas inyectables para las pruebas). */
export interface ReconcileOptions {
  /** Reloj lógico (por defecto `Date.now`): permite fijar `now` sin esperar. */
  now?: number;
  /** Reloj de MEDICIÓN del coste; por defecto el del sistema. */
  clock?: () => number;
  storage?: StorageLocalLike | null;
  alarms?: AlarmsLike | null;
  windows?: WindowsApiLike | null;
  /** Consulta del recibo; si se omite, `broadcast` se conserva hasta agotar su TTL. */
  readReceipt?: ReceiptLookup;
  /** Entrega de la respuesta a las huérfanas (M17). */
  deliver?: DeliverFn;
  /** Reconstruir `truekeate_rate_windows` (por defecto sí). */
  reconcileRateWindows?: boolean;
  /** Restablecer el invariante de la ventana única (por defecto sí). */
  restoreWindow?: boolean;
  /** Escribir las trazas (`sw_reconcile` y las de lo descartado). */
  log?: boolean;
  /** Actualizar el badge derivado (por defecto sí). */
  badge?: boolean;
}

/** Escribe el mapa de marcas solo si cambió (fase o hash). */
const persistInflightIfChanged = async (
  before: InflightTxByAccount,
  after: InflightTxByAccount,
  storage: StorageLocalLike | null | undefined,
): Promise<boolean> => {
  const accountsBefore = Object.keys(before);
  const accountsAfter = Object.keys(after);
  if (accountsBefore.length === accountsAfter.length) {
    const same = accountsBefore.every((account) => {
      const previous = inflightFor(before, account);
      const next = inflightFor(after, account);
      return (
        previous !== undefined &&
        next !== undefined &&
        next.phase === previous.phase &&
        next.txHash === previous.txHash
      );
    });
    if (same) {
      return false;
    }
  }
  const written = await writeStorage({ [STORAGE_KEYS.inflightTx]: after }, storage);
  return written;
};

/**
 * Aplica la tabla de reconstrucción de `diccionario_datos.md` §2.12 a las marcas persistidas.
 * Devuelve el mapa resultante, su informe y las trazas, SIN escribir: la escritura la decide el
 * llamador (así la función es comprobable sin almacén).
 *
 * | Estado leído | Acción |
 * |---|---|
 * | `broadcast` con recibo `0x1` / `0x0` | se elimina la marca y se registra `tx_confirmed` / `tx_failed` |
 * | `broadcast` sin recibo, `expiresAt > now` | se conserva y se sigue el recibo |
 * | `broadcast` sin recibo, `expiresAt <= now` | se elimina y se registra `rpc_error -32603` con `{ txHash }` |
 * | `signing` con `expiresAt <= now` | se libera la cuenta y se registra `rpc_error -32603` con `{ phase, nonce }` |
 * | `signing` con `expiresAt > now` | se conserva y se rearma el *alarm* de liberación |
 */
export const planInflightReconciliation = async (
  map: InflightTxByAccount,
  options: { now: number; readReceipt?: ReceiptLookup },
): Promise<{
  map: InflightTxByAccount;
  report: Omit<InflightReconcileReport, 'alarmsArmed' | 'alarmsCleared' | 'persisted'>;
  traces: LogEntryInput[];
}> => {
  const next: InflightTxByAccount = {};
  const traces: LogEntryInput[] = [];
  let released = 0;
  let dropped = 0;
  let retained = 0;
  let confirmed = 0;
  let failed = 0;

  for (const [account, entry] of Object.entries(map)) {
    const vigente = isInflightVigente(entry, options.now);

    if (entry.phase === 'signing') {
      if (vigente) {
        // Se conserva, y M15 rearma su alarma de liberación en `expiresAt`.
        setInflight(next, account, entry);
        retained += 1;
        continue;
      }
      // Firmando con el TTL agotado: se LIBERA la cuenta. NUNCA se reintenta la firma sola.
      released += 1;
      traces.push({
        event: 'rpc_error',
        category: 'system',
        level: 'warn',
        message: 'Se liberó una marca de firma interrumpida por la suspensión del Service Worker',
        data: { code: -32603, phase: 'signing', nonce: entry.nonce ?? null },
        method: 'eth_sendTransaction',
      });
      continue;
    }

    // `phase: 'broadcast'`: hay (o debería haber) un hash difundido.
    if (options.readReceipt !== undefined && entry.txHash !== null) {
      let receipt: 'confirmed' | 'failed' | null = null;
      try {
        receipt = await options.readReceipt(entry.txHash);
      } catch {
        // Sin nodo no se puede confirmar: se aplica la regla del TTL, como si no hubiera recibo.
        receipt = null;
      }
      if (receipt !== null) {
        if (receipt === 'confirmed') {
          confirmed += 1;
          traces.push({
            event: 'tx_confirmed',
            category: 'tx',
            level: 'success',
            message: 'Transacción confirmada tras el arranque del Service Worker',
            data: { status: 'confirmed' },
            method: 'eth_getTransactionReceipt',
            txHash: entry.txHash,
          });
        } else {
          failed += 1;
          traces.push({
            event: 'tx_failed',
            category: 'tx',
            level: 'error',
            message: 'Transacción fallida (revert) confirmada tras el arranque',
            data: { status: 'failed' },
            method: 'eth_getTransactionReceipt',
            txHash: entry.txHash,
          });
        }
        continue;
      }
    }

    if (vigente) {
      // Sin recibo y dentro del TTL: se conserva y se sigue el recibo.
      setInflight(next, account, entry);
      retained += 1;
      continue;
    }

    // Sin recibo y con el TTL agotado: se elimina la marca y se deja traza para que el usuario
    // verifique el hash en el nodo (el SW jamás reintenta una difusión).
    dropped += 1;
    traces.push({
      event: 'rpc_error',
      category: 'system',
      level: 'warn',
      message: 'Difusión sin recibo cuyo TTL expiró; verifica el hash en el nodo',
      data: {
        code: -32603,
        reason: 'broadcast-interrupted',
        txHash: entry.txHash,
        nonce: entry.nonce ?? null,
      },
      method: 'eth_getTransactionReceipt',
      // D-H4-E6 (corregido): el hash viajaba SOLO en `data.txHash`; el panel de actividad de H5
      // (RF-31) lee `LogEntry.txHash`, así que se rellena el campo de primer nivel cuando el dato
      // existe. Si la marca no tenía hash (difusión interrumpida antes de recibirlo) no se inventa.
      ...(entry.txHash === null ? {} : { txHash: entry.txHash }),
    });
  }

  return { map: next, report: { released, dropped, retained, confirmed, failed }, traces };
};

/**
 * Libera la marca de una cuenta cuando vence la alarma de liberación de su fase `signing` (§2.12):
 * la cuenta se desbloquea y queda traza `rpc_error -32603`. La dispara el listener de M15.
 */
export const releaseInflightOnAlarm = async (
  account: string,
  options: { now?: number; storage?: StorageLocalLike | null } = {},
): Promise<boolean> => {
  // La alarma transporta la cuenta en minúsculas; la clave persistida es una dirección EIP-55, así
  // que el vínculo se resuelve por comparación sin distinguir mayúsculas.
  const map = await readInflightTx(options.storage);
  const key = Object.keys(map).find(
    (candidate) => candidate.toLowerCase() === account.toLowerCase(),
  );
  if (key === undefined) {
    return false;
  }
  const released = await releaseInflightTx(key as Address, {
    ...(options.now === undefined ? {} : { now: options.now }),
    storage: options.storage,
  });
  if (!released) {
    return false;
  }
  await appendLogEntries(
    [
      {
        event: 'rpc_error',
        category: 'system',
        level: 'warn',
        message: 'Marca de transacción en vuelo liberada al vencer su plazo',
        data: { code: -32603, reason: 'inflight-ttl', account },
        method: 'eth_sendTransaction',
      },
    ],
    { ...(options.now === undefined ? {} : { now: options.now }), storage: options.storage },
  );
  return true;
};

/**
 * Reconciliación completa del arranque. Es **idempotente**: repetirla sin cambios no escribe nada
 * salvo la entrada `sw_reconcile`, que documenta cada arranque.
 */
export const reconcileApprovals = async (
  options: ReconcileOptions = {},
): Promise<ReconcileReport> => {
  const clock = options.clock ?? ((): number => Date.now());
  const startedAt = clock();
  const now = options.now ?? startedAt;
  const storage = options.storage;
  const alarms = options.alarms === undefined ? getAlarmsApi() : options.alarms;
  const windows = options.windows === undefined ? getWindowsApi() : options.windows;

  // 1. UNA lectura de todo el estado implicado (cota de < 1 s).
  const snapshot = await readStorage(
    [
      STORAGE_KEYS.pendingRequests,
      STORAGE_KEYS.inflightTx,
      STORAGE_KEYS.rateWindows,
      STORAGE_KEYS.approvalWindow,
    ],
    storage,
  );

  // 2. Purga de la cola: ya resueltas y vencidas.
  const map = readPendingRequestsFromSnapshot(snapshot);
  const pendingBefore = pendingCount(map);
  const plan = planQueuePurge(map, now);
  if (plan.changed) {
    await writeStorage({ [STORAGE_KEYS.pendingRequests]: plan.map }, storage);
  }

  // 3. `4001` a las huérfanas (vencidas) y traza de las que ya no tienen destinatario.
  const traces: LogEntryInput[] = [];
  const deliver: DeliverFn = options.deliver ?? deliverApprovalResolution;
  let orphansDelivered = 0;
  let orphansUndelivered = 0;
  const error = timeoutError(timeoutSeconds(SIGN_TIMEOUT_MS));
  for (const orphan of plan.expired) {
    const delivery = await deliver(orphan, { error });
    if (delivery === 'none') {
      orphansUndelivered += 1;
    } else {
      orphansDelivered += 1;
    }
    traces.push({
      event: 'approval_expired',
      category: 'event',
      level: 'warn',
      message: 'Solicitud de aprobación huérfana en el arranque: se responde 4001',
      data: {
        approvalId: orphan.approvalId,
        errorCode: error.code,
        entrega: delivery,
        segundos: timeoutSeconds(),
      },
      origin: orphan.origin,
      method: orphan.method,
    });
  }

  // 4. Rearme de las alarmas de vencimiento desde el `expiresAt` persistido.
  const rearm = await rearmExpiryAlarms(plan.map, { now, alarms });

  // 5. Reconstrucción de la marca de transacción en vuelo (§2.12).
  const inflightBefore = readInflightTxFromSnapshot(snapshot);
  const inflightPlan = await planInflightReconciliation(inflightBefore, {
    now,
    ...(options.readReceipt === undefined ? {} : { readReceipt: options.readReceipt }),
  });
  const inflightPersisted = await persistInflightIfChanged(inflightBefore, inflightPlan.map, storage);
  const inflightAlarms = await reconcileInflightAlarms(inflightPlan.map, { now, alarms });
  traces.push(...inflightPlan.traces);

  // 6. Reconstrucción de la ventana de tasa por origen (M3.b: una sola implementación).
  let rateWindows: RateWindowReconcileReport = { purged: 0, reset: 0, retained: 0, applied: false };
  if (options.reconcileRateWindows !== false) {
    try {
      const rebuilt = await reconcileRateWindows({ storage, now });
      rateWindows = { ...rebuilt, applied: true };
    } catch (rateError) {
      console.warn('[truekeate] no se pudo reconstruir truekeate_rate_windows', rateError);
    }
  }

  // 7. Ventana única: una sola ventana mostrando la `pending` más antigua (o cerrada).
  let window: FocusOutcome | null = null;
  if (options.restoreWindow !== false) {
    try {
      window = await showOldestPending({ now, storage, windows });
    } catch (windowError) {
      console.warn('[truekeate] no se pudo restablecer la ventana única', windowError);
    }
  }

  const pendingAfter = pendingCount(plan.map);

  // 8. UNA entrada `sw_reconcile` (más las trazas de lo descartado), en un solo `set`.
  let logWritten = false;
  if (options.log !== false) {
    traces.push({
      event: 'sw_reconcile',
      category: 'system',
      level:
        plan.expired.length > 0 || inflightPlan.report.released > 0 || inflightPlan.report.dropped > 0
          ? 'warn'
          : 'info',
      message: 'Reconciliación al arrancar el Service Worker',
      data: {
        pendingBefore,
        pendingAfter,
        purgedResolved: plan.resolved.length,
        purgedExpired: plan.expired.length,
        orphansDelivered,
        orphansUndelivered,
        rearm,
        inflight: {
          released: inflightPlan.report.released,
          dropped: inflightPlan.report.dropped,
          retained: inflightPlan.report.retained,
          confirmed: inflightPlan.report.confirmed,
          failed: inflightPlan.report.failed,
          alarmsArmed: inflightAlarms.armed,
          alarmsCleared: inflightAlarms.cleared,
        },
        rateWindows,
        window: window === null ? null : window.action,
      },
    });
    const written = await appendLogEntries(traces, { now, storage });
    logWritten = written.some((entry) => entry.event === 'sw_reconcile');
  }

  if (options.badge !== false) {
    await purgeBadge(pendingAfter);
  }

  const elapsedMs = clock() - startedAt;
  if (elapsedMs > 1_000) {
    console.warn(
      `[truekeate] la reconciliación de aprobaciones superó 1 s: ${elapsedMs} ms (RNF-08)`,
    );
  }

  return {
    startedAt,
    now,
    elapsedMs,
    pendingBefore,
    pendingAfter,
    purgedResolved: plan.resolved.length,
    purgedExpired: plan.expired.length,
    orphansDelivered,
    orphansUndelivered,
    rearm,
    inflight: {
      ...inflightPlan.report,
      alarmsArmed: inflightAlarms.armed,
      alarmsCleared: inflightAlarms.cleared,
      persisted: inflightPersisted,
    },
    rateWindows,
    window,
    logWritten,
  };
};
