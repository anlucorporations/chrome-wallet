/**
 * M6 — `src/background/rpc/errors.ts`
 * Catálogo de códigos EIP-1193 y construcción de los objetos de error.
 *
 * FUENTE ÚNICA de los literales en español: `diccionario_datos.md` §4.3 (tabla cerrada
 * «Código | Causa | Mensaje | Acción sugerida», 25 filas). Este módulo NO inventa ningún
 * mensaje: transcribe esa tabla y la expone como 8 códigos con una función por causa.
 *
 * Regla dura (ACU-05 / D-E, RNF-06): todo error que ve el usuario lleva `code` numérico.
 * Queda prohibido `new Error('Request timeout')` y cualquier error sin `code`.
 */

import type { Eip1193Error } from '../../shared/types';

// ---------------------------------------------------------------------------
// Tabla cerrada (diccionario_datos.md §4.3)
// ---------------------------------------------------------------------------

/** Fila de la tabla de errores: código, causa, mensaje literal y acción sugerida. */
export interface ErrorDefinition {
  code: number;
  cause: string;
  message: string;
  action: string;
}

/** Las 25 causas registradas, en el mismo orden que la tabla del diccionario. */
export const ERROR_CATALOG = [
  {
    code: 4001,
    cause: 'userRejected',
    message: 'Operación cancelada por el usuario.',
    action: 'Volver a solicitarla desde la dApp',
  },
  {
    code: 4001,
    cause: 'timeout',
    message:
      'El usuario no respondió en el plazo establecido (<segundos> s); la solicitud ha caducado.',
    action: 'Reintentar cuando el usuario esté disponible',
  },
  {
    code: 4001,
    cause: 'approvalWindowClosed',
    message:
      'La ventana de confirmación se cerró sin respuesta; la solicitud se ha cancelado.',
    action: 'Volver a solicitarla',
  },
  {
    code: 4001,
    cause: 'tooManyPendingRequests',
    message:
      'Hay demasiadas solicitudes pendientes para este origen; espera a que se resuelva la actual.',
    action: 'Esperar y reintentar',
  },
  {
    code: 4001,
    cause: 'rateLimitExceeded',
    message:
      'Se ha superado el límite de llamadas para este origen; espera unos segundos y reintenta.',
    action: 'Esperar unos segundos y reintentar',
  },
  {
    code: 4001,
    cause: 'hostPermissionDenied',
    message:
      'No se concedió el permiso de acceso a <rpcUrl>; la red no se ha añadido.',
    action: 'Repetir el alta y aceptar el permiso',
  },
  {
    code: 4100,
    cause: 'unauthorizedOrigin',
    message: 'Esta dApp no tiene permiso para usar la cartera.',
    action: 'Conectar con eth_requestAccounts',
  },
  {
    code: 4200,
    cause: 'unsupportedMethod',
    message: 'El método solicitado no está soportado por TrueKeate Wallet.',
    action: 'Usar personal_sign o eth_signTypedData_v4',
  },
  {
    code: 4200,
    cause: 'methodNotAllowedInContext',
    message: 'El método solicitado no está permitido en este contexto.',
    action: 'Invocarlo desde el popup',
  },
  {
    code: 4900,
    cause: 'rpcUnavailable',
    message: 'Sin conexión con la red local (Anvil).',
    action: 'Arrancar Anvil en 127.0.0.1:8545',
  },
  {
    code: 4901,
    cause: 'chainNotRegistered',
    message: 'La red solicitada no está dada de alta.',
    action: 'Darla de alta con wallet_addEthereumChain',
  },
  {
    code: -32602,
    cause: 'invalidMnemonic',
    message: 'La frase de recuperación no es válida: revisa las 12 palabras y su checksum.',
    action: 'Revisar la frase',
  },
  {
    code: -32602,
    cause: 'invalidPrivateKey',
    message:
      'La clave privada no es válida: debe ser `0x` + 64 caracteres hexadecimales de la curva secp256k1.',
    action: 'Revisar la clave',
  },
  {
    code: -32602,
    cause: 'invalidAddress',
    message:
      'La dirección no es válida: revisa el formato `0x` + 40 caracteres hexadecimales.',
    action: 'Revisar la dirección',
  },
  {
    code: -32602,
    cause: 'duplicateAccount',
    message: 'Esa cuenta ya está en la cartera.',
    action: 'Usar otra cuenta',
  },
  {
    code: -32602,
    cause: 'payloadTooLarge',
    message: 'La carga útil de la solicitud supera el límite de 64 KiB.',
    action: 'Reducir el tamaño del mensaje o del calldata',
  },
  {
    code: -32000,
    cause: 'insufficientFunds',
    message: 'Saldo insuficiente para cubrir el valor y la comisión estimada.',
    action: 'Reducir el importe o recargar la cuenta',
  },
  {
    code: -32000,
    cause: 'invalidNonce',
    message: 'La red rechazó la transacción: nonce inválido.',
    action: 'Reintentar (el SW recalcula el nonce al firmar)',
  },
  {
    code: -32000,
    cause: 'estimateGasFailed',
    message: 'La estimación de gas falló: <motivo>. El envío se ha bloqueado.',
    action: 'Corregir la llamada',
  },
  {
    code: -32000,
    cause: 'accountInUseByDapp',
    message:
      'La cuenta está en uso por la dApp <origen>: revoca ese permiso antes de revelar su clave privada o eliminarla.',
    action: 'Revocar la sesión de esa dApp en «Sitios conectados» y reintentar',
  },
  {
    code: -32000,
    cause: 'resetBlocked',
    message:
      'No se puede resetear la cartera: quedan <n> solicitudes pendientes o una transacción en vuelo. Resuélvelas (aprueba o rechaza) o espera a que expiren.',
    action:
      'Resolver la cola (aprobar o rechazar cada solicitud) o esperar al vencimiento del plazo y reintentar',
  },
  {
    code: -32603,
    cause: 'internalError',
    message: 'Error interno de la cartera.',
    action: 'Exportar los logs en JSON y reportarlo',
  },
  {
    code: -32603,
    cause: 'duplicateApprovalId',
    message: 'Ya existe una solicitud con ese identificador.',
    action: 'Regenerar la solicitud',
  },
  {
    code: -32603,
    cause: 'storageQuotaExceeded',
    message: 'No hay espacio de almacenamiento en la extensión: la operación no se ha guardado.',
    action: 'Exportar y borrar los logs (RF-32)',
  },
  {
    code: -32603,
    cause: 'broadcastInterrupted',
    message:
      'La difusión de la transacción se interrumpió; verifica su estado en el nodo antes de reintentar.',
    action: 'Comprobar el nonce/hash en Anvil y reintentar',
  },
] as const satisfies readonly ErrorDefinition[];

/** Códigos EIP-1193 del catálogo, sin repetición: son los 8 que usa la cartera. */
export type Eip1193ErrorCode = (typeof ERROR_CATALOG)[number]['code'];

/** Causas registradas: un `code` admite varios mensajes, uno por causa. */
export type Eip1193ErrorCause = (typeof ERROR_CATALOG)[number]['cause'];

/** Fila concreta del catálogo, estrechada por su `cause`. */
export type ErrorDefinitionFor<C extends Eip1193ErrorCause> = Extract<
  (typeof ERROR_CATALOG)[number],
  { cause: C }
>;

/** Códigos únicos, en orden de aparición. */
export const ERROR_CODES: readonly number[] = [...new Set(ERROR_CATALOG.map((row) => row.code))];

/** Índice `code → definición`, útil para pruebas y para el router. */
export const ERROR_BY_CODE: Readonly<Record<number, readonly ErrorDefinition[]>> =
  Object.freeze(
    ERROR_CATALOG.reduce<Record<number, ErrorDefinition[]>>((acc, row) => {
      const bucket = acc[row.code] ?? [];
      bucket.push(row);
      acc[row.code] = bucket;
      return acc;
    }, {}),
  );

// ---------------------------------------------------------------------------
// Construcción de errores
// ---------------------------------------------------------------------------

/** Valores para los marcadores de los mensajes por causa. */
export interface ErrorMessageArgs {
  /** Segundos del plazo vencido: 120 en firma/aprobación, 60 en conexión. */
  segundos?: number;
  /** `rpcUrl` de la red cuyo permiso de host se denegó. */
  rpcUrl?: string;
  /** Origen de la dApp que tiene la cuenta en uso. */
  origen?: string;
  /** Número de solicitudes `pending` que bloquean el reset. */
  n?: number;
  /** Motivo del fallo de `estimateGas`. */
  motivo?: string;
}

/** Sustituye los marcadores `<x>` del mensaje por sus valores. */
const fillMessage = (message: string, args: ErrorMessageArgs): string => {
  let filled = message;
  if (args.segundos !== undefined) {
    filled = filled.replace('<segundos>', String(args.segundos));
  }
  if (args.rpcUrl !== undefined) {
    filled = filled.replace('<rpcUrl>', args.rpcUrl);
  }
  if (args.origen !== undefined) {
    filled = filled.replace('<origen>', args.origen);
  }
  if (args.n !== undefined) {
    filled = filled.replace('<n>', String(args.n));
  }
  if (args.motivo !== undefined) {
    filled = filled.replace('<motivo>', args.motivo);
  }
  return filled;
};

/**
 * Construye el objeto EIP-1193 de una causa concreta: `{ code, message, data? }`.
 * `data` se omite cuando no se aporta, para no ensuciar la traza persistida.
 */
export const createEip1193Error = <C extends Eip1193ErrorCause>(
  cause: C,
  args: ErrorMessageArgs = {},
  data?: unknown,
): Eip1193Error => {
  // Comparación por cadena para no estrechar el genérico (un `type predicate` con `C` no
  // es asignable al parámetro de `Array.prototype.find`).
  const definition: ErrorDefinition | undefined = ERROR_CATALOG.find(
    (row) => row.cause === (cause as Eip1193ErrorCause),
  );
  if (definition === undefined) {
    // Causa fuera del catálogo: no puede ocurrir por tipos; degrada al error interno.
    const fallback: ErrorDefinition | undefined = ERROR_CATALOG.find(
      (row) => row.cause === 'internalError',
    );
    return {
      code: fallback?.code ?? -32603,
      message: fallback?.message ?? 'Error interno de la cartera.',
    };
  }
  const error: Eip1193Error = {
    code: definition.code,
    message: fillMessage(definition.message, args),
  };
  if (data !== undefined) {
    error.data = data;
  }
  return error;
};

/**
 * Error genérico por código. Se usa cuando el llamador solo conoce el `code`; la primera
 * causa registrada de ese código actúa como mensaje por defecto.
 */
export const createErrorFromCode = (
  code: number,
  args: ErrorMessageArgs = {},
  data?: unknown,
): Eip1193Error => {
  const rows = ERROR_BY_CODE[code];
  if (rows === undefined || rows.length === 0) {
    return createEip1193Error('internalError', args, data);
  }
  const firstRow = rows[0];
  return firstRow === undefined
    ? createEip1193Error('internalError', args, data)
    : createEip1193Error(firstRow.cause as Eip1193ErrorCause, args, data);
};

/** Comprueba, sin `any`, si un valor es un error EIP-1193 bien formado. */
export const isEip1193Error = (value: unknown): value is Eip1193Error => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'number' && typeof candidate.message === 'string';
};

// ---------------------------------------------------------------------------
// Un helper por causa (mismos literales, misma fuente)
// ---------------------------------------------------------------------------

/** `4001` — rechazo explícito del usuario. */
export const userRejectedError = (data?: unknown): Eip1193Error =>
  createEip1193Error('userRejected', {}, data);

/**
 * `4001` — vencimiento del plazo. `segundos` vale 120 en firma/aprobación y 60 en
 * conexión (RF-40); por defecto se usa el plazo de firma.
 */
export const timeoutError = (segundos: number = 120): Eip1193Error =>
  createEip1193Error('timeout', { segundos });

/** `4001` — vencimiento del plazo de conexión (60 s). */
export const connectTimeoutError = (): Eip1193Error => createEip1193Error('timeout', { segundos: 60 });

/** `4001` — la ventana de confirmación se cerró sin decidir. */
export const approvalWindowClosedError = (): Eip1193Error =>
  createEip1193Error('approvalWindowClosed');

/** `4001` — exceso de cardinalidad o de tasa de solicitudes aprobables. */
export const tooManyPendingRequestsError = (): Eip1193Error =>
  createEip1193Error('tooManyPendingRequests');

/** `4001` — *token bucket* agotado en cualquier método del catálogo (ADT-24 / D-Q). */
export const rateLimitExceededError = (): Eip1193Error => createEip1193Error('rateLimitExceeded');

/** `4001` — permiso de host denegado al dar de alta una red (ACU-27 / D-G). */
export const hostPermissionDeniedError = (rpcUrl: string): Eip1193Error =>
  createEip1193Error('hostPermissionDenied', { rpcUrl });

/** `4100` — origen sin sesión autorizada o emisor no autorizado. */
export const unauthorizedOriginError = (): Eip1193Error => createEip1193Error('unauthorizedOrigin');

/** `4200` — método fuera del catálogo (es el caso de `eth_sign`). */
export const unsupportedMethodError = (): Eip1193Error => createEip1193Error('unsupportedMethod');

/** `4200` — método interno invocado desde un contexto no permitido. */
export const methodNotAllowedInContextError = (): Eip1193Error =>
  createEip1193Error('methodNotAllowedInContext');

/** `4900` — RPC local caído (RNF-07). */
export const rpcUnavailableError = (): Eip1193Error => createEip1193Error('rpcUnavailable');

/** `4901` — `chainId` no dado de alta. */
export const chainNotRegisteredError = (): Eip1193Error => createEip1193Error('chainNotRegistered');

/** `-32602` — mnemonic inválido (número de palabras o checksum BIP-39). */
export const invalidMnemonicError = (): Eip1193Error => createEip1193Error('invalidMnemonic');

/** `-32602` — clave privada inválida. */
export const invalidPrivateKeyError = (): Eip1193Error => createEip1193Error('invalidPrivateKey');

/** `-32602` — dirección malformada (checksum EIP-55). */
export const invalidAddressError = (): Eip1193Error => createEip1193Error('invalidAddress');

/** `-32602` — la cuenta ya existe en la cartera. */
export const duplicateAccountError = (): Eip1193Error => createEip1193Error('duplicateAccount');

/** `-32602` — payload por encima de 64 KiB (ADT-21 / D-L). */
export const payloadTooLargeError = (): Eip1193Error => createEip1193Error('payloadTooLarge');

/** `-32000` — saldo insuficiente para valor + comisión. */
export const insufficientFundsError = (): Eip1193Error => createEip1193Error('insufficientFunds');

/** `-32000` — nonce inválido rechazado por el nodo. */
export const invalidNonceError = (): Eip1193Error => createEip1193Error('invalidNonce');

/** `-32000` — `estimateGas` fallido o revert previo a firmar. */
export const estimateGasFailedError = (motivo: string): Eip1193Error =>
  createEip1193Error('estimateGasFailed', { motivo });

/** `-32000` — cuenta en uso por una dApp conectada (R-09a / DEC-45). */
export const accountInUseByDappError = (origen: string): Eip1193Error =>
  createEip1193Error('accountInUseByDapp', { origen });

/** `-32000` — reset bloqueado por cola pendiente o transacción en vuelo (R-09b / DEC-46). */
export const resetBlockedError = (n: number): Eip1193Error =>
  createEip1193Error('resetBlocked', { n });

/** `-32603` — fallo no clasificado del Service Worker. */
export const internalError = (data?: unknown): Eip1193Error =>
  createEip1193Error('internalError', {}, data);

/** `-32603` — identificador duplicado en la cola. */
export const duplicateApprovalIdError = (): Eip1193Error =>
  createEip1193Error('duplicateApprovalId');

/** `-32603` — cuota de `chrome.storage.local` agotada (ADT-14 / D-M). */
export const storageQuotaExceededError = (): Eip1193Error =>
  createEip1193Error('storageQuotaExceeded');

/** `-32603` — difusión interrumpida por suspensión del SW (ADT-23 / D-R). */
export const broadcastInterruptedError = (data?: unknown): Eip1193Error =>
  createEip1193Error('broadcastInterrupted', {}, data);
