/**
 * M9 — `src/background/crypto/hd.ts`
 * Derivación HD de las cuentas de la cartera
 * (`documento_tecnico.md` §2.4 M9 y **§3.3**; `plan_desarrollo.md` §3.2.5 tareas 2.4 y 2.13).
 *
 * **Ruta única y vinculante**: `m/44'/60'/0'/0/i`, donde `i` es el **índice del array**
 * `truekeate_accounts` (DEC-11). Por defecto se derivan 5 cuentas (índices 0..4) y «Añadir
 * cuenta» deriva la siguiente.
 *
 * Única librería criptográfica permitida: **`ethers.js` v6** (RT-02), vía `HDNodeWallet`.
 *
 * Las claves privadas que expone este módulo (M11 firmará con ellas y M12 revelará la de una
 * cuenta a petición explícita) NO salen del Service Worker por ningún canal salvo el revelado
 * de RF-50 (M12) y **nunca** se escriben en `truekeate_logs`.
 */

import { HDNodeWallet } from 'ethers';
import { normalizeMnemonic } from '../../shared/validation/mnemonic';
import type { Address, Hex } from '../../shared/types';

/** Prefijo de la ruta de derivación: propósito 44' / moneda 60' / cuenta 0' / cambio 0. */
export const DERIVATION_PREFIX = "m/44'/60'/0'/0" as const;

/** Índice máximo admitido (BIP-32 usa 31 bits sin el bit duro). */
export const MAX_DERIVATION_INDEX = 0x7fffffff;

/** Cuenta derivada: índice, ruta completa y dirección con checksum EIP-55. */
export interface DerivedAccount {
  index: number;
  path: string;
  address: Address;
}

/** Ruta de derivación de un índice: `m/44'/60'/0'/0/i`. */
export const derivationPath = (index: number): string => `${DERIVATION_PREFIX}/${index}`;

/** ¿Es `index` un índice de derivación utilizable (entero, 0..2^31-1)? */
export const isValidDerivationIndex = (index: unknown): index is number =>
  typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= MAX_DERIVATION_INDEX;

/** Billetera HD en la ruta pedida, o `null` si la frase o el índice no son válidos. */
const hdWalletAt = (mnemonic: unknown, index: number): HDNodeWallet | null => {
  const phrase = normalizeMnemonic(mnemonic);
  if (phrase.length === 0 || !isValidDerivationIndex(index)) {
    return null;
  }
  try {
    return HDNodeWallet.fromPhrase(phrase, undefined, derivationPath(index));
  } catch {
    // Frase inválida (checksum o palabra desconocida): M8 es quien la diagnostica.
    return null;
  }
};

/** Dirección de la cuenta `index`, o `null` si la frase no es válida. */
export const deriveAddress = (mnemonic: unknown, index: number): Address | null =>
  (hdWalletAt(mnemonic, index)?.address as Address | undefined) ?? null;

/**
 * Clave privada de la cuenta `index`, o `null`. Es material sensible: solo para firmar (M11) y
 * para el revelado explícito (M12); nunca se registra ni se envía por `window.postMessage`.
 */
export const derivePrivateKey = (mnemonic: unknown, index: number): Hex | null =>
  (hdWalletAt(mnemonic, index)?.privateKey as Hex | undefined) ?? null;

/** Cuenta derivada completa (índice, ruta y dirección), o `null` si la frase no es válida. */
export const deriveAccount = (mnemonic: unknown, index: number): DerivedAccount | null => {
  const wallet = hdWalletAt(mnemonic, index);
  if (wallet === null) {
    return null;
  }
  return { index, path: wallet.path ?? derivationPath(index), address: wallet.address as Address };
};

/**
 * Deriva `count` cuentas consecutivas desde `startIndex` (por defecto 0). Si la frase no es
 * válida devuelve una lista vacía: NUNCA se inventan direcciones (RNF-22: cero derivaciones
 * silenciosas ante una cartera dañada).
 */
export const deriveAccounts = (
  mnemonic: unknown,
  count: number,
  startIndex = 0,
): DerivedAccount[] => {
  if (!Number.isInteger(count) || count <= 0) {
    return [];
  }
  const accounts: DerivedAccount[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const account = deriveAccount(mnemonic, startIndex + offset);
    if (account === null) {
      return [];
    }
    accounts.push(account);
  }
  return accounts;
};

/**
 * Comprueba que la dirección persistida corresponde a la derivación del índice indicado. La usa
 * la verificación de integridad (M13) cuando el operador quiere contrastar una cartera, NO el
 * arranque: M13 no deriva nada por sí solo.
 */
export const isDerivationConsistent = (
  mnemonic: unknown,
  index: number,
  expectedAddress: string,
): boolean => {
  const derived = deriveAddress(mnemonic, index);
  return derived !== null && derived.toLowerCase() === expectedAddress.trim().toLowerCase();
};
