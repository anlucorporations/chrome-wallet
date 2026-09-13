/**
 * M19 — `src/background/approvals/preview.ts`
 * Construcción de las **tres vistas previas** de la ventana única de confirmación y de sus
 * **avisos de riesgo** (`documento_tecnico.md` **§3.4** y su tabla de avisos obligatorios,
 * §3.4.1 decisión (c); `diccionario_datos.md` **§3.1** `TxPreview`, **§3.2** `TypedDataPreview`,
 * **§3.3** `PersonalSignPreview`; `plan_desarrollo.md` §3.4.5 tareas 4.7, 4.12 y 4.13).
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. **Nada se decodifica aquí**: `selector`, `functionName`, `decodedArgs` y
 *    `isUnrecognizedContractCall` vienen LITERALMENTE de M66 (`approvals/calldata.ts`). Fuera de la
 *    tabla local cerrada, `functionName = null` y el aviso «llamada a contrato no reconocida» es
 *    **bloqueante** (R5: la firma ciega invalida el hito).
 * 2. **`toLabel`**: nombre del destino si el llamador aporta su etiqueta local
 *    (`truekeate_settings.accountLabels` / catálogo local) y `"desconocido"` si no (§3.1).
 * 3. **`verifyingContractMismatch`** (redefinido en ADT-08/D-K, NO circular): `true` si el
 *    `verifyingContract` es la **dirección cero** o si `eth_getCode` devuelve `0x` (no hay
 *    contrato desplegado en la red activa). **Nunca** se compara con nada «declarado» por la
 *    propia dApp.
 * 4. **`domainChainMismatch`**: `true` si `domain.chainId ≠ chainId` activo → aviso destacado y
 *    exigencia de doble confirmación (§3.4, `CA-RF-20`).
 * 5. **`personal_sign` legible**: se decodifica el payload como UTF-8; si es hexadecimal y **no**
 *    es legible, `text = null`, `isHexPayload = true` y aviso «contenido no legible» con
 *    `byteLength` (`CA-RF-21`).
 * 6. **Los bytes nunca van a los logs**: las previews exponen `bytesHex`/`message` para la UI, pero
 *    lo único que se persiste en `truekeate_logs` es el hash y la longitud (M22, §2.11).
 * 7. **Redacción en reposo (ADT-21 / D-L)**: por encima de `PREVIEW_INLINE_MAX_BYTES = 4096` el
 *    texto de `personal_sign` se guarda como **extracto** (`truncated: true`) y el `message`
 *    EIP-712 pasa a `null` (`redacted: true`) conservando `messageHash` + `messageBytes`.
 */

import { getAddress, getBytes, hexlify, isBytesLike, isHexString } from 'ethers';
import { PREVIEW_INLINE_MAX_BYTES, TX_TYPE_EIP1559 } from '../../shared/constants';
import { formatEth } from '../../shared/format';
import type {
  Address,
  ChainIdHex,
  Hex,
  PersonalSignPreview,
  TxPreview,
  TypedDataDomain,
  TypedDataPreview,
} from '../../shared/types';
import { createEip1193Error } from '../rpc/errors';
import { hashValue } from '../security/redaction';
import { toBigIntOrNull, parseChainIdOrNull, type TypedDataTypes } from '../crypto/sign';
import {
  UNKNOWN_TO_LABEL,
  calldataByteLength,
  decodeCalldata,
  normalizeCalldata,
  type DecodedCalldata,
} from './calldata';

// ---------------------------------------------------------------------------
// Constantes y literales de aviso (fuente única de los textos en español de la vista previa)
// ---------------------------------------------------------------------------

export { UNKNOWN_TO_LABEL };

/** Etiqueta del destino cuando la transacción DESPLIEGA un contrato (`to === null`). */
export const CONTRACT_DEPLOYMENT_LABEL = 'Despliegue de contrato' as const;

/** Dirección cero: un `verifyingContract` así NO es un contrato (ADT-08 / D-K). */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/** Gas de una transferencia simple: respaldo cuando la estimación aún no se ha hecho. */
export const DEFAULT_GAS_LIMIT = 21_000n;

/** Literales de los avisos de riesgo de la vista previa (§3.4, tabla de avisos obligatorios). */
export const RISK_WARNINGS = {
  /** `approve`/`increaseAllowance` con `amount === 2^256-1`. */
  unlimitedAllowance:
    'Allowance ILIMITADA: el gastador podrá disponer de todos tus tokens de este contrato sin volver a pedir permiso.',
  /** `setApprovalForAll(operator, true)` (H-11b). */
  approvalForAll:
    'Aprobación TOTAL de tus NFTs: el operador podrá transferirlos todos sin volver a pedir permiso.',
  /** `permit` de EIP-2612: hay que mostrar `spender`, `value` y `deadline` en claro. */
  permit:
    'Firma de permiso (EIP-2612): revisa el gastador, el importe y la fecha límite antes de aprobar.',
  /** Selector fuera de la tabla local cerrada: aviso BLOQUEANTE (R5). */
  unrecognizedContract:
    'Llamada a contrato NO RECONOCIDA: el selector no está en la tabla local cerrada de TrueKeate. Verifica la operación antes de aprobar.',
  /** El selector está en la tabla, pero los argumentos no se decodifican. */
  undecodableArguments:
    'No se han podido decodificar los argumentos de la llamada con la tabla local de selectores.',
  /** `toLabel === 'desconocido'`: destino no etiquetado. */
  unknownDestination: 'Destino sin etiqueta: la dirección no está etiquetada en la cartera.',
  /** `to === null`: la transacción crea un contrato. */
  contractDeployment: 'Despliegue de contrato: esta transacción crea un contrato nuevo.',
  /** Una sub-llamada de `multicall` no se reconoce. */
  multicallWithUnrecognized:
    'El multicall contiene una sub-llamada NO RECONOCIDA: revisa cada llamada antes de aprobar.',
  /** Payload de `personal_sign` no legible como UTF-8. */
  unreadableContent:
    'Contenido no legible: el payload no es texto UTF-8; revisa los bytes antes de firmar.',
  /** Extracto por superar `PREVIEW_INLINE_MAX_BYTES`. */
  longMessage: 'Mensaje demasiado largo: se muestra su hash y su longitud.',
  /** `domain.chainId` distinto del activo. */
  domainChainMismatch:
    'El dominio EIP-712 declara OTRA red: su chainId no es el de la red activa. Doble confirmación obligatoria.',
  /** `verifyingContract` cero o sin código desplegado. */
  verifyingContractMismatch:
    'Contrato verificador NO válido: es la dirección cero o no hay contrato desplegado en la red activa.',
} as const;

/** Avisos que **bloquean** la aprobación (exigen doble confirmación explícita). */
export const BLOCKING_RISK_WARNINGS: readonly string[] = [
  RISK_WARNINGS.unrecognizedContract,
  RISK_WARNINGS.undecodableArguments,
  RISK_WARNINGS.multicallWithUnrecognized,
  RISK_WARNINGS.verifyingContractMismatch,
];

/** ¿Contiene la lista algún aviso BLOQUEANTE? (R5: la firma ciega invalida el hito). */
export const hasBlockingRiskWarning = (warnings: readonly string[]): boolean =>
  warnings.some((warning) => BLOCKING_RISK_WARNINGS.includes(warning));

// ---------------------------------------------------------------------------
// Parámetros de la dApp: extracción tolerante
// ---------------------------------------------------------------------------

/** ¿Es un objeto plano utilizable como registro? */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** ¿Tiene forma de dirección (`0x` + 40 hex)? */
const looksLikeAddress = (value: unknown): value is string =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value.trim());

/** Normaliza una dirección a su checksum EIP-55; `null` si no tiene forma de dirección. */
export const normalizeAddressOrNull = (value: unknown): Address | null => {
  if (!looksLikeAddress(value)) {
    return null;
  }
  try {
    return getAddress((value as string).trim()) as Address;
  } catch {
    return null;
  }
};

/** Objeto de transacción de `eth_sendTransaction` (`params[0]`, o los `params` mismos). */
export const pickTransactionRequest = (params: unknown): Record<string, unknown> => {
  if (Array.isArray(params)) {
    return isRecord(params[0]) ? params[0] : {};
  }
  return isRecord(params) ? params : {};
};

/** Dirección declarada en una llamada de firma: el primer parámetro con forma de dirección. */
export const pickSigningAddress = (params: unknown, fallback: Address | null = null): Address | null =>
  normalizeAddressOrNull(
    (Array.isArray(params) ? params : [params]).find((entry) => looksLikeAddress(entry)),
  ) ?? fallback;

/**
 * `typedData` de `eth_signTypedData_v4`: puede llegar como OBJETO o como cadena JSON, y el orden
 * de los parámetros varía entre dApps (`[address, typedData]` es el canónico).
 */
export const pickTypedData = (
  params: unknown,
): { typedData: Record<string, unknown> | null; address: Address | null } => {
  const list = Array.isArray(params) ? params : [params];
  const address = pickSigningAddress(list);
  for (const entry of list) {
    if (isRecord(entry)) {
      return { typedData: entry, address };
    }
    if (typeof entry === 'string' && entry.trim().startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(entry);
        if (isRecord(parsed)) {
          return { typedData: parsed, address };
        }
      } catch {
        // Cadena que no es JSON: se sigue buscando otro candidato.
      }
    }
  }
  return { typedData: null, address };
};

/**
 * Mensaje de `personal_sign`. Acepta los dos órdenes (`[mensaje, dirección]` y
 * `[dirección, mensaje]`) y devuelve el primer parámetro que **no** es una dirección.
 */
export const pickPersonalMessage = (params: unknown): string | Uint8Array => {
  const list = Array.isArray(params) ? params : [params];
  const candidate = list.find((entry) => typeof entry !== 'string' || !looksLikeAddress(entry));
  if (typeof candidate === 'string') {
    return candidate;
  }
  if (candidate instanceof Uint8Array) {
    return candidate;
  }
  // Un parámetro que no es ni texto ni bytes es una petición malformada: se firma el payload VACÍO
  // (determinista y visible en la vista previa) en lugar de entregar un objeto a la firma.
  return '';
};

// ---------------------------------------------------------------------------
// M19.a — `TxPreview`
// ---------------------------------------------------------------------------

/** Entrada de {@link buildTxPreview}. */
export interface TxPreviewInput {
  from: Address;
  /** `null` u omitido = despliegue de contrato. */
  to?: Address | null;
  value?: unknown;
  data?: unknown;
  gasLimit?: unknown;
  maxFeePerGas?: unknown;
  maxPriorityFeePerGas?: unknown;
  /** Respaldo para derivar comisiones cuando `getFeeData()` devuelve 0 (M11). */
  gasPrice?: unknown;
  nonceInformativo?: unknown;
  chainId: ChainIdHex;
  /** Saldo de `from` en wei; sin él, `insufficientFunds` queda en `false`. */
  balanceWei?: unknown;
  /** Etiqueta LOCAL del destino (catálogo de la cartera); ausente → `desconocido`. */
  toLabel?: string | null;
  /** Motivo del fallo de `estimateGas`: BLOQUEA el envío con `-32000` (§3.6). */
  estimationFailed?: { reason: string } | null;
}

/** Avisos de riesgo derivados de la estructura del calldata (M66) y del destino. */
const txRiskWarnings = (
  input: TxPreviewInput,
  decoded: DecodedCalldata,
  toLabel: string,
): string[] => {
  const warnings: string[] = [];
  if (decoded.isUnrecognizedContractCall) {
    warnings.push(RISK_WARNINGS.unrecognizedContract);
  }
  if (decoded.riskFlags.includes('decode-failed')) {
    warnings.push(RISK_WARNINGS.undecodableArguments);
  }
  if (decoded.riskFlags.includes('multicall-with-unrecognized')) {
    warnings.push(RISK_WARNINGS.multicallWithUnrecognized);
  }
  if (decoded.riskFlags.includes('unlimited-allowance')) {
    warnings.push(RISK_WARNINGS.unlimitedAllowance);
  }
  if (decoded.riskFlags.includes('approval-for-all')) {
    warnings.push(RISK_WARNINGS.approvalForAll);
  }
  if (decoded.riskFlags.includes('permit')) {
    warnings.push(RISK_WARNINGS.permit);
  }
  if (input.to === null || input.to === undefined) {
    warnings.push(RISK_WARNINGS.contractDeployment);
  } else if (toLabel === UNKNOWN_TO_LABEL) {
    warnings.push(RISK_WARNINGS.unknownDestination);
  }
  if (input.estimationFailed != null) {
    // Literal ÚNICO de §4.3: «La estimación de gas falló: <motivo>. El envío se ha bloqueado.»
    warnings.push(
      createEip1193Error('estimateGasFailed', { motivo: input.estimationFailed.reason }).message,
    );
  }
  return warnings;
};

/**
 * Construye la `TxPreview` (M19.a).
 *
 * Es **pura y síncrona**: la estimación de gas, el `nonce` y `getFeeData()` los aporta el
 * llamador (M7/M14) ya resueltos, de modo que la vista previa es determinista y verificable sin
 * red ni reloj.
 */
export const buildTxPreview = (input: TxPreviewInput): TxPreview => {
  const data: Hex = normalizeCalldata(input.data);
  const decoded = decodeCalldata(data);
  const to = input.to ?? null;
  const toLabel =
    input.toLabel != null && input.toLabel.length > 0
      ? input.toLabel
      : to === null
        ? CONTRACT_DEPLOYMENT_LABEL
        : UNKNOWN_TO_LABEL;

  const valueWei = toBigIntOrNull(input.value) ?? 0n;
  const estimationFailed = input.estimationFailed ?? null;
  const gasLimit =
    estimationFailed !== null ? 0n : (toBigIntOrNull(input.gasLimit) ?? DEFAULT_GAS_LIMIT);

  // Comisiones con el MISMO invariante que la firma de M11: ambas > 0.
  const maxFeePerGas = toBigIntOrNull(input.maxFeePerGas) ?? 0n;
  const maxPriorityFeePerGas = toBigIntOrNull(input.maxPriorityFeePerGas) ?? 0n;
  const gasPrice = toBigIntOrNull(input.gasPrice);
  const fallbackBase = gasPrice !== null && gasPrice > 0n ? gasPrice : maxFeePerGas;
  const effectiveMaxFee = maxFeePerGas > 0n ? maxFeePerGas : fallbackBase;
  const effectivePriority = maxPriorityFeePerGas > 0n ? maxPriorityFeePerGas : fallbackBase;

  const feeWei = gasLimit * effectiveMaxFee;
  const balance = toBigIntOrNull(input.balanceWei);
  const insufficientFunds = balance !== null && valueWei + feeWei > balance;

  const riskWarnings = txRiskWarnings(input, decoded, toLabel);
  if (insufficientFunds) {
    // Literal ÚNICO de §4.3: «Saldo insuficiente para cubrir el valor y la comisión estimada.»
    riskWarnings.push(createEip1193Error('insufficientFunds').message);
  }

  const nonce = toBigIntOrNull(input.nonceInformativo);
  const nonceInformativo = nonce !== null && nonce >= 0n ? Number(nonce) : 0;

  return {
    from: input.from,
    to,
    toLabel,
    valueWei: valueWei.toString(),
    valueEth: formatEth(valueWei),
    data,
    dataLength: calldataByteLength(data),
    isContractCall: data !== '0x',
    selector: decoded.selector,
    functionName: decoded.functionName,
    decodedArgs: decoded.decodedArgs,
    isUnrecognizedContractCall: decoded.isUnrecognizedContractCall,
    riskWarnings,
    gasLimit: gasLimit.toString(),
    estimationFailed,
    maxFeePerGas: effectiveMaxFee.toString(),
    maxPriorityFeePerGas: effectivePriority.toString(),
    estimatedFeeEth: formatEth(feeWei),
    nonceInformativo,
    txType: TX_TYPE_EIP1559,
    chainId: input.chainId,
    insufficientFunds,
  };
};

// ---------------------------------------------------------------------------
// M19.b — `TypedDataPreview` (EIP-712)
// ---------------------------------------------------------------------------

/** `TypedDataPreview` + los campos de redacción en reposo de §3.2/§3.9. */
export type TypedDataPreviewResult = TypedDataPreview & {
  /** `sha256:<hex>` de la serialización canónica del `message`; lo único que va a los logs. */
  messageHash: string;
  /** Tamaño en bytes UTF-8 de la serialización canónica del `message`. */
  messageBytes: number;
  /** `true` si `message` se sustituyó por el resumen por superar `PREVIEW_INLINE_MAX_BYTES`. */
  redacted: boolean;
};

/** Entrada de {@link buildTypedDataPreview}. */
export interface TypedDataPreviewInput {
  domain: TypedDataDomain;
  /** Tipos tal y como llegan de la dApp (con o sin `EIP712Domain`: se elimina siempre). */
  types: TypedDataTypes;
  message: Record<string, unknown>;
  primaryType?: string | null;
  /** Red ACTIVA de la cartera, para `domainChainMismatch`. */
  chainId: ChainIdHex | number;
}

/** Dependencias inyectables de la vista previa EIP-712. */
export interface TypedDataPreviewDeps {
  /**
   * `eth_getCode` de la red activa (M5). Sin él NO se afirma que el contrato no exista: la
   * comprobación queda en `false` en lugar de inventarse.
   */
  getCode?: (address: Address) => Promise<Hex>;
}

/**
 * `verifyingContractMismatch` (ADT-08 / D-K): `true` si el contrato verificador es la **dirección
 * cero** o si su código desplegado es `0x`. La comparación con un valor «declarado» por la dApp se
 * retiró por **circular e incomputable**.
 */
export const isVerifyingContractMismatch = (
  verifyingContract: Address | null,
  code: Hex | null,
): boolean => {
  if (verifyingContract === null) {
    // El dominio no declara contrato verificador: no hay dirección que comprobar.
    return false;
  }
  if (verifyingContract.toLowerCase() === ZERO_ADDRESS) {
    return true;
  }
  return code !== null && (code === '0x' || code === '0x0');
};

/** Serialización canónica del `message` (la misma que se hashea y se mide). */
export const canonicalMessageJson = (message: Record<string, unknown>): string | null => {
  try {
    return JSON.stringify(message, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
  } catch {
    return null;
  }
};

/** Tipos EIP-712 SIN `EIP712Domain` (el dominio no es un tipo firmable). */
export const stripDomainType = (types: TypedDataTypes): TypedDataTypes => {
  const clean: TypedDataTypes = {};
  for (const [name, fields] of Object.entries(types ?? {})) {
    if (name === 'EIP712Domain') {
      continue;
    }
    clean[name] = Array.isArray(fields)
      ? fields.map((field) => ({ name: field.name, type: field.type }))
      : [];
  }
  return clean;
};

/**
 * Construye la `TypedDataPreview` (M19.b).
 *
 * - Elimina `EIP712Domain` de `types` — §3.4.
 * - `domainChainMismatch`: `domain.chainId` presente y distinto del activo.
 * - `verifyingContractMismatch`: con `eth_getCode` inyectado; sin él queda en `false`.
 * - Redacción en reposo: `message` a `null` por encima de `PREVIEW_INLINE_MAX_BYTES`.
 */
export const buildTypedDataPreview = async (
  input: TypedDataPreviewInput,
  deps: TypedDataPreviewDeps = {},
): Promise<TypedDataPreviewResult> => {
  const cleanTypes = stripDomainType(input.types);
  const verifyingContract = normalizeAddressOrNull(input.domain?.verifyingContract);
  const domainChainId = input.domain?.chainId;
  // DEFECTO MEDIDO Y CORREGIDO (fase 4): la comparación usaba `toChainIdNumber` en AMBOS lados, y
  // esa función cae al `chainId` por defecto ante un valor ilegible. Con `domain.chainId` basura
  // (`'no-es-un-numero'`, `''`, `'0x'`) y la red por defecto activa (Anvil 31337) el resultado era
  // `31337 === 31337` → `domainChainMismatch: false`, así que NO se emitía el aviso destacado ni la
  // doble confirmación obligatoria de §3.4 aunque el dominio declarara una red que no se puede
  // verificar. Ahora un `chainId` declarado e ininterpretable cuenta como discrepancia (falla
  // seguro); «ausente» sigue sin ser discrepancia.
  const declaredChain = parseChainIdOrNull(domainChainId);
  const activeChain = parseChainIdOrNull(input.chainId);
  const domainChainMismatch =
    domainChainId !== undefined &&
    domainChainId !== null &&
    (declaredChain === null || activeChain === null || declaredChain !== activeChain);

  let code: Hex | null = null;
  if (verifyingContract !== null && deps.getCode !== undefined) {
    try {
      code = await deps.getCode(verifyingContract);
    } catch {
      // Nodo caído: la comprobación de despliegue NO se inventa (queda en `false`).
      code = null;
    }
  }
  const verifyingContractMismatch = isVerifyingContractMismatch(verifyingContract, code);

  const json = canonicalMessageJson(input.message ?? {});
  const messageBytes = json === null ? 0 : new TextEncoder().encode(json).length;
  const redacted = messageBytes > PREVIEW_INLINE_MAX_BYTES;
  const messageHash = hashValue(json ?? '');
  const primaryType =
    typeof input.primaryType === 'string' && input.primaryType.length > 0
      ? input.primaryType
      : (Object.keys(cleanTypes)[0] ?? '');

  return {
    domain: {
      ...(input.domain?.name !== undefined ? { name: input.domain.name } : {}),
      ...(input.domain?.version !== undefined ? { version: input.domain.version } : {}),
      ...(domainChainId !== undefined ? { chainId: domainChainId } : {}),
      ...(verifyingContract !== null ? { verifyingContract } : {}),
      ...(input.domain?.salt !== undefined ? { salt: input.domain.salt } : {}),
    },
    domainName: typeof input.domain?.name === 'string' ? input.domain.name : null,
    verifyingContract,
    types: cleanTypes,
    message: redacted ? null : (input.message ?? {}),
    primaryType,
    domainChainMismatch,
    verifyingContractMismatch,
    messageHash,
    messageBytes,
    redacted,
  };
};

/** Avisos de riesgo de una vista previa EIP-712 (§3.4, tabla de avisos obligatorios). */
export const typedDataRiskWarnings = (preview: TypedDataPreviewResult): string[] => {
  const warnings: string[] = [];
  if (preview.domainChainMismatch) {
    warnings.push(RISK_WARNINGS.domainChainMismatch);
  }
  if (preview.verifyingContractMismatch) {
    warnings.push(RISK_WARNINGS.verifyingContractMismatch);
  }
  if (preview.redacted) {
    warnings.push(RISK_WARNINGS.longMessage);
  }
  return warnings;
};

// ---------------------------------------------------------------------------
// M19.c — `PersonalSignPreview`
// ---------------------------------------------------------------------------

/** `PersonalSignPreview` + `payloadHash`/`truncated` de §3.3/§3.9. */
export type PersonalSignPreviewResult = PersonalSignPreview & {
  /** `sha256:<hex>` del payload COMPLETO; lo único que va a `truekeate_logs`. */
  payloadHash: string;
  /** `true` si `text` es un extracto por superar `PREVIEW_INLINE_MAX_BYTES`. */
  truncated: boolean;
};

/** Decodifica bytes como UTF-8 estricto; `null` si la secuencia no es válida. */
const decodeUtf8Strict = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** ¿Es un texto «legible» (sin caracteres de control raros ni reemplazos U+FFFD)? */
export const isReadableText = (text: string): boolean => {
  if (text.includes('\uFFFD')) {
    return false;
  }
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const allowedControl = code === 0x09 || code === 0x0a || code === 0x0d;
    if (code < 0x20 && !allowedControl) {
      return false;
    }
  }
  return true;
};

/**
 * Bytes del payload: hexadecimal → bytes; texto → UTF-8; `Uint8Array` → copia tal cual.
 *
 * El orden de las comprobaciones es ESTRICTO: primero la cadena (hexadecimal o texto) y solo
 * después los bytes. Comprobar `instanceof Uint8Array` lo primero es un error medido —el valor y
 * `hexlify` pueden venir de «reinos» distintos (jsdom frente a Node) y la comprobación falla,
 * devolviendo la CADENA a `hexlify`, que lanza `invalid BytesLike value`—. Para los bytes se usa
 * {@link isBytesLike} (que reconoce cualquier vista de `ArrayBuffer`), no `instanceof`.
 * Cualquier otro valor (ni texto ni bytes) se firma como payload VACÍO: determinista y visible.
 */
const payloadBytes = (payload: string | Uint8Array): Uint8Array => {
  if (typeof payload === 'string') {
    if (isHexString(payload)) {
      try {
        return getBytes(payload);
      } catch {
        return new TextEncoder().encode(payload);
      }
    }
    return new TextEncoder().encode(payload);
  }
  if (isBytesLike(payload)) {
    return getBytes(payload);
  }
  return new TextEncoder().encode('');
};

/** Trunca un texto a `maxBytes` bytes UTF-8 sin partir un carácter. */
const truncateToBytes = (text: string, maxBytes: number): string => {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) {
    return text;
  }
  let result = '';
  let used = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (used + size > maxBytes) {
      break;
    }
    result += character;
    used += size;
  }
  return result;
};

/**
 * Construye la `PersonalSignPreview` (M19.c).
 *
 * - Payload **hexadecimal legible como UTF-8** (`0x686f6c61` → `hola`): `text` es el texto y
 *   `isHexPayload = false`.
 * - Payload **hexadecimal NO legible**: `text = null`, `isHexPayload = true` → aviso «contenido
 *   no legible» con `byteLength` (`CA-RF-21`).
 * - Payload de texto plano: `text` tal cual, `isHexPayload = false`.
 * - `bytesHex` es el payload en hexadecimal **solo para la UI**: nunca se copia a los logs.
 */
export const buildPersonalSignPreview = (
  payload: string | Uint8Array,
): PersonalSignPreviewResult => {
  const bytes = payloadBytes(payload);
  // Copia al `Uint8Array` del reino de `ethers`: una vista creada por `TextEncoder` de otro reino
  // (jsdom) NO pasa la comprobación interna de `ethers` y `hexlify` lanzaría `invalid BytesLike
  // value`. La copia es determinista y de coste lineal (≤ 64 KiB por la cota de payload).
  const bytesHex = hexlify(Uint8Array.from(bytes)) as Hex;
  const byteLength = bytes.length;
  const payloadHash = hashValue(typeof payload === 'string' ? payload : bytesHex);

  const isHexInput = typeof payload === 'string' && isHexString(payload);
  const decoded = decodeUtf8Strict(bytes);
  const readable = decoded !== null && isReadableText(decoded);

  if (isHexInput && !readable) {
    return {
      text: null,
      isHexPayload: true,
      byteLength,
      bytesHex,
      payloadHash,
      truncated: false,
    };
  }

  const text = decoded ?? '';
  const truncated = new TextEncoder().encode(text).length > PREVIEW_INLINE_MAX_BYTES;
  return {
    text: truncated ? truncateToBytes(text, PREVIEW_INLINE_MAX_BYTES) : text,
    isHexPayload: false,
    byteLength,
    bytesHex,
    payloadHash,
    truncated,
  };
};

/** Aviso destacado de una firma de texto no legible (`CA-RF-21`); `[]` si el texto es legible. */
export const personalSignRiskWarnings = (preview: PersonalSignPreviewResult): string[] => {
  const warnings: string[] = [];
  if (preview.isHexPayload) {
    warnings.push(RISK_WARNINGS.unreadableContent);
  }
  if (preview.truncated) {
    warnings.push(RISK_WARNINGS.longMessage);
  }
  return warnings;
};

// ---------------------------------------------------------------------------
// Entrada única por método (la que consumirá la cola de aprobaciones)
// ---------------------------------------------------------------------------

/** Contexto común que la cola aporta a la construcción de la vista previa. */
export interface ApprovalPreviewContext {
  from: Address;
  chainId: ChainIdHex;
  balanceWei?: unknown;
  gasLimit?: unknown;
  maxFeePerGas?: unknown;
  maxPriorityFeePerGas?: unknown;
  gasPrice?: unknown;
  nonceInformativo?: unknown;
  toLabel?: string | null;
  estimationFailed?: { reason: string } | null;
}

/** Vista previa construida, discriminada por método. */
export type ApprovalPreview =
  | { kind: 'tx'; txPreview: TxPreview }
  | { kind: 'typedData'; typedDataPreview: TypedDataPreviewResult }
  | { kind: 'personalSign'; signMessagePreview: PersonalSignPreviewResult };

/**
 * Construye la vista previa que corresponde a un método aprobable. Devuelve `null` para los
 * métodos que no tienen vista previa propia (`wallet_switchEthereumChain`,
 * `wallet_addEthereumChain`, `wallet_revokePermissions`).
 */
export const buildApprovalPreview = async (
  method: string,
  params: unknown,
  context: ApprovalPreviewContext,
  deps: TypedDataPreviewDeps = {},
): Promise<ApprovalPreview | null> => {
  switch (method) {
    case 'eth_sendTransaction': {
      const tx = pickTransactionRequest(params);
      return {
        kind: 'tx',
        txPreview: buildTxPreview({
          from: normalizeAddressOrNull(tx.from) ?? context.from,
          to: normalizeAddressOrNull(tx.to),
          value: tx.value,
          data: tx.data,
          gasLimit: tx.gas ?? context.gasLimit,
          maxFeePerGas: tx.maxFeePerGas ?? context.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? context.maxPriorityFeePerGas,
          gasPrice: tx.gasPrice ?? context.gasPrice,
          nonceInformativo: tx.nonce ?? context.nonceInformativo,
          chainId: context.chainId,
          balanceWei: context.balanceWei,
          toLabel: context.toLabel,
          estimationFailed: context.estimationFailed,
        }),
      };
    }
    case 'eth_signTypedData_v4': {
      const { typedData } = pickTypedData(params);
      const domain = isRecord(typedData?.domain) ? (typedData.domain as TypedDataDomain) : {};
      const types = isRecord(typedData?.types) ? (typedData.types as TypedDataTypes) : {};
      const message = isRecord(typedData?.message) ? typedData.message : {};
      const typedDataPreview = await buildTypedDataPreview(
        {
          domain,
          types,
          message,
          primaryType: typeof typedData?.primaryType === 'string' ? typedData.primaryType : null,
          chainId: context.chainId,
        },
        deps,
      );
      return { kind: 'typedData', typedDataPreview };
    }
    case 'personal_sign': {
      const message = pickPersonalMessage(params);
      return { kind: 'personalSign', signMessagePreview: buildPersonalSignPreview(message) };
    }
    default:
      return null;
  }
};
