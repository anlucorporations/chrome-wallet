/**
 * M14/M3.b — `src/background/approvals/approvalRateWindow.spec.ts`
 * La ventana de **6 solicitudes aprobables por minuto** de §2.8/§2.13, vista desde la COLA.
 *
 * Requisitos: RF-37 (`CA-RF-37`, cardinalidad y tasa) y RNF-16 (RNF-08/RNF-16).
 *
 * HUECO QUE CUBRE (fase 4): `queue.spec.ts` comprueba que la 7.ª solicitud DENTRO de los mismos
 * 60 s se rechaza, pero nunca que la ventana se REINICIE al pasar el minuto. `normalizeRateWindow`
 * devolvía el reinicio de `tokens` y de `approvalWindowStart` sin tocar `approvalsInWindow`, así
 * que la PRIMERA solicitud de la ventana nueva seguía viendo el contador en 6 y recibía `4001`;
 * como el rechazo retorna antes de persistir, el origen quedaba bloqueado indefinidamente
 * (`diccionario_datos.md` §2.13 regla (4): «si `now - approvalWindowStart >= 60000` la ventana se
 * reinicia con `approvalsInWindow = 0`»).
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../../test/setup/chrome-stub';
import { RATE_WINDOW_MS, rateLimitWindowRequests, pendingRequestsPerMinute } from '../../shared/constants';
import type { RateWindow } from '../../shared/types';
import { STORAGE_KEYS } from '../state/schema';
import { freshRateWindow, normalizeRateWindow, decideRateLimit } from '../rpc/rateLimit';
import { enqueueApprovalRequest, readPendingRequests, type PendingRequestDraft } from './queue';

/** Cuenta #0 de Anvil: la `from` de todas las solicitudes. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Origen de la dApp de pruebas (clave canónica normalizada, §2.7). */
const ORIGEN_DAPP = 'http://localhost:5174';

/** Borrador válido de `eth_sendTransaction` sobre la cuenta #0. */
const borrador = (overrides: Partial<PendingRequestDraft> = {}): PendingRequestDraft => ({
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0, value: '0x2386f26fc10000' }],
  origin: ORIGEN_DAPP,
  tabId: 7,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  ...overrides,
});

/** La ventana de tasa persistida de un origen. */
const ventanaPersistida = async (origin: string): Promise<RateWindow | undefined> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.rateWindows)) as Record<
    string,
    Record<string, RateWindow>
  >;
  return items[STORAGE_KEYS.rateWindows]?.[origin];
};

describe('M3.b · la ventana de 6 aprobables por minuto SE REINICIA al vencer', () => {
  it('seis altas agotan la ventana y la SÉPTIMA se rechaza con 4001 (control positivo)', async () => {
    for (let indice = 0; indice < pendingRequestsPerMinute; indice += 1) {
      const aceptada = await enqueueApprovalRequest(borrador(), {
        now: STUB_EPOCH_MS,
        approvalId: `ventana-${indice}`,
        maxPendingPerOrigin: 10,
      });
      expect(aceptada.ok, `el alta ${indice + 1} debería caber en la ventana`).toBe(true);
    }

    const septima = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS + 1_000,
      approvalId: 'ventana-6',
      maxPendingPerOrigin: 10,
    });
    expect(septima.ok).toBe(false);
    if (septima.ok) return;
    expect(septima.error.code).toBe(4001);
    expect(septima.error.data).toEqual({
      reason: 'rate-limit',
      origin: ORIGEN_DAPP,
      perMinute: pendingRequestsPerMinute,
    });
  });

  it('pasados 60 s la ventana se reinicia y la solicitud vuelve a ACEPTARSE', async () => {
    // DEFECTO MEDIDO Y CORREGIDO (fase 4): antes esta misma secuencia respondía `4001`
    // `rate-limit` porque `approvalsInWindow` seguía valiendo 6 en la ventana nueva.
    for (let indice = 0; indice < pendingRequestsPerMinute; indice += 1) {
      const aceptada = await enqueueApprovalRequest(borrador(), {
        now: STUB_EPOCH_MS,
        approvalId: `reinicio-${indice}`,
        maxPendingPerOrigin: 10,
      });
      expect(aceptada.ok, `el alta ${indice + 1} debería caber`).toBe(true);
    }

    // Un minuto y un segundo después (la ventana ya venció) la cola vuelve a admitir.
    const despues = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS + RATE_WINDOW_MS + 1_000,
      approvalId: 'reinicio-nueva-ventana',
      maxPendingPerOrigin: 10,
    });
    expect(despues.ok, 'la ventana vencida debe reiniciarse').toBe(true);
    if (!despues.ok) return;
    expect(despues.request.approvalId).toBe('reinicio-nueva-ventana');

    // Y la ventana persistida arranca el contador de aprobables desde 1, no desde 7.
    const ventana = await ventanaPersistida(ORIGEN_DAPP);
    expect(ventana?.approvalsInWindow).toBe(1);
    expect(ventana?.approvalWindowStart).toBe(STUB_EPOCH_MS + RATE_WINDOW_MS + 1_000);
    // El *token bucket* es un contador DISTINTO: esta ruta (la cola) no lo consume; quien lo
    // consume es el paso 5 del router (`decideRateLimit`).
    expect(ventana?.tokens).toBe(rateLimitWindowRequests);
  });

  it('el origen NO queda bloqueado: las tres ventanas consecutivas admiten', async () => {
    // La regresión era permanente: el rechazo retornaba ANTES de persistir, así que
    // `approvalWindowStart` nunca se refrescaba y el origen seguía bloqueado en cada reintento.
    for (let indice = 0; indice < pendingRequestsPerMinute; indice += 1) {
      await enqueueApprovalRequest(borrador(), {
        now: STUB_EPOCH_MS,
        approvalId: `bloqueo-${indice}`,
        maxPendingPerOrigin: 10,
        maxPending: 20,
      });
    }
    // Cada ventana nueva (61 s después de la anterior) admite una solicitud. Las 6 originales
    // vencen a los 120 s (`SIGN_TIMEOUT_MS`), de modo que en la 2.ª ventana se purgan como
    // huérfanas —el número exacto de huérfanas es una magnitud medible de la purga perezosa—.
    const huerfanas: number[] = [];
    for (const [indice, now] of [1, 2, 3].entries()) {
      const alta = await enqueueApprovalRequest(borrador(), {
        now: STUB_EPOCH_MS + (indice + 1) * (RATE_WINDOW_MS + 1_000),
        approvalId: `desbloqueo-${indice}`,
        maxPendingPerOrigin: 10,
        maxPending: 20,
      });
      expect(alta.ok, `la ventana ${indice + 1} debería admitir`).toBe(true);
      if (!alta.ok) return;
      huerfanas.push(alta.purgedExpired.length);
    }
    expect(huerfanas).toEqual([0, 6, 1]);
    // Y la cola queda con las solicitudes que NO han vencido (la última ventana y la anterior).
    const pendientes = Object.keys(await readPendingRequests());
    expect(pendientes.sort()).toEqual(['desbloqueo-1', 'desbloqueo-2']);
  });
});

describe('M3.b/§2.13 · `approvalsInWindow` cuenta SOLO solicitudes aprobables', () => {
  it('una aprobación que pasa por el router cuenta UNA vez, no dos', async () => {
    // El router ejecuta el paso 5 (`decideRateLimit`) y DESPUÉS encola. Antes, las dos
    // incrementaban el contador: una aprobación valía por dos y el límite efectivo era de 3 por
    // minuto. Aquí se mide la magnitud exacta que queda persistida.
    const decision = await decideRateLimit({ origin: ORIGEN_DAPP, now: STUB_EPOCH_MS });
    expect(decision.allowed).toBe(true);
    expect(decision.window.approvalsInWindow).toBe(0);

    const alta = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'contada-una-vez',
      maxPendingPerOrigin: 10,
    });
    expect(alta.ok).toBe(true);
    expect((await ventanaPersistida(ORIGEN_DAPP))?.approvalsInWindow).toBe(1);
  });

  it('las lecturas del catálogo NO consumen la ventana de aprobables', async () => {
    // Tres lecturas del mismo origen (lo que hace el *polling* de una dApp hostil) no pueden
    // acercar a nadie al límite de aprobaciones.
    for (let lectura = 0; lectura < 3; lectura += 1) {
      const decision = await decideRateLimit({ origin: ORIGEN_DAPP, now: STUB_EPOCH_MS });
      expect(decision.allowed).toBe(true);
      // El bucket sí baja (es la defensa contra la saturación)…
      expect(decision.window.tokens).toBe(rateLimitWindowRequests - lectura - 1);
      // …pero el contador de aprobables no se mueve.
      expect(decision.window.approvalsInWindow).toBe(0);
    }
    expect((await ventanaPersistida(ORIGEN_DAPP))?.approvalsInWindow).toBe(0);

    // Con la ventana de aprobables intacta, una aprobación sigue cabiendo.
    const alta = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'tras-lecturas',
      maxPendingPerOrigin: 10,
    });
    expect(alta.ok).toBe(true);
    expect((await ventanaPersistida(ORIGEN_DAPP))?.approvalsInWindow).toBe(1);
  });
});

describe('M3.b · `normalizeRateWindow` reinicia el contador de aprobables al vencer', () => {
  it('con la ventana vencida devuelve tokens llenos, inicio nuevo y `approvalsInWindow` a 0', () => {
    const agotada: RateWindow = {
      ...freshRateWindow(STUB_EPOCH_MS),
      tokens: 0,
      approvalsInWindow: 6,
      deniedCount: 3,
    };

    const reiniciada = normalizeRateWindow(agotada, STUB_EPOCH_MS + RATE_WINDOW_MS);
    expect(reiniciada.tokens).toBe(rateLimitWindowRequests);
    expect(reiniciada.approvalWindowStart).toBe(STUB_EPOCH_MS + RATE_WINDOW_MS);
    expect(reiniciada.approvalsInWindow).toBe(0);
    // El contador de rechazos es DIAGNÓSTICO y se conserva: no es un dato de la ventana.
    expect(reiniciada.deniedCount).toBe(3);
  });

  it('justo un milisegundo ANTES del vencimiento la ventana NO se reinicia', () => {
    const agotada: RateWindow = {
      ...freshRateWindow(STUB_EPOCH_MS),
      tokens: 0,
      approvalsInWindow: 6,
    };
    const intacta = normalizeRateWindow(agotada, STUB_EPOCH_MS + RATE_WINDOW_MS - 1);
    expect(intacta.approvalsInWindow).toBe(6);
    expect(intacta.tokens).toBe(0);
    expect(intacta.approvalWindowStart).toBe(STUB_EPOCH_MS);
  });

  it('con el reloj movido hacia atrás el reinicio también deja el contador a 0', () => {
    const futura: RateWindow = {
      tokens: 0,
      lastRefillAt: STUB_EPOCH_MS + 10_000,
      approvalWindowStart: STUB_EPOCH_MS + 10_000,
      approvalsInWindow: 6,
      deniedCount: 0,
      updatedAt: STUB_EPOCH_MS,
    };
    const reiniciada = normalizeRateWindow(futura, STUB_EPOCH_MS);
    expect(reiniciada.tokens).toBe(rateLimitWindowRequests);
    expect(reiniciada.approvalsInWindow).toBe(0);
    expect(reiniciada.approvalWindowStart).toBe(STUB_EPOCH_MS);
  });
});
