/**
 * M6 — `src/background/rpc/errors.ts`
 * Catálogo de códigos EIP-1193 y construcción de los objetos de error.
 *
 * FUENTE ÚNICA de los literales en español: `diccionario_datos.md` §4.3 (tabla cerrada
 * «Código | Causa | Mensaje | Acción sugerida»). Este módulo NO inventa ningún
 * mensaje: transcribe esa tabla y la expone como 8 códigos con una función por causa.
 *
 * §4.3 tiene, desde la v1.10, **tres bloques** dentro de la misma sección:
 * - la tabla cerrada del núcleo (**25 filas**), que se transcribe fila a fila en
 *   {@link ERROR_CATALOG} —es la que verifica `errors.spec.ts`—;
 * - el bloque «Causas añadidas en la v1.9 (H2)» (**7 filas**), que se transcribe en
 *   {@link EXTENDED_ERROR_CATALOG};
 * - el bloque «Causas añadidas en la v1.10 (H4)» (**2 filas**: `inflightTxInProgress` y
 *   `broadcastRejected`), que se transcribe en {@link H4_ERROR_CATALOG}.
 *
 * Todas las causas añadidas reutilizan códigos ya existentes (§4.3: «un mismo `code` admite
 * varios mensajes, uno por causa»), así que el catálogo sigue teniendo **8 códigos**.
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

/**
 * Causas AÑADIDAS en la v1.9 de `diccionario_datos.md` §4.3 (bloque «Causas añadidas en la
 * v1.9 (H2)»), en el MISMO orden que ese bloque. Las reportó el implementador de H2 como
 * huecos del catálogo: sin ellas, la UI y el SW tenían que inventar un literal o degradar
 * cualquier fallo a «Error interno de la cartera».
 *
 * Reutilizan códigos ya registrados, así que **no** añaden ningún código nuevo:
 * - `-32602` (material de entrada inválido): `unknownAccount`, `invalidAmount`, `invalidLabel`;
 * - `-32000` (conflicto de estado): `walletNotCreated`;
 * - `-32603` (fallo interno o de plataforma): `damagedWallet`, `clipboardFailure`,
 *   `migrationWriteFailed`.
 */
export const EXTENDED_ERROR_CATALOG = [
  {
    code: -32603,
    cause: 'damagedWallet',
    message:
      'La cartera guardada está dañada y no se puede usar: no se derivan cuentas nuevas desde ella.',
    action: 'Restaurar la cartera desde la frase de recuperación o resetearla',
  },
  {
    code: -32000,
    cause: 'walletNotCreated',
    message: 'Todavía no hay ninguna cartera: no se puede derivar ninguna cuenta.',
    action: 'Crear una cartera nueva o importar una frase de recuperación',
  },
  {
    code: -32602,
    cause: 'unknownAccount',
    message: 'La cuenta indicada no existe en la cartera.',
    action: 'Elegir una cuenta de la lista',
  },
  {
    code: -32602,
    cause: 'invalidAmount',
    message: 'El importe no es válido: usa un número decimal positivo con hasta 18 decimales.',
    action: 'Revisar el importe',
  },
  {
    code: -32602,
    cause: 'invalidLabel',
    message: 'La etiqueta no es válida: debe tener entre 1 y 32 caracteres.',
    action: 'Acortar o corregir la etiqueta',
  },
  {
    code: -32603,
    cause: 'clipboardFailure',
    message:
      'No se pudo usar el portapapeles: el valor no se ha copiado o no se ha podido borrar.',
    action:
      'Comprobar el permiso del portapapeles y reintentar; borrar el valor a mano si estaba copiado',
  },
  {
    code: -32603,
    cause: 'migrationWriteFailed',
    message:
      'No se pudo guardar la migración del esquema: los datos se han quedado sin actualizar.',
    action: 'Exportar los logs en JSON y reintentar; si persiste, resetear la cartera',
  },
] as const satisfies readonly ErrorDefinition[];

/**
 * Causas AÑADIDAS en la v1.10 de `diccionario_datos.md` §4.3 (bloque «Causas añadidas en la
 * v1.10 (H4)»), en el MISMO orden que ese bloque. Las reportaron los equipos de H4 como huecos
 * del catálogo: hasta ahora «difusión rechazada por el nodo» vivía en una constante local de
 * `rpc/txContract.ts` y «transacción en vuelo» se clasificaba como `tooManyPendingRequests`
 * (exceso de cardinalidad), que NO es su causa.
 *
 * Reutilizan códigos ya registrados, así que **no** añaden ningún código nuevo:
 * - `-32000` (conflicto de estado): `inflightTxInProgress` (2.ª aprobación de la misma cuenta con
 *   una marca `phase: 'signing'` vigente en `truekeate_inflight_tx`) y `broadcastRejected` (el
 *   nodo rechaza una transacción ya firmada: `already known`, `replacement transaction
 *   underpriced`, `intrinsic gas too low`, …).
 */
export const H4_ERROR_CATALOG = [
  {
    code: -32000,
    cause: 'inflightTxInProgress',
    message:
      'Ya hay una transacción de esta cuenta en vuelo; espera a que se difunda antes de firmar otra.',
    action: 'Esperar a que la transacción en vuelo se difunda y reintentar',
  },
  {
    code: -32000,
    cause: 'broadcastRejected',
    message: 'La red rechazó la transacción: <motivo>.',
    action: 'Revisar el motivo indicado y volver a intentarlo',
  },
] as const satisfies readonly ErrorDefinition[];

/**
 * TODAS las causas registradas: primero el núcleo (que conserva el orden de la tabla de §4.3),
 * después las añadidas en la v1.9 (H2) y por último las de la v1.10 (H4). Las resoluciones por
 * `cause` y por `code` usan esta lista, de modo que el primer registro de cada código sigue
 * siendo el del núcleo.
 */
export const ALL_ERROR_DEFINITIONS: readonly ErrorDefinition[] = [
  ...ERROR_CATALOG,
  ...EXTENDED_ERROR_CATALOG,
  ...H4_ERROR_CATALOG,
];

/** Códigos EIP-1193 del catálogo, sin repetición: son los 8 que usa la cartera. */
export type Eip1193ErrorCode = (typeof ERROR_CATALOG)[number]['code'];

/** Causas registradas: un `code` admite varios mensajes, uno por causa. */
export type Eip1193ErrorCause = (typeof ALL_ERROR_DEFINITIONS)[number]['cause'];

/** Fila concreta del catálogo, estrechada por su `cause`. */
export type ErrorDefinitionFor<C extends Eip1193ErrorCause> = Extract<
  (typeof ALL_ERROR_DEFINITIONS)[number],
  { cause: C }
>;

/**
 * Devuelve la fila del catálogo de una causa (fuente única de `code`, `message` y `action`).
 *
 * Es el punto de entrada para los módulos que necesitan el LITERAL sin construir el objeto de
 * error (H4/M7 lo usa para `broadcastRejected` en `rpc/txContract.ts`, en vez de mantener una
 * constante local que pudiera divergir de §4.3).
 */
export const errorDefinitionFor = <C extends Eip1193ErrorCause>(cause: C): ErrorDefinitionFor<C> => {
  const row = ALL_ERROR_DEFINITIONS.find((definition) => definition.cause === (cause as string));
  if (row === undefined) {
    // No puede ocurrir por tipos; el respaldo es el error interno del núcleo.
    const fallback = ERROR_CATALOG.find((definition) => definition.cause === 'internalError');
    if (fallback === undefined) {
      throw new Error('[truekeate] el catálogo de errores no tiene la fila `internalError`');
    }
    return fallback as ErrorDefinitionFor<C>;
  }
  return row as ErrorDefinitionFor<C>;
};

/** Códigos únicos, en orden de aparición. */
export const ERROR_CODES: readonly number[] = [...new Set(ERROR_CATALOG.map((row) => row.code))];

/** Índice `code → definición`, útil para pruebas y para el router. */
export const ERROR_BY_CODE: Readonly<Record<number, readonly ErrorDefinition[]>> =
  Object.freeze(
    ALL_ERROR_DEFINITIONS.reduce<Record<number, ErrorDefinition[]>>((acc, row) => {
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
  const definition: ErrorDefinition | undefined = ALL_ERROR_DEFINITIONS.find(
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
export const tooManyPendingRequestsError = (data?: unknown): Eip1193Error =>
  createEip1193Error('tooManyPendingRequests', {}, data);

/** `4001` — *token bucket* agotado en cualquier método del catálogo (ADT-24 / D-Q). */
export const rateLimitExceededError = (data?: unknown): Eip1193Error =>
  createEip1193Error('rateLimitExceeded', {}, data);

/** `4001` — permiso de host denegado al dar de alta una red (ACU-27 / D-G). */
export const hostPermissionDeniedError = (rpcUrl: string): Eip1193Error =>
  createEip1193Error('hostPermissionDenied', { rpcUrl });

/** `4100` — origen sin sesión autorizada o emisor no autorizado. */
export const unauthorizedOriginError = (data?: unknown): Eip1193Error =>
  createEip1193Error('unauthorizedOrigin', {}, data);

/** `4200` — método fuera del catálogo (es el caso de `eth_sign`). */
export const unsupportedMethodError = (): Eip1193Error => createEip1193Error('unsupportedMethod');

/** `4200` — método interno invocado desde un contexto no permitido. */
export const methodNotAllowedInContextError = (): Eip1193Error =>
  createEip1193Error('methodNotAllowedInContext');

/** `4900` — RPC local caído (RNF-07). `data` es solo diagnóstico (intentos y backoff). */
export const rpcUnavailableError = (data?: unknown): Eip1193Error =>
  createEip1193Error('rpcUnavailable', {}, data);

/**
 * `4901` — `chainId` no dado de alta **o distinto del activo**.
 *
 * `data` es solo diagnóstico (H4/M11: `{ reason: 'chain-id-mismatch', requested, active }`): el
 * mensaje y la acción siguen siendo los ÚNICOS de §4.3, porque un `chainId` que no es el activo es
 * exactamente «una red que no está dada de alta» para esta cartera.
 */
export const chainNotRegisteredError = (data?: unknown): Eip1193Error =>
  createEip1193Error('chainNotRegistered', {}, data);

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

// ---------------------------------------------------------------------------
// Helpers de las causas añadidas en la v1.9 de §4.3 (bloque «Causas añadidas en H2»)
// ---------------------------------------------------------------------------

/** `-32603` — la cartera persistida está dañada (RNF-22); no se deriva nada en silencio. */
export const damagedWalletError = (data?: unknown): Eip1193Error =>
  createEip1193Error('damagedWallet', {}, data);

/** `-32000` — no hay cartera (ni frase ni cuentas): no se puede derivar (RF-04). */
export const walletNotCreatedError = (data?: unknown): Eip1193Error =>
  createEip1193Error('walletNotCreated', {}, data);

/** `-32602` — la referencia de cuenta no existe en la cartera (RF-06). */
export const unknownAccountError = (data?: unknown): Eip1193Error =>
  createEip1193Error('unknownAccount', {}, data);

/** `-32602` — importe malformado o no positivo (RF-33, M60). */
export const invalidAmountError = (data?: unknown): Eip1193Error =>
  createEip1193Error('invalidAmount', {}, data);

/** `-32602` — etiqueta fuera de 1..32 caracteres (DEC-35 / ACU-06). */
export const invalidLabelError = (data?: unknown): Eip1193Error =>
  createEip1193Error('invalidLabel', {}, data);

/** `-32603` — el portapapeles no se pudo leer, escribir o limpiar (P-20 / §3.8 regla 5). */
export const clipboardFailureError = (data?: unknown): Eip1193Error =>
  createEip1193Error('clipboardFailure', {}, data);

/** `-32603` — la migración de esquema no se pudo escribir (M34 / §4.3). */
export const migrationWriteFailedError = (data?: unknown): Eip1193Error =>
  createEip1193Error('migrationWriteFailed', {}, data);

// ---------------------------------------------------------------------------
// Helpers de las causas añadidas en la v1.10 de §4.3 (bloque «Causas añadidas en H4»)
// ---------------------------------------------------------------------------

/**
 * `-32000` — la cuenta ya tiene una transacción EN VUELO y en fase `signing` (§2.12 regla 5).
 *
 * Sustituye a la clasificación anterior (`tooManyPendingRequests`, `4001`), que describía un
 * exceso de cardinalidad y no el conflicto real: la 2.ª aprobación de la misma cuenta no puede
 * firmar hasta que se libere la marca de `truekeate_inflight_tx`. `data` es solo diagnóstico
 * (`{ reason: 'inflight-signing', account, approvalId }`).
 */
export const inflightTxInProgressError = (data?: unknown): Eip1193Error =>
  createEip1193Error('inflightTxInProgress', {}, data);

/**
 * `-32000` — el nodo RECHAZÓ una transacción ya firmada (`eth_sendRawTransaction`), con un motivo
 * accionable distinto del nonce inválido y de la difusión interrumpida. El `data` conserva la
 * causa y el motivo, como hacía la constante local de M7 que esta función reemplaza.
 */
export const broadcastRejectedError = (
  motivo: string,
  data: unknown = { cause: 'broadcastRejected', motivo },
): Eip1193Error => createEip1193Error('broadcastRejected', { motivo }, data);
