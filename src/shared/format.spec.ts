// @vitest-environment node
/**
 * `src/shared/format.spec.ts` — Formato de datos de TODA la UI (M62; tarea 6.4 del plan §3.6.5;
 * `CA-RT-10` / RF-34).
 *
 * QUÉ FIJA
 * --------
 * 1. **ETH a 4 decimales** (`ETH_DISPLAY_DECIMALS`): `1,0000 ETH`. La coma es la de la UI en español
 *    y el truncado es hacia abajo (la UI no puede mostrar más saldo del que existe).
 * 2. **Direcciones `0x1234…abcd`**: prefijo de 6 caracteres, elipsis U+2026 (NO tres puntos) y
 *    sufijo de 4, con el valor completo disponible para el `title`.
 * 3. Marcas de tiempo en español determinista `dd/mm/aaaa hh:mm:ss`, sin depender del `Intl` del
 *    entorno (el popup, los logs y las pruebas deben pintar lo mismo).
 * 4. Ningún formato usa separador de millares ni notación científica: el valor tiene que poder
 *    copiarse sin ambigüedad.
 */

import { describe, expect, it } from 'vitest';

import { ETH_DECIMALS, ETH_DISPLAY_DECIMALS } from './constants';
import {
  formatAddress,
  formatEth,
  formatEthEs,
  formatEthWithSymbol,
  formatTimestamp,
  formatTxHash,
  formatWordCount,
  pluralize,
  shortHex,
} from './format';

/** 1 ETH en wei, sin redondear. */
const UN_ETH = 10n ** BigInt(ETH_DECIMALS);

describe('formatEth · 4 decimales con truncado', () => {
  it('el número de decimales es exactamente el declarado por el contrato (4)', () => {
    expect(ETH_DISPLAY_DECIMALS).toBe(4);
    expect(formatEth(UN_ETH)).toBe('1.0000');
    expect(formatEth(0n)).toBe('0.0000');
  });

  it('TRUNCA hacia abajo: nunca muestra más saldo del que existe', () => {
    // 1,00009 ETH → 1,0000 (no 1,0001): redondear al alza mostraría saldo inexistente.
    expect(formatEth(UN_ETH + 90_000_000_000_000n)).toBe('1.0000');
    // 0,00009 ETH → 0,0000.
    expect(formatEth(90_000_000_000_000n)).toBe('0.0000');
  });

  it('rellena con ceros a la derecha y admite importes enteros grandes sin millares', () => {
    expect(formatEth(100n * UN_ETH)).toBe('100.0000');
    expect(formatEth(1n)).toBe('0.0000');
  });

  it('los importes negativos conservan el signo (una resta no puede perder información)', () => {
    expect(formatEth(-UN_ETH)).toBe('-1.0000');
  });

  it('acepta el wei como cadena decimal (lo que devuelve el nodo por la UI)', () => {
    expect(formatEth(String(UN_ETH))).toBe('1.0000');
    expect(formatEth('  0  ')).toBe('0.0000');
  });

  it('admite un número de decimales distinto solo si se pide explícitamente', () => {
    expect(formatEth(UN_ETH, 6)).toBe('1.000000');
    expect(formatEth(UN_ETH, 0)).toBe('1');
  });
});

describe('formatEthEs y formatEthWithSymbol · la variante de la UI en español', () => {
  it('usa COMA decimal: el literal que exige el corpus es `1,0000 ETH`', () => {
    expect(formatEthEs(UN_ETH)).toBe('1,0000');
    expect(formatEthWithSymbol(UN_ETH)).toBe('1,0000 ETH');
  });

  it('el símbolo por defecto es ETH y se puede sustituir por el de la red activa', () => {
    expect(formatEthWithSymbol(UN_ETH, 'MATIC')).toBe('1,0000 MATIC');
    expect(formatEthWithSymbol(UN_ETH, 'ETH', 2)).toBe('1,00 ETH');
  });

  it('0 ETH se pinta con sus 4 decimales (nunca como cadena vacía ni como `0` a secas)', () => {
    expect(formatEthWithSymbol(0n)).toBe('0,0000 ETH');
  });
});

describe('shortHex y formatAddress · `0x1234…abcd`', () => {
  /** Dirección real de Anvil, cuenta 0 (el caso que ven los E2E). */
  const DIRECCION = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  it('recorta con prefijo de 6, elipsis U+2026 y sufijo de 4', () => {
    expect(formatAddress(DIRECCION)).toBe('0xf39F…2266');
    // El punto de código de la elipsis es U+2026, NO tres puntos suspensivos.
    expect(formatAddress(DIRECCION).charCodeAt(6)).toBe(0x2026);
    expect(formatAddress(DIRECCION)).toHaveLength(6 + 1 + 4);
  });

  it('una cadena MÁS CORTA que el recorte (o igual) se devuelve tal cual', () => {
    expect(formatAddress('0x1234')).toBe('0x1234');
    expect(formatAddress('0x123456')).toBe('0x123456');
    // Justo en el límite (6 + 4 = 10 caracteres) no hay nada que recortar.
    expect(formatAddress('0x12345678')).toBe('0x12345678');
    // Un carácter más ya se recorta.
    expect(formatAddress('0x123456789')).toBe('0x1234…6789');
  });

  it('el prefijo visible identifica la dirección: dos direcciones distintas no colisionan', () => {
    const otra = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    expect(formatAddress(DIRECCION)).not.toBe(formatAddress(otra));
    expect(formatAddress(DIRECCION).startsWith('0xf39F')).toBe(true);
    expect(formatAddress(otra).startsWith('0x7099')).toBe(true);
  });

  it('`formatTxHash` usa el MISMO criterio que una dirección', () => {
    const hash = `0x${'ab'.repeat(32)}`;
    expect(formatTxHash(hash)).toBe('0xabab…abab');
    expect(shortHex(hash, 10, 8)).toBe(`0xabababab…abababab`);
  });

  it('recorta espacios antes de medir (el dato viene de una entrada de texto)', () => {
    expect(shortHex(`  ${DIRECCION}  `)).toBe('0xf39F…2266');
  });
});

describe('formatTimestamp · español determinista `dd/mm/aaaa hh:mm:ss`', () => {
  it('pinta con dos dígitos en día, mes, hora, minuto y segundo', () => {
    const fecha = new Date(2026, 1, 9, 8, 5, 3);
    expect(formatTimestamp(fecha.getTime())).toBe('09/02/2026 08:05:03');
    expect(formatTimestamp(fecha.getTime())).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('devuelve cadena vacía con una marca de tiempo no finita (no inventa una fecha)', () => {
    expect(formatTimestamp(Number.NaN)).toBe('');
    expect(formatTimestamp(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('etiquetas de conteo · español y sin plurales inventados', () => {
  it('`formatWordCount` pinta `12/12 palabras`', () => {
    expect(formatWordCount(12, 12)).toBe('12/12');
    expect(formatWordCount(3, 12)).toBe('3/12');
  });

  it('`pluralize` concuerda en singular y en plural', () => {
    expect(pluralize(1, 'cuenta', 'cuentas')).toBe('1 cuenta');
    expect(pluralize(0, 'cuenta', 'cuentas')).toBe('0 cuentas');
    expect(pluralize(3, 'cuenta', 'cuentas')).toBe('3 cuentas');
  });
});
