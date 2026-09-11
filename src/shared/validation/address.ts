/**
 * M58 — `src/shared/validation/address.ts`
 * Validación **estructural** de una dirección Ethereum para el popup y para el SW
 * (`documento_tecnico.md` §2.4 M58, §3.3; `plan_desarrollo.md` §3.2.5 tarea 2.14).
 *
 * Regla dura de reparto de responsabilidades (RT-02/RT-03 + RNF-14 + §3.2 «NO entra»):
 * **este módulo no usa criptografía ni `ethers`**. Vive en `src/shared/` y lo consume el
 * popup; si importara `ethers`, el paquete de `ethers` viajaría al bundle de la UI, que es
 * exactamente lo que RNF-14 prohíbe (el bundle de `ethers` vive solo en el Service Worker).
 *
 * Por eso aquí se comprueba:
 * - la **forma** `0x` + 40 caracteres hexadecimales,
 * - el **estilo de mayúsculas** de la entrada (EIP-55 no puede verificarse sin `keccak256`).
 *
 * La verificación **criptográfica** del checksum EIP-55 es competencia del Service Worker:
 * M10 (`computeAddress` al importar), M13 (integridad al arrancar, dirección persistida) y el
 * propio `eth_sendTransaction`. El veredicto autoritativo, en consecuencia, es siempre el del
 * SW; esta validación es la que evita enviar una operación con una dirección manifiestamente
 * malformada (CA-RF-33).
 */

import type { Address, Eip1193Error } from '../types';
import { invalidAddressError } from '../../background/rpc/errors';

/** Longitud exigida del cuerpo hexadecimal de una dirección: 40 caracteres. */
export const ADDRESS_HEX_LENGTH = 40;

/** Forma canónica de una dirección: `0x` + 40 hex (mayúsculas o minúsculas). */
export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Estilo de mayúsculas de la entrada: determina si EIP-55 es verificable sin criptografía. */
export type AddressCaseStyle = 'lowercase' | 'uppercase' | 'mixed';

/** Veredicto de la validación estructural de una dirección. */
export interface AddressCheck {
  valid: boolean;
  /** Dirección tal y como se persistirá (sin espacios); `null` si no es válida. */
  address: Address | null;
  /** Estilo de mayúsculas detectado; `null` si la entrada no tiene forma de dirección. */
  caseStyle: AddressCaseStyle | null;
  /**
   * `false` SIEMPRE en la capa compartida: EIP-55 exige `keccak256` y la verificación
   * criptográfica es del Service Worker (M13). El campo se expone para que la UI no dé por
   * buena una dirección mixta sin advertirlo.
   */
  checksumVerified: false;
  /** Error del catálogo (`-32602 invalidAddress`) o `null` si la dirección es válida. */
  error: Eip1193Error | null;
}

/** ¿Tiene `value` la forma `0x` + 40 hex? */
export const isAddressShape = (value: unknown): value is Address =>
  typeof value === 'string' && ADDRESS_PATTERN.test(value.trim());

/** Estilo de mayúsculas de una dirección ya validada en forma. */
export const addressCaseStyle = (value: string): AddressCaseStyle | null => {
  const body = value.trim().slice(2);
  if (body.length === 0) {
    return null;
  }
  const hasLower = /[a-f]/.test(body);
  const hasUpper = /[A-F]/.test(body);
  if (hasLower && hasUpper) {
    return 'mixed';
  }
  return hasUpper ? 'uppercase' : 'lowercase';
};

/**
 * Valida una dirección: forma + estilo de mayúsculas. No lanza nunca; el fallo se describe
 * con el error tipado `-32602 invalidAddress` de `diccionario_datos.md` §4.3.
 */
export const validateAddress = (value: unknown): AddressCheck => {
  const raw = typeof value === 'string' ? value.trim() : '';
  const style = isAddressShape(raw) ? addressCaseStyle(raw) : null;
  if (!isAddressShape(raw) || style === null) {
    return {
      valid: false,
      address: null,
      caseStyle: null,
      checksumVerified: false,
      error: invalidAddressError(),
    };
  }
  return {
    valid: true,
    address: raw as Address,
    caseStyle: style,
    checksumVerified: false,
    error: null,
  };
};

/** Atajo booleano de {@link validateAddress}. */
export const isValidAddress = (value: unknown): boolean => validateAddress(value).valid;

/**
 * Devuelve la dirección utilizable (recortada) o `null`. NO recalcula el checksum: la forma
 * persistida EIP-55 se produce con `ethers` en el Service Worker.
 */
export const normalizeAddress = (value: unknown): Address | null => validateAddress(value).address;

/** Compara dos direcciones sin distinguir mayúsculas (misma cuenta). */
export const addressesEqual = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
