/**
 * M39 (soporte) — `src/popup/components/AccountCard.tsx`
 * Tarjeta de cuenta de la identidad visual (`identidad_visual.md` §5.2).
 *
 * Especificación que aplica: fondo de tarjeta, borde de 1 px y radio 12 px; la cuenta
 * SELECCIONADA lleva borde de 2 px con el token de acento y el fondo teñido. La dirección va
 * truncada `0x1234…abcd` en JetBrains Mono con `title` completo.
 *
 * Accesibilidad (RNF-21): cada acción con solo icono lleva `aria-label` en español y cumple el
 * área táctil de 44 px; el área táctil de los botones con etiqueta también se garantiza por CSS.
 */

import type { JSX } from 'react';
import type { AccountRow } from '../walletState';

/** Trunca una dirección al formato canónico de la identidad visual. */
export const truncateAddress = (address: string): string =>
  address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;

/** Props de la tarjeta de cuenta. */
export interface AccountCardProps {
  account: AccountRow;
  active: boolean;
  /** Selecciona la cuenta como activa. */
  onSelect: () => void;
  /** Abre el formulario de renombrado. */
  onRename: () => void;
  /** Oculta o vuelve a mostrar la cuenta. */
  onToggleVisibility: () => void;
  /** Abre el diálogo de borrado (solo importadas). */
  onRemove: (() => void) | null;
  /** Saldo formateado; `null` mientras el polling de H3 no esté operativo. */
  balance: string | null;
}

/** Tarjeta de una cuenta con sus acciones. */
export function AccountCard({
  account,
  active,
  onSelect,
  onRename,
  onToggleVisibility,
  onRemove,
  balance,
}: AccountCardProps): JSX.Element {
  const kindLabel = account.kind === 'imported' ? 'importada' : 'derivada';
  return (
    <li className={`tk-account${active ? ' tk-account--active' : ''}`}>
      <div className="tk-account__head">
        <button
          type="button"
          className="tk-account__select"
          onClick={onSelect}
          aria-current={active ? 'true' : undefined}
          aria-label={`Usar ${account.label} como cuenta activa`}
        >
          <span className="tk-account__label">{account.label}</span>
          <span className="tk-account__kind">{kindLabel}</span>
        </button>
        {balance !== null ? <span className="tk-account__balance tk-mono">{balance}</span> : null}
      </div>

      <button
        type="button"
        className="tk-account__address tk-mono"
        onClick={onSelect}
        title={account.address}
        aria-label={`Seleccionar la dirección ${account.address}`}
      >
        {truncateAddress(account.address)}
      </button>

      <div className="tk-account__actions">
        <button type="button" className="tk-btn-ghost tk-btn-small" onClick={onRename}>
          Renombrar
        </button>
        <button type="button" className="tk-btn-ghost tk-btn-small" onClick={onToggleVisibility}>
          {account.visible ? 'Ocultar' : 'Mostrar'}
        </button>
        {onRemove !== null ? (
          <button type="button" className="tk-btn-danger tk-btn-small" onClick={onRemove}>
            Eliminar
          </button>
        ) : null}
      </div>
    </li>
  );
}
