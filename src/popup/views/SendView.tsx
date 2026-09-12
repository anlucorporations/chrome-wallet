/**
 * M42 — `src/popup/views/SendView.tsx`
 * Pestaña «Enviar»: transferencia a una **dirección externa** o **entre cuentas propias**
 * (`plan_desarrollo.md` §3.4.5 tarea 4.14; criterios `CA-RF-08` y `CA-RF-33`).
 *
 * Qué hace la vista, y qué NO hace:
 * - **Valida en línea** (RF-33) la dirección, el importe y el **saldo** antes de enviar: el fallo
 *   se pinta junto al campo con su `code` y su acción de `diccionario_datos.md` §4.3.
 * - **Estima la comisión** con `eth_estimateGas` + `eth_gasPrice` (métodos de LECTURA del catálogo,
 *   §4.3) y muestra la comisión y el total antes de decidir. Un `estimateGas` que falla se muestra
 *   **con su motivo** —llega como error tipado del Service Worker— y **bloquea el envío**: en ese
 *   caso no se llama a `eth_sendTransaction` y, por tanto, **no se abre** `notification.html`
 *   (RNF-25, §3.4 regla 1).
 * - El **saldo insuficiente** (`value + fee > balance`) es **bloqueante**: el botón «Enviar» queda
 *   deshabilitado y el error se pinta con el literal `-32000` de §4.3.
 * - **No firma y no difunde**: la vista pide `eth_sendTransaction` al Service Worker, que crea la
 *   solicitud en la cola persistida, la muestra en la ventana única de confirmación y responde con
 *   el hash al difundir. Aquí no se toca el almacén de la extensión ni se importa `ethers` (RNF-14).
 *
 * Los literales de error que la tabla de §4.3 reserva a este formulario (saldo insuficiente y
 * estimación de gas fallida) se transcriben aquí porque `src/popup/popupErrors.ts` —fuera del
 * alcance de esta tarea— aún no los incluye; se copian **literalmente** de la tabla, sin inventar
 * códigos ni mensajes.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { AccountRef, Address, Hex, WeiString } from '../../shared/types';
import {
  DEFAULT_CHAIN_SYMBOL,
  ETH_AMOUNT_MAX_DECIMALS,
  ETH_DECIMALS,
} from '../../shared/constants';
import { formatAddress, formatEthWithSymbol } from '../../shared/format';
import { AccountPicker } from '../components/AccountPicker';
import { Field } from '../components/Field';
import { StatusMessage } from '../components/StatusMessage';
import type { PopupError } from '../popupErrors';
import { popupErrorOf } from '../popupErrors';
import { validateAddress, validateAmount } from '../validation';
import type { AccountRow } from '../walletState';
import { callWalletMethod } from '../walletRpc';

/** Importe máximo representable en `uint256` (cota real del EVM). */
const MAX_UINT256 = (1n << 256n) - 1n;

/** Escala de wei por ether (18 decimales), sin coma flotante (RT-02). */
const WEI_SCALE = 10n ** BigInt(ETH_DECIMALS);

/**
 * Decimales con los que se pinta la comisión y el total del envío: la comisión de una
 * transferencia es del orden de 10^-5 ETH, así que con los 4 decimales del saldo se vería como
 * cero. El saldo sí se muestra con los 4 decimales de la identidad visual (RF-34).
 */
export const FEE_DISPLAY_DECIMALS = 8;

/**
 * Literal de §4.3: saldo insuficiente para valor + comisión (`-32000`). Es **bloqueante**.
 */
export const INSUFFICIENT_FUNDS_ERROR: PopupError = {
  code: -32000,
  message: 'Saldo insuficiente para cubrir el valor y la comisión estimada.',
  action: 'Reducir el importe o recargar la cuenta',
};

/**
 * Literal de §4.3: `estimateGas` fallido o revert previo a firmar (`-32000`), con el motivo que
 * entrega el error tipado del Service Worker. Es **bloqueante** y no abre la ventana.
 */
export const estimationFailedError = (reason: string): PopupError => ({
  code: -32000,
  message: `La estimación de gas falló: ${reason}. El envío se ha bloqueado.`,
  action: 'Corregir la llamada',
});

/** Modo de destino del formulario. */
export type DestinationMode = 'external' | 'own';

/** Etiquetas del modo de destino. */
export const DESTINATION_LABELS: Readonly<Record<DestinationMode, string>> = {
  external: 'Dirección externa',
  own: 'Cuenta propia de la cartera',
};

/** Props de la vista de envío. */
export interface SendViewProps {
  /** Cuentas de la cartera, en el orden del estado (origen y destino propios). */
  accounts: readonly AccountRow[];
  /** Cuenta activa del popup; se propone como origen. */
  currentAccount: AccountRef | null;
  /** Avisa al contenedor de que el estado de la cartera ha cambiado (saldos, cuenta activa). */
  onChanged?: () => void | Promise<void>;
}

/** Estimación de la operación, lista para pintarla y para enviarla. */
export interface SendEstimate {
  from: Address;
  to: Address;
  /** Valor en wei, cadena decimal. */
  valueWei: WeiString;
  /** `gasLimit` estimado por el nodo. */
  gasLimitWei: WeiString;
  /** Precio de gas informado por el nodo (`eth_gasPrice`). */
  gasPriceWei: WeiString;
  /** Comisión estimada = `gasLimit × gasPrice`. */
  feeWei: WeiString;
  /** Saldo de la cuenta de origen en el momento de estimar. */
  balanceWei: WeiString;
  /** ¿El saldo cubre valor + comisión? */
  sufficientFunds: boolean;
}

/** Convierte una cantidad en wei a cantidad hexadecimal (`0x…`), como exige el JSON-RPC. */
export const weiToHexQuantity = (wei: bigint): Hex =>
  `0x${(wei < 0n ? 0n : wei).toString(16)}`;

/** Lee una cantidad hexadecimal (`0x…`) del nodo; `null` si no tiene esa forma. */
export const hexQuantityToBigInt = (raw: unknown): bigint | null => {
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]+$/.test(raw.trim())) {
    return null;
  }
  try {
    return BigInt(raw.trim());
  } catch {
    return null;
  }
};

/** Pasa un importe en ETH tecleado por el usuario a wei, con aritmética exacta; `null` si no vale. */
export const amountToWei = (
  raw: string,
  maxDecimals: number = ETH_AMOUNT_MAX_DECIMALS,
): bigint | null => {
  const text = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    return null;
  }
  const [integerPart = '0', fractionPart = ''] = text.split('.');
  if (fractionPart.length > maxDecimals) {
    return null;
  }
  const wei = BigInt(integerPart) * WEI_SCALE + BigInt(fractionPart.padEnd(ETH_DECIMALS, '0') || '0');
  if (wei <= 0n || wei > MAX_UINT256) {
    return null;
  }
  return wei;
};

/** Motivo accionable de un `estimateGas` fallido: el mensaje del error tipado, sin inventarlo. */
export const estimateFailureReason = (error: PopupError): string =>
  error.message.trim().length > 0 ? error.message : 'el nodo rechazó la estimación';

/** Vista de envío del popup. */
export function SendView({ accounts, currentAccount, onChanged }: SendViewProps): JSX.Element {
  const [mode, setMode] = useState<DestinationMode>('external');
  const [fromRef, setFromRef] = useState<AccountRef | null>(currentAccount);
  const [toRef, setToRef] = useState<AccountRef | null>(null);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [addressIssue, setAddressIssue] = useState<PopupError | null>(null);
  const [amountIssue, setAmountIssue] = useState<PopupError | null>(null);
  const [error, setError] = useState<PopupError | null>(null);
  const [estimate, setEstimate] = useState<SendEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<Hex | null>(null);

  /** Estimación vigente para el envío; se refresca al estimar y se invalida al cambiar el formulario. */
  const estimateRef = useRef<SendEstimate | null>(null);

  /** La cuenta activa del popup se propone como origen mientras el usuario no elija otra. */
  useEffect(() => {
    setFromRef((previous) => previous ?? currentAccount);
  }, [currentAccount]);

  const fromAccount = useMemo(
    () => accounts.find((account) => account.ref === fromRef) ?? accounts[0] ?? null,
    [accounts, fromRef],
  );
  const destinationAccounts = useMemo(
    () => accounts.filter((account) => account.ref !== fromAccount?.ref),
    [accounts, fromAccount],
  );

  /** Invalida la estimación: cualquier cambio del formulario exige volver a estimar. */
  const invalidate = (): void => {
    estimateRef.current = null;
    setEstimate(null);
    setHash(null);
    setError(null);
  };

  /** Resuelve la dirección de destino según el modo, o `null` si el formulario no la fija. */
  const resolveDestination = (): Address | null => {
    if (mode === 'own') {
      const target = accounts.find((account) => account.ref === toRef) ?? null;
      return target?.address ?? null;
    }
    const trimmed = toAddress.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      return null;
    }
    return trimmed as Address;
  };

  const walletEmpty = accounts.length === 0;

  /**
   * Valida el formulario y estima gas, precio y saldo. Devuelve la estimación cuando el envío puede
   * continuar, o `null` cuando hay un fallo de validación, de estimación o de saldo.
   */
  const estimateSend = async (): Promise<SendEstimate | null> => {
    const from = fromAccount?.address ?? null;
    const to = resolveDestination();

    // 1. Validación inline del destino (RF-33): la dirección externa y el importe.
    const addressError =
      to === null
        ? mode === 'external'
          ? validateAddress(toAddress).issue ?? popupErrorOf('invalidAddress')
          : popupErrorOf('unknownAccount')
        : null;
    const amountError = amountToWei(amount) === null ? validateAmount(amount).issue ?? popupErrorOf('invalidAmount') : null;
    setAddressIssue(addressError);
    setAmountIssue(amountError);

    if (from === null || to === null || addressError !== null || amountError !== null) {
      setEstimate(null);
      estimateRef.current = null;
      return null;
    }

    const valueWei = amountToWei(amount);
    if (valueWei === null) {
      setEstimate(null);
      estimateRef.current = null;
      return null;
    }

    setBusy(true);
    setError(null);
    // 2. Estimación con los métodos de LECTURA del catálogo, por el canal del Service Worker.
    const [gasResponse, priceResponse, balanceResponse] = await Promise.all([
      callWalletMethod<Hex>('eth_estimateGas', [{ from, to, value: weiToHexQuantity(valueWei) }]),
      callWalletMethod<Hex>('eth_gasPrice'),
      callWalletMethod<Hex>('eth_getBalance', [from, 'latest']),
    ]);
    setBusy(false);

    if (!gasResponse.ok) {
      // La estimación falló: se muestra SU MOTIVO y el envío queda bloqueado (no se abre ventana).
      setError(estimationFailedError(estimateFailureReason(gasResponse.error)));
      setEstimate(null);
      estimateRef.current = null;
      return null;
    }
    if (!priceResponse.ok) {
      setError(priceResponse.error);
      setEstimate(null);
      estimateRef.current = null;
      return null;
    }
    if (!balanceResponse.ok) {
      setError(balanceResponse.error);
      setEstimate(null);
      estimateRef.current = null;
      return null;
    }

    const gasLimit = hexQuantityToBigInt(gasResponse.result);
    const gasPrice = hexQuantityToBigInt(priceResponse.result);
    const balance = hexQuantityToBigInt(balanceResponse.result);
    if (gasLimit === null || gasPrice === null || balance === null) {
      setError(popupErrorOf('internalError', {}, { reason: 'invalid-estimation' }));
      setEstimate(null);
      estimateRef.current = null;
      return null;
    }

    // 3. Saldo: la comisión se suma al valor; si no cabe, el envío queda BLOQUEADO.
    const feeWei = gasLimit * gasPrice;
    const sufficientFunds = valueWei + feeWei <= balance;
    const next: SendEstimate = {
      from,
      to,
      valueWei: valueWei.toString(),
      gasLimitWei: gasLimit.toString(),
      gasPriceWei: gasPrice.toString(),
      feeWei: feeWei.toString(),
      balanceWei: balance.toString(),
      sufficientFunds,
    };
    setEstimate(next);
    estimateRef.current = next;
    if (!sufficientFunds) {
      setError(INSUFFICIENT_FUNDS_ERROR);
    }
    return next;
  };

  /** Envía la transacción: exige una estimación válida y con saldo suficiente. */
  const handleSend = async (): Promise<void> => {
    if (busy) {
      return;
    }
    const ready = estimateRef.current ?? (await estimateSend());
    if (ready === null || !ready.sufficientFunds) {
      return;
    }
    setBusy(true);
    setError(null);
    // `eth_sendTransaction` es un método APROBABLE: el Service Worker crea la solicitud persistida,
    // abre la ventana única de confirmación y responde con el hash al difundir (§3.1). La vista no
    // firma ni difunde nada (RNF-14).
    const sent = await callWalletMethod<Hex>('eth_sendTransaction', [
      {
        from: ready.from,
        to: ready.to,
        value: weiToHexQuantity(BigInt(ready.valueWei)),
        data: '0x',
      },
    ]);
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error);
      return;
    }
    // Se limpia la estimación para exigir una nueva antes del siguiente envío; el hash recién
    // recibido es la evidencia del envío, así que se fija DESPUÉS de invalidar.
    invalidate();
    setHash(sent.result);
    await onChanged?.();
  };

  if (walletEmpty) {
    return (
      <div className="tk-view">
        <p className="tk-empty__text">
          No hay ninguna cuenta en la cartera: créala o impórtala en la pestaña «Cuentas» antes de
          enviar criptoactivos.
        </p>
      </div>
    );
  }

  const symbol = DEFAULT_CHAIN_SYMBOL;

  return (
    <div className="tk-view">
      <StatusMessage error={error} />
      {hash !== null ? (
        <StatusMessage message={`Transacción difundida: ${formatAddress(hash)}`} tone="success" />
      ) : null}

      <section className="tk-section" aria-labelledby="enviar-titulo">
        <h3 className="tk-section__title" id="enviar-titulo">
          Enviar criptoactivos
        </h3>
        <p className="tk-note">
          Elige la cuenta de origen, el destino y el importe. La comisión se estima antes de enviar y
          la transacción se confirma en la ventana de la cartera.
        </p>
      </section>

      <div className="tk-form">
        <AccountPicker
          id="enviar-origen"
          label="Cuenta de origen"
          accounts={accounts}
          value={fromAccount?.ref ?? null}
          disabled={busy}
          onChange={(ref) => {
            setFromRef(ref);
            invalidate();
          }}
        />

        <div
          className="tk-choice"
          role="radiogroup"
          aria-labelledby="enviar-destino-modo"
        >
          <p className="tk-field__label" id="enviar-destino-modo">
            Tipo de destino
          </p>
          {(Object.keys(DESTINATION_LABELS) as DestinationMode[]).map((option) => (
            <label className="tk-choice__option" key={option} htmlFor={`enviar-modo-${option}`}>
              <input
                id={`enviar-modo-${option}`}
                type="radio"
                name="enviar-destino-modo"
                value={option}
                checked={mode === option}
                disabled={busy}
                onChange={() => {
                  setMode(option);
                  invalidate();
                }}
              />
              <span>{DESTINATION_LABELS[option]}</span>
            </label>
          ))}
        </div>

        {mode === 'own' ? (
          <AccountPicker
            id="enviar-destino-cuenta"
            label="Cuenta de destino"
            accounts={destinationAccounts}
            value={toRef}
            disabled={busy}
            hint="Solo se ofrecen las demás cuentas de la cartera."
            error={addressIssue}
            onChange={(ref) => {
              setToRef(ref);
              setAddressIssue(null);
              invalidate();
            }}
          />
        ) : (
          <Field
            id="enviar-destino"
            label="Dirección de destino"
            value={toAddress}
            mono
            disabled={busy}
            hint="Dirección `0x` + 40 caracteres hexadecimales."
            error={addressIssue}
            onChange={(value) => {
              setToAddress(value);
              setAddressIssue(null);
              invalidate();
            }}
          />
        )}

        <Field
          id="enviar-importe"
          label="Importe"
          value={amount}
          mono
          disabled={busy}
          hint={`En ${symbol}, con hasta ${ETH_AMOUNT_MAX_DECIMALS} decimales.`}
          error={amountIssue}
          onChange={(value) => {
            setAmount(value);
            setAmountIssue(null);
            invalidate();
          }}
        />

        {estimate !== null ? (
          <dl className="tk-summary">
            <div className="tk-summary__row">
              <dt className="tk-summary__label">Comisión estimada</dt>
              <dd className="tk-summary__value tk-summary__strong">
                {formatEthWithSymbol(estimate.feeWei, symbol, FEE_DISPLAY_DECIMALS)}
              </dd>
            </div>
            <div className="tk-summary__row">
              <dt className="tk-summary__label">Total</dt>
              <dd className="tk-summary__value tk-summary__strong">
                {formatEthWithSymbol(
                  BigInt(estimate.valueWei) + BigInt(estimate.feeWei),
                  symbol,
                  FEE_DISPLAY_DECIMALS,
                )}
              </dd>
            </div>
            <div className="tk-summary__row">
              <dt className="tk-summary__label">Saldo disponible</dt>
              <dd className="tk-summary__value">
                {formatEthWithSymbol(estimate.balanceWei, symbol)}
              </dd>
            </div>
            <div className="tk-summary__row">
              <dt className="tk-summary__label">Límite de gas estimado</dt>
              <dd className="tk-summary__value tk-mono">{estimate.gasLimitWei}</dd>
            </div>
          </dl>
        ) : null}

        <div className="tk-send__actions">
          <button
            type="button"
            className="tk-btn-secondary"
            disabled={busy}
            onClick={() => {
              void estimateSend();
            }}
          >
            Calcular comisión
          </button>
          <button
            type="button"
            className="tk-btn-primary"
            disabled={busy || estimate === null || !estimate.sufficientFunds}
            onClick={() => {
              void handleSend();
            }}
          >
            {busy ? 'Procesando…' : 'Enviar'}
          </button>
        </div>

        {estimate !== null && !estimate.sufficientFunds ? (
          <p className="tk-field__error" role="alert">
            <code className="tk-status__code">{INSUFFICIENT_FUNDS_ERROR.code}</code>
            <span>{INSUFFICIENT_FUNDS_ERROR.message}</span>
            <span className="tk-status__action">{INSUFFICIENT_FUNDS_ERROR.action}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default SendView;
