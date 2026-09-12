/**
 * M32 — `src/background/logging/retention.ts`
 * Retención **FIFO por `ts`** de `truekeate_logs`: 500 entradas globales y 200 por origen.
 *
 * FUENTE NORMATIVA
 * - `diccionario_datos.md` §2.10 (`logLimit = 500`, `logMaxPerOrigin = 200`), §2.11 y §2.15: la
 *   retención es la **primera defensa** frente al agotamiento de la cuota de 10 MB.
 * - `documento_tecnico.md` §4.4 (volumetría) y §3.6 regla 5.
 * - `plan_desarrollo.md` §3.5.5 tarea 5.7.
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. Los límites viven en `truekeate_settings` (`logLimit`/`logMaxPerOrigin`, M29) y su valor
 *    normativo, en `shared/constants.ts`: aquí no se declara ningún número duplicado.
 * 2. El orden es **FIFO por `ts`**: se descartan siempre las entradas MÁS ANTIGUAS. Una entrada
 *    sin `ts` numérico se considera la más antigua (no puede bloquear la retención).
 * 3. El módulo es **PURO**: recibe una lista y devuelve la lista retenida más el informe de lo
 *    descartado. La escritura la hace M30 (`logger.ts`), que es el ÚNICO que toca el almacén.
 *
 * Requisitos: RF-32 (RNF-16).
 */

import type { LogEntry } from '../../shared/types';
import { logLimit, logMaxPerOrigin } from '../../shared/constants';

/** Recorte observable que la retención FIFO aplica a una lista de entradas. */
export interface RetentionPlan {
  /** Entradas que se conservan, ordenadas por `ts` ascendente. */
  retained: LogEntry[];
  /** Entradas descartadas por el límite GLOBAL. */
  droppedGlobal: number;
  /** Entradas descartadas por el límite POR ORIGEN. */
  droppedPerOrigin: number;
  /** Total de descartes (`droppedGlobal + droppedPerOrigin`). */
  dropped: number;
  /** `true` cuando algún límite obligó a descartar (`dropped > 0`). */
  truncated: boolean;
}

/** Límites EFECTIVOS de la retención (los de `truekeate_settings`, validados). */
export interface RetentionLimits {
  /** Máximo global de entradas retenidas: `logLimit = 500`. */
  global: number;
  /** Máximo de entradas retenidas por origen: `logMaxPerOrigin = 200`. */
  perOrigin: number;
}

/** Valor normativo de la retención global (500) y por origen (200). */
export const RETENTION_LIMITS: RetentionLimits = Object.freeze({
  global: logLimit,
  perOrigin: logMaxPerOrigin,
});

/** ¿Es `value` un límite utilizable (entero positivo)? */
const isLimit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Límites efectivos: los que aporta `truekeate_settings` si son válidos y, si no, los normativos.
 * Un ajuste corrupto **nunca** deja la retención sin límite (sería una vía directa al R13).
 */
export const effectiveLimits = (limits?: Partial<RetentionLimits>): RetentionLimits => ({
  global: isLimit(limits?.global) ? Math.floor(limits.global) : RETENTION_LIMITS.global,
  perOrigin: isLimit(limits?.perOrigin) ? Math.floor(limits.perOrigin) : RETENTION_LIMITS.perOrigin,
});

/** Marca temporal de ordenación: una entrada sin `ts` numérico es la MÁS antigua. */
const orderOf = (entry: LogEntry): number =>
  typeof entry.ts === 'number' && Number.isFinite(entry.ts) ? entry.ts : Number.NEGATIVE_INFINITY;

/** Origen de una entrada, normalizado a texto (`extension` cuando falta). */
const originOf = (entry: LogEntry): string =>
  typeof entry.origin === 'string' && entry.origin.length > 0 ? entry.origin : 'extension';

/**
 * Calcula la retención FIFO de una lista de entradas.
 *
 * Orden de aplicación (el del corpus, §2.11):
 * 1. se ordenan por `ts` ascendente (estable: a igualdad de `ts` se conserva el orden de llegada);
 * 2. se aplica el límite **global** (`logLimit = 500`): se descartan las más antiguas;
 * 3. se aplica el límite **por origen** (`logMaxPerOrigin = 200`) SOBRE lo que sobrevivió al paso
 *    anterior: de cada origen se conservan sus 200 entradas más recientes.
 *
 * Es **pura**: no muta la lista de entrada ni escribe nada.
 */
export const planRetention = (
  entries: readonly LogEntry[],
  limits?: Partial<RetentionLimits>,
): RetentionPlan => {
  const effective = effectiveLimits(limits);
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => orderOf(a.entry) - orderOf(b.entry) || a.index - b.index)
    .map((item) => item.entry);

  const afterGlobal =
    ordered.length > effective.global ? ordered.slice(ordered.length - effective.global) : [...ordered];
  const droppedGlobal = ordered.length - afterGlobal.length;

  // Límite por origen: se recorre de la más NUEVA a la más antigua para quedarse con las últimas
  // `perOrigin` de cada origen, y se reconstruye el orden cronológico al final.
  const perOriginSeen = new Map<string, number>();
  const keptNewestFirst: LogEntry[] = [];
  let droppedPerOrigin = 0;
  for (let index = afterGlobal.length - 1; index >= 0; index -= 1) {
    const entry = afterGlobal[index];
    if (entry === undefined) {
      continue;
    }
    const origin = originOf(entry);
    const seen = perOriginSeen.get(origin) ?? 0;
    if (seen >= effective.perOrigin) {
      droppedPerOrigin += 1;
      continue;
    }
    perOriginSeen.set(origin, seen + 1);
    keptNewestFirst.push(entry);
  }
  const retained = keptNewestFirst.reverse();

  return {
    retained,
    droppedGlobal,
    droppedPerOrigin,
    dropped: droppedGlobal + droppedPerOrigin,
    truncated: droppedGlobal + droppedPerOrigin > 0,
  };
};

/**
 * Aplica la retención FIFO a una lista de entradas y devuelve la lista RETENIDA.
 *
 * Atajo de {@link planRetention} para los llamadores que solo necesitan las entradas (M30 y las
 * pruebas de regresión de H2/H4, que ya usaban este comportamiento).
 */
export const applyRetention = (
  entries: readonly LogEntry[],
  limits?: Partial<RetentionLimits>,
): LogEntry[] => planRetention(entries, limits).retained;

/**
 * Une las entradas NUEVAS a las ya almacenadas y aplica la retención. Devuelve la lista que debe
 * persistirse y el informe del recorte, que es el que hace visible el descarte.
 */
export const mergeWithRetention = (
  stored: readonly LogEntry[],
  incoming: readonly LogEntry[],
  limits?: Partial<RetentionLimits>,
): RetentionPlan => planRetention([...stored, ...incoming], limits);
