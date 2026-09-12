/**
 * M18 — `src/background/approvals/windowRediscovery.spec.ts`
 * Re-descubrimiento de la ventana única por URL (H4, tarea 4.4 de `plan_desarrollo.md` §3.4.5).
 *
 * Invariante que fija este fichero: aunque `truekeate_approval_window.windowId` se pierda o quede
 * desincronizado (suspensión del SW, ventana movida, estado viejo), la extensión **NO abre una
 * segunda** `notification.html`: la localiza por la URL `notification.html`, repara el `windowId`
 * persistido y la enfoca (`CA-RF-35`, §2.14 regla 4).
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS, STUB_EXTENSION_ID, chromeStub } from '../../../test/setup/chrome-stub';
import { SIGN_TIMEOUT_MS } from '../../shared/constants';
import type { PendingRequest, PendingRequestsMap, ApprovalWindow } from '../../shared/types';
import { STORAGE_KEYS } from '../state/schema';
import {
  INITIAL_APPROVAL_WINDOW,
  NOTIFICATION_WINDOW_HEIGHT,
  NOTIFICATION_WINDOW_WIDTH,
  findNotificationWindow,
  getUrlResolver,
  getWindowsApi,
  isNotificationTabUrl,
  notificationWindowUrl,
  readApprovalWindow,
  readApprovalWindowFromSnapshot,
  resolveNotificationWindow,
  showOldestPending,
  writeApprovalWindow,
  type WindowsApiLike,
} from './focus';

/** Cuenta #0 de Anvil. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** URL de la ventana única tal y como la resuelve el stub (el ID se DESCUBRE, no se escribe). */
const URL_NOTIFICACION = `chrome-extension://${STUB_EXTENSION_ID}/notification.html`;

/** Construye una entrada `pending` presentable. */
const entrada = (approvalId: string): PendingRequest => ({
  approvalId,
  method: 'personal_sign',
  params: ['0x686f6c61', CUENTA_0],
  origin: `https://${approvalId}.example`,
  tabId: 2,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
  status: 'pending',
});

/** Siembra la cola y el estado de la ventana única. */
const sembrar = async (
  mapa: PendingRequestsMap,
  ventana: Partial<ApprovalWindow> | null = null,
): Promise<void> => {
  const items: Record<string, unknown> = { [STORAGE_KEYS.pendingRequests]: mapa };
  if (ventana !== null) items[STORAGE_KEYS.approvalWindow] = { ...INITIAL_APPROVAL_WINDOW, ...ventana };
  await chromeStub.storage.local.set(items);
};

/** Crea en el stub una ventana cuya primera pestaña es la de la URL dada. */
const crearVentana = (url: string): void => {
  chromeStub.windows.create({ url, type: 'popup', width: 420, height: 640, focused: true });
};

describe('M18 · utilidades de URL de la ventana única', () => {
  it('notificationWindowUrl sale de `chrome.runtime.getURL` (el ID lo descubre el arnés)', () => {
    expect(notificationWindowUrl()).toBe(URL_NOTIFICACION);
    expect(notificationWindowUrl(getUrlResolver())).toBe(URL_NOTIFICACION);
    // El ID del stub no se escribe a mano en la prueba: se toma del propio stub.
    expect(notificationWindowUrl()).toContain(STUB_EXTENSION_ID);
    expect(NOTIFICATION_WINDOW_WIDTH).toBe(420);
    expect(NOTIFICATION_WINDOW_HEIGHT).toBe(640);
  });

  it('isNotificationTabUrl tolera `?query` y `#hash` y rechaza otras rutas', () => {
    expect(isNotificationTabUrl(URL_NOTIFICACION)).toBe(true);
    expect(isNotificationTabUrl(`${URL_NOTIFICACION}?approvalId=abc`)).toBe(true);
    expect(isNotificationTabUrl(`${URL_NOTIFICACION}#arriba`)).toBe(true);
    expect(isNotificationTabUrl(`chrome-extension://${STUB_EXTENSION_ID}/index.html`)).toBe(false);
    expect(isNotificationTabUrl(`chrome-extension://${STUB_EXTENSION_ID}/notification.html.bak`)).toBe(
      false,
    );
    // D-H4-E5 CORREGIDO en H4: la comparación exige el ORIGEN de la extensión, así que una página
    // de la dApp servida en `/notification.html` ya NO se confunde con la ventana única. La
    // expectativa anterior (`true`) codificaba el defecto, no la especificación; queda ajustada.
    expect(isNotificationTabUrl('http://localhost:5174/notification.html')).toBe(false);
    expect(isNotificationTabUrl(`chrome-extension://otra-extension/notification.html`)).toBe(false);
    expect(isNotificationTabUrl(undefined)).toBe(false);
    expect(isNotificationTabUrl('')).toBe(false);
  });

  it('isNotificationTabUrl exige el esquema de la extensión cuando la URL no es parseable', () => {
    // D-H4-E5 CORREGIDO en H4: el respaldo de una URL no parseable exige el esquema
    // `chrome-extension://` ADEMÁS de la ruta (antes bastaba `includes`, que es justo lo que
    // confundía una página web con la ventana única). La expectativa anterior (`true`) codificaba
    // el defecto; queda ajustada a la especificación.
    expect(isNotificationTabUrl(`ruta-invalida/${URL_NOTIFICACION}`)).toBe(false);
    expect(isNotificationTabUrl(`chrome-extension://${STUB_EXTENSION_ID}/notification.html`)).toBe(true);
  });

  it('getWindowsApi devuelve la superficie del stub', () => {
    expect(getWindowsApi()).not.toBeNull();
  });
});

describe('M18 · re-descubrimiento por URL', () => {
  it('localiza la ventana por su URL cuando el `windowId` persistido ya no existe', async () => {
    crearVentana(URL_NOTIFICACION);

    const referencia = await resolveNotificationWindow({
      windowId: 99,
      shownApprovalId: 'x',
      openedAt: STUB_EPOCH_MS,
      updatedAt: STUB_EPOCH_MS,
    });

    expect(referencia).toMatchObject({ windowId: 1, rediscovered: true });
    expect(await findNotificationWindow()).toMatchObject({ windowId: 1, rediscovered: true });
  });

  it('prefiere el `windowId` persistido cuando la ventana sigue viva', async () => {
    crearVentana(URL_NOTIFICACION);

    const referencia = await resolveNotificationWindow({
      windowId: 1,
      shownApprovalId: 'x',
      openedAt: STUB_EPOCH_MS,
      updatedAt: STUB_EPOCH_MS,
    });

    expect(referencia).toMatchObject({ windowId: 1, rediscovered: false });
  });

  it('una pestaña cualquiera NO cuenta como ventana única', async () => {
    crearVentana('http://localhost:5174/test.html');

    expect(await findNotificationWindow()).toBeNull();
    expect(
      await resolveNotificationWindow({
        windowId: 42,
        shownApprovalId: null,
        openedAt: null,
        updatedAt: 0,
      }),
    ).toBeNull();
  });

  it('sin ninguna ventana abierta devuelve null', async () => {
    expect(await findNotificationWindow()).toBeNull();
  });

  it('sin API de ventanas devuelve null sin lanzar', async () => {
    expect(await findNotificationWindow(null)).toBeNull();
    expect(
      await resolveNotificationWindow(
        { windowId: 1, shownApprovalId: 'x', openedAt: null, updatedAt: 0 },
        null,
      ),
    ).toBeNull();
  });

  it('la pasada REPARA el `windowId` persistido y enfoca la ventana re-descubierta', async () => {
    crearVentana(URL_NOTIFICACION);
    // El `windowId` está desincronizado, pero la solicitud mostrada ya es la correcta: es el
    // escenario exacto del re-descubrimiento por URL (si mostrara otra, sería `re-rendered`).
    await sembrar({ viva: entrada('viva') }, {
      windowId: 777,
      shownApprovalId: 'viva',
      openedAt: null,
    });

    const salida = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: chromeStub.windows as WindowsApiLike,
    });

    expect(salida).toMatchObject({
      action: 'focused',
      windowId: 1,
      shownApprovalId: 'viva',
      reason: 're-descubierta-por-url',
      pendingCount: 1,
    });
    const estado = await readApprovalWindow();
    expect(estado.windowId).toBe(1);
    expect(estado.shownApprovalId).toBe('viva');
    expect(await chromeStub.windows.getAll()).toHaveLength(1);
  });

  it('una `notification.html` abierta con `?query` NO provoca una SEGUNDA ventana', async () => {
    crearVentana(`${URL_NOTIFICACION}?approvalId=abc`);
    await sembrar({ viva: entrada('viva') }, { windowId: 555, shownApprovalId: 'viva' });

    const salida = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: chromeStub.windows as WindowsApiLike,
    });

    expect(salida.action).toBe('focused');
    expect(salida.reason).toBe('re-descubierta-por-url');
    // El oráculo de `CA-RF-35`: sigue habiendo EXACTAMENTE una ventana.
    expect(await chromeStub.windows.getAll()).toHaveLength(1);
  });

  it('si la ventana se perdió y no hay ninguna viva, se abre una sola', async () => {
    await sembrar({ viva: entrada('viva') }, { windowId: 777, shownApprovalId: 'otra' });

    const salida = await showOldestPending({
      now: STUB_EPOCH_MS,
      windows: chromeStub.windows as WindowsApiLike,
    });

    expect(salida.action).toBe('opened');
    expect(await chromeStub.windows.getAll()).toHaveLength(1);
  });
});

describe('M18 · proyección y escritura de `truekeate_approval_window`', () => {
  it('readApprovalWindowFromSnapshot proyecta el valor inicial exacto y descarta basura', () => {
    expect(readApprovalWindowFromSnapshot({})).toEqual(INITIAL_APPROVAL_WINDOW);
    expect(
      readApprovalWindowFromSnapshot({ [STORAGE_KEYS.approvalWindow]: 'no-es-un-objeto' }),
    ).toEqual(INITIAL_APPROVAL_WINDOW);
    expect(
      readApprovalWindowFromSnapshot({
        [STORAGE_KEYS.approvalWindow]: {
          windowId: 'uno',
          shownApprovalId: 7,
          openedAt: 'ayer',
          updatedAt: 5,
        },
      }),
    ).toEqual({ windowId: null, shownApprovalId: null, openedAt: null, updatedAt: 5 });
    expect(
      readApprovalWindowFromSnapshot({
        [STORAGE_KEYS.approvalWindow]: {
          windowId: 3,
          shownApprovalId: 'abc',
          openedAt: STUB_EPOCH_MS,
          updatedAt: STUB_EPOCH_MS,
        },
      }),
    ).toEqual({
      windowId: 3,
      shownApprovalId: 'abc',
      openedAt: STUB_EPOCH_MS,
      updatedAt: STUB_EPOCH_MS,
    });
  });

  it('writeApprovalWindow escribe el objeto COMPLETO con `updatedAt` del reloj inyectado', async () => {
    const escrito = await writeApprovalWindow(
      { windowId: 4, shownApprovalId: 'abc' },
      { now: STUB_EPOCH_MS + 1_234 },
    );

    expect(escrito).toEqual({
      windowId: 4,
      shownApprovalId: 'abc',
      openedAt: null,
      updatedAt: STUB_EPOCH_MS + 1_234,
    });
    expect(await readApprovalWindow()).toEqual(escrito);
    // Y leer sin nada persistido devuelve el valor inicial, nunca `undefined`.
    await chromeStub.storage.local.clear();
    expect(await readApprovalWindow()).toEqual(INITIAL_APPROVAL_WINDOW);
  });
});
