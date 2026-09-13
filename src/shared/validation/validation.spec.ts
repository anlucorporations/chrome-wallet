/**
 * `src/shared/validation/validation.spec.ts` — M58, M59, M60 y M61
 * (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre `CA-RF-33` (validación inline de los cuatro formularios: frase, dirección, importe y
 * clave privada) con **magnitudes concretas**: cada fallo se describe con su `problem` y su
 * error del catálogo (`-32602`), y cada acierto con el valor normalizado exacto.
 *
 * De la dirección y la clave privada se comprueba lo que la capa compartida PUEDE comprobar sin
 * criptografía (forma, estilo de mayúsculas y rango de secp256k1); el checksum EIP-55 y el
 * contraste clave ↔ dirección son del Service Worker (M10/M13), probados en
 * `src/background/crypto/*.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { ETH_AMOUNT_MAX_DECIMALS, ETH_DECIMALS, SECP256K1_N_HEX } from '../constants';
import {
  ADDRESS_HEX_LENGTH,
  addressCaseStyle,
  addressesEqual,
  isAddressShape,
  isValidAddress,
  normalizeAddress,
  validateAddress,
} from './address';
import {
  MAX_UINT256,
  canonicalizeAmount,
  compareWei,
  ethToWei,
  hasSufficientBalance,
  insufficientBalanceError,
  isValidAmount,
  toWeiBigInt,
  validateAmount,
} from './amount';
import {
  MNEMONIC_WORD_COUNT,
  MNEMONIC_WORD_MAX_LENGTH,
  MNEMONIC_WORD_MIN_LENGTH,
  isMnemonicShapeValid,
  mnemonicWordCount,
  normalizeMnemonic,
  sameMnemonic,
  splitMnemonicWords,
  validateMnemonicShape,
} from './mnemonic';
import {
  PRIVATE_KEY_HEX_LENGTH,
  SECP256K1_N,
  isPrivateKeyInSecp256k1Range,
  isPrivateKeyShape,
  isValidPrivateKey,
  maskPrivateKey,
  normalizePrivateKeyInput,
  validatePrivateKey,
} from './privateKey';

/** Frase válida de 12 palabras (vector 1 de BIP-39). */
const BIP39_VECTOR = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Dirección EIP-55 real de la cuenta 0 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Clave privada real de la cuenta 0 de Anvil (pública: es la de desarrollo). */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** El mensaje del catálogo que debe acompañar a todo fallo de material de entrada. */
const INVALID_MNEMONIC = 'La frase de recuperación no es válida: revisa las 12 palabras y su checksum.';

describe('M59 · frase de recuperación (formulario 1 de CA-RF-33)', () => {
  it('acepta 12 palabras en minúsculas y sin dígitos', () => {
    const check = validateMnemonicShape(BIP39_VECTOR);
    expect(check.valid).toBe(true);
    expect(check.problem).toBeNull();
    expect(check.error).toBeNull();
    expect(check.normalized).toBe(BIP39_VECTOR);
    expect(check.wordCount).toBe(MNEMONIC_WORD_COUNT);
    expect(MNEMONIC_WORD_COUNT).toBe(12);
  });

  it('rechaza 11 y 13 palabras con `wordCount` y `-32602`', () => {
    const eleven = BIP39_VECTOR.split(' ').slice(0, 11).join(' ');
    const thirteen = `${BIP39_VECTOR} zoo`;
    for (const [candidate, esperado] of [[eleven, 11], [thirteen, 13]] as const) {
      const check = validateMnemonicShape(candidate);
      expect(check.valid).toBe(false);
      expect(check.problem).toBe('wordCount');
      expect(check.wordCount).toBe(esperado);
      expect(check.error?.code).toBe(-32602);
      expect(check.error?.message).toBe(INVALID_MNEMONIC);
    }
  });

  it('rechaza la entrada vacía y la que no es cadena con `empty`', () => {
    for (const entrada of ['', '   ', null, 12, undefined]) {
      const check = validateMnemonicShape(entrada);
      expect(check.valid).toBe(false);
      expect(check.problem).toBe('empty');
      expect(check.wordCount).toBe(0);
      expect(check.error?.code).toBe(-32602);
    }
  });

  it('rechaza palabras con dígitos, guiones o longitudes imposibles', () => {
    const conDigito = BIP39_VECTOR.replace('about', 'about1');
    expect(validateMnemonicShape(conDigito).problem).toBe('wordFormat');
    const conGuion = BIP39_VECTOR.replace('about', 'a-bout');
    expect(validateMnemonicShape(conGuion).problem).toBe('wordFormat');
    const corta = BIP39_VECTOR.replace('about', 'ab');
    expect(validateMnemonicShape(corta).problem).toBe('wordFormat');
    const larga = BIP39_VECTOR.replace('about', 'a'.repeat(MNEMONIC_WORD_MAX_LENGTH + 1));
    expect(validateMnemonicShape(larga).problem).toBe('wordFormat');
    expect(MNEMONIC_WORD_MIN_LENGTH).toBe(3);
    expect(MNEMONIC_WORD_MAX_LENGTH).toBe(8);
  });

  it('normaliza mayúsculas, tabuladores, saltos de línea y dobles espacios', () => {
    const irregular = `  ${BIP39_VECTOR.toUpperCase().replace(/ /g, '\t  ')}\n`;
    expect(normalizeMnemonic(irregular)).toBe(BIP39_VECTOR);
    expect(validateMnemonicShape(irregular).valid).toBe(true);
    expect(splitMnemonicWords(irregular)).toHaveLength(12);
    expect(mnemonicWordCount(irregular)).toBe(12);
  });

  it('elimina los diacríticos y deja la frase en su forma estable', () => {
    // `abandon` con acento no es BIP-39, pero la normalización debe ser determinista ANTES de
    // rechazarla, para que el error sea siempre el mismo.
    const acentuada = BIP39_VECTOR.replace('abandon', 'abandón');
    expect(normalizeMnemonic(acentuada)).toBe(BIP39_VECTOR);
    expect(validateMnemonicShape(acentuada).valid).toBe(true);
  });

  it('`isMnemonicShapeValid` y `sameMnemonic` coinciden con el veredicto completo', () => {
    expect(isMnemonicShapeValid(BIP39_VECTOR)).toBe(true);
    expect(isMnemonicShapeValid('una sola palabra')).toBe(false);
    expect(sameMnemonic(BIP39_VECTOR, `  ${BIP39_VECTOR.toUpperCase()}  `)).toBe(true);
    expect(sameMnemonic(BIP39_VECTOR, BIP39_VECTOR.replace('about', 'zoo'))).toBe(false);
    expect(sameMnemonic('', '')).toBe(false);
  });

  it('la validación estructural NO comprueba el checksum (eso es del SW)', () => {
    // 12 palabras con forma correcta pero checksum imposible: la capa compartida la ACEPTA y es
    // el Service Worker quien la rechaza con `-32602` (`mnemonic.spec.ts` lo verifica).
    const checksumRoto = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    expect(validateMnemonicShape(checksumRoto).valid).toBe(true);
    expect(validateMnemonicShape(checksumRoto).error).toBeNull();
  });
});

describe('M58 · dirección (formulario 2 de CA-RF-33)', () => {
  it('acepta `0x` + 40 hex y devuelve la forma persistible', () => {
    const check = validateAddress(`  ${ANVIL_ADDRESS0}  `);
    expect(check.valid).toBe(true);
    expect(check.address).toBe(ANVIL_ADDRESS0);
    expect(check.error).toBeNull();
    expect(ADDRESS_HEX_LENGTH).toBe(40);
    expect(ANVIL_ADDRESS0.slice(2)).toHaveLength(40);
  });

  it('rechaza longitudes y caracteres incorrectos con `-32602 invalidAddress`', () => {
    const invalidas = [
      '',
      '0x',
      ANVIL_ADDRESS0.slice(0, -1),
      `${ANVIL_ADDRESS0}0`,
      ANVIL_ADDRESS0.replace('0x', ''),
      `0x${'g'.repeat(40)}`,
      `1x${ANVIL_ADDRESS0.slice(2)}`,
      '0x1234',
    ];
    for (const entrada of invalidas) {
      const check = validateAddress(entrada);
      expect(check.valid, `«${entrada}» debería rechazarse`).toBe(false);
      expect(check.address).toBeNull();
      expect(check.caseStyle).toBeNull();
      expect(check.error?.code).toBe(-32602);
      expect(check.error?.message).toBe(
        'La dirección no es válida: revisa el formato `0x` + 40 caracteres hexadecimales.',
      );
    }
    expect(isValidAddress(ANVIL_ADDRESS0)).toBe(true);
    expect(isAddressShape('no-es-direccion')).toBe(false);
    // Los espacios de los extremos SÍ se toleran (se recortan), los interiores no.
    expect(validateAddress(`  ${ANVIL_ADDRESS0}  `).valid).toBe(true);
    expect(validateAddress('0x f39Fd6e51aad88F6F4ce6aB8827279cffFb92266').valid).toBe(false);
  });

  it('detecta el estilo de mayúsculas, que es lo único verificable sin criptografía', () => {
    expect(addressCaseStyle(ANVIL_ADDRESS0)).toBe('mixed');
    expect(addressCaseStyle(ANVIL_ADDRESS0.toLowerCase())).toBe('lowercase');
    expect(addressCaseStyle(`0x${ANVIL_ADDRESS0.slice(2).toUpperCase()}`)).toBe('uppercase');
    expect(validateAddress(ANVIL_ADDRESS0).checksumVerified).toBe(false);
  });

  it('`normalizeAddress` no recalcula el checksum: solo forma y recorte', () => {
    expect(normalizeAddress(ANVIL_ADDRESS0)).toBe(ANVIL_ADDRESS0);
    expect(normalizeAddress(ANVIL_ADDRESS0.toLowerCase())).toBe(ANVIL_ADDRESS0.toLowerCase());
    expect(normalizeAddress('basura')).toBeNull();
  });

  it('`addressesEqual` compara sin distinguir mayúsculas', () => {
    expect(addressesEqual(ANVIL_ADDRESS0, ANVIL_ADDRESS0.toLowerCase())).toBe(true);
    expect(addressesEqual(` ${ANVIL_ADDRESS0} `, ANVIL_ADDRESS0)).toBe(true);
    expect(addressesEqual(ANVIL_ADDRESS0, '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF')).toBe(false);
  });
});

describe('M61 · clave privada (formulario 3 de CA-RF-33)', () => {
  it('acepta `0x` + 64 hex dentro del rango y normaliza a minúsculas', () => {
    const check = validatePrivateKey(`  ${ANVIL_KEY0.toUpperCase()}  `);
    expect(check.valid).toBe(true);
    expect(check.privateKey).toBe(ANVIL_KEY0);
    expect(check.problem).toBeNull();
    expect(check.error).toBeNull();
    expect(PRIVATE_KEY_HEX_LENGTH).toBe(64);
    expect(normalizePrivateKeyInput(ANVIL_KEY0)).toBe(ANVIL_KEY0);
    expect(isPrivateKeyShape(ANVIL_KEY0)).toBe(true);
    expect(isValidPrivateKey(ANVIL_KEY0)).toBe(true);
  });

  it('rechaza la forma incorrecta con `format` y `-32602 invalidPrivateKey`', () => {
    const malFormadas = ['', '0x', ANVIL_KEY0.slice(0, -1), `${ANVIL_KEY0}0`, ANVIL_KEY0.slice(2), `0x${'z'.repeat(64)}`];
    for (const entrada of malFormadas) {
      const check = validatePrivateKey(entrada);
      expect(check.valid, `«${entrada}» debería rechazarse`).toBe(false);
      expect(check.privateKey).toBeNull();
      expect(check.error?.code).toBe(-32602);
      expect(check.error?.message).toBe(
        'La clave privada no es válida: debe ser `0x` + 64 caracteres hexadecimales de la curva secp256k1.',
      );
    }
    expect(validatePrivateKey('').problem).toBe('empty');
    expect(validatePrivateKey(ANVIL_KEY0.slice(0, -1)).problem).toBe('format');
  });

  it('rechaza 0 y `n` con `range` y acepta 1 y `n-1`', () => {
    const cero = `0x${'0'.repeat(64)}`;
    const orden = `0x${SECP256K1_N.toString(16).padStart(64, '0')}`;
    const uno = `0x${'1'.padStart(64, '0')}`;
    const menosUno = `0x${(SECP256K1_N - 1n).toString(16).padStart(64, '0')}`;

    expect(validatePrivateKey(cero).problem).toBe('range');
    expect(validatePrivateKey(orden).problem).toBe('range');
    expect(isPrivateKeyInSecp256k1Range(cero)).toBe(false);
    expect(isPrivateKeyInSecp256k1Range(orden)).toBe(false);
    expect(isPrivateKeyInSecp256k1Range(uno)).toBe(true);
    expect(isPrivateKeyInSecp256k1Range(menosUno)).toBe(true);
    expect(validatePrivateKey(uno).privateKey).toBe(uno);
    expect(validatePrivateKey(menosUno).privateKey).toBe(menosUno);
    expect(SECP256K1_N).toBe(BigInt(SECP256K1_N_HEX));
  });

  it('enmascara la clave para las trazas sin dejar el cuerpo visible', () => {
    expect(maskPrivateKey(ANVIL_KEY0)).toBe('0xac09…ff80');
    expect(maskPrivateKey('no-es-clave')).toBe('0x…');
    expect(maskPrivateKey(null)).toBe('0x…');
  });
});

describe('M60 · importe en ETH (formulario 4 de CA-RF-33)', () => {
  it('acepta hasta 4 decimales y devuelve el wei EXACTO', () => {
    const check = validateAmount('1.5');
    expect(check.valid).toBe(true);
    expect(check.wei).toBe('1500000000000000000');
    expect(check.normalized).toBe('1.5');
    expect(check.problem).toBeNull();
    expect(ETH_AMOUNT_MAX_DECIMALS).toBe(4);
    expect(ETH_DECIMALS).toBe(18);
    expect(validateAmount('0.0001').wei).toBe('100000000000000');
    expect(validateAmount('1').wei).toBe('1000000000000000000');
  });

  it('rechaza más de 4 decimales con `decimals`', () => {
    const check = validateAmount('0.00001');
    expect(check.valid).toBe(false);
    expect(check.problem).toBe('decimals');
    expect(check.wei).toBeNull();
    // El límite es configurable por parámetro.
    expect(validateAmount('0.00001', 8).valid).toBe(true);
    expect(validateAmount('0.00001', 8).wei).toBe('10000000000000');
  });

  it('rechaza vacío, signos, comas, separadores de millar y notación científica', () => {
    const invalidos = ['', '   ', '-1', '+1', '1,5', '1 000', '1e18', '.5', '1.', 'abc', '1.2.3'];
    for (const entrada of invalidos) {
      const check = validateAmount(entrada);
      expect(check.valid, `«${entrada}» debería rechazarse`).toBe(false);
      expect(check.wei).toBeNull();
      expect(check.normalized).toBeNull();
      // DEFECTO CERRADO (fase 4, fleco 2): el fallo devuelve el error TIPADO de §4.3.1
      // (`-32602 invalidAmount`) en vez de `error: null`. El `problem` interno sigue disponible.
      expect(check.problem, `«${entrada}» debe describir su causa`).not.toBeNull();
      expect(check.error?.code).toBe(-32602);
      expect(check.error?.message).toBe(
        'El importe no es válido: usa un número decimal positivo con hasta 18 decimales.',
      );
      expect(check.error?.data).toEqual({
        reason: 'invalid-amount',
        problem: check.problem,
      });
    }
    expect(validateAmount('').problem).toBe('empty');
    expect(validateAmount('-1').problem).toBe('format');
    expect(isValidAmount('1.5')).toBe(true);
    expect(isValidAmount('1.5.5')).toBe(false);
  });

  it('el error tipado de importe inválido cubre las CUATRO causas y no se filtra al caso válido', () => {
    // Cada causa del diagnóstico tiene su error documentado, uno por causa (§4.3.1).
    const causas = [
      { entrada: '   ', problem: 'empty' },
      { entrada: '1e18', problem: 'format' },
      { entrada: '0.00001', problem: 'decimals' },
      { entrada: MAX_UINT256.toString(), problem: 'overflow' },
    ] as const;
    for (const { entrada, problem } of causas) {
      const check = validateAmount(entrada);
      expect(check.problem).toBe(problem);
      expect(check.error).toMatchObject({
        code: -32602,
        data: { reason: 'invalid-amount', problem },
      });
    }
    // Un importe VÁLIDO no arrastra error: `error` es `null` solo cuando el importe vale.
    const valido = validateAmount('1.5');
    expect(valido.valid).toBe(true);
    expect(valido.error).toBeNull();
  });

  it('rechaza el importe que desborda `uint256` con `overflow`', () => {
    const techo = MAX_UINT256.toString();
    expect(validateAmount(techo).valid).toBe(false);
    expect(validateAmount(techo).problem).toBe('overflow');
    // Un importe muy por encima del techo tampoco entra.
    expect(validateAmount('999999999999999999999999999999999999999999999999999999999999999999999').problem).toBe('overflow');
    const casi = '0.000000000000000001';
    expect(validateAmount(casi, 18).wei).toBe('1');
  });

  it('canonicaliza el importe quitando ceros sobrantes y normaliza el entero', () => {
    expect(canonicalizeAmount('1.5000')).toBe('1.5');
    expect(canonicalizeAmount('01.50')).toBe('1.5');
    expect(canonicalizeAmount('0.0000')).toBe('0');
    expect(canonicalizeAmount('10.0')).toBe('10');
    expect(canonicalizeAmount('0.1000')).toBe('0.1');
    expect(validateAmount('01.5000').normalized).toBe('1.5');
  });

  it('convierte con aritmética exacta, sin coma flotante', () => {
    expect(ethToWei('1.5')).toBe(1_500_000_000_000_000_000n);
    expect(ethToWei('0.1')).toBe(100_000_000_000_000_000n);
    expect(ethToWei('bash')).toBeNull();
    expect(toWeiBigInt('1500000000000000000')).toBe(1_500_000_000_000_000_000n);
    expect(toWeiBigInt(5n)).toBe(5n);
  });

  it('compara cantidades en wei con exactitud y detecta el saldo insuficiente', () => {
    expect(compareWei('2', '1')).toBe(1);
    expect(compareWei('1', '1')).toBe(0);
    expect(compareWei('1', '2')).toBe(-1);
    expect(hasSufficientBalance('1000', '1000')).toBe(true);
    expect(hasSufficientBalance('1001', '1000')).toBe(false);
    // A partir de 2^53 la coma flotante perdería precisión: `bigint` no.
    expect(compareWei('9007199254740993', '9007199254740992')).toBe(1);

    expect(insufficientBalanceError('1000', '1000')).toBeNull();
    const error = insufficientBalanceError('1001', '1000');
    expect(error?.code).toBe(-32000);
    expect(error?.message).toBe('Saldo insuficiente para cubrir el valor y la comisión estimada.');
  });

  it('la frontera de `uint256` es exacta: el techo se acepta y un wei más desborda', () => {
    // El importe máximo representable en wei ES `2^256 − 1`; su forma en ETH tiene 78 dígitos
    // enteros y 18 decimales. La frontera es EXACTA, no aproximada.
    const techoWei = MAX_UINT256;
    const escala = 10n ** BigInt(ETH_DECIMALS);
    const techoEth = `${techoWei / escala}.${(techoWei % escala).toString().padStart(ETH_DECIMALS, '0')}`;
    const check = validateAmount(techoEth, ETH_DECIMALS);
    expect(check.valid).toBe(true);
    expect(check.wei).toBe(techoWei.toString());
    expect(ethToWei(techoEth, ETH_DECIMALS)).toBe(techoWei);
    // Una cota de decimales MÁS permisiva no cambia el resultado: el valor sigue cabiendo.
    expect(ethToWei(techoEth, ETH_DECIMALS + 1)).toBe(techoWei);

    // Un solo wei por encima del techo ya no cabe en `uint256`.
    const porEncima = (techoWei + 1n).toString();
    expect(validateAmount(`${porEncima}.0`, 1).valid).toBe(false);
    expect(validateAmount(`${porEncima}.0`, 1).problem).toBe('overflow');
    expect(ethToWei(`${porEncima}.0`, 1)).toBeNull();
    // El cero se acepta como importe: la regla «positivo» es del formulario, no del tipo.
    expect(validateAmount('0').wei).toBe('0');
    expect(validateAmount('0.0000').wei).toBe('0');
  });

  it('un `maxDecimals` mayor que los 18 decimales de wei TRUNCA, no reescala la magnitud', () => {
    // DEFECTO MEDIDO Y CORREGIDO (fase 4): con `maxDecimals = 19` la fracción se conservaba entera
    // y `BigInt` la reinterpretaba 10 veces mayor. Magnitudes exactas de la frontera:
    //   0,0000000000000000009 ETH = 0,9 wei → 0 wei (antes devolvía 9)
    //   1,0000000000000000001 ETH = 1e18 + 0,1 wei → 1e18 wei (antes devolvía 1e18 + 1)
    //   0,9999999999999999999 ETH → 999999999999999999 wei (antes 9999999999999999999)
    expect(ethToWei('0.0000000000000000009', 19)).toBe(0n);
    expect(ethToWei('0.0000000000000000001', 19)).toBe(0n);
    expect(ethToWei('1.0000000000000000001', 19)).toBe(1_000_000_000_000_000_000n);
    expect(ethToWei('0.9999999999999999999', 19)).toBe(999_999_999_999_999_999n);
    expect(validateAmount('1.0000000000000000001', 19).wei).toBe('1000000000000000000');
    expect(validateAmount('0.9999999999999999999', 19).wei).toBe('999999999999999999');
    expect(validateAmount('0.0000000000000000009', 19).wei).toBe('0');
    // El truncado del exceso y el RECHAZO del exceso son reglas distintas: con `maxDecimals = 18`
    // una fracción de 19 dígitos se rechaza (no se trunca en silencio), y la misma magnitud
    // recortada a 18 dígitos da exactamente el mismo wei que con la cota de 19.
    expect(ethToWei('1.0000000000000000001', ETH_DECIMALS)).toBeNull();
    expect(ethToWei('1.0000000000000000001'.slice(0, -1), ETH_DECIMALS)).toBe(1_000_000_000_000_000_000n);
    expect(ethToWei('1.0000000000000000001', ETH_DECIMALS + 1)).toBe(1_000_000_000_000_000_000n);
    // Y por encima de `maxDecimals` se sigue rechazando (no hay truncado silencioso del exceso).
    expect(ethToWei('0.00000000000000000001', 19)).toBeNull();
    expect(validateAmount('0.00000000000000000001', 19).problem).toBe('decimals');
  });
});
