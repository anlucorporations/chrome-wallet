/**
 * M10 — `src/background/crypto/importAccount.ts`
 * Importación de una cuenta por clave privada
 * (`documento_tecnico.md` §2.4 M10 y §3.3; `plan_desarrollo.md` §3.2.5 tarea 2.5).
 *
 * Proceso (CU-03): validar `0x` + 64 hex **en el rango de secp256k1** (M61), calcular la
 * dirección pública con `computeAddress` de **`ethers.js` v6** (RT-02) y devolverla con
 * **checksum EIP-55**, que es la forma persistida (§2.3).
 *
 * Material sensible: la clave privada entra por parámetro y sale en el candidato; nunca se
 * registra (para trazas se usa {@link maskPrivateKeyInput}) ni se envía a ninguna página.
 */

import { computeAddress } from 'ethers';
import {
  maskPrivateKey,
  validatePrivateKey,
  type PrivateKeyCheck,
  type PrivateKeyProblem,
} from '../../shared/validation/privateKey';
import type { Address, Hex } from '../../shared/types';

/** Candidato válido a cuenta importada: dirección con checksum y su clave privada. */
export interface ImportedKeyCandidate {
  address: Address;
  privateKey: Hex;
}

/** Reexportaciones de M61: la validación estructural tiene una única implementación. */
export { validatePrivateKey as checkPrivateKey, maskPrivateKey as maskPrivateKeyInput };
export type { PrivateKeyCheck, PrivateKeyProblem };

/**
 * Dirección derivada de una clave privada, con **checksum EIP-55**, o `null` si la clave no es
 * válida (forma o rango). `computeAddress` es la única vía de cálculo (RT-02).
 */
export const addressFromPrivateKey = (input: unknown): Address | null => {
  const check = validatePrivateKey(input);
  if (!check.valid || check.privateKey === null) {
    return null;
  }
  try {
    return computeAddress(check.privateKey) as Address;
  } catch {
    // Fuera de rango o longitud inesperada: se descarta sin lanzar (el error tipado lo pone M28).
    return null;
  }
};

/**
 * Importa una clave privada: devuelve el candidato `{ address, privateKey }` o `null`. El
 * error tipado `-32602 invalidPrivateKey` y la detección de duplicados son de M28, que es quien
 * conoce la cartera.
 */
export const importPrivateKey = (input: unknown): ImportedKeyCandidate | null => {
  const check = validatePrivateKey(input);
  if (!check.valid || check.privateKey === null) {
    return null;
  }
  const address = addressFromPrivateKey(check.privateKey);
  if (address === null) {
    return null;
  }
  return { address, privateKey: check.privateKey };
};

/** ¿Corresponde la clave privada a la dirección indicada? (contraste de integridad). */
export const isPrivateKeyForAddress = (input: unknown, address: string): boolean => {
  const derived = addressFromPrivateKey(input);
  return derived !== null && derived.toLowerCase() === address.trim().toLowerCase();
};
