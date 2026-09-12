/**
 * M41 — `src/popup/views/ReceiveView.tsx`
 * Pestaña «Recibir»: dirección completa, copia al portapapeles y QR local (RF-07 / `CA-RF-07`).
 *
 * Invariante del requisito (tarea 2.8): la dirección **mostrada**, la que va al **portapapeles**
 * y la que codifica el **QR** son la MISMA cadena. Para que sea verificable, las tres salen del
 * único valor `address` de esta vista.
 *
 * El QR lo genera `src/shared/qr.ts` (M63) a través de `components/QrCode.tsx`, sin red y sin
 * dependencias remotas (RNF-20 / RT-03). No hay criptografía en el popup (RNF-14).
 */

import { useState, type JSX } from 'react';
import { QrCode } from '../components/QrCode';
import { StatusMessage } from '../components/StatusMessage';
import type { PopupError } from '../popupErrors';
import { popupErrorOf } from '../popupErrors';
import type { AccountRow } from '../walletState';

/** Props de la vista de recepción. */
export interface ReceiveViewProps {
  /** Cuenta activa; `null` si aún no se ha seleccionado ninguna. */
  account: AccountRow | null;
}

/** Copia un texto al portapapeles y devuelve `true` si lo consiguió. */
const volcarAlPortapapeles = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Vista de recepción del popup. */
export function ReceiveView({ account }: ReceiveViewProps): JSX.Element {
  const [volcado, setVolcado] = useState(false);
  const [error, setError] = useState<PopupError | null>(null);

  if (account === null) {
    return (
      <div className="tk-view">
        <p className="tk-empty__text">Selecciona una cuenta en la pestaña «Cuentas» para recibir.</p>
      </div>
    );
  }

  const handleVolcar = async (): Promise<void> => {
    setError(null);
    const done = await volcarAlPortapapeles(account.address);
    if (done) {
      setVolcado(true);
    } else {
      // Causa canónica de §4.3 (v1.9): «fallo del portapapeles».
      setError(popupErrorOf('clipboardFailure', {}, { reason: 'clipboard-write' }));
    }
  };

  return (
    <div className="tk-view">
      <StatusMessage error={error} />
      <section className="tk-section" aria-labelledby="recibir-cuenta">
        <h2 className="tk-section__title" id="recibir-cuenta">
          Recibir en {account.label}
        </h2>
        <p className="tk-note">
          Envía criptoactivos de la red local a esta dirección. Comprueba que coincide con la del
          código QR antes de transferir.
        </p>

        <div className="tk-card tk-address-card">
          <code className="tk-mono tk-address-full">{account.address}</code>
          <button type="button" className="tk-btn-ghost" onClick={() => void handleVolcar()}>
            {volcado ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        {volcado ? (
          <p className="tk-check-note" role="status">
            Dirección copiada al portapapeles.
          </p>
        ) : null}

        <QrCode value={account.address} label={`Dirección de ${account.label}`} />
      </section>
    </div>
  );
}
