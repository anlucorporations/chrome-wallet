/**
 * `src/background/polling.spec.ts` — Polling de saldos: contador de RPC por ciclo (M47, tarea 3.12).
 *
 * `CA-RF-27` / RNF-03 (§3.3.6): **exactamente 1 `eth_getBalance` por cuenta VISIBLE y ciclo** de
 * 5 s; el ciclo arranca al abrir la vista, **para** al cerrarla y **al cambiar de cuenta activa**, y
 * se **suspende** si el nodo no responde. Un contador mayor que «1 por cuenta visible» invalida el
 * hito.
 *
 * El contador se mide sobre una instancia REAL del hook (React 19 + jsdom) interceptando
 * `chrome.runtime.sendMessage`: es el mismo canal por el que el popup pide los saldos al Service
 * Worker. Los tiempos se controlan con *fake timers*, de modo que un ciclo de 5 s no cuesta 5 s.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chromeStub } from '../../test/setup/chrome-stub';
import type { AccountRef, Address } from '../shared/types';
import {
  BALANCE_METHOD,
  BALANCE_POLL_INTERVAL_MS,
  BALANCE_POLL_MAX_VISIBLE,
  balanceStatusLabel,
  pollTargets,
  useBalancePolling,
  type BalanceTarget,
  type UseBalancePollingResult,
} from '../popup/hooks/useBalancePolling';

// React avisa si se renderiza fuera de `act`; el entorno de pruebas lo declara explícitamente.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Saldo hexadecimal que devuelve el canal simulado (1 ETH = 10^18 wei). */
const SALDO_HEX = '0xde0b6b3a7640000';

/** Cuenta de prueba: referencia + dirección. */
const target = (indice: number): BalanceTarget => ({
  ref: `idx:${indice}` as AccountRef,
  address: `0x${String(indice + 1).padStart(40, '0')}` as Address,
});

/** Estado observado del último render del componente de prueba. */
const estado: { actual: UseBalancePollingResult | null } = { actual: null };

/** Props del componente que ejercita el hook. */
interface HarnessProps {
  accounts: readonly BalanceTarget[];
  currentAccount: AccountRef | null;
  enabled: boolean;
}

/** Componente de prueba: publica el resultado del hook en cada render. */
const Harness = ({ accounts, currentAccount, enabled }: HarnessProps): null => {
  estado.actual = useBalancePolling({ accounts, currentAccount, enabled });
  return null;
};

/** Resultado del hook en el último render (falla el test si el componente no llegó a pintarse). */
const hook = (): UseBalancePollingResult => {
  if (estado.actual === null) {
    throw new Error('[polling.spec] el componente de prueba no llegó a renderizarse');
  }
  return estado.actual;
};

let container: HTMLDivElement;
let root: Root;
let sendMessage: ReturnType<typeof spySendMessage>;

/** Monta (o re-renderiza) el componente de prueba con las props dadas. */
const montar = async (props: Partial<HarnessProps> = {}): Promise<void> => {
  const completas: HarnessProps = {
    accounts: [target(0), target(1), target(2)],
    currentAccount: 'idx:0' as AccountRef,
    enabled: true,
    ...props,
  };
  await act(async () => {
    root.render(createElement(Harness, completas));
  });
};

/** Deja correr la microcola lo suficiente para que un ciclo completo termine. */
const asentar = async (vueltas = 24): Promise<void> => {
  for (let vuelta = 0; vuelta < vueltas; vuelta += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

/** Avanza el reloj simulado `ciclos` periodos de polling y asienta las promesas. */
const avanzarCiclos = async (ciclos: number): Promise<void> => {
  for (let ciclo = 0; ciclo < ciclos; ciclo += 1) {
    await act(async () => {
      vi.advanceTimersByTime(BALANCE_POLL_INTERVAL_MS);
    });
    await asentar();
  }
};

/** Espía del canal del runtime: registra los sobres `TRUEKEATE_RPC` que emite el hook. */
const spySendMessage = () =>
  vi.spyOn(chromeStub.runtime, 'sendMessage').mockResolvedValue({ result: SALDO_HEX });

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  estado.actual = null;
  sendMessage = spySendMessage();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('M47 · 1 eth_getBalance por cuenta visible y ciclo (CA-RF-27 / RNF-03)', () => {
  it('el primer ciclo emite EXACTAMENTE una lectura por cuenta visible', async () => {
    await montar();
    await asentar();

    expect(hook().requestCount, 'un ciclo con 3 cuentas visibles debe emitir 3 RPC').toBe(3);
    expect(hook().cycleCount).toBe(1);
    expect(hook().skippedCycles, 'ningún ciclo puede solaparse').toBe(0);
    expect(hook().status).toBe('ready');

    const metodos = sendMessage.mock.calls.map((llamada) => {
      const sobre = llamada[0] as { method: string; params: unknown[] };
      return sobre.method;
    });
    expect(metodos).toEqual([BALANCE_METHOD, BALANCE_METHOD, BALANCE_METHOD]);
    // Cada llamada lleva la dirección de UNA cuenta visible y su bloque.
    const direcciones = sendMessage.mock.calls.map(
      (llamada) => (llamada[0] as { params: unknown[] }).params[0],
    );
    expect(new Set(direcciones).size).toBe(3);
    expect(direcciones).toContain(target(2).address);
  });

  it('los ciclos siguientes respetan la misma razón (3 por ciclo) y el periodo de 5 s', async () => {
    await montar();
    await asentar();
    expect(hook().requestCount).toBe(3);

    await avanzarCiclos(2);
    expect(hook().requestCount, '2 ciclos más × 3 cuentas visibles').toBe(9);
    expect(hook().cycleCount).toBe(3);

    // El periodo es el normativo: un avance de 4 999 ms NO dispara un ciclo nuevo.
    await act(async () => {
      vi.advanceTimersByTime(BALANCE_POLL_INTERVAL_MS - 1);
    });
    await asentar();
    expect(hook().cycleCount).toBe(3);
    expect(hook().requestCount).toBe(9);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await asentar();
    expect(hook().cycleCount).toBe(4);
    expect(hook().requestCount).toBe(12);
  });

  it('cerrar la vista PARA el ciclo: no se emite ninguna lectura más', async () => {
    await montar();
    await asentar();
    expect(hook().requestCount).toBe(3);

    await montar({ enabled: false });
    await asentar();
    expect(hook().status).toBe('idle');

    await avanzarCiclos(3);
    expect(hook().requestCount, 'con la vista cerrada no puede haber más RPC').toBe(3);
    expect(hook().cycleCount).toBe(1);
  });

  it('cambiar de cuenta activa reinicia el ciclo sin esperar los 5 s', async () => {
    await montar();
    await asentar();
    expect(hook().requestCount).toBe(3);

    await montar({ currentAccount: 'idx:1' as AccountRef });
    await asentar();
    expect(hook().requestCount, 'el reinicio emite un ciclo nuevo de inmediato').toBe(6);
    expect(hook().cycleCount).toBe(2);
  });

  it('solo se pollean las cuentas VISIBLES, recortadas al tope de 10 por ciclo', () => {
    const visibles = [0, 1, 2].map(target);
    expect(pollTargets(visibles)).toHaveLength(3);
    const doce = Array.from({ length: 12 }, (_, indice) => target(indice));
    expect(pollTargets(doce)).toHaveLength(BALANCE_POLL_MAX_VISIBLE);
    expect(BALANCE_POLL_MAX_VISIBLE).toBe(10);
    expect(BALANCE_POLL_INTERVAL_MS).toBe(5_000);
    expect(pollTargets([])).toHaveLength(0);
  });

  it('si el nodo no responde el ciclo se SUSPENDE y no se reprograma', async () => {
    sendMessage.mockResolvedValue({
      error: { code: 4900, message: 'Sin conexión con la red local (Anvil).' },
    });
    await montar();
    await asentar();

    expect(hook().status).toBe('suspended');
    expect(hook().lastError?.code).toBe(4900);
    expect(hook().cycleCount).toBe(0);
    // El ciclo se corta en la PRIMERA cuenta: no se emiten las demás lecturas.
    expect(hook().requestCount).toBe(1);

    await avanzarCiclos(3);
    expect(hook().requestCount, 'suspendido no vuelve a programar ciclos').toBe(1);
    expect(hook().status).toBe('suspended');
    // El literal de estado de la UI sigue siendo el de «desconectado» en español.
    expect(balanceStatusLabel('suspended')).toContain('sin respuesta del nodo local');
  });
});
