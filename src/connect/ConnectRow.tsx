/**
 * M49 — `src/connect/ConnectRow.tsx`
 * Fila de cuenta **seleccionable** de la ventana de conexión (`connect.html`, 420×650).
 *
 * Especificación que aplica (`identidad_visual.md` §5.2 y §5.3 regla 7, RNF-21):
 * - **Tarjeta de cuenta** con la medida del catálogo: seleccionada = borde de 2 px del token de
 *   acento (`--tk-teal-500`) y fondo teñido; el resto, borde de 1 px.
 * - **Radio accesible**: la fila entera es la etiqueta del `<input type="radio">` del grupo
 *   `tk-connect-account`, de modo que el nombre accesible es «etiqueta · dirección · saldo». El
 *   foco entra por el radio seleccionado (roving `tabIndex`) y las flechas + `Enter` los gestiona
 *   el contenedor `radiogroup` de `App.tsx`.
 * - **Área táctil** ≥ 44 px y **dirección truncada** `0x1234…abcd` en mono con el `title` completo.
 * - **Saldo real** de la cuenta; mientras el nodo no responde, el hueco se pinta como «—».
 *
 * Cero criptografía y cero acceso al almacén: la fila solo pinta lo que recibe (RNF-14).
 */

import type { JSX } from 'react';
import type { AccountRef } from '../shared/types';
import { formatAddress } from '../shared/format';
import type { AccountRow } from '../popup/walletState';

/** Props de una fila de cuenta de la ventana de conexión. */
export interface ConnectRowProps {
  /** Cuenta ofrecida (derivada o importada). */
  account: AccountRow;
  /** `true` si es la cuenta preseleccionada que se compartirá. */
  selected: boolean;
  /** Saldo ya formateado, o `null` si aún no se conoce. */
  balance: string | null;
  /** Selecciona la cuenta (clic o flechas del grupo). */
  onSelect: () => void;
  /** Registra el radio para el foco por teclado (roving tabindex). */
  registerInput: (ref: AccountRef, node: HTMLInputElement | null) => void;
}

/** Fila de cuenta seleccionable de `connect.html`. */
export function ConnectRow({
  account,
  selected,
  balance,
  onSelect,
  registerInput,
}: ConnectRowProps): JSX.Element {
  /** Tipo de cuenta y aviso de que está oculta en el popup (sigue siendo ofrecible). */
  const kindLabel = `${account.kind === 'imported' ? 'importada' : 'derivada'}${
    account.visible ? '' : ' · oculta'
  }`;
  const addressId = `tk-connect-address-${account.ref.replace(/[^A-Za-z0-9]+/g, '-')}`;
  return (
    <li className={`tk-connect-row${selected ? ' tk-connect-row--selected' : ''}`}>
      <label className="tk-connect-row__label">
        <input
          ref={(node) => {
            registerInput(account.ref, node);
          }}
          className="tk-connect-row__radio"
          type="radio"
          name="tk-connect-account"
          value={account.ref}
          checked={selected}
          tabIndex={selected ? 0 : -1}
          aria-describedby={addressId}
          onChange={onSelect}
        />
        <span className="tk-connect-row__body">
          <span className="tk-connect-row__name">
            {account.label}
            <span className="tk-connect-row__kind">{kindLabel}</span>
          </span>
          <span className="tk-connect-row__address tk-mono" id={addressId} title={account.address}>
            {formatAddress(account.address)}
          </span>
        </span>
        <span className="tk-connect-row__balance tk-mono">{balance ?? '—'}</span>
      </label>
    </li>
  );
}

export default ConnectRow;
