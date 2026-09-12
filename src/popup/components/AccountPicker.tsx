/**
 * M42 (soporte) — `src/popup/components/AccountPicker.tsx`
 * Selector de cuenta del formulario de envío (origen y destino entre cuentas propias).
 *
 * Se apoya en un `<select>` NATIVO para que la navegación por teclado, el foco visible y el área
 * táctil ≥ 44 px los garantice la plataforma (RNF-19 / RNF-21), y envuelve el control con la misma
 * estructura de campo que el resto de formularios (`tk-field`, `Field.tsx`) para que la etiqueta y
 * el error inline queden asociados con `htmlFor` / `aria-describedby`.
 *
 * Solo presenta datos: las cuentas vienen de `wallet_getState` y este componente no lee el almacén
 * de la extensión ni importa `ethers` (RNF-14).
 */

import type { JSX } from 'react';
import type { AccountRef } from '../../shared/types';
import { formatAddress } from '../../shared/format';
import type { AccountRow } from '../walletState';
import type { PopupError } from '../popupErrors';

/** Props del selector de cuenta. */
export interface AccountPickerProps {
  /** Identificador del control (`id` y `htmlFor`). */
  id: string;
  /** Etiqueta visible. */
  label: string;
  /** Cuentas ofrecidas, en el orden del estado. */
  accounts: readonly AccountRow[];
  /** Cuenta elegida; `null` cuando ninguna lo está. */
  value: AccountRef | null;
  /** Cambio de la cuenta elegida. */
  onChange: (ref: AccountRef) => void;
  /** Texto de ayuda bajo el control. */
  hint?: string;
  /** Error de validación inline. */
  error?: PopupError | null;
  /** Deshabilita el control mientras hay una operación en curso. */
  disabled?: boolean;
}

/** Texto de una opción: etiqueta, tipo y dirección recortada (RF-34). */
const optionLabel = (account: AccountRow): string =>
  `${account.label} · ${account.kind === 'derived' ? 'derivada' : 'importada'} · ${formatAddress(account.address)}`;

/** Selector de cuenta del popup. */
export function AccountPicker({
  id,
  label,
  accounts,
  value,
  onChange,
  hint,
  error,
  disabled = false,
}: AccountPickerProps): JSX.Element {
  const describedBy =
    error !== undefined && error !== null
      ? `${id}-error`
      : hint !== undefined
        ? `${id}-hint`
        : undefined;
  return (
    <div className="tk-field">
      <label className="tk-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="tk-input tk-select"
        value={value ?? ''}
        disabled={disabled}
        aria-invalid={error !== undefined && error !== null ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          // El valor de la opción ES la referencia de cuenta (`idx:<n>` o `imp:<0x…>`): el
          // `<select>` solo ofrece las cuentas del estado, así que la forma viene garantizada por
          // las opciones pintadas (`AccountRow.ref`, contrato de §5.1.1).
          onChange(event.target.value as AccountRef);
        }}
      >
        {accounts.length === 0 ? <option value="">Sin cuentas disponibles</option> : null}
        {accounts.map((account) => (
          <option key={account.ref} value={account.ref}>
            {optionLabel(account)}
          </option>
        ))}
      </select>
      {hint !== undefined && (error === undefined || error === null) ? (
        <p className="tk-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error !== undefined && error !== null ? (
        <p className="tk-field__error" id={`${id}-error`} role="alert">
          <code className="tk-status__code">{error.code}</code>
          <span>{error.message}</span>
          <span className="tk-status__action">{error.action}</span>
        </p>
      ) : null}
    </div>
  );
}

export default AccountPicker;
