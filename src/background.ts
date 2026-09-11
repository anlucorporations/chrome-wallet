/**
 * M2 — `src/background.ts`
 * Punto de entrada del Service Worker (ESM, `background.js` en `dist/`).
 *
 * Alcance de H1 (andamiaje): Service Worker MÍNIMO OPERATIVO. Al instalar y en cada
 * arranque:
 *   1. aplica `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`;
 *   2. escribe UNA entrada de log `sw_started` en `truekeate_logs`, respetando `logLimit`;
 *   3. ejecuta una reconciliación VACÍA (no hay cola persistida todavía) en < 1 s;
 *   4. registra el listener de `chrome.runtime.onConnect` del puerto `truekeate_approval`.
 *
 * Queda FUERA de H1: derivación HD, firmas, difusión, ventanas de aprobación y métodos RPC
 * funcionales. Por eso el arranque no llama al router para ninguna ruta de negocio.
 */

import { APPROVAL_PORT_NAME, logLimit } from './shared/constants';
import { STORAGE_KEYS, SCHEMA_VERSION } from './background/state/schema';
import { applyStorageAccessLevel } from './background/security/accessLevel';
import {
  unsupportedMethodError,
  userRejectedError,
} from './background/rpc/errors';
import type { LogEntry, LogLevel, LogEventName, LogCategory } from './shared/types';
import { isTruekeateMessageType } from './shared/protocol';

// ---------------------------------------------------------------------------
// Tipos mínimos de las APIs de extensión que usa el arranque
// ---------------------------------------------------------------------------

/** Superficie del puerto de larga vida que usa el SW. */
interface RuntimePortLike {
  name: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown, port: RuntimePortLike) => void): void };
  onDisconnect: { addListener(listener: (port: RuntimePortLike) => void): void };
}

/** Superficie de eventos de `chrome.runtime` que usa el arranque. */
interface RuntimeEventsLike {
  onInstalled: { addListener(listener: (details: unknown) => void): void };
  onStartup: { addListener(listener: () => void): void };
  onConnect: { addListener(listener: (port: RuntimePortLike) => void): void };
}

/** Superficie de `chrome.storage.local` que usa el arranque. */
interface StorageLocalLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
}

/** Registro del instante de arranque, para medir la cota de < 1 s de RNF-08. */
const bootStartedAt = Date.now();

// ---------------------------------------------------------------------------
// Utilidades de plataforma (sin `any`, tolerantes a entornos sin `chrome`)
// ---------------------------------------------------------------------------

/** Genera un identificador único para la entrada de log. */
const newId = (): string => {
  const cryptoApi: unknown = (globalThis as { crypto?: unknown }).crypto;
  if (typeof cryptoApi === 'object' && cryptoApi !== null) {
    const randomUUID = (cryptoApi as { randomUUID?: unknown }).randomUUID;
    if (typeof randomUUID === 'function') {
      return (randomUUID as () => string).call(cryptoApi);
    }
  }
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Devuelve `chrome.runtime` sin `any`, o `undefined` si no está disponible. */
const runtimeApi = (): RuntimeEventsLike | undefined => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return undefined;
  }
  const runtime: unknown = (chromeNs as { runtime?: unknown }).runtime;
  if (typeof runtime !== 'object' || runtime === null) {
    return undefined;
  }
  return runtime as RuntimeEventsLike;
};

/** Devuelve `chrome.storage.local` sin `any`, o `undefined` si no está disponible. */
const storageLocal = (): StorageLocalLike | undefined => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return undefined;
  }
  const storage: unknown = (chromeNs as { storage?: unknown }).storage;
  if (typeof storage !== 'object' || storage === null) {
    return undefined;
  }
  const local: unknown = (storage as { local?: unknown }).local;
  if (typeof local !== 'object' || local === null) {
    return undefined;
  }
  return local as StorageLocalLike;
};

// ---------------------------------------------------------------------------
// Log del arranque: UNA entrada `sw_started`, con retención FIFO
// ---------------------------------------------------------------------------

/** Construye la entrada de log del arranque. */
const buildLogEntry = (
  event: LogEventName,
  category: LogCategory,
  level: LogLevel,
  message: string,
  data: unknown,
): LogEntry => ({
  id: newId(),
  ts: Date.now(),
  level,
  category,
  event,
  message,
  origin: 'extension',
  method: '',
  data,
});

/**
 * Escribe la entrada `sw_started` en `truekeate_logs`.
 *
 * - Categoría `system`, nivel `info` (catálogo cerrado de 24 eventos, diccionario §2.11).
 * - Retención FIFO por `ts`: se descartan las entradas más antiguas al superar `logLimit`.
 * - `data` lleva la medición de `getBytesInUse()` y el tiempo de arranque (diagnóstico
 *   declarado en `diccionario_datos.md` §2.15); NO se persiste ningún contador propio.
 * - Si el almacén rechaza la escritura (cuota), el arranque NO se rompe: se avisa por
 *   consola. El tratamiento observable completo de la cuota es de H5 (ADT-14 / D-M).
 */
const writeStartupLog = async (): Promise<void> => {
  const local = storageLocal();
  if (local === undefined) {
    return;
  }
  const elapsedMs = Date.now() - bootStartedAt;
  let bytesInUse: number | null = null;
  try {
    bytesInUse = await local.getBytesInUse(null);
  } catch {
    bytesInUse = null;
  }

  const entry = buildLogEntry(
    'sw_started',
    'system',
    'info',
    'Service Worker arrancado',
    {
      bytesInUse,
      bootMs: elapsedMs,
      // Sin cola persistida en H1: la reconciliación procesa 0 entradas.
      pendingProcessed: 0,
      schemaVersion: SCHEMA_VERSION,
    },
  );

  try {
    const stored = await local.get(STORAGE_KEYS.logs);
    const current: unknown = stored[STORAGE_KEYS.logs];
    const entries: LogEntry[] = Array.isArray(current) ? (current as LogEntry[]) : [];
    entries.push(entry);
    // FIFO por `ts`: se conservan las `logLimit` entradas más recientes.
    const retained = entries.length > logLimit ? entries.slice(entries.length - logLimit) : entries;
    await local.set({ [STORAGE_KEYS.logs]: retained });
  } catch (error) {
    console.warn('[truekeate] no se pudo escribir la entrada sw_started', error);
  }
};

// ---------------------------------------------------------------------------
// Reconciliación vacía del arranque (H1) — la completa es de H2/H4 (M16)
// ---------------------------------------------------------------------------

/**
 * Reconciliación al arrancar. En H1 es VACÍA por diseño: no existe todavía cola
 * persistida, marca de «tx en vuelo» ni ventana de aprobación que reconstruir.
 *
 * Lo que SÍ garantiza ya:
 * - Se ejecuta en cada arranque (`onInstalled` + `onStartup`) y es idempotente.
 * - No usa `setTimeout` ni `setInterval` (prohibidos en el SW: no sobreviven a la
 *   suspensión; H-02/H-07/H-21).
 * - Deja el coste medido en `bootMs` de la entrada `sw_started` para verificar la cota
 *   de < 1 s con 50 pendientes que exige RNF-08 en H2.
 */
const runEmptyReconciliation = async (): Promise<void> => {
  const startedAt = Date.now();
  // H1: no hay estado que purgar, huérfanas que resolver ni `alarms` que rearmar.
  const processed = 0;
  const elapsed = Date.now() - startedAt;
  if (elapsed > 1_000) {
    console.warn('[truekeate] la reconciliación vacía superó 1 s:', elapsed);
  }
  void processed;
};

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/** Publica una respuesta de error EIP-1193 en el puerto (literales de M6, fuente única). */
const replyUnsupported = (port: RuntimePortLike, type: string): void => {
  try {
    port.postMessage({
      type: 'TRUEKEATE_RESPONSE',
      id: type,
      // El catálogo de H1 está vacío: toda petición por el puerto responde `4200`.
      error: unsupportedMethodError(),
    });
  } catch {
    // Puerto cerrado: nada que responder.
  }
};

/**
 * Registra el listener del puerto de larga vida `truekeate_approval`.
 *
 * El puerto es un CANAL de transporte y correlación, NO un *keep-alive*: el navegador
 * suspende el SW a los ~30 s de inactividad y el puerto se cierra con él (ADT-15/R16).
 * En H1 el SW solo acusa recibo: la cola persistida y el mensaje `RESUME` operativo
 * llegan en H4 (M17).
 */
const registerApprovalPortListener = (): void => {
  const runtime = runtimeApi();
  if (runtime === undefined || typeof runtime.onConnect?.addListener !== 'function') {
    return;
  }
  runtime.onConnect.addListener((port) => {
    if (port.name !== APPROVAL_PORT_NAME) {
      return;
    }
    port.onMessage.addListener((message) => {
      const type =
        typeof message === 'object' && message !== null
          ? (message as { type?: unknown }).type
          : undefined;
      if (isTruekeateMessageType(type) && type === 'RESUME') {
        // Sin cola persistida en H1: la solicitud no puede estar `pending`.
        try {
          port.postMessage({
            type: 'TRUEKEATE_RESPONSE',
            id: 'RESUME',
            error: userRejectedError({ via: 'approval-port', reason: 'no-pending-queue-h1' }),
          });
        } catch {
          // Puerto cerrado: nada que responder.
        }
        return;
      }
      // Cualquier otra petición por el puerto: el catálogo de H1 está vacío → 4200.
      replyUnsupported(port, typeof type === 'string' ? type : 'TRUEKEATE_RPC');
    });
    port.onDisconnect.addListener(() => {
      // Nada que limpiar: el estado volátil admisible de H1 es vacío.
    });
  });
};

/** Secuencia de arranque: acceso al almacén, reconciliación y log. */
const bootstrap = async (): Promise<void> => {
  await applyStorageAccessLevel();
  await runEmptyReconciliation();
  await writeStartupLog();
};

// El listener del puerto se registra de forma SÍNCRONA: si el SW se despierta por una
// conexión, el listener debe existir ya al final del primer ciclo de evaluación.
registerApprovalPortListener();

const runtime = runtimeApi();
if (runtime !== undefined) {
  if (typeof runtime.onInstalled?.addListener === 'function') {
    runtime.onInstalled.addListener(() => {
      void bootstrap();
    });
  }
  if (typeof runtime.onStartup?.addListener === 'function') {
    runtime.onStartup.addListener(() => {
      void bootstrap();
    });
  }
}

// Arranque inmediato (SW despertado por un evento, no por instalación ni por navegador).
void bootstrap();
