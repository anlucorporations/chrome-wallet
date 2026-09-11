/**
 * M44 — `src/popup/views/SitesView.tsx`
 * Pestaña «Sitios»: sitios conectados (`truekeate_connected_sites`, §2.7) con su cuenta compartida,
 * su último uso y su vigencia, y **revocación por origen** (RF-26 / CU-19, tarea 3.11).
 *
 * Contrato que consume (RNF-14: la UI **no** lee el almacén de la extensión):
 * - La **lista** la publica el Service Worker en `wallet_getState.connectedSites` (§5.1.1 v1.7):
 *   la forma canónica de `diccionario_datos.md` §2.7 —origen normalizado, cuenta compartida, red,
 *   alta, último uso y caducidad— más `current`, que distingue la sesión **vigente** de la vencida,
 *   y **sin secretos**. Este módulo NO lee `truekeate_connected_sites` ni inventa un método: relee
 *   el estado al montarse y después de cada revocación, y pinta lo que el SW entrega.
 * - La **revocación** se pide al Service Worker con el método del catálogo
 *   `wallet_revokePermissions` (§4.3: admite el camino «desde el popup», donde la confirmación es
 *   la propia UI de revocar y **no** se crea entrada en `truekeate_pending_requests`). Al
 *   eliminarse la sesión, la dApp recibe `accountsChanged` con `[]` y su `eth_accounts` pasa a
 *   `[]` (§3.2 reglas 5 y 6, `CA-RF-26`).
 *
 * Accesibilidad (RNF-19/RNF-21): la vigencia y la cuenta compartida se leen como TEXTO —nunca solo
 * por color—, cada fila expone su botón «Revocar permiso» en el orden de tabulación y el foco
 * visible lo aporta la regla global `:focus-visible` de `base.css`; el origen completo viaja en el
 * `title` de la fila además de en el texto.
 */

import { useEffect, useState, type JSX } from 'react';
import type { ConnectedSiteView } from '../../shared/types';
import { formatAddress, formatTimestamp } from '../../shared/format';
import { DialogoDecision } from '../components/DialogoDecision';
import { StatusMessage } from '../components/StatusMessage';
import type { PopupError } from '../popupErrors';
import { callWalletMethod } from '../walletRpc';
import { readSnapshot, type AccountRow } from '../walletState';

/**
 * Sesión de dApp tal y como la pinta la lista: es la vista que entrega `wallet_getState`
 * (`connectedSites`), con el origen ya normalizado por el Service Worker (§2.7 / §5.1.1 v1.7).
 */
export type ConnectedSite = ConnectedSiteView;

/** Props de la vista de sitios conectados. */
export interface SitesViewProps {
  /** Cuentas de la cartera, para resolver la etiqueta de la cuenta compartida. */
  accounts: readonly AccountRow[];
}

/**
 * Normaliza un origen a la clave canónica de §2.7: esquema + host + puerto, minúsculas y sin
 * barra final (`HTTP://LOCALHOST:5174/` → `http://localhost:5174`). Devuelve `null` si la entrada
 * no es una URL absoluta utilizable.
 */
export const normalizeOrigin = (input: string): string | null => {
  const text = input.trim();
  if (text.length === 0) {
    return null;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Pide la revocación al Service Worker (`wallet_revokePermissions`).
 *
 * Forma de `params[0]`: el contrato **no** fija los parámetros de este método (no pertenece a la
 * unión interna de §5.1.1, sino al catálogo de página de §4.3), así que se usa el mismo objeto con
 * parámetros con nombre que el resto de operaciones de la UI (`{ origin }`), que es además la
 * clave canónica de la sesión. Si el SW espera otra forma, responderá su error tipado y la UI lo
 * pinta sin inventar nada.
 */
const revokePermission = async (origin: string): Promise<{ ok: true } | { ok: false; error: PopupError }> => {
  const response = await callWalletMethod<null>('wallet_revokePermissions', [{ origin }]);
  return response.ok ? { ok: true } : { ok: false, error: response.error };
};

/**
 * Vigencia de la sesión en TEXTO (accesible sin depender del color): `current` es la marca que
 * envía el SW y `expiresAt` la fecha exacta de caducidad (§2.7; `null` = sin caducidad).
 */
export const sessionValidityLabel = (site: ConnectedSite): string => {
  if (site.current) {
    return site.expiresAt === null
      ? 'Vigente, sin caducidad'
      : `Vigente hasta el ${formatTimestamp(site.expiresAt)}`;
  }
  return site.expiresAt === null
    ? 'Vencida: la dApp tendrá que pedir la conexión otra vez'
    : `Vencida el ${formatTimestamp(site.expiresAt)}: la dApp tendrá que pedir la conexión otra vez`;
};

/** Vista de «Sitios» del popup: lista de orígenes conectados y revocación. */
export function SitesView({ accounts }: SitesViewProps): JSX.Element {
  /** Sesiones que publica el Service Worker (`wallet_getState.connectedSites`). */
  const [sites, setSites] = useState<readonly ConnectedSite[]>([]);
  const [loading, setLoading] = useState(true);
  /** Cambia de valor para forzar una relectura del estado tras revocar o al pulsar «Actualizar». */
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PopupError | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  /**
   * Lee la lista del estado que publica el SW (RNF-14: sin tocar el almacén). El indicador
   * `mounted` evita escribir estado si la pestaña se desmonta antes de recibir la respuesta.
   */
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const snapshot = await readSnapshot();
      if (!mounted) {
        return;
      }
      setLoading(false);
      if (!snapshot.ok) {
        setError(snapshot.error);
        return;
      }
      setSites(snapshot.snapshot.connectedSites);
    })();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const normalizedDraft = normalizeOrigin(draft);
  const originIssue =
    draft.trim().length > 0 && normalizedDraft === null
      ? 'Escribe un origen con esquema y host, por ejemplo http://localhost:5174'
      : null;

  const labelOf = (address: string): string => {
    const account = accounts.find((candidate) => candidate.address.toLowerCase() === address.toLowerCase());
    return account?.label ?? formatAddress(address);
  };

  const handleRevoke = async (): Promise<void> => {
    if (confirming === null) {
      return;
    }
    const origin = confirming;
    setConfirming(null);
    setBusy(true);
    setError(null);
    setStatus(null);
    const result = await revokePermission(origin);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // CU-19/E2: la operación es idempotente aunque el origen ya no exista. Se quita la fila de
    // inmediato y se relee el estado para pintar la lista REAL que custodia el Service Worker.
    setSites((previous) => previous.filter((site) => site.origin !== origin));
    setDraft('');
    setStatus(
      `Permiso revocado para ${origin}: la dApp recibe accountsChanged con [] y su eth_accounts pasa a [].`,
    );
    setReloadKey((previous) => previous + 1);
  };

  return (
    <div className="tk-view">
      <StatusMessage error={error} />
      <StatusMessage message={status} tone="success" />

      <section className="tk-section" aria-labelledby="sitios-lista">
        <div className="tk-section__head">
          <h3 className="tk-section__title" id="sitios-lista">
            Sitios conectados
          </h3>
          <span className="tk-badge">{sites.length}</span>
          <button
            type="button"
            className="tk-btn-secondary tk-btn-small"
            onClick={() => {
              setError(null);
              setStatus(null);
              setLoading(true);
              setReloadKey((previous) => previous + 1);
            }}
            disabled={loading || busy}
          >
            Actualizar lista
          </button>
        </div>

        {loading ? (
          <p className="tk-empty__text" role="status" aria-busy="true">
            Cargando los sitios conectados…
          </p>
        ) : sites.length === 0 ? (
          <p className="tk-empty__text">
            No hay ningún sitio conectado. Los orígenes aparecen aquí en cuanto una dApp pide la
            conexión y eliges la cuenta que se comparte.
          </p>
        ) : (
          <ul className="tk-sites" role="list" aria-label="Sitios conectados">
            {sites.map((site) => (
              <li className="tk-site" key={site.origin}>
                <span className="tk-site__origin tk-mono" title={site.origin}>
                  {site.origin}
                </span>
                <span className="tk-site__meta">
                  Cuenta compartida: {labelOf(site.account)} · Red: {site.chainId}
                </span>
                <span className="tk-site__meta">
                  Último uso: {formatTimestamp(site.lastUsedAt)} · Conectado el{' '}
                  {formatTimestamp(site.connectedAt)}
                </span>
                <span className="tk-site__meta">{sessionValidityLabel(site)}</span>
                <button
                  type="button"
                  className="tk-btn-danger tk-btn-small"
                  onClick={() => {
                    setConfirming(site.origin);
                    setError(null);
                    setStatus(null);
                  }}
                  disabled={busy}
                  aria-label={`Revocar el permiso del sitio ${site.origin}`}
                >
                  Revocar permiso
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tk-section" aria-labelledby="sitios-revocar">
        <h3 className="tk-section__title" id="sitios-revocar">
          Revocar un permiso por origen
        </h3>
        <div className="tk-field">
          <label className="tk-field__label" htmlFor="sitios-origen">
            Origen conectado (esquema + host + puerto)
          </label>
          <div className="tk-field__row">
            <input
              id="sitios-origen"
              className="tk-input tk-mono"
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="http://localhost:5174"
              value={draft}
              aria-invalid={originIssue !== null}
              aria-describedby="sitios-origen-aviso"
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
            <button
              type="button"
              className="tk-btn-primary"
              disabled={busy || normalizedDraft === null}
              onClick={() => {
                if (normalizedDraft !== null) {
                  setConfirming(normalizedDraft);
                }
              }}
            >
              Revocar permiso
            </button>
          </div>
          <span className="tk-field__hint" id="sitios-origen-aviso">
            {originIssue ??
              'El origen se normaliza a minúsculas y sin barra final, que es la clave de la sesión.'}
          </span>
        </div>
        <p className="tk-note">
          Revocar la sesión de un origen lo elimina de la cartera: la dApp deja de recibir la
          cuenta y su eth_accounts devuelve []. Desde el popup no se crea ninguna solicitud en la
          cola de aprobación (CA-RF-26).
        </p>
      </section>

      {confirming !== null ? (
        <DialogoDecision
          title="Revocar el permiso de este origen"
          etiquetaAfirmar="Revocar permiso"
          etiquetaAnular="Volver"
          busy={busy}
          onAnular={() => {
            setConfirming(null);
          }}
          onAfirmar={() => {
            void handleRevoke();
          }}
        >
          <p>
            Se eliminará la sesión de <strong>{confirming}</strong>. La dApp recibirá
            accountsChanged con una lista vacía y su eth_accounts devolverá []: para volver a
            operar tendrá que pedir la conexión otra vez.
          </p>
          <p className="tk-note">
            La revocación nunca queda a medias: si la pestaña del origen ya está cerrada, la sesión
            se elimina igualmente.
          </p>
        </DialogoDecision>
      ) : null}
    </div>
  );
}

export default SitesView;
