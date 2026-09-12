/**
 * M50 (soporte) — `src/notification/firstSignature.ts`
 * Lectura del registro de actividad para decidir si la cartera **ya firmó** alguna vez, que es el
 * oráculo del aviso «antes de la primera firma» de RNF-23 (tarea 6.3 del plan §3.6.5).
 *
 * POR QUÉ SE LEE EL REGISTRO Y NO EL ALMACÉN
 * -----------------------------------------
 * La UI de la extensión tiene **prohibido** leer `chrome.storage` y prohibido importar módulos del
 * Service Worker (RNF-14): todo pasa por el canal `chrome.runtime` con un método del catálogo
 * cerrado de §5.1.1. `wallet_getLogs` es una **lectura interna** que ya consume el popup (M45) y
 * que `senderGuard` admite desde cualquier página de la extensión (`notification.html` incluida).
 *
 * El registro es la evidencia correcta por dos motivos:
 *   1. `sign_personal`, `sign_typed_data` y `tx_sent` solo se escriben **después** de una firma
 *      real, así que su ausencia significa «esta cartera no ha firmado nunca»;
 *   2. `truekeate_logs` **sobrevive al reset** de la cartera (RF-32), de modo que el aviso no
 *      reaparece cada vez que se vacía la wallet.
 *
 * FALLO AL LEER: NO SE BLOQUEA
 * ----------------------------
 * `readLogSignatures` devuelve `null` cuando el registro no se puede leer (canal ausente, SW
 * suspendido, error del catálogo). En ese caso {@link firstSignatureState} deja pasar la firma: el
 * aviso es una garantía **informativa** de RNF-23 y no puede convertirse en un bloqueo de la
 * operación por un fallo de la observabilidad. Cuando el registro se lee y está VACÍO, sí bloquea.
 */

import type { LogEntry } from '../shared/types';
import { yaFirmoAntes } from '../shared/i18n';
import { callInternal } from '../popup/walletRpc';
import type { LogsResponse } from '../popup/views/LogsView';

/** Eventos de firma ya vistos por la cartera, o `null` si el registro no se pudo leer. */
export type FirmaPrevia = boolean | null;

/**
 * Lee `wallet_getLogs` y decide si hay alguna firma previa.
 *
 * @returns `true` si el registro demuestra una firma anterior, `false` si se leyó y está limpio, y
 *          `null` si la lectura falló (el llamante decide; ver la cabecera del módulo).
 */
export async function readLogSignatures(): Promise<FirmaPrevia> {
  const response = await callInternal<LogsResponse>('wallet_getLogs');
  if (!response.ok) {
    return null;
  }
  const entries: readonly LogEntry[] = Array.isArray(response.result?.entries)
    ? response.result.entries
    : [];
  /**
   * La decisión NO mira solo el nombre del evento: `approval_resolved` se publica tanto al aprobar
   * como al rechazar y también para los métodos de red (que no firman nada). El `method` y el
   * `status` viven en sitios distintos de la entrada —`method` es un campo de primer nivel de
   * `LogEntry` y el `status` va dentro de `data`—, así que se pasan juntos al predicado compartido
   * de `src/shared/i18n.ts` (M66).
   */
  return yaFirmoAntes(
    entries.map((entry) => ({ evento: entry.event, metodo: entry.method, datos: entry.data })),
  );
}

/** ¿Debe mostrarse el aviso de primera firma y, con él, bloquear «Aprobar»? */
export interface FirstSignatureState {
  /** `true` solo cuando el registro se leyó y NO contiene ninguna firma anterior. */
  visible: boolean;
  /** `true` cuando el acuse es obligatorio para poder aprobar (siempre que el aviso se muestre). */
  blocking: boolean;
}

/**
 * Estado del aviso a partir del resultado de {@link readLogSignatures}. Se mantiene como función
 * pura para poder probarla con los tres casos (primera vez, ya firmó, lectura fallida) sin navegador.
 */
export const firstSignatureState = (firmaPrevia: FirmaPrevia): FirstSignatureState =>
  firmaPrevia === false ? { visible: true, blocking: true } : { visible: false, blocking: false };
