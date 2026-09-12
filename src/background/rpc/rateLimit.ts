/**
 * M3.b — `src/background/rpc/rateLimit.ts`
 * *Token bucket* por origen de TODO el catálogo RPC, persistido en `truekeate_rate_windows`
 * (H3, tarea 3.13; `diccionario_datos.md` §2.13 y `documento_tecnico.md` §2.3, invariante
 * «*Token bucket* de todo el catálogo»).
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Ventana de 6 solicitudes / 60 s por origen** (`rateLimitWindowRequests` /
 *    `rateLimitWindowMs`) que cubre **TODO** el catálogo, incluidas las lecturas: una dApp hostil
 *    ya no puede saturar `eth_getBalance`, `eth_estimateGas` o `eth_blockNumber`.
 * 2. **Persistido**: el estado vive en `truekeate_rate_windows`, así que **sobrevive a la
 *    suspensión del SW** (el bucket no nace lleno tras cada suspensión).
 * 3. **Sin abrir ventana**: al exceder se responde `4001` con el literal de §4.3, sin ejecutar la
 *    llamada al nodo, sin crear entrada en la cola y sin tocar el badge.
 * 4. **Exención declarada**: los contextos de la propia extensión (`origin === 'extension'`) NO
 *    consumen tokens; el *polling* de saldos del popup agotaría el bucket en un ciclo (§2.13).
 * 5. **Escritura diferida**: los métodos no aprobables persisten con `RATE_PERSIST_DEBOUNCE_MS`
 *    (máximo 1 escritura por segundo y origen). El `flush` de la suspensión del SW es de la
 *    reconciliación de H4.
 *
 * La DECISIÓN es una función PURA (`consumeRateWindow`) y la persistencia está inyectada: las
 * pruebas fijan el reloj y observan la ventana sin depender de `chrome.storage`.
 *
 * Requisitos: RF-28 (RNF-16).
 */

import type { RateWindow, RateWindowsByOrigin } from '../../shared/types';
import {
  EXTENSION_ORIGIN,
  RATE_PERSIST_DEBOUNCE_MS,
  RATE_WINDOW_MS,
  rateLimitWindowRequests,
  rateWindowTtlMs,
} from '../../shared/constants';
import { STORAGE_KEYS, readStorage, writeStorage, type StorageLocalLike } from '../state/schema';
import { normalizeOrigin } from '../security/senderGuard';

/** Ventana por defecto (origen sin historial): llena y con la ventana recién abierta. */
export const freshRateWindow = (now: number): RateWindow => ({
  tokens: rateLimitWindowRequests,
  lastRefillAt: now,
  approvalWindowStart: now,
  approvalsInWindow: 0,
  deniedCount: 0,
  updatedAt: now,
});

/** ¿Es un objeto plano utilizable como ventana de tasa? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Proyecta una entrada de `truekeate_rate_windows`; `null` si no es utilizable. */
const asRateWindow = (value: unknown): RateWindow | null => {
  if (!isRecord(value) || typeof value.tokens !== 'number') {
    return null;
  }
  return {
    tokens: value.tokens,
    lastRefillAt: typeof value.lastRefillAt === 'number' ? value.lastRefillAt : 0,
    approvalWindowStart:
      typeof value.approvalWindowStart === 'number' ? value.approvalWindowStart : 0,
    approvalsInWindow:
      typeof value.approvalsInWindow === 'number' ? value.approvalsInWindow : 0,
    deniedCount: typeof value.deniedCount === 'number' ? value.deniedCount : 0,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  };
};

/** Proyecta el mapa completo `truekeate_rate_windows`. */
export const readRateWindowsFromSnapshot = (
  snapshot: Record<string, unknown>,
): RateWindowsByOrigin => {
  const raw = snapshot[STORAGE_KEYS.rateWindows];
  if (!isRecord(raw)) {
    return {};
  }
  const windows: RateWindowsByOrigin = {};
  for (const [origin, value] of Object.entries(raw)) {
    const window = asRateWindow(value);
    if (window !== null) {
      windows[origin] = window;
    }
  }
  return windows;
};

/** Lee `truekeate_rate_windows` del almacén. */
export const readRateWindows = async (
  storage: StorageLocalLike | null | undefined = undefined,
): Promise<RateWindowsByOrigin> =>
  readRateWindowsFromSnapshot(await readStorage([STORAGE_KEYS.rateWindows], storage));

/** ¿Está el origen exento del bucket? Solo los contextos de la propia extensión (§2.13). */
export const isRateLimitExempt = (origin: string): boolean => origin === EXTENSION_ORIGIN;

/** Resultado de una decisión de tasa. */
export interface RateLimitDecision {
  allowed: boolean;
  /** Ventana resultante (con `tokens` ya decrementado o con el rechazo contabilizado). */
  window: RateWindow;
  /** `true` cuando la ventana resultante difiere de la leída (hay que persistirla). */
  changed: boolean;
}

/**
 * Normaliza una ventana leída: recarga la ventana si venció, reinicia un reloj en el futuro
 * (reloj movido hacia atrás: §2.13 paso 3) y acota los tokens a la capacidad.
 */
export const normalizeRateWindow = (
  stored: RateWindow | null | undefined,
  now: number,
): RateWindow => {
  if (stored === null || stored === undefined) {
    return freshRateWindow(now);
  }
  // Reloj movido hacia atrás: la entrada se reinicia por completo (§2.13).
  if (stored.lastRefillAt > now || stored.approvalWindowStart > now) {
    return freshRateWindow(now);
  }
  if (now - stored.approvalWindowStart >= RATE_WINDOW_MS) {
    return { ...stored, tokens: rateLimitWindowRequests, approvalWindowStart: now };
  }
  return { ...stored, tokens: Math.min(stored.tokens, rateLimitWindowRequests) };
};

/**
 * DECISIÓN PURA: aplica la ventana de 6/60 s al origen y devuelve la ventana resultante.
 *
 * - Dentro de la ventana: consume 1 token; con `tokens <= 0` la llamada se RECHAZA y solo se
 *   incrementa `deniedCount` (diagnóstico; no se ejecuta la llamada al nodo).
 * - Fuera de la ventana (`now - approvalWindowStart >= 60 s`): la ventana se reinicia y la llamada
 *   consume el primer token de la nueva ventana.
 */
export const consumeRateWindow = (
  stored: RateWindow | null | undefined,
  now: number,
): RateLimitDecision => {
  const base = normalizeRateWindow(stored, now);
  // La ventana se reinicia cuando no había historial, cuando venció o cuando el reloj iba por
  // detrás (`approvalWindowStart`/`lastRefillAt` en el futuro).
  const reset =
    stored === null ||
    stored === undefined ||
    now - stored.approvalWindowStart >= RATE_WINDOW_MS ||
    stored.approvalWindowStart > now ||
    stored.lastRefillAt > now;
  if (base.tokens <= 0) {
    return {
      allowed: false,
      window: { ...base, deniedCount: base.deniedCount + 1, updatedAt: now },
      changed: true,
    };
  }
  return {
    allowed: true,
    window: {
      ...base,
      tokens: base.tokens - 1,
      approvalsInWindow: reset ? 1 : base.approvalsInWindow + 1,
      updatedAt: now,
    },
    changed: true,
  };
};

/** Opciones de la decisión con persistencia (todas inyectables para las pruebas). */
export interface RateLimitOptions {
  storage?: StorageLocalLike | null;
  /** Origen de la llamada (se normaliza antes de usarlo como clave). */
  origin: string;
  now?: number;
  /** Escritura inmediata (las pruebas la sustituyen por un espía). */
  persist?: (origin: string, window: RateWindow) => Promise<void>;
  /** Lectura de la ventana (las pruebas la sustituyen por un doble). */
  load?: (origin: string) => Promise<RateWindow | null>;
}

/** Decisión por defecto: lee y escribe `truekeate_rate_windows` con M33. */
export const createStoragePersistence = (
  storage: StorageLocalLike | null | undefined,
): {
  persist: (origin: string, window: RateWindow) => Promise<void>;
  load: (origin: string) => Promise<RateWindow | null>;
} => ({
  load: async (origin: string) => {
    const windows = await readRateWindows(storage);
    return windows[origin] ?? null;
  },
  persist: async (origin: string, window: RateWindow) => {
    const windows = await readRateWindows(storage);
    await writeStorage({ [STORAGE_KEYS.rateWindows]: { ...windows, [origin]: window } }, storage);
  },
});

/**
 * Decide si una invocación de página puede ejecutarse y persiste la ventana resultante.
 *
 * Devuelve `allowed: false` cuando la ventana de 6/60 s está agotada: el router responde `4001`
 * **sin abrir ventana** y sin ejecutar la llamada al nodo. Los contextos de la extensión están
 * exentos y no escriben nada.
 */
export const decideRateLimit = async (options: RateLimitOptions): Promise<RateLimitDecision> => {
  const key = normalizeOrigin(options.origin);
  const now = options.now ?? Date.now();
  if (key === null || isRateLimitExempt(key)) {
    return { allowed: true, window: freshRateWindow(now), changed: false };
  }
  const storagePersistence = createStoragePersistence(options.storage);
  const load = options.load ?? storagePersistence.load;
  const persist = options.persist ?? storagePersistence.persist;

  const current = await load(key);
  const decision = consumeRateWindow(current, now);
  if (decision.changed) {
    await persist(key, decision.window);
  }
  return decision;
};

/**
 * Purga las entradas inactivas (`now - updatedAt > rateWindowTtlMs`: 10 min sin uso equivalen a
 * bucket lleno) y reinicia las que tengan el reloj en el futuro. La llama la reconciliación del
 * arranque (`documento_tecnico.md` §3.4 paso 6 y §2.13).
 *
 * Devuelve cuántas entradas se descartaron y cuántas se reiniciaron.
 */
export const reconcileRateWindows = async (
  options: { storage?: StorageLocalLike | null; now?: number } = {},
): Promise<{ purged: number; reset: number; retained: number }> => {
  const now = options.now ?? Date.now();
  const windows = await readRateWindows(options.storage);
  const next: RateWindowsByOrigin = {};
  let purged = 0;
  let reset = 0;
  for (const [origin, window] of Object.entries(windows)) {
    if (now - window.updatedAt > rateWindowTtlMs) {
      purged += 1;
      continue;
    }
    if (window.lastRefillAt > now || window.approvalWindowStart > now) {
      next[origin] = freshRateWindow(now);
      reset += 1;
      continue;
    }
    next[origin] = window;
  }
  if (purged > 0 || reset > 0) {
    await writeStorage({ [STORAGE_KEYS.rateWindows]: next }, options.storage);
  }
  return { purged, reset, retained: Object.keys(next).length };
};

/** *Debounce* normativo de la escritura de la ventana de tasa (máximo 1/s y origen). */
export const RATE_LIMIT_PERSIST_DEBOUNCE_MS = RATE_PERSIST_DEBOUNCE_MS;
