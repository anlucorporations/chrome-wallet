/**
 * M28 — `src/background/accounts.ts`
 * Cuentas de la cartera: alta, etiquetas, visibilidad, cuenta activa y baja
 * (`documento_tecnico.md` §2.4 M28, **§3.3**; `plan_desarrollo.md` §3.2.5 tareas 2.4 a 2.7).
 *
 * Claves que gobierna:
 * - `truekeate_mnemonic` (frase normalizada; puede no existir si solo hay importadas);
 * - `truekeate_accounts` (`string[]` de direcciones EIP-55; el índice del array ES el índice
 *   BIP-44);
 * - `truekeate_imported_accounts` (`{ address, privateKey, label, importedAt, visible }[]`);
 * - `truekeate_current_account` (`idx:<n>` | `imp:<address>`);
 * - `truekeate_settings` (`derivedAccountCount`, `accountLabels` y `hiddenAccounts`), vía M29.
 *
 * Decisiones que respeta:
 * - **DEC-35 / ACU-06**: las etiquetas de las derivadas van a `accountLabels[índice]`; las de
 *   las importadas, a `label` de su entrada. Dos mecanismos, ambos persistentes.
 * - **RF-06 / DEC-45 (R-09a)**: las derivadas NO se eliminan, solo se ocultan; la baja de una
 *   importada se **bloquea** con `-32000` mientras una dApp tenga sesión vigente sobre ella.
 * - **`documento_tecnico.md` §2.11 / ACU-04**: la derivación NO es una importación: nunca se
 *   instrumenta con `account_imported` (eso es de M30/H5; este módulo no escribe logs).
 *
 * Todos los errores son objetos EIP-1193 del catálogo de M6 (`diccionario_datos.md` §4.3).
 */

import type {
  AccountRef,
  Address,
  Eip1193Error,
  ImportedAccount,
  TruekeateSettings,
} from '../shared/types';
import { accountInUseByDappError, duplicateAccountError, internalError, invalidAddressError, invalidLabelError, invalidPrivateKeyError, invalidMnemonicError, storageQuotaExceededError, unknownAccountError, walletNotCreatedError } from './rpc/errors';
import { normalizeAddress } from '../shared/validation/address';
import { getStorageLocal, readStorage, writeStorage, STORAGE_KEYS, type StorageLocalLike, type StorageSnapshot } from './state/schema';
import { checkMnemonic, generateMnemonic } from './crypto/mnemonic';
import { deriveAccount, deriveAccounts, isValidDerivationIndex } from './crypto/hd';
import { importPrivateKey } from './crypto/importAccount';
import {
  defaultImportedLabel,
  getSettings,
  labelForDerivedAccount,
  runSettingsRmw,
  sanitizeSettings,
  validateLabel,
  writeSettings,
  type StoredSettings,
} from './settings';

/** Tipo de cuenta: derivada del mnemonic o importada por clave privada. */
export type AccountKind = 'derived' | 'imported';

/** Cuenta tal y como la consume la UI. */
export interface AccountView {
  ref: AccountRef;
  address: Address;
  kind: AccountKind;
  /** Índice BIP-44 (solo derivadas); `null` en las importadas. */
  index: number | null;
  /** Etiqueta efectiva: `accountLabels[índice]` o `Cuenta N` / `label` o `Importada N`. */
  label: string;
  visible: boolean;
  importedAt: number | null;
  isCurrent: boolean;
}

/** Resultado de una operación de cuentas: unión discriminada, nunca lanza. */
export type AccountsResult<T> = ({ ok: true } & T) | { ok: false; error: Eip1193Error };

/** Estado de la cartera leído del almacén (instantánea tipada). */
export interface WalletState {
  mnemonic: string | null;
  accounts: Address[];
  importedAccounts: ImportedAccount[];
  currentAccount: string | null;
  settings: StoredSettings;
}

// ---------------------------------------------------------------------------
// Referencias de cuenta
// ---------------------------------------------------------------------------

/** Referencia ya interpretada. */
export type ParsedAccountRef =
  | { kind: 'derived'; index: number }
  | { kind: 'imported'; address: Address };

/** Referencia canónica de una cuenta derivada. */
export const accountRefForIndex = (index: number): AccountRef => `idx:${index}`;

/** Referencia canónica de una cuenta importada. */
export const accountRefForAddress = (address: string): AccountRef => `imp:${address as Address}`;

/**
 * Interpreta una referencia. Acepta la forma heredada sin prefijo (`"0"`), que el diccionario
 * §2.4 declara retrocompatible y que M34 normaliza a `idx:0`.
 *
 * DEFECTO MEDIDO Y CORREGIDO (fase 4): el cuerpo de `idx:` se convertía con `Number()`, que NO es
 * una validación de forma: `Number('') === 0`, `Number('0x10') === 16` y `Number('1e1') === 10`.
 * Una referencia VACÍA (`'idx:'`) resolvía por tanto a la cuenta 0 —revelar, renombrar o fijar
 * «ninguna cuenta» actuaba sobre la primera—. Además la rama heredada `^\d+$` devolvía el índice
 * SIN comprobar el rango, de modo que `'9999999999'` se aceptaba mientras `'idx:9999999999'` se
 * rechazaba. Ahora las dos ramas exigen dígitos y pasan por {@link isValidDerivationIndex}.
 */
export const parseAccountRef = (ref: unknown): ParsedAccountRef | null => {
  if (typeof ref !== 'string') {
    return null;
  }
  const text = ref.trim();
  if (/^\d+$/.test(text)) {
    const index = Number(text);
    return isValidDerivationIndex(index) ? { kind: 'derived', index } : null;
  }
  if (text.startsWith('idx:')) {
    const body = text.slice(4).trim();
    if (!/^\d+$/.test(body)) {
      return null;
    }
    const index = Number(body);
    return isValidDerivationIndex(index) ? { kind: 'derived', index } : null;
  }
  if (text.startsWith('imp:')) {
    const address = normalizeAddress(text.slice(4));
    return address === null ? null : { kind: 'imported', address };
  }
  return null;
};

/** Atajo booleano: ¿la referencia apunta a una cuenta derivada? */
export const isDerivedAccountRef = (ref: AccountRef): boolean => ref.startsWith('idx:');

/** Dirección de una referencia dentro de un estado ya leído, o `null` si no existe. */
export const addressForRef = (state: WalletState, ref: AccountRef): Address | null => {
  const parsed = parseAccountRef(ref);
  if (parsed === null) {
    return null;
  }
  if (parsed.kind === 'derived') {
    return state.accounts[parsed.index] ?? null;
  }
  return (
    state.importedAccounts.find(
      (entry) => entry.address.toLowerCase() === parsed.address.toLowerCase(),
    )?.address ?? null
  );
};

// ---------------------------------------------------------------------------
// Lectura del estado
// ---------------------------------------------------------------------------

/**
 * Normaliza la lista de direcciones derivadas: solo cadenas con forma de dirección.
 *
 * DEFECTO MEDIDO Y CORREGIDO (fase 4): antes se DESCARTABAN las entradas malformadas y la lista se
 * compactaba. Como **el índice del array ES el índice BIP-44** (`accounts.ts`, cabecera), con
 * `truekeate_accounts = [A0, A1, null, A3]` la cuenta `A3` pasaba a ocupar la posición 2 y
 * `wallet_revealSecret('idx:2')` entregaba la clave privada de `A2` etiquetada con la dirección
 * `A3`. Una lista con un hueco no se puede compactar sin mentir sobre los índices, así que se falla
 * CERRADO: la lista entera se considera inutilizable (`[]`) y M13 la marca como cartera dañada
 * (RNF-22: «cero correcciones silenciosas»). Sin cuentas, toda referencia `idx:` responde
 * `-32602 unknownAccount` en lugar de revelar la clave de otra cuenta.
 */
const sanitizeAccounts = (value: unknown): Address[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const accounts: Address[] = [];
  for (const entry of value) {
    const address = normalizeAddress(entry);
    if (address === null) {
      return [];
    }
    accounts.push(address);
  }
  return accounts;
};

/** Normaliza la lista de cuentas importadas sin confiar en la forma almacenada. */
const sanitizeImportedAccounts = (value: unknown): ImportedAccount[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const imported: ImportedAccount[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const address = normalizeAddress(record.address);
    if (address === null || typeof record.privateKey !== 'string') {
      continue;
    }
    imported.push({
      address,
      privateKey: record.privateKey as ImportedAccount['privateKey'],
      label: typeof record.label === 'string' ? record.label : '',
      importedAt: typeof record.importedAt === 'number' ? record.importedAt : 0,
      visible: record.visible !== false,
    });
  }
  return imported;
};

/** Estado de la cartera a partir de una instantánea del almacén (función pura). */
export const readWalletStateFromSnapshot = (snapshot: StorageSnapshot): WalletState => {
  const mnemonic = snapshot[STORAGE_KEYS.mnemonic];
  const current = snapshot[STORAGE_KEYS.currentAccount];
  return {
    mnemonic: typeof mnemonic === 'string' && mnemonic.trim().length > 0 ? mnemonic : null,
    accounts: sanitizeAccounts(snapshot[STORAGE_KEYS.accounts]),
    importedAccounts: sanitizeImportedAccounts(snapshot[STORAGE_KEYS.importedAccounts]),
    currentAccount: typeof current === 'string' ? current : null,
    settings: sanitizeSettings(snapshot[STORAGE_KEYS.settings]),
  };
};

/** Lee la cartera del almacén. */
export const readWalletState = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<WalletState> =>
  readWalletStateFromSnapshot(
    await readStorage(
      [
        STORAGE_KEYS.mnemonic,
        STORAGE_KEYS.accounts,
        STORAGE_KEYS.importedAccounts,
        STORAGE_KEYS.currentAccount,
        STORAGE_KEYS.settings,
      ],
      storage,
    ),
  );

/** ¿Existe ya una cartera (frase y/o cuentas)? Es lo que decide el estado inicial del popup. */
export const walletExists = (state: WalletState): boolean =>
  state.mnemonic !== null || state.accounts.length > 0 || state.importedAccounts.length > 0;

// ---------------------------------------------------------------------------
// Vistas de cuenta
// ---------------------------------------------------------------------------

/**
 * Construye la lista de cuentas para la UI a partir de una instantánea (función pura). El orden
 * es el de `truekeate_accounts` (índice BIP-44) y después las importadas por fecha de alta.
 * Las ocultas se incluyen con `visible: false`: quien decide si se pintan es la vista
 * (`visibleAccounts`).
 */
export const buildAccountViews = (state: WalletState): AccountView[] => {
  const currentRef = state.currentAccount;
  const currentAddress =
    currentRef === null ? null : addressForRef(state, currentRef as AccountRef)?.toLowerCase() ?? null;

  const derived: AccountView[] = state.accounts.map((address, index) => ({
    ref: accountRefForIndex(index),
    address,
    kind: 'derived',
    index,
    label: labelForDerivedAccount(state.settings, index),
    visible: !state.settings.hiddenAccounts.includes(index),
    importedAt: null,
    isCurrent: currentAddress !== null && address.toLowerCase() === currentAddress,
  }));

  const imported: AccountView[] = state.importedAccounts.map((entry, ordinal) => ({
    ref: accountRefForAddress(entry.address),
    address: entry.address,
    kind: 'imported',
    index: null,
    label: entry.label.trim().length > 0 ? entry.label : defaultImportedLabel(ordinal + 1),
    visible: entry.visible,
    importedAt: entry.importedAt,
    isCurrent: currentAddress !== null && entry.address.toLowerCase() === currentAddress,
  }));

  return [...derived, ...imported];
};

/** Solo las cuentas visibles (es lo que pinta el popup y lo que se pollea). */
export const visibleAccounts = (views: readonly AccountView[]): AccountView[] =>
  views.filter((view) => view.visible);

/** Cuentas de la cartera, tal y como las consume la UI. */
export const listAccounts = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountView[]> => buildAccountViews(await readWalletState(storage));

/** Cuenta indicada por su referencia, o `null` si no existe. */
export const findAccount = (
  views: readonly AccountView[],
  ref: AccountRef,
): AccountView | null => views.find((view) => view.ref === ref) ?? null;

// ---------------------------------------------------------------------------
// Guarda de sesión de dApp vigente (R-09a / DEC-45)
// ---------------------------------------------------------------------------

/**
 * Origen de la primera dApp con sesión **vigente** sobre alguna de las direcciones indicadas, o
 * `null`. Una entrada es vigente si existe, no está marcada como desconectada y no ha vencido
 * (`expiresAt === null` = sin caducidad; `diccionario_datos.md` §2.7 y §3.10).
 */
export const activeDappOriginFor = (
  addresses: readonly string[],
  sessions: unknown,
  now: number = Date.now(),
): string | null => {
  if (typeof sessions !== 'object' || sessions === null || Array.isArray(sessions)) {
    return null;
  }
  const wanted = new Set(addresses.map((address) => address.toLowerCase()));
  for (const [origin, raw] of Object.entries(sessions as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    if (entry.connected === false) {
      continue;
    }
    const expiresAt = entry.expiresAt;
    const expired = typeof expiresAt === 'number' && expiresAt <= now;
    if (expired) {
      continue;
    }
    const account = typeof entry.account === 'string' ? entry.account.toLowerCase() : '';
    if (wanted.has(account)) {
      return typeof entry.origin === 'string' && entry.origin.length > 0 ? entry.origin : origin;
    }
  }
  return null;
};

/** Orígenes de TODAS las dApp con sesión vigente sobre alguna de las direcciones indicadas. */
export const activeDappOriginsFor = (
  addresses: readonly string[],
  sessions: unknown,
  now: number = Date.now(),
): string[] => {
  if (typeof sessions !== 'object' || sessions === null || Array.isArray(sessions)) {
    return [];
  }
  const wanted = new Set(addresses.map((address) => address.toLowerCase()));
  const origins: string[] = [];
  for (const [origin, raw] of Object.entries(sessions as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    if (entry.connected === false) {
      continue;
    }
    const expiresAt = entry.expiresAt;
    if (typeof expiresAt === 'number' && expiresAt <= now) {
      continue;
    }
    const account = typeof entry.account === 'string' ? entry.account.toLowerCase() : '';
    if (wanted.has(account)) {
      origins.push(typeof entry.origin === 'string' && entry.origin.length > 0 ? entry.origin : origin);
    }
  }
  return origins;
};

/**
 * Error `-32000 accountInUseByDapp` si alguna de las direcciones está en uso por una dApp
 * vigente; `null` si ninguna lo está. Es la guarda que comparten el revelado (M12) y la baja de
 * una importada (M28).
 */
export const accountInUseError = (
  addresses: readonly string[],
  sessions: unknown,
  now: number = Date.now(),
): Eip1193Error | null => {
  const origin = activeDappOriginFor(addresses, sessions, now);
  return origin === null ? null : accountInUseByDappError(origin);
};

// ---------------------------------------------------------------------------
// Lecturas de conveniencia
// ---------------------------------------------------------------------------

/** Referencia activa; si la guardada no existe, devuelve la primera cuenta disponible. */
export const getCurrentAccountRef = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountRef | null> => {
  const state = await readWalletState(storage);
  const views = buildAccountViews(state);
  const stored = state.currentAccount;
  if (stored !== null) {
    const parsed = parseAccountRef(stored);
    if (parsed !== null) {
      const ref: AccountRef =
        parsed.kind === 'derived'
          ? accountRefForIndex(parsed.index)
          : accountRefForAddress(parsed.address);
      if (findAccount(views, ref) !== null) {
        return ref;
      }
    }
  }
  return views[0]?.ref ?? null;
};

/** Dirección de la cuenta activa (o `null` si la cartera está vacía). */
export const getCurrentAddress = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<Address | null> => {
  const state = await readWalletState(storage);
  const ref = await getCurrentAccountRef(storage);
  return ref === null ? null : addressForRef(state, ref);
};

// ---------------------------------------------------------------------------
// Alta de la cartera por frase (RF-01 / RF-02)
// ---------------------------------------------------------------------------

/** Resultado de crear o importar la cartera por frase BIP-39. */
export interface WalletCreation {
  accounts: Address[];
  currentAccount: AccountRef;
  derivedAccountCount: number;
}

/** Cuántas cuentas se derivan al crear la cartera (5 por defecto, RF-04). */
const initialAccountCount = (settings: StoredSettings): number =>
  Math.max(1, Math.floor(settings.derivedAccountCount));

/**
 * Persiste la cartera derivada de una frase ya validada: escribe la frase normalizada, las
 * direcciones derivadas, la cuenta activa (`idx:0`) y el recuento de derivadas. Reinicia las
 * etiquetas y la visibilidad de las derivadas (la cartera es nueva); **no** toca las cuentas
 * importadas ni los logs.
 */
const persistWalletFromMnemonic = async (
  mnemonic: string,
  storage: StorageLocalLike | null,
): Promise<AccountsResult<WalletCreation>> =>
  runSettingsRmw(async () => {
    const current = await getSettings(storage);
    const count = initialAccountCount(current);
    const derived = deriveAccounts(mnemonic, count, 0);
    if (derived.length !== count) {
      // La frase pasó el checksum pero la derivación falló: es un fallo interno, no de entrada.
      return { ok: false as const, error: internalError({ reason: 'derivation-failed' }) };
    }
    const accounts = derived.map((account) => account.address);
    const nextSettings = sanitizeSettings({
      ...current,
      derivedAccountCount: count,
      accountLabels: {},
      hiddenAccounts: [],
    });
    const written = await writeStorage(
      {
        [STORAGE_KEYS.mnemonic]: mnemonic,
        [STORAGE_KEYS.accounts]: accounts,
        [STORAGE_KEYS.currentAccount]: accountRefForIndex(0),
        [STORAGE_KEYS.settings]: nextSettings,
      },
      storage,
    );
    if (!written) {
      return { ok: false as const, error: storageQuotaExceededError() };
    }
    return { ok: true as const, accounts, currentAccount: accountRefForIndex(0), derivedAccountCount: count };
  });

/**
 * **Crear cartera nueva** (RF-01 / CU-01): genera 12 palabras BIP-39 y deriva las primeras
 * cuentas. La frase se devuelve para que el popup la muestre UNA vez (el valor no se registra
 * en `truekeate_logs`); a partir de ahí solo se obtiene por el revelado de RF-50.
 */
export const createWallet = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<WalletCreation & { mnemonic: string }>> => {
  const mnemonic = generateMnemonic();
  const persisted = await persistWalletFromMnemonic(mnemonic, storage);
  return persisted.ok ? { ...persisted, mnemonic } : persisted;
};

/**
 * **Importar cartera por frase** (RF-02 / CU-02): normaliza espacios y mayúsculas y comprueba
 * el checksum BIP-39. Un checksum roto responde `-32602 invalidMnemonic` sin escribir nada.
 */
export const importWalletFromMnemonic = async (
  input: unknown,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<WalletCreation & { mnemonic: string }>> => {
  const check = checkMnemonic(input);
  if (!check.valid) {
    return { ok: false, error: check.error ?? invalidMnemonicError() };
  }
  const persisted = await persistWalletFromMnemonic(check.normalized, storage);
  return persisted.ok ? { ...persisted, mnemonic: check.normalized } : persisted;
};

// ---------------------------------------------------------------------------
// «Añadir cuenta» (RF-04 / DEC-11)
// ---------------------------------------------------------------------------

/**
 * Deriva la siguiente cuenta (índice = longitud actual de `truekeate_accounts`), la persiste y
 * amplía `derivedAccountCount`. Es idempotente frente a reintentos: si el índice ya existe, no
 * vuelve a escribir.
 */
export const deriveNextAccount = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<{ account: AccountView; accounts: Address[]; derivedAccountCount: number }>> =>
  runSettingsRmw(async () => {
    const state = await readWalletState(storage);
    if (state.mnemonic === null) {
      // No hay semilla: no se puede derivar. Causa canónica de §4.3 desde la v1.9.
      return { ok: false as const, error: walletNotCreatedError({ reason: 'wallet-not-created' }) };
    }
    const index = state.accounts.length;
    const derived = deriveAccount(state.mnemonic, index);
    if (derived === null) {
      return { ok: false as const, error: internalError({ reason: 'derivation-failed', index }) };
    }
    const accounts = [...state.accounts, derived.address];
    const nextSettings = sanitizeSettings({
      ...state.settings,
      derivedAccountCount: accounts.length,
    });
    const written = await writeStorage(
      {
        [STORAGE_KEYS.accounts]: accounts,
        [STORAGE_KEYS.settings]: nextSettings,
      },
      storage,
    );
    if (!written) {
      return { ok: false as const, error: storageQuotaExceededError() };
    }
    const view: AccountView = {
      ref: accountRefForIndex(index),
      address: derived.address,
      kind: 'derived',
      index,
      label: labelForDerivedAccount(nextSettings, index),
      visible: true,
      importedAt: null,
      isCurrent: false,
    };
    return { ok: true as const, account: view, accounts, derivedAccountCount: accounts.length };
  });

// ---------------------------------------------------------------------------
// Importación por clave privada (RF-05)
// ---------------------------------------------------------------------------

/**
 * **Importar por clave privada** (RF-05 / CU-03). Valida `0x` + 64 hex en el rango de secp256k1
 * (`-32602 invalidPrivateKey`), calcula la dirección con checksum EIP-55 y persiste la entrada
 * con `label` (por defecto `Importada N`), `importedAt` y `visible: true`. Una cuenta repetida
 * (derivada o importada) responde `-32602 duplicateAccount`.
 */
export const importAccountByPrivateKey = async (
  input: unknown,
  label?: unknown,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<{ account: AccountView; accountRef: AccountRef }>> =>
  runSettingsRmw(async () => {
    const candidate = importPrivateKey(input);
    if (candidate === null) {
      return { ok: false as const, error: invalidPrivateKeyError() };
    }
    const state = await readWalletState(storage);
    const address = candidate.address.toLowerCase();
    const alreadyDerived = state.accounts.some((entry) => entry.toLowerCase() === address);
    const alreadyImported = state.importedAccounts.some(
      (entry) => entry.address.toLowerCase() === address,
    );
    if (alreadyDerived || alreadyImported) {
      return { ok: false as const, error: duplicateAccountError() };
    }
    // DEFECTO MEDIDO Y CORREGIDO (fase 4): solo se miraba `check.label.length > 0`, de modo que
    // una etiqueta de 33 caracteres (o con caracteres de control) se persistía tal cual, mientras
    // `renameAccount` la rechazaba con `-32602 invalidLabel`. La cota de 1..32 caracteres es la
    // MISMA para derivadas e importadas. Una etiqueta ausente o vacía sigue significando «usa la
    // de por defecto» (`Importada N`), que no es un fallo de validación.
    const check = validateLabel(label);
    const providedLabel = check.label.length > 0;
    if (providedLabel && !check.valid) {
      return {
        ok: false as const,
        error: invalidLabelError({ reason: 'invalid-label', problem: check.problem }),
      };
    }
    const ordinal = state.importedAccounts.length + 1;
    const entry: ImportedAccount = {
      address: candidate.address,
      privateKey: candidate.privateKey,
      label: providedLabel ? check.label : defaultImportedLabel(ordinal),
      importedAt: Date.now(),
      visible: true,
    };
    const importedAccounts = [...state.importedAccounts, entry];
    const written = await writeStorage(
      { [STORAGE_KEYS.importedAccounts]: importedAccounts },
      storage,
    );
    if (!written) {
      return { ok: false as const, error: storageQuotaExceededError() };
    }
    const view: AccountView = {
      ref: accountRefForAddress(entry.address),
      address: entry.address,
      kind: 'imported',
      index: null,
      label: entry.label,
      visible: true,
      importedAt: entry.importedAt,
      isCurrent: false,
    };
    return { ok: true as const, account: view, accountRef: view.ref };
  });

// ---------------------------------------------------------------------------
// Etiquetas (RF-06 / CU-05, DEC-35)
// ---------------------------------------------------------------------------

/**
 * Renombra una cuenta: escribe `accountLabels[índice]` en las derivadas y `label` en las
 * importadas (DEC-35). Una etiqueta fuera de 1..32 caracteres responde `-32602 invalidLabel`
 * (causa añadida en la v1.9 de §4.3) con el veredicto de M29.
 */
export const renameAccount = async (
  ref: AccountRef,
  label: unknown,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<{ account: AccountView; label: string }>> =>
  runSettingsRmw(async () => {
    const state = await readWalletState(storage);
    const parsed = parseAccountRef(ref);
    if (parsed === null || addressForRef(state, ref) === null) {
      return { ok: false as const, error: unknownAccountError({ reason: 'unknown-account', ref }) };
    }
    const check = validateLabel(label);
    if (!check.valid) {
      return {
        ok: false as const,
        error: invalidLabelError({ reason: 'invalid-label', problem: check.problem }),
      };
    }
    if (parsed.kind === 'derived') {
      const nextSettings = sanitizeSettings({
        ...state.settings,
        accountLabels: { ...state.settings.accountLabels, [parsed.index]: check.label },
      });
      const written = await writeSettings(nextSettings, storage);
      if (!written.ok) {
        return { ok: false as const, error: written.error };
      }
    } else {
      const importedAccounts = state.importedAccounts.map((entry) =>
        entry.address.toLowerCase() === parsed.address.toLowerCase()
          ? { ...entry, label: check.label }
          : entry,
      );
      const written = await writeStorage(
        { [STORAGE_KEYS.importedAccounts]: importedAccounts },
        storage,
      );
      if (!written) {
        return { ok: false as const, error: storageQuotaExceededError() };
      }
    }
    const views = buildAccountViews(await readWalletState(storage));
    const account = findAccount(views, ref);
    if (account === null) {
      return { ok: false as const, error: unknownAccountError({ reason: 'unknown-account', ref }) };
    }
    return { ok: true as const, account, label: check.label };
  });

/**
 * Oculta o vuelve a mostrar una cuenta. Las derivadas se ocultan por índice en
 * `truekeate_settings.hiddenAccounts` (nunca se eliminan: RF-06); las importadas, con su campo
 * `visible`. Mostrar una derivada oculta devuelve **la misma dirección** (`CA-RF-06`).
 */
export const setAccountVisible = async (
  ref: AccountRef,
  visible: boolean,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<{ account: AccountView }>> =>
  runSettingsRmw(async () => {
    const state = await readWalletState(storage);
    const parsed = parseAccountRef(ref);
    if (parsed === null || addressForRef(state, ref) === null) {
      return { ok: false as const, error: unknownAccountError({ reason: 'unknown-account', ref }) };
    }
    if (parsed.kind === 'derived') {
      const hidden = new Set(state.settings.hiddenAccounts);
      if (visible) {
        hidden.delete(parsed.index);
      } else {
        hidden.add(parsed.index);
      }
      const written = await writeSettings(
        sanitizeSettings({ ...state.settings, hiddenAccounts: [...hidden] }),
        storage,
      );
      if (!written.ok) {
        return { ok: false as const, error: written.error };
      }
    } else {
      const importedAccounts = state.importedAccounts.map((entry) =>
        entry.address.toLowerCase() === parsed.address.toLowerCase() ? { ...entry, visible } : entry,
      );
      const written = await writeStorage(
        { [STORAGE_KEYS.importedAccounts]: importedAccounts },
        storage,
      );
      if (!written) {
        return { ok: false as const, error: storageQuotaExceededError() };
      }
    }
    const views = buildAccountViews(await readWalletState(storage));
    const account = findAccount(views, ref);
    if (account === null) {
      return { ok: false as const, error: unknownAccountError({ reason: 'unknown-account', ref }) };
    }
    return { ok: true as const, account };
  });

// ---------------------------------------------------------------------------
// Baja de una cuenta importada (RF-06 + R-09a / DEC-45)
// ---------------------------------------------------------------------------

/**
 * **Elimina una cuenta importada** (borra su clave privada) tras la confirmación de la UI.
 *
 * Guardas, en este orden:
 * 1. la referencia debe apuntar a una cuenta importada existente;
 * 2. si una dApp tiene sesión **vigente** sobre esa dirección → `-32000 accountInUseByDapp` y
 *    `truekeate_imported_accounts` queda **intacto** (R-09a / DEC-45);
 * 3. si la cuenta eliminada era la activa, la activa pasa a `idx:0` cuando existe (§2.4).
 *
 * Las cuentas derivadas NO se pueden eliminar por esta vía: solo se ocultan.
 */
export const removeImportedAccount = async (
  ref: AccountRef,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<{ removed: Address; accounts: Address[]; currentAccount: AccountRef | null }>> =>
  runSettingsRmw(async () => {
    const state = await readWalletState(storage);
    const parsed = parseAccountRef(ref);
    if (parsed === null || parsed.kind !== 'imported') {
      return { ok: false as const, error: unknownAccountError({ reason: 'not-an-imported-account', ref }) };
    }
    const entry = state.importedAccounts.find(
      (candidate) => candidate.address.toLowerCase() === parsed.address.toLowerCase(),
    );
    if (entry === undefined) {
      return { ok: false as const, error: invalidAddressError() };
    }
    const sessions = await readStorage([STORAGE_KEYS.connectedSites], storage);
    const blocked = accountInUseError(
      [entry.address],
      sessions[STORAGE_KEYS.connectedSites],
      Date.now(),
    );
    if (blocked !== null) {
      return { ok: false as const, error: blocked };
    }
    const importedAccounts = state.importedAccounts.filter(
      (candidate) => candidate.address.toLowerCase() !== parsed.address.toLowerCase(),
    );
    const currentParsed =
      typeof state.currentAccount === 'string' ? parseAccountRef(state.currentAccount) : null;
    const wasCurrent =
      currentParsed !== null &&
      currentParsed.kind === 'imported' &&
      currentParsed.address.toLowerCase() === parsed.address.toLowerCase();

    const items: Record<string, unknown> = { [STORAGE_KEYS.importedAccounts]: importedAccounts };
    let nextCurrent: AccountRef | null = null;
    if (wasCurrent) {
      nextCurrent = state.accounts.length > 0 ? accountRefForIndex(0) : (importedAccounts[0] !== undefined ? accountRefForAddress(importedAccounts[0].address) : null);
      items[STORAGE_KEYS.currentAccount] = nextCurrent;
    }
    const written = await writeStorage(items, storage);
    if (!written) {
      return { ok: false as const, error: storageQuotaExceededError() };
    }
    return {
      ok: true as const,
      removed: entry.address,
      accounts: importedAccounts.map((candidate) => candidate.address),
      currentAccount: nextCurrent,
    };
  });

// ---------------------------------------------------------------------------
// Cuenta activa
// ---------------------------------------------------------------------------

/** Cambia la cuenta activa del popup (`truekeate_current_account`). */
export const setCurrentAccount = async (
  ref: AccountRef,
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsResult<{ currentAccount: AccountRef }>> =>
  runSettingsRmw(async () => {
    const state = await readWalletState(storage);
    const parsed = parseAccountRef(ref);
    const canonical: AccountRef | null =
      parsed === null
        ? null
        : parsed.kind === 'derived'
          ? addressForRef(state, accountRefForIndex(parsed.index)) === null
            ? null
            : accountRefForIndex(parsed.index)
          : addressForRef(state, accountRefForAddress(parsed.address)) === null
            ? null
            : accountRefForAddress(parsed.address);
    if (canonical === null) {
      // La referencia no apunta a ninguna cuenta existente: causa «referencia inexistente».
      return { ok: false as const, error: unknownAccountError({ reason: 'unknown-account', ref }) };
    }
    const written = await writeStorage({ [STORAGE_KEYS.currentAccount]: canonical }, storage);
    if (!written) {
      return { ok: false as const, error: storageQuotaExceededError() };
    }
    return { ok: true as const, currentAccount: canonical };
  });

/** Resumen del estado de la cartera para el popup (cuentas + activa). */
export interface AccountsSnapshot {
  accounts: AccountView[];
  currentAccount: AccountRef | null;
  walletExists: boolean;
  derivedAccountCount: number;
  settings: TruekeateSettings;
}

/** Instantánea completa de cuentas y ajustes, en una sola lectura. */
export const getAccountsSnapshot = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<AccountsSnapshot> => {
  const state = await readWalletState(storage);
  const accounts = buildAccountViews(state);
  const currentAccount = await getCurrentAccountRef(storage);
  return {
    accounts,
    currentAccount,
    walletExists: walletExists(state),
    derivedAccountCount: state.settings.derivedAccountCount,
    settings: state.settings,
  };
};

// ---------------------------------------------------------------------------
// Estado completo para la UI (`wallet_getState`, contrato de §5.1.1 v1.6)
// ---------------------------------------------------------------------------

/**
 * Cuenta tal y como la expone `wallet_getState`: el campo de la cuenta activa se llama
 * `current` (y no `isCurrent`) porque es el nombre que fija el contrato de la sección 5.1.1.
 */
export interface WalletStateAccount {
  ref: AccountRef;
  address: Address;
  kind: AccountKind;
  /** Índice BIP-44 en las derivadas; `null` en las importadas. */
  index: number | null;
  label: string;
  visible: boolean;
  /** `true` en la cuenta activa del popup. */
  current: boolean;
}

/** Estado de cuentas y ajustes que el popup necesita para pintarse (proyección de M28/M29). */
export interface WalletStateView {
  hasWallet: boolean;
  accounts: WalletStateAccount[];
  /** Cuenta activa ya resuelta (con el respaldo a la primera disponible). */
  currentAccountRef: AccountRef | null;
  /** Ajustes canónicos de `truekeate_settings` (M29), saneados. */
  settings: TruekeateSettings;
}

/**
 * Proyecta una vista de cuenta de M28 a la forma del contrato `wallet_getState`. Se exporta
 * porque el despachador del catálogo (M4) la reutiliza para la cuenta que devuelven
 * `wallet_addDerivedAccount`, `wallet_renameAccount` y `wallet_setAccountVisible`.
 *
 * Con `currentAccountRef === null` se respeta el `isCurrent` que ya calculó `buildAccountViews`.
 */
export const asWalletStateAccount = (
  view: AccountView,
  currentAccountRef: AccountRef | null,
): WalletStateAccount => ({
  ref: view.ref,
  address: view.address,
  kind: view.kind,
  index: view.index,
  label: view.label,
  visible: view.visible,
  current: currentAccountRef === null ? view.isCurrent : view.ref === currentAccountRef,
});

/**
 * Estado completo de la cartera para la UI (`wallet_getState` de §5.1.1): presencia de cartera,
 * cuentas (incluidas las OCULTAS, con su bandera `visible`), cuenta activa y ajustes. Es lo que
 * permite que el popup deje de leer el almacén (RNF-14).
 *
 * NO duplica ninguna regla: reutiliza `getAccountsSnapshot`, que a su vez compone
 * `readWalletState` + `buildAccountViews` + `getCurrentAccountRef`. La integridad (M13), las
 * redes y el `chainId` los añade el despachador del catálogo (M4), de modo que este módulo no
 * depende de `crypto/integrity` (evita un ciclo de importaciones).
 */
export const getWalletStateView = async (
  storage: StorageLocalLike | null = getStorageLocal(),
): Promise<WalletStateView> => {
  const snapshot = await getAccountsSnapshot(storage);
  return {
    hasWallet: snapshot.walletExists,
    accounts: snapshot.accounts.map((view) => asWalletStateAccount(view, snapshot.currentAccount)),
    currentAccountRef: snapshot.currentAccount,
    settings: snapshot.settings,
  };
};
