/**
 * `test/setup/chrome-stub.ts` — Stub EN MEMORIA de `chrome.*` para Vitest.
 *
 * Fuente normativa: `documento_tecnico.md` §7.4.1.e (stub de `chrome.*` con reloj inyectable),
 * §7.4.1.d (los `chrome.alarms` NO los tocan los *fake timers* de Vitest) y
 * `plan_desarrollo.md` §3.1.5 tarea 1.15.
 *
 * Este fichero es el `setupFiles` declarado en el bloque `test` de `vite.config.ts`, de modo
 * que se carga UNA vez por fichero de prueba antes de los casos:
 *
 *   1. `installChromeStub()` publica el stub en `globalThis.chrome` (jsdom no trae `chrome`).
 *   2. Un `beforeEach` global reinicia TODO el estado antes de cada caso.
 *
 * ---------------------------------------------------------------------------------------------
 * CÓMO SE LIMPIA EL ESTADO
 * ---------------------------------------------------------------------------------------------
 * `resetChromeStub()` (invocado automáticamente en `beforeEach`) deja el stub como recién
 * instalado: almacén vacío, cero alarmas, cero listeners, cero ventanas y pestañas, badge
 * vacío, permisos sin conceder, `lastError` limpio, registros de mensajes vacíos y el reloj
 * de nuevo en `STUB_EPOCH_MS`. Si una prueba necesita partir de un estado inicial escrito a
 * mano (p. ej. una cola persistida), lo hace DESPUÉS del `beforeEach`:
 *
 *   await chrome.storage.local.set({ truekeate_pending_requests: { 'id-1': { ... } } });
 *
 * ---------------------------------------------------------------------------------------------
 * CÓMO SE AVANZA EL RELOJ
 * ---------------------------------------------------------------------------------------------
 * El stub tiene su PROPIO reloj (epoch fijo y determinista `STUB_EPOCH_MS`), porque
 * `chrome.alarms.create({ delayInMinutes })` se resuelve contra ese reloj y no contra
 * `setTimeout`. Hay dos formas de avanzarlo:
 *
 *   a) `advanceAlarms(ms)`: avanza el reloj del stub y DISPARA las alarmas vencidas (en orden
 *      de `scheduledTime`, reprogramando las periódicas). Si Vitest está en *fake timers*,
 *      avanza además los `setTimeout`/`setInterval` con `vi.advanceTimersByTime(ms)`:
 *
 *        vi.useFakeTimers();
 *        vi.setSystemTime(STUB_EPOCH_MS);   // Date.now() y el reloj del stub coinciden
 *        await chrome.alarms.create('truekeate_expire:id-1', { delayInMinutes: 2 });
 *        advanceAlarms(120_001);            // vence la alarma y corre su listener
 *
 *   b) `chromeStub.clock.set(ms)` / `chromeStub.clock.advance(ms)` para mover el reloj sin
 *      disparar temporizadores de Vitest.
 *
 * El reloj del stub es la fuente de verdad de `scheduledTime`, así que las aserciones sobre
 * plazos son exactas (`STUB_EPOCH_MS + 120_000`) y no dependen del reloj del sistema.
 *
 * Lo que el stub NO implementa a propósito: `chrome.storage.sync` (prohibido por ADT-26), la
 * API de red del nodo (el RPC sale por el proveedor del SW) y cualquier límite de cuota real
 * (la cuota se simula con `chromeStub.storage.simulateWriteFailure()`).
 */

import { beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Constantes del entorno simulado
// ---------------------------------------------------------------------------

/** ID SINTÉTICO de la extensión dentro del stub (no es el ID real: ese lo descubre el E2E). */
export const STUB_EXTENSION_ID = 'tk-stub-extension-id-for-tests';

/** Epoch determinista del reloj del stub: 2023-11-14T22:13:20Z (mismo orden que el corpus). */
export const STUB_EPOCH_MS = 1_700_000_000_000;

/** Un minuto en milisegundos: unidad de `chrome.alarms`. */
export const ONE_MINUTE_MS = 60_000;

/** Cuota declarada por Chrome para `storage.local` (10 MB), solo informativa en el stub. */
export const STORAGE_QUOTA_BYTES = 10_485_760;

/** Tope de disparos por avance de reloj: evita que una alarma periódica cuelgue la suite. */
const MAX_ALARM_FIRES_PER_ADVANCE = 1_000;

// ---------------------------------------------------------------------------
// Tipos del stub
// ---------------------------------------------------------------------------

/** Contenedor de pares clave/valor de un área de almacén. */
export type StorageItems = Record<string, unknown>;

/** Escritura observada por `storage.onChanged`: `{ oldValue?, newValue? }` por clave. */
export type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

/** Error simulado que se entrega por `chrome.runtime.lastError`. */
export interface StubLastError {
  message: string;
}

/** Evento del stub: misma superficie que un evento de `chrome.*` más un `emit` de prueba. */
export interface StubEvent<TArgs extends unknown[]> {
  addListener(listener: (...args: TArgs) => void): void;
  removeListener(listener: (...args: TArgs) => void): void;
  hasListener(listener: (...args: TArgs) => void): boolean;
  hasListeners(): boolean;
  /** Dispara el evento con los argumentos dados (uso EXCLUSIVO de las pruebas y del stub). */
  emit(...args: TArgs): void;
  /** Lista copiada de listeners registrados. */
  listeners(): readonly ((...args: TArgs) => void)[];
  /** Retira todos los listeners (lo usa `resetChromeStub`). */
  clear(): void;
}

/** Crea un evento del stub con `emit` manual. */
export function createStubEvent<TArgs extends unknown[]>(): StubEvent<TArgs> {
  const registered: Array<(...args: TArgs) => void> = [];
  return {
    addListener(listener) {
      if (!registered.includes(listener)) registered.push(listener);
    },
    removeListener(listener) {
      const index = registered.indexOf(listener);
      if (index >= 0) registered.splice(index, 1);
    },
    hasListener(listener) {
      return registered.includes(listener);
    },
    hasListeners() {
      return registered.length > 0;
    },
    emit(...args) {
      for (const listener of [...registered]) listener(...args);
    },
    listeners() {
      return [...registered];
    },
    clear() {
      registered.length = 0;
    },
  };
}

/** Área de almacén (`storage.local`) con soporte simultáneo de callbacks y promesas. */
export interface StorageAreaStub {
  readonly QUOTA_BYTES: number;
  get(keys?: string | string[] | StorageItems | null, callback?: (items: StorageItems) => void): Promise<StorageItems> | undefined;
  set(items: StorageItems, callback?: () => void): Promise<void> | undefined;
  remove(keys: string | string[], callback?: () => void): Promise<void> | undefined;
  clear(callback?: () => void): Promise<void> | undefined;
  setAccessLevel(accessLevel: { accessLevel: string }, callback?: () => void): Promise<void> | undefined;
  getBytesInUse(keys?: string | string[] | null, callback?: (bytes: number) => void): Promise<number> | undefined;
  onChanged: StubEvent<[StorageChanges, string]>;
  /** Último `accessLevel` aplicado con `setAccessLevel` (`TRUSTED_CONTEXTS` en el SW). */
  accessLevel(): string | null;
  /** Todas las escrituras de `set`/`remove`/`clear`, en orden (para aserciones de auditoría). */
  writes(): readonly StorageItems[];
  /** Simula una cuota agotada: la SIGUIENTE escritura falla (`storage_quota_exceeded`). */
  simulateWriteFailure(message?: string): void;
}

/** Alarma del stub. */
export interface AlarmStub {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

/** Reloj inyectable del stub. */
export interface StubClock {
  /** Instante actual del reloj del stub (epoch ms). */
  now(): number;
  /** Fija el reloj (sin disparar alarmas). */
  set(ms: number): void;
  /** Avanza el reloj `ms` y dispara las alarmas vencidas. Devuelve cuántas disparó. */
  advance(ms: number): number;
}

/** Puerto de larga vida simulado (par cliente ↔ servidor). */
export interface PortStub {
  name: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: StubEvent<[unknown, PortStub]>;
  onDisconnect: StubEvent<[PortStub]>;
  sender?: unknown;
  /** `true` tras `disconnect()` en cualquiera de los dos extremos. */
  disconnected: boolean;
}

/** Pestaña simulada. */
export interface TabStub {
  id: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
  index: number;
}

/** Ventana simulada. */
export interface WindowStub {
  id: number;
  focused: boolean;
  type: string;
  width: number;
  height: number;
  top: number;
  left: number;
  tabs?: TabStub[];
}

/** Superficie completa del stub publicada en `globalThis.chrome`. */
export interface ChromeStub {
  storage: { local: StorageAreaStub; onChanged: StubEvent<[StorageChanges, string]> };
  alarms: {
    create(name: string, alarmInfo: { when?: number; delayInMinutes?: number; periodInMinutes?: number }): void;
    create(alarmInfo: { when?: number; delayInMinutes?: number; periodInMinutes?: number }): void;
    get(name: string, callback?: (alarm?: AlarmStub) => void): Promise<AlarmStub | undefined> | undefined;
    getAll(callback?: (alarms: AlarmStub[]) => void): Promise<AlarmStub[]> | undefined;
    clear(name?: string, callback?: (wasCleared: boolean) => void): Promise<boolean> | undefined;
    clearAll(callback?: (wasCleared: boolean) => void): Promise<boolean> | undefined;
    onAlarm: StubEvent<[AlarmStub]>;
    /** Dispara manualmente una alarma por nombre (sin mover el reloj). */
    fire(name: string): boolean;
  };
  runtime: {
    id: string;
    lastError: StubLastError | undefined;
    getURL(path: string): string;
    getManifest(): Record<string, unknown>;
    sendMessage(message: unknown, callback?: (response: unknown) => void): Promise<unknown> | undefined;
    connect(info: { name: string }): PortStub;
    onMessage: StubEvent<[unknown, unknown, (response?: unknown) => void]>;
    onConnect: StubEvent<[PortStub]>;
    onInstalled: StubEvent<[{ reason: string }]>;
    onStartup: StubEvent<[]>;
    onSuspend: StubEvent<[]>;
    /** Mensajes entregados con `sendMessage`, en orden. */
    sentMessages(): readonly unknown[];
    /** Conexiones abiertas con `connect`, en orden. */
    connections(): readonly PortStub[];
  };
  windows: {
    create(createData: { url?: string | string[]; type?: string; width?: number; height?: number; focused?: boolean }, callback?: (window: WindowStub) => void): Promise<WindowStub> | undefined;
    get(windowId: number, callback?: (window: WindowStub | undefined) => void): Promise<WindowStub | undefined> | undefined;
    getAll(callback?: (windows: WindowStub[]) => void): Promise<WindowStub[]> | undefined;
    update(windowId: number, updateInfo: { focused?: boolean; width?: number; height?: number }, callback?: (window: WindowStub) => void): Promise<WindowStub> | undefined;
    remove(windowId: number, callback?: () => void): Promise<void> | undefined;
    onCreated: StubEvent<[WindowStub]>;
    onRemoved: StubEvent<[number, { windowId: number; isWindowClosing: boolean }]>;
  };
  tabs: {
    query(queryInfo: { url?: string | string[]; active?: boolean; windowId?: number }, callback?: (tabs: TabStub[]) => void): Promise<TabStub[]> | undefined;
    get(tabId: number, callback?: (tab: TabStub | undefined) => void): Promise<TabStub | undefined> | undefined;
    sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void): Promise<unknown> | undefined;
    onRemoved: StubEvent<[number, { windowId: number; isWindowClosing: boolean }]>;
    onUpdated: StubEvent<[number, { status?: string; url?: string }, TabStub]>;
    /** Registra una pestaña en el stub. */
    addTab(tab: Partial<TabStub> & { url: string }): TabStub;
    /** Retira una pestaña y emite `onRemoved`. */
    removeTab(tabId: number): void;
    /** Define la respuesta de `sendMessage` para una pestaña. */
    setMessageHandler(tabId: number, handler: (message: unknown) => unknown): void;
    /** Todas las pestañas registradas. */
    all(): readonly TabStub[];
  };
  permissions: {
    request(permissions: { permissions?: string[]; origins?: string[] }, callback?: (granted: boolean) => void): Promise<boolean> | undefined;
    contains(permissions: { permissions?: string[]; origins?: string[] }, callback?: (granted: boolean) => void): Promise<boolean> | undefined;
    remove(permissions: { permissions?: string[]; origins?: string[] }, callback?: (removed: boolean) => void): Promise<boolean> | undefined;
    onAdded: StubEvent<[{ permissions: string[]; origins?: string[] }]>;
    onRemoved: StubEvent<[{ permissions: string[]; origins?: string[] }]>;
    /** Fuerza la concesión (por defecto `true`) de la siguiente solicitud. */
    setGranted(granted: boolean): void;
    /** Orígenes concedidos en runtime (`optional_host_permissions`). */
    grantedOrigins(): readonly string[];
    /** Permisos concedidos en runtime (`notifications`, etc.). */
    grantedPermissions(): readonly string[];
  };
  action: {
    setBadgeText(details: { text: string; tabId?: number }, callback?: () => void): Promise<void> | undefined;
    setBadgeBackgroundColor(details: { color: string; tabId?: number }, callback?: () => void): Promise<void> | undefined;
    setTitle(details: { title: string; tabId?: number }, callback?: () => void): Promise<void> | undefined;
    onClicked: StubEvent<[TabStub]>;
    /** Último texto de badge por pestaña (`-1` = badge global). */
    badgeText(tabId?: number): string;
  };
  notifications: {
    create(notificationId: string | undefined, options: { type: string; title: string; message: string }, callback?: (notificationId: string) => void): Promise<string> | undefined;
    clear(notificationId: string, callback?: (wasCleared: boolean) => void): Promise<boolean> | undefined;
    getAll(callback?: (notifications: Record<string, unknown>) => void): Promise<Record<string, unknown>> | undefined;
    onClicked: StubEvent<[string]>;
    /** Notificaciones creadas, en orden (vacío si el permiso opcional no se ha usado). */
    created(): readonly { id: string; options: { type: string; title: string; message: string } }[];
  };
  /** Superficie del stub con utilidades de prueba. */
  reset(): void;
  clock: StubClock;
  /** Estado bruto del almacén (lectura directa, sin clonar). */
  rawStorage(): StorageItems;
}

// ---------------------------------------------------------------------------
// Utilidad callback/promesa
// ---------------------------------------------------------------------------

/**
 * Ejecuta `executor` y lo entrega por callback (síncrono, como Chrome) o por promesa.
 * Devuelve `undefined` en el modo callback, que es lo que devuelve la API real.
 */
function withCallback<T>(
  callback: ((value: T) => void) | undefined,
  executor: () => T,
): Promise<T> | undefined {
  if (typeof callback === 'function') {
    const value = executor();
    callback(value);
    return undefined;
  }
  return Promise.resolve().then(executor);
}

/** Normaliza `keys` de `storage.get` a la lista de claves solicitadas, o `null` para todo. */
function requestedKeys(keys: string | string[] | StorageItems | null | undefined): string[] | null {
  if (keys === null || keys === undefined) return null;
  if (typeof keys === 'string') return [keys];
  if (Array.isArray(keys)) return [...keys];
  return Object.keys(keys);
}

// ---------------------------------------------------------------------------
// Implementaciones
// ---------------------------------------------------------------------------

/** Crea el área `storage.local` con su reloj-dependiente `onChanged` compartido. */
function createStorageArea(onChanged: StubEvent<[StorageChanges, string]>): StorageAreaStub & {
  entries: StorageItems;
  writeLog: StorageItems[];
  failure: string | null;
} {
  const entryMap: StorageItems = {};
  const writeLog: StorageItems[] = [];
  const area = {
    entries: entryMap,
    writeLog,
    failure: null as string | null,
    QUOTA_BYTES: STORAGE_QUOTA_BYTES,

    get(keys?: string | string[] | StorageItems | null, callback?: (items: StorageItems) => void) {
      return withCallback(callback, () => {
        const wanted = requestedKeys(keys);
        const result: StorageItems = {};
        if (wanted === null) {
          Object.assign(result, entryMap);
          return result;
        }
        for (const key of wanted) {
          if (Object.prototype.hasOwnProperty.call(entryMap, key)) {
            result[key] = entryMap[key];
          } else if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
            // Semántica de Chrome: el objeto de `get` aporta los valores por defecto.
            result[key] = (keys as StorageItems)[key];
          }
        }
        return result;
      });
    },

    set(items: StorageItems, callback?: () => void) {
      const executor = (): void => {
        if (area.failure !== null) {
          const message = area.failure;
          area.failure = null;
          throw new Error(message);
        }
        writeLog.push({ ...items });
        const changes: StorageChanges = {};
        for (const [key, value] of Object.entries(items)) {
          const hadOld = Object.prototype.hasOwnProperty.call(entryMap, key);
          const oldValue = entryMap[key];
          entryMap[key] = value;
          changes[key] = hadOld ? { oldValue, newValue: value } : { newValue: value };
        }
        if (Object.keys(changes).length > 0) onChanged.emit(changes, 'local');
      };
      if (typeof callback === 'function') {
        try {
          executor();
          callback();
        } catch (error) {
          setLastError(error);
          callback();
        }
        return undefined;
      }
      return Promise.resolve().then(executor);
    },

    remove(keys: string | string[], callback?: () => void) {
      const executor = (): void => {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes: StorageChanges = {};
        for (const key of list) {
          if (!Object.prototype.hasOwnProperty.call(entryMap, key)) continue;
          const oldValue = entryMap[key];
          delete entryMap[key];
          changes[key] = { oldValue };
        }
        if (Object.keys(changes).length > 0) onChanged.emit(changes, 'local');
      };
      return withCallback(callback, executor);
    },

    clear(callback?: () => void) {
      const executor = (): void => {
        const changes: StorageChanges = {};
        for (const [key, oldValue] of Object.entries(entryMap)) {
          changes[key] = { oldValue };
          delete entryMap[key];
        }
        if (Object.keys(changes).length > 0) onChanged.emit(changes, 'local');
      };
      return withCallback(callback, executor);
    },

    setAccessLevel(accessLevel: { accessLevel: string }, callback?: () => void) {
      return withCallback(callback, () => {
        state.accessLevel = accessLevel.accessLevel;
        writeLog.push({ __setAccessLevel: accessLevel.accessLevel });
      });
    },

    getBytesInUse(keys?: string | string[] | null, callback?: (bytes: number) => void) {
      return withCallback(callback as ((value: number) => void) | undefined, () => {
        const wanted = requestedKeys(keys);
        const selected = wanted === null ? Object.keys(entryMap) : wanted;
        let bytes = 0;
        for (const key of selected) {
          if (!Object.prototype.hasOwnProperty.call(entryMap, key)) continue;
          bytes += key.length + JSON.stringify(entryMap[key] ?? null).length;
        }
        return bytes;
      });
    },

    onChanged,

    accessLevel() {
      return state.accessLevel;
    },

    writes() {
      return [...writeLog];
    },

    simulateWriteFailure(message = 'QUOTA_BYTES quota exceeded') {
      area.failure = message;
    },
  };
  return area;
}

/** Estado mutable compartido por las fábricas del stub (se reinicia en `resetChromeStub`). */
const state: {
  accessLevel: string | null;
  lastError: StubLastError | undefined;
} = {
  accessLevel: null,
  lastError: undefined,
};

/** Publica `lastError` para el modo callback (Chrome lo limpia al salir del callback). */
function setLastError(error: unknown): void {
  state.lastError = { message: error instanceof Error ? error.message : String(error) };
}

// ---------------------------------------------------------------------------
// Construcción del stub
// ---------------------------------------------------------------------------

/** Construye una instancia completa del stub. `installChromeStub` la publica en `globalThis`. */
function buildChromeStub(): ChromeStub {
  let clockNow = STUB_EPOCH_MS;
  const alarms = new Map<string, AlarmStub>();
  const alarmEvent = createStubEvent<[AlarmStub]>();

  const storageOnChanged = createStubEvent<[StorageChanges, string]>();
  const local = createStorageArea(storageOnChanged);

  const windowMap = new Map<number, WindowStub>();
  const tabMap = new Map<number, TabStub>();
  const tabHandlers = new Map<number, (message: unknown) => unknown>();
  let nextWindowId = 1;
  let nextTabId = 1;
  const badgeTextByTab = new Map<number, string>();
  const createdNotifications: Array<{ id: string; options: { type: string; title: string; message: string } }> = [];
  const grantedPermissionSet = new Set<string>();
  const grantedOriginSet = new Set<string>();
  let nextRequestGranted = true;

  const onWindowCreated = createStubEvent<[WindowStub]>();
  const onWindowRemoved = createStubEvent<[number, { windowId: number; isWindowClosing: boolean }]>();
  const onTabRemoved = createStubEvent<[number, { windowId: number; isWindowClosing: boolean }]>();
  const onTabUpdated = createStubEvent<[number, { status?: string; url?: string }, TabStub]>();
  const onMessage = createStubEvent<[unknown, unknown, (response?: unknown) => void]>();
  const onConnect = createStubEvent<[PortStub]>();
  const onInstalled = createStubEvent<[{ reason: string }]>();
  const onStartup = createStubEvent<[]>();
  const onSuspend = createStubEvent<[]>();
  const sentMessages: unknown[] = [];
  const connections: PortStub[] = [];

  /** Resuelve una alarma vencida: la emite y reprograma/elimina. */
  const fireAlarm = (alarm: AlarmStub): void => {
    alarmEvent.emit({ name: alarm.name, scheduledTime: alarm.scheduledTime, periodInMinutes: alarm.periodInMinutes });
    if (alarm.periodInMinutes !== undefined && alarm.periodInMinutes > 0) {
      alarm.scheduledTime += alarm.periodInMinutes * ONE_MINUTE_MS;
      alarms.set(alarm.name, alarm);
    } else {
      alarms.delete(alarm.name);
    }
  };

  const clock: StubClock = {
    now: () => clockNow,
    set: (ms) => {
      clockNow = ms;
    },
    advance: (ms) => {
      if (!Number.isFinite(ms) || ms < 0) throw new Error(`[chrome-stub] avance de reloj inválido: ${ms}`);
      const target = clockNow + ms;
      let fired = 0;
      for (;;) {
        const due = [...alarms.values()]
          .filter((alarm) => alarm.scheduledTime <= target)
          .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];
        if (due === undefined) break;
        clockNow = Math.max(clockNow, due.scheduledTime);
        fireAlarm(due);
        fired += 1;
        if (fired > MAX_ALARM_FIRES_PER_ADVANCE) {
          throw new Error(
            `[chrome-stub] más de ${MAX_ALARM_FIRES_PER_ADVANCE} disparos en un solo avance: ¿alarma periódica sin tope?`,
          );
        }
      }
      clockNow = target;
      return fired;
    },
  };

  const alarmsApi: ChromeStub['alarms'] = {
    create(first: string | { when?: number; delayInMinutes?: number; periodInMinutes?: number }, second?: { when?: number; delayInMinutes?: number; periodInMinutes?: number }): void {
      const name = typeof first === 'string' ? first : '';
      const info = typeof first === 'string' ? (second ?? {}) : first;
      const delayMs = info.delayInMinutes !== undefined ? info.delayInMinutes * ONE_MINUTE_MS : undefined;
      const scheduledTime = info.when ?? clockNow + (delayMs ?? (info.periodInMinutes ?? 0) * ONE_MINUTE_MS);
      const alarm: AlarmStub = { name, scheduledTime };
      if (info.periodInMinutes !== undefined) alarm.periodInMinutes = info.periodInMinutes;
      alarms.set(name, alarm);
    },
    get(name: string, callback?: (alarm?: AlarmStub) => void) {
      return withCallback(callback, () => {
        const alarm = alarms.get(name);
        return alarm === undefined ? undefined : { ...alarm };
      });
    },
    getAll(callback?: (alarms: AlarmStub[]) => void) {
      return withCallback(callback, () =>
        [...alarms.values()].sort((a, b) => a.scheduledTime - b.scheduledTime).map((alarm) => ({ ...alarm })),
      );
    },
    clear(name?: string, callback?: (wasCleared: boolean) => void) {
      return withCallback(callback, () => {
        if (name === undefined) {
          const existed = alarms.size > 0;
          alarms.clear();
          return existed;
        }
        return alarms.delete(name);
      });
    },
    clearAll(callback?: (wasCleared: boolean) => void) {
      return withCallback(callback, () => {
        const existed = alarms.size > 0;
        alarms.clear();
        return existed;
      });
    },
    onAlarm: alarmEvent,
    fire(name: string): boolean {
      const alarm = alarms.get(name);
      if (alarm === undefined) return false;
      fireAlarm(alarm);
      return true;
    },
  };

  /** Crea dos extremos conectados del puerto de larga vida. */
  const createPortPair = (name: string): { client: PortStub; server: PortStub } => {
    const client: PortStub = {
      name,
      disconnected: false,
      onMessage: createStubEvent<[unknown, PortStub]>(),
      onDisconnect: createStubEvent<[PortStub]>(),
      postMessage: () => undefined,
      disconnect: () => undefined,
    };
    const server: PortStub = {
      name,
      disconnected: false,
      sender: { id: STUB_EXTENSION_ID },
      onMessage: createStubEvent<[unknown, PortStub]>(),
      onDisconnect: createStubEvent<[PortStub]>(),
      postMessage: () => undefined,
      disconnect: () => undefined,
    };
    client.postMessage = (message: unknown) => {
      if (!client.disconnected && !server.disconnected) server.onMessage.emit(message, client);
    };
    server.postMessage = (message: unknown) => {
      if (!client.disconnected && !server.disconnected) client.onMessage.emit(message, server);
    };
    client.disconnect = () => {
      if (client.disconnected) return;
      client.disconnected = true;
      server.onDisconnect.emit(client);
    };
    server.disconnect = () => {
      if (server.disconnected) return;
      server.disconnected = true;
      client.onDisconnect.emit(server);
    };
    return { client, server };
  };

  const runtimeApi: ChromeStub['runtime'] = {
    id: STUB_EXTENSION_ID,
    get lastError(): StubLastError | undefined {
      return state.lastError;
    },
    set lastError(value: StubLastError | undefined) {
      state.lastError = value;
    },
    getURL: (path: string) => `chrome-extension://${STUB_EXTENSION_ID}/${path.replace(/^\/+/, '')}`,
    getManifest: () => ({ manifest_version: 3, name: 'TrueKeate Wallet (stub de pruebas)' }),

    sendMessage(message: unknown, callback?: (response: unknown) => void) {
      sentMessages.push(message);
      const sender = { id: STUB_EXTENSION_ID };
      const deliver = async (): Promise<unknown> => {
        for (const listener of onMessage.listeners()) {
          const response = await new Promise<unknown>((resolve) => {
            let settled = false;
            const sendResponse = (value?: unknown): void => {
              if (settled) return;
              settled = true;
              resolve(value);
            };
            let returned: unknown;
            try {
              returned = listener(message, sender, sendResponse);
            } catch (error) {
              setLastError(error);
              resolve(undefined);
              return;
            }
            if (returned instanceof Promise) {
              void returned.then((value) => {
                sendResponse(value);
              });
              return;
            }
            // `true` = el listener responderá de forma asíncrona (semántica de Chrome).
            if (returned === true) return;
            sendResponse(returned);
          });
          if (response !== undefined) return response;
        }
        return undefined;
      };
      if (typeof callback === 'function') {
        // Modo callback: se entrega cuando el/los listeners hayan respondido.
        void deliver().then((response) => {
          callback(response);
        });
        return undefined;
      }
      return deliver();
    },

    connect(info: { name: string }): PortStub {
      const pair = createPortPair(info.name);
      connections.push(pair.client);
      // El extremo "servidor" se entrega a `onConnect` en un microtask: el SW puede registrar
      // su listener en el mismo turno en que el relay se conecta.
      queueMicrotask(() => {
        onConnect.emit(pair.server);
      });
      return pair.client;
    },

    onMessage,
    onConnect,
    onInstalled,
    onStartup,
    onSuspend,
    sentMessages: () => [...sentMessages],
    connections: () => [...connections],
  };

  const windowsApi: ChromeStub['windows'] = {
    create(createData, callback?) {
      return withCallback(callback, () => {
        const created: WindowStub = {
          id: nextWindowId,
          focused: createData.focused ?? true,
          type: createData.type ?? 'popup',
          width: createData.width ?? 420,
          height: createData.height ?? 640,
          top: 0,
          left: 0,
        };
        nextWindowId += 1;
        if (Array.isArray(createData.url) || typeof createData.url === 'string') {
          const urls = Array.isArray(createData.url) ? createData.url : [createData.url];
          created.tabs = urls.map((url) => {
            const tab: TabStub = { id: nextTabId, url, title: '', active: true, windowId: created.id, index: 0 };
            nextTabId += 1;
            tabMap.set(tab.id, tab);
            return tab;
          });
        }
        windowMap.set(created.id, created);
        onWindowCreated.emit(created);
        return created;
      });
    },
    get(windowId: number, callback?: (window: WindowStub | undefined) => void) {
      return withCallback(callback, () => windowMap.get(windowId));
    },
    getAll(callback?: (windows: WindowStub[]) => void) {
      return withCallback(callback, () => [...windowMap.values()]);
    },
    update(windowId: number, updateInfo, callback?) {
      return withCallback(callback, () => {
        const existing = windowMap.get(windowId);
        if (existing === undefined) throw new Error(`No window with id: ${windowId}.`);
        Object.assign(existing, updateInfo);
        return existing;
      });
    },
    remove(windowId: number, callback?: () => void) {
      return withCallback(callback, () => {
        windowMap.delete(windowId);
        for (const [tabId, tab] of tabMap) {
          if (tab.windowId === windowId) tabMap.delete(tabId);
        }
        onWindowRemoved.emit(windowId, { windowId, isWindowClosing: true });
      });
    },
    onCreated: onWindowCreated,
    onRemoved: onWindowRemoved,
  };

  const tabsApi: ChromeStub['tabs'] = {
    query(queryInfo, callback?) {
      return withCallback(callback, () => {
        const urlPatterns = queryInfo.url === undefined ? null : Array.isArray(queryInfo.url) ? queryInfo.url : [queryInfo.url];
        const matches = [...tabMap.values()].filter((tab) => {
          if (queryInfo.active !== undefined && tab.active !== queryInfo.active) return false;
          if (queryInfo.windowId !== undefined && tab.windowId !== queryInfo.windowId) return false;
          if (urlPatterns !== null && !urlPatterns.some((pattern) => matchesUrlPattern(tab.url, pattern))) return false;
          return true;
        });
        return matches;
      });
    },
    get(tabId: number, callback?: (tab: TabStub | undefined) => void) {
      return withCallback(callback, () => tabMap.get(tabId));
    },
    sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void) {
      const handler = tabHandlers.get(tabId);
      if (typeof callback === 'function') {
        if (handler === undefined) {
          setLastError(new Error('Could not establish connection. Receiving end does not exist.'));
          callback(undefined);
          return undefined;
        }
        callback(handler(message));
        return undefined;
      }
      if (handler === undefined) {
        return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
      }
      return Promise.resolve().then(() => handler(message));
    },
    onRemoved: onTabRemoved,
    onUpdated: onTabUpdated,
    addTab(tab) {
      const created: TabStub = {
        id: tab.id ?? nextTabId,
        url: tab.url,
        title: tab.title ?? '',
        active: tab.active ?? true,
        windowId: tab.windowId ?? 1,
        index: tab.index ?? tabMap.size,
      };
      nextTabId = Math.max(nextTabId, created.id + 1);
      tabMap.set(created.id, created);
      return created;
    },
    removeTab(tabId: number) {
      const tab = tabMap.get(tabId);
      tabMap.delete(tabId);
      tabHandlers.delete(tabId);
      if (tab !== undefined) onTabRemoved.emit(tabId, { windowId: tab.windowId, isWindowClosing: false });
    },
    setMessageHandler(tabId: number, handler: (message: unknown) => unknown) {
      tabHandlers.set(tabId, handler);
    },
    all: () => [...tabMap.values()],
  };

  const permissionsApi: ChromeStub['permissions'] = {
    request(permissions, callback?) {
      return withCallback(callback, () => {
        const granted = nextRequestGranted;
        if (granted) {
          for (const permission of permissions.permissions ?? []) grantedPermissionSet.add(permission);
          for (const origin of permissions.origins ?? []) grantedOriginSet.add(origin);
        }
        return granted;
      });
    },
    contains(permissions, callback?) {
      return withCallback(callback, () => {
        const allPermissions = (permissions.permissions ?? []).every((permission) => grantedPermissionSet.has(permission));
        const allOrigins = (permissions.origins ?? []).every((origin) => grantedOriginSet.has(origin));
        return allPermissions && allOrigins;
      });
    },
    remove(permissions, callback?) {
      return withCallback(callback, () => {
        let removed = false;
        for (const permission of permissions.permissions ?? []) removed = grantedPermissionSet.delete(permission) || removed;
        for (const origin of permissions.origins ?? []) removed = grantedOriginSet.delete(origin) || removed;
        return removed;
      });
    },
    onAdded: createStubEvent<[{ permissions: string[]; origins?: string[] }]>(),
    onRemoved: createStubEvent<[{ permissions: string[]; origins?: string[] }]>(),
    setGranted(granted: boolean) {
      nextRequestGranted = granted;
    },
    grantedOrigins: () => [...grantedOriginSet],
    grantedPermissions: () => [...grantedPermissionSet],
  };

  const actionApi: ChromeStub['action'] = {
    setBadgeText(details, callback?) {
      return withCallback(callback, () => {
        badgeTextByTab.set(details.tabId ?? -1, details.text);
      });
    },
    setBadgeBackgroundColor(details, callback?) {
      return withCallback(callback, () => {
        writeLogBadgeColor(details.color, details.tabId ?? -1);
      });
    },
    setTitle(details, callback?) {
      return withCallback(callback, () => {
        writeLogTitle(details.title, details.tabId ?? -1);
      });
    },
    onClicked: createStubEvent<[TabStub]>(),
    badgeText: (tabId?: number) => badgeTextByTab.get(tabId ?? -1) ?? '',
  };

  const badgeColors = new Map<number, string>();
  const badgeTitles = new Map<number, string>();
  function writeLogBadgeColor(color: string, tabId: number): void {
    badgeColors.set(tabId, color);
  }
  function writeLogTitle(title: string, tabId: number): void {
    badgeTitles.set(tabId, title);
  }

  const notificationsApi: ChromeStub['notifications'] = {
    create(notificationId, options, callback?) {
      return withCallback(callback, () => {
        const id = notificationId ?? `tk-notification-${createdNotifications.length + 1}`;
        createdNotifications.push({ id, options });
        return id;
      });
    },
    clear(notificationId, callback?) {
      return withCallback(callback, () => {
        const index = createdNotifications.findIndex((entry) => entry.id === notificationId);
        if (index < 0) return false;
        createdNotifications.splice(index, 1);
        return true;
      });
    },
    getAll(callback?) {
      return withCallback(callback, () => {
        const result: Record<string, unknown> = {};
        for (const entry of createdNotifications) result[entry.id] = entry.options;
        return result;
      });
    },
    onClicked: createStubEvent<[string]>(),
    created: () => [...createdNotifications],
  };

  return {
    storage: { local, onChanged: storageOnChanged },
    alarms: alarmsApi,
    runtime: runtimeApi,
    windows: windowsApi,
    tabs: tabsApi,
    permissions: permissionsApi,
    action: actionApi,
    notifications: notificationsApi,
    reset() {
      for (const key of Object.keys(local.entries)) delete local.entries[key];
      local.writeLog.length = 0;
      local.failure = null;
      state.accessLevel = null;
      state.lastError = undefined;
      alarms.clear();
      alarmEvent.clear();
      storageOnChanged.clear();
      windowMap.clear();
      tabMap.clear();
      tabHandlers.clear();
      badgeTextByTab.clear();
      badgeColors.clear();
      badgeTitles.clear();
      createdNotifications.length = 0;
      grantedPermissionSet.clear();
      grantedOriginSet.clear();
      nextRequestGranted = true;
      nextWindowId = 1;
      nextTabId = 1;
      sentMessages.length = 0;
      connections.length = 0;
      onWindowCreated.clear();
      onWindowRemoved.clear();
      onTabRemoved.clear();
      onTabUpdated.clear();
      onMessage.clear();
      onConnect.clear();
      onInstalled.clear();
      onStartup.clear();
      onSuspend.clear();
      permissionsApi.onAdded.clear();
      permissionsApi.onRemoved.clear();
      actionApi.onClicked.clear();
      notificationsApi.onClicked.clear();
      clockNow = STUB_EPOCH_MS;
    },
    clock,
    rawStorage: () => local.entries,
  };
}

/** Compara una URL con un patrón de `tabs.query` (el comodín `*` casa cualquier tramo). */
function matchesUrlPattern(url: string, pattern: string): boolean {
  if (pattern === '<all_urls>' || pattern === '*://*/*') return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').split('*').join('.*');
  return new RegExp(`^${escaped}$`).test(url);
}

// ---------------------------------------------------------------------------
// Instalación y utilidades públicas
// ---------------------------------------------------------------------------

/** Instancia única del stub que consumen las pruebas. */
export const chromeStub: ChromeStub = buildChromeStub();

/** ¿Está el stub publicado en `globalThis.chrome`? */
export const isChromeStubInstalled = (): boolean =>
  (globalThis as { chrome?: unknown }).chrome === (chromeStub as unknown);

/**
 * Publica el stub en `globalThis.chrome` (idempotente). Se ejecuta al importar este módulo,
 * porque el fichero está declarado como `setupFiles` del bloque `test`.
 */
export function installChromeStub(): ChromeStub {
  Object.defineProperty(globalThis, 'chrome', {
    value: chromeStub as unknown,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  return chromeStub;
}

/** Reinicia TODO el estado del stub al valor inicial (lo llama el `beforeEach` global). */
export function resetChromeStub(): ChromeStub {
  chromeStub.reset();
  installChromeStub();
  return chromeStub;
}

/**
 * Avanza el reloj del stub `ms` y dispara las alarmas vencidas (ver cabecera).
 * Si Vitest está en *fake timers*, avanza también `setTimeout`/`setInterval`.
 * Devuelve el número de disparos de `chrome.alarms.onAlarm`.
 */
export function advanceAlarms(ms: number): number {
  if (vi.isFakeTimers()) vi.advanceTimersByTime(ms);
  return chromeStub.clock.advance(ms);
}

/** Fija el reloj del stub (y el del sistema de Vitest si hay *fake timers*). */
export function setStubClock(ms: number): void {
  chromeStub.clock.set(ms);
  if (vi.isFakeTimers()) vi.setSystemTime(ms);
}

// ---------------------------------------------------------------------------
// Instalación efectiva + aislamiento entre pruebas
// ---------------------------------------------------------------------------

installChromeStub();

beforeEach(() => {
  resetChromeStub();
});
