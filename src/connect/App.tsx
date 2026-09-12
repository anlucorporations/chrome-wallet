/**
 * M48 — `src/connect/App.tsx`
 * Ventana de conexión (`connect.html`, **420 × 650**, `identidad_visual.md` §5.1 y §5.2).
 *
 * Tarea 3.10 y criterios `CA-RF-16` / `CA-RF-36`:
 * - muestra el **origen que solicita la conexión**, **todas** las cuentas con su **saldo real** y
 *   el selector; la cuenta activa viene **preseleccionada**;
 * - se navega **por teclado** (flechas + `Enter` para conectar, `Esc` para rechazar, como en el
 *   resto de ventanas: `identidad_visual.md` §5.3 regla 7) y el selector es un **radio accesible**;
 * - al confirmar envía `CONNECT_RESPONSE { requestId, success: true, account, accountIndex }` y al
 *   cancelar el mismo mensaje con `success: false` y el error **`4001`** de §4.3, de modo que a la
 *   dApp le llega «Operación cancelada por el usuario.» (`diccionario_datos.md` §4.2 y §4.3).
 *
 * CONTRATO CONSUMIDO (el Service Worker entrega la solicitud)
 * - Las **etiquetas de las cuentas** se leen con el método interno `wallet_getState` (§5.1.1) y los
 *   **saldos** con `eth_getBalance` por el mismo canal; nunca se toca el almacén de la extensión
 *   (RNF-14).
 * - La **solicitud pendiente** vive en `truekeate_connect_request` (§2.9) y la publica el SW con el
 *   método interno **`wallet_getConnectRequest`** (§5.1.1 v1.7). La ventana solo recibe de M18 el
 *   `requestId` en la URL (`connect.html?requestId=…`, `src/background/connections.ts`) para
 *   correlacionar la respuesta, y con él pide al SW la solicitud **completa** —`{requestId,
 *   origin, accounts, currentAccountIndex, chainId, expiresAt}`— por el canal que ya existe
 *   (`chrome.runtime.sendMessage`; la ventana NUNCA lee el almacén de la extensión, RNF-14).
 * - `accounts` es por tanto la MISMA lista y el MISMO orden con los que el SW validará la
 *   elección: la ventana pinta esas cuentas (con su etiqueta y su saldo) y envía `account` **y**
 *   `accountIndex` calculados sobre esa lista, de modo que el índice es coherente por construcción.
 *   El SW conserva además su respaldo por `indexOf(account)`.
 * - Si falta el `requestId` —por ejemplo al abrir la ventana a mano— o el SW ya no tiene la
 *   solicitud (desconocida, ya resuelta o vencida → `4001`), la ventana **declara el hueco** y deja
 *   «Conectar» deshabilitado en vez de inventar la lista. Ver {@link CONNECT_REQUEST_GAP}.
 * - Cero criptografía y cero `ethers` (RNF-14); toda la UI en español (RF-34).
 */

import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import type { AccountRef, Address, ConnectRequestView, Eip1193Error } from '../shared/types';
import type { ConnectResponseMessage } from '../shared/protocol';
import { DEFAULT_CHAIN_SYMBOL } from '../shared/constants';
import { formatAddress } from '../shared/format';
import { ConnectRow } from './ConnectRow';
import { AboutDialog } from '../popup/components/AboutDialog';
import { StatusMessage } from '../popup/components/StatusMessage';
import { ACERCA_DE_BOTON, NOMBRE_PRODUCTO } from '../shared/i18n';
import {
  balanceStatusLabel,
  useBalancePolling,
  type BalanceTarget,
} from '../popup/hooks/useBalancePolling';
import { getRuntimeChannel } from '../popup/runtimeChannel';
import { isEip1193Error, popupError, popupErrorOf, type PopupError } from '../popup/popupErrors';
import { callInternal } from '../popup/walletRpc';
import { readSnapshot, type AccountRow } from '../popup/walletState';
import '../styles/tokens.css';
import '../styles/base.css';

// La forma de la solicitud entregada por el SW es la del contrato (§5.1.1 v1.7): se reexporta para
// que el consumidor de esta ventana no dependa de la ruta del módulo de tipos.
export type { ConnectRequestView } from '../shared/types';

/** Ruta pública del isologo de 96 px. */
const MARK_SRC = 'brand/truekeate-mark-96.png';

/**
 * Literal de §4.3 para el rechazo del usuario, con su código: es lo que recibe la dApp cuando se
 * cancela la conexión (tarea 3.10: «al cancelar → 4001»).
 */
export const USER_REJECTED_ERROR: Eip1193Error = {
  code: 4001,
  message: 'Operación cancelada por el usuario.',
};

/**
 * Hueco declarado: la ventana se ha abierto sin `requestId` —o el SW ya no tiene esa solicitud,
 * que responde `4001`—, de modo que no hay nada que resolver y «Conectar» queda deshabilitado.
 */
export const CONNECT_REQUEST_GAP =
  'No hay ninguna solicitud de conexión que resolver: la ventana se ha abierto sin el ' +
  'identificador que el Service Worker publica en la URL (connect.html?requestId=…), o la ' +
  'solicitud ya no está pendiente (desconocida, resuelta o vencida: 4001). Esta ventana no lee ' +
  'el almacén de la extensión (RNF-14): sin la solicitud que entrega wallet_getConnectRequest no ' +
  'se puede correlacionar la respuesta y «Conectar» queda deshabilitado.';

/** Arranque de la ventana tal y como viaja en la URL que construye M18. */
export interface ConnectBootstrap {
  requestId: string;
  /** Origen que acompaña al identificador; `null` si no viaja en la URL. */
  origin: string | null;
}

/**
 * Lee el ARRANQUE de la ventana del transporte admitido (parámetros de la URL de M18). Devuelve
 * `null` cuando no hay `requestId`, que es la señal del hueco declarado: la solicitud completa la
 * entrega después el Service Worker con `wallet_getConnectRequest`.
 */
export const readConnectRequest = (search: string): ConnectBootstrap | null => {
  const params = new URLSearchParams(search);
  const requestId = params.get('requestId');
  if (requestId === null || requestId.trim().length === 0) {
    return null;
  }
  const origin = params.get('origin');
  return {
    requestId: requestId.trim(),
    origin: origin === null || origin.trim().length === 0 ? null : origin.trim(),
  };
};

/** Fase de arranque de la ventana. */
/**
 * Fase de arranque: `loading` mientras se pide la solicitud y el estado, y `ready` en cuanto hay
 * una respuesta —con la solicitud o con el hueco declarado y su error tipado—.
 */
type BootPhase = 'loading' | 'ready';

/** Resultado del envío de la decisión. */
type Outcome = 'none' | 'sent' | 'failed';

/** Resultado de entregar un mensaje al Service Worker. */
type DeliveryResult = { ok: true } | { ok: false; error: PopupError };

/**
 * Entrega un `CONNECT_RESPONSE` por el canal del runtime (§4.2). Un `error` EIP-1193 en la
 * respuesta se convierte en el error tipado del popup; un fallo de transporte se clasifica como
 * «Error interno de la cartera» de §4.3.
 */
const deliverConnectResponse = async (message: ConnectResponseMessage): Promise<DeliveryResult> => {
  const channel = getRuntimeChannel();
  if (channel === null) {
    return {
      ok: false,
      error: popupErrorOf('internalError', {}, { reason: 'no-runtime-channel', requestId: message.requestId }),
    };
  }
  try {
    const response: unknown = await channel(message);
    if (typeof response === 'object' && response !== null) {
      const envelope = response as { error?: unknown };
      if (isEip1193Error(envelope.error)) {
        return { ok: false, error: popupError(envelope.error) };
      }
    }
    return { ok: true };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: popupErrorOf('internalError', {}, { reason: 'transport', detail }) };
  }
};

/**
 * Pide al Service Worker la solicitud de conexión COMPLETA (`wallet_getConnectRequest`, §5.1.1
 * v1.7) por el canal interno. Un `4001` del catálogo significa que la solicitud no existe, ya se
 * resolvió o venció: es la señal del hueco declarado, no un dato que la ventana deba inventar.
 */
const requestConnectDelivery = async (
  requestId: string,
): Promise<{ ok: true; request: ConnectRequestView } | { ok: false; error: PopupError }> => {
  const response = await callInternal<ConnectRequestView>('wallet_getConnectRequest', [{ requestId }]);
  return response.ok ? { ok: true, request: response.result } : { ok: false, error: response.error };
};

/**
 * Empareja las cuentas OFRECIDAS por el SW (`ConnectRequest.accounts`, §2.9) con las filas del
 * estado para reutilizar su etiqueta y su tipo. La lista ofrecida es la que manda —es la que el SW
 * valida y la que fija el espacio de `accountIndex`— y el estado solo aporta presentación: una
 * cuenta ofrecida que ya no figure en el estado (p. ej. una importada eliminada entre la apertura
 * de la ventana y esta lectura) se pinta igualmente con su dirección.
 */
const offerRows = (offered: readonly Address[], known: readonly AccountRow[]): AccountRow[] =>
  offered.map((address) => {
    const row = known.find((candidate) => candidate.address.toLowerCase() === address.toLowerCase());
    if (row !== undefined) {
      return row;
    }
    return {
      ref: `imp:${address}`,
      address,
      label: formatAddress(address),
      kind: 'imported',
      index: null,
      visible: true,
      current: false,
    };
  });

/** Ventana de conexión de TrueKeate Wallet. */
export function App(): JSX.Element {
  const [phase, setPhase] = useState<BootPhase>('loading');
  /** Solicitud COMPLETA que entrega el Service Worker (`wallet_getConnectRequest`, v1.7). */
  const [request, setRequest] = useState<ConnectRequestView | null>(null);
  const [accounts, setAccounts] = useState<readonly AccountRow[]>([]);
  const [error, setError] = useState<PopupError | null>(null);
  const [selectedRef, setSelectedRef] = useState<AccountRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>('none');
  /** Pantalla «Acerca de» (RNF-23, tarea 6.3), accesible desde la cabecera de esta ventana. */
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Arranque de la URL de M18: solo aporta el `requestId` con el que pedir la solicitud. */
  const bootstrap = useMemo(() => readConnectRequest(window.location.search), []);

  /** Refs de los radios para mover el foco con las flechas (roving tabindex). */
  const inputs = useRef(new Map<AccountRef, HTMLInputElement>());

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (bootstrap === null) {
        // Sin `requestId` no hay solicitud que resolver: se declara el hueco (CONNECT_REQUEST_GAP).
        setPhase('ready');
        return;
      }
      // Las dos lecturas van por el MISMO canal interno y en paralelo: la solicitud (autoritativa
      // para la lista ofrecida) y el estado (etiquetas y saldos). Ninguna toca el almacén.
      const [delivery, snapshot] = await Promise.all([
        requestConnectDelivery(bootstrap.requestId),
        readSnapshot(),
      ]);
      if (!mounted) {
        return;
      }
      if (!delivery.ok) {
        // La solicitud ya no está pendiente (4001): se pinta el error y «Conectar» queda apagado.
        setError(delivery.error);
        setPhase('ready');
        return;
      }
      /**
       * Se ofrecen las cuentas de `ConnectRequest.accounts` —la lista y el ORDEN con los que el SW
       * validará la elección— con la etiqueta y el tipo que aporta el estado. Las cuentas ocultas
       * se marcan como tales en la fila en vez de esconderse: la ventana lista todas las ofrecidas
       * y es el SW quien valida que la elegida esté entre ellas.
       */
      const offered = offerRows(
        delivery.request.accounts,
        snapshot.ok ? snapshot.snapshot.accounts : [],
      );
      if (!snapshot.ok) {
        // El estado solo aporta presentación: sin él la ventana sigue siendo operable y se informa.
        setError(snapshot.error);
      }
      setRequest(delivery.request);
      setAccounts(offered);
      // La preselección la fija el SW con `currentAccountIndex`: `offerRows` conserva el orden de
      // `accounts`, así que la posición es directamente la fila que corresponde.
      const preselected = offered[delivery.request.currentAccountIndex];
      const activeAccount = snapshot.ok
        ? offered.find((account) => account.ref === snapshot.snapshot.currentAccount)
        : undefined;
      setSelectedRef(preselected?.ref ?? activeAccount?.ref ?? offered[0]?.ref ?? null);
      setPhase('ready');
    })();
    return () => {
      mounted = false;
    };
  }, [bootstrap]);

  const targets: readonly BalanceTarget[] = useMemo(
    () => accounts.map((account) => ({ ref: account.ref, address: account.address })),
    [accounts],
  );
  // Polling de saldos de la ventana: arranca al abrirla y para al cerrarla o al cambiar de
  // cuenta (CA-RF-27). Se suspende solo si el nodo no responde.
  const polling = useBalancePolling({
    accounts: targets,
    currentAccount: selectedRef,
    enabled: phase === 'ready',
    symbol: DEFAULT_CHAIN_SYMBOL,
  });

  const selected = accounts.find((account) => account.ref === selectedRef) ?? null;

  const handleConfirm = async (): Promise<void> => {
    if (busy || request === null || selected === null) {
      return;
    }
    setBusy(true);
    setError(null);
    // `accountIndex` es la POSICIÓN de la cuenta elegida en la lista OFRECIDA por el SW
    // (`ConnectRequest.accounts`, §2.9) —la misma que la ventana ha pintado—, así que es coherente
    // con lo que el SW validará. El SW conserva además su respaldo por `indexOf(account)`.
    const accountIndex = request.accounts.indexOf(selected.address);
    const delivered = await deliverConnectResponse({
      type: 'CONNECT_RESPONSE',
      requestId: request.requestId,
      success: true,
      account: selected.address,
      accountIndex: accountIndex < 0 ? 0 : accountIndex,
    });
    setBusy(false);
    if (!delivered.ok) {
      setError(delivered.error);
      setOutcome('failed');
      return;
    }
    setOutcome('sent');
    window.close();
  };

  const handleCancel = async (): Promise<void> => {
    if (busy) {
      return;
    }
    if (request === null) {
      // Sin solicitud pendiente no hay nada que rechazar: se cierra la ventana.
      window.close();
      return;
    }
    setBusy(true);
    setError(null);
    const delivered = await deliverConnectResponse({
      type: 'CONNECT_RESPONSE',
      requestId: request.requestId,
      success: false,
      error: USER_REJECTED_ERROR,
    });
    setBusy(false);
    if (!delivered.ok) {
      setError(delivered.error);
      setOutcome('failed');
      return;
    }
    setOutcome('sent');
    window.close();
  };

  /** Flechas + `Home`/`End` cambian de cuenta y `Enter` conecta (CA-RF-36). */
  const handleGroupKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (accounts.length === 0) {
      return;
    }
    const currentIndex = accounts.findIndex((account) => account.ref === selectedRef);
    const index = currentIndex < 0 ? 0 : currentIndex;
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      next = (index + 1) % accounts.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      next = (index - 1 + accounts.length) % accounts.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = accounts.length - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void handleConfirm();
      return;
    } else {
      return;
    }
    event.preventDefault();
    const target = accounts[next];
    if (target === undefined) {
      return;
    }
    setSelectedRef(target.ref);
    inputs.current.get(target.ref)?.focus();
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      // RNF-23: con la pantalla «Acerca de» abierta, `Escape` la cierra y NO rechaza la conexión
      // (rechazar es una acción irreversible para la dApp y no puede dispararla un cierre de aviso).
      if (event.key === 'Escape' && !aboutOpen) {
        event.preventDefault();
        void handleCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  return (
    <div className="tk-window tk-connect">
      <header className="tk-header">
        <div className="tk-connect__heading">
          <h1 className="tk-header__title">{NOMBRE_PRODUCTO}</h1>
          <span className="tk-header__subtitle">
            {request?.origin ?? bootstrap?.origin ?? 'Origen pendiente de contrato'}
          </span>
        </div>
        <div className="tk-header__actions">
          <button
            type="button"
            className="tk-btn-ghost tk-btn-small"
            onClick={() => {
              setAboutOpen(true);
            }}
          >
            {ACERCA_DE_BOTON}
          </button>
        </div>
        <img className="tk-header__mark" src={MARK_SRC} alt="" aria-hidden="true" />
      </header>

      {aboutOpen ? (
        <AboutDialog
          onClose={() => {
            setAboutOpen(false);
          }}
        />
      ) : null}

      <main className="tk-main">
        <section className="tk-section" aria-labelledby="tk-connect-origen">
          <h2 className="tk-section__title" id="tk-connect-origen">
            Solicitud de conexión
          </h2>
          <p className="tk-connect__origin tk-mono" title={request?.origin ?? bootstrap?.origin ?? undefined}>
            {request?.origin ?? bootstrap?.origin ?? 'Origen no disponible'}
          </p>
          <p className="tk-note">
            Este sitio quiere ver la dirección de la cuenta que elijas. Solo se comparte la cuenta
            seleccionada: el resto de direcciones no sale de la cartera.
          </p>
        </section>

        {phase === 'loading' ? (
          <p className="tk-empty__text" role="status" aria-busy="true">
            Cargando las cuentas…
          </p>
        ) : null}

        {phase === 'ready' ? (
          <>
            <section>
              <div className="tk-section__head">
                <h2 className="tk-section__title" id="tk-connect-cuentas">
                  Cuenta que se comparte
                </h2>
                <span className="tk-badge">{accounts.length}</span>
              </div>
              {accounts.length === 0 ? (
                <p className="tk-empty__text">
                  La cartera no tiene ninguna cuenta: créala o impórtala en el popup antes de
                  conectar este sitio.
                </p>
              ) : (
                <div
                  className="tk-radio-list"
                  role="radiogroup"
                  aria-labelledby="tk-connect-cuentas"
                  aria-describedby="tk-connect-ayuda"
                  onKeyDown={handleGroupKeyDown}
                >
                  <ul className="tk-connect__accounts" role="list">
                    {accounts.map((account) => (
                      <ConnectRow
                        key={account.ref}
                        account={account}
                        selected={account.ref === selectedRef}
                        balance={polling.balances.get(account.ref) ?? null}
                        onSelect={() => {
                          setSelectedRef(account.ref);
                        }}
                        registerInput={(ref, node) => {
                          if (node === null) {
                            inputs.current.delete(ref);
                          } else {
                            inputs.current.set(ref, node);
                          }
                        }}
                      />
                    ))}
                  </ul>
                </div>
              )}
              <p className="tk-note" id="tk-connect-ayuda">
                Muévete con las flechas, conecta con Intro y rechaza con Escape.
              </p>
            </section>

            <p className="tk-connect__balances" role="status">
              {balanceStatusLabel(polling.status)}
            </p>
            {polling.status === 'suspended' ? <StatusMessage error={polling.lastError} /> : null}

            {request === null ? (
              <p className="tk-notice" role="status">
                {CONNECT_REQUEST_GAP}
              </p>
            ) : null}

            <StatusMessage error={error} />
            {outcome === 'sent' ? (
              <p className="tk-status tk-status--success" role="status">
                <span className="tk-status__message">Respuesta de conexión enviada.</span>
              </p>
            ) : null}

            <div className="tk-connect__actions">
              <button type="button" className="tk-btn-danger" onClick={() => void handleCancel()} disabled={busy}>
                Rechazar
              </button>
              <button
                type="button"
                className="tk-btn-primary"
                onClick={() => void handleConfirm()}
                disabled={busy || request === null || selected === null}
              >
                Conectar
              </button>
            </div>

            {outcome !== 'none' ? (
              <button type="button" className="tk-btn-secondary" onClick={() => window.close()}>
                Cerrar ventana
              </button>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

export default App;
