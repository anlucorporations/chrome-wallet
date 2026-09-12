/**
 * M24 — `src/background/networks/switch.ts`
 * `wallet_switchEthereumChain` **aprobable** (H5, tarea 5.1 de `plan_desarrollo.md` §3.5.5).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §3.5 (secuencia del cambio y sus reglas) y `diccionario_datos.md` §4.3
 *   («`wallet_switchEthereumChain` — ciclo completo»): los CUATRO casos del contrato.
 * - `plan_desarrollo.md` §3.5.6 `CA-RF-22`/`CA-RF-24` y P-19/DEC-29, `ADT-25`/P-22 (ADR-16).
 *
 * LOS CUATRO CASOS (literales del contrato, no negociables)
 *   1. **La red destino YA es la activa** (`truekeate_chain_id`): responde `null` de inmediato,
 *      **sin** crear `PendingRequest`, **sin** abrir `notification.html` y **sin** emitir
 *      `chainChanged` (`CA-RF-22`, P-19/DEC-29).
 *   2. **Dada de alta y distinta de la activa**: crea **exactamente 1** entrada `pending` (la cola
 *      de M14, reutilizada: aquí NO se duplica la lógica de encolado) y la ventana única (M18)
 *      pide la aprobación. **Al aprobar**: (a) escribe `truekeate_chain_id`, (b) emite
 *      `chainChanged` con el `chainId` nuevo a **TODAS las pestañas** (`CA-RF-24`/RF-24) y (c)
 *      responde `null`. Entonces `eth_chainId` devuelve el id nuevo.
 *   3. **No dada de alta**: `4901` «La red solicitada no está dada de alta.» **sin** ventana y
 *      **sin** entrada en la cola.
 *   4. **Rechazo o vencimiento** del plazo de 120 s: `4001` y la red activa **NO** cambia.
 *
 * REGLA DE SIEMPRE (P-19/DEC-29): el cambio exige aprobación **siempre que la red destino no sea
 * la activa**, con independencia de quién lo pida (dApp o popup); el único caso SIN aprobación es
 * el 1.
 */

import type { Address, ChainIdHex, Eip1193Error, NetworkPreview } from '../../shared/types';
import type { TrustedSenderContext } from '../security/senderGuard';
import { STORAGE_KEYS, readStorage, writeStorage } from '../state/schema';
import { chainNotRegisteredError, internalError } from '../rpc/errors';
import { emitChainChanged } from '../events';
import {
  normalizeChainId,
  parseChainId,
  readNetworksFromSnapshot,
  type NetworkStorage,
  type NetworksCatalog,
} from './catalog';
import {
  buildNetworkPreview,
  defaultAddChainDeps,
  resolveApprovalAccount,
  type AddChainDeps,
  type NetworkApprovalDraft,
  type NetworkApprovalOutcome,
  type NetworkApprovalRunner,
} from './addChain';

// ---------------------------------------------------------------------------
// Caso 1 y 3: resolución previa SIN ventana
// ---------------------------------------------------------------------------

/** Red destino resuelta antes de abrir ninguna ventana. */
export type SwitchTargetResolution =
  | { status: 'already-active'; chainId: ChainIdHex }
  | { status: 'registered'; chainId: ChainIdHex; catalog: NetworksCatalog; activeChainId: ChainIdHex }
  | { status: 'not-registered'; chainId: ChainIdHex | null };

/**
 * Resuelve el `chainId` de `params[0]` contra `truekeate_networks` y `truekeate_chain_id`, que es
 * lo que decide si el cambio es inmediato (caso 1), aprobable (caso 2) o imposible (caso 3).
 *
 * Acepta la forma hexadecimal canónica y la decimal coherente (EIP-3085). Un `chainId` que no se
 * puede interpretar se trata como red NO dada de alta: `4901`, sin ventana.
 */
export const resolveSwitchTarget = async (
  params: readonly unknown[],
  options: { storage?: NetworkStorage } = {},
): Promise<SwitchTargetResolution> => {
  const first = params[0];
  const record =
    typeof first === 'object' && first !== null && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : {};
  const parsed = parseChainId(record.chainId, record.chainIdDecimal);
  if (!parsed.ok) {
    return { status: 'not-registered', chainId: null };
  }
  const keys = [STORAGE_KEYS.networks, STORAGE_KEYS.chainId] as const;
  const stored =
    options.storage === undefined
      ? await readStorage(keys)
      : await readStorage(keys, options.storage);
  const catalog = readNetworksFromSnapshot(stored);
  const rawActive = stored[STORAGE_KEYS.chainId];
  const activeChainId = normalizeChainId(rawActive);
  if (activeChainId !== null && activeChainId === parsed.chainId) {
    return { status: 'already-active', chainId: parsed.chainId };
  }
  if (catalog[parsed.chainId] === undefined) {
    return { status: 'not-registered', chainId: parsed.chainId };
  }
  return {
    status: 'registered',
    chainId: parsed.chainId,
    catalog,
    activeChainId:
      activeChainId ??
      (Object.values(catalog).find((network) => network.isDefault)?.chainId as ChainIdHex) ??
      parsed.chainId,
  };
};

// ---------------------------------------------------------------------------
// Efecto del cambio aprobado
// ---------------------------------------------------------------------------

/**
 * Aplica el cambio de red aprobado: escribe `truekeate_chain_id` y emite `chainChanged` con el
 * `chainId` nuevo a **TODAS las pestañas** (`CA-RF-24`).
 *
 * El ORDEN es deliberado: primero se PERSISTE —`eth_chainId` debe devolver ya el id nuevo cuando la
 * dApp reciba el evento— y solo después se propaga el evento; el contador de pestañas alcanzadas se
 * devuelve para la traza y la verificación.
 */
export const activateChain = async (
  chainId: ChainIdHex,
  options: { emit?: typeof emitChainChanged; storage?: NetworkStorage } = {},
): Promise<{ chainId: ChainIdHex; delivered: number }> => {
  const written =
    options.storage === undefined
      ? await writeStorage({ [STORAGE_KEYS.chainId]: chainId })
      : await writeStorage({ [STORAGE_KEYS.chainId]: chainId }, options.storage);
  if (!written) {
    throw internalError({ reason: 'chain-id-write-failed', chainId });
  }
  const emit = options.emit ?? emitChainChanged;
  const delivered = await emit(chainId);
  return { chainId, delivered };
};

// ---------------------------------------------------------------------------
// Despacho público de M24
// ---------------------------------------------------------------------------

/** Dependencias inyectables del cambio (todas con su valor real por defecto). */
export interface SwitchChainDeps {
  /** Coherencia/cuenta para el alta desde el popup (M25). */
  readonly account: AddChainDeps;
  /** Efecto del cambio aprobado (persistencia + `chainChanged`). */
  readonly activate: typeof activateChain;
}

/** Dependencias reales del cambio. */
export const defaultSwitchChainDeps: SwitchChainDeps = {
  account: defaultAddChainDeps,
  activate: activateChain,
};

/** Desenlace del cambio: `null` (éxito, contrato EIP-1193) o el error con `code`. */
export type SwitchChainResult =
  | { ok: true; result: null; switched: boolean; chainId: ChainIdHex; delivered: number }
  | { ok: false; error: Eip1193Error };

/**
 * Opciones del cambio. Es la forma que consumen tanto el router (M3) como el despacho aprobable
 * (M19.b), de modo que el cambio de red tiene UN solo camino y ningún llamador duplica su lógica.
 */
export interface SwitchEthereumChainOptions {
  params: readonly unknown[];
  context: TrustedSenderContext;
  /** Cuenta de la sesión vigente (dApp); `null`/ausente en el popup. */
  sessionAccount?: Address | null;
  /** Ciclo aprobable (M19.b en producción). En pruebas, un doble. */
  runner: NetworkApprovalRunner;
  now?: number;
  storage?: NetworkStorage;
  /** Efecto inyectable (pruebas del flujo de red). */
  activate?: typeof activateChain;
  /** Dependencias inyectables (cuenta y efecto); por defecto, las reales. */
  deps?: SwitchChainDeps;
}

/**
 * Ejecuta `wallet_switchEthereumChain` con los cuatro casos del contrato.
 *
 * Nunca lanza: devuelve el resultado (`null`) o un error EIP-1193 del catálogo (M6) con `code`.
 */
export const switchEthereumChain = async (
  options: SwitchEthereumChainOptions,
): Promise<SwitchChainResult> => {
  try {
    const resolution =
      options.storage === undefined
        ? await resolveSwitchTarget(options.params)
        : await resolveSwitchTarget(options.params, { storage: options.storage });

    // Caso 1: ya es la red activa → `null` SIN ventana, SIN cola y SIN `chainChanged`.
    if (resolution.status === 'already-active') {
      return { ok: true, result: null, switched: false, chainId: resolution.chainId, delivered: 0 };
    }

    // Caso 3: no dada de alta → `4901` SIN ventana y SIN entrada en la cola.
    if (resolution.status === 'not-registered') {
      throw chainNotRegisteredError({
        reason: resolution.chainId === null ? 'invalid-chain-id' : 'chain-not-registered',
        chainId: resolution.chainId,
        params: options.params[0],
      });
    }

    // Caso 2: dada de alta y distinta de la activa → SIEMPRE aprobación (P-19/DEC-29).
    const target = resolution.catalog[resolution.chainId];
    if (target === undefined) {
      throw chainNotRegisteredError({ reason: 'chain-not-registered', chainId: resolution.chainId });
    }
    const preview: NetworkPreview = buildNetworkPreview('switch', target, resolution.activeChainId);
    const account = await resolveApprovalAccount(
      options.context,
      options.sessionAccount ?? null,
      options.deps?.account ?? defaultAddChainDeps,
    );
    const runner = options.runner;
    const draft: NetworkApprovalDraft = {
      method: 'wallet_switchEthereumChain',
      params: [...options.params],
      origin: options.context.origin,
      tabId: options.context.tabId,
      frameId: options.context.frameId,
      account,
      chainId: resolution.activeChainId,
      networkPreview: preview,
    };
    const outcome: NetworkApprovalOutcome = await runner(draft, options.now ?? Date.now());
    if (!outcome.ok || !outcome.approved) {
      // Caso 4: rechazo o vencimiento → `4001`; la red activa NO cambia.
      return {
        ok: false,
        error: outcome.error ?? internalError({ reason: 'network-approval-rejected' }),
      };
    }

    // Aprobado: persistir el `chainId` nuevo y emitir `chainChanged` a TODAS las pestañas.
    const activate = options.activate ?? activateChain;
    const applied =
      options.storage === undefined
        ? await activate(resolution.chainId)
        : await activate(resolution.chainId, { storage: options.storage });
    return {
      ok: true,
      result: null,
      switched: true,
      chainId: applied.chainId,
      delivered: applied.delivered,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        typeof error === 'object' &&
        error !== null &&
        typeof (error as Eip1193Error).code === 'number'
          ? (error as Eip1193Error)
          : internalError({ reason: 'switch-chain-failed', method: 'wallet_switchEthereumChain' }),
    };
  }
};

/**
 * Despacha `wallet_switchEthereumChain` por la ruta aprobable de M19.b (tarea 5.1): construye el
 * **runner** con las dependencias del despacho de H4 y delega en {@link switchEthereumChain}.
 *
 * Es el punto que consume M3 (router) y M19.b, de modo que el cambio reutiliza la MISMA cola y la
 * MISMA ventana única y no duplica ni el encolado ni el plazo.
 */
export const dispatchSwitchEthereumChain = async (
  options: SwitchEthereumChainOptions & { runner: NetworkApprovalRunner },
): Promise<SwitchChainResult> => switchEthereumChain(options);

/** Red activa persistida (`truekeate_chain_id`), o `null` si falta o está malformada. */
export const readActiveChainId = async (storage: NetworkStorage = undefined): Promise<ChainIdHex | null> => {
  const stored =
    storage === undefined
      ? await readStorage([STORAGE_KEYS.chainId])
      : await readStorage([STORAGE_KEYS.chainId], storage);
  return normalizeChainId(stored[STORAGE_KEYS.chainId]);
};
