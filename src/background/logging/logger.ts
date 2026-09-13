/**
 * M30 — `src/background/logging/logger.ts`
 * **Escritura de `truekeate_logs`, SIEMPRE desde el Service Worker, con exactamente 1 entrada por
 * evento del catálogo** (RNF-16) y el **modo de fallo observable** de la cuota de 10 MB (§2.15).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §3.6: fuente de verdad única del registro, «exactamente 1 entrada por
 *   evento del catálogo» con `ts`, `level`, `category`, `event`, `origin` y `data` redactado.
 * - `diccionario_datos.md` §2.11 (forma de la entrada y redacción), §2.10 (`logLimit = 500`,
 *   `logMaxPerOrigin = 200`) y §2.15 (cuota y fallo observable).
 * - `documento_tecnico.md` §4.4 (volumetría) y `plan_desarrollo.md` §3.5.5 tareas 5.6 y 5.8.
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Escritura exclusiva del SW**: este módulo es el ÚNICO que llama a `chrome.storage.local.set`
 *    sobre `truekeate_logs`; el popup solo lee (por `wallet_getLogs`, M3).
 * 2. **Exactamente 1 entrada por evento**: cada emisión produce UNA entrada con `id`, `ts`,
 *    `level`, `category`, `event`, `message`, `origin`, `method` y `data`. La variante por lotes
 *    escribe N entradas con UNA sola lectura y UNA sola escritura, sin fusionar ni omitir ninguna.
 * 3. **Catálogo cerrado** (M31): un `event` fuera del enum es un **error de programación** y se
 *    rechaza con `RangeError`; nunca se escribe una entrada con un evento inventado (RNF-16).
 * 4. **Redacción obligatoria** (M22): el `data` pasa SIEMPRE por el saneado de M22 (claves
 *    sensibles, firmas recortadas, frases BIP-39, payloads > 4096 bytes reducidos a hash +
 *    longitud). De un calldata solo llegan sus **primeros 10 bytes** + `dataLength`.
 * 5. **Retención FIFO** (M32): `logLimit = 500` global y `logMaxPerOrigin = 200` por origen.
 * 6. **Cuota observable** (M33 + §2.15): si `set` se rechaza por cuota, **1 reintento** tras
 *    aplicar la retención; si vuelve a fallar, se **descarta** la entrada (contador de descartes
 *    que se publica en `wallet_getLogs.dropped`), se avisa por consola y se intenta la entrada
 *    `storage_quota_exceeded` (`category: 'system'`, `level: 'error'`) con el `rpc_error`
 *    `code: -32603` y el mensaje «no se pudo guardar el registro por falta de espacio» en su
 *    `data`. El contador se persiste en `truekeate_logs_dropped` para sobrevivir a la suspensión
 *    del Service Worker. **Nunca un fallo silencioso** (riesgo R13).
 * 7. Sin `setTimeout`/`setInterval` (prohibidos en el SW): la serialización de escrituras usa un
 *    **cerrojo por encadenamiento de promesas**, el mismo patrón que M29.
 */

import type { LogCategory, LogEntry, LogEventName, LogLevel, Uuid } from '../../shared/types';
import { EXTENSION_ORIGIN, PREVIEW_INLINE_MAX_BYTES } from '../../shared/constants';
import {
  LOG_DROPPED_COUNTER_KEY,
  STORAGE_KEYS,
  getStorageLocal,
  isStorageQuotaError,
  readStorage,
  type StorageLocalLike,
} from '../state/schema';
import { internalError } from '../rpc/errors';
import { hashValue, redactLogData, DATA_PREVIEW_CHARS } from '../security/redaction';
import {
  LOG_EVENT_COUNT,
  LOG_EVENT_NAMES,
  isLogEventName,
  logEventDescription,
  placementForEntry,
} from './events';
import { planRetention, type RetentionLimits } from './retention';

/** Almacén reexportado: los llamadores no tienen que importar M33 solo por el tipo. */
export type { StorageLocalLike };

// ---------------------------------------------------------------------------
// Forma de la petición de log
// ---------------------------------------------------------------------------

/**
 * Petición de UNA entrada de log. `event` es el único campo obligatorio: el `level`, la
 * `category` y el `message` se resuelven con el catálogo (M31) si no se aportan.
 */
export interface LogRequest {
  /** Evento del catálogo cerrado de 24 (M31). */
  event: LogEventName;
  /**
   * Nivel deseado. Si se omite, se usa el del catálogo; si no coincide con ninguna variante
   * declarada, se conserva (el nivel es del llamador, la categoría es del catálogo).
   */
  level?: LogLevel;
  /**
   * Variante del catálogo que fija la pareja `(category, level)`. Es la vía explícita para los
   * casos en los que el mismo evento ocurre en otro contexto (p. ej. `rpc_error` del sistema).
   */
  variant?: string;
  /** Texto legible en español. Si falta, se usa el del catálogo. */
  message?: string;
  /** Origen normalizado de la dApp, o `extension` para los contextos de la extensión. */
  origin?: string;
  /** Método RPC implicado; cadena vacía si no aplica. */
  method?: string;
  /** Payload YA redactado por M22 (nunca íntegro). */
  data?: unknown;
  /** Hash de la transacción: rellena el campo de primer nivel que lee el panel (RF-31). */
  txHash?: string;
  txStatus?: LogEntry['txStatus'];
}

/** Entrada de log SIN `id` ni `ts`: lo que aporta el llamador (forma de H3/H4, conservada). */
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

/** Opciones de escritura: almacén, reloj y límites de retención inyectables. */
export interface WriteLogOptions {
  now?: number;
  storage?: StorageLocalLike | null;
  limits?: Partial<RetentionLimits>;
}

/** Opciones del atajo de una entrada (misma forma que en H3/H4). */
export interface AppendLogOptions extends WriteLogOptions {
  origin?: string;
  method?: string;
  txHash?: string;
}

// ---------------------------------------------------------------------------
// Contador de descartes por cuota (visible, §2.15 / R13)
// ---------------------------------------------------------------------------

/** Contabilidad del descarte por cuota, tal y como la publica {@link readLogDiagnostics}. */
export interface LogQuotaDiagnostics {
  /** Entradas descartadas por cuota desde el último reset de la cartera. */
  dropped: number;
  /** Escrituras que hubo que reintentar una vez tras la retención (§2.15 paso 1). */
  retries: number;
  /** Intentos de escritura observados (diagnóstico del ciclo de la cuota). */
  attempts: number;
}

/** Contabilidad en memoria del Service Worker (se reconstruye al arrancar). */
const diagnostics: LogQuotaDiagnostics = { dropped: 0, retries: 0, attempts: 0 };

/**
 * Últimos valores de `(dropped, retries)` YA persistidos.
 *
 * El contador solo se reescribe cuando CAMBIA: antes se escribía en `truekeate_logs_dropped` en
 * **cada** escritura de log, de modo que toda traza costaba DOS operaciones de almacén en lugar de
 * una. Medido en H5 con el E2E `29-sw-suspendido` (RNF-08: reconstrucción < 1 s): esa escritura
 * redundante —más el arranque del módulo de red— llevaba la reconstrucción a ~2 s en la suite
 * completa. `-1` significa «aún no persistido» y fuerza la primera escritura.
 */
let persistedDiagnostics: { dropped: number; retries: number } = { dropped: -1, retries: -1 };

/** ¿Es un contador persistido utilizable? */
const isCounter = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Reconstruye el contador de descartes desde `truekeate_logs_dropped` al arrancar el Service
 * Worker, de modo que el descarte sigue siendo visible tras una suspensión. Idempotente y sin
 * lanzar: un fallo de lectura deja el valor que hubiera en memoria.
 */
export const hydrateLogDiagnostics = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<LogQuotaDiagnostics> => {
  if (storage === null) {
    return { ...diagnostics };
  }
  try {
    const raw = await storage.get([LOG_DROPPED_COUNTER_KEY]);
    const value = raw?.[LOG_DROPPED_COUNTER_KEY];
    const record =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
    if (record !== null) {
      if (isCounter(record.dropped)) {
        diagnostics.dropped = record.dropped;
      }
      if (isCounter(record.retries)) {
        diagnostics.retries = record.retries;
      }
    }
  } catch (error) {
    console.warn('[truekeate] no se pudo leer el contador de descartes de log', error);
  }
  // Lo hidratado ES lo persistido: no hace falta reescribirlo en la primera traza del arranque.
  persistedDiagnostics = { dropped: diagnostics.dropped, retries: diagnostics.retries };
  return { ...diagnostics };
};

/** Contabilidad actual del descarte por cuota (copia, para que nadie la mute desde fuera). */
export const readLogDiagnostics = (): LogQuotaDiagnostics => ({ ...diagnostics });

/** Reinicia la contabilidad en memoria (uso EXCLUSIVO de las pruebas). */
export const resetLogDiagnostics = (): void => {
  diagnostics.dropped = 0;
  diagnostics.retries = 0;
  diagnostics.attempts = 0;
  persistedDiagnostics = { dropped: -1, retries: -1 };
};

/**
 * Persiste el contador de descartes sin poder romper la escritura del log.
 *
 * Solo escribe si los contadores CAMBIARON respecto a lo último persistido (o si nunca se
 * persistieron): el valor que sobrevive a la suspensión del SW es el último cambio, no una copia
 * idéntica en cada traza.
 */
const persistDiagnostics = async (storage: StorageLocalLike | null): Promise<void> => {
  if (storage === null) {
    return;
  }
  if (
    persistedDiagnostics.dropped === diagnostics.dropped &&
    persistedDiagnostics.retries === diagnostics.retries
  ) {
    return;
  }
  try {
    await storage.set({
      [LOG_DROPPED_COUNTER_KEY]: {
        dropped: diagnostics.dropped,
        retries: diagnostics.retries,
        updatedAt: Date.now(),
      },
    });
    persistedDiagnostics = { dropped: diagnostics.dropped, retries: diagnostics.retries };
  } catch {
    // El contador es diagnóstico: si no cabe en el almacén, el aviso por consola y el valor en
    // memoria siguen haciendo visible el descarte (§2.15: nunca un fallo silencioso).
  }
};

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/** Genera un identificador único de entrada de log (uuid v4 si el entorno lo permite). */
const newLogId = (): Uuid => {
  const cryptoApi: unknown = (globalThis as { crypto?: unknown }).crypto;
  if (typeof cryptoApi === 'object' && cryptoApi !== null) {
    const randomUUID = (cryptoApi as { randomUUID?: unknown }).randomUUID;
    if (typeof randomUUID === 'function') {
      return (randomUUID as () => string).call(cryptoApi);
    }
  }
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Normaliza el origen: texto no vacío o el origen lógico de la extensión. */
const normalizeOrigin = (origin: unknown): string =>
  typeof origin === 'string' && origin.length > 0 ? origin : EXTENSION_ORIGIN;

/**
 * Tamaño serializado de una lista de entradas. Es la cifra con la que se diagnostica la cuota.
 */
export const measureLogBytes = (entries: readonly LogEntry[]): number => {
  try {
    return JSON.stringify(entries).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/**
 * ¿Es `key` una clave de CALLDATA?
 *
 * La regla única de `diccionario_datos.md` §2.11 (ADT-12 / D-T) dice «cualquier `data` (calldata)
 * que se registre»: no solo el de `eth_sendTransaction`. Esta pasada la aplica a CUALQUIER
 * entrada y a cualquier profundidad, de modo que la cota de 10 bytes no dependa de que el
 * llamador haya pasado por `redactParams` (defensa en profundidad, RNF-09).
 *
 * DEFECTO MEDIDO Y CORREGIDO (fase 4): la lista era de IGUALDAD exacta (`data`/`calldata`/
 * `input`), así que `{ txData: CALLDATA }` o `{ inputData: CALLDATA }` —un parámetro extra
 * cualquiera de una lectura que responda OK— se persistían con el calldata COMPLETO, justo lo que
 * el propio comentario de arriba promete truncar. La lista sigue siendo cerrada (no cualquier clave
 * que acabe en `data`: `metadata` no es calldata), pero cubre las formas reales.
 */
const CALLDATA_KEY_PATTERN =
  /^(?:data|input|calldata|txdata|inputdata|rawdata|hexdata|bytedata|calldatahex|transactiondata)$/;

const isCalldataKey = (key: string): boolean =>
  CALLDATA_KEY_PATTERN.test(key.toLowerCase().replace(/[_\-\s]/g, ''));

/** ¿Tiene forma de cadena hexadecimal `0x…`? */
const looksLikeHex = (value: string): boolean => value.startsWith('0x');

/**
 * Recorte de los **primeros 10 bytes** de un calldata (regla única de ADT-12 / D-T).
 *
 * {@link DATA_PREVIEW_CHARS} se importa de M22: aquí no se declara ningún `22` mágico. La función
 * es IDEMPOTENTE: un calldata que ya viene recortado por `redactParams` (≤ `DATA_PREVIEW_CHARS`)
 * se deja tal cual, y si el objeto que lo contiene ya declara su `dataLength` se respeta —así la
 * doble pasada de saneado no degrada la longitud original a la del recorte—.
 */
const truncateCalldata = (value: string, declaredLength: unknown): string | { data: string; dataLength: number } =>
  value.length <= DATA_PREVIEW_CHARS
    ? value
    : {
        data: value.slice(0, DATA_PREVIEW_CHARS),
        dataLength: isDeclaredLength(declaredLength)
          ? declaredLength
          : Math.floor((value.length - 2) / 2),
      };

/** ¿Es una longitud declarada utilizable? */
const isDeclaredLength = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Recorre la estructura aplicando el recorte de calldata de M22 a cualquier profundidad. */
const truncateCalldataDeep = (value: unknown, key = '', depth = 0): unknown => {
  if (depth > 6) {
    return value;
  }
  if (typeof value === 'string') {
    return isCalldataKey(key) && looksLikeHex(value) ? truncateCalldata(value, undefined) : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => truncateCalldataDeep(entry, key, depth + 1));
  }
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const declared = source.dataLength;
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(source)) {
      result[childKey] =
        typeof childValue === 'string' && isCalldataKey(childKey) && looksLikeHex(childValue)
          ? truncateCalldata(childValue, declared)
          : truncateCalldataDeep(childValue, childKey, depth + 1);
    }
    return result;
  }
  return value;
};

/**
 * Saneado de ÚLTIMA INSTANCIA del `data` de una entrada de log (defensa en profundidad, RNF-09):
 * se aplica SIEMPRE, aunque el llamador ya haya redactado con M22.
 *
 * - el calldata de cualquier `data`/`input`/`calldata` se trunca a sus **primeros 10 bytes** más
 *   `dataLength` (regla única de ADT-12 / D-T: no existe ninguna variante de 4 bytes ni de payload
 *   íntegro);
 * - el resto pasa por la redacción de M22 (claves sensibles, firmas recortadas, frases BIP-39);
 * - un `data` textual por encima de `PREVIEW_INLINE_MAX_BYTES` (4096) se sustituye por
 *   `{ payloadHash, payloadBytes, truncated: true }`: en reposo **nunca** se guarda un payload
 *   íntegro (§3.9 / ADT-21 / D-L).
 */
export const sanitizeLogData = (data: unknown): unknown => {
  if (data === undefined) {
    return undefined;
  }
  const redacted = redactLogData(truncateCalldataDeep(data));
  if (typeof redacted === 'string' && redacted.length > PREVIEW_INLINE_MAX_BYTES) {
    return {
      payloadHash: hashValue(redacted),
      payloadBytes: redacted.length,
      truncated: true,
    };
  }
  return redacted;
};

/** Construye la entrada de log (UNA por evento) con la pareja `(category, level)` del catálogo. */
const buildEntry = (
  event: LogEventName,
  category: LogCategory,
  level: LogLevel,
  ts: number,
  message: string,
  origin: unknown,
  method: unknown,
  data: unknown,
  txHash?: string,
  txStatus?: LogEntry['txStatus'],
): LogEntry => {
  const entry: LogEntry = {
    id: newLogId(),
    ts,
    level,
    category,
    event,
    message,
    origin: normalizeOrigin(origin),
    method: typeof method === 'string' ? method : '',
    data,
  };
  if (typeof txHash === 'string') {
    entry.txHash = txHash as LogEntry['txHash'];
  }
  if (txStatus !== undefined) {
    entry.txStatus = txStatus;
  }
  return entry;
};

// ---------------------------------------------------------------------------
// Cerrojo de escritura: la observabilidad no puede perder entradas por concurrencia
// ---------------------------------------------------------------------------

let writeTail: Promise<unknown> = Promise.resolve();

/**
 * Serializa las escrituras de `truekeate_logs`. Sin él, dos eventos simultáneos podrían leer la
 * misma lista y la segunda escritura pisaría a la primera (pérdida de entradas = incumplimiento de
 * RNF-16). El encadenamiento avanza pase lo que pase: un fallo no bloquea las siguientes.
 */
const runSerialized = <T>(task: () => Promise<T>): Promise<T> => {
  const result = writeTail.then(task, task);
  writeTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

// ---------------------------------------------------------------------------
// Política de cuota (§2.15): 1 reintento tras la retención FIFO y descarte observable
// ---------------------------------------------------------------------------

/** Clasificación de un intento de escritura. */
type WriteOutcome = 'ok' | 'quota' | 'error' | 'unavailable';

/** Escribe un lote UNA sola vez, clasificando el fallo. */
const writeOnce = async (
  storage: StorageLocalLike | null,
  entries: readonly LogEntry[],
): Promise<WriteOutcome> => {
  if (storage === null) {
    return 'unavailable';
  }
  try {
    await storage.set({ [STORAGE_KEYS.logs]: [...entries] });
    return 'ok';
  } catch (error) {
    if (isStorageQuotaError(error)) {
      return 'quota';
    }
    console.warn('[truekeate] no se pudo escribir en truekeate_logs', error);
    return 'error';
  }
};

/**
 * Aplica el modo de fallo observable de §2.15 a una escritura de log:
 *
 * 1. si el `set` se rechaza por **cuota**, se aplica la retención FIFO ya calculada y se
 *    reintenta **una** vez (nunca un bucle de escritura), dejando constancia con `retried: true`;
 * 2. si el reintento vuelve a fallar, se **descarta** la entrada y se incrementa el contador de
 *    descartes (`dropped`), que es el que publica `wallet_getLogs` y el panel.
 *
 * `diagnostics.attempts` cuenta SOLO los intentos de la TRAZA (1, o 2 con el reintento): las
 * escrituras del contador de descartes no son reintentos de la entrada y no entran en la cuenta.
 */
const writeWithQuotaPolicy = async (
  storage: StorageLocalLike | null,
  planned: readonly LogEntry[],
): Promise<{ outcome: WriteOutcome; retried: boolean }> => {
  diagnostics.attempts += 1;
  const first = await writeOnce(storage, planned);
  if (first === 'ok') {
    return { outcome: 'ok', retried: false };
  }
  if (first !== 'quota') {
    return { outcome: first, retried: false };
  }

  // §2.15 paso 1: UN reintento inmediato tras la retención FIFO. La lista ya viene retenida por
  // M32; el reintento reescribe esa misma lista recortada (sin bucle de escritura).
  diagnostics.retries += 1;
  diagnostics.attempts += 1;
  const second = await writeOnce(storage, planned);
  if (second === 'ok') {
    return { outcome: 'ok', retried: true };
  }
  if (second === 'quota') {
    diagnostics.dropped += 1;
    console.warn('[truekeate] storage quota exceeded');
  }
  return { outcome: second, retried: true };
};

// ---------------------------------------------------------------------------
// API pública de escritura
// ---------------------------------------------------------------------------

/**
 * Escribe **UNA** entrada correspondiente a un evento del catálogo.
 *
 * Es el punto de entrada de H5: resuelve la pareja `(category, level)` con el catálogo (M31),
 * aplica el saneado de M22 y delega en {@link writeLogEntries} para que la retención, el cerrojo
 * y la política de cuota tengan UNA sola implementación.
 *
 * Un `event` fuera del catálogo lanza `RangeError`: es un **error de programación** (RNF-16).
 *
 * Devuelve la entrada del evento PEDIDO cuando quedó escrita; `null` si no se persistió —incluido
 * el descarte por cuota, en el que lo que sí se guarda es la entrada de diagnóstico
 * `storage_quota_exceeded`, que **no** se devuelve como si fuera la traza solicitada—.
 */
export const logEvent = async (
  request: LogRequest,
  options: WriteLogOptions = {},
): Promise<LogEntry | null> => {
  if (!isLogEventName(request.event)) {
    throw new RangeError(
      `[truekeate] «${String(request.event)}» no pertenece al catálogo cerrado de ${LOG_EVENT_COUNT} eventos (M31/RNF-16)`,
    );
  }
  const placement = placementForEntry(request.event, request.level ?? null, request.variant);
  const message =
    typeof request.message === 'string' && request.message.length > 0
      ? request.message
      : logEventDescription(request.event);
  const written = await writeLogEntries(
    [
      {
        event: request.event,
        category: placement.category,
        level: placement.level,
        message,
        data: request.data,
        ...(request.origin === undefined ? {} : { origin: request.origin }),
        ...(request.method === undefined ? {} : { method: request.method }),
        ...(request.txHash === undefined ? {} : { txHash: request.txHash }),
      },
    ],
    options,
  );
  // Solo cuenta como escrita la entrada del evento PEDIDO: si el descarte por cuota dejó en su
  // lugar la entrada de diagnóstico `storage_quota_exceeded`, la operación no se da por escrita.
  return written.find((entry) => entry.event === request.event) ?? null;
};

/**
 * Escribe **N** entradas (una por elemento) con UNA sola lectura y UNA sola escritura: es lo que
 * permite que la reconciliación deje su traza y la de cada huérfana sin pagar N ciclos de almacén
 * (cota de < 1 s de RNF-08).
 *
 * Devuelve las entradas REALMENTE persistidas: si el almacén rechaza la escritura y el descarte es
 * total, la lista vuelve vacía (es lo que consultan `reconcile` y el despacho para decidir si su
 * traza quedó escrita).
 */
export const writeLogEntries = async (
  items: readonly LogEntryInput[],
  options: WriteLogOptions = {},
): Promise<LogEntry[]> => {
  if (items.length === 0) {
    return [];
  }
  for (const item of items) {
    if (!isLogEventName(item.event)) {
      throw new RangeError(
        `[truekeate] «${String(item.event)}» no pertenece al catálogo cerrado de ${LOG_EVENT_COUNT} eventos (M31/RNF-16)`,
      );
    }
  }
  const storage = options.storage === undefined ? getStorageLocal() : options.storage;
  const now = options.now ?? Date.now();

  return runSerialized(async () => {
    const stored = await readStorage([STORAGE_KEYS.logs], storage);
    const current = stored[STORAGE_KEYS.logs];
    const previous: LogEntry[] = Array.isArray(current) ? (current as LogEntry[]) : [];
    const created: LogEntry[] = items.map((item) =>
      buildEntry(
        item.event,
        item.category,
        item.level,
        now,
        item.message,
        item.origin,
        item.method,
        sanitizeLogData(item.data),
        item.txHash,
      ),
    );

    const plan = planRetention([...previous, ...created], options.limits);
    const result = await writeWithQuotaPolicy(storage, plan.retained);
    if (result.outcome === 'ok') {
      await persistDiagnostics(storage);
      return created;
    }
    if (result.outcome === 'unavailable') {
      // Sin API de almacén (o inyectada a `null`): no hay cuota que agotar ni aviso que dar.
      return [];
    }
    // Rechazo real de la escritura. La entrada de diagnóstico `storage_quota_exceeded` solo se
    // produce cuando la CAUSA es la cuota (§2.15 / D-M): un fallo de plataforma no puede disfrazarse
    // de «almacenamiento lleno».
    if (result.outcome !== 'quota') {
      return [];
    }
    const diagnostic = await persistQuotaDiagnostic(
      storage,
      // Lo que se vuelve a escribir es el HISTÓRICO que ya estaba persistido —no el plan con las
      // entradas nuevas—: las entradas descartadas por cuota NO pueden colarse en el almacén por la
      // puerta de atrás de la escritura de diagnóstico (RNF-16 / §2.15).
      previous,
      created,
      options.limits,
      now,
      result.retried,
    );
    return diagnostic === null ? [] : [diagnostic];
  });
};

/**
 * Registra el descarte observable de §2.15 pasos 2 y 3: deja constancia del `rpc_error`
 * `code: -32603` con el mensaje «no se pudo guardar el registro por falta de espacio» e intenta
 * persistir la entrada `storage_quota_exceeded` (`category: 'system'`, `level: 'error'`).
 *
 * Lo que se reescribe es el **histórico ya persistido** (`history`) más la entrada de diagnóstico:
 * las entradas descartadas por cuota (`dropped`) NO se persisten —ni por esta vía—, de modo que el
 * almacén nunca queda con una traza que la API declaró descartada (RNF-16 / §2.15).
 *
 * El descarte NO puede quedar en silencio: aunque el almacén esté lleno, el aviso por consola, el
 * contador persistido (`truekeate_logs_dropped`) y el `dropped` de `wallet_getLogs` lo publican.
 * Devuelve la entrada persistida, o `null` si tampoco ella pudo guardarse.
 */
const persistQuotaDiagnostic = async (
  storage: StorageLocalLike | null,
  history: readonly LogEntry[],
  dropped: readonly LogEntry[],
  limits: Partial<RetentionLimits> | undefined,
  now: number,
  retried: boolean,
): Promise<LogEntry | null> => {
  const quotaError = internalError({ reason: 'log-write-dropped' });
  const droppedEntry = dropped[0] ?? null;
  const diagnostic = buildEntry(
    'storage_quota_exceeded',
    'system',
    'error',
    now,
    'No se pudo guardar el registro por falta de espacio',
    EXTENSION_ORIGIN,
    droppedEntry?.method ?? '',
    {
      // El `rpc_error` que exige §2.15 viaja con su código numérico en el `data` de esta entrada:
      // un mismo descarte produce UNA entrada observable, no dos.
      code: quotaError.code,
      message: 'no se pudo guardar el registro por falta de espacio',
      key: STORAGE_KEYS.logs,
      bytesInUse: await measureStorageBytes(storage),
      retried,
      droppedEvent: droppedEntry?.event ?? null,
      droppedCount: diagnostics.dropped,
      droppedOrigin: droppedEntry?.origin ?? null,
      droppedData: droppedEntry?.data ?? null,
    },
    droppedEntry?.txHash,
  );

  await persistDiagnostics(storage);
  if (storage === null) {
    return diagnostic;
  }
  const plan = planRetention([...history, diagnostic], limits);
  const outcome = await writeOnce(storage, plan.retained);
  return outcome === 'ok' ? diagnostic : null;
};

/** `getBytesInUse` del almacén sin lanzar: `null` cuando la API no lo expone. */
const measureStorageBytes = async (storage: StorageLocalLike | null): Promise<number | null> => {
  const getBytesInUse = (storage as { getBytesInUse?: unknown } | null)?.getBytesInUse;
  if (typeof getBytesInUse !== 'function') {
    return null;
  }
  try {
    const bytes = await (getBytesInUse as (keys?: string | string[] | null) => Promise<number>).call(
      storage,
      null,
    );
    return typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Compatibilidad con la forma de H3/H4 (`appendLogEntries` / `appendLogEntry`)
// ---------------------------------------------------------------------------

/** ¿Es un evento del catálogo? Se expone para las comprobaciones de los llamadores. */
export const isCatalogEvent = isLogEventName;

/**
 * Escribe VARIAS entradas. Es la forma que ya consumían M14/M15/M16/M18/M19.b en H3/H4; su
 * implementación es la de {@link writeLogEntries}, de modo que la retención, el cerrojo y la
 * política de cuota tienen UNA sola implementación (no hay dos caminos de escritura).
 */
export const appendLogEntries = writeLogEntries;

/**
 * Escribe **1** entrada con la forma de H4 (evento, categoría, nivel, mensaje, datos). La
 * categoría y el nivel declarados se ubican en el catálogo de M31.
 */
export const appendLogEntry = async (
  event: LogEventName,
  category: LogCategory,
  level: LogLevel,
  message: string,
  data: unknown,
  options: AppendLogOptions = {},
): Promise<LogEntry | null> => {
  const created = await writeLogEntries(
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

// ---------------------------------------------------------------------------
// Lectura (la consume `wallet_getLogs`, M3) y redacción de la vista
// ---------------------------------------------------------------------------

/** Lectura de `truekeate_logs` con el recorte que hace visible el descarte (M3 / tarea 5.9). */
export interface LogsView {
  /** Entradas retenidas, ordenadas por `ts` ascendente. */
  entries: LogEntry[];
  /** `true` cuando el recorte (retención o descarte por cuota) dejó entradas fuera. */
  truncated: boolean;
  /** Entradas descartadas por CUOTA (contador visible de §2.15 / R13). */
  dropped: number;
  /** Entradas descartadas por la retención FIFO en esta lectura. */
  trimmed: number;
}

/**
 * Proyecta el registro para el panel de actividad: entradas retenidas, `truncated` y el contador
 * de descartes por cuota. Es **lectura pura**: no escribe, no purga y no vuelve a sanear (el
 * `data` persistido YA es el redactado).
 */
export const readLogsView = async (
  options: { storage?: StorageLocalLike | null; limits?: Partial<RetentionLimits> } = {},
): Promise<LogsView> => {
  const storage = options.storage === undefined ? getStorageLocal() : options.storage;
  const stored = await readStorage([STORAGE_KEYS.logs], storage);
  const current = stored[STORAGE_KEYS.logs];
  const all: LogEntry[] = Array.isArray(current) ? (current as LogEntry[]) : [];
  const plan = planRetention(all, options.limits);
  return {
    entries: plan.retained,
    truncated: plan.truncated || diagnostics.dropped > 0,
    dropped: diagnostics.dropped,
    trimmed: plan.dropped,
  };
};

/** Los 24 nombres del catálogo, reexportados para que el panel y las pruebas tengan UNA fuente. */
export { LOG_EVENT_NAMES };

/** Número exacto de eventos del catálogo (24). */
export { LOG_EVENT_COUNT };
