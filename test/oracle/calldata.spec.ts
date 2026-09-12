/**
 * M66 — `src/background/approvals/calldata.ts` (spec del árbol `test/oracle/`)
 * Tabla local CERRADA de selectores: es el oráculo anti-firma-ciega de **R5**, requisito que
 * materializa **RF-19** (`documento_tecnico.md` §3.4.1) y que **RNF-31** exige no ampliar en
 * runtime. Se comprueba el contrato observable de `decodeCalldata` (selector fuera de la tabla →
 * `isUnrecognizedContractCall`, argumentos que no encajan → `decode-failed`) y la coherencia
 * selectores↔firmas canónicas de `SELECTOR_TABLE` (RF-20).
 */

import { describe, expect, it } from 'vitest';
import { AbiCoder } from 'ethers';

import {
  EMPTY_CALLDATA,
  KNOWN_SELECTORS,
  KNOWN_SIGNATURES,
  MAX_UINT256,
  SELECTOR_LENGTH,
  SELECTOR_TABLE,
  UNLIMITED_ALLOWANCE,
  UNKNOWN_TO_LABEL,
  abiTypesOf,
  calldataByteLength,
  computeSelector,
  decodeCalldata,
  formatDecodedValue,
  isHexData,
  isKnownSelector,
  isUnlimitedAllowance,
  lookupSelector,
  normalizeCalldata,
  selectorOf,
} from '../../src/background/approvals/calldata';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
/** Cuenta #1 de Anvil (EIP-55). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Argumento ABI de 32 bytes a partir de una dirección. */
const word = (address: string): string => address.slice(2).toLowerCase().padStart(64, '0');

/** Argumento ABI de 32 bytes a partir de un número. */
const wordOf = (value: bigint): string => value.toString(16).padStart(64, '0');

describe('M66 · tabla local cerrada de selectores (RF-19 / RF-20)', () => {
  it('cada selector literal coincide con el keccak256 de su firma canónica', () => {
    expect(SELECTOR_TABLE).toHaveLength(7);
    for (const entry of SELECTOR_TABLE) {
      expect(entry.selector).toBe(computeSelector(entry.signature));
      expect(entry.selector).toHaveLength(SELECTOR_LENGTH);
    }
    expect(KNOWN_SELECTORS).toEqual(SELECTOR_TABLE.map((entry) => entry.selector));
    expect(KNOWN_SIGNATURES).toEqual(SELECTOR_TABLE.map((entry) => entry.signature));
  });

  it('computeSelector es determinista y devuelve 0x + 4 bytes', () => {
    expect(computeSelector('transfer(address,uint256)')).toBe('0xa9059cbb');
    expect(computeSelector('transfer(address,uint256)')).toBe(computeSelector('transfer(address,uint256)'));
    expect(computeSelector('transfer(address,uint256)')).toHaveLength(SELECTOR_LENGTH);
  });

  it('lookupSelector normaliza espacios y mayúsculas, y rechaza lo que no es texto', () => {
    expect(lookupSelector('0xA9059CBB')?.name).toBe('transfer');
    expect(lookupSelector('  0xa9059cbb  ')?.signature).toBe('transfer(address,uint256)');
    expect(lookupSelector('0xdeadbeef')).toBeUndefined();
    expect(lookupSelector(42)).toBeUndefined();
    expect(lookupSelector(null)).toBeUndefined();
    expect(isKnownSelector('0x095ea7b3')).toBe(true);
    expect(isKnownSelector('0xdeadbeef')).toBe(false);
  });

  it('selectorOf exige 0x y al menos 4 bytes; isHexData exige hex de longitud PAR', () => {
    expect(selectorOf('0x095ea7b3')).toBe('0x095ea7b3');
    expect(selectorOf('0x095EA7B3')).toBe('0x095ea7b3');
    expect(selectorOf('0xabc')).toBeNull();
    expect(selectorOf('a9059cbb')).toBeNull();
    expect(selectorOf(undefined)).toBeNull();

    expect(isHexData('0x')).toBe(true);
    expect(isHexData('0x095ea7b3')).toBe(true);
    expect(isHexData(' 0xAC ')).toBe(true);
    expect(isHexData('0xabc')).toBe(false);
    expect(isHexData('0xzz')).toBe(false);
    expect(isHexData(123)).toBe(false);
  });

  it('UNLIMITED_ALLOWANCE es 2^256-1 y UNKNOWN_TO_LABEL es el marcador de §3.1', () => {
    expect(UNLIMITED_ALLOWANCE).toBe(MAX_UINT256);
    expect(MAX_UINT256).toBe((1n << 256n) - 1n);
    expect(UNKNOWN_TO_LABEL).toBe('desconocido');
    expect(EMPTY_CALLDATA).toBe('0x');
  });
});

describe('M66 · decodeCalldata: contrato EXACTO de fallo (§3.4.1)', () => {
  it('calldata vacío o no textual → transferencia simple sin función reconocida', () => {
    for (const value of [undefined, null, 7, {}, [], '0x', '0X', '   ']) {
      const decoded = decodeCalldata(value);
      expect(decoded.selector).toBeNull();
      expect(decoded.functionName).toBeNull();
      expect(decoded.decodedArgs).toBeNull();
      expect(decoded.isUnrecognizedContractCall).toBe(false);
      expect(decoded.isContractCall).toBe(false);
      expect(decoded.riskFlags).toEqual([]);
      expect(decoded.subCalls).toEqual([]);
    }
  });

  it('selector fuera de la tabla → NO reconocida y aviso estructural `unrecognized`', () => {
    const decoded = decodeCalldata('0xdeadbeef');
    expect(decoded.selector).toBe('0xdeadbeef');
    expect(decoded.functionName).toBeNull();
    expect(decoded.decodedArgs).toBeNull();
    expect(decoded.isUnrecognizedContractCall).toBe(true);
    expect(decoded.isContractCall).toBe(true);
    expect(decoded.riskFlags).toEqual(['unrecognized']);
  });

  it('selector conocido con cuerpo hexadecimal inválido → `decode-failed` conservando la firma', () => {
    const decoded = decodeCalldata('0x095ea7b3zz');
    expect(decoded.selector).toBe('0x095ea7b3');
    expect(decoded.functionName).toBe('approve(address,uint256)');
    expect(decoded.decodedArgs).toBeNull();
    expect(decoded.isUnrecognizedContractCall).toBe(false);
    expect(decoded.riskFlags).toEqual(['decode-failed']);
  });

  it('selector conocido sin argumentos → el ABI no encaja y se marca `decode-failed`', () => {
    const decoded = decodeCalldata('0x095ea7b3');
    expect(decoded.selector).toBe('0x095ea7b3');
    expect(decoded.functionName).toBe('approve(address,uint256)');
    expect(decoded.decodedArgs).toBeNull();
    expect(decoded.riskFlags).toEqual(['decode-failed']);
  });

  it('transfer(address,uint256): dirección con checksum y uint256 como CADENA decimal', () => {
    const data = `0xa9059cbb${word(CUENTA_1)}${wordOf(1_000_000_000_000_000n)}` as const;
    const decoded = decodeCalldata(data);
    expect(decoded.selector).toBe('0xa9059cbb');
    expect(decoded.functionName).toBe('transfer(address,uint256)');
    expect(decoded.isUnrecognizedContractCall).toBe(false);
    expect(decoded.decodedArgs).toEqual({ to: CUENTA_1, amount: '1000000000000000' });
    expect(typeof (decoded.decodedArgs as { amount: unknown }).amount).toBe('string');
    expect(decoded.riskFlags).toEqual([]);
  });

  it('approve con 2^256-1 dispara `unlimited-allowance`; con un importe normal no', () => {
    const ilimitado = decodeCalldata(`0x095ea7b3${word(CUENTA_1)}${wordOf(MAX_UINT256)}`);
    expect(ilimitado.decodedArgs).toEqual({ spender: CUENTA_1, amount: MAX_UINT256.toString() });
    expect(ilimitado.riskFlags).toEqual(['unlimited-allowance']);

    const normal = decodeCalldata(`0x095ea7b3${word(CUENTA_1)}${wordOf(5n)}`);
    expect(normal.riskFlags).toEqual([]);
  });

  it('increaseAllowance con 2^256-1 también es allowance ILIMITADA (H-11b)', () => {
    const decoded = decodeCalldata(`0x39509351${word(CUENTA_1)}${wordOf(MAX_UINT256)}`);
    expect(decoded.functionName).toBe('increaseAllowance(address,uint256)');
    expect(decoded.decodedArgs).toEqual({ spender: CUENTA_1, addedValue: MAX_UINT256.toString() });
    expect(decoded.riskFlags).toEqual(['unlimited-allowance']);

    const normal = decodeCalldata(`0x39509351${word(CUENTA_1)}${wordOf(1n)}`);
    expect(normal.riskFlags).toEqual([]);
  });

  it('setApprovalForAll(true) dispara `approval-for-all`; con false no', () => {
    const afirmativo = decodeCalldata(`0xa22cb465${word(CUENTA_1)}${wordOf(1n)}`);
    expect(afirmativo.decodedArgs).toEqual({ operator: CUENTA_1, approved: true });
    expect(afirmativo.riskFlags).toEqual(['approval-for-all']);

    const negativo = decodeCalldata(`0xa22cb465${word(CUENTA_1)}${wordOf(0n)}`);
    expect(negativo.decodedArgs).toEqual({ operator: CUENTA_1, approved: false });
    expect(negativo.riskFlags).toEqual([]);
  });

  it('permit conserva `v`/`r`/`s` y marca el aviso `permit`', () => {
    const data = [
      '0xd505accf',
      word(CUENTA_0),
      word(CUENTA_1),
      wordOf(1_000n),
      wordOf(2_000n),
      wordOf(27n),
      wordOf(0xabn),
      wordOf(0xcdn),
    ].join('');
    const decoded = decodeCalldata(data);
    expect(decoded.functionName).toBe('permit(address,address,uint256,uint256,uint8,bytes32,bytes32)');
    expect(decoded.riskFlags).toEqual(['permit']);
    expect(decoded.decodedArgs).toMatchObject({
      owner: CUENTA_0,
      spender: CUENTA_1,
      value: '1000',
      deadline: '2000',
      v: '27',
    });
  });

  it('transferFrom decodifica tres argumentos', () => {
    const data = `0x23b872dd${word(CUENTA_0)}${word(CUENTA_1)}${wordOf(7n)}` as const;
    const decoded = decodeCalldata(data);
    expect(decoded.functionName).toBe('transferFrom(address,address,uint256)');
    expect(decoded.decodedArgs).toEqual({ from: CUENTA_0, to: CUENTA_1, amount: '7' });
  });
});

describe('M66 · multicall: recursión por la MISMA tabla (§3.4.1)', () => {
  /** Codifica `bytes[]` con el AbiCoder de `ethers` (la misma implementación que decodifica). */
  const encodeBytesArray = (items: string[]): string => {
    const coder = AbiCoder.defaultAbiCoder();
    return coder.encode(['bytes[]'], [items]).slice(2);
  };

  it('sub-llamada conocida: se decodifica y NO hay aviso de no reconocida', () => {
    const interna = `0xa9059cbb${word(CUENTA_1)}${wordOf(9n)}`;
    const decoded = decodeCalldata(`0xac9650d8${encodeBytesArray([interna])}`);

    expect(decoded.functionName).toBe('multicall(bytes[])');
    expect(decoded.riskFlags).toEqual([]);
    expect(decoded.subCalls).toHaveLength(1);
    expect(decoded.subCalls[0]).toMatchObject({
      index: 0,
      functionName: 'transfer(address,uint256)',
      isUnrecognizedContractCall: false,
    });
    expect(decoded.decodedArgs).toMatchObject({ count: 1 });
  });

  it('sub-llamada desconocida → `multicall-with-unrecognized` (aviso BLOQUEANTE de M19)', () => {
    const conocida = `0xa9059cbb${word(CUENTA_1)}${wordOf(9n)}`;
    const decoded = decodeCalldata(`0xac9650d8${encodeBytesArray([conocida, '0xdeadbeef'])}`);

    expect(decoded.riskFlags).toEqual(['multicall-with-unrecognized']);
    expect(decoded.subCalls.map((call) => call.isUnrecognizedContractCall)).toEqual([false, true]);
    expect(decoded.subCalls[1]?.functionName).toBeNull();
    expect(decoded.decodedArgs).toMatchObject({ count: 2 });
  });
});

describe('M66 · formateo legible y serializable de argumentos', () => {
  it('formatDecodedValue cubre bool, uint/int, address, bytes y arrays', () => {
    expect(formatDecodedValue('bool', 1)).toBe(false);
    expect(formatDecodedValue('bool', true)).toBe(true);
    expect(formatDecodedValue('uint256', 10n)).toBe('10');
    expect(formatDecodedValue('int128', '5')).toBe('5');
    expect(formatDecodedValue('address', CUENTA_1.toLowerCase())).toBe(CUENTA_1);
    expect(formatDecodedValue('address', 'no-es-direccion')).toBe('no-es-direccion');
    // `bytes` largo → truncado `0x1234…abcd`; corto → tal cual.
    expect(formatDecodedValue('bytes', '0x1234567890abcdef12')).toBe('0x1234…ef12');
    expect(formatDecodedValue('bytes', '0x1234')).toBe('0x1234');
    expect(formatDecodedValue('bytes32', '0xabcd')).toBe('0xabcd');
    expect(formatDecodedValue('bytes[]', ['0x1234', '0x5678'])).toEqual(['0x1234', '0x5678']);
    expect(formatDecodedValue('address[]', [CUENTA_1.toLowerCase()])).toEqual([CUENTA_1]);
    // Un valor que no es lista con un tipo de array se trata como lista VACÍA.
    expect(formatDecodedValue('bytes[]', 'no-lista')).toEqual([]);
    // Tipo desconocido: se devuelve sin tocar.
    expect(formatDecodedValue('string', 'hola')).toBe('hola');
  });

  it('abiTypesOf devuelve los tipos en orden de entrada', () => {
    const approve = SELECTOR_TABLE.find((entry) => entry.name === 'approve');
    expect(approve).toBeDefined();
    expect(abiTypesOf(approve!)).toEqual(['address', 'uint256']);
  });

  it('isUnlimitedAllowance acepta bigint y cadena decimal, y rechaza lo demás', () => {
    expect(isUnlimitedAllowance(MAX_UINT256)).toBe(true);
    expect(isUnlimitedAllowance(MAX_UINT256 + 1n)).toBe(true);
    expect(isUnlimitedAllowance(MAX_UINT256 - 1n)).toBe(false);
    expect(isUnlimitedAllowance(MAX_UINT256.toString())).toBe(true);
    expect(isUnlimitedAllowance(' 1 ')).toBe(false);
    expect(isUnlimitedAllowance('no-numero')).toBe(false);
    expect(isUnlimitedAllowance(1)).toBe(false);
    expect(isUnlimitedAllowance(null)).toBe(false);
  });

  it('normalizeCalldata y calldataByteLength normalizan a minúsculas y cuentan bytes', () => {
    expect(normalizeCalldata('0xA9059CBB')).toBe('0xa9059cbb');
    expect(normalizeCalldata('0xzz')).toBe('0x');
    expect(normalizeCalldata(undefined)).toBe('0x');
    expect(calldataByteLength('0xa9059cbb')).toBe(4);
    expect(calldataByteLength('0x')).toBe(0);
    expect(calldataByteLength(9)).toBe(0);
  });
});
