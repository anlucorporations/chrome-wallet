/**
 * M14.c — `src/background/approvals/responses.ts`
 * **Decisión del usuario** sobre la solicitud mostrada: canal `SIGN_RESPONSE` de `notification.html`
 * (H4, tareas 4.1 y 4.3; `documento_tecnico.md` §3.1 y `diccionario_datos.md` §4.2).
 *
 * POR QUÉ ES UN MÓDULO PROPIO
 * La ventana única **decide, no firma** (`CA-RF-35`): publica `SIGN_RESPONSE { approvalId, success }`
 * y quien resuelve la cola, firma, difunde y responde a la dApp es el Service Worker. Ese camino
 * —validar que la ruta emisora es `notification.html`, resolver la entrada con M14, entregar la
 * respuesta con M17 y re-renderizar la siguiente `pending` con M18— vivía SIN implementar: el
 * router respondía `4200` a `SIGN_RESPONSE`, así que una aprobación nunca llegaba a resolverse.
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Allowlist de ruta** (M20): solo `notification.html` puede decidir (`guardResponseRoute`).
 * 2. **Respuestas duplicadas se ignoran** (X-06): si la entrada ya no está `pending`,
 *    `resolveApprovalRequest` devuelve `null` y aquí NO se firma, ni se difunde, ni se entrega nada.
 * 3. **Rechazo y vencimiento → `4001`**: el literal lo aporta la propia ventana cuando rechaza
 *    (`success: false` con su `error`) y, si no lo trae, se usa el `userRejectedError` de §4.3. Si
 *    el plazo ya venció, `resolveApprovalRequest` aplica `expired` y prevalece el `4001` de
 *    vencimiento (M14).
 * 4. **La misma ventana pasa a la siguiente** o se cierra (`showOldestPending`, M18).
 */

import type { Eip1193Error, PendingRequest, Uuid } from '../../shared/types';
import { SIGN_TIMEOUT_MS } from '../../shared/constants';
import { isTruekeateMessageType } from '../../shared/protocol';
import { timeoutError, userRejectedError } from '../rpc/errors';
import type { SenderLike } from '../security/senderGuard';
import { guardResponseRoute } from '../security/senderGuard';
import type { StorageLocalLike } from '../state/schema';
import {
  appendLogEntry,
  isExpired,
  resolveApprovalRequest,
  type ResolvedStatus,
} from './queue';
import { deliverApprovalResolution, type ApprovalDelivery } from './ports';
import { showOldestPending, type FocusOutcome } from './focus';

/** Resultado de atender una decisión del usuario. */
export interface SignResponseOutcome {
  handled: boolean;
  reason: string;
  approvalId: Uuid | null;
  status: ResolvedStatus | null;
  delivery: ApprovalDelivery | 'none' | 'already-resolved' | 'unauthorized';
  /** Pasada posterior de la ventana única (muestra la siguiente o la cierra). */
  refresh: FocusOutcome | null;
}

/** ¿Es un objeto plano utilizable como mensaje? */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** ¿Es un error EIP-1193 con `code` numérico? */
const isEip1193Error = (value: unknown): value is Eip1193Error =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { code?: unknown }).code === 'number' &&
  typeof (value as { message?: unknown }).message === 'string';

/** Opciones de la atención de la decisión (todas inyectables para las pruebas). */
export interface SignResponseOptions {
  now?: number;
  storage?: StorageLocalLike | null;
  /**
   * Re-renderizar la ventana única con la siguiente `pending` al terminar (por defecto sí).
   *
   * El llamador de PRODUCCIÓN lo desactiva y hace esa pasada **después** de responder
   * `SIGN_RESPONSE` (`background.ts`): el empuje del cuerpo al re-renderizar compite con la
   * respuesta de la decisión, y si la ventana recibe la respuesta después del empuje se queda con
   * la vista marcada como resuelta (botón «Aprobar» deshabilitado) aunque el cuerpo sea el de la
   * siguiente solicitud. Responder primero y re-empujar después cierra esa carrera (D-H4-E10).
   */
  refresh?: boolean;
}

/**
 * `4001` de un rechazo: el error que envía la ventana si lo trae y, si no, el literal ÚNICO de §4.3
 * para «operación cancelada por el usuario».
 */
const rejectionErrorOf = (message: Record<string, unknown>): Eip1193Error =>
  isEip1193Error(message.error) ? message.error : userRejectedError({ reason: 'approval-rejected' });

/**
 * Atiende `SIGN_RESPONSE { approvalId, success }` de `notification.html`.
 *
 * - Ruta emisora fuera de la allowlist → `handled: false`, `unauthorized` y NADA se resuelve.
 * - `success: true` → la entrada se resuelve `approved`, se entrega a quien esperaba (el router
 *   aplica después el efecto: firma y difusión) y la ventana pasa a la siguiente `pending`.
 * - `success: false` → `rejected` (o `expired` si el plazo ya venció), se entrega el `4001` a la
 *   dApp por M17 y la ventana pasa a la siguiente o se cierra. Es idempotente: una decisión
 *   duplicada no hace nada.
 */
export const handleSignResponse = async (
  message: unknown,
  sender: SenderLike,
  options: SignResponseOptions = {},
): Promise<SignResponseOutcome> => {
  const now = options.now ?? Date.now();
  const storage = options.storage;
  const record = asRecord(message);
  const approvalId = typeof record?.approvalId === 'string' ? record.approvalId : null;

  // 1. Allowlist de ruta (M20): el mensaje solo es admisible desde `notification.html`.
  const guard = guardResponseRoute('SIGN_RESPONSE', sender);
  if (!guard.ok) {
    return {
      handled: false,
      reason: 'ruta-no-autorizada',
      approvalId,
      status: null,
      delivery: 'unauthorized',
      refresh: null,
    };
  }
  if (approvalId === null || approvalId.length === 0) {
    return {
      handled: false,
      reason: 'sin-approvalId',
      approvalId: null,
      status: null,
      delivery: 'none',
      refresh: null,
    };
  }

  const success = record?.success === true;
  const resolved = await resolveApprovalRequest(
    approvalId,
    success ? 'approved' : 'rejected',
    { now, storage },
  );
  if (resolved === null) {
    // Respuesta duplicada o entrada ya resuelta (X-06): NO se firma, NO se difunde, NO se entrega.
    return {
      handled: false,
      reason: 'ya-resuelta',
      approvalId,
      status: null,
      delivery: 'already-resolved',
      refresh: null,
    };
  }

  // 2. Respuesta al solicitante (M17). En la aprobación la respuesta la produce el despacho
  //    (hash o firma), así que aquí NO se entrega: solo se registra el desenlace.
  let delivery: ApprovalDelivery | 'none' = 'none';
  if (resolved.status !== 'approved') {
    const error =
      resolved.status === 'expired'
        ? timeoutError(responseTimeoutSeconds())
        : rejectionErrorOf(record ?? {});
    delivery = await deliverApprovalResolution(resolved.request, { error });
  }

  await appendLogEntry(
    'approval_resolved',
    'event',
    resolved.status === 'approved' ? 'info' : 'warn',
    resolved.status === 'approved'
      ? 'Solicitud de aprobación aprobada por el usuario'
      : resolved.status === 'expired'
        ? 'Solicitud de aprobación vencida al llegar la decisión'
        : 'Solicitud de aprobación rechazada por el usuario',
    {
      approvalId,
      status: resolved.status,
      errorCode: resolved.status === 'approved' ? null : 4001,
      entrega: delivery,
    },
    {
      now,
      storage,
      origin: resolved.request.origin,
      method: resolved.request.method,
    },
  ).catch((error: unknown) => {
    console.warn('[truekeate] no se pudo trazar la resolución de la aprobación', error);
    return null;
  });

  // 3. La MISMA ventana pasa a la siguiente `pending` o se cierra (M18). El llamador de producción
  //    lo difiere a DESPUÉS de responder al emisor (`refresh: false`) para no correr por delante de
  //    la respuesta de la decisión; ver {@link SignResponseOptions.refresh}.
  let refresh: FocusOutcome | null = null;
  if (options.refresh !== false) {
    try {
      refresh = await showOldestPending({ now, storage });
    } catch (error) {
      console.warn('[truekeate] no se pudo re-renderizar la ventana única', error);
    }
  }

  return {
    handled: true,
    reason: resolved.status === 'approved' ? 'aprobada' : resolved.status,
    approvalId,
    status: resolved.status,
    delivery,
    refresh,
  };
};

/** ¿Es un mensaje `SIGN_RESPONSE` del protocolo? (sin mirar todavía la ruta emisora). */
export const isSignResponse = (message: unknown): boolean => {
  const record = asRecord(message);
  return isTruekeateMessageType(record?.type) && record?.type === 'SIGN_RESPONSE';
};

/**
 * ¿Venció la solicitud al llegar la decisión? Se expone porque la instrumentación de la respuesta
 * distingue «rechazada» de «vencida» sin volver a leer la cola.
 */
export const expiredOnArrival = (request: PendingRequest, now: number = Date.now()): boolean =>
  isExpired(request, now);

/** Plazo citado en el literal de vencimiento de §4.3 (120 s en producción). */
export const responseTimeoutSeconds = (): number => Math.round(SIGN_TIMEOUT_MS / 1000);
