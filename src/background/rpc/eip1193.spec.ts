/**
 * `src/background/rpc/eip1193.spec.ts` — Los 8 códigos EIP-1193 con sus literales (§3.3.7).
 *
 * `CA-RF-14` / `CA-RF-45`: todo error que ve la página es un objeto EIP-1193 con `code` numérico y
 * mensaje en español tomado de `diccionario_datos.md` §4.3; **ningún** método devuelve un `Error`
 * sin `code` (ACU-05 / RNF-06).
 *
 * Este spec fija la lista CERRADA de códigos (8, ni uno más), su orden de aparición, el literal
 * por defecto de cada uno y que el objeto sobrevive a la clonación estructurada que exige
 * `window.postMessage` (§4.1). La transcripción fila a fila de la tabla del diccionario la cubre
 * `errors.spec.ts`; aquí se comprueba la cara observable de los 8 códigos.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_ERROR_DEFINITIONS,
  ERROR_CATALOG,
  ERROR_CODES,
  chainNotRegisteredError,
  createErrorFromCode,
  createEip1193Error,
  internalError,
  invalidMnemonicError,
  insufficientFundsError,
  isEip1193Error,
  methodNotAllowedInContextError,
  rateLimitExceededError,
  rpcUnavailableError,
  unauthorizedOriginError,
  unsupportedMethodError,
  userRejectedError,
} from './errors';

/** Los 8 códigos del catálogo, en el orden en que aparecen en §4.3. */
const CODIGOS_ESPERADOS = [4001, 4100, 4200, 4900, 4901, -32602, -32000, -32603] as const;

/** Literal por defecto de cada código (primera fila registrada de ese `code` en §4.3). */
const LITERALES_POR_CODIGO: Readonly<Record<number, string>> = {
  4001: 'Operación cancelada por el usuario.',
  4100: 'Esta dApp no tiene permiso para usar la cartera.',
  4200: 'El método solicitado no está soportado por TrueKeate Wallet.',
  4900: 'Sin conexión con la red local (Anvil).',
  4901: 'La red solicitada no está dada de alta.',
  '-32602': 'La frase de recuperación no es válida: revisa las 12 palabras y su checksum.',
  '-32000': 'Saldo insuficiente para cubrir el valor y la comisión estimada.',
  '-32603': 'Error interno de la cartera.',
};

describe('M6 · lista cerrada de 8 códigos EIP-1193 (CA-RF-14)', () => {
  it('declara EXACTAMENTE los 8 códigos de §4.3, sin repetición y en orden', () => {
    expect(ERROR_CODES).toHaveLength(8);
    expect([...ERROR_CODES]).toEqual([...CODIGOS_ESPERADOS]);
    expect(new Set(ERROR_CODES).size).toBe(8);
    // La tabla del diccionario NO se queda corta: 25 causas del núcleo + 7 de la v1.9 + 2 de la
    // v1.10 (§4.3.2, H4: `inflightTxInProgress` y `broadcastRejected`, ambas con `code: -32000`).
    expect(ERROR_CATALOG).toHaveLength(25);
    expect(ALL_ERROR_DEFINITIONS.length).toBe(ERROR_CATALOG.length + 9);
    // Un mismo `code` admite varias causas: por eso hay más causas que códigos.
    expect(new Set(ALL_ERROR_DEFINITIONS.map((fila) => fila.code)).size).toBe(8);
    expect(ALL_ERROR_DEFINITIONS.length).toBeGreaterThan(8);
  });

  it.each(CODIGOS_ESPERADOS)('el código %i produce su literal de §4.3 con `code` numérico', (code) => {
    const error = createErrorFromCode(code);
    expect(error.code).toBe(code);
    expect(typeof error.code).toBe('number');
    expect(error.message).toBe(LITERALES_POR_CODIGO[code]);
    expect(error.message.trim().length).toBeGreaterThan(0);
    expect(isEip1193Error(error)).toBe(true);
  });

  it('cada constructor del catálogo devuelve uno de los 8 códigos, nunca uno nuevo', () => {
    const construidos = [
      userRejectedError(),
      unauthorizedOriginError(),
      unsupportedMethodError(),
      methodNotAllowedInContextError(),
      rpcUnavailableError(),
      chainNotRegisteredError(),
      invalidMnemonicError(),
      insufficientFundsError(),
      internalError(),
      rateLimitExceededError(),
    ];
    for (const error of construidos) {
      expect(CODIGOS_ESPERADOS as readonly number[]).toContain(error.code);
      expect(isEip1193Error(error)).toBe(true);
    }
    // Los códigos concretos de la ruta de H3 (allowlist, RPC caído y tasa).
    expect(unsupportedMethodError().code).toBe(4200);
    expect(methodNotAllowedInContextError().code).toBe(4200);
    expect(unauthorizedOriginError().code).toBe(4100);
    expect(rpcUnavailableError().code).toBe(4900);
    expect(rateLimitExceededError().code).toBe(4001);
  });

  it('los errores sobreviven a la clonación estructurada de `postMessage` (§4.1)', () => {
    for (const code of CODIGOS_ESPERADOS) {
      const original = createErrorFromCode(code, {}, { reason: 'eip1193-spec' });
      const clon = structuredClone(original);
      expect(clon).toEqual(original);
      expect(clon.code).toBe(code);
      expect(clon.data).toEqual({ reason: 'eip1193-spec' });
    }
  });

  it('un código desconocido degrada al error interno en vez de inventar un literal', () => {
    const error = createErrorFromCode(1234);
    expect(error.code).toBe(-32603);
    expect(error.message).toBe('Error interno de la cartera.');
    // Y `data` se omite cuando no se aporta: la traza no se ensucia.
    expect(createErrorFromCode(4200)).not.toHaveProperty('data');
  });

  it('los marcadores `<x>` se sustituyen con la magnitud real, no se dejan sin rellenar', () => {
    const conDatos = createEip1193Error('accountInUseByDapp', { origen: 'http://localhost:5174' });
    expect(conDatos.code).toBe(-32000);
    expect(conDatos.message).toContain('http://localhost:5174');
    expect(conDatos.message).not.toContain('<origen>');

    const reset = createEip1193Error('resetBlocked', { n: 3 });
    expect(reset.message).toContain('3 solicitudes pendientes');
    expect(reset.message).not.toContain('<n>');
  });
});
