/**
 * `src/background/rpc/errors.spec.ts` — Catálogo cerrado de errores EIP-1193 (§3.1.7).
 *
 * Este spec NO transcribe los literales a mano: lee la tabla cerrada de
 * `diccionario_datos.md` §4.3 (25 filas «Código | Causa | Mensaje (español) | Acción sugerida»)
 * y la compara, fila a fila y en el mismo orden, con `ERROR_CATALOG` de `./errors`. Así, una
 * divergencia entre la implementación y el diccionario rompe la suite (ACU-05 / D-E / RNF-06).
 *
 * Normalización necesaria: el diccionario usa comillas latinas («»), negritas markdown y el
 * valor concreto del plazo («120 s»), mientras que `errors.ts` guarda el marcador
 * `<segundos>`. La comparación iguala marcadores y dígitos para exigir el mismo texto.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ERROR_BY_CODE,
  ERROR_CATALOG,
  ERROR_CODES,
  accountInUseByDappError,
  approvalWindowClosedError,
  broadcastInterruptedError,
  connectTimeoutError,
  createEip1193Error,
  createErrorFromCode,
  duplicateAccountError,
  duplicateApprovalIdError,
  estimateGasFailedError,
  hostPermissionDeniedError,
  insufficientFundsError,
  internalError,
  invalidAddressError,
  invalidMnemonicError,
  invalidNonceError,
  invalidPrivateKeyError,
  isEip1193Error,
  methodNotAllowedInContextError,
  payloadTooLargeError,
  rateLimitExceededError,
  resetBlockedError,
  rpcUnavailableError,
  storageQuotaExceededError,
  timeoutError,
  tooManyPendingRequestsError,
  unauthorizedOriginError,
  unsupportedMethodError,
  userRejectedError,
  chainNotRegisteredError,
} from './errors';

// ---------------------------------------------------------------------------
// Lectura y normalización de la tabla del diccionario
// ---------------------------------------------------------------------------

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const DICCIONARIO = resolve(SPEC_DIR, '..', '..', '..', 'RepoTecnico', 'diccionario_datos.md');

/** Una fila de la tabla de errores del diccionario, ya normalizada. */
interface FilaDiccionario {
  code: number;
  cause: string;
  message: string;
  action: string;
}

/** Quita el énfasis markdown, las comillas latinas y unifica marcadores y dígitos. */
const normalizar = (texto: string): string =>
  texto
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[«»]/g, '')
    .replace(/<[^>]+>/g, '@')
    .replace(/\d+/g, '@')
    .replace(/\s+/g, ' ')
    .trim();

/** Celdas de una fila de tabla markdown (descarta el vacío inicial y final). */
const celdas = (linea: string): string[] =>
  linea
    .split('|')
    .slice(1, -1)
    .map((celda) => celda.trim());

/** Extrae las 25 filas de la tabla cerrada de `diccionario_datos.md` §4.3. */
const leerTablaDelDiccionario = (): FilaDiccionario[] => {
  const lineas = readFileSync(DICCIONARIO, 'utf8').split(/\r?\n/);
  const cabecera = lineas.findIndex((linea) => /^\|\s*Código\s*\|\s*Causa\s*\|/.test(linea));
  if (cabecera < 0) throw new Error('[errors.spec] no se localizó la tabla de §4.3 en diccionario_datos.md');

  const filas: FilaDiccionario[] = [];
  for (let i = cabecera + 1; i < lineas.length; i += 1) {
    const linea = lineas[i] ?? '';
    if (!linea.trimStart().startsWith('|')) break;
    const partes = celdas(linea);
    if (partes.length < 4) continue;
    if (/^-{2,}/.test(partes[0] ?? '')) continue; // fila separadora del encabezado
    const codigo = Number.parseInt((partes[0] ?? '').replace(/[^0-9-]/g, ''), 10);
    if (Number.isNaN(codigo)) continue;
    // Algunas celdas añaden prosa tras el mensaje (p. ej. la fila del vencimiento): el
    // mensaje normativo es SIEMPRE el texto entre comillas latinas.
    const celdaMensaje = partes[2] ?? '';
    const entreComillas = /«([\s\S]*)»/.exec(celdaMensaje);
    filas.push({
      code: codigo,
      cause: partes[1] ?? '',
      message: normalizar(entreComillas?.[1] ?? celdaMensaje),
      action: normalizar(partes[3] ?? ''),
    });
  }
  return filas;
};

/** Nombres de causa esperados, en el MISMO orden que la tabla del diccionario. */
const CAUSAS_ESPERADAS = [
  'userRejected',
  'timeout',
  'approvalWindowClosed',
  'tooManyPendingRequests',
  'rateLimitExceeded',
  'hostPermissionDenied',
  'unauthorizedOrigin',
  'unsupportedMethod',
  'methodNotAllowedInContext',
  'rpcUnavailable',
  'chainNotRegistered',
  'invalidMnemonic',
  'invalidPrivateKey',
  'invalidAddress',
  'duplicateAccount',
  'payloadTooLarge',
  'insufficientFunds',
  'invalidNonce',
  'estimateGasFailed',
  'accountInUseByDapp',
  'resetBlocked',
  'internalError',
  'duplicateApprovalId',
  'storageQuotaExceeded',
  'broadcastInterrupted',
];

const FILAS_DICCIONARIO = leerTablaDelDiccionario();

// ---------------------------------------------------------------------------
// Transcripción exacta de la tabla
// ---------------------------------------------------------------------------

describe('Catálogo de errores contra `diccionario_datos.md` §4.3 (ACU-05 / RNF-06)', () => {
  it('lee las 25 filas de la tabla cerrada del diccionario', () => {
    expect(FILAS_DICCIONARIO).toHaveLength(25);
    expect(ERROR_CATALOG).toHaveLength(25);
  });

  it('reproduce código, mensaje y acción de cada fila, en el mismo orden', () => {
    const divergencias: string[] = [];
    for (let i = 0; i < FILAS_DICCIONARIO.length; i += 1) {
      const diccionario = FILAS_DICCIONARIO[i];
      const implementado = ERROR_CATALOG[i];
      if (diccionario === undefined || implementado === undefined) {
        divergencias.push(`fila ${i}: falta en alguna de las dos fuentes`);
        continue;
      }
      if (diccionario.code !== implementado.code) {
        divergencias.push(`fila ${i}: código ${diccionario.code} ≠ ${implementado.code}`);
      }
      if (diccionario.message !== normalizar(implementado.message)) {
        divergencias.push(
          `fila ${i} (${implementado.cause}): mensaje «${normalizar(implementado.message)}» ≠ «${diccionario.message}»`,
        );
      }
      if (diccionario.action !== normalizar(implementado.action)) {
        divergencias.push(
          `fila ${i} (${implementado.cause}): acción «${normalizar(implementado.action)}» ≠ «${diccionario.action}»`,
        );
      }
      expect(diccionario.message.endsWith('.')).toBe(true);
    }
    expect(divergencias, divergencias.join('\n')).toEqual([]);
  });

  it('clasifica cada fila con su causa en inglés, en el orden del diccionario', () => {
    expect(ERROR_CATALOG.map((fila) => fila.cause)).toEqual(CAUSAS_ESPERADAS);
    expect(new Set(CAUSAS_ESPERADAS).size).toBe(25);
    for (const fila of FILAS_DICCIONARIO) {
      expect(fila.cause.length).toBeGreaterThan(0);
    }
    // Anclas de orden: la causa documental de tres filas representativas.
    expect(FILAS_DICCIONARIO[0]?.cause).toMatch(/Rechazo explícito/);
    expect(FILAS_DICCIONARIO[6]?.cause).toMatch(/Origen sin sesión/);
    expect(FILAS_DICCIONARIO[21]?.cause).toMatch(/Fallo no clasificado/);
  });

  it('usa exactamente los 8 códigos EIP-1193 del catálogo', () => {
    expect([...ERROR_CODES]).toEqual([4001, 4100, 4200, 4900, 4901, -32602, -32000, -32603]);
    expect(Object.keys(ERROR_BY_CODE).map(Number).sort((a, b) => a - b)).toEqual(
      [...ERROR_CODES].sort((a, b) => a - b),
    );
    for (const fila of ERROR_CATALOG) {
      expect(Number.isInteger(fila.code)).toBe(true);
      expect(fila.message.length).toBeGreaterThan(0);
      expect(fila.action.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Constructores por causa
// ---------------------------------------------------------------------------

describe('Constructores por causa con los literales del diccionario', () => {
  it('4001: rechazo, vencimiento (120 s / 60 s), cierre de ventana, cardinalidad y tasa', () => {
    expect(userRejectedError()).toEqual({ code: 4001, message: 'Operación cancelada por el usuario.' });
    expect(timeoutError()).toEqual({
      code: 4001,
      message: 'El usuario no respondió en el plazo establecido (120 s); la solicitud ha caducado.',
    });
    expect(timeoutError(60).message).toContain('(60 s)');
    expect(connectTimeoutError().message).toContain('(60 s)');
    expect(approvalWindowClosedError().message).toBe(
      'La ventana de confirmación se cerró sin respuesta; la solicitud se ha cancelado.',
    );
    expect(tooManyPendingRequestsError().code).toBe(4001);
    expect(rateLimitExceededError().message).toBe(
      'Se ha superado el límite de llamadas para este origen; espera unos segundos y reintenta.',
    );
  });

  it('4001: permiso de host denegado, con el `<rpcUrl>` sustituido', () => {
    const error = hostPermissionDeniedError('http://127.0.0.1:8546');
    expect(error.code).toBe(4001);
    expect(error.message).toBe(
      'No se concedió el permiso de acceso a http://127.0.0.1:8546; la red no se ha añadido.',
    );
    expect(error.message).not.toContain('<rpcUrl>');
  });

  it('4100: origen sin sesión autorizada', () => {
    expect(unauthorizedOriginError()).toEqual({
      code: 4100,
      message: 'Esta dApp no tiene permiso para usar la cartera.',
    });
  });

  it('4200: método fuera del catálogo y método interno en contexto no permitido', () => {
    expect(unsupportedMethodError().message).toBe(
      'El método solicitado no está soportado por TrueKeate Wallet.',
    );
    expect(methodNotAllowedInContextError().message).toBe(
      'El método solicitado no está permitido en este contexto.',
    );
  });

  it('4900 y 4901: RPC local caído y red no dada de alta', () => {
    expect(rpcUnavailableError()).toEqual({
      code: 4900,
      message: 'Sin conexión con la red local (Anvil).',
    });
    expect(chainNotRegisteredError().message).toBe('La red solicitada no está dada de alta.');
  });

  it('-32602: validaciones de entrada', () => {
    expect(invalidMnemonicError().code).toBe(-32602);
    expect(invalidPrivateKeyError().code).toBe(-32602);
    expect(invalidAddressError().code).toBe(-32602);
    expect(duplicateAccountError().message).toBe('Esa cuenta ya está en la cartera.');
    expect(payloadTooLargeError().message).toBe(
      'La carga útil de la solicitud supera el límite de 64 KiB.',
    );
  });

  it('-32000: saldo, nonce, estimateGas, cuenta en uso y reset bloqueado', () => {
    expect(insufficientFundsError().code).toBe(-32000);
    expect(invalidNonceError().message).toBe('La red rechazó la transacción: nonce inválido.');
    expect(estimateGasFailedError('execution reverted').message).toBe(
      'La estimación de gas falló: execution reverted. El envío se ha bloqueado.',
    );
    expect(accountInUseByDappError('http://localhost:5174').message).toContain(
      'La cuenta está en uso por la dApp http://localhost:5174',
    );
    expect(resetBlockedError(3).message).toContain('quedan 3 solicitudes pendientes');
  });

  it('-32603: fallo interno, id duplicado, cuota y difusión interrumpida', () => {
    expect(internalError()).toEqual({ code: -32603, message: 'Error interno de la cartera.' });
    expect(duplicateApprovalIdError().message).toBe('Ya existe una solicitud con ese identificador.');
    expect(storageQuotaExceededError().message).toBe(
      'No hay espacio de almacenamiento en la extensión: la operación no se ha guardado.',
    );
    expect(broadcastInterruptedError().code).toBe(-32603);
  });

  it('omite `data` cuando no se aporta y lo adjunta cuando existe', () => {
    expect(userRejectedError()).not.toHaveProperty('data');
    expect(userRejectedError({ reason: 'test' }).data).toEqual({ reason: 'test' });
    expect(internalError({ detalle: 1 }).data).toEqual({ detalle: 1 });
  });
});

// ---------------------------------------------------------------------------
// Utilidades del módulo
// ---------------------------------------------------------------------------

describe('Utilidades de clasificación y validación', () => {
  it('`createErrorFromCode` devuelve un error del código pedido para los 8 códigos', () => {
    for (const code of ERROR_CODES) {
      const error = createErrorFromCode(code);
      expect(error.code).toBe(code);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('`createErrorFromCode` degrada a -32603 con un código desconocido', () => {
    expect(createErrorFromCode(1234)).toEqual({ code: -32603, message: 'Error interno de la cartera.' });
  });

  it('`createEip1193Error` siempre produce un objeto con `code` numérico (RNF-06)', () => {
    const error = createEip1193Error('timeout', { segundos: 120 });
    expect(typeof error.code).toBe('number');
    expect(error.code).toBe(4001);
    expect(isEip1193Error(error)).toBe(true);
    expect(isEip1193Error(new Error('Request timeout'))).toBe(false);
    expect(isEip1193Error({ message: 'sin código' })).toBe(false);
    expect(isEip1193Error(null)).toBe(false);
  });
});
