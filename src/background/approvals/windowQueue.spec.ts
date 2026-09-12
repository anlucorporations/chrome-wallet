/**
 * M18 — `src/background/approvals/windowQueue.spec.ts`
 * Ventana de decisión **GLOBAL ÚNICA** (`notification.html`, P-21) y su contador (H4, tarea 4.4 de
 * `plan_desarrollo.md` §3.4.5; §3.4.7).
 *
 * Criterios que fija este fichero:
 * - `CA-RF-35` — **como máximo UNA** `notification.html` en toda la extensión, mostrando la
 *   `pending` de menor `createdAt` y el contador «N en espera»; con 2 pendientes nunca se muestran
 *   dos a la vez.
 * - `CA-RF-41` — cerrar con la X equivale a **rechazo (`4001`)** y la entrada desaparece de la cola
 *   persistida; si el plazo ya venció, prevalece `expired`.
 */

import { describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../../test/setup/chrome-stub';
import { SIGN_TIMEOUT_MS } from '../../shared/constants';
import type { PendingRequest, PendingRequestsMap } from '../../shared/types';
import { STORAGE_KEYS } from '../state/schema';
import { readPendingRequests } from './queue';
import {
  closeApprovalWindow,
  handleApprovalWindowRemoved,
  isPresentable,
  oldestPresentable,
  showOldestPending,
  type WindowsApiLike,
} from './focus';

/** Cuenta #0 de Anvil. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Construye una entrada `pending` presentable. */
const entrada = (approvalId: string, createdAt: number, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0, value: '0x1' }],
  origin: `https://${approvalId}.example`,
  tabId: 4,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt,
  expiresAt: createdAt + SIGN_TIMEOUT_MS,
  status: 'pending',
  ...overrides,
});

/** Siembra la cola y el estado de la ventana única. */
const sembrar = async (
  mapa: PendingRequestsMap,
  ventana: Record<string, unknown> | null = null,
): Promise<void> => {
  const items: Record<string, unknown> = { [STORAGE_KEYS.pendingRequests]: mapa };
  if (ventana !== null) items[STORAGE_KEYS.approvalWindow] = ventana;
  await chromeStub.storage.local.set(items);
};

/** Estado persistido de la ventana única (solo la identidad: `windowId` + solicitud mostrada). */
const leerVentana = async (): Promise<{ windowId: number | null; shownApprovalId: string | null }> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.approvalWindow)) as Record<
    string,
    { windowId?: number | null; shownApprovalId?: string | null } | undefined
  >;
  const estado = items[STORAGE_KEYS.approvalWindow];
  return {
    windowId: estado?.windowId ?? null,
    shownApprovalId: estado?.shownApprovalId ?? null,
  };
};

/** Opciones de una pasada de la ventana única sobre el stub. */
const opciones = (extra: Record<string, unknown> = {}) => ({
  now: STUB_EPOCH_MS,
  windows: chromeStub.windows as WindowsApiLike,
  ...extra,
});

describe('M18 · una sola ventana y el contador de pendientes (CA-RF-35)', () => {
  it('abre EXACTAMENTE una ventana con la pending más antigua, con sus medidas y sin duplicar', async () => {
    await sembrar(
      {
        nueva: entrada('nueva', STUB_EPOCH_MS + 10),
        antigua: entrada('antigua', STUB_EPOCH_MS),
      },
      null,
    );

    const salida = await showOldestPending(opciones());

    expect(salida).toMatchObject({
      action: 'opened',
      windowId: 1,
      shownApprovalId: 'antigua',
      pendingCount: 2,
      reason: 'primera-apertura',
    });
    const ventanas = (await chromeStub.windows.getAll()) ?? [];
    expect(ventanas).toHaveLength(1);
    expect(ventanas[0]).toMatchObject({ type: 'popup', width: 420, height: 640, focused: true });
    expect(ventanas[0]?.tabs?.[0]?.url).toContain('notification.html');
    expect(await leerVentana()).toEqual({ windowId: 1, shownApprovalId: 'antigua' });
  });

  it('con 2 pendientes el contador marca 2 y el badge derivado coincide', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS), b: entrada('b', STUB_EPOCH_MS + 1) }, null);

    const salida = await showOldestPending(opciones());

    expect(salida.pendingCount).toBe(2);
    expect(chromeStub.action.badgeText()).toBe('2');
  });

  it('la siguiente solicitud se RE-RENDERIZA en la MISMA ventana: nunca se abre una segunda', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS), b: entrada('b', STUB_EPOCH_MS + 10) }, null);
    const primera = await showOldestPending(opciones());
    expect(primera.action).toBe('opened');
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.pendingRequests]: { b: entrada('b', STUB_EPOCH_MS + 10) },
    });

    const segunda = await showOldestPending(opciones({ now: STUB_EPOCH_MS + 1_000 }));

    expect(segunda).toMatchObject({
      action: 're-rendered',
      windowId: primera.windowId,
      shownApprovalId: 'b',
      reason: 'siguiente-solicitud',
    });
    expect(await chromeStub.windows.getAll()).toHaveLength(1);
    expect(await leerVentana()).toEqual({ windowId: 1, shownApprovalId: 'b' });
  });

  it('una pasada que ya mostraba la misma solicitud no crea ni cierra nada', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS) }, null);
    await showOldestPending(opciones());

    const repetida = await showOldestPending(opciones({ now: STUB_EPOCH_MS + 500 }));

    expect(repetida).toMatchObject({
      action: 'unchanged',
      windowId: 1,
      shownApprovalId: 'a',
      pendingCount: 1,
      reason: 'ya-mostraba-la-misma',
    });
    expect(await chromeStub.windows.getAll()).toHaveLength(1);
  });

  it('sin pendientes cierra la ventana única, limpia el estado y vacía el badge', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS) }, null);
    await showOldestPending(opciones());
    expect(chromeStub.action.badgeText()).toBe('1');
    await chromeStub.storage.local.set({ [STORAGE_KEYS.pendingRequests]: {} });

    const cierre = await showOldestPending(opciones({ now: STUB_EPOCH_MS + 1_000 }));

    expect(cierre).toMatchObject({
      action: 'closed',
      windowId: null,
      shownApprovalId: null,
      pendingCount: 0,
      reason: 'sin-pendientes',
    });
    expect(await chromeStub.windows.getAll()).toEqual([]);
    expect(await leerVentana()).toEqual({ windowId: null, shownApprovalId: null });
    expect(chromeStub.action.badgeText()).toBe('');
  });

  it('enfoca la ventana única con `windows.update` al abrirla', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS) }, null);
    const espia = vi.spyOn(chromeStub.windows, 'update');

    await showOldestPending(opciones());

    expect(espia).toHaveBeenCalledWith(1, { focused: true });
  });

  it('el cerrojo de la ventana serializa dos pasadas simultáneas: se abre UNA sola', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS) }, null);

    const [primera, segunda] = await Promise.all([
      showOldestPending(opciones()),
      showOldestPending(opciones()),
    ]);

    expect(await chromeStub.windows.getAll()).toHaveLength(1);
    expect([primera.action, segunda.action].sort()).toEqual(['opened', 'unchanged']);
  });

  it('sin `chrome.windows` disponible la pasada no rompe y no abre nada', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS) }, null);

    const salida = await showOldestPending({ now: STUB_EPOCH_MS, windows: null });

    expect(salida).toMatchObject({ action: 'none', reason: 'sin-api-de-ventanas', pendingCount: 1 });
    expect(await chromeStub.windows.getAll()).toEqual([]);
  });

  it('una entrada sin campos para pintarse no abre la ventana: se muestra la siguiente', async () => {
    const incompleta = entrada('incompleta', STUB_EPOCH_MS, { origin: '', account: '0x' as never });
    await sembrar({ incompleta, completa: entrada('completa', STUB_EPOCH_MS + 10) }, null);

    expect(isPresentable(incompleta)).toBe(false);
    const mapa = await readPendingRequests();
    expect(oldestPresentable(mapa)?.approvalId).toBe('completa');

    const salida = await showOldestPending(opciones());
    expect(salida.shownApprovalId).toBe('completa');
    expect(salida.action).toBe('opened');
  });

  it('con SOLO una entrada no presentable no se abre ninguna ventana en blanco', async () => {
    await sembrar(
      { incompleta: entrada('incompleta', STUB_EPOCH_MS, { origin: '' }) },
      null,
    );

    const salida = await showOldestPending(opciones());

    expect(salida).toMatchObject({ action: 'none', reason: 'sin-pendientes-ni-ventana' });
    expect(await chromeStub.windows.getAll()).toEqual([]);
  });

  it('closeApprovalWindow cierra la ventana y normaliza el estado persistido', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS) }, null);
    await showOldestPending(opciones());

    expect(await closeApprovalWindow(opciones())).toBe(true);

    expect(await chromeStub.windows.getAll()).toEqual([]);
    expect(await leerVentana()).toEqual({ windowId: null, shownApprovalId: null });
    // Idempotente: sin ventana viva no hay nada que cerrar.
    expect(await closeApprovalWindow(opciones())).toBe(false);
  });
});

describe('M18 · cerrar con la X equivale a rechazo 4001 (CA-RF-41)', () => {
  it('rechaza la solicitud mostrada, la purga de la cola y muestra la siguiente', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS), b: entrada('b', STUB_EPOCH_MS + 10) }, null);
    const abierta = await showOldestPending(opciones());
    expect(abierta.shownApprovalId).toBe('a');
    // La X del usuario: la ventana desaparece del navegador antes del evento `onRemoved`.
    await chromeStub.windows.remove(1);

    const salida = await handleApprovalWindowRemoved(1, opciones({ now: STUB_EPOCH_MS + 2_000 }));

    expect(salida).toMatchObject({
      handled: true,
      reason: 'cerrada-por-el-usuario',
      status: 'rejected',
      approvalId: 'a',
      delivery: 'none',
      pendingCount: 1,
    });
    expect(salida.refresh?.action).toBe('opened');
    expect(salida.refresh?.shownApprovalId).toBe('b');
    expect(Object.keys(await readPendingRequests())).toEqual(['b']);
    expect(await chromeStub.windows.getAll()).toHaveLength(1);

    const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
    const logs = (items[STORAGE_KEYS.logs] ?? []) as Array<Record<string, unknown>>;
    expect(logs[0]).toMatchObject({
      event: 'approval_resolved',
      level: 'info',
      message: 'Ventana de confirmación cerrada sin respuesta',
      data: { approvalId: 'a', status: 'rejected', errorCode: 4001 },
    });
  });

  it('si el plazo ya venció al cerrar, prevalece `expired` con el 4001 de vencimiento', async () => {
    await sembrar(
      { a: entrada('a', STUB_EPOCH_MS) },
      { windowId: 1, shownApprovalId: 'a', openedAt: STUB_EPOCH_MS, updatedAt: STUB_EPOCH_MS },
    );
    chromeStub.windows.create({ url: 'chrome-extension://abc/notification.html', type: 'popup' });
    await chromeStub.windows.remove(1);

    const salida = await handleApprovalWindowRemoved(
      1,
      opciones({ now: STUB_EPOCH_MS + SIGN_TIMEOUT_MS + 1 }),
    );

    expect(salida).toMatchObject({
      handled: true,
      reason: 'cerrada-con-plazo-vencido',
      status: 'expired',
      approvalId: 'a',
    });
    expect(await readPendingRequests()).toEqual({});
  });

  it('el cierre de una ventana AJENA no rechaza ninguna solicitud', async () => {
    await sembrar({ a: entrada('a', STUB_EPOCH_MS) }, null);
    await showOldestPending(opciones());

    const salida = await handleApprovalWindowRemoved(99, opciones());

    expect(salida).toMatchObject({
      handled: false,
      reason: 'cierre-propio-o-ajeno',
      status: null,
      delivery: 'none',
      refresh: null,
      pendingCount: 1,
    });
    expect(Object.keys(await readPendingRequests())).toEqual(['a']);
    expect(await chromeStub.windows.getAll()).toHaveLength(1);
  });

  it('cerrar con la X sin solicitud mostrada no rechaza nada y normaliza el estado', async () => {
    await sembrar(
      {},
      { windowId: 1, shownApprovalId: null, openedAt: STUB_EPOCH_MS, updatedAt: STUB_EPOCH_MS },
    );
    chromeStub.windows.create({ url: 'chrome-extension://abc/notification.html', type: 'popup' });
    await chromeStub.windows.remove(1);

    const salida = await handleApprovalWindowRemoved(1, opciones());

    expect(salida).toMatchObject({
      handled: false,
      reason: 'no-habia-solicitud-mostrada',
      status: null,
      pendingCount: 0,
    });
    expect(await leerVentana()).toEqual({ windowId: null, shownApprovalId: null });
  });
});
