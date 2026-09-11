// @vitest-environment node
/**
 * `src/background/crypto/derivation.spec.ts` — M9 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre `CA-RF-04`: la ruta vinculante `m/44'/60'/0'/0/i`, las 5 cuentas iniciales (índices
 * 0..4) y la 6.ª al añadir. Los vectores esperados son direcciones REALES de BIP-44 (verificadas
 * también contra Anvil en el E2E), no copias de la implementación.
 *
 * Entorno `node`: ver la cabecera de `mnemonic.spec.ts` (incompatibilidad de `Uint8Array`
 * entre jsdom y el `Buffer` de `node:crypto` que usa `ethers`).
 */

import { describe, expect, it } from 'vitest';
import {
  DERIVATION_PREFIX,
  MAX_DERIVATION_INDEX,
  deriveAccount,
  deriveAccounts,
  deriveAddress,
  derivePrivateKey,
  derivationPath,
  isDerivationConsistent,
  isValidDerivationIndex,
} from './hd';

/** Frase de Anvil: las 5 primeras direcciones son las cuentas conocidas de Anvil. */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Vector 1 de BIP-39. */
const BIP39_VECTOR = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Direcciones reales de `m/44'/60'/0'/0/i` para la frase de Anvil (i = 0..5). */
const ANVIL_ADDRESSES = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
] as const;

/** Clave privada real de la cuenta 0 de Anvil (conocida y pública: es la de desarrollo). */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Direcciones reales para el vector 1 de BIP-39 (i = 0..1). */
const BIP39_ADDRESSES = [
  '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
  '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0',
] as const;

/** Cuentas que se derivan al crear la cartera (RF-04). */
const INITIAL_ACCOUNTS = 5;

describe('M9 · ruta de derivación `m/44\'/60\'/0\'/0/i`', () => {
  it('compone la ruta por índice y usa el prefijo vinculante', () => {
    expect(DERIVATION_PREFIX).toBe("m/44'/60'/0'/0");
    expect(derivationPath(0)).toBe("m/44'/60'/0'/0/0");
    expect(derivationPath(7)).toBe("m/44'/60'/0'/0/7");
    expect(deriveAccount(ANVIL_MNEMONIC, 3)?.path).toBe("m/44'/60'/0'/0/3");
  });

  it('deriva las direcciones reales de la frase de Anvil', () => {
    for (let index = 0; index < ANVIL_ADDRESSES.length; index += 1) {
      expect(deriveAddress(ANVIL_MNEMONIC, index)).toBe(ANVIL_ADDRESSES[index]);
    }
  });

  it('deriva las direcciones reales del vector 1 de BIP-39', () => {
    expect(deriveAddress(BIP39_VECTOR, 0)).toBe(BIP39_ADDRESSES[0]);
    expect(deriveAddress(BIP39_VECTOR, 1)).toBe(BIP39_ADDRESSES[1]);
  });

  it('la dirección de la cuenta 0 es la misma con la frase normalizada (CA-RF-02)', () => {
    const irregular = `  ${ANVIL_MNEMONIC.toUpperCase().replace(/ /g, '  ')} `;
    expect(deriveAddress(irregular, 0)).toBe(ANVIL_ADDRESSES[0]);
  });

  it('devuelve la clave privada real de una cuenta derivada', () => {
    expect(derivePrivateKey(ANVIL_MNEMONIC, 0)).toBe(ANVIL_KEY0);
    expect(derivePrivateKey(ANVIL_MNEMONIC, 1)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(derivePrivateKey(ANVIL_MNEMONIC, 1)).not.toBe(ANVIL_KEY0);
  });

  it('el índice 0 y el 1 producen direcciones distintas (no hay ruta fija)', () => {
    expect(deriveAddress(ANVIL_MNEMONIC, 0)).not.toBe(deriveAddress(ANVIL_MNEMONIC, 1));
  });
});

describe('M9 · las 5 cuentas iniciales y la 6.ª (CA-RF-04)', () => {
  it('deriva exactamente 5 cuentas con los índices 0..4 y sus rutas', () => {
    const accounts = deriveAccounts(ANVIL_MNEMONIC, INITIAL_ACCOUNTS);
    expect(accounts).toHaveLength(5);
    expect(accounts.map((account) => account.index)).toEqual([0, 1, 2, 3, 4]);
    expect(accounts.map((account) => account.path)).toEqual([
      "m/44'/60'/0'/0/0",
      "m/44'/60'/0'/0/1",
      "m/44'/60'/0'/0/2",
      "m/44'/60'/0'/0/3",
      "m/44'/60'/0'/0/4",
    ]);
    expect(accounts.map((account) => account.address)).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
  });

  it('«Añadir cuenta» deriva la 6.ª con índice 5 sin tocar las anteriores', () => {
    const accounts = deriveAccounts(ANVIL_MNEMONIC, 6);
    expect(accounts).toHaveLength(6);
    expect(accounts[5]?.index).toBe(5);
    expect(accounts[5]?.address).toBe(ANVIL_ADDRESSES[5]);
    expect(accounts.slice(0, 5).map((account) => account.address)).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
  });

  it('empieza en el índice pedido cuando se le pasa `startIndex`', () => {
    const fromFive = deriveAccounts(ANVIL_MNEMONIC, 1, 5);
    expect(fromFive).toHaveLength(1);
    expect(fromFive[0]?.index).toBe(5);
    expect(fromFive[0]?.address).toBe(ANVIL_ADDRESSES[5]);
  });

  it('es determinista: dos derivaciones del mismo índice coinciden', () => {
    expect(deriveAccount(ANVIL_MNEMONIC, 2)).toEqual(deriveAccount(ANVIL_MNEMONIC, 2));
  });

  it('devuelve una lista vacía con un recuento no positivo', () => {
    expect(deriveAccounts(ANVIL_MNEMONIC, 0)).toEqual([]);
    expect(deriveAccounts(ANVIL_MNEMONIC, -3)).toEqual([]);
    expect(deriveAccounts(ANVIL_MNEMONIC, 1.5)).toEqual([]);
  });
});

describe('M9 · índices válidos (BIP-32, 31 bits)', () => {
  it('acepta enteros de 0 a 2^31-1 y rechaza el resto', () => {
    expect(MAX_DERIVATION_INDEX).toBe(0x7fffffff);
    expect(isValidDerivationIndex(0)).toBe(true);
    expect(isValidDerivationIndex(4)).toBe(true);
    expect(isValidDerivationIndex(MAX_DERIVATION_INDEX)).toBe(true);
    expect(isValidDerivationIndex(MAX_DERIVATION_INDEX + 1)).toBe(false);
    expect(isValidDerivationIndex(-1)).toBe(false);
    expect(isValidDerivationIndex(1.5)).toBe(false);
    expect(isValidDerivationIndex(Number.NaN)).toBe(false);
    expect(isValidDerivationIndex('0')).toBe(false);
  });

  it('`deriveAccount` devuelve `null` con un índice inválido', () => {
    expect(deriveAccount(ANVIL_MNEMONIC, -1)).toBeNull();
    expect(deriveAccount(ANVIL_MNEMONIC, MAX_DERIVATION_INDEX + 1)).toBeNull();
    expect(deriveAddress(ANVIL_MNEMONIC, 0.5)).toBeNull();
  });
});

describe('M9 · cero derivaciones silenciosas (RNF-22)', () => {
  it('una frase corrupta devuelve `null` en lugar de inventar una dirección', () => {
    const broken = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    expect(deriveAddress(broken, 0)).toBeNull();
    expect(derivePrivateKey(broken, 0)).toBeNull();
    expect(deriveAccount(broken, 0)).toBeNull();
  });

  it('una frase con palabra fuera de la lista devuelve `null`', () => {
    const unknown = 'zzzz abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    expect(deriveAddress(unknown, 0)).toBeNull();
  });

  it('si una cuenta de la lista falla, no se devuelve NINGUNA (lista vacía)', () => {
    const withBadStart = deriveAccounts(ANVIL_MNEMONIC, 2, MAX_DERIVATION_INDEX);
    expect(withBadStart).toEqual([]);
  });
});

describe('M9 · contraste de integridad (M13)', () => {
  it('reconoce la dirección derivada correcta y rechaza otra', () => {
    expect(isDerivationConsistent(ANVIL_MNEMONIC, 0, ANVIL_ADDRESSES[0])).toBe(true);
    expect(isDerivationConsistent(ANVIL_MNEMONIC, 0, ANVIL_ADDRESSES[0].toLowerCase())).toBe(true);
    expect(isDerivationConsistent(ANVIL_MNEMONIC, 0, ANVIL_ADDRESSES[1])).toBe(false);
    expect(isDerivationConsistent(ANVIL_MNEMONIC, 1, ANVIL_ADDRESSES[0])).toBe(false);
  });
});
