/**
 * M39 (soporte) — `src/popup/walletState.ts`
 * Estado y operaciones de cartera del popup, SIEMPRE por los métodos internos `wallet_*`.
 *
 * Reparto de responsabilidades (CONTRATO, `documento_tecnico.md` §5.1.1 v1.6):
 * - **El popup es solo UI** (RNF-14): no lee ni escribe el almacén de la extensión, no importa
 *   `ethers` y no custodia estado. Todas las lecturas y mutaciones viajan por
 *   `chrome.runtime.sendMessage` con los métodos internos del contrato, que el Service Worker
 *   despacha (M3/M4) delegando en M28 (cuentas), M29 (ajustes) y M33 (esquema/reset).
 * - Los secretos (`wallet_revealSecret`) no pasan por aquí: los pide la vista de seguridad.
 *
 * Este módulo **sustituye** al respaldo que escribía directo en el almacén: cualquier operación
 * sin método interno propio sería hoy un defecto de contrato, no un atajo de la UI.
 */

import type {
  AccountRef,
  Address,
  ChainIdHex,
  StoredNetwork,
  TruekeateSettings,
} from '../shared/types';
import { callInternal } from './walletRpc';
import type { PopupError } from './popupErrors';
import { popupErrorOf } from './popupErrors';

/** Cuenta tal y como la pinta la UI (derivada o importada). */
export interface AccountRow {
  ref: AccountRef;
  address: Address;
  label: string;
  kind: 'derived' | 'imported';
  /** Índice BIP-44 en las derivadas; `null` en las importadas. */
  index: number | null;
  visible: boolean;
  /** `true` en la cuenta activa. */
  current: boolean;
}

/** Integridad de la cartera tal y como la entrega `wallet_getState` (M13 / RNF-22). */
export interface WalletIntegrity {
  status: 'absent' | 'ok' | 'damaged';
  label: string | null;
  /** Motivos en español; nunca material de la cartera. */
  problems: string[];
  /** ¿Hay frase semilla guardada? (habilita «Revelar frase semilla»). */
  mnemonicPresent: boolean;
  mnemonicValid: boolean;
  canDerive: boolean;
}

/** Ajustes que el popup consume de `wallet_getState` (subconjunto estable de §2.10). */
export type WalletSettings = Pick<
  TruekeateSettings,
  | 'devNoticeAcceptedAt'
  | 'derivedAccountCount'
  | 'accountLabels'
  | 'hiddenAccounts'
  | 'language'
  | 'encryptionEnabled'
  | 'requirePasswordOnOpen'
>;

/** Estado completo que el popup necesita para pintarse. */
export interface WalletSnapshot {
  hasWallet: boolean;
  accounts: AccountRow[];
  currentAccount: AccountRef | null;
  settings: WalletSettings | null;
  networks: StoredNetwork[];
  currentChainId: ChainIdHex | null;
  integrity: WalletIntegrity;
  /** Atajo de `integrity.mnemonicPresent`. */
  mnemonicPresent: boolean;
  /** `true` cuando el SW informó de una cartera dañada (RNF-22). */
  damaged: boolean;
  damagedReason: string | null;
}

/** Respuesta literal de `wallet_getState` (§5.1.1). */
interface WalletStateResponse {
  hasWallet: boolean;
  integrity: WalletIntegrity;
  accounts: Array<{
    ref: AccountRef;
    address: Address;
    kind: 'derived' | 'imported';
    index?: number | null;
    label: string;
    visible: boolean;
    current?: boolean;
  }>;
  currentAccountRef: AccountRef | null;
  networks: StoredNetwork[];
  currentChainId: ChainIdHex;
  settings: WalletSettings;
}

/** Estado del que no hay nada que leer (sin canal o sin respuesta coherente). */
const EMPTY_INTEGRITY: WalletIntegrity = {
  status: 'absent',
  label: null,
  problems: [],
  mnemonicPresent: false,
  mnemonicValid: false,
  canDerive: false,
};

/** Resultado de una lectura del estado: nunca lanza. */
export type SnapshotResult =
  | { ok: true; snapshot: WalletSnapshot }
  | { ok: false; error: PopupError };

/** Resultado de una operación de cartera: nunca lanza. */
export type OperationResult<T> = { ok: true; value: T } | { ok: false; error: PopupError };

/** Normaliza una cuenta de la respuesta del SW a la fila de la UI. */
const asAccountRow = (value: WalletStateResponse['accounts'][number]): AccountRow => ({
  ref: value.ref,
  address: value.address,
  label: value.label,
  kind: value.kind,
  index: typeof value.index === 'number' ? value.index : null,
  visible: value.visible !== false,
  current: value.current === true,
});

/**
 * Lee el estado completo con `wallet_getState` (contrato §5.1.1). El popup NO toca el almacén:
 * el Service Worker es el único custodio del estado (RNF-14).
 *
 * `damaged` se marca con el estado de integridad de M13, que es quien decide la causa fina
 * (RNF-22); el motivo se pinta con el literal de la causa «cartera dañada» de §4.3.
 */
export const readSnapshot = async (): Promise<SnapshotResult> => {
  const response = await callInternal<WalletStateResponse>('wallet_getState');
  if (!response.ok) {
    return response;
  }
  const state = response.result;
  const integrity: WalletIntegrity = state.integrity ?? EMPTY_INTEGRITY;
  const accounts = (state.accounts ?? []).map(asAccountRow);
  const damaged = integrity.status === 'damaged';
  return {
    ok: true,
    snapshot: {
      hasWallet: state.hasWallet,
      accounts,
      currentAccount: state.currentAccountRef,
      settings: state.settings ?? null,
      networks: state.networks ?? [],
      currentChainId: state.currentChainId ?? null,
      integrity,
      mnemonicPresent: integrity.mnemonicPresent,
      damaged,
      damagedReason: damaged
        ? integrity.problems.length > 0
          ? integrity.problems.join(' ')
          : null
        : null,
    },
  };
};

/** Parámetros de `wallet_importMnemonic`: la frase es lo único que viaja. */
export interface ImportMnemonicResult {
  accounts: Address[];
  currentAccount: AccountRef;
}

/** Crea una cartera nueva: se pide al SW la frase y se importa en un solo paso. */
export const createWallet = async (): Promise<OperationResult<ImportMnemonicResult>> => {
  const generated = await callInternal<{ mnemonic: string; wordCount: 12 }>('wallet_generateMnemonic');
  if (!generated.ok) {
    return generated;
  }
  return importMnemonic(generated.result.mnemonic);
};

/** Importa una frase de recuperación (el SW normaliza y valida el checksum BIP-39). */
export const importMnemonic = async (
  mnemonic: string,
): Promise<OperationResult<ImportMnemonicResult>> => {
  const response = await callInternal<ImportMnemonicResult>('wallet_importMnemonic', [mnemonic]);
  return response.ok ? { ok: true, value: response.result } : response;
};

/** Deriva la SIGUIENTE cuenta HD y la persiste (`wallet_addDerivedAccount`, tarea 2.4). */
export const deriveNextAccount = async (): Promise<
  OperationResult<{ account: AccountRow; derivedAccountCount: number }>
> => {
  const response = await callInternal<{ account: WalletStateResponse['accounts'][number]; derivedAccountCount: number }>(
    'wallet_addDerivedAccount',
  );
  if (!response.ok) {
    return response;
  }
  return {
    ok: true,
    value: {
      account: asAccountRow(response.result.account),
      derivedAccountCount: response.result.derivedAccountCount,
    },
  };
};

/** Importa una cuenta por clave privada (el SW valida el rango de secp256k1). */
export const importPrivateKey = async (
  privateKey: string,
  label: string,
): Promise<OperationResult<{ account: Address; accountRef: AccountRef }>> => {
  const response = await callInternal<{ account: Address; accountRef: AccountRef }>(
    'wallet_importPrivateKey',
    [privateKey, label],
  );
  return response.ok ? { ok: true, value: response.result } : response;
};

/** Fija la cuenta activa (`wallet_setCurrentAccount`). */
export const setCurrentAccount = async (
  ref: AccountRef,
): Promise<OperationResult<AccountRef>> => {
  const response = await callInternal<{ currentAccountRef: AccountRef }>(
    'wallet_setCurrentAccount',
    [{ ref }],
  );
  return response.ok ? { ok: true, value: response.result.currentAccountRef } : response;
};

/** Renombra una cuenta (`wallet_renameAccount`; etiquetas de §2.10 y DEC-35). */
export const renameAccount = async (
  account: AccountRow,
  label: string,
): Promise<OperationResult<AccountRow>> => {
  const response = await callInternal<{ account: WalletStateResponse['accounts'][number] }>(
    'wallet_renameAccount',
    [{ ref: account.ref, label }],
  );
  return response.ok ? { ok: true, value: asAccountRow(response.result.account) } : response;
};

/** Oculta o vuelve a mostrar una cuenta (`wallet_setAccountVisible`; RF-06). */
export const setAccountVisibility = async (
  account: AccountRow,
  visible: boolean,
): Promise<OperationResult<AccountRow>> => {
  const response = await callInternal<{ account: WalletStateResponse['accounts'][number] }>(
    'wallet_setAccountVisible',
    [{ ref: account.ref, visible }],
  );
  return response.ok ? { ok: true, value: asAccountRow(response.result.account) } : response;
};

/**
 * Elimina una cuenta importada (`wallet_deleteImportedAccount`). La guarda de sesión de dApp
 * vigente la aplica el SW con `-32000 accountInUseByDapp` (R-09a / DEC-45).
 */
export const removeImportedAccount = async (
  account: AccountRow,
): Promise<OperationResult<AccountRow>> => {
  const response = await callInternal<{ removed: Address }>('wallet_deleteImportedAccount', [
    { address: account.address },
  ]);
  return response.ok ? { ok: true, value: account } : response;
};

/**
 * Reset de la cartera (`wallet_resetWallet`, RF-11 / §3.9).
 *
 * El orden de comprobación (cola `pending` vacía → sin transacción en vuelo → confirmación
 * destructiva → limpieza) lo aplica el **Service Worker** dentro de M33: el popup ya no consulta
 * el almacén. Si una guarda bloquea el reset, el SW responde `-32000 resetBlocked` con el
 * literal de §4.3; `truekeate_logs` se conserva (RF-32).
 */
export const resetWallet = async (): Promise<OperationResult<true>> => {
  const response = await callInternal<{ status: 'done' }>('wallet_resetWallet', [{ confirm: true }]);
  return response.ok ? { ok: true, value: true } : response;
};

/** Marca de aceptación del aviso de entorno de desarrollo (`wallet_acceptDevNotice`, RNF-23). */
export const acceptDevNotice = async (): Promise<OperationResult<number>> => {
  const response = await callInternal<{ devNoticeAcceptedAt: number | null }>(
    'wallet_acceptDevNotice',
  );
  if (!response.ok) {
    return response;
  }
  const acceptedAt = response.result.devNoticeAcceptedAt;
  if (typeof acceptedAt !== 'number') {
    return { ok: false, error: popupErrorOf('internalError', {}, { reason: 'dev-notice-not-recorded' }) };
  }
  return { ok: true, value: acceptedAt };
};
