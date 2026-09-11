/**
 * M47 — `src/popup/hooks/useBalancePolling.ts`
 * Polling de saldos: **exactamente 1 `eth_getBalance` por cuenta VISIBLE y ciclo**, con un ciclo
 * de **5 s** (`truekeate_settings.balancePollMs = 5000`, `diccionario_datos.md` §2.10).
 *
 * Tarea 3.12 y criterio `CA-RF-27` / RNF-03:
 * - arranca **al abrir la vista** (`enabled`);
 * - **para** al cerrarla (desmontaje o `enabled = false`) y **al cambiar de cuenta activa**;
 * - se **suspende** si el RPC no responde —o si el método aún no está implementado en el
 *   Service Worker, que hoy responde `4200`— mostrando el estado «desconectado» **sin perder los
 *   datos** ya leídos;
 * - **nunca** dispara dos ciclos solapados: el siguiente ciclo se programa cuando el anterior ha
 *   terminado (y un guardia extra los cuenta en `skippedCycles`);
 * - se puede **contar**: `requestCount` es el número de `eth_getBalance` emitidos y `cycleCount`
 *   el de ciclos completados, de modo que un contador mayor que «1 por cuenta visible y ciclo»
 *   invalida el criterio.
 *
 * RNF-14: el saldo se pide al Service Worker con un método del catálogo
 * (`documento_tecnico.md` §4.3: `eth_getBalance` es lectura de página sin aprobación) por el
 * canal `chrome.runtime`. Este módulo **no** lee el almacén de la extensión y **no** importa
 * `ethers`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountRef, Address, WeiString } from '../../shared/types';
import {
  BALANCE_POLL_MAX_ACCOUNTS,
  BALANCE_POLL_MS,
  DEFAULT_CHAIN_SYMBOL,
} from '../../shared/constants';
import { formatEthWithSymbol } from '../../shared/format';
import { callWalletMethod } from '../walletRpc';
import { popupErrorOf, type PopupError } from '../popupErrors';

/** Periodo del ciclo, en milisegundos (`truekeate_settings.balancePollMs`, RF-27). */
export const BALANCE_POLL_INTERVAL_MS = BALANCE_POLL_MS;

/** Tope de cuentas por ciclo (`truekeate_settings.balancePollMaxAccounts`, RNF-03). */
export const BALANCE_POLL_MAX_VISIBLE = BALANCE_POLL_MAX_ACCOUNTS;

/** Método del catálogo con el que se lee un saldo (§4.3). */
export const BALANCE_METHOD = 'eth_getBalance';

/**
 * Presupuesto por intento. Es el MISMO plazo que la política de M5 para una llamada al nodo
 * (§3.3.5 tarea 3.4: 5 s por intento), de modo que «el RPC no responde» tiene un final
 * observable y el ciclo se suspende en vez de quedarse colgado.
 */
export const BALANCE_RPC_TIMEOUT_MS = 5_000;

/** Cuenta que se va a pollear: su referencia en la cartera y su dirección. */
export interface BalanceTarget {
  ref: AccountRef;
  address: Address;
}

/** Estado del polling; `suspended` es el «desconectado» de la UI (RNF-07). */
export type BalancePollingStatus = 'idle' | 'polling' | 'ready' | 'suspended';

/**
 * Cuentas que consume UN ciclo: las visibles recibidas, recortadas al tope de
 * `truekeate_settings.balancePollMaxAccounts` (RNF-03 / H-21). Es la regla «1 RPC por cuenta
 * visible y ciclo» en su forma verificable: `pollTargets(x).length` es el número exacto de
 * `eth_getBalance` que emite cada ciclo.
 */
export const pollTargets = (accounts: readonly BalanceTarget[]): readonly BalanceTarget[] =>
  accounts.slice(0, BALANCE_POLL_MAX_VISIBLE);

/** Etiquetas en español del estado del polling (RF-34). */
export const BALANCE_STATUS_LABELS: Readonly<Record<BalancePollingStatus, string>> = {
  idle: 'Saldos en espera',
  polling: 'Actualizando saldos…',
  ready: 'Saldos al día',
  suspended: 'Desconectado: sin respuesta del nodo local',
};

/** Etiqueta en español del estado, para pintarla tal cual. */
export const balanceStatusLabel = (status: BalancePollingStatus): string => BALANCE_STATUS_LABELS[status];

/** Entrada del hook. */
export interface UseBalancePollingOptions {
  /** Cuentas VISIBLES a pollear (las ocultas no consumen ninguna llamada). */
  accounts: readonly BalanceTarget[];
  /**
   * Cuenta activa: un cambio **reinicia** el ciclo (CA-RF-27: «para al cambiar de cuenta»).
   * `null` mientras no haya ninguna.
   */
  currentAccount: AccountRef | null;
  /** `false` cuando la vista que muestra los saldos está cerrada. */
  enabled: boolean;
  /** Símbolo de la red activa para el importe (`ETH` en Anvil, §2.6). */
  symbol?: string;
}

/** Salida del hook. */
export interface UseBalancePollingResult {
  /** Saldo formateado por referencia de cuenta; se conserva al suspenderse. */
  balances: ReadonlyMap<AccountRef, string>;
  /** Estado observable del ciclo. */
  status: BalancePollingStatus;
  /** Ciclos completados con éxito. */
  cycleCount: number;
  /** `eth_getBalance` emitidos: es el contador que verifica `CA-RF-27`. */
  requestCount: number;
  /** Ciclos descartados por solapamiento; debe ser SIEMPRE 0. */
  skippedCycles: number;
  /** Último fallo (con su `code` y su acción de §4.3); `null` si el último ciclo fue bien. */
  lastError: PopupError | null;
  /** Reintenta el ciclo a mano tras una suspensión. */
  refresh: () => void;
}

/** Resultado interno de una lectura de saldo. */
type BalanceRead = { ok: true; value: string } | { ok: false; error: PopupError };

/** Formatea el saldo en wei que devuelve `eth_getBalance`; `null` si no es hexadecimal. */
const describeBalance = (raw: unknown, symbol: string): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(text)) {
    return null;
  }
  try {
    return formatEthWithSymbol(BigInt(text), symbol);
  } catch {
    return null;
  }
};

/**
 * Emite **una** lectura `eth_getBalance` sobre el canal del Service Worker, con el plazo de
 * {@link BALANCE_RPC_TIMEOUT_MS}. Si se agota el plazo se clasifica como «sin conexión con la red
 * local (Anvil)» (`4900`, §4.3), que es el estado «desconectado» de la UI.
 */
const readBalance = async (address: Address, symbol: string): Promise<BalanceRead> => {
  let timer: number | undefined;
  const timeout = new Promise<BalanceRead>((resolve) => {
    timer = window.setTimeout(() => {
      resolve({ ok: false, error: popupErrorOf('rpcUnavailable', {}, { reason: 'balance-timeout', address }) });
    }, BALANCE_RPC_TIMEOUT_MS);
  });
  const call: Promise<BalanceRead> = callWalletMethod<WeiString>(BALANCE_METHOD, [address, 'latest']).then(
    (response) => {
      if (!response.ok) {
        return { ok: false, error: response.error };
      }
      const value = describeBalance(response.result, symbol);
      if (value === null) {
        return { ok: false, error: popupErrorOf('internalError', {}, { reason: 'invalid-balance' }) };
      }
      return { ok: true, value };
    },
  );
  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
};

/**
 * Polling de saldos de las cuentas VISIBLES. Ver la cabecera del módulo para el contrato exacto
 * (1 RPC por cuenta visible y ciclo, 5 s, parada y suspensión).
 */
export function useBalancePolling({
  accounts,
  currentAccount,
  enabled,
  symbol = DEFAULT_CHAIN_SYMBOL,
}: UseBalancePollingOptions): UseBalancePollingResult {
  const [balances, setBalances] = useState<ReadonlyMap<AccountRef, string>>(() => new Map());
  const [status, setStatus] = useState<BalancePollingStatus>('idle');
  const [cycleCount, setCycleCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const [skippedCycles, setSkippedCycles] = useState(0);
  const [lastError, setLastError] = useState<PopupError | null>(null);
  const [resumeToken, setResumeToken] = useState(0);

  /** Firma estable de la lista visible: solo cambia si cambia el conjunto de cuentas o sus direcciones. */
  const signature = accounts.map((account) => `${account.ref}|${account.address}`).join(',');

  /**
   * Últimas cuentas vistas. El efecto de polling depende de la FIRMA (estable) y lee la lista de
   * aquí, de modo que un padre que recree el array en cada render no reinicia el ciclo; este
   * efecto se declara ANTES del de polling para que el ref ya esté al día en el mismo commit.
   */
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  });

  useEffect(() => {
    if (!enabled) {
      // Vista cerrada: el ciclo no está activo ni se reprograma (CA-RF-27).
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let cycling = false;
    let timer: number | undefined;
    let skipped = 0;

    const runCycle = async (): Promise<void> => {
      if (cancelled) {
        return;
      }
      if (cycling) {
        // Defensa en profundidad: jamás dos ciclos solapados (RNF-03).
        skipped += 1;
        setSkippedCycles(skipped);
        return;
      }
      cycling = true;
      const targets = pollTargets(accountsRef.current);
      setStatus('polling');

      const read: Map<AccountRef, string> = new Map();
      let failure: PopupError | null = null;
      for (const target of targets) {
        if (cancelled) {
          cycling = false;
          return;
        }
        // Exactamente UNA llamada por cuenta visible y ciclo, en serie (sin solapar ciclos).
        setRequestCount((previous) => previous + 1);
        const response = await readBalance(target.address, symbol);
        if (!response.ok) {
          failure = response.error;
          break;
        }
        read.set(target.ref, response.value);
      }
      cycling = false;
      if (cancelled) {
        return;
      }
      if (failure !== null) {
        // Suspensión: se conservan los saldos ya leídos y NO se reprograma el ciclo.
        setLastError(failure);
        setStatus('suspended');
        return;
      }
      setBalances((previous) => {
        const merged = new Map(previous);
        for (const [ref, value] of read) {
          merged.set(ref, value);
        }
        return merged;
      });
      setLastError(null);
      setCycleCount((previous) => previous + 1);
      setStatus('ready');
      timer = window.setTimeout(() => {
        void runCycle();
      }, BALANCE_POLL_INTERVAL_MS);
    };

    void runCycle();

    return () => {
      // Parada: ni temporizador pendiente ni ciclo en curso que pueda publicar estado.
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [enabled, signature, currentAccount, resumeToken, symbol]);

  const refresh = useCallback((): void => {
    setResumeToken((token) => token + 1);
  }, []);

  return { balances, status, cycleCount, requestCount, skippedCycles, lastError, refresh };
}
