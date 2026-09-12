/**
 * M14.b — `src/background/approvals/decisions.ts`
 * Registro de ESPERA de la decisión de una solicitud de aprobación (H4, tareas 4.1 y 4.3).
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * La cola persistida (M14) es la ÚNICA fuente de verdad de la solicitud, pero la PETICIÓN que
 * espera la dApp (el `eth_sendTransaction`/`personal_sign`/… que el router tiene en vuelo) es un
 * `await` de proceso: MV3 admite suspender el Service Worker y `chrome.storage` no puede resolver
 * una promesa. Este módulo es el punto ÚNICO donde esa promesa se resuelve, y se apoya en la cola:
 *
 *   1. la ruta de producción REGISTRA un espera por `approvalId` antes de bloquearse;
 *   2. CUALQUIERA de las tres vías de cierre de la solicitud —`SIGN_RESPONSE { success }`
 *      (`notification.html`), el cierre de la ventana con la X (`focus.ts`) y el vencimiento por
 *      `chrome.alarms` (`timeout.ts`)— pasa por `resolveApprovalRequest` (M14);
 *   3. `resolveApprovalRequest` notifica el desenlace con {@link settleApprovalDecision}, que
 *      resuelve la espera y la retira.
 *
 * Con eso no hay duplicación: la lógica de «aprobar/rechazar/vencer» vive en M14/M15/M18 y este
 * módulo solo transporta el desenlace a la promesa que espera el router.
 *
 * ESTADO VOLÁTIL ADMISIBLE: el mapa de esperas es reconstruible (si el SW se suspende, la cola
 * persistida sigue siendo la verdad y la reconciliación del arranque entrega el `4001` de las
 * huérfanas). No es fuente de verdad y nunca se persiste.
 *
 * Requisitos: RF-37 y RF-41 (RNF-08).
 */

import type { Uuid } from '../../shared/types';
import type { ResolvedRequest } from './queue';

/** Desenlace de una solicitud de aprobación, tal y como lo ve quien espera la decisión. */
export type ApprovalDecision =
  | { ok: true; resolution: ResolvedRequest }
  | { ok: false; resolution: ResolvedRequest | null; reason: 'abandoned' };

/**
 * Esperas vivas por solicitud. Se usa una lista (y no un único resolutor) porque una misma
 * solicitud puede ser observada por más de un interesado —la propia petición en vuelo y una
 * prueba o reconciliación— y TODOS deben despertar con el mismo desenlace.
 */
const waitersByApprovalId = new Map<Uuid, Set<(decision: ApprovalDecision) => void>>();

/** Número de esperas vivas de una solicitud (diagnóstico y pruebas). */
export const countApprovalWaiters = (approvalId: Uuid): number =>
  waitersByApprovalId.get(approvalId)?.size ?? 0;

/** Número total de esperas vivas (diagnóstico y pruebas). */
export const totalApprovalWaiters = (): number =>
  [...waitersByApprovalId.values()].reduce((total, bucket) => total + bucket.size, 0);

/**
 * Registra la espera del desenlace de `approvalId` y devuelve la promesa más la función para
 * darse de baja.
 *
 * NO posee ningún plazo: el dueño del plazo es M15 (`chrome.alarms`), igual que en el resto del
 * Service Worker (prohibidos `setTimeout`/`setInterval` para plazos).
 */
export const waitForApprovalResolution = (
  approvalId: Uuid,
): { decision: Promise<ApprovalDecision>; cancel: () => void } => {
  let settle: ((decision: ApprovalDecision) => void) | null = null;
  const decision = new Promise<ApprovalDecision>((resolve) => {
    settle = resolve;
  });
  const listener = (value: ApprovalDecision): void => {
    settle?.(value);
  };
  const bucket = waitersByApprovalId.get(approvalId);
  if (bucket === undefined) {
    waitersByApprovalId.set(approvalId, new Set([listener]));
  } else {
    bucket.add(listener);
  }
  const cancel = (): void => {
    const current = waitersByApprovalId.get(approvalId);
    if (current === undefined) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      waitersByApprovalId.delete(approvalId);
    }
  };
  return { decision, cancel };
};

/**
 * Notifica el desenlace a TODAS las esperas de la solicitud y las retira.
 *
 * La llama `resolveApprovalRequest` (M14) en el mismo instante en que la entrada sale de la cola,
 * de modo que el espera nunca ve un estado intermedio: o recibe su desenlace o no había espera.
 * Es idempotente: repetirla sin esperas vivas no hace nada.
 */
export const settleApprovalDecision = (resolution: ResolvedRequest): void => {
  const approvalId = resolution.request.approvalId;
  const bucket = waitersByApprovalId.get(approvalId);
  if (bucket === undefined) {
    return;
  }
  waitersByApprovalId.delete(approvalId);
  for (const listener of bucket) {
    try {
      listener({ ok: true, resolution });
    } catch (error) {
      console.warn('[truekeate] una espera de aprobación falló al recibir su desenlace', error);
    }
  }
};

/**
 * Resuelve las esperas de una solicitud SIN desenlace (purga de la reconciliación, entrada
 * descartada). Quien esperaba recibe `abandoned` y decide: el router responde `4001`.
 */
export const abandonApprovalDecision = (approvalId: Uuid): void => {
  const bucket = waitersByApprovalId.get(approvalId);
  if (bucket === undefined) {
    return;
  }
  waitersByApprovalId.delete(approvalId);
  for (const listener of bucket) {
    try {
      listener({ ok: false, resolution: null, reason: 'abandoned' });
    } catch (error) {
      console.warn('[truekeate] una espera de aprobación falló al abandonarse', error);
    }
  }
};

/** Vacía el registro (pruebas y reconciliación). */
export const clearApprovalDecisions = (): void => {
  waitersByApprovalId.clear();
};
