/**
 * M14 / M22 — `src/background/approvals/payloadLimit.spec.ts`
 * Cota de payload de **64 KiB** (H4, tarea 4.8 de `plan_desarrollo.md` §3.4.5; ADT-21 / D-L).
 *
 * Regla que fija este fichero: un payload de `params` cuyo tamaño serializado supere
 * `MAX_PAYLOAD_BYTES` (65 536 bytes) se responde con **`-32602` (`payloadTooLarge`) SIN persistir
 * nada, sin tocar la ventana de tasa y sin abrir ventana**; la medida es en **bytes UTF-8**, no en
 * caracteres.
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../../test/setup/chrome-stub';
import { MAX_PAYLOAD_BYTES } from '../../shared/constants';
import { measurePayloadBytes } from '../security/redaction';
import { STORAGE_KEYS } from '../state/schema';
import { enqueueApprovalRequest, type PendingRequestDraft } from './queue';

/** Cuenta #0 de Anvil. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Origen de la dApp de pruebas. */
const ORIGEN_DAPP = 'http://localhost:5174';

/** Borrador válido de `eth_sendTransaction` cuyo `data` es lo que se dimensiona. */
const borradorConPayload = (params: unknown[]): PendingRequestDraft => ({
  method: 'eth_sendTransaction',
  params,
  origin: ORIGEN_DAPP,
  tabId: 3,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
});

/** `params` cuyo JSON serializado mide EXACTAMENTE `bytesObjetivo` bytes en UTF-8. */
const payloadDeTamanoExacto = (bytesObjetivo: number): unknown[] => {
  const plantilla = [{ data: '0x' }];
  const relleno = bytesObjetivo - measurePayloadBytes(plantilla);
  expect(relleno).toBeGreaterThan(0);
  return [{ data: `0x${'a'.repeat(relleno)}` }];
};

/** Claves realmente escritas por el módulo (auditoría del «sin persistir»). */
const clavesEscritas = (): string[] =>
  chromeStub.storage.local
    .writes()
    .flatMap((escritura) => Object.keys(escritura));

describe('M14 · cota de payload de 64 KiB (tarea 4.8, -32602 sin persistir)', () => {
  it('acepta un payload de EXACTAMENTE 64 KiB y lo persiste', async () => {
    const params = payloadDeTamanoExacto(MAX_PAYLOAD_BYTES);
    expect(measurePayloadBytes(params)).toBe(65_536);
    expect(MAX_PAYLOAD_BYTES).toBe(65_536);

    const resultado = await enqueueApprovalRequest(borradorConPayload(params), {
      now: STUB_EPOCH_MS,
      approvalId: 'justo-en-el-limite',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.request.params).toEqual(params);
    expect(clavesEscritas()).toEqual([STORAGE_KEYS.pendingRequests, STORAGE_KEYS.rateWindows]);
  });

  it('rechaza con -32602 un payload de 64 KiB + 1 byte, sin persistir ni abrir ventana', async () => {
    const params = payloadDeTamanoExacto(MAX_PAYLOAD_BYTES + 1);
    expect(measurePayloadBytes(params)).toBe(65_537);

    const resultado = await enqueueApprovalRequest(borradorConPayload(params), {
      now: STUB_EPOCH_MS,
      approvalId: 'un-byte-de-mas',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32602);
    expect(resultado.error.message).toBe('La carga útil de la solicitud supera el límite de 64 KiB.');
    expect(resultado.error.data).toEqual({ payloadBytes: 65_537, maxPayloadBytes: 65_536 });
    // Sin persistir NADA: ni la cola, ni la ventana de tasa (ni siquiera un intento de escritura).
    expect(chromeStub.storage.local.writes()).toEqual([]);
    expect(await chromeStub.storage.local.get(null)).toEqual({});
    // Ni ventana: el rechazo ocurre antes de cualquier apertura (M18).
    expect(await chromeStub.windows.getAll()).toEqual([]);
    expect(chromeStub.action.badgeText()).toBe('');
  });

  it('mide en bytes UTF-8: 32 761 caracteres «á» (65 537 bytes) se rechazan', async () => {
    const caracteres = 32_761;
    const params = [{ data: `0x${'á'.repeat(caracteres)}` }];
    const caracteresDelJson = JSON.stringify(params).length;

    expect(caracteresDelJson).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect(measurePayloadBytes(params)).toBe(65_537);

    const rechazado = await enqueueApprovalRequest(borradorConPayload(params), {
      now: STUB_EPOCH_MS,
      approvalId: 'utf8-largo',
    });
    expect(rechazado.ok).toBe(false);
    if (rechazado.ok) return;
    expect(rechazado.error.code).toBe(-32602);
    expect(rechazado.error.data).toEqual({ payloadBytes: 65_537, maxPayloadBytes: 65_536 });

    // Un carácter menos (65 535 bytes) sí entra: la cota es de BYTES, no de caracteres.
    const menor = [{ data: `0x${'á'.repeat(caracteres - 1)}` }];
    expect(measurePayloadBytes(menor)).toBe(65_535);
    const aceptado = await enqueueApprovalRequest(borradorConPayload(menor), {
      now: STUB_EPOCH_MS,
      approvalId: 'utf8-corto',
    });
    expect(aceptado.ok).toBe(true);
  });

  it('un payload no serializable se mide como infinito y se rechaza con -32602 sin persistir', async () => {
    const params = [1n];
    expect(measurePayloadBytes(params)).toBe(Number.POSITIVE_INFINITY);

    const resultado = await enqueueApprovalRequest(borradorConPayload(params), {
      now: STUB_EPOCH_MS,
      approvalId: 'bigint',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32602);
    expect(resultado.error.data).toEqual({
      payloadBytes: Number.POSITIVE_INFINITY,
      maxPayloadBytes: 65_536,
    });
    expect(chromeStub.storage.local.writes()).toEqual([]);
  });

  it('respeta el tope inyectado: 100 bytes pasa, 101 se rechaza', async () => {
    const justo = payloadDeTamanoExacto(100);
    expect(measurePayloadBytes(justo)).toBe(100);
    const aceptado = await enqueueApprovalRequest(borradorConPayload(justo), {
      now: STUB_EPOCH_MS,
      approvalId: 'tope-100',
      maxPayloadBytes: 100,
    });
    expect(aceptado.ok).toBe(true);

    chromeStub.reset();
    const excedido = payloadDeTamanoExacto(101);
    expect(measurePayloadBytes(excedido)).toBe(101);
    const rechazado = await enqueueApprovalRequest(borradorConPayload(excedido), {
      now: STUB_EPOCH_MS,
      approvalId: 'tope-101',
      maxPayloadBytes: 100,
    });
    expect(rechazado.ok).toBe(false);
    if (rechazado.ok) return;
    expect(rechazado.error.data).toEqual({ payloadBytes: 101, maxPayloadBytes: 100 });
    expect(chromeStub.storage.local.writes()).toEqual([]);
  });

  it('el payload rechazado no consume cardinalidad: después cabe una solicitud válida', async () => {
    const enorme = payloadDeTamanoExacto(MAX_PAYLOAD_BYTES * 2);
    const rechazado = await enqueueApprovalRequest(borradorConPayload(enorme), {
      now: STUB_EPOCH_MS,
      approvalId: 'enorme',
    });
    expect(rechazado.ok).toBe(false);

    const valida = await enqueueApprovalRequest(
      borradorConPayload([{ from: CUENTA_0, to: CUENTA_0, value: '0x1' }]),
      { now: STUB_EPOCH_MS, approvalId: 'valida' },
    );
    expect(valida.ok).toBe(true);
    if (!valida.ok) return;
    expect(valida.pendingCount).toBe(1);
  });
});
