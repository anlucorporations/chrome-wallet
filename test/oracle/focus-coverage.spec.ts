/**
 * M18 — `src/background/approvals/focus.ts` (spec del árbol `test/oracle/`, ramas que los specs
 * del módulo no tocan). Ventana de decisión GLOBAL ÚNICA (`notification.html`): apertura o
 * reutilización por `windowId`, re-descubrimiento por URL, FIFO de la `pending` más antigua y
 * cierre con la X equivalente a RECHAZO (`4001`). Requisitos: **RF-35** (ventana única de
 * confirmación), **RF-36** (mostrar la solicitud y su contador) y **RF-41** (el cierre resuelve la
 * entrada y la purga de la cola persistida).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STUB_EXTENSION_ID, STUB_EPOCH_MS, chromeStub } from '../setup/chrome-stub';
import { SIGN_TIMEOUT_MS } from '../../src/shared/constants';
import { STORAGE_KEYS } from '../../src/background/state/schema';
import {
  INITIAL_APPROVAL_WINDOW,
  NOTIFICATION_WINDOW_HEIGHT,
  NOTIFICATION_WINDOW_WIDTH,
  closeApprovalWindow,
  findNotificationWindow,
  getUrlResolver,
  getWindowsApi,
  handleApprovalWindowRemoved,
  isNotificationTabUrl,
  isPresentable,
  notificationWindowUrl,
  oldestPresentable,
  readApprovalWindow,
  readApprovalWindowFromSnapshot,
  registerApprovalWindowListeners,
  resolveNotificationWindow,
  showOldestPending,
  writeApprovalWindow,
  type WindowsApiLike,
} from '../../src/background/approvals/focus';
import { readPendingRequests } from '../../src/background/approvals/queue';
import type { PendingRequest, PendingRequestsMap } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** URL de la ventana única de ESTA extensión. */
const URL_NOTIFICACION = `chrome-extension://${STUB_EXTENSION_ID}/notification.html`;

/** Entrada `pending` con la forma de §2.8. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0 }],
  origin: 'https://dapp.example',
  tabId: 5,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
  status: 'pending',
  ...overrides,
});

/** Siembra la cola persistida. */
const sembrarCola = async (mapa: PendingRequestsMap): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.pendingRequests]: mapa });
};

/** Siembra `truekeate_approval_window`. */
const sembrarVentana = async (valor: Record<string, unknown>): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.approvalWindow]: valor });
};

/** Pestaña simulada de una ventana. */
interface TabDoble {
  id: number;
  url: string;
}

/** Ventana simulada. */
interface WindowDoble {
  id: number;
  tabs?: TabDoble[];
}

/** Doble de `chrome.windows` que anota lo abierto, enfocado y cerrado. */
const windowsDoble = (
  options: {
    ventanas?: WindowDoble[];
    getResultado?: WindowDoble | undefined;
    fallaGet?: boolean;
    fallaGetAll?: boolean;
    fallaCreate?: boolean;
    createSinId?: boolean;
    sinUpdate?: boolean;
    fallaUpdate?: boolean;
    fallaRemove?: boolean;
  } = {},
): WindowsApiLike & {
  creadas: Array<Record<string, unknown>>;
  enfocadas: number[];
  cerradas: number[];
} => {
  const creadas: Array<Record<string, unknown>> = [];
  const enfocadas: number[] = [];
  const cerradas: number[] = [];
  const doble: WindowsApiLike & {
    creadas: typeof creadas;
    enfocadas: typeof enfocadas;
    cerradas: typeof cerradas;
  } = {
    creadas,
    enfocadas,
    cerradas,
    create(createData) {
      if (options.fallaCreate === true) {
        throw new Error('no se pudo abrir');
      }
      creadas.push(createData as unknown as Record<string, unknown>);
      return Promise.resolve(options.createSinId === true ? {} : { id: 77 });
    },
    get() {
      if (options.fallaGet === true) {
        throw new Error('ventana perdida');
      }
      return Promise.resolve(options.getResultado);
    },
    getAll() {
      if (options.fallaGetAll === true) {
        throw new Error('no se pudieron enumerar');
      }
      return Promise.resolve(options.ventanas ?? []);
    },
    remove(windowId: number) {
      if (options.fallaRemove === true) {
        throw new Error('no se pudo cerrar');
      }
      cerradas.push(windowId);
      return Promise.resolve(undefined);
    },
  };
  if (options.sinUpdate !== true) {
    doble.update = (windowId: number) => {
      if (options.fallaUpdate === true) {
        throw new Error('no se pudo enfocar');
      }
      enfocadas.push(windowId);
      return Promise.resolve({ id: windowId });
    };
  }
  return doble;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('M18 · localización de la API y de la ventana única', () => {
  it('getWindowsApi exige `create`, `get` y `getAll`; sin API devuelve `null`', () => {
    expect(getWindowsApi()).toBe(chromeStub.windows);
    const global = globalThis as { chrome?: unknown };
    const previo = global.chrome;
    try {
      global.chrome = undefined;
      expect(getWindowsApi()).toBeNull();
      expect(getUrlResolver()('/notification.html')).toBe('/notification.html');
      global.chrome = null;
      expect(getWindowsApi()).toBeNull();
      expect(getUrlResolver()('/notification.html')).toBe('/notification.html');
      global.chrome = {};
      expect(getWindowsApi()).toBeNull();
      global.chrome = { windows: { create: () => undefined, get: () => undefined }, runtime: {} };
      expect(getWindowsApi()).toBeNull();
      global.chrome = { runtime: { getURL: 'no-es-funcion' } };
      expect(getUrlResolver()('/x')).toBe('/x');
    } finally {
      global.chrome = previo;
    }
    expect(getUrlResolver()('/notification.html')).toBe(`chrome-extension://${STUB_EXTENSION_ID}/notification.html`);
  });

  it('notificationWindowUrl publica el correlador y el origen solo cuando los conoce', () => {
    const getUrl = getUrlResolver();
    const base = `chrome-extension://${STUB_EXTENSION_ID}/notification.html`;
    expect(notificationWindowUrl(getUrl)).toBe(base);
    expect(notificationWindowUrl(getUrl, { approvalId: 'id-1' })).toBe(`${base}?approvalId=id-1`);
    expect(notificationWindowUrl(getUrl, { origin: 'https://dapp.example' })).toBe(
      `${base}?origin=https%3A%2F%2Fdapp.example`,
    );
    expect(notificationWindowUrl(getUrl, { approvalId: 'id-1', origin: 'https://dapp.example' })).toBe(
      `${base}?approvalId=id-1&origin=https%3A%2F%2Fdapp.example`,
    );
    // Valores vacíos no se publican («no se inventan»).
    expect(notificationWindowUrl(getUrl, { approvalId: '', origin: '' })).toBe(base);
  });

  it('isNotificationTabUrl exige el origen de ESTA extensión y la ruta exacta', () => {
    expect(isNotificationTabUrl(URL_NOTIFICACION)).toBe(true);
    expect(isNotificationTabUrl(`${URL_NOTIFICACION}?approvalId=1#top`)).toBe(true);
    expect(isNotificationTabUrl(`chrome-extension://${STUB_EXTENSION_ID}/NOTIFICATION.HTML`)).toBe(true);
    expect(isNotificationTabUrl(`chrome-extension://${STUB_EXTENSION_ID}/index.html`)).toBe(false);
    expect(isNotificationTabUrl(`chrome-extension://otra-extension/notification.html`)).toBe(false);
    expect(isNotificationTabUrl('http://localhost:5174/notification.html')).toBe(false);
    expect(isNotificationTabUrl('')).toBe(false);
    expect(isNotificationTabUrl(null)).toBe(false);
    // URL no parseable: se exige el esquema de la extensión ADEMÁS de la ruta.
    expect(isNotificationTabUrl('chrome-extension:// mal/notification.html')).toBe(true);
    expect(isNotificationTabUrl('chrome-extension:// mal/index.html')).toBe(false);
  });

  it('la proyección del estado de la ventana no confía en la forma almacenada', () => {
    expect(readApprovalWindowFromSnapshot({})).toEqual(INITIAL_APPROVAL_WINDOW);
    expect(readApprovalWindowFromSnapshot({ [STORAGE_KEYS.approvalWindow]: 'no-objeto' })).toEqual(
      INITIAL_APPROVAL_WINDOW,
    );
    expect(readApprovalWindowFromSnapshot({ [STORAGE_KEYS.approvalWindow]: {} })).toEqual({
      windowId: null,
      shownApprovalId: null,
      openedAt: null,
      updatedAt: 0,
    });
    expect(
      readApprovalWindowFromSnapshot({
        [STORAGE_KEYS.approvalWindow]: {
          windowId: 3,
          shownApprovalId: 'id-1',
          openedAt: 5,
          updatedAt: 9,
        },
      }),
    ).toEqual({ windowId: 3, shownApprovalId: 'id-1', openedAt: 5, updatedAt: 9 });
  });

  it('writeApprovalWindow devuelve `null` cuando la escritura no se pudo persistir', async () => {
    const escrito = await writeApprovalWindow({ windowId: 4 }, { now: 42 });
    expect(escrito).toEqual({ ...INITIAL_APPROVAL_WINDOW, windowId: 4, updatedAt: 42 });
    expect((await readApprovalWindow()).windowId).toBe(4);

    vi.spyOn(chromeStub.storage.local, 'set').mockImplementation(() =>
      Promise.reject(new Error('QUOTA_BYTES quota exceeded')),
    );
    expect(await writeApprovalWindow({ windowId: 5 })).toBeNull();
    vi.restoreAllMocks();

    // Sin `now` se usa el reloj real (la escritura sigue siendo completa).
    const conReloj = await writeApprovalWindow({ shownApprovalId: 'id-9' });
    expect(conReloj?.shownApprovalId).toBe('id-9');
    expect(typeof conReloj?.updatedAt).toBe('number');
  });

  it('findNotificationWindow descarta ventanas y pestañas ajenas y tolera los fallos', async () => {
    expect(await findNotificationWindow(null)).toBeNull();
    expect(await findNotificationWindow(windowsDoble())).toBeNull();
    expect(await findNotificationWindow(windowsDoble({ fallaGetAll: true }))).toBeNull();
    expect(
      await findNotificationWindow(
        windowsDoble({
          ventanas: [
            { id: 1, tabs: [{ id: 10, url: 'https://dapp.example' }] },
            { id: 2, tabs: [{ id: 20, url: URL_NOTIFICACION }] },
          ],
        }),
      ),
    ).toEqual({ windowId: 2, tabId: 20, rediscovered: true });
    // Ventanas sin `id` utilizable o sin pestañas se ignoran.
    expect(
      await findNotificationWindow(
        windowsDoble({ ventanas: [{ id: Number.NaN }, { id: 3 }] as WindowDoble[] }),
      ),
    ).toBeNull();
  });

  it('resolveNotificationWindow repara el `windowId` persistido y si no re-descubre', async () => {
    expect(await resolveNotificationWindow(INITIAL_APPROVAL_WINDOW, null)).toBeNull();

    const conPersistido = await resolveNotificationWindow(
      { ...INITIAL_APPROVAL_WINDOW, windowId: 8 },
      windowsDoble({ getResultado: { id: 8, tabs: [{ id: 80, url: URL_NOTIFICACION }] } }),
    );
    expect(conPersistido).toEqual({ windowId: 8, tabId: 80, rediscovered: false });

    const sinPestana = await resolveNotificationWindow(
      { ...INITIAL_APPROVAL_WINDOW, windowId: 8 },
      windowsDoble({ getResultado: { id: 8, tabs: [{ id: 80, url: 'https://dapp.example' }] } }),
    );
    expect(sinPestana).toEqual({ windowId: 8, tabId: null, rediscovered: false });

    const perdida = await resolveNotificationWindow(
      { ...INITIAL_APPROVAL_WINDOW, windowId: 8 },
      windowsDoble({
        getResultado: undefined,
        ventanas: [{ id: 9, tabs: [{ id: 90, url: URL_NOTIFICACION }] }],
      }),
    );
    expect(perdida).toEqual({ windowId: 9, tabId: 90, rediscovered: true });

    const conFalloDeGet = await resolveNotificationWindow(
      { ...INITIAL_APPROVAL_WINDOW, windowId: 8 },
      windowsDoble({ fallaGet: true, ventanas: [{ id: 9, tabs: [{ id: 90, url: URL_NOTIFICACION }] }] }),
    );
    expect(conFalloDeGet).toEqual({ windowId: 9, tabId: 90, rediscovered: true });
  });
});

describe('M18 · presentabilidad de la solicitud mostrada', () => {
  it('isPresentable exige identificador, origen, cuenta, plazos y parámetros', () => {
    expect(isPresentable(entrada('id-1'))).toBe(true);
    expect(isPresentable(entrada(''))).toBe(false);
    expect(isPresentable(entrada('id-1', { origin: '' }))).toBe(false);
    expect(isPresentable(entrada('id-1', { account: '0x' }))).toBe(false);
    expect(isPresentable({ ...entrada('id-1'), createdAt: 'x' as unknown as number })).toBe(false);
    expect(isPresentable({ ...entrada('id-1'), params: 'x' as unknown as unknown[] })).toBe(false);
  });

  it('oldestPresentable salta la más antigua si no es presentable (FIFO estricto)', () => {
    const mapa: PendingRequestsMap = {
      rota: entrada('rota', { createdAt: 1, origin: '' }),
      buena: entrada('buena', { createdAt: 2 }),
    };
    expect(oldestPresentable(mapa)?.approvalId).toBe('buena');
    expect(oldestPresentable({})).toBeNull();
  });
});

describe('M18 · showOldestPending: una sola ventana mostrando la pending más antigua', () => {
  it('sin API de ventanas no se toca nada', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });

    const resultado = await showOldestPending({ now: STUB_EPOCH_MS, windows: null });

    expect(resultado).toMatchObject({ action: 'none', reason: 'sin-api-de-ventanas', pendingCount: 1 });
  });

  it('sin pendientes ni ventana conocida no se escribe el estado', async () => {
    const resultado = await showOldestPending({ now: STUB_EPOCH_MS, windows: windowsDoble() });

    expect(resultado).toEqual({
      action: 'none',
      windowId: null,
      shownApprovalId: null,
      pendingCount: 0,
      reason: 'sin-pendientes-ni-ventana',
    });
    expect(chromeStub.storage.local.writes()).toEqual([]);
  });

  it('sin pendientes pero con estado persistido se normaliza el estado', async () => {
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-vieja', openedAt: 1, updatedAt: 1 });

    const resultado = await showOldestPending({ now: STUB_EPOCH_MS, windows: windowsDoble() });

    expect(resultado).toMatchObject({ action: 'unchanged', reason: 'estado-normalizado', windowId: null });
    expect(await readApprovalWindow()).toEqual({ ...INITIAL_APPROVAL_WINDOW, updatedAt: STUB_EPOCH_MS });
  });

  it('sin pendientes y con ventana viva se CIERRA (y un fallo de cierre no lo impide)', async () => {
    const windows = windowsDoble({ ventanas: [{ id: 6, tabs: [{ id: 60, url: URL_NOTIFICACION }] }] });

    const resultado = await showOldestPending({ now: STUB_EPOCH_MS, windows });

    expect(resultado).toMatchObject({ action: 'closed', reason: 'sin-pendientes', windowId: null });
    expect(windows.cerradas).toEqual([6]);

    const conFallo = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: windowsDoble({
        ventanas: [{ id: 6, tabs: [{ id: 60, url: URL_NOTIFICACION }] }],
        fallaRemove: true,
      }),
    });
    expect(conFallo.action).toBe('closed');
  });

  it('la primera solicitud ABRE la ventana única con su correlador y medidas (P3)', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });
    const windows = windowsDoble();

    const resultado = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows,
      getUrl: (path) => `chrome-extension://${STUB_EXTENSION_ID}${path}`,
    });

    expect(resultado).toMatchObject({
      action: 'opened',
      windowId: 77,
      shownApprovalId: 'id-1',
      reason: 'primera-apertura',
    });
    expect(windows.creadas[0]).toMatchObject({
      type: 'popup',
      width: NOTIFICATION_WINDOW_WIDTH,
      height: NOTIFICATION_WINDOW_HEIGHT,
      focused: true,
    });
    expect(String(windows.creadas[0]?.url)).toContain('approvalId=id-1');
    expect(windows.enfocadas).toEqual([77]);
    expect((await readApprovalWindow()).shownApprovalId).toBe('id-1');
    expect(chromeStub.action.badgeText()).toBe('1');
  });

  it('si la ventana no se puede abrir o no devuelve id, la solicitud sigue pendiente', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });

    const fallo = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: windowsDoble({ fallaCreate: true }),
    });
    expect(fallo).toMatchObject({ action: 'none', reason: 'fallo-al-abrir', windowId: null });

    const sinId = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: windowsDoble({ createSinId: true }),
    });
    expect(sinId).toMatchObject({ action: 'none', reason: 'ventana-sin-id', windowId: null });
    expect((await readPendingRequests())['id-1']?.status).toBe('pending');
  });

  it('con la ventana ya abierta se RE-RENDERIZA la MISMA y se empuja el cuerpo', async () => {
    await sembrarCola({ 'id-nueva': entrada('id-nueva') });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-vieja', openedAt: 1, updatedAt: 1 });
    const windows = windowsDoble({
      getResultado: { id: 4, tabs: [{ id: 40, url: URL_NOTIFICACION }] },
    });

    const resultado = await showOldestPending({ now: STUB_EPOCH_MS, windows });

    expect(resultado).toMatchObject({
      action: 're-rendered',
      windowId: 4,
      shownApprovalId: 'id-nueva',
      reason: 'siguiente-solicitud',
    });
    expect(windows.enfocadas).toEqual([4]);
    expect((await readApprovalWindow()).shownApprovalId).toBe('id-nueva');
    // El cuerpo viaja por el canal del runtime (las páginas de la extensión).
    expect(chromeStub.runtime.sentMessages()).toHaveLength(1);
    expect(chromeStub.runtime.sentMessages()[0]).toMatchObject({ id: 'RESUME' });
  });

  it('una ventana re-descubierta por URL se repara, se enfoca y recibe el cuerpo', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });
    await sembrarVentana({ windowId: null, shownApprovalId: 'id-1', openedAt: 1, updatedAt: 1 });
    const windows = windowsDoble({
      ventanas: [{ id: 9, tabs: [{ id: 90, url: URL_NOTIFICACION }] }],
    });

    const resultado = await showOldestPending({ now: STUB_EPOCH_MS, windows });

    expect(resultado).toMatchObject({
      action: 'focused',
      windowId: 9,
      reason: 're-descubierta-por-url',
    });
    expect((await readApprovalWindow()).windowId).toBe(9);
    expect(windows.enfocadas).toEqual([9]);
    expect(chromeStub.runtime.sentMessages()).toHaveLength(1);
  });

  it('si ya mostraba la MISMA solicitud no se toca la ventana salvo con `repush`', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-1', openedAt: 1, updatedAt: 1 });
    const windows = windowsDoble({
      getResultado: { id: 4, tabs: [{ id: 40, url: URL_NOTIFICACION }] },
    });

    const sinRepush = await showOldestPending({ now: STUB_EPOCH_MS, windows });
    expect(sinRepush).toMatchObject({ action: 'unchanged', reason: 'ya-mostraba-la-misma' });
    expect(chromeStub.runtime.sentMessages()).toHaveLength(0);

    const conRepush = await showOldestPending({ now: STUB_EPOCH_MS, windows, repush: true });
    expect(conRepush).toMatchObject({ action: 'unchanged', reason: 're-entrega-del-cuerpo' });
    expect(chromeStub.runtime.sentMessages()).toHaveLength(1);
  });

  it('el re-render no falla si la ventana no expone `update`', async () => {
    await sembrarCola({ 'id-nueva': entrada('id-nueva') });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-vieja', openedAt: 1, updatedAt: 1 });

    const sinUpdate = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: windowsDoble({
        getResultado: { id: 4, tabs: [{ id: 40, url: URL_NOTIFICACION }] },
        sinUpdate: true,
      }),
    });
    expect(sinUpdate.action).toBe('re-rendered');
  });

  it('el re-render no falla si enfocar la ventana se rechaza', async () => {
    await sembrarCola({ 'id-nueva': entrada('id-nueva') });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-vieja', openedAt: 1, updatedAt: 1 });

    const updateRoto = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: windowsDoble({
        getResultado: { id: 4, tabs: [{ id: 40, url: URL_NOTIFICACION }] },
        fallaUpdate: true,
      }),
    });
    expect(updateRoto.action).toBe('re-rendered');
  });
});

describe('M18 · cierre de la ventana única', () => {
  it('closeApprovalWindow normaliza el estado aunque no haya ventana viva', async () => {
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-1', openedAt: 1, updatedAt: 1 });
    expect(await closeApprovalWindow({ now: STUB_EPOCH_MS, windows: windowsDoble() })).toBe(false);
    expect(await readApprovalWindow()).toEqual({ ...INITIAL_APPROVAL_WINDOW, updatedAt: STUB_EPOCH_MS });

    // Sin API de ventanas y sin estado previo: no hay nada que normalizar.
    expect(await closeApprovalWindow({ now: STUB_EPOCH_MS, windows: null })).toBe(false);
  });

  it('closeApprovalWindow cierra la ventana viva y responde si lo consiguió', async () => {
    const windows = windowsDoble({ ventanas: [{ id: 6, tabs: [{ id: 60, url: URL_NOTIFICACION }] }] });
    expect(await closeApprovalWindow({ now: STUB_EPOCH_MS, windows })).toBe(true);
    expect(windows.cerradas).toEqual([6]);

    const conFallo = await closeApprovalWindow({
      now: STUB_EPOCH_MS,
      windows: windowsDoble({
        ventanas: [{ id: 6, tabs: [{ id: 60, url: URL_NOTIFICACION }] }],
        fallaRemove: true,
      }),
    });
    expect(conFallo).toBe(false);
  });
});

describe('M18 · cierre con la X: rechazo (4001) salvo vencimiento (§3.8)', () => {
  it('un cierre ajeno NO aplica ninguna decisión', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-1', openedAt: 1, updatedAt: 1 });

    const resultado = await handleApprovalWindowRemoved(99, {
      now: STUB_EPOCH_MS,
      windows: windowsDoble(),
    });

    expect(resultado).toMatchObject({
      handled: false,
      reason: 'cierre-propio-o-ajeno',
      status: null,
      delivery: 'none',
      refresh: null,
      pendingCount: 1,
    });
    expect((await readPendingRequests())['id-1']?.status).toBe('pending');
  });

  it('sin solicitud mostrada (o ya resuelta) no hay rechazo que aplicar', async () => {
    await sembrarVentana({ windowId: 4, shownApprovalId: null, openedAt: 1, updatedAt: 1 });
    const sinMostrada = await handleApprovalWindowRemoved(4, {
      now: STUB_EPOCH_MS,
      windows: windowsDoble(),
    });
    expect(sinMostrada).toMatchObject({
      handled: false,
      reason: 'no-habia-solicitud-mostrada',
      approvalId: null,
    });
    expect(sinMostrada.refresh).not.toBeNull();

    await sembrarCola({ 'id-resuelta': entrada('id-resuelta', { status: 'approved' }) });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-resuelta', openedAt: 1, updatedAt: 1 });
    const yaResuelta = await handleApprovalWindowRemoved(4, {
      now: STUB_EPOCH_MS,
      windows: windowsDoble(),
    });
    expect(yaResuelta).toMatchObject({ handled: false, reason: 'no-habia-solicitud-mostrada' });
  });

  it('la X equivale a RECHAZO con el literal de §3.8 y entrega el 4001', async () => {
    await sembrarCola({ 'id-1': entrada('id-1', { tabId: 5, frameId: 0 }) });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-1', openedAt: 1, updatedAt: 1 });
    const entregados: unknown[] = [];
    chromeStub.tabs.setMessageHandler(5, (message) => {
      entregados.push(message);
      return 'ok';
    });

    const resultado = await handleApprovalWindowRemoved(4, {
      now: STUB_EPOCH_MS,
      windows: windowsDoble(),
    });

    expect(resultado).toMatchObject({
      handled: true,
      reason: 'cerrada-por-el-usuario',
      status: 'rejected',
      approvalId: 'id-1',
      delivery: 'tab',
    });
    expect(entregados[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', error: { code: 4001 } });
    expect(await readPendingRequests()).toEqual({});
    expect(await readApprovalWindow()).toEqual({ ...INITIAL_APPROVAL_WINDOW, updatedAt: STUB_EPOCH_MS });
  });

  it('si el plazo ya venció prevalece `expired` (la X no puede resucitar la solicitud)', async () => {
    await sembrarCola({
      'id-vencida': entrada('id-vencida', { tabId: null, expiresAt: STUB_EPOCH_MS - 1 }),
    });
    await sembrarVentana({ windowId: 4, shownApprovalId: 'id-vencida', openedAt: 1, updatedAt: 1 });

    const resultado = await handleApprovalWindowRemoved(4, {
      now: STUB_EPOCH_MS,
      windows: windowsDoble(),
    });

    expect(resultado).toMatchObject({
      handled: true,
      reason: 'cerrada-con-plazo-vencido',
      status: 'expired',
      delivery: 'none',
    });
    const registro = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
    expect(registro[STORAGE_KEYS.logs]).toHaveLength(1);
  });
});

describe('M18 · listener de `chrome.windows.onRemoved`', () => {
  it('sin `onRemoved` no se registra nada', () => {
    expect(registerApprovalWindowListeners({ windows: null })).toBe(false);
    expect(registerApprovalWindowListeners({ windows: windowsDoble() })).toBe(false);
    expect(
      registerApprovalWindowListeners({
        windows: { ...windowsDoble(), onRemoved: { addListener: 'no' as never } },
      }),
    ).toBe(false);
  });

  it('el cierre de la ventana se atiende de forma diferida y un fallo no rompe el listener', async () => {
    const atendidos: number[] = [];
    const listeners: Array<(windowId: number, info?: unknown) => void> = [];
    const registered = registerApprovalWindowListeners({
      windows: {
        ...windowsDoble(),
        onRemoved: { addListener: (listener) => listeners.push(listener) },
      },
      onRemoved: async (windowId) => {
        atendidos.push(windowId);
      },
    });

    expect(registered).toBe(true);
    listeners[0]?.(4);
    await vi.waitFor(() => {
      expect(atendidos).toEqual([4]);
    });

    const conFallo = registerApprovalWindowListeners({
      windows: {
        ...windowsDoble(),
        onRemoved: { addListener: (listener) => listeners.push(listener) },
      },
      onRemoved: async () => {
        throw new Error('cierre fallido');
      },
    });
    expect(conFallo).toBe(true);
    expect(() => listeners[1]?.(5)).not.toThrow();
  });
});
