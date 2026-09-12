/**
 * M39 (soporte) — `src/popup/popupErrors.ts`
 * Catálogo de los literales de error que ve el usuario en el popup.
 *
 * FUENTE ÚNICA: la tabla cerrada «Código | Causa | Mensaje | Acción sugerida» de
 * `diccionario_datos.md` §4.3 —las 25 filas del núcleo, el bloque «Causas añadidas en la v1.9
 * (H2)» y el bloque «Causas añadidas en la v1.10 (H4)» (§4.3.2: `inflightTxInProgress` y
 * `broadcastRejected`)—. Este módulo **transcribe** las causas que el popup puede encontrarse y
 * las expone como `PopupError` para pintarlas siempre con su `code` y su acción sugerida (ACU-05 /
 * RNF-06: ningún error sin `code`, ningún literal inventado).
 *
 * No sustituye a `src/background/rpc/errors.ts` (M6), que es el catálogo del Service Worker:
 * el popup no puede importar del SW (RNF-14 y frontera de módulos), así que replica la tabla
 * literalmente. Cualquier cambio de la tabla se aplica en los dos sitios.
 */

import type { Eip1193Error } from '../shared/types';

/** Una fila de la tabla de §4.3, ya lista para pintar. */
export interface PopupError {
  /** Código EIP-1193 obligatorio. */
  code: number;
  /** Mensaje literal de la tabla (español). */
  message: string;
  /** Acción sugerida literal de la tabla. */
  action: string;
  /** Detalle opcional para diagnóstico (nunca un secreto). */
  detail?: unknown;
}

/** Fila transcrita de `diccionario_datos.md` §4.3 por causa. */
const POPUP_ERRORS = {
  userRejected: {
    code: 4001,
    message: 'El usuario ha anulado la operación.',
    action: 'Volver a solicitarla desde la dApp',
  },
  invalidMnemonic: {
    code: -32602,
    message: 'La frase de recuperación no es válida: revisa las 12 palabras y su checksum.',
    action: 'Revisar la frase',
  },
  invalidPrivateKey: {
    code: -32602,
    message:
      'La clave privada no es válida: debe ser `0x` + 64 caracteres hexadecimales de la curva secp256k1.',
    action: 'Revisar la clave',
  },
  invalidAddress: {
    code: -32602,
    message: 'La dirección no es válida: revisa el formato `0x` + 40 caracteres hexadecimales.',
    action: 'Revisar la dirección',
  },
  duplicateAccount: {
    code: -32602,
    message: 'Esa cuenta ya está en la cartera.',
    action: 'Usar otra cuenta',
  },
  payloadTooLarge: {
    code: -32602,
    message: 'La carga útil de la solicitud supera el límite de 64 KiB.',
    action: 'Reducir el tamaño del mensaje o del calldata',
  },
  accountInUseByDapp: {
    code: -32000,
    message:
      'La cuenta está en uso por la dApp <origen>: revoca ese permiso antes de revelar su clave privada o eliminarla.',
    action: 'Revocar la sesión de esa dApp en «Sitios conectados» y reintentar',
  },
  resetBlocked: {
    code: -32000,
    message:
      'No se puede resetear la cartera: quedan <n> solicitudes pendientes o una transacción en vuelo. Resuélvelas (aprueba o rechaza) o espera a que expiren.',
    action:
      'Resolver la cola (aprobar o rechazar cada solicitud) o esperar al vencimiento del plazo y reintentar',
  },
  unsupportedMethod: {
    code: 4200,
    message: 'El método solicitado no está soportado por TrueKeate Wallet.',
    action: 'Usar personal_sign o eth_signTypedData_v4',
  },
  methodNotAllowedInContext: {
    code: 4200,
    message: 'El método solicitado no está permitido en este contexto.',
    action: 'Invocarlo desde el popup',
  },
  internalError: {
    code: -32603,
    message: 'Error interno de la cartera.',
    action: 'Exportar los logs en JSON y reportarlo',
  },
  rpcUnavailable: {
    code: 4900,
    message: 'Sin conexión con la red local (Anvil).',
    action: 'Arrancar Anvil en 127.0.0.1:8545',
  },
  invalidAmount: {
    code: -32602,
    message: 'El importe no es válido: usa un número decimal positivo con hasta 18 decimales.',
    action: 'Revisar el importe',
  },
  invalidLabel: {
    code: -32602,
    message: 'La etiqueta no es válida: debe tener entre 1 y 32 caracteres.',
    action: 'Acortar o corregir la etiqueta',
  },
  notImplemented: {
    code: 4200,
    message: 'El método solicitado no está permitido en este contexto.',
    action: 'Invocarlo desde el popup',
  },
  storageQuotaExceeded: {
    code: -32603,
    message: 'No hay espacio de almacenamiento en la extensión: la operación no se ha guardado.',
    action: 'Exportar y borrar los logs (RF-32)',
  },
  // --- Bloque «Causas añadidas en la v1.9 (H2)» de §4.3, transcrito literalmente ---
  damagedWallet: {
    code: -32603,
    message:
      'La cartera guardada está dañada y no se puede usar: no se derivan cuentas nuevas desde ella.',
    action: 'Restaurar la cartera desde la frase de recuperación o resetearla',
  },
  walletNotCreated: {
    code: -32000,
    message: 'Todavía no hay ninguna cartera: no se puede derivar ninguna cuenta.',
    action: 'Crear una cartera nueva o importar una frase de recuperación',
  },
  unknownAccount: {
    code: -32602,
    message: 'La cuenta indicada no existe en la cartera.',
    action: 'Elegir una cuenta de la lista',
  },
  clipboardFailure: {
    code: -32603,
    message:
      'No se pudo usar el portapapeles: el valor no se ha copiado o no se ha podido borrar.',
    action:
      'Comprobar el permiso del portapapeles y reintentar; borrar el valor a mano si estaba copiado',
  },
  migrationWriteFailed: {
    code: -32603,
    message:
      'No se pudo guardar la migración del esquema: los datos se han quedado sin actualizar.',
    action: 'Exportar los logs en JSON y reintentar; si persiste, resetear la cartera',
  },
  // --- Bloque «Causas añadidas en la v1.10 (H4)» de §4.3, transcrito literalmente ---
  // --- Bloque de red (H5): §4.3 (núcleo), §4.3.2 v1.11 y las filas de red de la tabla ---
  /**
   * Permiso de host denegado al dar de alta una red (§4.3, fila «`4001` | Permiso de host
   * denegado…», ACU-27 / D-G): la red **no** se persiste. La marca `<rpcUrl>` la rellena el SW.
   */
  hostPermissionDenied: {
    code: 4001,
    message: 'No se concedió el permiso de acceso a <rpcUrl>; la red no se ha añadido.',
    action: 'Repetir el alta y aceptar el permiso',
  },
  /** `4901` — `chainId` no dado de alta (§4.3): se resuelve dándola de alta. */
  chainNotRegistered: {
    code: 4901,
    message: 'La red solicitada no está dada de alta.',
    action: 'Darla de alta con wallet_addEthereumChain',
  },
  /** `-32602` — `rpcUrl` rechazado por la validación previa de §3.5 (v1.11 de §4.3). */
  invalidRpcUrl: {
    code: -32602,
    message:
      'La dirección del nodo no es válida: usa `https` o, solo para el RPC local, `http` en `127.0.0.1`/`localhost`.',
    action: 'Revisar el `rpcUrl` de la red y volver a darla de alta',
  },
  /** `-32602` — `chainId`, nombre o símbolo no utilizables (v1.11 de §4.3). */
  invalidNetworkDefinition: {
    code: -32602,
    message:
      'Los datos de la red no son válidos: revisa el `chainId`, el nombre y el símbolo de la moneda nativa.',
    action: 'Revisar los datos declarados por la dApp',
  },
  inflightTxInProgress: {
    code: -32000,
    message:
      'Ya hay una transacción de esta cuenta en vuelo; espera a que se difunda antes de firmar otra.',
    action: 'Esperar a que la transacción en vuelo se difunda y reintentar',
  },
  broadcastRejected: {
    code: -32000,
    message: 'La red rechazó la transacción: <motivo>.',
    action: 'Revisar el motivo indicado y volver a intentarlo',
  },
} as const satisfies Record<string, { code: number; message: string; action: string }>;

/** Causa del catálogo del popup. */
export type PopupErrorCause = keyof typeof POPUP_ERRORS;

/** Rellena los marcadores `<x>` de un mensaje con los valores disponibles. */
const fill = (message: string, values: Readonly<Record<string, string | number>>): string => {
  let filled = message;
  for (const [key, value] of Object.entries(values)) {
    filled = filled.split(`<${key}>`).join(String(value));
  }
  return filled;
};

/**
 * Construye el error del popup a partir de una causa del catálogo.
 *
 * @param cause Causa transcrita de §4.3.
 * @param values Valores de los marcadores (`n`, `origen`…).
 * @param detail Detalle opcional para diagnóstico.
 */
export const popupErrorOf = (
  cause: PopupErrorCause,
  values: Readonly<Record<string, string | number>> = {},
  detail?: unknown,
): PopupError => {
  const definition = POPUP_ERRORS[cause];
  const error: PopupError = {
    code: definition.code,
    message: fill(definition.message, values),
    action: definition.action,
  };
  if (detail !== undefined) {
    error.detail = detail;
  }
  return error;
};

/**
 * Prefijo literal de un mensaje de la tabla: todo lo anterior al primer marcador `<x>`.
 * Un mensaje ya rellenado por el SW empieza por ese prefijo (`-32000` admite varias causas y
 * `resetBlocked` se entrega con el número de pendientes ya sustituido).
 */
const messagePrefix = (message: string): string => {
  const marker = message.indexOf('<');
  return marker === -1 ? message : message.slice(0, marker);
};

/**
 * Adapta un error EIP-1193 recibido del SW al modelo del popup.
 *
 * El mensaje de la tabla es la fuente única, así que se conserva tal cual. La acción sugerida se
 * busca **primero por la plantilla del mensaje** (un mismo `code` admite varias causas y, desde
 * la v1.9, hay causas nuevas que comparten `-32602` y `-32603`) y solo después por `code`; si el
 * `code` no está entre los del catálogo del popup, se degrada a «Error interno de la cartera»
 * conservando el código original en el detalle (nunca se pinta un mensaje sin `code`).
 */
export const popupError = (error: Eip1193Error): PopupError => {
  const rows = Object.values(POPUP_ERRORS);
  const byTemplate = rows.find((row) => {
    const prefix = messagePrefix(row.message);
    return prefix.length > 0 && error.message.startsWith(prefix);
  });
  const known = byTemplate ?? rows.find((row) => row.code === error.code);
  return {
    code: error.code,
    message: error.message.length > 0 ? error.message : (known?.message ?? 'Error interno de la cartera.'),
    action: known?.action ?? POPUP_ERRORS.internalError.action,
    detail: error.data,
  };
};

/** Comprueba, sin `any`, si un valor es un error EIP-1193 bien formado. */
export const isEip1193Error = (value: unknown): value is Eip1193Error => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'number' && typeof candidate.message === 'string';
};

/** Error «reset bloqueado» con el número exacto de solicitudes pendientes (DEC-46). */
export const resetBlockedError = (n: number): PopupError =>
  popupErrorOf('resetBlocked', { n }, { reason: 'reset-blocked', pending: n });

/** Error «cuenta en uso por una dApp» nombrando el origen (R-09a / DEC-45). */
export const accountInUseError = (origen: string): PopupError =>
  popupErrorOf('accountInUseByDapp', { origen }, { reason: 'account-in-use', origen });
