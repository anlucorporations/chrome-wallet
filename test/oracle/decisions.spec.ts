/**
 * M14.b — `src/background/approvals/decisions.ts` (spec del árbol `test/oracle/`)
 * Registro de ESPERA de la decisión de una solicitud de aprobación (**RF-37**: la ventana única
 * decide y el Service Worker resuelve; el `await` del router se despierta una sola vez) y su
 * contrato observable: `ok: true` con la resolución, `abandoned` cuando la entrada se descarta, y
 * contadores de diagnóstico. Estado volátil admisible (§2.3): el mapa de esperas NUNCA es fuente
 * de verdad —lo es la cola persistida de M14 (RF-41)—.
 */

import { describe, expect, it } from 'vitest';

import {
  abandonApprovalDecision,
  clearApprovalDecisions,
  countApprovalWaiters,
  settleApprovalDecision,
  totalApprovalWaiters,
  waitForApprovalResolution,
} from '../../src/background/approvals/decisions';
import type { ResolvedRequest } from '../../src/background/approvals/queue';
import type { PendingRequest } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Entrada persistida mínima de la cola (forma de §2.8). */
const entrada = (approvalId: string): PendingRequest => ({
  approvalId,
  method: 'personal_sign',
  params: ['hola', CUENTA_0],
  origin: 'https://dapp.example',
  tabId: 3,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_000_120_000,
  status: 'pending',
});

/** Resolución de una aprobación (forma de `ResolvedRequest`). */
const resuelta = (approvalId: string, status: 'approved' | 'rejected'): ResolvedRequest => ({
  request: { ...entrada(approvalId), status },
  status,
  resolvedAt: 1_700_000_010_000,
  ...(status === 'approved' ? {} : { errorCode: 4001 }),
});

describe('M14.b · espera y desenlace de la decisión (RF-37)', () => {
  it('TODAS las esperas de la misma solicitud despiertan con el MISMO desenlace', async () => {
    const primera = waitForApprovalResolution('id-1');
    const segunda = waitForApprovalResolution('id-1');

    expect(countApprovalWaiters('id-1')).toBe(2);
    expect(totalApprovalWaiters()).toBe(2);

    const resolution = resuelta('id-1', 'approved');
    settleApprovalDecision(resolution);

    await expect(primera.decision).resolves.toEqual({ ok: true, resolution });
    await expect(segunda.decision).resolves.toEqual({ ok: true, resolution });
    // El desenlace RETIRA las esperas: no quedan observadores colgados.
    expect(countApprovalWaiters('id-1')).toBe(0);
    expect(totalApprovalWaiters()).toBe(0);
  });

  it('`abandoned` avisa a quien esperaba una solicitud descartada (purga de M16)', async () => {
    const espera = waitForApprovalResolution('id-2');
    abandonApprovalDecision('id-2');

    await expect(espera.decision).resolves.toEqual({
      ok: false,
      resolution: null,
      reason: 'abandoned',
    });
    expect(countApprovalWaiters('id-2')).toBe(0);
  });

  it('`cancel` da de baja SOLO su espera y limpia el mapa cuando se queda vacío', async () => {
    const primera = waitForApprovalResolution('id-3');
    const segunda = waitForApprovalResolution('id-3');

    primera.cancel();
    expect(countApprovalWaiters('id-3')).toBe(1);
    expect(totalApprovalWaiters()).toBe(1);

    segunda.cancel();
    expect(countApprovalWaiters('id-3')).toBe(0);
    // Cancelar dos veces es inocuo: la segunda vez ya no hay cúpula que retirar.
    expect(() => primera.cancel()).not.toThrow();
    expect(totalApprovalWaiters()).toBe(0);
  });

  it('resolver o abandonar SIN esperas vivas es idempotente y no lanza', () => {
    expect(() => settleApprovalDecision(resuelta('id-sin-esperas', 'rejected'))).not.toThrow();
    expect(() => abandonApprovalDecision('id-sin-esperas')).not.toThrow();
    expect(countApprovalWaiters('id-sin-esperas')).toBe(0);
  });

  it('los contadores agregan varias solicitudes y clearApprovalDecisions vacía el registro', () => {
    const uno = waitForApprovalResolution('a');
    const dos = waitForApprovalResolution('b');
    const tres = waitForApprovalResolution('b');

    expect(countApprovalWaiters('a')).toBe(1);
    expect(countApprovalWaiters('b')).toBe(2);
    expect(countApprovalWaiters('inexistente')).toBe(0);
    expect(totalApprovalWaiters()).toBe(3);

    clearApprovalDecisions();
    expect(totalApprovalWaiters()).toBe(0);

    // Las esperas retiradas ya no reciben desenlace: siguen pendientes (estado volátil).
    let despertada = false;
    void uno.decision.then(() => {
      despertada = true;
    });
    dos.cancel();
    tres.cancel();
    expect(despertada).toBe(false);
  });
});
