/**
 * M14.c — `src/background/approvals/responses.ts` (spec del árbol `test/oracle/`)
 * Decisión del usuario sobre la solicitud mostrada (`SIGN_RESPONSE` de `notification.html`):
 * allowlist de ruta (**M20**), idempotencia frente a decisiones duplicadas (**X-06**) y entrega del
 * `4001` a quien esperaba (**RF-41**: «la entrada desaparece de la cola persistida» y la respuesta
 * viaja UNA sola vez por el canal de M17). La ventana única **decide, no firma** (`CA-RF-35`).
 */

import { describe, expect, it } from 'vitest';

import { STUB_EXTENSION_ID, STUB_EPOCH_MS, chromeStub } from '../setup/chrome-stub';
import type { SenderLike } from '../../src/background/security/senderGuard';
import { STORAGE_KEYS } from '../../src/background/state/schema';
import {
  expiredOnArrival,
  handleSignResponse,
  isSignResponse,
  responseTimeoutSeconds,
} from '../../src/background/approvals/responses';
import { readPendingRequests } from '../../src/background/approvals/queue';
import { clearPorts } from '../../src/background/approvals/ports';
import type { PendingRequest, PendingRequestsMap } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Emisor legítimo: la ventana única de ESTA extensión (`notification.html`). */
const EMISOR_NOTIFICATION: SenderLike = {
  id: STUB_EXTENSION_ID,
  url: `chrome-extension://${STUB_EXTENSION_ID}/notification.html`,
  tab: { id: 7 },
  frameId: 0,
};

/** Construye una entrada `pending` de la cola con valores por defecto coherentes. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'personal_sign',
  params: ['hola', CUENTA_0],
  origin: 'https://dapp.example',
  tabId: 7,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + 120_000,
  status: 'pending',
  ...overrides,
});

/** Siembra la cola persistida tal y como la dejaría M14. */
const sembrarCola = async (mapa: PendingRequestsMap): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.pendingRequests]: mapa });
};

/** Entradas de `truekeate_logs` escritas durante la prueba. */
const leerLogs = async (): Promise<Record<string, unknown>[]> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
  return (items[STORAGE_KEYS.logs] ?? []) as Record<string, unknown>[];
};

/** Mensaje `SIGN_RESPONSE` de la ventana. */
const mensaje = (approvalId: string, success: boolean, error?: unknown): unknown => ({
  type: 'SIGN_RESPONSE',
  approvalId,
  success,
  ...(error === undefined ? {} : { error }),
});

describe('M14.c · handleSignResponse: allowlist de ruta e idempotencia (X-06)', () => {
  it('un emisor fuera de la allowlist NO resuelve nada', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });
    const resultado = await handleSignResponse(
      mensaje('id-1', true),
      { id: STUB_EXTENSION_ID, url: `chrome-extension://${STUB_EXTENSION_ID}/index.html` },
      { now: STUB_EPOCH_MS },
    );

    expect(resultado).toMatchObject({
      handled: false,
      reason: 'ruta-no-autorizada',
      approvalId: 'id-1',
      status: null,
      delivery: 'unauthorized',
      refresh: null,
    });
    // La entrada sigue `pending`: la decisión ilegítima no la toca.
    expect(Object.keys(await readPendingRequests())).toEqual(['id-1']);
  });

  it('un emisor de OTRA extensión tampoco decide (4100 → unauthorized)', async () => {
    const resultado = await handleSignResponse(
      mensaje('id-1', true),
      { id: 'otra-extension', url: `chrome-extension://${STUB_EXTENSION_ID}/notification.html` },
      { now: STUB_EPOCH_MS },
    );
    expect(resultado.delivery).toBe('unauthorized');
    expect(resultado.handled).toBe(false);
  });

  it('sin `approvalId` utilizable la decisión se descarta', async () => {
    for (const approvalId of ['', undefined, 42]) {
      const resultado = await handleSignResponse(
        { type: 'SIGN_RESPONSE', approvalId, success: true },
        EMISOR_NOTIFICATION,
        { now: STUB_EPOCH_MS },
      );
      expect(resultado).toMatchObject({ handled: false, reason: 'sin-approvalId', delivery: 'none' });
      expect(resultado.approvalId).toBeNull();
    }
  });

  it('una decisión DUPLICADA no vuelve a resolver ni a registrar nada', async () => {
    await sembrarCola({ 'id-dup': entrada('id-dup') });

    const primera = await handleSignResponse(mensaje('id-dup', true), EMISOR_NOTIFICATION, {
      now: STUB_EPOCH_MS,
      refresh: false,
    });
    expect(primera.handled).toBe(true);
    expect(primera.status).toBe('approved');

    const segunda = await handleSignResponse(mensaje('id-dup', true), EMISOR_NOTIFICATION, {
      now: STUB_EPOCH_MS,
      refresh: false,
    });
    expect(segunda).toMatchObject({
      handled: false,
      reason: 'ya-resuelta',
      status: null,
      delivery: 'already-resolved',
      refresh: null,
    });
    expect(await leerLogs()).toHaveLength(1);
  });
});

describe('M14.c · aprobación, rechazo y vencimiento', () => {
  it('aprobación: la entrada sale de la cola, se traza como info y la ventana pasa a la siguiente', async () => {
    await sembrarCola({ 'id-ok': entrada('id-ok'), 'id-siguiente': entrada('id-siguiente', { createdAt: STUB_EPOCH_MS + 1 }) });

    const resultado = await handleSignResponse(mensaje('id-ok', true), EMISOR_NOTIFICATION, {
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({
      handled: true,
      reason: 'aprobada',
      approvalId: 'id-ok',
      status: 'approved',
      // En la aprobación la respuesta la produce el despacho (hash o firma): aquí solo se registra.
      delivery: 'none',
    });
    // La MISMA ventana única pasa a la siguiente `pending` (M18): aquí no había ninguna abierta.
    expect(resultado.refresh?.action).toBe('opened');
    expect(resultado.refresh?.shownApprovalId).toBe('id-siguiente');
    expect(resultado.refresh?.windowId).not.toBeNull();
    expect(resultado.refresh?.pendingCount).toBe(1);
    expect(Object.keys(await readPendingRequests())).toEqual(['id-siguiente']);

    const logs = await leerLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'approval_resolved',
      category: 'event',
      level: 'info',
      origin: 'https://dapp.example',
      method: 'personal_sign',
    });
    expect((logs[0]?.data as { errorCode: number | null }).errorCode).toBeNull();
  });

  it('rechazo con error de la ventana: se entrega ESE error a la pestaña del frame exacto', async () => {
    await sembrarCola({
      'id-no': entrada('id-no', { tabId: 7, frameId: 3, origin: 'https://otra.example' }),
    });
    const entregados: unknown[] = [];
    chromeStub.tabs.setMessageHandler(7, (message) => {
      entregados.push(message);
      return 'ok';
    });

    const resultado = await handleSignResponse(
      mensaje('id-no', false, { code: 4001, message: 'El usuario rechazó en la ventana.' }),
      EMISOR_NOTIFICATION,
      { now: STUB_EPOCH_MS, refresh: false },
    );

    expect(resultado).toMatchObject({
      handled: true,
      reason: 'rejected',
      status: 'rejected',
      delivery: 'tab',
      refresh: null,
    });
    expect(entregados).toHaveLength(1);
    expect(entregados[0]).toMatchObject({
      type: 'TRUEKEATE_RESPONSE',
      error: { code: 4001, message: 'El usuario rechazó en la ventana.' },
    });
    const logs = await leerLogs();
    expect(logs[0]).toMatchObject({ level: 'warn' });
    expect((logs[0]?.data as { errorCode: number }).errorCode).toBe(4001);
  });

  it('rechazo SIN error de la ventana: se usa el literal único de §4.3 (4001)', async () => {
    await sembrarCola({ 'id-no-error': entrada('id-no-error', { tabId: null }) });

    const resultado = await handleSignResponse(mensaje('id-no-error', false), EMISOR_NOTIFICATION, {
      now: STUB_EPOCH_MS,
      refresh: false,
    });

    expect(resultado.reason).toBe('rejected');
    expect(resultado.delivery).toBe('none');
    const logs = await leerLogs();
    expect(logs[0]).toMatchObject({ event: 'approval_resolved', level: 'warn' });
  });

  it('un `error` malformado de la ventana NO se propaga: se degrada al 4001 del catálogo', async () => {
    await sembrarCola({ 'id-error-raro': entrada('id-error-raro', { tabId: null }) });

    const resultado = await handleSignResponse(
      mensaje('id-error-raro', false, { message: 'sin code' }),
      EMISOR_NOTIFICATION,
      { now: STUB_EPOCH_MS, refresh: false },
    );

    expect(resultado.status).toBe('rejected');
    const evento = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) as Record<string, unknown>;
    expect(evento[STORAGE_KEYS.logs]).toHaveLength(1);
  });

  it('si el plazo ya venció, prevalece `expired` y el 4001 cita los 120 s', async () => {
    await sembrarCola({
      'id-vencida': entrada('id-vencida', { expiresAt: STUB_EPOCH_MS - 1, tabId: null }),
    });

    const resultado = await handleSignResponse(mensaje('id-vencida', true), EMISOR_NOTIFICATION, {
      now: STUB_EPOCH_MS,
      refresh: false,
    });

    expect(resultado).toMatchObject({ handled: true, reason: 'expired', status: 'expired' });
    const logs = await leerLogs();
    expect(logs[0]).toMatchObject({ level: 'warn' });
    expect((logs[0]?.data as { errorCode: number }).errorCode).toBe(4001);
  });
});

describe('M14.c · predicados y literales del módulo', () => {
  it('isSignResponse reconoce el mensaje del protocolo y descarta lo demás', () => {
    expect(isSignResponse({ type: 'SIGN_RESPONSE', approvalId: 'x', success: true })).toBe(true);
    expect(isSignResponse({ type: 'CONNECT_RESPONSE' })).toBe(false);
    expect(isSignResponse({ type: 'INVENTADO' })).toBe(false);
    expect(isSignResponse(null)).toBe(false);
    expect(isSignResponse('SIGN_RESPONSE')).toBe(false);
  });

  it('expiredOnArrival distingue la solicitud vencida y responseTimeoutSeconds cita 120 s', () => {
    expect(expiredOnArrival(entrada('viva'), STUB_EPOCH_MS)).toBe(false);
    expect(expiredOnArrival(entrada('muerta', { expiresAt: STUB_EPOCH_MS }), STUB_EPOCH_MS)).toBe(true);
    // Sin `expiresAt` numérico no se declara vencida.
    expect(expiredOnArrival(entrada('sin-plazo', { expiresAt: Number.NaN }), STUB_EPOCH_MS)).toBe(false);
    expect(responseTimeoutSeconds()).toBe(120);
  });

  it('la entrega por puerto vivo tiene PRIORIDAD sobre la pestaña (M17)', async () => {
    clearPorts();
    await sembrarCola({ 'id-puerto': entrada('id-puerto', { tabId: 7 }) });
    const { bindPort } = await import('../../src/background/approvals/ports');
    const publicados: unknown[] = [];
    let desconectado = false;
    bindPort('id-puerto', {
      name: 'truekeate_approval',
      postMessage: (message) => publicados.push(message),
      disconnect: () => {
        desconectado = true;
      },
      onMessage: { addListener: () => undefined },
      onDisconnect: { addListener: () => undefined },
    });

    const resultado = await handleSignResponse(mensaje('id-puerto', false), EMISOR_NOTIFICATION, {
      now: STUB_EPOCH_MS,
      refresh: false,
    });

    expect(resultado.delivery).toBe('port');
    expect(desconectado).toBe(true);
    expect(publicados[0]).toMatchObject({ type: 'TRUEKEATE_RESPONSE', id: 'id-puerto' });
  });
});
