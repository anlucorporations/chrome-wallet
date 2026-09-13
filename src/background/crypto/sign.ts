/**
 * M11 — `src/background/crypto/sign.ts`
 * **ÚNICA VÍA DE FIRMA** de TrueKeate Wallet. Ninguna otra parte del sistema firma ni toca la
 * clave privada: el Service Worker es el único que las maneja y este módulo es su instrumento
 * (`documento_tecnico.md` **§3.4** regla 2, §3.4 reglas 1/4/5; `diccionario_datos.md` §3.6;
 * `plan_desarrollo.md` §3.4.5 tarea 4.9).
 *
 * QUÉ FIRMA Y CON QUÉ REGLAS
 * 1. **Transacción EIP-1559 (tipo 2)** — camino de `eth_sendTransaction`: `maxFeePerGas` y
 *    `maxPriorityFeePerGas` salen de `getFeeData()` y son **siempre > 0**; si el nodo devuelve 0
 *    (Anvil sin `eth_maxPriorityFeePerGas`, por ejemplo) se **derivan** del `gasPrice` y de los
 *    mínimos de {@link MIN_MAX_FEE_PER_GAS}/{@link MIN_MAX_PRIORITY_FEE_PER_GAS}, porque una
 *    transacción con comisión 0 no es aceptada. El `chainId` va **dentro de la firma** (EIP-155),
 *    de modo que no es replicable en otra red.
 * 2. **Transacción EIP-155 legada (tipo 0)** — `signLegacyTransaction`: misma disciplina de
 *    `chainId` obligatorio, con `v = chainId * 2 + 35/36` (fórmula expuesta en
 *    {@link eip155V} para que sea verificable sin ambigüedad).
 * 3. **`eth_signTypedData_v4` (EIP-712)** — firma `domain`/`types`/`message` con el `primaryType`
 *    correcto, **eliminando `EIP712Domain` de `types`** antes de firmar (si se deja, `ethers`
 *    rechaza los datos: el dominio no es un tipo firmable). Devuelve además el `digest`, que es lo
 *    que consume `EIP712Verifier.verify(signer, digest, signature)` (§5.4 / RT-11).
 * 4. **`personal_sign`** — `signMessage` de `ethers` aplica el prefijo
 *    `\x19Ethereum Signed Message:\n<longitud>`; el prefijo se expone en
 *    {@link buildPersonalSignPayload} para poder comprobarlo literalmente.
 * 5. **Red ajena RECHAZADA**: un `chainId` que no sea el activo se rechaza con `4901`
 *    (`chainNotRegistered`) **sin firmar nada**; nunca se firma una transacción para otra red.
 *
 * Lo que este módulo NO hace: no difunde (eso es M7), no abre ventanas (M18), no escribe la cola
 * (M14) y **no registra** ni el `data` íntegro, ni la firma completa, ni la clave (M22).
 */

import {
  Transaction,
  TypedDataEncoder,
  Wallet,
  getBytes,
  hashMessage,
  isHexString,
  recoverAddress,
  toBeHex,
  toUtf8Bytes,
  type TypedDataDomain,
  type TypedDataField,
} from 'ethers';
import {
  DEFAULT_CHAIN_ID_DECIMAL,
  MIN_MAX_FEE_PER_GAS,
  MIN_MAX_PRIORITY_FEE_PER_GAS,
  TX_TYPE_EIP1559,
  TX_TYPE_LEGACY,
} from '../../shared/constants';
import { EIP712_DOMAIN_TYPE } from '../approvals/calldata';
import { internalError, chainNotRegisteredError, unknownAccountError } from '../rpc/errors';
import { getStorageLocal, type StorageLocalLike } from '../state/schema';
import { readWalletState } from '../accounts';
import { derivePrivateKey } from './hd';
import type { Address, ChainIdHex, Hex } from '../../shared/types';

/** Tipo de transacción EIP-1559 (el único que produce `eth_sendTransaction`). */
export const EIP1559_TX_TYPE = TX_TYPE_EIP1559;

/** Tipo de transacción legada con protección de replay EIP-155. */
export const LEGACY_TX_TYPE = TX_TYPE_LEGACY;

/** Longitud de una firma serializada: `0x` + 130 hex (§3.4). */
export const SIGNATURE_HEX_LENGTH = 132 as const;

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------

/** Convierte a `bigint` un valor hexadecimal, decimal o `bigint`; `null` si no es utilizable. */
export const toBigIntOrNull = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && Number.isInteger(value) ? BigInt(value) : null;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.length === 0) {
      return null;
    }
    try {
      return BigInt(text);
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * `chainId` interpretable a partir de un decimal, un hexadecimal (`0x7a69`) o un número entero no
 * negativo; `null` si el valor NO tiene forma de `chainId`.
 *
 * Es la primitiva que permite distinguir «no declarado» de «declarado e ininterpretable», que es la
 * diferencia entre no avisar y avisar: comparar dos valores con {@link toChainIdNumber} (que cae al
 * `chainId` por defecto ante lo ilegible) hacía que un `domain.chainId` basura se considerara
 * igual a la red activa cuando la red activa es la de por defecto.
 */
export const parseChainIdOrNull = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    const parsed = /^\d+$/.test(text)
      ? Number.parseInt(text, 10)
      : /^0x[0-9a-f]+$/i.test(text)
        ? Number.parseInt(text.slice(2), 16)
        : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

/**
 * Convierte a `number` de `chainId` un hexadecimal (`0x7a69`) o un decimal (`31337`), con el
 * `chainId` por defecto como respaldo cuando el valor no es interpretable.
 *
 * DEFECTO MEDIDO Y CORREGIDO (fase 4): la rama de cadena usaba `Number.parseInt` SIN comprobar la
 * forma, de modo que TRUNCABA y aceptaba valores que no son un `chainId`: `'1.5' → 1`,
 * `'31337abc' → 31337` y `'-5' → -5` (y `chainIdHexOf(-5)` producía `'0x-5'`, que no es una forma
 * hexadecimal válida). La propia spec de este módulo fija el criterio contrario para los números
 * («1.5 no es un `chainId`: tampoco se trunca»), así que ahora la cadena debe ser un entero
 * decimal o hexadecimal COMPLETO; cualquier otra cosa cae al `chainId` por defecto, igual que los
 * números no enteros.
 */
export const toChainIdNumber = (value: unknown): number =>
  parseChainIdOrNull(value) ?? DEFAULT_CHAIN_ID_DECIMAL;

/**
 * `chainId` en hexadecimal canónico (`0x7a69`) a partir de un decimal. Un valor que no sea un
 * entero no negativo cae al `chainId` por defecto: nunca se emite una forma inválida como `0x-5`.
 */
export const chainIdHexOf = (decimal: number): ChainIdHex =>
  `0x${(Number.isSafeInteger(decimal) && decimal >= 0 ? decimal : DEFAULT_CHAIN_ID_DECIMAL).toString(16)}` as ChainIdHex;

/**
 * Fórmula de EIP-155 para el `v` de una transacción legada: `chainId * 2 + 35 + yParity`.
 *
 * Se expone como función propia porque es un invariante verificable de `eip155.spec.ts`: con
 * `chainId = 31337` el `v` solo puede ser `62709` (yParity 0) o `62710` (yParity 1).
 */
export const eip155V = (chainId: number, yParity: number): number =>
  chainId * 2 + 35 + (yParity === 1 ? 1 : 0);

/** Igual que {@link toBigIntOrNull} pero devuelve `null` si el valor es <= 0. */
const positiveBigIntOrNull = (value: unknown): bigint | null => {
  const parsed = toBigIntOrNull(value);
  return parsed !== null && parsed > 0n ? parsed : null;
};

// ---------------------------------------------------------------------------
// Comisiones EIP-1559 (siempre > 0)
// ---------------------------------------------------------------------------

/** Datos de comisión tal y como los devuelve `provider.getFeeData()` (o el nodo, por RPC). */
export interface FeeDataLike {
  maxFeePerGas?: bigint | string | number | null;
  maxPriorityFeePerGas?: bigint | string | number | null;
  gasPrice?: bigint | string | number | null;
}

/** Comisiones normalizadas: ambas estrictamente positivas y coherentes entre sí. */
export interface ResolvedEip1559Fees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** Procedencia de cada valor: `node` si vino del nodo, `derived` si hubo que calcularlo. */
  source: { maxFeePerGas: 'node' | 'derived'; maxPriorityFeePerGas: 'node' | 'derived' };
}

/**
 * Normaliza las comisiones de una transacción tipo 2 garantizando el invariante
 * **`maxFeePerGas > 0` y `maxPriorityFeePerGas > 0`** (tarea 4.9 y `CA-RF-42`).
 *
 * Derivación, en este orden:
 * 1. `maxPriorityFeePerGas`: el del nodo si es > 0; si no, el mínimo del proyecto acotado por el
 *    `gasPrice` (nunca por encima de él) y, sin `gasPrice`, el mínimo.
 * 2. `maxFeePerGas`: el del nodo si es > 0; si no, `2 × base`, donde `base` es el `gasPrice` del
 *    nodo o el mínimo del proyecto. Siempre `>= maxPriorityFeePerGas` (invariante del protocolo).
 */
export const resolveEip1559Fees = (feeData?: FeeDataLike | null): ResolvedEip1559Fees => {
  const nodeMaxFee = positiveBigIntOrNull(feeData?.maxFeePerGas);
  const nodePriority = positiveBigIntOrNull(feeData?.maxPriorityFeePerGas);
  const gasPrice = positiveBigIntOrNull(feeData?.gasPrice);

  const base = gasPrice ?? MIN_MAX_FEE_PER_GAS;
  const maxPriorityFeePerGas =
    nodePriority ?? (MIN_MAX_PRIORITY_FEE_PER_GAS <= base ? MIN_MAX_PRIORITY_FEE_PER_GAS : base);
  let maxFeePerGas = nodeMaxFee ?? base * 2n;
  if (maxFeePerGas < maxPriorityFeePerGas) {
    maxFeePerGas = maxPriorityFeePerGas;
  }
  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    source: {
      maxFeePerGas: nodeMaxFee === null ? 'derived' : 'node',
      maxPriorityFeePerGas: nodePriority === null ? 'derived' : 'node',
    },
  };
};

// ---------------------------------------------------------------------------
// Resolución de la clave privada (nunca sale del Service Worker)
// ---------------------------------------------------------------------------

/** Dependencias inyectables de la firma (siempre con su valor real por defecto). */
export interface SignDeps {
  /** Clave privada ya resuelta (pruebas): evita tocar el almacén. */
  privateKey?: string | null;
  /** Resolutor alternativo de la clave privada de una cuenta. */
  resolvePrivateKey?: (address: Address) => Promise<string | null>;
  storage?: StorageLocalLike | null;
}

/**
 * Clave privada de una cuenta de la cartera: de la derivación HD (`m/44'/60'/0'/0/i`, M9) si es
 * una cuenta derivada y del registro de importadas si no. **No** aplica las guardas de revelado de
 * M12: aquí no se entrega la clave a nadie, solo se usa para firmar dentro del SW.
 *
 * Devuelve `null` si la cuenta no pertenece a la cartera.
 */
export const privateKeyForAddress = async (
  address: Address,
  deps: SignDeps = {},
): Promise<Hex | null> => {
  const storage = deps.storage === undefined ? getStorageLocal() : deps.storage;
  const state = await readWalletState(storage);
  const wanted = address.trim().toLowerCase();
  const imported = state.importedAccounts.find((entry) => entry.address.toLowerCase() === wanted);
  if (imported !== undefined) {
    return imported.privateKey;
  }
  const index = state.accounts.findIndex((entry) => entry.toLowerCase() === wanted);
  if (index >= 0 && state.mnemonic !== null) {
    return derivePrivateKey(state.mnemonic, index);
  }
  return null;
};

/** Resuelve la clave con la que se firmará, en el orden clave inyectada → resolutor → almacén. */
const resolveSigningKey = async (from: Address, deps: SignDeps): Promise<Hex> => {
  const injected = deps.privateKey;
  if (typeof injected === 'string' && injected.trim().length > 0) {
    return injected.trim() as Hex;
  }
  const resolved =
    deps.resolvePrivateKey !== undefined
      ? await deps.resolvePrivateKey(from)
      : await privateKeyForAddress(from, deps);
  if (resolved === null || resolved.trim().length === 0) {
    // Sin clave para esa cuenta: no se firma NADA (nunca se firma «por defecto» con otra cuenta).
    throw unknownAccountError({ reason: 'signing-key-unavailable', from });
  }
  return resolved.trim() as Hex;
};

/**
 * Cartera de firma de una cuenta. Comprueba que la clave corresponde a `from`: si no, responde
 * `unknownAccount` en lugar de firmar con la cuenta equivocada.
 */
export const signerFor = (privateKey: Hex, from?: Address): Wallet => {
  const wallet = new Wallet(privateKey);
  if (from !== undefined && wallet.address.toLowerCase() !== from.trim().toLowerCase()) {
    throw unknownAccountError({
      reason: 'signer-address-mismatch',
      from,
      signer: wallet.address,
    });
  }
  return wallet;
};

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

/** Entrada común de la firma de una transacción. */
export interface TransactionSigningInput {
  from: Address;
  /** `null` u omitido = despliegue de contrato. */
  to?: Address | null;
  /** Valor en wei (hexadecimal, decimal o `bigint`). */
  value?: unknown;
  /** Calldata (`0x…`). */
  data?: unknown;
  /** Límite de gas: ya estimado por M7 antes de abrir la ventana. */
  gasLimit?: unknown;
  /** `nonce` DEFINITIVO: se recalcula al aprobar (H-10). */
  nonce?: number;
  /** Red de la transacción; se compara con `activeChainId`. */
  chainId: ChainIdHex | number;
  /** Red ACTIVA de la cartera; si difiere de `chainId`, la firma se RECHAZA con `4901`. */
  activeChainId?: ChainIdHex | number;
  /** Comisiones del nodo (`getFeeData()`). */
  feeData?: FeeDataLike | null;
  /** `gasPrice` de una transacción legada (tipo 0). */
  gasPrice?: unknown;
}

/** Transacción firmada, con los datos observables que exige §3.4 (hash, `type`, `v`, `chainId`). */
export interface SignedTransaction {
  /** Transacción serializada y firmada, lista para `eth_sendRawTransaction`. */
  rawTransaction: Hex;
  /** Hash de la transacción: `0x` + 64 hex. Es lo que se devuelve al difundir. */
  hash: Hex;
  from: Address;
  to: Address | null;
  /** Tipo de transacción observado en la transacción serializada (2 en EIP-1559). */
  txType: number;
  chainId: number;
  chainIdHex: ChainIdHex;
  /** `v` de la firma (27/28 en tipo 2 —paridad—, `chainId*2+35/36` en legada con EIP-155). */
  v: number;
  /** Paridad del punto `y` (0/1); es el `v` real de una transacción tipo 2). */
  yParity: number;
  r: Hex;
  s: Hex;
  nonce: number;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

/**
 * Comprueba que la red de la transacción ES la red activa. Una petición para otra red se rechaza
 * con `4901` (`chainNotRegistered`) **antes** de tocar la clave: el `chainId` de la firma no puede
 * diferir del activo (EIP-155, `CA-RF-43`).
 */
export const assertActiveChain = (
  requested: ChainIdHex | number,
  active: ChainIdHex | number,
): number => {
  const requestedDecimal = toChainIdNumber(requested);
  const activeDecimal = toChainIdNumber(active);
  if (requestedDecimal !== activeDecimal) {
    throw chainNotRegisteredError({
      reason: 'chain-id-mismatch',
      requested: requestedDecimal,
      active: activeDecimal,
    });
  }
  return activeDecimal;
};

/** Normaliza un `nonce`; `0` si falta o no es válido (el definitivo lo recalcula el SW al aprobar). */
const normalizeNonce = (value: unknown): number => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  const parsed = toBigIntOrNull(value);
  return parsed !== null && parsed >= 0n ? Number(parsed) : 0;
};

/** Campos comunes normalizados de una transacción, ya sin comisiones. */
const commonTransactionFields = (input: TransactionSigningInput) => {
  const value = toBigIntOrNull(input.value) ?? 0n;
  const gasLimit = toBigIntOrNull(input.gasLimit);
  const data =
    typeof input.data === 'string' && isHexString(input.data) ? input.data.toLowerCase() : '0x';
  return {
    to: input.to ?? null,
    value,
    data,
    nonce: normalizeNonce(input.nonce),
    ...(gasLimit !== null && gasLimit > 0n ? { gasLimit } : {}),
  };
};

/**
 * Construye la transacción **tipo 2 (EIP-1559)** con las comisiones ya resueltas y su `chainId`.
 * La usa `signTransaction` y la puede usar la vista previa para mostrar la comisión estimada.
 */
export const buildType2Transaction = (
  input: TransactionSigningInput,
): {
  transaction: Record<string, unknown>;
  fees: ResolvedEip1559Fees;
  chainId: number;
} => {
  const chainId = assertActiveChain(input.chainId, input.activeChainId ?? input.chainId);
  const fees = resolveEip1559Fees(input.feeData);
  const common = commonTransactionFields(input);
  return {
    chainId,
    fees,
    transaction: {
      type: TX_TYPE_EIP1559,
      chainId,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      ...common,
      ...(common.to === null ? {} : { to: common.to }),
    },
  };
};

/** Lee de la transacción serializada el `type`, el `chainId` y la firma (invariantes de §3.4). */
const describeSignedTransaction = (
  raw: string,
  expectedChainId: number,
): Pick<SignedTransaction, 'rawTransaction' | 'hash' | 'txType' | 'chainId' | 'v' | 'yParity' | 'r' | 's' | 'from' | 'to' | 'nonce' | 'gasLimit'> => {
  const parsed = Transaction.from(raw);
  const signature = parsed.signature;
  if (signature === null) {
    throw internalError({ reason: 'unsigned-transaction' });
  }
  const yParity = signature.yParity;
  return {
    rawTransaction: raw as Hex,
    hash: parsed.hash as Hex,
    from: parsed.from as Address,
    to: (parsed.to as Address | null) ?? null,
    txType: parsed.type ?? TX_TYPE_EIP1559,
    chainId: parsed.chainId !== null ? Number(parsed.chainId) : expectedChainId,
    v: Number(signature.v),
    yParity,
    r: signature.r as Hex,
    s: signature.s as Hex,
    nonce: parsed.nonce,
    gasLimit: parsed.gasLimit.toString(),
  };
};

/**
 * Firma una transacción **EIP-1559 (tipo 2)** con el `chainId` activo dentro de la firma.
 *
 * @throws Eip1193Error `4901` si `chainId` no es el activo; `-32602 unknownAccount` si la cartera
 *   no tiene la clave privada de `from`.
 */
export const signTransaction = async (
  input: TransactionSigningInput,
  deps: SignDeps = {},
): Promise<SignedTransaction> => {
  const { transaction, fees, chainId } = buildType2Transaction(input);
  const wallet = signerFor(await resolveSigningKey(input.from, deps), input.from);
  const raw = await wallet.signTransaction(transaction);
  const described = describeSignedTransaction(raw, chainId);
  if (described.txType !== TX_TYPE_EIP1559) {
    // Defensa en profundidad: `eth_sendTransaction` SIEMPRE difunde tipo 2 (CA-RF-42).
    throw internalError({ reason: 'unexpected-tx-type', txType: described.txType });
  }
  return {
    ...described,
    chainIdHex: chainIdHexOf(described.chainId),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
  };
};

/**
 * Firma una transacción **legada con EIP-155** (tipo 0). Existe porque EIP-155 —el `chainId`
 * dentro de la firma, con `v = chainId * 2 + 35/36`— es un requisito de H4 verificable por
 * separado (tarea 4.9, `eip155.spec.ts`) y porque una dApp puede pedir `type: 0`.
 *
 * El `gasPrice` es obligatorio y debe ser > 0; el `chainId` también (sin él `ethers` firmaría una
 * transacción PRE-EIP-155, replicable en otra red, y eso está prohibido).
 */
export const signLegacyTransaction = async (
  input: TransactionSigningInput,
  deps: SignDeps = {},
): Promise<SignedTransaction> => {
  const chainId = assertActiveChain(input.chainId, input.activeChainId ?? input.chainId);
  const gasPrice = positiveBigIntOrNull(input.gasPrice ?? input.feeData?.gasPrice);
  if (gasPrice === null) {
    throw internalError({ reason: 'missing-gas-price' });
  }
  const common = commonTransactionFields(input);
  const wallet = signerFor(await resolveSigningKey(input.from, deps), input.from);
  const raw = await wallet.signTransaction({
    type: TX_TYPE_LEGACY,
    chainId,
    gasPrice,
    ...common,
    ...(common.to === null ? {} : { to: common.to }),
  });
  const described = describeSignedTransaction(raw, chainId);
  const expectedV = eip155V(described.chainId, described.yParity);
  return {
    ...described,
    // El `v` de una transacción EIP-155 es exactamente `chainId * 2 + 35/36`.
    v: described.v >= 35 ? described.v : expectedV,
    chainIdHex: chainIdHexOf(described.chainId),
    maxFeePerGas: gasPrice.toString(),
    maxPriorityFeePerGas: gasPrice.toString(),
  };
};

// ---------------------------------------------------------------------------
// EIP-712 (`eth_signTypedData_v4`)
// ---------------------------------------------------------------------------

/** Tipos EIP-712 tal y como llegan de la dApp (pueden incluir `EIP712Domain`). */
export type TypedDataTypes = Record<string, Array<Pick<TypedDataField, 'name' | 'type'>>>;

/** Entrada de la firma EIP-712. */
export interface TypedDataSigningInput {
  from: Address;
  domain: TypedDataDomain;
  types: TypedDataTypes;
  message: Record<string, unknown>;
  /** `primaryType` declarado por la dApp; si falta o no existe, se infiere la raíz. */
  primaryType?: string | null;
}

/** Resultado de la firma EIP-712: firma, `digest` y los tipos ya sin `EIP712Domain`. */
export interface TypedDataSignature {
  /** `0x` + 130 hex, verificable con `EIP712Verifier.verify` (§5.4 / RT-11). */
  signature: Hex;
  from: Address;
  /** `TypedDataEncoder.hash(domain, types, message)`: el `digest` que recibe el contrato. */
  digest: Hex;
  /** Tipo raíz usado al firmar. */
  primaryType: string;
  /** Tipos SIN `EIP712Domain`. */
  types: TypedDataTypes;
  domain: TypedDataDomain;
}

/**
 * Quita `EIP712Domain` de `types`: el dominio NO es un tipo firmable y `ethers` lo rechaza si se
 * cuela. Es la eliminación que exige §3.4 («quita EIP712Domain de types y calcula primaryType»).
 */
export const stripEip712Domain = (types: TypedDataTypes): TypedDataTypes => {
  const cleaned: TypedDataTypes = {};
  for (const [name, fields] of Object.entries(types)) {
    if (name === EIP712_DOMAIN_TYPE) {
      continue;
    }
    cleaned[name] = Array.isArray(fields)
      ? fields.map((field) => ({ name: field.name, type: field.type }))
      : [];
  }
  return cleaned;
};

/**
 * Tipos referenciados por otro tipo: la raíz es el que **no** aparece como campo de ningún otro.
 * Si todos aparecen (tipos mutuamente recursivos) se cae al primer tipo declarado, que es la
 * misma decisión determinista que toma `TypedDataEncoder.from`. Una lista vacía devuelve `null`.
 */
export const inferPrimaryType = (types: TypedDataTypes): string | null => {
  const names = Object.keys(types);
  if (names.length === 0) {
    return null;
  }
  const referenced = new Set<string>();
  for (const fields of Object.values(types)) {
    for (const field of fields) {
      const base = field.type.replace(/\[[0-9]*\]$/u, '');
      if (base !== EIP712_DOMAIN_TYPE) {
        referenced.add(base);
      }
    }
  }
  const roots = names.filter((name) => !referenced.has(name));
  return roots[0] ?? names[0] ?? null;
};

/** `primaryType` efectivo: el declarado si existe en `types` y, si no, la raíz inferida. */
export const resolvePrimaryType = (types: TypedDataTypes, requested?: string | null): string => {
  if (typeof requested === 'string' && requested.length > 0 && types[requested] !== undefined) {
    return requested;
  }
  const inferred = inferPrimaryType(types);
  if (inferred === null) {
    // Sin tipos no hay EIP-712 firmable: es una petición malformada, no un error de uso.
    throw internalError({ reason: 'invalid-typed-data' });
  }
  return inferred;
};

/**
 * Firma `eth_signTypedData_v4` (EIP-712) con el `primaryType` correcto y sin `EIP712Domain`.
 *
 * @throws Eip1193Error `-32602 unknownAccount` si la cartera no tiene la clave de `from`.
 */
export const signTypedData = async (
  input: TypedDataSigningInput,
  deps: SignDeps = {},
): Promise<TypedDataSignature> => {
  const cleanTypes = stripEip712Domain(input.types);
  const primaryType = resolvePrimaryType(cleanTypes, input.primaryType);
  const wallet = signerFor(await resolveSigningKey(input.from, deps), input.from);
  let signature: string;
  let digest: string;
  try {
    digest = TypedDataEncoder.hash(input.domain, cleanTypes, input.message);
    signature = await wallet.signTypedData(input.domain, cleanTypes, input.message);
  } catch (error) {
    // Datos tipados que `ethers` no puede hashear: firma bloqueada, nunca a medias.
    throw internalError({
      reason: 'unhashable-typed-data',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  return {
    signature: signature as Hex,
    from: wallet.address as Address,
    digest: digest as Hex,
    primaryType,
    types: cleanTypes,
    domain: input.domain,
  };
};

/**
 * Recupera el firmante de una firma EIP-712. Es el instrumento de correspondencia
 * wallet ↔ contrato (§5.4): el mismo `digest` que verifica `EIP712Verifier.verify` debe recuperar
 * la dirección que firmó.
 *
 * `ethers` v6 no expone `TypedDataEncoder.recover`: la recuperación se hace sobre el `digest`
 * canónico con `recoverAddress`, que es exactamente lo que comprueba el contrato con `ECDSA`.
 */
export const recoverTypedDataSigner = (
  domain: TypedDataDomain,
  types: TypedDataTypes,
  message: Record<string, unknown>,
  signature: string,
): Address => {
  const cleanTypes = stripEip712Domain(types);
  const digest = TypedDataEncoder.hash(domain, cleanTypes, message);
  return recoverAddress(digest, signature) as Address;
};

/** `digest` EIP-712 sin firmar (lo consume el contrato y la evidencia de `CA-RT-11`). */
export const typedDataDigest = (
  domain: TypedDataDomain,
  types: TypedDataTypes,
  message: Record<string, unknown>,
): Hex => TypedDataEncoder.hash(domain, stripEip712Domain(types), message) as Hex;

// ---------------------------------------------------------------------------
// `personal_sign` (EIP-191)
// ---------------------------------------------------------------------------

/** Entrada de `personal_sign`. */
export interface PersonalSignInput {
  from: Address;
  /** Mensaje tal y como lo entrega la dApp (texto UTF-8 o hexadecimal). */
  message: string | Uint8Array;
}

/** Payload prefijado de `personal_sign`, ya listo para firmar. */
export interface PersonalSignPayload {
  /** Bytes del mensaje. */
  bytes: Uint8Array;
  /** Prefijo literal `\x19Ethereum Signed Message:\n<longitud>`. */
  prefix: string;
  /** Prefijo + mensaje (lo que realmente se firma). */
  prefixed: Uint8Array;
  /** `keccak256(prefixed)`: el hash que `personal_sign` firma. */
  hash: Hex;
}

/**
 * Construye el payload de `personal_sign` con el prefijo literal
 * `\x19Ethereum Signed Message:\n<longitud>` (EIP-191). Se expone aparte de la firma para poder
 * comprobar el prefijo byte a byte sin necesidad de una clave.
 *
 * Interpretación del parámetro (la misma que aplica MetaMask):
 * - cadena **hexadecimal** (`0x686f6c61`) → son los BYTES del mensaje;
 * - cadena que no es hexadecimal (`hola`) → se codifica en **UTF-8**;
 * - `Uint8Array` → tal cual.
 */
export const buildPersonalSignPayload = (message: string | Uint8Array): PersonalSignPayload => {
  const bytes =
    typeof message === 'string'
      ? isHexString(message)
        ? getBytes(message)
        : toUtf8Bytes(message)
      : message;
  const prefix = `\x19Ethereum Signed Message:\n${bytes.length}`;
  const prefixBytes = toUtf8Bytes(prefix);
  const prefixed = new Uint8Array(prefixBytes.length + bytes.length);
  prefixed.set(prefixBytes, 0);
  prefixed.set(bytes, prefixBytes.length);
  return { bytes, prefix, prefixed, hash: hashMessage(bytes) as Hex };
};

/** Resultado de `personal_sign`. */
export interface PersonalSignature {
  /** `0x` + 130 hex. */
  signature: Hex;
  from: Address;
  /** `keccak256` del mensaje con el prefijo EIP-191. */
  messageHash: Hex;
  /** Prefijo literal aplicado (trazabilidad de la regla). */
  prefix: string;
  byteLength: number;
}

/**
 * Firma `personal_sign` aplicando el prefijo EIP-191 (`ethers` lo hace en `signMessage`).
 *
 * @throws Eip1193Error `-32602 unknownAccount` si la cartera no tiene la clave de `from`.
 */
export const signPersonalMessage = async (
  input: PersonalSignInput,
  deps: SignDeps = {},
): Promise<PersonalSignature> => {
  const payload = buildPersonalSignPayload(input.message);
  const wallet = signerFor(await resolveSigningKey(input.from, deps), input.from);
  const signature = await wallet.signMessage(payload.bytes);
  return {
    signature: signature as Hex,
    from: wallet.address as Address,
    messageHash: payload.hash,
    prefix: payload.prefix,
    byteLength: payload.bytes.length,
  };
};

/** Hex de 32 bytes de un `bigint` (utilidad de la evidencia y de las pruebas). */
export const toBytes32Hex = (value: bigint): Hex => toBeHex(value, 32) as Hex;
