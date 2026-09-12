/**
 * M2 — `src/background.ts`
 * Punto de entrada del Service Worker (ESM, `background.js` en `dist/`).
 *
 * ORDEN DE ARRANQUE (H2, invariante de `documento_tecnico.md` §2.3 y `plan_desarrollo.md`
 * §3.2.5 tareas 2.10, 2.11, 2.12, 2.13 y 2.15). En cada arranque, y en menos de 1 s:
 *
 *   1. `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` (M21): lo
 *      PRIMERO, para que ningún content script pueda leer `truekeate_mnemonic` ni las claves.
 *   2. **Migraciones** de esquema (M34) v1.2 → v1.4, antes de leer ningún estado.
 *   3. **Integridad** (M13): checksum BIP-39 y EIP-55; puede dejar la cartera «dañada» sin
 *      derivar nada de forma silenciosa.
 *   4. **Auto-carga** del estado: cuenta activa, red, importadas, etiquetas y sesiones se
 *      reconstruyen desde `chrome.storage.local` (claves canónicas de M33) sin pedir la frase.
 *   5. **Reconciliación de plazos**: VACÍA en H2 (la cola persistida y `chrome.alarms` llegan
 *      con M16 en H4). Nunca usa `setTimeout`/`setInterval` (prohibidos en el SW).
 *   6. **UNA sola entrada de log `sw_started`** por arranque, con `bytesInUse` y `bootMs`.
 *
 * CANALES QUE REGISTRA (de forma SÍNCRONA, antes del primer `await`):
 *   - `chrome.runtime.onConnect`: puerto de larga vida `truekeate_approval` (H1, intacto).
 *   - `chrome.runtime.onMessage`: `TRUEKEATE_RPC` → router (M3). Los métodos internos
 *     `wallet_*` se despachan en H2; los públicos EIP-1193 responden `4200` hasta H3/H4/H5.
 *
 * Queda FUERA de H2: derivación desde la UI de firma, firmas, difusión, ventanas de aprobación,
 * polling de saldos y log de actividad (solo se escriben `sw_started`, y `sw_reconcile` a
 * partir de H4).
 */

import { logLimit } from './shared/constants';
import { STORAGE_KEYS, SCHEMA_VERSION, readStorage } from './background/state/schema';
import { applyStorageAccessLevel } from './background/security/accessLevel';
import { internalError } from './background/rpc/errors';
import { handleRpcMessage, type RpcResponse, type RoutedMessage } from './background/rpc/router';
import { seedDefaultNetwork } from './background/networks/catalog';
import { applyConnectResponse, clearPendingConnects } from './background/connections';
import { runMigrations } from './background/state/migrations';
import { checkWalletIntegrity } from './background/crypto/integrity';
import { isTruekeateMessageType } from './shared/protocol';
// H4 (M15/M16/M17/M18): dueño del plazo, reconciliación al arrancar, puerto de larga vida y ventana
// de decisión global única. Se importan por sus puntos de entrada públicos.
import { registerApprovalPortListener } from './background/approvals/ports';
import { registerExpiryAlarmListener } from './background/approvals/timeout';
import { registerApprovalWindowListeners } from './background/approvals/focus';
import { handleSignResponse } from './background/approvals/responses';
import { reconcileApprovals, releaseInflightOnAlarm } from './background/approvals/reconcile';
import type {
  LogEntry,
  LogLevel,
  LogEventName,
  LogCategory,
} from './shared/types';
import type { SenderLike } from './background/security/senderGuard';
import type { ResponseTarget } from './background/security/senderGuard';

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

/** Emisor que entrega `chrome.runtime` en `onMessage` (datos NO fiables salvo `id`). */
interface SenderLikeRaw {
  id?: unknown;
  origin?: unknown;
  url?: unknown;
  tab?: unknown;
  frameId?: unknown;
}

/** Superficie de eventos de `chrome.runtime` que usa el arranque. */
interface RuntimeEventsLike {
  onInstalled: { addListener(listener: (details: unknown) => void): void };
  onStartup: { addListener(listener: () => void): void };
  onConnect: { addListener(listener: (port: RuntimePortLike) => void): void };
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: SenderLikeRaw,
        sendResponse: (response?: unknown) => void,
      ) => unknown,
    ): void;
  };
}

/** Superficie de `chrome.storage.local` que usa el arranque. */
interface StorageLocalLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
}

/**
 * Superficie de `chrome.tabs` que usa el arranque (H3): entregar la respuesta de una lectura de
 * página a su pestaña y, con `frameId !== 0`, SOLO a ese frame (DEC-40/ADT-07).
 */
interface TabsMessagingLike {
  sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
}

/** Devuelve `chrome.tabs` sin `any`, o `null` si la API no está disponible. */
const tabsMessaging = (): TabsMessagingLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const tabs: unknown = (chromeNs as { tabs?: unknown }).tabs;
  if (typeof tabs !== 'object' || tabs === null) {
    return null;
  }
  const candidate = tabs as { sendMessage?: unknown };
  if (typeof candidate.sendMessage !== 'function') {
    return null;
  }
  return tabs as TabsMessagingLike;
};

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

/** ¿Es un objeto plano utilizable como mensaje? */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Convierte el emisor de `chrome.runtime` en la forma que consume la guarda (M20).
 * Solo se copian los campos; el `origin` seguirá siendo dato NO fiable y M20 lo recalcula.
 */
const toSenderLike = (raw: unknown): SenderLike => {
  const sender = asRecord(raw) ?? {};
  const tab = asRecord(sender.tab);
  return {
    id: typeof sender.id === 'string' ? sender.id : undefined,
    origin: typeof sender.origin === 'string' ? sender.origin : undefined,
    url: typeof sender.url === 'string' ? sender.url : undefined,
    tab: tab === null || typeof tab.id !== 'number' ? undefined : { id: tab.id },
    frameId: typeof sender.frameId === 'number' ? sender.frameId : undefined,
  };
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

/** Informe de migración de esquema (M34), normalizado sin depender de su tipo exacto. */
export interface MigrationSnapshot {
  ok: boolean;
  from: string;
  to: string;
  migrated: boolean;
}

/** Informe de integridad (M13), resumido para el arranque y la traza. */
export interface IntegritySnapshot {
  /** `true` cuando la cartera NO está dañada (`status !== 'damaged'`). */
  ok: boolean;
  /** `'absent'` (sin cartera), `'ok'` o `'damaged'` (M13). */
  status: string;
  /** Motivos, en texto; nunca material de la cartera. */
  problems: string[];
}

/** Estado auto-cargado al arrancar (restauración sin pedir la frase, CA-RF-09/CA-RF-10). */
export interface AutoLoadedState {
  hasMnemonic: boolean;
  accountCount: number;
  currentAccount: string | null;
  chainId: string;
  networkCount: number;
  importedCount: number;
  visibleImportedCount: number;
  labelCount: number;
  sessionCount: number;
}

/** Instantánea del arranque, en memoria (estado VOLÁTIL admisible: es reconstruible). */
export interface BootSnapshot {
  startedAt: number;
  bootMs: number;
  schemaVersion: string;
  migration: MigrationSnapshot;
  integrity: IntegritySnapshot;
  autoLoaded: AutoLoadedState;
  reconciliation: ReconciliationSnapshot;
}

/** Estado de arranque reconstruido en cada despertar del SW. */
let bootSnapshot: BootSnapshot | null = null;

/** Instantánea del último arranque (`null` antes de completarlo). */
export const getBootSnapshot = (): BootSnapshot | null => bootSnapshot;

/** ¿Dejó la comprobación de integridad la cartera en estado «dañada»? */
export const isWalletDamaged = (): boolean =>
  bootSnapshot !== null && !bootSnapshot.integrity.ok;

/**
 * Escribe la entrada `sw_started` en `truekeate_logs`.
 *
 * - Categoría `system`, nivel `info` (catálogo cerrado de 24 eventos, diccionario §2.11).
 * - Retención FIFO por `ts`: se descartan las entradas más antiguas al superar `logLimit`.
 * - `data` lleva la medición de `getBytesInUse()`, el tiempo de arranque y el resumen de las
 *   fases de H2 (diagnóstico de §2.15); NO se persiste ningún contador propio.
 * - Si el almacén rechaza la escritura (cuota), el arranque NO se rompe: se avisa por consola.
 *   El tratamiento observable completo de la cuota es de H5 (ADT-14 / D-M).
 */
const writeStartupLog = async (snapshot: BootSnapshot): Promise<void> => {
  const local = storageLocal();
  if (local === undefined) {
    return;
  }
  let bytesInUse: number | null = null;
  try {
    bytesInUse = await local.getBytesInUse(null);
  } catch {
    bytesInUse = null;
  }

  const entry = buildLogEntry('sw_started', 'system', 'info', 'Service Worker arrancado', {
    bytesInUse,
    bootMs: snapshot.bootMs,
    schemaVersion: snapshot.schemaVersion,
    migrations: snapshot.migration,
    integrity: { ok: snapshot.integrity.ok, status: snapshot.integrity.status },
    autoLoaded: snapshot.autoLoaded,
    // Sin cola persistida en H2: la reconciliación procesa 0 entradas.
    pendingProcessed: snapshot.reconciliation.pendingProcessed,
  });

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
// Fases del arranque
// ---------------------------------------------------------------------------

/** Normaliza el informe de M34 sin depender de su tipo exacto. */
const asMigrationSnapshot = (value: unknown): MigrationSnapshot => {
  const record = asRecord(value);
  return {
    ok: record?.ok !== false,
    from: typeof record?.from === 'string' ? record.from : SCHEMA_VERSION,
    to: typeof record?.to === 'string' ? record.to : SCHEMA_VERSION,
    migrated: record?.migrated === true,
  };
};

/**
 * Normaliza el `WalletIntegrityReport` de M13 al resumen del arranque.
 *
 * `status` es la fuente de verdad: `'damaged'` deja la cartera dañada («Wallet dañada»),
 * `'absent'` (sin cartera todavía) y `'ok'` son estados SANOS. Los `issues` se reducen a sus
 * mensajes, que son los que se trazan; nunca se vuelca material de la cartera.
 */
const asIntegritySnapshot = (value: unknown): IntegritySnapshot => {
  const record = asRecord(value);
  const status = typeof record?.status === 'string' ? record.status : 'ok';
  const issues: unknown = record?.issues;
  const problems = Array.isArray(issues)
    ? issues
        .map((issue) => {
          const entry = asRecord(issue);
          const message = entry?.message;
          const code = entry?.code;
          if (typeof message !== 'string') {
            return null;
          }
          return typeof code === 'string' ? `${code}: ${message}` : message;
        })
        .filter((problem): problem is string => problem !== null)
    : [];
  return { ok: status !== 'damaged', status, problems };
};

/**
 * Fase 2 — migraciones de esquema (M34). Un fallo NO interrumpe el arranque: se registra como
 * migración no aplicada y el estado se lee tal cual está.
 */
const runMigrationsPhase = async (): Promise<MigrationSnapshot> => {
  try {
    return asMigrationSnapshot(await runMigrations());
  } catch (error) {
    console.warn('[truekeate] la migración de esquema falló; se continúa con el estado actual', error);
    return { ok: false, from: SCHEMA_VERSION, to: SCHEMA_VERSION, migrated: false };
  }
};

/**
 * Fase 3 — integridad al arrancar (M13). Un checksum BIP-39 roto o una dirección con EIP-55
 * inválido dejan la cartera «dañada»: el SW sigue operativo, NO deriva nada en silencio y la
 * instantánea del arranque conserva el estado «dañada» para la UI (RNF-22).
 */
const runIntegrityPhase = async (): Promise<IntegritySnapshot> => {
  try {
    const report = asIntegritySnapshot(await checkWalletIntegrity());
    if (!report.ok) {
      // Aviso (no error) y sin volcar material sensible: solo los motivos.
      console.warn('[truekeate] cartera dañada:', report.problems.join(' | '));
    }
    return report;
  } catch (error) {
    console.warn('[truekeate] la comprobación de integridad falló', error);
    return { ok: false, status: 'damaged', problems: ['integrity-check-failed'] };
  }
};

/** Lectura defensiva de una clave canónica. */
const readValue = (stored: Record<string, unknown>, key: string): unknown => stored[key];

/** Cuenta las entradas de un mapa persistido sin `any`. */
const countEntries = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.length;
  }
  const record = asRecord(value);
  return record === null ? 0 : Object.keys(record).length;
};

/**
 * Fase 4 — auto-carga del estado (M33/M28/M29). Una sola lectura de las claves canónicas
 * reconstruye cuenta activa, red, importadas, etiquetas y sesiones: es el equivalente
 * RESTAURADO de la creación y no pide la frase (`CA-RF-09`/`CA-RF-10`).
 *
 * La lectura la hace `readStorage` de M33 (una sola implementación de `chrome.storage.local`),
 * que nunca lanza: ante un fallo de la API se arranca con el estado inicial.
 */
const autoLoadStatePhase = async (): Promise<AutoLoadedState> => {
  const empty: AutoLoadedState = {
    hasMnemonic: false,
    accountCount: 0,
    currentAccount: null,
    chainId: '',
    networkCount: 0,
    importedCount: 0,
    visibleImportedCount: 0,
    labelCount: 0,
    sessionCount: 0,
  };
  const stored = await readStorage([
    STORAGE_KEYS.mnemonic,
    STORAGE_KEYS.accounts,
    STORAGE_KEYS.importedAccounts,
    STORAGE_KEYS.currentAccount,
    STORAGE_KEYS.chainId,
    STORAGE_KEYS.networks,
    STORAGE_KEYS.connectedSites,
    STORAGE_KEYS.settings,
  ]);
  if (Object.keys(stored).length === 0) {
    return empty;
  }

  const accounts = readValue(stored, STORAGE_KEYS.accounts);
  const imported = readValue(stored, STORAGE_KEYS.importedAccounts);
  const currentAccount = readValue(stored, STORAGE_KEYS.currentAccount);
  const chainId = readValue(stored, STORAGE_KEYS.chainId);
  const settings = asRecord(readValue(stored, STORAGE_KEYS.settings));
  const labels = asRecord(settings?.accountLabels);
  const importedList = Array.isArray(imported) ? imported : [];
  const visibleImported = importedList.filter(
    (entry) => asRecord(entry)?.visible !== false,
  ).length;

  return {
    hasMnemonic: typeof readValue(stored, STORAGE_KEYS.mnemonic) === 'string',
    accountCount: countEntries(accounts),
    currentAccount: typeof currentAccount === 'string' ? currentAccount : null,
    chainId: typeof chainId === 'string' ? chainId : '',
    networkCount: countEntries(readValue(stored, STORAGE_KEYS.networks)),
    importedCount: importedList.length,
    visibleImportedCount: visibleImported,
    labelCount: labels === null ? 0 : Object.keys(labels).length,
    sessionCount: countEntries(readValue(stored, STORAGE_KEYS.connectedSites)),
  };
};

/**
 * Fase 3 — red por defecto (M23, tarea 3.6): siembra `truekeate_networks` con **Anvil local**
 * (`0x7a69`, `isDefault: true`, sin Sepolia) y fija `truekeate_chain_id` si falta o es inválido.
 * Es idempotente y nunca rompe el arranque: un fallo de escritura se registra y se continúa.
 */
const seedDefaultNetworkPhase = async (): Promise<void> => {
  try {
    await seedDefaultNetwork();
  } catch (error) {
    console.warn('[truekeate] no se pudo sembrar la red por defecto', error);
  }
};

/** Informe de la reconciliación de plazos que se persiste en `sw_started`. */
export interface ReconciliationSnapshot {
  /** Entradas de la cola vistas al arrancar (antes de purgar). */
  pendingProcessed: number;
  /** Coste medido de la reconciliación (cota: < 1 s, RNF-08). */
  elapsedMs: number;
  /** Entradas ya resueltas que se retiraron. */
  purgedResolved?: number;
  /** Huérfanas (vencidas) retiradas tras responderles `4001`. */
  purgedExpired?: number;
  /** Alarmas de vencimiento rearmadas desde el `expiresAt` persistido. */
  rearmedAlarms?: number;
  /** `true` cuando la reconciliación escribió su entrada `sw_reconcile`. */
  logged?: boolean;
}

/**
 * Fase 6 — reconciliación de plazos (M16, tarea 4.5). En cada arranque:
 *
 * 1. purga las entradas de `truekeate_pending_requests` con `status !== 'pending'` o vencidas;
 * 2. responde `4001` a las huérfanas (por el puerto vivo o por su pestaña/frame);
 * 3. rearma los `chrome.alarms` de vencimiento desde el `expiresAt` persistido (M15);
 * 4. reconstruye `truekeate_inflight_tx` (§2.12) y `truekeate_rate_windows` (M3.b);
 * 5. restablece el invariante de la ventana única (M18);
 * 6. escribe **UNA** entrada `sw_reconcile` en `truekeate_logs`.
 *
 * Nunca usa `setTimeout` ni `setInterval` (prohibidos en el SW: no sobreviven a la suspensión) y
 * nunca rompe el arranque: un fallo se avisa por consola y el SW sigue operativo.
 */
const runApprovalReconciliation = async (): Promise<ReconciliationSnapshot> => {
  const startedAt = Date.now();
  try {
    const report = await reconcileApprovals({ now: startedAt, clock: () => Date.now() });
    return {
      pendingProcessed: report.pendingBefore,
      elapsedMs: report.elapsedMs,
      purgedResolved: report.purgedResolved,
      purgedExpired: report.purgedExpired,
      rearmedAlarms: report.rearm.armed,
      logged: report.logWritten,
    };
  } catch (error) {
    // La reconciliación NUNCA rompe el arranque: el estado persistido sigue siendo la verdad y el
    // siguiente arranque lo vuelve a intentar.
    console.warn('[truekeate] la reconciliación de aprobaciones falló', error);
    return { pendingProcessed: 0, elapsedMs: Date.now() - startedAt, logged: false };
  }
};

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/**
 * Entrega la respuesta de una lectura de página a su pestaña y, con `frameId !== 0`, SOLO a ese
 * frame (DEC-40/ADT-07). Si el emisor fue un contexto de la extensión, la respuesta viaja por el
 * canal de `onMessage` (`sendResponse`) y no se envía ningún mensaje a pestañas.
 *
 * Devuelve `true` cuando encontró un destinatario por pestaña. Un fallo de entrega (pestaña sin
 * content script o cerrada) se ignora: la respuesta ya se entregó por el canal de `onMessage`
 * cuando procedía y no puede romper el listener.
 */
const deliverToPage = async (
  target: ResponseTarget,
  response: RpcResponse,
): Promise<boolean> => {
  if (target.tabId === null) {
    return false;
  }
  const tabs = tabsMessaging();
  if (tabs === null) {
    return false;
  }
  const message = { type: 'TRUEKEATE_RESPONSE', ...response };
  try {
    if (target.frameId !== null && target.frameId !== 0) {
      await tabs.sendMessage(target.tabId, message, { frameId: target.frameId });
    } else {
      await tabs.sendMessage(target.tabId, message);
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Atiende `CONNECT_RESPONSE` (H3, tarea 3.10): `connect.html` entrega la elección del usuario y
 * aquí se persiste la sesión del origen (`truekeate_connected_sites`) o se rechaza con `4001`.
 * La promesa de `eth_requestAccounts` la resuelve `connections.ts` (M26.b).
 */
const handleConnectResponseMessage = async (message: unknown): Promise<void> => {
  const record = asRecord(message);
  if (record === null) {
    return;
  }
  await applyConnectResponse(record);
};

/**
 * Atiende `SIGN_RESPONSE` (H4, tarea 4.1): `notification.html` entrega la DECISIÓN del usuario
 * —`{ approvalId, success }`— y aquí se resuelve la entrada de `truekeate_pending_requests` (M14),
 * se entrega la respuesta a la dApp (M17) y la MISMA ventana pasa a la siguiente `pending` (M18).
 *
 * La ventana **decide, no firma** (`CA-RF-35`): la firma y la difusión las aplica el despacho de
 * M19.b, que está esperando el desenlace de esa misma entrada.
 */
const handleSignResponseMessage = async (
  message: unknown,
  sender: unknown,
): Promise<unknown> => handleSignResponse(message, toSenderLike(sender));

/**
 * Registra el listener de `chrome.runtime.onMessage`: `TRUEKEATE_RPC` → router (M3),
 * `CONNECT_RESPONSE` → sesión por origen (M26) y `SIGN_RESPONSE` → decisión de la ventana única
 * (M14.c, H4).
 *
 * Se responde de forma ASÍNCRONA (`return true`) porque el despacho de los métodos internos
 * toca el almacén. Un mensaje que no pertenece al protocolo (ningún tipo `TRUEKEATE_*`) no se
 * responde y no se marca como asíncrono: así no se deja colgada a ninguna otra superficie.
 * Ninguna excepción escapa del listener: se traduce a un error EIP-1193 tipado.
 */
const registerRpcMessageListener = (): void => {
  const runtime = runtimeApi();
  if (runtime === undefined || typeof runtime.onMessage?.addListener !== 'function') {
    return;
  }
  runtime.onMessage.addListener((message, sender, sendResponse) => {
    const record = asRecord(message);
    if (record === null || !isTruekeateMessageType(record.type)) {
      // No es un mensaje del protocolo: no se responde ni se retiene el canal.
      return undefined;
    }
    if (record.type === 'SIGN_RESPONSE') {
      void handleSignResponseMessage(message, sender)
        .then((outcome) => {
          sendResponse({ ok: true, outcome });
        })
        .catch((error: unknown) => {
          sendResponse({
            error: internalError({
              reason: 'sign-response',
              detail: error instanceof Error ? error.message : 'unhandled',
            }),
          });
        });
      return true;
    }
    if (record.type === 'CONNECT_RESPONSE') {
      void handleConnectResponseMessage(message)
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error: unknown) => {
          sendResponse({
            error: internalError({
              reason: 'connect-response',
              detail: error instanceof Error ? error.message : 'unhandled',
            }),
          });
        });
      return true;
    }
    void handleRpcMessage(message, toSenderLike(sender))
      .then(async (routed: RoutedMessage | undefined) => {
        if (routed === undefined) {
          // El router no reconoce el mensaje: se acusa recibo sin cuerpo.
          sendResponse(undefined);
          return;
        }
        // Respuesta por el canal de `onMessage` (popup / ventanas internas) y, además, entrega
        // a la pestaña de origen cuando el emisor fue un content script (H3).
        sendResponse(routed.response);
        await deliverToPage(routed.target, routed.response);
      })
      .catch((error: unknown) => {
        // Última red de seguridad: jamás un error sin `code` hacia el popup.
        sendResponse({
          error: internalError({
            reason: 'rpc-listener',
            detail: error instanceof Error ? error.message : 'unhandled',
          }),
        });
      });
    // `true` = la respuesta llegará de forma asíncrona (semántica de `chrome.runtime`).
    return true;
  });
};

/**
 * Secuencia de arranque completa: acceso al almacén → migración → integridad → carga → log.
 *
 * Es **idempotente** y se expone para las pruebas del arranque: cada invocación es un arranque
 * y escribe SU entrada `sw_started` (una por arranque). El ciclo normal lo dispara
 * `onInstalled`, `onStartup` y la evaluación inicial del propio Service Worker.
 */
export const bootstrap = async (): Promise<void> => {
  // 1. Aislamiento del almacén (M21), lo ANTES posible.
  await applyStorageAccessLevel();
  // 2. Migraciones de esquema (M34), antes de leer estado.
  const migration = await runMigrationsPhase();
  // 3. Red por defecto (M23): Anvil se siembra en `truekeate_networks` con su `chainId` (`0x7a69`).
  await seedDefaultNetworkPhase();
  // 4. Integridad (M13): puede dejar la cartera «dañada».
  const integrity = await runIntegrityPhase();
  // 5. Auto-carga del estado (M33/M28/M29).
  const autoLoaded = await autoLoadStatePhase();
  // 6. Reconciliación de plazos (M16): purga la cola, responde `4001` a las huérfanas, rearma los
  //    `chrome.alarms` (M15), reconstruye `truekeate_inflight_tx`/`truekeate_rate_windows`,
  //    restablece la ventana única (M18) y escribe UNA entrada `sw_reconcile`.
  const reconciliation = await runApprovalReconciliation();

  const bootMs = Date.now() - bootStartedAt;
  const snapshot: BootSnapshot = {
    startedAt: bootStartedAt,
    bootMs,
    schemaVersion: SCHEMA_VERSION,
    migration,
    integrity,
    autoLoaded,
    reconciliation,
  };
  bootSnapshot = snapshot;

  // 7. UNA sola entrada `sw_started` por arranque.
  await writeStartupLog(snapshot);
};

// Los listeners se registran de forma SÍNCRONA: si el SW se despierta por una conexión, una alarma,
// un mensaje o el cierre de la ventana única, todos deben existir ya al final del primer ciclo de
// evaluación. M17 (puerto `truekeate_approval`), M15 (alarmas de vencimiento y de liberación de la
// marca en vuelo) y M18 (ventana de decisión global única).
registerApprovalPortListener();
registerExpiryAlarmListener({
  onInflightRelease: (account) => releaseInflightOnAlarm(account),
});
registerApprovalWindowListeners();
registerRpcMessageListener();

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
