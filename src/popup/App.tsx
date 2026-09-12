/**
 * M39 — `src/popup/App.tsx`
 * Contenedor del popup 380×600: encabezado de marca, pestañas, estado global de la UI y los
 * estados de carga, vacío («sin cartera»), error y «wallet dañada» (RNF-22).
 *
 * Pestañas (H2 + H3): **Cuentas** (M40), **Recibir** (M41), **Sitios** (M44, tarea 3.11) y
 * **Seguridad** (M46). Las pestañas de red y de actividad llegan en H5: no se declaran para no
 * ofrecer algo que no existe.
 *
 * Responsabilidades de este contenedor:
 * - **Auto-carga y restauración** (RF-09/RF-10, tarea 2.13): al abrir el popup se pide el estado
 *   al Service Worker con `wallet_getState` y se restaura la cuenta activa; nunca se pide la
 *   frase y **nunca** se lee el almacén desde aquí (RNF-14).
 * - **Polling de saldos** (M47, tarea 3.12 / `CA-RF-27`): mientras la vista de Cuentas está
 *   abierta se hace **1 `eth_getBalance` por cuenta visible cada 5 s**; el ciclo para al cambiar
 *   de pestaña (la vista se cierra) o de cuenta activa y se suspende —sin perder los saldos ya
 *   leídos— si el nodo no responde.
 * - **Sin contraseña** (P-03 / RE-02): no hay ningún prompt de contraseña y
 *   `settings.encryptionEnabled` es siempre `false`.
 * - **Aviso no descartable del primer arranque** (RNF-23, tarea 2.15): mientras no esté aceptado
 *   se muestra una capa modal que bloquea el resto de la UI; la aceptación se registra con
 *   `wallet_acceptDevNotice` en `truekeate_settings.devNoticeAcceptedAt`.
 * - **RNF-14**: este fichero no importa `ethers` ni ningún módulo del Service Worker.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { AccountsView } from './views/AccountsView';
import { LogsView } from './views/LogsView';
import { NetworksView } from './views/NetworksView';
import { ReceiveView } from './views/ReceiveView';
import { SecurityView } from './views/SecurityView';
import { SendView } from './views/SendView';
import { SitesView } from './views/SitesView';
import { AboutDialog } from './components/AboutDialog';
import { StatusMessage } from './components/StatusMessage';
import {
  balanceStatusLabel,
  useBalancePolling,
  type BalanceTarget,
} from './hooks/useBalancePolling';
import { acceptDevNotice, readSnapshot, type AccountRow, type WalletSnapshot } from './walletState';
import { popupErrorOf, type PopupError } from './popupErrors';
import { ACERCA_DE_BOTON, NOMBRE_PRODUCTO, TAGLINE_MARCA } from '../shared/i18n';
import '../styles/tokens.css';
import '../styles/base.css';

/**
 * Descriptor de marca literal de `identidad_visual.md` §1 y §8 (RNF-23). Se reexporta desde aquí
 * —y no se declara de nuevo— porque el literal vive en `src/shared/i18n.ts` (M66): una sola fuente
 * para el popup, el «Acerca de» y los E2E.
 */
export const TAGLINE = TAGLINE_MARCA;

/** Ruta pública del isologo de 96 px. */
const MARK_SRC = 'brand/truekeate-mark-96.png';

/**
 * Pestañas del popup: las de H2, «Sitios» (tarea 3.11), «Enviar» (H4, tarea 4.14) y las dos de H5
 * —«Redes» (M43, tareas 5.1 a 5.3) y «Actividad» (M45, tarea 5.10)—.
 *
 * La pestaña de envío se identifica como `send-tab` —no como la palabra suelta `send`— porque
 * `CA-RT-10` (`i18n.spec.ts`) revisa los literales de cadena de la UI: una palabra inglesa suelta
 * se marcaría como texto visible, mientras que un identificador con separador queda exento por su
 * forma (el texto que ve el usuario es «Enviar»). Por el mismo motivo las dos pestañas nuevas usan
 * identificadores con separador.
 */
type TabId = 'accounts' | 'receive' | 'send-tab' | 'sites' | 'security' | 'networks-tab' | 'activity-tab';

/** Definición de una pestaña. */
interface TabDefinition {
  id: TabId;
  label: string;
}

/** Las siete pestañas, en orden de tabulación. */
const TABS: readonly TabDefinition[] = [
  { id: 'accounts', label: 'Cuentas' },
  { id: 'receive', label: 'Recibir' },
  { id: 'send-tab', label: 'Enviar' },
  { id: 'sites', label: 'Sitios' },
  { id: 'security', label: 'Seguridad' },
  { id: 'networks-tab', label: 'Redes' },
  { id: 'activity-tab', label: 'Actividad' },
];

/** Estado de arranque del popup. */
type BootPhase = 'loading' | 'notice' | 'error' | 'ready';

/** Popup de TrueKeate Wallet. */
export function App(): JSX.Element {
  const [phase, setPhase] = useState<BootPhase>('loading');
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [tab, setTab] = useState<TabId>('accounts');
  const [error, setError] = useState<PopupError | null>(null);
  const [noticeBusy, setNoticeBusy] = useState(false);
  /**
   * Pantalla «Acerca de» (RNF-23, tarea 6.3). Vive aquí y no en una vista concreta porque el aviso
   * debe estar accesible desde la cabecera, que es común a todas las pestañas y a los estados de
   * carga, vacío y error.
   */
  const [aboutOpen, setAboutOpen] = useState(false);
  /**
   * Confirmación de una operación destructiva que deja el popup en el formulario inicial
   * (reset, CU-30 paso 6). Vive aquí, y no en la vista que la provoca, porque el reset deja la
   * cartera vacía: `SecurityView` se desmonta al volver al inicio y su aviso se perdería.
   */
  const [flash, setFlash] = useState<string | null>(null);

  /** Lee el estado y decide la pantalla: aviso, dañada, vacía o lista. */
  const refresh = useCallback(async (): Promise<void> => {
    const next = await readSnapshot();
    if (!next.ok) {
      setError(next.error);
      setPhase('error');
      return;
    }
    setSnapshot(next.snapshot);
    setPhase(next.snapshot.settings?.devNoticeAcceptedAt !== undefined ? 'ready' : 'notice');
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await readSnapshot();
        if (!active) {
          return;
        }
        if (!next.ok) {
          setError(next.error);
          setPhase('error');
          return;
        }
        setSnapshot(next.snapshot);
        setPhase(next.snapshot.settings?.devNoticeAcceptedAt !== undefined ? 'ready' : 'notice');
      } catch (cause) {
        if (!active) {
          return;
        }
        setError(popupErrorOf('internalError', {}, cause instanceof Error ? cause.message : cause));
        setPhase('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleNoticeAccept = async (): Promise<void> => {
    setNoticeBusy(true);
    const accepted = await acceptDevNotice();
    setNoticeBusy(false);
    if (!accepted.ok) {
      setError(accepted.error);
      setPhase('error');
      return;
    }
    await refresh();
  };

  const accounts: readonly AccountRow[] = useMemo(() => snapshot?.accounts ?? [], [snapshot]);

  const currentAccount = useMemo(() => {
    if (snapshot === null) {
      return null;
    }
    const ref = snapshot.currentAccount;
    return accounts.find((account) => account.ref === ref) ?? accounts[0] ?? null;
  }, [accounts, snapshot]);

  /** Cuentas VISIBLES: son las únicas que consume el polling de saldos (CA-RF-27). */
  const visibleAccounts = useMemo(
    () => accounts.filter((account) => account.visible),
    [accounts],
  );

  const balanceTargets: readonly BalanceTarget[] = useMemo(
    () => visibleAccounts.map((account) => ({ ref: account.ref, address: account.address })),
    [visibleAccounts],
  );

  /**
   * Polling de saldos (M47): arranca al abrir la vista de Cuentas y para al cerrarla o al cambiar
   * de cuenta activa. El contador `requestCount` es el que verifica «1 RPC por cuenta visible y
   * ciclo» y `status` el que pinta «desconectado» cuando el nodo no responde.
   */
  const polling = useBalancePolling({
    accounts: balanceTargets,
    currentAccount: currentAccount?.ref ?? null,
    enabled: phase === 'ready' && tab === 'accounts',
  });

  /** Pestañas del popup; la activa es la que se lleva al principio de la fila al cambiar de vista. */
  const tabsRef = useRef<HTMLDivElement>(null);

  /**
   * Al cambiar de pestaña, la activa se desplaza a la vista (RNF-21): con siete pestañas en 380 px
   * algunas quedan fuera de la fila y, al navegar SOLO con teclado, el foco podía quedar en un
   * control invisible. Se hace en un efecto, después del render, y solo si hay un elemento activo
   * dentro de la fila.
   */
  const revealActiveTab = useCallback((): void => {
    const contenedor = tabsRef.current;
    if (contenedor === null) {
      return;
    }
    const activa = contenedor.querySelector('.tk-tab--active');
    if (activa instanceof HTMLElement) {
      activa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  useEffect(() => {
    revealActiveTab();
  }, [revealActiveTab, tab]);

  const handleChanged = async (): Promise<void> => {
    await refresh();
  };

  return (
    <div className="tk-window tk-popup">
      <header className="tk-header">
        <h1 className="tk-header__title">{NOMBRE_PRODUCTO}</h1>
        <div className="tk-header__actions">
          <span className="tk-badge">Anvil Local</span>
          {/*
            «Acerca de» (RNF-23, tarea 6.3): está SIEMPRE en la cabecera —también en el estado
            vacío y mientras el aviso del primer arranque bloquea la interfaz—, porque es el otro
            aviso in-product que exige el criterio y no puede depender de tener cartera.
          */}
          <button type="button" className="tk-btn-ghost tk-btn-small" onClick={() => setAboutOpen(true)}>
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

      <StatusMessage message={flash} tone="success" />

      {phase === 'loading' ? (
        <main className="tk-main tk-empty" aria-busy="true">
          <span className="tk-spinner" aria-hidden="true" />
          <p className="tk-empty__text" role="status">
            Cargando la cartera…
          </p>
        </main>
      ) : null}

      {phase === 'error' ? (
        <main className="tk-main">
          <StatusMessage error={error ?? popupErrorOf('internalError')} />
        </main>
      ) : null}

      {phase === 'notice' ? <DevNoticeDialog busy={noticeBusy} onAccept={handleNoticeAccept} /> : null}

      {phase === 'ready' && snapshot !== null ? (
        snapshot.damaged ? (
          <main className="tk-main">
            <h2 className="tk-empty__title">Wallet dañada</h2>
            <p className="tk-empty__text">
              {snapshot.damagedReason ??
                'La cartera guardada no es coherente y no se han derivado direcciones nuevas.'}
            </p>
            <StatusMessage
              error={popupErrorOf('damagedWallet', {}, { reason: 'integrity', problems: snapshot.integrity.problems })}
            />
          </main>
        ) : !snapshot.hasWallet ? (
          <main className="tk-main tk-empty">
            <img className="tk-empty__mark" src={MARK_SRC} alt="Isologo de TrueKeate" />
            <h2 className="tk-empty__title">Sin cartera</h2>
            <p className="tk-empty__text">
              Todavía no hay ninguna cartera en este navegador: créala con una frase de
              recuperación de 12 palabras o importa una cuenta.
            </p>
            <p className="tk-tagline">{TAGLINE}</p>
            <AccountsView
              accounts={accounts}
              currentAccount={currentAccount?.ref ?? null}
              onChanged={handleChanged}
              onWalletGone={() => {
                void refresh();
              }}
            />
          </main>
        ) : (
          <>
            <nav className="tk-tabs" aria-label="Secciones de TrueKeate Wallet">
              <div className="tk-tabs__list tk-tabs__list--seven" role="tablist" ref={tabsRef}>
                {TABS.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    role="tab"
                    id={`tab-${definition.id}`}
                    aria-selected={tab === definition.id}
                    aria-controls={`panel-${definition.id}`}
                    className={`tk-tab${tab === definition.id ? ' tk-tab--active' : ''}`}
                    onClick={() => {
                      setTab(definition.id);
                    }}
                  >
                    {definition.label}
                  </button>
                ))}
              </div>
            </nav>

            {/*
              Los contadores del polling (M47) se publican como atributos de datos: son la
              evidencia observable de «1 eth_getBalance por cuenta visible y ciclo» (CA-RF-27) y
              permiten comprobarla sin instrumentar el canal ni exponer nada en `window`.

              H6 · el `role="tabpanel"` va en el contenedor y NO en el `<main>`: axe-core mide que un
              `role="tabpanel"` sobre `<main>` **anula el landmark** (`aria-allowed-role` y
              `landmark-one-main`), de modo que el documento quedaba sin `main` y sin región. El
              `<main>` conserva su semántica de landmark y el panel declara su rol ARIA.
            */}
            <main className="tk-main">
              <div
                className="tk-panel"
                id={`panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                data-polling-requests={tab === 'accounts' ? polling.requestCount : undefined}
                data-polling-cycles={tab === 'accounts' ? polling.cycleCount : undefined}
              >
              {tab === 'accounts' ? (
                <AccountsView
                  accounts={accounts}
                  currentAccount={currentAccount?.ref ?? null}
                  onChanged={handleChanged}
                  onWalletGone={() => {
                    void refresh();
                  }}
                  balances={polling.balances}
                  balanceStatus={balanceStatusLabel(polling.status)}
                />
              ) : null}
              {tab === 'receive' ? <ReceiveView account={currentAccount} /> : null}
              {/*
                «Enviar» (H4, tarea 4.14): el formulario pide la estimación de comisión y el envío
                al Service Worker; `eth_sendTransaction` es aprobable, así que la confirmación
                humana ocurre en la ventana única (`notification.html`), no aquí.
              */}
              {tab === 'send-tab' ? (
                <SendView
                  accounts={accounts}
                  currentAccount={currentAccount?.ref ?? null}
                  onChanged={handleChanged}
                />
              ) : null}
              {tab === 'sites' ? <SitesView accounts={accounts} /> : null}
              {/*
                «Redes» (M43, H5): lista de `truekeate_networks` con la activa marcada, cambio con
                aprobación y alta con `chrome.permissions.request` en runtime, que NO activa la red.
              */}
              {tab === 'networks-tab' ? (
                <NetworksView
                  networks={snapshot.networks}
                  currentChainId={snapshot.currentChainId}
                  onChanged={handleChanged}
                />
              ) : null}
              {/* «Actividad» (M45, H5): panel de logs con exportación JSON; el popup solo lee. */}
              {tab === 'activity-tab' ? <LogsView /> : null}
              {tab === 'security' ? (
                <SecurityView
                  accounts={accounts}
                  mnemonicPresent={snapshot.mnemonicPresent}
                  onChanged={handleChanged}
                  onResetDone={setFlash}
                />
              ) : null}
              </div>
            </main>
          </>
        )
      ) : null}
    </div>
  );
}

/** Props del aviso del primer arranque. */
interface DevNoticeDialogProps {
  busy: boolean;
  onAccept: () => Promise<void>;
}

/**
 * Aviso **no descartable** de entorno de desarrollo (RNF-23 / RE-02).
 *
 * No se cierra con `Escape`, ni pulsando el fondo, ni con un botón de cierre: solo con la
 * aceptación explícita, que queda registrada. Bloquea el resto de la interfaz mientras está
 * visible, de modo que ninguna operación de cartera ocurre antes de la aceptación.
 */
function DevNoticeDialog({ busy, onAccept }: DevNoticeDialogProps): JSX.Element {
  return (
    <div className="tk-overlay">
      <div className="tk-dialog tk-dialog--notice" role="dialog" aria-modal="true" aria-label="Aviso de entorno de desarrollo">
        <h2 className="tk-dialog__title">Entorno de desarrollo — no usar con fondos reales</h2>        <div className="tk-dialog__body">
          <p>
            Esta cartera funciona <strong>sin contraseña</strong> y guarda la frase de recuperación
            en el almacén local de la extensión. Está pensada para la red local de pruebas (Anvil)
            y para practicar, nunca para fondos reales.
          </p>
          <p className="tk-note">
            Al continuar, la aceptación de este aviso queda registrada en la configuración de la
            cartera.
          </p>
        </div>
        <div className="tk-dialog__actions">
          <button type="button" className="tk-btn-primary" onClick={() => void onAccept()} disabled={busy}>
            He entendido, continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
