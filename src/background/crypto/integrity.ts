/**
 * M13 — `src/background/crypto/integrity.ts`
 * Integridad de la cartera al arrancar (RNF-22; `documento_tecnico.md` §2.4 M13 y §3.3).
 *
 * Qué garantiza:
 * - Un mnemonic con **checksum BIP-39 roto** o una dirección con **EIP-55 inválido** dejan el
 *   estado en **«wallet dañada»**.
 * - **CERO derivaciones silenciosas**: este módulo NO deriva ninguna cuenta del mnemonic. Su
 *   campo `derivations` es siempre `0` y ninguna rutina de arranque puede sustituir una
 *   dirección persistida por otra derivada «por si acaso» (esa corrección silenciosa es
 *   exactamente lo que RNF-22 prohíbe).
 *
 * La única criptografía que se ejecuta aquí es la **verificación** (checksum BIP-39 de la frase,
 * checksum EIP-55 de las direcciones y contraste clave privada ↔ dirección de una importada),
 * con `ethers.js` v6 (RT-02).
 *
 * Causa canónica desde la v1.9 del diccionario: `diccionario_datos.md` §4.3 registra la causa
 * «cartera dañada» (`-32603 damagedWallet`), así que el informe devuelve un error tipado del
 * catálogo de M6 además del estado `damaged` con sus avisos.
 */

import { getAddress } from 'ethers';
import type { Address, Eip1193Error } from '../../shared/types';
import { damagedWalletError } from '../rpc/errors';
import { STORAGE_KEYS, getStorageLocal, readStorage, type StorageLocalLike, type StorageSnapshot } from '../state/schema';
import { checkMnemonic } from './mnemonic';
import { isPrivateKeyForAddress } from './importAccount';
import { parseAccountRef } from '../accounts';

/** Etiqueta de estado exigida por RNF-22 (no es un literal de la tabla de errores). */
export const DAMAGED_WALLET_LABEL = 'Wallet dañada' as const;

/** Estado de la cartera tras la comprobación. */
export type IntegrityStatus = 'absent' | 'ok' | 'damaged';

/** Causa concreta de un aviso de integridad. */
export type IntegrityIssueCode =
  | 'mnemonic-shape'
  | 'mnemonic-checksum'
  | 'address-shape'
  | 'address-checksum'
  | 'imported-key-mismatch'
  | 'current-account-missing';

/** Aviso de integridad: código, texto en español y ubicación. */
export interface IntegrityIssue {
  code: IntegrityIssueCode;
  message: string;
  address?: string;
  source: 'mnemonic' | 'derived' | 'imported' | 'current';
}

/** Informe de integridad. */
export interface WalletIntegrityReport {
  status: IntegrityStatus;
  checkedAt: number;
  mnemonicPresent: boolean;
  mnemonicValid: boolean;
  derivedCount: number;
  importedCount: number;
  /** Direcciones comprobadas (derivadas + importadas + la activa). */
  addressesChecked: number;
  issues: IntegrityIssue[];
  /** Derivaciones ejecutadas por esta comprobación: SIEMPRE 0 (RNF-22). */
  derivations: 0;
  /** Solo se puede derivar si la frase es válida y la cartera no está dañada. */
  canDerive: boolean;
  /** `null` mientras el estado sea `ok`; «Wallet dañada» si hay corrupción. */
  label: string | null;
  /** Error tipado para la UI: causa `-32603 damagedWallet` de §4.3, o `null` si no hay daño. */
  error: Eip1193Error | null;
}

/**
 * ¿Está la dirección en su forma canónica **EIP-55**? Una dirección en un solo caso no puede
 * verificarse (no lleva checksum), así que se considera VÁLIDA en forma pero solo se acepta como
 * persistida si `getAddress` la devuelve idéntica (que es el caso de todo lo que escribe el SW).
 */
export const isChecksummedAddress = (address: unknown): boolean => {
  if (typeof address !== 'string') {
    return false;
  }
  try {
    return getAddress(address) === address;
  } catch {
    return false;
  }
};

/** ¿Tiene la dirección la forma `0x` + 40 hex? */
export const hasAddressShape = (address: unknown): boolean =>
  typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address.trim());

/**
 * Lee una lista de direcciones **conservando las posiciones**: un hueco se representa con la
 * cadena vacía en lugar de eliminarse.
 *
 * DEFECTO MEDIDO Y CORREGIDO (fase 4): antes se FILTRABAN las entradas que no eran cadena
 * (`Array.isArray(value) ? value.filter(...) : []`). Con `truekeate_accounts = [A0, A1, null, A3]`
 * el `null` desaparecía, así que (a) el informe NO emitía ningún aviso —`status: 'ok'`— y (b) los
 * índices de los avisos se desplazaban. Peor aún: `sanitizeAccounts` (M28) compacta igual, de modo
 * que `state.accounts[2]` pasaba a ser `A3` mientras `derivePrivateKey(mnemonic, 2)` devuelve la
 * clave de `A2`: el revelado entregaba la clave privada de OTRA cuenta etiquetada con la dirección
 * mostrada. El índice del array ES el índice BIP-44 (`accounts.ts`), así que una lista con un
 * hueco es una cartera DAÑADA (RNF-22), no una lista que se pueda compactar en silencio.
 */
const readAddressList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => (typeof entry === 'string' ? entry : ''))
    : [];

/**
 * Comprueba la integridad de una instantánea del almacén. Función **pura**: no escribe nada y no
 * deriva nada.
 */
export const inspectWalletIntegrity = (
  snapshot: StorageSnapshot,
  now: number = Date.now(),
): WalletIntegrityReport => {
  const issues: IntegrityIssue[] = [];
  const rawMnemonic = snapshot[STORAGE_KEYS.mnemonic];
  const mnemonicPresent = typeof rawMnemonic === 'string' && rawMnemonic.trim().length > 0;
  let mnemonicValid = false;

  if (mnemonicPresent) {
    const check = checkMnemonic(rawMnemonic);
    mnemonicValid = check.valid;
    if (!check.valid) {
      issues.push({
        code: check.problem === 'checksum' ? 'mnemonic-checksum' : 'mnemonic-shape',
        message:
          check.problem === 'checksum'
            ? 'La frase de recuperación guardada no supera el checksum BIP-39.'
            : 'La frase de recuperación guardada no tiene la forma BIP-39 esperada.',
        source: 'mnemonic',
      });
    }
  }

  const derived = readAddressList(snapshot[STORAGE_KEYS.accounts]);
  const importedRaw = snapshot[STORAGE_KEYS.importedAccounts];
  const imported: { address?: unknown; privateKey?: unknown }[] = Array.isArray(importedRaw)
    ? importedRaw.map((entry) =>
        typeof entry === 'object' && entry !== null
          ? (entry as { address?: unknown; privateKey?: unknown })
          : {},
      )
    : [];

  let addressesChecked = 0;
  for (const [index, address] of derived.entries()) {
    addressesChecked += 1;
    if (!hasAddressShape(address)) {
      issues.push({
        code: 'address-shape',
        message: `La dirección derivada del índice ${index} está malformada.`,
        address: typeof address === 'string' ? address : '',
        source: 'derived',
      });
      continue;
    }
    if (!isChecksummedAddress(address)) {
      issues.push({
        code: 'address-checksum',
        message: `La dirección derivada del índice ${index} no cumple el checksum EIP-55.`,
        address,
        source: 'derived',
      });
    }
  }

  for (const entry of imported) {
    addressesChecked += 1;
    const address = entry.address;
    if (!hasAddressShape(address)) {
      issues.push({
        code: 'address-shape',
        message: 'Una cuenta importada tiene la dirección malformada.',
        source: 'imported',
      });
      continue;
    }
    if (!isChecksummedAddress(address)) {
      issues.push({
        code: 'address-checksum',
        message: `La cuenta importada ${String(address)} no cumple el checksum EIP-55.`,
        address: String(address),
        source: 'imported',
      });
    }
    if (typeof entry.privateKey !== 'string') {
      // DEFECTO MEDIDO Y CORREGIDO (fase 4): antes esta rama se SALTABA en silencio cuando
      // `privateKey` no era una cadena, de modo que el informe decía `ok` mientras
      // `sanitizeImportedAccounts` (M28) descartaba la entrada y la cuenta desaparecía de la
      // cartera (no se listaba, no firmaba ni se podía borrar). Una cuenta importada sin clave
      // utilizable es corrupción y debe verse en el informe.
      issues.push({
        code: 'imported-key-mismatch',
        message: `La cuenta importada ${String(address)} no tiene una clave privada utilizable.`,
        address: String(address),
        source: 'imported',
      });
    } else if (!isPrivateKeyForAddress(entry.privateKey, String(address))) {
      issues.push({
        code: 'imported-key-mismatch',
        message: `La clave privada de la cuenta importada ${String(address)} no corresponde a esa dirección.`,
        address: String(address),
        source: 'imported',
      });
    }
  }

  const current = snapshot[STORAGE_KEYS.currentAccount];
  if (typeof current === 'string' && current.length > 0) {
    const parsed = parseAccountRef(current);
    const exists =
      parsed === null
        ? false
        : parsed.kind === 'derived'
          ? derived[parsed.index] !== undefined
          : imported.some(
              (entry) =>
                typeof entry.address === 'string' &&
                entry.address.toLowerCase() === parsed.address.toLowerCase(),
            );
    if (!exists) {
      issues.push({
        code: 'current-account-missing',
        message: 'La cuenta activa guardada ya no existe en la cartera.',
        source: 'current',
      });
    }
  }

  const empty = !mnemonicPresent && derived.length === 0 && imported.length === 0;
  const damaged = issues.length > 0;
  const status: IntegrityStatus = damaged ? 'damaged' : empty ? 'absent' : 'ok';
  const canDerive = mnemonicValid && !damaged;

  return {
    status,
    checkedAt: now,
    mnemonicPresent,
    mnemonicValid,
    derivedCount: derived.length,
    importedCount: imported.length,
    addressesChecked,
    issues,
    derivations: 0,
    canDerive,
    label: damaged ? DAMAGED_WALLET_LABEL : null,
    error: damaged ? damagedWalletError({ reason: 'wallet-damaged', issues }) : null,
  };
};

/** Comprueba la integridad de la cartera persistida (M13 al arrancar). */
export const checkWalletIntegrity = async (
  storage: StorageLocalLike | null = getStorageLocal(),
  now: number = Date.now(),
): Promise<WalletIntegrityReport> =>
  inspectWalletIntegrity(
    await readStorage(
      [
        STORAGE_KEYS.mnemonic,
        STORAGE_KEYS.accounts,
        STORAGE_KEYS.importedAccounts,
        STORAGE_KEYS.currentAccount,
      ],
      storage,
    ),
    now,
  );

/** ¿Puede el arranque continuar con normalidad (sin estado dañado)? */
export const isWalletUsable = (report: WalletIntegrityReport): boolean =>
  report.status !== 'damaged';

/** Direcciones afectadas por un informe, para la UI de «wallet dañada». */
export const damagedAddresses = (report: WalletIntegrityReport): Address[] =>
  report.issues
    .map((issue) => issue.address)
    .filter((address): address is string => typeof address === 'string' && address.length > 0) as Address[];

/**
 * Nombre con el que el arranque del Service Worker (M2) invoca la comprobación: `checkIntegrity()`.
 * Es exactamente el mismo contrato que `checkWalletIntegrity()`.
 */
export const checkIntegrity = checkWalletIntegrity;