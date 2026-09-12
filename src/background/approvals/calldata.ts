/**
 * M66 — `src/background/approvals/calldata.ts`
 * Tabla **LOCAL Y CERRADA** de selectores: la ÚNICA fuente de decodificación del calldata
 * (`documento_tecnico.md` **§3.4.1** —D-K/ADT-08—, §3.4 regla 6; `diccionario_datos.md` §3.1 y
 * §3.7; `plan_desarrollo.md` §3.4.5 tarea 4.7).
 *
 * QUÉ GARANTIZA (es el oráculo anti-firma-ciega de R5)
 * 1. El conjunto de selectores reconocidos es **exactamente** el del cuadro de §3.4.1 y **no se
 *    amplía en runtime**: ninguna lista remota, ningún ABI descargado, ningún servicio de firmas
 *    (RT-03). La única criptografía que se usa es `keccak256` de `ethers.js` v6 para **verificar**
 *    que el selector literal coincide con su firma canónica.
 * 2. **Fuera de la tabla**: `functionName = null`, `decodedArgs = null`,
 *    `isUnrecognizedContractCall = true`. El aviso bloqueante lo compone M19 (`preview.ts`), no
 *    este módulo.
 * 3. `decodedArgs` se limita a **escalares y direcciones**: los `uint256`/`int256` se devuelven
 *    como **cadena decimal** (nunca `bigint`: el resultado se persiste en `chrome.storage.local` y
 *    `bigint` no es serializable), las direcciones con checksum EIP-55 y los `bytes` largos
 *    truncados a `0x1234…abcd`. **Nunca** se copian a `truekeate_logs` (§3.4.1 decisión (b)).
 * 4. `multicall(bytes[])` se decodifica **recursivamente** por esta misma tabla, para que una
 *    sub-llamada desconocida siga marcándose como no reconocida.
 *
 * La tabla es CÓDIGO PROPIO (no una dependencia) y `computeSelector` permite a `calldata.spec.ts`
 * recalcular cada selector y fallar si alguno difiere del literal versionado.
 */

import { AbiCoder, getAddress, getBytes, hexlify, keccak256, toUtf8Bytes } from 'ethers';
import { shortHex } from '../../shared/format';
import type { Hex } from '../../shared/types';

// ---------------------------------------------------------------------------
// Constantes de la tabla
// ---------------------------------------------------------------------------

/** Calldata vacío: transferencia simple de valor, sin función que decodificar (§3.4.1). */
export const EMPTY_CALLDATA = '0x' as const;

/** Longitud en caracteres de un selector (`0x` + 4 bytes). */
export const SELECTOR_LENGTH = 10 as const;

/** Máximo de 256 bits: `approve(spender, 2^256-1)` es la allowance ILIMITADA (H-11b). */
export const MAX_UINT256 = (1n << 256n) - 1n;

/** Alias normativo del valor que dispara el aviso de allowance ilimitada. */
export const UNLIMITED_ALLOWANCE = MAX_UINT256;

/** Marcador de `toLabel` cuando el destino no está etiquetado (§3.1). */
export const UNKNOWN_TO_LABEL = 'desconocido' as const;

/** Nombre del tipo del dominio EIP-712: se elimina de `types` antes de firmar. */
export const EIP712_DOMAIN_TYPE = 'EIP712Domain' as const;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Argumento de una firma canónica. */
export interface CalldataInput {
  name: string;
  type: string;
}

/**
 * Aviso ESTRUCTURAL detectado al decodificar. Este módulo no redacta los textos en español: M19
 * los convierte en `riskWarnings[]`, de modo que los literales viven en un único lugar.
 */
export type CalldataRiskFlag =
  /** `approve(spender, 2^256-1)`: allowance ilimitada. */
  | 'unlimited-allowance'
  /** `setApprovalForAll(operator, true)`: aprobación total de NFTs. */
  | 'approval-for-all'
  /** `permit(...)`: firma de permiso EIP-2612; hay que mostrar `spender`, `value` y `deadline`. */
  | 'permit'
  /** Selector fuera de la tabla local cerrada. */
  | 'unrecognized'
  /** El selector SÍ está en la tabla, pero los argumentos no se pudieron decodificar. */
  | 'decode-failed'
  /** Contiene sub-llamadas (`multicall`) y alguna es desconocida. */
  | 'multicall-with-unrecognized';

/** Entrada de la tabla cerrada. */
export interface SelectorEntry {
  /** Selector literal versionado: `0x` + 4 bytes. */
  selector: Hex;
  /** Firma canónica: `transfer(address,uint256)`. */
  signature: string;
  /** Nombre corto de la función: `transfer`. */
  name: string;
  /** Argumentos que decodifica, en orden. */
  inputs: readonly CalldataInput[];
}

/** Sub-llamada decodificada de un `multicall`. */
export interface DecodedSubCall {
  index: number;
  selector: Hex | null;
  functionName: string | null;
  decodedArgs: Record<string, unknown> | null;
  isUnrecognizedContractCall: boolean;
  riskFlags: CalldataRiskFlag[];
}

/** Resultado de decodificar un calldata. */
export interface DecodedCalldata {
  /** Primeros 4 bytes de `data`; `null` si no hay calldata o es más corto que un selector. */
  selector: Hex | null;
  /** Firma canónica de la tabla, o `null` fuera de ella. */
  functionName: string | null;
  /** Argumentos legibles con nombre, o `null` si no está en la tabla o falló la decodificación. */
  decodedArgs: Record<string, unknown> | null;
  /** `data !== '0x'` y el selector no pertenece a la tabla local cerrada. */
  isUnrecognizedContractCall: boolean;
  /** ¿Hay calldata (`data !== '0x'`)? */
  isContractCall: boolean;
  /** Avisos estructurales; los literales en español los pone M19. */
  riskFlags: CalldataRiskFlag[];
  /** Sub-llamadas de un `multicall` (vacío en el resto de casos). */
  subCalls: DecodedSubCall[];
}

// ---------------------------------------------------------------------------
// Tabla local cerrada (documento_tecnico.md §3.4.1)
// ---------------------------------------------------------------------------

/** Codificador ABI único del módulo: `ethers` v6, sin estado y sin red (RT-02/RT-03). */
const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * La tabla, en el MISMO orden del cuadro de §3.4.1. Es la fuente única: cualquier otro módulo
 * (M19, M7, la UI) consulta por aquí y **no** mantiene copias.
 */
export const SELECTOR_TABLE: readonly SelectorEntry[] = Object.freeze([
  {
    selector: '0xa9059cbb',
    signature: 'transfer(address,uint256)',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    selector: '0x23b872dd',
    signature: 'transferFrom(address,address,uint256)',
    name: 'transferFrom',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    selector: '0x095ea7b3',
    signature: 'approve(address,uint256)',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    selector: '0x39509351',
    signature: 'increaseAllowance(address,uint256)',
    name: 'increaseAllowance',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'addedValue', type: 'uint256' },
    ],
  },
  {
    selector: '0xa22cb465',
    signature: 'setApprovalForAll(address,bool)',
    name: 'setApprovalForAll',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
  },
  {
    selector: '0xd505accf',
    signature: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
    name: 'permit',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
  },
  {
    selector: '0xac9650d8',
    signature: 'multicall(bytes[])',
    name: 'multicall',
    inputs: [{ name: 'data', type: 'bytes[]' }],
  },
]);

/** Índice `selector → entrada`, con las claves en minúsculas. */
const SELECTOR_INDEX: Readonly<Record<string, SelectorEntry>> = Object.freeze(
  SELECTOR_TABLE.reduce<Record<string, SelectorEntry>>((acc, entry) => {
    acc[entry.selector.toLowerCase()] = entry;
    return acc;
  }, {}),
);

/** Selectores reconocidos, como lista (`SELECTOR_TABLE.length` = 7). */
export const KNOWN_SELECTORS: readonly Hex[] = Object.freeze(
  SELECTOR_TABLE.map((entry) => entry.selector),
);

/** Firmas canónicas reconocidas (`transfer(address,uint256)`, …). */
export const KNOWN_SIGNATURES: readonly string[] = Object.freeze(
  SELECTOR_TABLE.map((entry) => entry.signature),
);

// ---------------------------------------------------------------------------
// Selector: cálculo y consulta
// ---------------------------------------------------------------------------

/**
 * Recalcula el selector de una firma canónica: `keccak256(firma)[0..4]`.
 *
 * Es el instrumento con el que `calldata.spec.ts` comprueba que cada selector literal de
 * {@link SELECTOR_TABLE} coincide con su firma (§3.4.1 decisión (a)); el runtime NUNCA amplía la
 * tabla con este cálculo.
 */
export const computeSelector = (signature: string): Hex =>
  keccak256(toUtf8Bytes(signature)).slice(0, SELECTOR_LENGTH) as Hex;

/** Entrada de la tabla de un selector, o `undefined` si está fuera de la tabla cerrada. */
export const lookupSelector = (selector: unknown): SelectorEntry | undefined => {
  if (typeof selector !== 'string') {
    return undefined;
  }
  return SELECTOR_INDEX[selector.trim().toLowerCase()];
};

/** ¿Pertenece el selector a la tabla local cerrada? */
export const isKnownSelector = (selector: unknown): boolean => lookupSelector(selector) !== undefined;

/** Primeros 4 bytes de `data`, o `null` si no hay calldata o es más corto que un selector. */
export const selectorOf = (data: unknown): Hex | null => {
  if (typeof data !== 'string') {
    return null;
  }
  const text = data.trim();
  if (!text.startsWith('0x') || text.length < SELECTOR_LENGTH) {
    return null;
  }
  return text.slice(0, SELECTOR_LENGTH).toLowerCase() as Hex;
};

/** ¿Es `data` un calldata hexadecimal con forma válida (`0x` + hex de longitud par)? */
export const isHexData = (data: unknown): data is Hex =>
  typeof data === 'string' && /^0x([0-9a-fA-F]{2})*$/.test(data.trim());

// ---------------------------------------------------------------------------
// Formateo legible de argumentos
// ---------------------------------------------------------------------------

/**
 * Formatea un valor ABI como dato LEGIBLE y **serializable** (sin `bigint`):
 * - `address` → checksum EIP-55;
 * - `uint*`/`int*` → cadena decimal;
 * - `bool` → `boolean`;
 * - `bytesN` → hexadecimal tal cual; `bytes` largo → truncado a `0x1234…abcd`;
 * - arrays (`bytes[]`) → lista de valores formateados.
 */
export const formatDecodedValue = (type: string, value: unknown): unknown => {
  if (type === 'bool') {
    return value === true;
  }
  if (type.startsWith('uint') || type.startsWith('int')) {
    return typeof value === 'bigint' ? value.toString() : String(value);
  }
  if (type === 'address') {
    try {
      return getAddress(String(value));
    } catch {
      return String(value);
    }
  }
  if (type === 'bytes') {
    const text = String(value);
    return text.length > SELECTOR_LENGTH + 8 ? shortHex(text) : text;
  }
  if (type.endsWith(']')) {
    const list = Array.isArray(value) ? value : [];
    const inner = type.slice(0, type.lastIndexOf('['));
    return list.map((entry) => formatDecodedValue(inner, entry));
  }
  if (type.startsWith('bytes')) {
    return String(value);
  }
  return value;
};

/** Lista de tipos ABI de una entrada de la tabla. */
export const abiTypesOf = (entry: SelectorEntry): string[] => entry.inputs.map((input) => input.type);

/**
 * Decodifica los argumentos de un calldata ya reconocido. Lanza si el ABI no encaja.
 *
 * Devuelve los valores CRUDOS (necesarios para la recursión de `multicall`, que no puede
 * trabajar sobre el hexadecimal truncado) y los FORMATEADOS (los que se muestran y se persisten).
 */
const decodeArguments = (
  entry: SelectorEntry,
  data: string,
): { raw: readonly unknown[]; formatted: Record<string, unknown> } => {
  const body = `0x${data.trim().slice(SELECTOR_LENGTH)}` as Hex;
  const raw: readonly unknown[] = abiCoder.decode(abiTypesOf(entry), body);
  const formatted: Record<string, unknown> = {};
  entry.inputs.forEach((input, index) => {
    formatted[input.name] = formatDecodedValue(input.type, raw[index]);
  });
  return { raw, formatted };
};

/** ¿Aprueba el `approve`/`increaseAllowance` una allowance ILIMITADA? */
export const isUnlimitedAllowance = (amount: unknown): boolean => {
  if (typeof amount === 'bigint') {
    return amount >= MAX_UINT256;
  }
  if (typeof amount === 'string') {
    try {
      return BigInt(amount.trim()) >= MAX_UINT256;
    } catch {
      return false;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
// Decodificación
// ---------------------------------------------------------------------------

/** Avisos estructurales de una llamada ya decodificada. */
const riskFlagsFor = (
  entry: SelectorEntry,
  args: Record<string, unknown>,
  subCalls: readonly DecodedSubCall[],
): CalldataRiskFlag[] => {
  const flags: CalldataRiskFlag[] = [];
  if (entry.name === 'approve' && isUnlimitedAllowance(args.amount)) {
    flags.push('unlimited-allowance');
  }
  if (entry.name === 'increaseAllowance' && isUnlimitedAllowance(args.addedValue)) {
    flags.push('unlimited-allowance');
  }
  if (entry.name === 'setApprovalForAll' && args.approved === true) {
    flags.push('approval-for-all');
  }
  if (entry.name === 'permit') {
    flags.push('permit');
  }
  if (subCalls.some((call) => call.isUnrecognizedContractCall)) {
    flags.push('multicall-with-unrecognized');
  }
  return flags;
};

/**
 * Decodifica las sub-llamadas de `multicall(bytes[])` con ESTA misma tabla (recursión).
 *
 * Trabaja sobre los valores CRUDOS (`rawArgs[0]`), no sobre los formateados: el hexadecimal de
 * cada sub-llamada se muestra truncado, pero la recursión necesita el calldata íntegro.
 */
const decodeSubCalls = (entry: SelectorEntry, rawArgs: readonly unknown[]): DecodedSubCall[] => {
  if (entry.name !== 'multicall') {
    return [];
  }
  const calls = Array.isArray(rawArgs[0]) ? rawArgs[0] : [];
  return calls.map((call, index) => {
    const decoded = decodeCalldata(typeof call === 'string' ? call : EMPTY_CALLDATA);
    return {
      index,
      selector: decoded.selector,
      functionName: decoded.functionName,
      decodedArgs: decoded.decodedArgs,
      isUnrecognizedContractCall: decoded.isUnrecognizedContractCall,
      riskFlags: decoded.riskFlags,
    };
  });
};

/**
 * Decodifica un calldata con la tabla local cerrada.
 *
 * Contrato EXACTO de fallo (§3.4.1):
 * - `data` vacío (`0x`) → transferencia simple: `selector`, `functionName` y `decodedArgs` a
 *   `null`, `isUnrecognizedContractCall: false`;
 * - selector **fuera** de la tabla → `functionName = null`, `decodedArgs = null`,
 *   `isUnrecognizedContractCall: true` y aviso bloqueante a cargo de M19;
 * - selector **en** la tabla con argumentos que no encajan → se conserva `functionName` (la firma
 *   SÍ se reconoce) y `decodedArgs = null` con el aviso estructural `decode-failed`.
 */
export const decodeCalldata = (data: unknown): DecodedCalldata => {
  const empty: DecodedCalldata = {
    selector: null,
    functionName: null,
    decodedArgs: null,
    isUnrecognizedContractCall: false,
    isContractCall: false,
    riskFlags: [],
    subCalls: [],
  };
  if (typeof data !== 'string') {
    return empty;
  }
  const text = data.trim();
  if (text.length === 0 || text.toLowerCase() === EMPTY_CALLDATA) {
    return empty;
  }
  const selector = selectorOf(text);
  const entry = lookupSelector(selector);
  if (entry === undefined || selector === null) {
    return {
      ...empty,
      selector,
      isContractCall: true,
      isUnrecognizedContractCall: true,
      riskFlags: ['unrecognized'],
    };
  }
  // Con el selector reconocido, el resto del calldata debe ser hexadecimal de longitud par.
  if (!isHexData(text)) {
    return {
      ...empty,
      selector,
      functionName: entry.signature,
      isContractCall: true,
      riskFlags: ['decode-failed'],
    };
  }
  try {
    // Se fuerza la lectura de bytes para descartar longitudes imposibles antes del ABI.
    getBytes(text);
    const { raw, formatted } = decodeArguments(entry, text);
    const subCalls = decodeSubCalls(entry, raw);
    const args: Record<string, unknown> =
      entry.name === 'multicall'
        ? { ...formatted, count: subCalls.length, calls: subCalls }
        : formatted;
    return {
      selector,
      functionName: entry.signature,
      decodedArgs: args,
      isUnrecognizedContractCall: false,
      isContractCall: true,
      riskFlags: riskFlagsFor(entry, args, subCalls),
      subCalls,
    };
  } catch {
    return {
      ...empty,
      selector,
      functionName: entry.signature,
      isContractCall: true,
      riskFlags: ['decode-failed'],
    };
  }
};

/** Calldata normalizado a hexadecimal minúsculo, con `0x` (`0x` si no es válido). */
export const normalizeCalldata = (data: unknown): Hex => {
  if (typeof data !== 'string') {
    return EMPTY_CALLDATA;
  }
  const text = data.trim();
  if (!isHexData(text)) {
    return EMPTY_CALLDATA;
  }
  return hexlify(getBytes(text)).toLowerCase() as Hex;
};

/** Número de bytes de un calldata (`dataLength` de `TxPreview`, §3.1). */
export const calldataByteLength = (data: unknown): number => {
  const normalized = normalizeCalldata(data);
  return Math.floor((normalized.length - 2) / 2);
};
