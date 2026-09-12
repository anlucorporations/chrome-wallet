/**
 * M43 — `src/popup/views/NetworksView.tsx`
 * Pestaña «Redes»: lista de `truekeate_networks` con la **activa** marcada, cambio de red con
 * aprobación y **alta de red nueva sin activarla**, con el **aviso de red no testnet** de RNF-23
 * (tareas 5.1, 5.2 y 5.3 de `plan_desarrollo.md` §3.5.5).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §5.2 (ventanas y componentes), §5.1.1 y §3.5 (secuencia del cambio y del
 *   alta); `diccionario_datos.md` §2.6 (`truekeate_networks`, «el alta **solo añade**», ADT-25) y
 *   §4.3 (literal de `4901` y del permiso de host denegado).
 * - `identidad_visual.md` §5.2 (insignias, botones) y §2 (tokens): la vista no escribe ningún color
 *   literal; las clases nuevas viven en `base.css` y los colores salen de `tokens.css`.
 *
 * CONTRATO QUE CONSUME (RNF-14: la UI no lee el almacén de la extensión)
 * - La **lista** y la **red activa** las publica `wallet_getState` (`networks`, `currentChainId`),
 *   que el contenedor (M39) ya tiene: esta vista no lee el almacén ni importa nada del SW.
 * - El **cambio** se pide con el método aprobable `wallet_switchEthereumChain` (§5.1.1). Si la red
 *   destino **ya es la activa**, el Service Worker responde `null` **sin abrir ventana**
 *   (`CA-RF-22`); si no, la aprobación ocurre en la ventana única y, al aprobarla, la red activa
 *   cambia y llega `chainChanged` a todas las pestañas (`CA-RF-24`).
 * - El **alta** se pide con `wallet_addEthereumChain` (EIP-3085). El Service Worker valida el
 *   esquema y el host del `rpcUrl`, comprueba la coherencia del `chainId` contra el nodo, exige
 *   aprobación y pide **siempre** el permiso de host en runtime (DEC-36): el alta **no** activa la
 *   red (ADT-25 / P-22), y la vista lo dice de forma explícita antes y después de enviarla.
 *
 * La validación inline es un ESPEJO de la validación previa de M25 —esquema y host del `rpcUrl`,
 * `chainId` coherente, nombre y símbolo— para que el usuario vea el problema antes de abrir la
 * ventana de aprobación; la fuente de verdad sigue siendo el Service Worker, que responde su error
 * tipado con `code` si algo no cuadra.
 */

import { useMemo, useState, type JSX } from 'react';
import type { ChainIdHex, StoredNetwork } from '../../shared/types';
import { ADD_CHAIN_ACTIVATION_NOTE, NON_TESTNET_WARNING } from '../../shared/constants';
import { Field } from '../components/Field';
import { StatusMessage } from '../components/StatusMessage';
import { popupErrorOf, type PopupError } from '../popupErrors';
import { callWalletMethod } from '../walletRpc';

// ---------------------------------------------------------------------------
// Validación inline (espejo de la validación previa de M25)
// ---------------------------------------------------------------------------

/** Borrador del formulario de alta, en texto (lo que el usuario escribe). */
export interface NetworkDraft {
  name: string;
  chainId: string;
  rpcUrl: string;
  symbol: string;
  explorerUrl: string;
  /** Declaración del usuario: marca la red de pruebas y dispara (o no) el aviso de RNF-23. */
  isTestnet: boolean;
}

/** Borrador vacío del formulario. */
export const EMPTY_NETWORK_DRAFT: NetworkDraft = {
  name: '',
  chainId: '',
  rpcUrl: '',
  symbol: 'ETH',
  explorerUrl: '',
  isTestnet: true,
};

/** Problemas por campo; `null` cuando el campo es correcto. */
export interface NetworkDraftProblems {
  name: string | null;
  chainId: string | null;
  rpcUrl: string | null;
  symbol: string | null;
  explorerUrl: string | null;
}

/** Anfitriones exentos de la regla `https`: el RPC local del proyecto (`RE-04`/RT-04). */
const LOCAL_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]', '::1'];

/** ¿Es un anfitrión local exento (solo estos admiten `http` en claro)? */
const isLocalHost = (host: string): boolean => LOCAL_HOSTS.includes(host.toLowerCase());

/** ¿Es una dirección privada o de enlace local? (mismo criterio que M23). */
const isPrivateHost = (host: string): boolean => {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (octets === null) {
    return false;
  }
  const [a, b] = [Number(octets[1]), Number(octets[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
};

// ---------------------------------------------------------------------------
// Permiso de host en runtime (el gesto de usuario lo aporta ESTA superficie)
// ---------------------------------------------------------------------------

/** Patrón de `optional_host_permissions` del origen de un `rpcUrl` (`origen/*`), o `null`. */
export const hostPermissionPattern = (rpcUrl: string): string | null => {
  try {
    return `${new URL(rpcUrl).origin}/*`;
  } catch {
    return null;
  }
};

/**
 * Pide el permiso de host del nodo desde el POPUP, dentro del propio clic del usuario.
 *
 * Por qué aquí y no solo en el Service Worker (defecto `D-H5-A`, medido en H5):
 * `chrome.permissions.request` **exige un gesto de usuario en el contexto que llama** y el Service
 * Worker no tiene ninguno, así que desde él Chrome rechaza siempre la petición («This function must
 * be called during a user gesture») y el alta terminaba siempre en `4001`. Pedirlo en el clic del
 * popup —y comprobarlo antes con `contains` para no repetir la petición si ya está concedido— es lo
 * que hace que el alta funcione de verdad; el Service Worker vuelve a verificar la concesión antes
 * de persistir (`contains`), de modo que nunca se da por concedido lo que no lo está (DEC-36).
 *
 * Sin API de permisos (arnés de pruebas) se devuelve `true`: no hay nada que conceder.
 */
export const requestHostPermissionFromPopup = async (rpcUrl: string): Promise<boolean> => {
  const permissions = (globalThis as { chrome?: { permissions?: typeof chrome.permissions } }).chrome
    ?.permissions;
  if (permissions === undefined || typeof permissions.request !== 'function') {
    return true;
  }
  const pattern = hostPermissionPattern(rpcUrl);
  if (pattern === null) {
    return false;
  }
  try {
    if (typeof permissions.contains === 'function') {
      const already = await permissions.contains({ origins: [pattern] });
      if (already === true) {
        return true;
      }
    }
    return (await permissions.request({ origins: [pattern] })) === true;
  } catch {
    return false;
  }
};

/** Interpreta el `chainId` escrito: admite `0x…` y decimal, y exige coherencia si hay los dos. */export const parseChainIdDraft = (
  raw: string,
): { chainId: ChainIdHex; chainIdDecimal: number } | null => {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  if (/^0x[0-9a-fA-F]{1,16}$/.test(text)) {
    const decimal = Number.parseInt(text, 16);
    return Number.isSafeInteger(decimal) && decimal >= 0
      ? { chainId: `0x${decimal.toString(16)}` as ChainIdHex, chainIdDecimal: decimal }
      : null;
  }
  if (/^\d{1,16}$/.test(text)) {
    const decimal = Number.parseInt(text, 10);
    return Number.isSafeInteger(decimal) && decimal >= 0
      ? { chainId: `0x${decimal.toString(16)}` as ChainIdHex, chainIdDecimal: decimal }
      : null;
  }
  return null;
};

/** ¿Es un `rpcUrl` aceptable? Devuelve el problema en español, o `null` si es correcto. */
const rpcUrlProblem = (raw: string): string | null => {
  const text = raw.trim();
  if (text.length === 0) {
    return 'Escribe la dirección del nodo, por ejemplo http://127.0.0.1:8545';
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return 'La dirección del nodo no es una URL válida.';
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return 'El esquema del nodo debe ser https o, solo para el RPC local, http.';
  }
  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) {
    return 'La dirección del nodo no incluye host.';
  }
  if (!isLocalHost(host)) {
    if (isPrivateHost(host)) {
      return 'No se admiten hosts privados ni de enlace local.';
    }
    if (scheme === 'http') {
      return 'Con http solo se admite 127.0.0.1 o localhost: cualquier otro nodo exige https.';
    }
  }
  return null;
};

/**
 * Valida el borrador completo. Es una función PURA: no toca el almacén, no llama a la red y no
 * depende de nada del Service Worker.
 */
export const validateNetworkDraft = (draft: NetworkDraft): NetworkDraftProblems => {
  const name = draft.name.trim();
  return {
    name:
      name.length === 0
        ? 'Escribe el nombre de la red.'
        : name.length > 64
          ? 'El nombre no puede superar los 64 caracteres.'
          : null,
    chainId:
      parseChainIdDraft(draft.chainId) === null
        ? 'Escribe el chainId en hexadecimal (0x7a6a) o en decimal (31338).'
        : null,
    rpcUrl: rpcUrlProblem(draft.rpcUrl),
    symbol:
      /^[\x21-\x7e]{1,8}$/.test(draft.symbol.trim())
        ? null
        : 'El símbolo debe tener entre 1 y 8 caracteres visibles (por ejemplo ETH).',
    explorerUrl:
      draft.explorerUrl.trim().length === 0
        ? null
        : /^https?:\/\//.test(draft.explorerUrl.trim())
          ? null
          : 'El explorador debe ser una URL http o https (o quedar vacío).',
  };
};

/** ¿Está el borrador listo para enviarse? */
export const isNetworkDraftReady = (problems: NetworkDraftProblems): boolean =>
  Object.values(problems).every((problem) => problem === null);

/**
 * Construye `params[0]` de EIP-3085 tal y como lo valida M25 (`chainId`, `chainName`, `rpcUrls`,
 * `nativeCurrency` y `blockExplorerUrls`). `isTestnet` viaja como declaración del usuario y el
 * Service Worker resuelve la marca definitiva contra el catálogo (M23/RNF-23).
 */
export const buildAddChainParams = (draft: NetworkDraft): unknown[] => {
  const parsed = parseChainIdDraft(draft.chainId);
  const symbol = draft.symbol.trim().toUpperCase();
  return [
    {
      chainId: parsed?.chainId ?? draft.chainId.trim(),
      chainIdDecimal: parsed?.chainIdDecimal,
      chainName: draft.name.trim(),
      rpcUrls: [draft.rpcUrl.trim()],
      nativeCurrency: { name: symbol, symbol, decimals: 18 },
      blockExplorerUrls: draft.explorerUrl.trim().length > 0 ? [draft.explorerUrl.trim()] : [],
      isTestnet: draft.isTestnet,
    },
  ];
};

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

/** Props de la vista de redes. */
export interface NetworksViewProps {
  /** Redes dadas de alta (`wallet_getState.networks`, §2.6). */
  networks: readonly StoredNetwork[];
  /** `chainId` activo (`wallet_getState.currentChainId`). */
  currentChainId: ChainIdHex | null;
  /** Relee el estado tras un cambio o un alta (lo aporta el contenedor M39). */
  onChanged: () => Promise<void>;
}

/** Vista de «Redes» del popup: lista, cambio con aprobación y alta sin activación. */
export function NetworksView({ networks, currentChainId, onChanged }: NetworksViewProps): JSX.Element {
  const [draft, setDraft] = useState<NetworkDraft>(EMPTY_NETWORK_DRAFT);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<PopupError | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const problems = useMemo(() => validateNetworkDraft(draft), [draft]);
  const ready = isNetworkDraftReady(problems);

  /** Problema de un campo, ya convertido en error de UI con el literal de §4.3. */
  const fieldError = (problem: string | null, cause: 'invalidRpcUrl' | 'invalidNetworkDefinition'): PopupError | null =>
    problem === null ? null : popupErrorOf(cause, {}, { reason: problem, problem });

  const patch = (values: Partial<NetworkDraft>): void => {
    setDraft((previous) => ({ ...previous, ...values }));
  };

  /** Cambio de red: `wallet_switchEthereumChain` con su aprobación (o sin ventana si ya es activa). */
  const handleSwitch = async (network: StoredNetwork): Promise<void> => {
    setBusy(`switch:${network.chainId}`);
    setError(null);
    setStatus(null);
    const response = await callWalletMethod<null>('wallet_switchEthereumChain', [
      { chainId: network.chainId },
    ]);
    setBusy(null);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setStatus(
      `Red activa: ${network.name} (${network.chainId}). El evento chainChanged se ha propagado a todas las pestañas conectadas.`,
    );
    await onChanged();
  };

  /** Alta de red: permiso de host en el clic (gesto) y después `wallet_addEthereumChain`. */
  const handleAdd = async (): Promise<void> => {
    setTouched(true);
    if (!ready) {
      return;
    }
    setBusy('add');
    setError(null);
    setStatus(null);

    // 1. Permiso de host en runtime DENTRO del gesto del usuario (DEC-36 / defecto D-H5-A). Si se
    //    deniega, la red NO se persiste y la llamada se resuelve con el `4001` de §4.3.
    const granted = await requestHostPermissionFromPopup(draft.rpcUrl);
    if (!granted) {
      setBusy(null);
      setError(popupErrorOf('hostPermissionDenied', { rpcUrl: draft.rpcUrl.trim() }));
      return;
    }

    // 2. Alta: validación previa, coherencia de red, aprobación del usuario y persistencia SIN
    //    activar la red (`ADT-25` / P-22).
    const response = await callWalletMethod<StoredNetwork>(
      'wallet_addEthereumChain',
      buildAddChainParams(draft),
    );
    setBusy(null);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    const added = response.result;
    setDraft(EMPTY_NETWORK_DRAFT);
    setTouched(false);
    setStatus(
      `Red ${added?.name ?? draft.name.trim()} (${added?.chainId ?? draft.chainId.trim()}) añadida a la lista. No es la red activa: para usarla hay que cambiarla con una solicitud aparte.`,
    );
    await onChanged();
  };

  return (
    <div className="tk-view">
      <StatusMessage error={error} />
      <StatusMessage message={status} tone="success" />

      <section className="tk-section" aria-labelledby="redes-lista">
        <div className="tk-section__head">
          <h2 className="tk-section__title" id="redes-lista">
            Redes dadas de alta
          </h2>
          <span className="tk-badge">{networks.length}</span>
        </div>

        {networks.length === 0 ? (
          <p className="tk-empty__text">Todavía no hay ninguna red dada de alta.</p>
        ) : (
          <ul className="tk-networks" id="redes-entradas" role="list" aria-label="Redes dadas de alta">
            {networks.map((network) => {
              const active = currentChainId === network.chainId;
              return (
                <li
                  className={`tk-network${active ? ' tk-network--active' : ''}`}
                  key={network.chainId}
                  data-chain-id={network.chainId}
                  data-active={active ? 'true' : 'false'}
                  data-testnet={network.isTestnet ? 'true' : 'false'}
                >
                  <span className="tk-network__head">
                    <span className="tk-network__name">{network.name}</span>
                    {active ? <span className="tk-badge">Activa</span> : null}
                    {network.isTestnet ? (
                      <span className="tk-tag tk-tag--testnet">Red de pruebas</span>
                    ) : (
                      <span className="tk-tag tk-tag--real">Red real</span>
                    )}
                    {network.isDefault ? <span className="tk-tag">Predeterminada</span> : null}
                  </span>
                  <span className="tk-network__meta tk-mono" title={network.rpcUrl}>
                    {network.chainId} · {network.chainIdDecimal} · {network.rpcUrl}
                  </span>
                  <span className="tk-network__meta">
                    Moneda nativa: {network.symbol} ({network.decimals} decimales)
                  </span>
                  {!network.isTestnet ? (
                    <span className="tk-network__warning">{NON_TESTNET_WARNING}</span>
                  ) : null}
                  <div className="tk-network__actions">
                    <button
                      type="button"
                      className="tk-btn-primary tk-btn-small"
                      id={`red-cambiar-${network.chainIdDecimal}`}
                      data-chain-id={network.chainId}
                      disabled={busy !== null || active}
                      onClick={() => {
                        void handleSwitch(network);
                      }}
                    >
                      {active ? 'Es la red activa' : 'Cambiar a esta red'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="tk-note">
          Cambiar de red exige aprobación: si la red destino ya es la activa, el cambio se resuelve
          sin abrir la ventana de confirmación.
        </p>
      </section>

      <section className="tk-section" aria-labelledby="redes-alta">
        <h2 className="tk-section__title" id="redes-alta">
          Dar de alta una red nueva
        </h2>
        <p className="tk-note" id="redes-alta-aviso">
          {ADD_CHAIN_ACTIVATION_NOTE}
        </p>

        <div className="tk-form">
          <Field
            id="red-nombre"
            label="Nombre de la red"
            value={draft.name}
            onChange={(value) => {
              patch({ name: value });
            }}
            error={touched ? fieldError(problems.name, 'invalidNetworkDefinition') : null}
            hint="Hasta 64 caracteres; es el nombre que verás en la lista."
          />
          <Field
            id="red-chain-id"
            label="chainId"
            value={draft.chainId}
            onChange={(value) => {
              patch({ chainId: value });
            }}
            error={touched ? fieldError(problems.chainId, 'invalidNetworkDefinition') : null}
            hint="Hexadecimal (0x7a6a) o decimal (31338)."
            mono
          />
          <Field
            id="red-rpc"
            label="Nodo RPC (rpcUrl)"
            value={draft.rpcUrl}
            onChange={(value) => {
              patch({ rpcUrl: value });
            }}
            error={touched ? fieldError(problems.rpcUrl, 'invalidRpcUrl') : null}
            hint="https preferente; http solo para 127.0.0.1 o localhost."
            mono
          />
          <Field
            id="red-simbolo"
            label="Símbolo de la moneda nativa"
            value={draft.symbol}
            onChange={(value) => {
              patch({ symbol: value });
            }}
            error={touched ? fieldError(problems.symbol, 'invalidNetworkDefinition') : null}
            hint="Entre 1 y 8 caracteres visibles (ETH, MATIC…)."
          />
          <Field
            id="red-explorador"
            label="Explorador de bloques (opcional)"
            value={draft.explorerUrl}
            onChange={(value) => {
              patch({ explorerUrl: value });
            }}
            error={touched ? fieldError(problems.explorerUrl, 'invalidNetworkDefinition') : null}
            hint="Déjalo vacío si la red no tiene explorador."
            mono
          />

          <div className="tk-check">
            <input
              id="red-es-testnet"
              type="checkbox"
              checked={draft.isTestnet}
              onChange={(event) => {
                patch({ isTestnet: event.target.checked });
              }}
            />
            <label htmlFor="red-es-testnet">Es una red de pruebas (testnet)</label>
          </div>

          {/* Aviso de red NO testnet (RNF-23, tarea 5.3): es el mismo literal que publica M25. */}
          {!draft.isTestnet ? (
            <p className="tk-warning-band tk-warning-band--danger" id="red-aviso-testnet" role="alert">
              {NON_TESTNET_WARNING}
            </p>
          ) : null}

          <div className="tk-actions-row">
            <button
              type="button"
              id="red-alta-enviar"
              className="tk-btn-primary"
              disabled={busy !== null}
              onClick={() => {
                void handleAdd();
              }}
            >
              Dar de alta la red
            </button>
          </div>
          <p className="tk-note">
            El alta exige aprobación y solicita el permiso de acceso al nodo en tiempo de ejecución.
            Si deniegas ese permiso, la red no se guarda.
          </p>
        </div>
      </section>
    </div>
  );
}

export default NetworksView;
