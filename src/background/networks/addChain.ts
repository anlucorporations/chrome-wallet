/**
 * M25 — `src/background/networks/addChain.ts`
 * `wallet_addEthereumChain` con **aprobación del usuario** y **permiso de host en runtime**
 * (H5, tarea 5.2 de `plan_desarrollo.md` §3.5.5; `documento_tecnico.md` §3.5).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §3.5 (secuencia del alta y sus cuatro reglas) y §5.1.1 (contratos).
 * - `diccionario_datos.md` §2.6 (`truekeate_networks`: el alta **solo añade**, `ADT-25`/`P-22`),
 *   §4.3 (`wallet_addEthereumChain`: validación previa, permiso siempre, denegación → `4001`) y
 *   `entornos_globales.md` §4 (`optional_host_permissions`, mínimos privilegios).
 * - `plan_desarrollo.md` §3.5.6 `CA-RF-23` y RNF-23 (aviso de red no testnet, tarea 5.3).
 *
 * ORDEN EXACTO DEL ALTA (§3.5, pasos 1→5)
 *   1. **Validación PREVIA**, antes de abrir ventana y sin pedir permiso: esquema (`https`
 *      preferente; `http` solo en `127.0.0.1`/`localhost`), host (ni privado ni de enlace local),
 *      `chainId` (hexadecimal/decimal COHERENTE), `symbol` (por defecto `ETH`) y `isTestnet`
 *      (RNF-23).
 *   2. **Coherencia de red**: el nodo del `rpcUrl` debe declarar el MISMO `chainId`; si no, el alta
 *      se rechaza con error tipado y **no se persiste** (§3.5).
 *   3. **Aprobación explícita**: `PendingRequest` en la cola (M14) + ventana única (M18), con la
 *      vista previa de la red (M19/M25) y el aviso de que **NO** se activará (P-22).
 *   4. **`chrome.permissions.request` sobre el origen del `rpcUrl`**, SIEMPRE en runtime y
 *      **también cuando el alta nace en el popup** (DEC-36/DEC-41/ADT-25): la aprobación de la
 *      ventana es el gesto válido que exige la API. La concesión queda registrada **por red** en
 *      `truekeate_networks`.
 *   5. **Persistencia con `isDefault: false`** y nada más: `truekeate_chain_id` **no** cambia, no se
 *      emite `chainChanged` y no se encola ningún cambio de red. Usar la red exige un
 *      `wallet_switchEthereumChain` posterior con **su propia** aprobación (ADR-16).
 *
 * DENEGACIÓN DEL PERMISO: la red **NO** se persiste y la llamada se resuelve con `4001` y el
 * literal de «permiso de host denegado» de §4.3 (M6).
 *
 * Este módulo NO duplica lógica: la cola, el plazo, la ventana y la decisión son de M14/M15/M17/M18
 * (el ciclo aprobable lo ejecuta el despacho de H4 por el `runner` inyectado).
 */

import type {
  Address,
  ChainIdHex,
  Eip1193Error,
  NetworkPreview,
  StoredNetwork,
} from '../../shared/types';
import type { TrustedSenderContext } from '../security/senderGuard';
import {
  ADD_CHAIN_ACTIVATION_NOTE,
  NON_TESTNET_WARNING,
} from '../../shared/constants';
import {
  chainIdMismatchError,
  hostPermissionDeniedError,
  internalError,
  invalidNetworkDefinitionError,
  invalidRpcUrlError,
  rpcUnavailableError,
  unauthorizedOriginError,
} from '../rpc/errors';
import { rpcSend } from '../rpc/client';
import { getCurrentAddress } from '../accounts';
import { STORAGE_KEYS, readStorage, writeStorage } from '../state/schema';
import {
  parseChainDeclaration,
  readNetworksFromSnapshot,
  storedNetworkFromDeclaration,
  upsertNetwork,
  type ChainDeclaration,
  type NetworksCatalog,
  type RpcUrlProblem,
} from './catalog';

// ---------------------------------------------------------------------------
// Costura con el ciclo aprobable de H4 (M14/M15/M18)
// ---------------------------------------------------------------------------

/**
 * Borrador de la solicitud de red. Es el `PendingRequestDraft` de M14 con los campos que el alta
 * necesita: se declara aquí —y no importando el tipo de `approvals/queue.ts`— para que M25 no cree
 * un ciclo de módulos (`queue → decisions → …`); la forma es un subconjunto ESTRICTO del borrador
 * real, así que un cambio en la cola rompe la compilación de este módulo en vez de divergir.
 */
export interface NetworkApprovalDraft {
  method: 'wallet_switchEthereumChain' | 'wallet_addEthereumChain';
  /** `params[0]` original de EIP-3085 (payload íntegro de la solicitud, §2.8). */
  params: unknown[];
  origin: string;
  tabId: number | null;
  frameId: number | null;
  account: Address;
  chainId: ChainIdHex;
  requestId?: string;
  /** Vista previa de la red: es el dato que pinta la ventana de confirmación (§3.5). */
  networkPreview: NetworkPreview;
}

/**
 * Desenlace del ciclo aprobable: `status: 'approved'` es lo ÚNICO que autoriza el efecto.
 *
 * No transporta la solicitud resuelta —M24/M25 no necesitan sus campos: el efecto del cambio es el
 * `chainId` ya resuelto y el del alta, la declaración ya validada—, de modo que el runner sirve
 * tanto al despacho de H4 como al router sin acoplar los dos módulos por el tipo de la cola.
 */
export interface NetworkApprovalOutcome {
  /** `false` solo cuando la cola rechazó el alta (cardinalidad, cota o cuota). */
  ok: boolean;
  approved: boolean;
  status: 'approved' | 'rejected' | 'expired' | 'rejected-by-queue';
  /** Error EIP-1193 que cerró el ciclo; `null` cuando se aprobó. */
  error: Eip1193Error | null;
}

/**
 * Ejecuta el ciclo aprobable común (alta en la cola → plazo → ventana → espera de la decisión).
 * En producción es el `runApprovalCycle` de M19.b; en las pruebas, un doble que decide de inmediato.
 */
export type NetworkApprovalRunner = (
  draft: NetworkApprovalDraft,
  now: number,
) => Promise<NetworkApprovalOutcome>;

// ---------------------------------------------------------------------------
// Traducción de los motivos de validación a los literales de §4.3 (M6)
// ---------------------------------------------------------------------------

/** Literal de §4.3 para un `rpcUrl` rechazado: el motivo viaja en `data`, no en el mensaje. */
const rpcUrlError = (problem: RpcUrlProblem, received: unknown): Eip1193Error =>
  invalidRpcUrlError({ reason: problem, rpcUrl: typeof received === 'string' ? received : null });

/** Literal de §4.3 para unos datos de red no utilizables (con su diagnóstico). */
const definitionError = (field: string, problem: string): Eip1193Error =>
  invalidNetworkDefinitionError({ reason: `${field}-${problem}`, field, problem });

// ---------------------------------------------------------------------------
// Validación previa y vista previa
// ---------------------------------------------------------------------------

/** Red activa y catálogo, leídos de UNA sola instantánea del almacén. */
export interface NetworkStorageView {
  catalog: NetworksCatalog;
  activeChainId: ChainIdHex | null;
}

/** Lee el catálogo y `truekeate_chain_id` SIN escribir nada (RNF-14: solo el SW escribe). */
export const readNetworkStorageView = async (): Promise<NetworkStorageView> => {
  const stored = await readStorage([STORAGE_KEYS.networks, STORAGE_KEYS.chainId]);
  const catalog = readNetworksFromSnapshot(stored);
  const raw = stored[STORAGE_KEYS.chainId];
  const activeChainId =
    typeof raw === 'string' && /^0x[0-9a-fA-F]+$/.test(raw) ? (raw.toLowerCase() as ChainIdHex) : null;
  return { catalog, activeChainId };
};

/**
 * Red mínima que basta para construir la vista previa. La cumplen tanto la declaración validada de
 * EIP-3085 (`ChainDeclaration`) como la entrada persistida (`StoredNetwork`), de modo que M24 y M25
 * comparten UNA sola construcción de la vista previa sin duplicar el aviso de RNF-23.
 */
export interface NetworkPreviewSource {
  chainId: ChainIdHex;
  chainIdDecimal: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  decimals: number;
  isTestnet: boolean;
}

/**
 * Construye la vista previa de una red para la ventana de confirmación (M50): incluye el dato
 * `isTestnet` y, cuando la red **no** es de pruebas, la advertencia literal de RNF-23 (tarea 5.3).
 */
export const buildNetworkPreview = (
  kind: NetworkPreview['kind'],
  network: NetworkPreviewSource,
  currentChainId: ChainIdHex | null,
  options: { registered?: boolean; activationNote?: string } = {},
): NetworkPreview => ({
  kind,
  chainId: network.chainId,
  chainIdDecimal: network.chainIdDecimal,
  name: network.name,
  rpcUrl: network.rpcUrl,
  symbol: network.symbol,
  decimals: network.decimals,
  isTestnet: network.isTestnet,
  warning: network.isTestnet ? null : NON_TESTNET_WARNING,
  currentChainId: currentChainId ?? network.chainId,
  ...(options.registered === undefined ? {} : { alreadyRegistered: options.registered }),
  ...(options.activationNote === undefined ? {} : { activationNote: options.activationNote }),
});

/** Declaración de alta ya validada, con la vista previa y la red activa de partida. */
export interface ValidatedChainDeclaration {
  declaration: ChainDeclaration;
  preview: NetworkPreview;
  /** `true` cuando la red ya estaba dada de alta (el alta es idempotente, EIP-3085). */
  registered: boolean;
  activeChainId: ChainIdHex | null;
  catalog: NetworksCatalog;
}

/**
 * Validación PREVIA del alta (§3.5 paso 1): esquema y host del `rpcUrl`, `chainId` coherente,
 * símbolo válido e `isTestnet`. Se ejecuta **antes** de abrir la ventana y **sin** pedir permiso.
 */
export const validateAddChainParams = async (
  params: readonly unknown[],
): Promise<ValidatedChainDeclaration> => {
  const view = await readNetworkStorageView();
  const parsed = parseChainDeclaration(params[0], view.catalog);
  if (!parsed.ok) {
    if (parsed.problem.field === 'rpcUrl') {
      throw rpcUrlError(parsed.problem.problem, (params[0] as { rpcUrls?: unknown[] })?.rpcUrls?.[0]);
    }
    throw definitionError(parsed.problem.field, parsed.problem.problem);
  }
  return {
    declaration: parsed.declaration,
    preview: buildNetworkPreview('add', parsed.declaration, view.activeChainId, {
      registered: view.catalog[parsed.declaration.chainId] !== undefined,
      activationNote: ADD_CHAIN_ACTIVATION_NOTE,
    }),
    registered: view.catalog[parsed.declaration.chainId] !== undefined,
    activeChainId: view.activeChainId,
    catalog: view.catalog,
  };
};

// ---------------------------------------------------------------------------
// Coherencia de red contra el nodo (§3.5)
// ---------------------------------------------------------------------------

/** Lee el `chainId` que declara el nodo del `rpcUrl` indicado (una sola llamada, sin reintentos). */
export type ChainIdProbe = (rpcUrl: string, declaredChainId: ChainIdHex) => Promise<string | null>;

/**
 * Sonda real: `eth_chainId` contra el `rpcUrl` declarado. Se limita a UN intento (sin backoff)
 * porque es una comprobación de coherencia dentro de la propia solicitud, no una lectura de la red
 * activa: un nodo que no responde se detecta igual, sin sumar 12 s de reintentos.
 */
export const probeChainId: ChainIdProbe = async (rpcUrl, declaredChainId) => {
  try {
    const raw = await rpcSend('eth_chainId', [], {
      rpcUrl,
      chainId: declaredChainId,
      attempts: 1,
    });
    return typeof raw === 'string' ? raw : null;
  } catch {
    return null;
  }
};

/** Normaliza el `chainId` que devuelve el nodo; `null` si no es hexadecimal utilizable. */
const normalizeProbeResult = (value: string | null): ChainIdHex | null =>
  value !== null && /^0x[0-9a-fA-F]+$/.test(value.trim())
    ? (value.trim().toLowerCase() as ChainIdHex)
    : null;

// ---------------------------------------------------------------------------
// Permiso de host en runtime (SIEMPRE, también desde el popup)
// ---------------------------------------------------------------------------

/** Superficie mínima de `chrome.permissions` que usa el alta (sin `any`). */
export interface PermissionsLike {
  request(permissions: { origins?: string[] }): Promise<boolean>;
  /** Consulta de una concesión VIGENTE. Si falta, se intenta siempre `request`. */
  contains?(permissions: { origins?: string[] }): Promise<boolean>;
}

/** Lee `chrome.permissions` sin `any`; `null` si la API no está (pruebas o contexto sin permisos). */
export const getPermissionsApi = (): PermissionsLike | null => {
  const chromeNs: unknown = (globalThis as { chrome?: unknown }).chrome;
  if (typeof chromeNs !== 'object' || chromeNs === null) {
    return null;
  }
  const permissions: unknown = (chromeNs as { permissions?: unknown }).permissions;
  if (typeof permissions !== 'object' || permissions === null) {
    return null;
  }
  const request: unknown = (permissions as { request?: unknown }).request;
  if (typeof request !== 'function') {
    return null;
  }
  return permissions as PermissionsLike;
};

/**
 * Patrón de `optional_host_permissions` del origen de un `rpcUrl` (`origen/*`); `null` si el
 * `rpcUrl` no es una URL utilizable.
 */
export const hostPermissionPattern = (rpcUrl: string): string | null => {
  try {
    return `${new URL(rpcUrl).origin}/*`;
  } catch {
    return null;
  }
};

/**
 * Solicita el permiso de host del `rpcUrl` (patrón de `optional_host_permissions`: `origen/*`).
 *
 * Regla dura (DEC-36/DEC-41): el alta pide el permiso en runtime **siempre**, también cuando nace
 * en el popup; nunca se da por concedido lo que no lo esté.
 *
 * DEFECTO MEDIDO Y CORREGIDO AQUÍ (H5, `D-H5-A`): antes se llamaba a `chrome.permissions.request`
 * sin más, y ese API **exige un gesto de usuario en el contexto que llama**: desde el Service Worker
 * Chrome lo rechaza siempre con «This function must be called during a user gesture» —medido incluso
 * con el origen YA concedido—, de modo que el alta terminaba **siempre** en `4001` y RF-23 era
 * inalcanzable. La corrección tiene dos partes:
 *
 *   1. si la concesión **ya está vigente** (`contains`) se acepta sin llamar a `request`, que es lo
 *      que hace útil el gesto previo del popup (M43) y lo que hace verificable el permiso concedido;
 *   2. si no lo está, se intenta `request` y un rechazo (o un gesto ausente) se responde como
 *      **denegación**: `4001` y la red NO se persiste.
 *
 * El gesto de usuario lo aporta la superficie que TIENE usuario: `popup/views/NetworksView.tsx` pide
 * el permiso en el propio clic antes de invocar el alta (documentado como desviación aceptada en
 * `plan_desarrollo.md` §3.5.10). Para un alta nacida en una dApp el gesto tendría que aportarlo la
 * ventana de confirmación (`src/notification/**`, fuera del terreno de H5): queda reportado como
 * defecto `D-H5-B` y su modo de fallo es el observable `4001` sin persistir.
 */
export const requestHostPermission = async (
  rpcUrl: string,
  permissions: PermissionsLike | null = getPermissionsApi(),
): Promise<boolean> => {
  if (permissions === null) {
    // Sin API de permisos: no hay nada que conceder (arnés de pruebas).
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

// ---------------------------------------------------------------------------
// Despacho público de M25
// ---------------------------------------------------------------------------

/** Dependencias inyectables del alta (todas con su valor real por defecto). */
export interface AddChainDeps {
  /** Envoltorio fino sobre `getCurrentAddress` (M28), para el alta desde el popup. */
  readonly currentAddress: () => Promise<Address | null>;
  /** Coherencia de red contra el nodo (§3.5). */
  readonly probe: ChainIdProbe;
  /** API de permisos de host; `null` = contexto sin `chrome.permissions`. */
  readonly permissions: PermissionsLike | null;
  /** Persistencia del alta (`isDefault: false`, `ADT-25`). */
  readonly upsert: (network: StoredNetwork) => Promise<NetworksCatalog>;
}

/** Dependencias reales del alta. */
export const defaultAddChainDeps: AddChainDeps = {
  currentAddress: async () => getCurrentAddress(),
  probe: probeChainId,
  permissions: getPermissionsApi(),
  upsert: async (network) => upsertNetwork(network),
};

/** Opciones del alta. */
export interface AddEthereumChainOptions {
  params: readonly unknown[];
  context: TrustedSenderContext;
  /**
   * Cuenta de la sesión vigente cuando la solicitud nace en una dApp (la resuelve el despacho de
   * H4, que es quien conoce `truekeate_connected_sites`). `null`/ausente en el popup.
   */
  sessionAccount?: Address | null;
  /** Ciclo aprobable (M19.b en producción). Omitirlo SOLO en pruebas del validador. */
  runner?: NetworkApprovalRunner;
  now?: number;
  deps?: Partial<AddChainDeps>;
}

/** Desenlace del alta: la red persistida o el error EIP-1193 con `code`. */
export type AddChainResult =
  | { ok: true; network: StoredNetwork; catalog: NetworksCatalog }
  | { ok: false; error: Eip1193Error };

/**
 * Ejecuta `wallet_addEthereumChain` con el orden exacto de §3.5: validación previa → coherencia de
 * red → aprobación → permiso de host → persistencia con `isDefault: false`.
 *
 * NUNCA activa la red: `truekeate_chain_id` no se toca y no se emite `chainChanged`
 * (`ADT-25`/`P-22`, `CA-RF-23`).
 */
export const addEthereumChain = async (
  options: AddEthereumChainOptions,
): Promise<AddChainResult> => {
  const deps: AddChainDeps = { ...defaultAddChainDeps, ...options.deps };
  const now = options.now ?? Date.now();
  try {
    // 1. Validación previa (esquema, host, chainId, símbolo, isTestnet): sin ventana ni permiso.
    const validated = await validateAddChainParams(options.params);
    const { declaration, preview, activeChainId } = validated;

    // 2. Coherencia de red: el nodo debe declarar el MISMO chainId (§3.5). Un nodo que no
    //    responde se clasifica con el literal de RPC no disponible (M6, `4900`).
    const observed = normalizeProbeResult(await deps.probe(declaration.rpcUrl, declaration.chainId));
    if (observed === null) {
      throw rpcUnavailableError({
        reason: 'chain-coherence-probe-failed',
        rpcUrl: declaration.rpcUrl,
        chainId: declaration.chainId,
        method: 'eth_chainId',
      });
    }
    if (observed !== declaration.chainId) {
      throw chainIdMismatchError(declaration.chainId, observed);
    }

    // 3. Aprobación explícita del usuario en la ventana única (cola M14 + ventana M18).
    const account = await resolveApprovalAccount(options.context, options.sessionAccount ?? null, deps);
    const runner = options.runner;
    if (runner === undefined) {
      throw internalError({ reason: 'missing-approval-runner', method: 'wallet_addEthereumChain' });
    }
    const outcome = await runner(
      {
        method: 'wallet_addEthereumChain',
        params: [...options.params],
        origin: options.context.origin,
        tabId: options.context.tabId,
        frameId: options.context.frameId,
        account,
        chainId: activeChainId ?? declaration.chainId,
        networkPreview: preview,
      },
      now,
    );
    if (!outcome.ok || !outcome.approved) {
      // Rechazo, vencimiento o rechazo de la cola: se responde el error que cerró el ciclo.
      return {
        ok: false,
        error: outcome.error ?? internalError({ reason: 'network-approval-rejected' }),
      };
    }

    // 4. Permiso de host en runtime, SIEMPRE (también si el alta nació en el popup).
    const granted = await requestHostPermission(declaration.rpcUrl, deps.permissions);
    if (!granted) {
      // Denegación: la red NO se persiste y la llamada se resuelve con el `4001` de §4.3.
      throw hostPermissionDeniedError(declaration.rpcUrl);
    }

    // 5. Persistencia con `isDefault: false`. `truekeate_chain_id` NO se escribe (P-22).
    const network = storedNetworkFromDeclaration(declaration);
    const catalog = await deps.upsert(network);
    return { ok: true, network, catalog };
  } catch (error) {
    return {
      ok: false,
      error:
        typeof error === 'object' && error !== null && typeof (error as Eip1193Error).code === 'number'
          ? (error as Eip1193Error)
          : internalError({ reason: 'add-chain-failed', method: 'wallet_addEthereumChain' }),
    };
  }
};

/**
 * Resuelve la cuenta que acompaña a la solicitud del alta: la de la sesión vigente cuando la pide
 * una dApp —la entrega el despacho de H4, que es quien la conoce— o la cuenta **activa** de la
 * cartera cuando el alta nace en el popup (contexto de la extensión y `DE-C36`: el permiso de host
 * se pide igual, con el clic del usuario como gesto válido).
 *
 * `sessionAccount` es la cuenta ya resuelta por el llamador para una dApp; `null` en el popup.
 */
export const resolveApprovalAccount = async (
  context: TrustedSenderContext,
  sessionAccount: Address | null,
  deps: AddChainDeps = defaultAddChainDeps,
): Promise<Address> => {
  if (sessionAccount !== null) {
    return sessionAccount;
  }
  if (!context.isExtensionContext) {
    // Una dApp sin sesión vigente no tiene cuenta con la que aprobar: `4100` (RNF-11).
    throw unauthorizedOriginError({ reason: 'no-session-for-network-approval', origin: context.origin });
  }
  const account = await deps.currentAddress();
  if (account === null) {
    throw internalError({ reason: 'wallet-without-accounts', method: 'wallet_addEthereumChain' });
  }
  return account;
};

/**
 * Despacha `wallet_addEthereumChain` por la ruta aprobable de M19.b: construye el **runner** con
 * las dependencias del despacho (cola M14 → plazo M15 → ventana M18 → decisión) y delega el flujo
 * completo en {@link addEthereumChain}.
 *
 * Es el punto que consume M3 (router) y M19.b: así el alta no duplica ni la cola ni la ventana, y
 * el permiso de host se pide SIEMPRE y en runtime, también cuando el alta nace en el popup.
 */
export const dispatchAddEthereumChain = async (
  options: AddEthereumChainOptions & { runner: NetworkApprovalRunner },
): Promise<AddChainResult> => addEthereumChain(options);

/** Persiste una red ya validada (fachada de {@link upsertNetwork} para M24/M25). */
export const persistNetwork = async (network: StoredNetwork): Promise<NetworksCatalog> =>
  upsertNetwork(network);

/** Escribe el `chainId` activo (ÚNICA escritura que cambia de red: M24, tarea 5.1). */
export const persistActiveChainId = async (chainId: ChainIdHex): Promise<void> => {
  await writeStorage({ [STORAGE_KEYS.chainId]: chainId });
};
