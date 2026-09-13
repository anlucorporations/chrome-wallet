// @vitest-environment node
/**
 * M19 — `src/background/approvals/preview.ts` (spec del árbol `test/oracle/`)
 * Vistas previas de la ventana única de confirmación y sus **avisos de riesgo obligatorios**
 * (`documento_tecnico.md` §3.4 y su tabla): requisito **RF-35** (contenido de la vista previa),
 * **RF-37** (ventana única) y **RNF-09** (los bytes del payload nunca acaban en los logs; solo su
 * hash y su longitud). Se fija el contrato observable de `buildTxPreview`,
 * `buildTypedDataPreview` y `buildPersonalSignPreview`: entradas → salida tipada y literales de
 * aviso bloqueantes (`CA-RF-21`, R5: la firma ciega invalida el hito).
 */

import { describe, expect, it } from 'vitest';

import {
  BLOCKING_RISK_WARNINGS,
  CONTRACT_DEPLOYMENT_LABEL,
  DEFAULT_GAS_LIMIT,
  RISK_WARNINGS,
  UNKNOWN_TO_LABEL,
  ZERO_ADDRESS,
  buildApprovalPreview,
  buildPersonalSignPreview,
  buildTxPreview,
  buildTypedDataPreview,
  canonicalMessageJson,
  hasBlockingRiskWarning,
  isReadableText,
  isVerifyingContractMismatch,
  normalizeAddressOrNull,
  personalSignRiskWarnings,
  pickPersonalMessage,
  pickSigningAddress,
  pickTransactionRequest,
  pickTypedData,
  stripDomainType,
  typedDataRiskWarnings,
  type TypedDataPreviewResult,
} from '../../src/background/approvals/preview';
import type { Address, TypedDataDomain } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
/** Cuenta #1 de Anvil (EIP-55). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
/** Dirección con checksum EIP-55 INVÁLIDO (mezcla de mayúsculas no canónica). */
const CHECKSUM_INVALIDO = `0x${'Ab'.repeat(20)}`;

/** Argumento ABI de 32 bytes a partir de una dirección. */
const word = (address: string): string => address.slice(2).toLowerCase().padStart(64, '0');
/** Argumento ABI de 32 bytes a partir de un número. */
const wordOf = (value: bigint): string => value.toString(16).padStart(64, '0');

/** Calldata de `transfer(address,uint256)`. */
const TRANSFER = `0xa9059cbb${word(CUENTA_1)}${wordOf(1n)}`;

describe('M19 · extracción tolerante de los parámetros de la dApp', () => {
  it('normalizeAddressOrNull acepta forma de dirección y rechaza el resto', () => {
    expect(normalizeAddressOrNull(CUENTA_1.toLowerCase())).toBe(CUENTA_1);
    expect(normalizeAddressOrNull(`  ${CUENTA_1}  `)).toBe(CUENTA_1);
    expect(normalizeAddressOrNull(CHECKSUM_INVALIDO)).toBeNull();
    expect(normalizeAddressOrNull('0x1234')).toBeNull();
    expect(normalizeAddressOrNull(null)).toBeNull();
    expect(normalizeAddressOrNull(42)).toBeNull();
  });

  it('pickTransactionRequest admite el array canónico y el objeto suelto', () => {
    expect(pickTransactionRequest([{ to: CUENTA_1 }])).toEqual({ to: CUENTA_1 });
    expect(pickTransactionRequest([CUENTA_1])).toEqual({});
    expect(pickTransactionRequest([])).toEqual({});
    expect(pickTransactionRequest({ to: CUENTA_1 })).toEqual({ to: CUENTA_1 });
    expect(pickTransactionRequest('no-objeto')).toEqual({});
    expect(pickTransactionRequest(null)).toEqual({});
  });

  it('pickSigningAddress devuelve la primera dirección y el respaldo si no hay', () => {
    expect(pickSigningAddress([CUENTA_0, { data: 1 }])).toBe(CUENTA_0);
    expect(pickSigningAddress({ origin: 'x' })).toBeNull();
    expect(pickSigningAddress([], CUENTA_1)).toBe(CUENTA_1);
    expect(pickSigningAddress(['texto-sin-direccion'], CUENTA_1)).toBe(CUENTA_1);
  });

  it('pickTypedData acepta objeto, cadena JSON y descarta la cadena que no es JSON', () => {
    const objeto = { domain: {}, types: {}, message: {} };
    expect(pickTypedData([CUENTA_0, objeto])).toEqual({ typedData: objeto, address: CUENTA_0 });
    expect(pickTypedData([CUENTA_0, JSON.stringify(objeto)]).typedData).toEqual(objeto);
    // JSON que no es objeto → se sigue buscando y no hay candidato.
    expect(pickTypedData(['[1,2,3]']).typedData).toBeNull();
    // Cadena que no es JSON → `catch` y tampoco hay candidato.
    expect(pickTypedData(['{no-es-json']).typedData).toBeNull();
    expect(pickTypedData([])).toEqual({ typedData: null, address: null });
    expect(pickTypedData([CUENTA_0, objeto]).address).toBe(CUENTA_0);
    // Objeto suelto (sin array).
    expect(pickTypedData(objeto).typedData).toEqual(objeto);
  });

  it('pickPersonalMessage devuelve el parámetro que no es dirección', () => {
    expect(pickPersonalMessage(['hola', CUENTA_0])).toBe('hola');
    expect(pickPersonalMessage([CUENTA_0, 'hola'])).toBe('hola');
    // Solo direcciones: petición malformada → payload VACÍO (determinista y visible).
    expect(pickPersonalMessage([CUENTA_0, CUENTA_1])).toBe('');
    // Bytes: se devuelven tal cual.
    const bytes = new Uint8Array([1, 2, 3]);
    expect(pickPersonalMessage([bytes])).toBe(bytes);
    // Valor que no es texto ni bytes: payload vacío.
    expect(pickPersonalMessage([42])).toBe('');
  });
});

describe('M19 · buildTxPreview (M19.a)', () => {
  it('transfer etiquetado: forma completa y `isContractCall` verdadero', () => {
    const preview = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      value: '1000000000000000',
      data: TRANSFER,
      gasLimit: '21000',
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '2000000000',
      chainId: '0x7a69',
      toLabel: 'Mi cuenta',
      nonceInformativo: '7',
    });

    expect(preview.to).toBe(CUENTA_1);
    expect(preview.toLabel).toBe('Mi cuenta');
    expect(preview.valueWei).toBe('1000000000000000');
    expect(preview.valueEth).toBe('0.0010');
    expect(preview.functionName).toBe('transfer(address,uint256)');
    expect(preview.isUnrecognizedContractCall).toBe(false);
    expect(preview.isContractCall).toBe(true);
    expect(preview.dataLength).toBe(68);
    expect(preview.gasLimit).toBe('21000');
    expect(preview.maxFeePerGas).toBe('1000000000');
    expect(preview.maxPriorityFeePerGas).toBe('2000000000');
    expect(preview.nonceInformativo).toBe(7);
    expect(preview.txType).toBe(2);
    expect(preview.chainId).toBe('0x7a69');
    expect(preview.insufficientFunds).toBe(false);
    expect(preview.riskWarnings).toEqual([]);
  });

  it('despliegue de contrato (to null): etiqueta y aviso literales', () => {
    const preview = buildTxPreview({ from: CUENTA_0, to: null, chainId: '0x7a69' });
    expect(preview.to).toBeNull();
    expect(preview.toLabel).toBe(CONTRACT_DEPLOYMENT_LABEL);
    expect(preview.riskWarnings).toContain(RISK_WARNINGS.contractDeployment);
    // Sin `gasLimit` se usa el respaldo de transferencia simple.
    expect(preview.gasLimit).toBe(DEFAULT_GAS_LIMIT.toString());
  });

  it('`to` omitido y destino sin etiqueta: aviso «destino sin etiqueta»', () => {
    const sinTo = buildTxPreview({ from: CUENTA_0, chainId: '0x7a69' });
    expect(sinTo.to).toBeNull();
    expect(sinTo.toLabel).toBe(CONTRACT_DEPLOYMENT_LABEL);

    const sinEtiqueta = buildTxPreview({ from: CUENTA_0, to: CUENTA_1, chainId: '0x7a69', toLabel: '' });
    expect(sinEtiqueta.toLabel).toBe(UNKNOWN_TO_LABEL);
    expect(sinEtiqueta.riskWarnings).toContain(RISK_WARNINGS.unknownDestination);
  });

  it('llamada a contrato NO reconocida → aviso BLOQUEANTE (R5, firma ciega)', () => {
    const preview = buildTxPreview({ from: CUENTA_0, to: CUENTA_1, data: '0xdeadbeef', chainId: '0x7a69' });
    expect(preview.isUnrecognizedContractCall).toBe(true);
    expect(preview.functionName).toBeNull();
    expect(preview.riskWarnings).toContain(RISK_WARNINGS.unrecognizedContract);
    expect(hasBlockingRiskWarning(preview.riskWarnings)).toBe(true);
  });

  it('selector reconocido con argumentos no decodificables → aviso BLOQUEANTE', () => {
    // `approve` sin argumentos: la firma se reconoce, los argumentos no se decodifican.
    const preview = buildTxPreview({ from: CUENTA_0, to: CUENTA_1, data: '0x095ea7b3', chainId: '0x7a69' });
    expect(preview.functionName).toBe('approve(address,uint256)');
    expect(preview.riskWarnings).toContain(RISK_WARNINGS.undecodableArguments);
    expect(hasBlockingRiskWarning(preview.riskWarnings)).toBe(true);
  });

  it('avisos de estructura: allowance ilimitada, approvalForAll, permit y multicall', () => {
    const ilimitada = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      data: `0x095ea7b3${word(CUENTA_1)}${wordOf((1n << 256n) - 1n)}`,
      chainId: '0x7a69',
    });
    expect(ilimitada.riskWarnings).toContain(RISK_WARNINGS.unlimitedAllowance);

    const total = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      data: `0xa22cb465${word(CUENTA_1)}${wordOf(1n)}`,
      chainId: '0x7a69',
    });
    expect(total.riskWarnings).toContain(RISK_WARNINGS.approvalForAll);

    const permiso = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      data: [
        '0xd505accf',
        word(CUENTA_0),
        word(CUENTA_1),
        wordOf(1n),
        wordOf(2n),
        wordOf(27n),
        wordOf(1n),
        wordOf(1n),
      ].join(''),
      chainId: '0x7a69',
    });
    expect(permiso.riskWarnings).toContain(RISK_WARNINGS.permit);
  });

  it('estimación fallida: gas 0, `estimationFailed` y el literal de §4.3 con el motivo', () => {
    const preview = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      chainId: '0x7a69',
      estimationFailed: { reason: 'execution reverted' },
    });
    expect(preview.gasLimit).toBe('0');
    expect(preview.estimationFailed).toEqual({ reason: 'execution reverted' });
    const aviso = preview.riskWarnings.find((warning) => warning.includes('execution reverted'));
    expect(aviso).toContain('La estimación de gas falló');
    expect(aviso).toContain('El envío se ha bloqueado.');
  });

  it('saldo insuficiente se declara solo cuando el saldo es conocido', () => {
    const sinSaldo = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      value: '1000',
      chainId: '0x7a69',
      gasLimit: '21000',
      maxFeePerGas: '1',
    });
    expect(sinSaldo.insufficientFunds).toBe(false);

    const insuficiente = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      value: '1000',
      chainId: '0x7a69',
      gasLimit: '21000',
      maxFeePerGas: '1',
      balanceWei: '100',
    });
    expect(insuficiente.insufficientFunds).toBe(true);
    expect(insuficiente.riskWarnings).toContain(
      'Saldo insuficiente para cubrir el valor y la comisión estimada.',
    );
  });

  it('comisiones: el respaldo es `gasPrice` y ambas componentes quedan > 0 (M11)', () => {
    const respaldo = buildTxPreview({
      from: CUENTA_0,
      chainId: '0x7a69',
      gasLimit: '2',
      maxFeePerGas: '0',
      maxPriorityFeePerGas: '0',
      gasPrice: '5',
    });
    expect(respaldo.maxFeePerGas).toBe('5');
    expect(respaldo.maxPriorityFeePerGas).toBe('5');
    expect(respaldo.estimatedFeeEth).toBe('0.0000');

    // Sin `gasPrice`: el respaldo baja a `maxFeePerGas` (aquí 0) y no se inventa nada.
    const sinNada = buildTxPreview({
      from: CUENTA_0,
      chainId: '0x7a69',
      maxFeePerGas: '0',
      maxPriorityFeePerGas: '0',
    });
    expect(sinNada.maxFeePerGas).toBe('0');
    expect(sinNada.maxPriorityFeePerGas).toBe('0');
  });

  it('valores malformados no se inventan: value 0, nonce 0, data `0x`', () => {
    const preview = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      chainId: '0x7a69',
      value: 'no-numero',
      data: 'no-es-hex',
      nonceInformativo: 'x',
    });
    expect(preview.valueWei).toBe('0');
    expect(preview.data).toBe('0x');
    expect(preview.isContractCall).toBe(false);
    expect(preview.nonceInformativo).toBe(0);

    const negativo = buildTxPreview({
      from: CUENTA_0,
      to: CUENTA_1,
      chainId: '0x7a69',
      nonceInformativo: -3n,
    });
    expect(negativo.nonceInformativo).toBe(0);
  });
});

describe('M19 · avisos de riesgo: clasificación bloqueante', () => {
  it('hasBlockingRiskWarning reconoce los cuatro avisos que bloquean la aprobación', () => {
    expect(BLOCKING_RISK_WARNINGS).toEqual([
      RISK_WARNINGS.unrecognizedContract,
      RISK_WARNINGS.undecodableArguments,
      RISK_WARNINGS.multicallWithUnrecognized,
      RISK_WARNINGS.verifyingContractMismatch,
    ]);
    for (const warning of BLOCKING_RISK_WARNINGS) {
      expect(hasBlockingRiskWarning([warning])).toBe(true);
    }
    expect(hasBlockingRiskWarning([RISK_WARNINGS.permit])).toBe(false);
    expect(hasBlockingRiskWarning([])).toBe(false);
  });
});

describe('M19 · buildTypedDataPreview (M19.b)', () => {
  const domain: TypedDataDomain = {
    name: 'TrueKeate',
    version: '1',
    chainId: 31337,
    verifyingContract: CUENTA_1,
    salt: '0x01',
  };

  it('proyecta el dominio, elimina EIP712Domain y calcula hash y longitud canónicos', async () => {
    const preview = await buildTypedDataPreview(
      {
        domain,
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }],
          Permit: [{ name: 'spender', type: 'address' }],
        },
        message: { spender: CUENTA_1 },
        primaryType: 'Permit',
        chainId: '0x7a69',
      },
      { getCode: async () => '0x1234' },
    );

    expect(preview.domain).toEqual(domain);
    expect(preview.domainName).toBe('TrueKeate');
    expect(preview.types).toEqual({ Permit: [{ name: 'spender', type: 'address' }] });
    expect(preview.primaryType).toBe('Permit');
    expect(preview.domainChainMismatch).toBe(false);
    expect(preview.verifyingContractMismatch).toBe(false);
    expect(preview.messageHash.startsWith('sha256:')).toBe(true);
    expect(preview.messageBytes).toBe(canonicalMessageJson({ spender: CUENTA_1 })!.length);
    expect(preview.redacted).toBe(false);
    expect(preview.message).toEqual({ spender: CUENTA_1 });
  });

  it('sin `getCode` inyectado NO se afirma que el contrato no exista', async () => {
    const sinGetCode = await buildTypedDataPreview({
      domain: { verifyingContract: CUENTA_1 },
      types: {},
      message: {},
      chainId: '0x7a69',
    });
    expect(sinGetCode.verifyingContractMismatch).toBe(false);

    const nodoCaidon = await buildTypedDataPreview(
      {
        domain: { verifyingContract: CUENTA_1 },
        types: {},
        message: {},
        chainId: '0x7a69',
      },
      {
        getCode: async () => {
          throw new Error('sin nodo');
        },
      },
    );
    expect(nodoCaidoMismatch(nodoCaidon)).toBe(true);
  });

  it('`verifyingContract` cero o sin código desplegado → aviso BLOQUEANTE', async () => {
    const cero = await buildTypedDataPreview({
      domain: { verifyingContract: ZERO_ADDRESS as Address },
      types: {},
      message: {},
      chainId: '0x7a69',
    });
    expect(cero.verifyingContractMismatch).toBe(true);
    expect(typedDataRiskWarnings(cero)).toContain(RISK_WARNINGS.verifyingContractMismatch);

    const sinCodigo = await buildTypedDataPreview(
      { domain: { verifyingContract: CUENTA_1 }, types: {}, message: {}, chainId: '0x7a69' },
      { getCode: async () => '0x' },
    );
    expect(sinCodigo.verifyingContractMismatch).toBe(true);
  });

  it('`domainChainMismatch` compara el `chainId` declarado con la red activa', async () => {
    const distinto = await buildTypedDataPreview({
      domain: { chainId: '0x1' },
      types: {},
      message: {},
      chainId: '0x7a69',
    });
    expect(distinto.domainChainMismatch).toBe(true);
    expect(typedDataRiskWarnings(distinto)).toContain(RISK_WARNINGS.domainChainMismatch);

    const igualDecimal = await buildTypedDataPreview({
      domain: { chainId: 31337 },
      types: {},
      message: {},
      chainId: 31337,
    });
    expect(igualDecimal.domainChainMismatch).toBe(false);

    const sinChainId = await buildTypedDataPreview({
      domain: {},
      types: { Permit: [{ name: 'spender', type: 'address' }] },
      message: {},
      chainId: '0x7a69',
    });
    expect(sinChainId.domainChainMismatch).toBe(false);
  });

  it('un `chainId` de dominio PRESENTE pero ininterpretable cuenta como discrepancia', async () => {
    // DEFECTO MEDIDO Y CORREGIDO (fase 4): `toChainIdNumber` cae al `chainId` por defecto ante un
    // valor ilegible, así que con la red por defecto activa (Anvil 31337) un `domain.chainId`
    // basura daba `31337 === 31337` y el aviso destacado NO se emitía: el usuario firmaba datos
    // tipados de un dominio que la cartera no podía situar en ninguna red.
    for (const basura of ['no-es-un-numero', '', '0x', '0xzz', 1.5, -1] as const) {
      const preview = await buildTypedDataPreview({
        domain: { chainId: basura },
        types: { Permit: [{ name: 'spender', type: 'address' }] },
        message: {},
        chainId: 31337,
      });
      expect(preview.domainChainMismatch, `«${String(basura)}»`).toBe(true);
      expect(typedDataRiskWarnings(preview)).toContain(RISK_WARNINGS.domainChainMismatch);
    }
    // El `chainId` correcto y el ausente siguen sin ser discrepancia (control positivo).
    const correcto = await buildTypedDataPreview({
      domain: { chainId: 31337 },
      types: {},
      message: {},
      chainId: 31337,
    });
    expect(correcto.domainChainMismatch).toBe(false);
  });

  it('`primaryType` cae al primer tipo declarado cuando no se aporta', async () => {
    const inferido = await buildTypedDataPreview({
      domain: {},
      types: { Permit: [{ name: 'spender', type: 'address' }] },
      message: {},
      chainId: '0x7a69',
      primaryType: '',
    });
    expect(inferido.primaryType).toBe('Permit');

    const sinTipos = await buildTypedDataPreview({
      domain: {},
      types: {},
      message: {},
      chainId: '0x7a69',
      primaryType: null,
    });
    expect(sinTipos.primaryType).toBe('');
  });

  it('redacción en reposo (ADT-21/D-L): mensaje > 4096 bytes → `message: null` y aviso', async () => {
    const enorme = { blob: 'x'.repeat(5000) };
    const preview = await buildTypedDataPreview({
      domain: {},
      types: { Permit: [{ name: 'blob', type: 'string' }] },
      message: enorme,
      chainId: '0x7a69',
    });
    expect(preview.redacted).toBe(true);
    expect(preview.message).toBeNull();
    expect(preview.messageBytes).toBeGreaterThan(4096);
    expect(preview.messageHash.startsWith('sha256:')).toBe(true);
    expect(typedDataRiskWarnings(preview)).toContain(RISK_WARNINGS.longMessage);
  });

  it('un mensaje no serializable se trata como 0 bytes (hash del texto vacío)', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const preview = await buildTypedDataPreview({
      domain: {},
      types: {},
      message: circular,
      chainId: '0x7a69',
    });
    expect(canonicalMessageJson(circular)).toBeNull();
    expect(preview.messageBytes).toBe(0);
    expect(preview.redacted).toBe(false);
  });

  it('un dominio vacío no se rellena con inventos', async () => {
    const preview = await buildTypedDataPreview({
      domain: {},
      types: {},
      message: {},
      chainId: '0x7a69',
    });
    expect(preview.domain).toEqual({});
    expect(preview.domainName).toBeNull();
    expect(preview.verifyingContract).toBeNull();
  });

  it('stripDomainType quita EIP712Domain y descarta las listas no utilizables', () => {
    const limpio = stripDomainType({
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Permit: [{ name: 'spender', type: 'address', extra: true } as never],
      Roto: 'no-es-lista' as never,
    });
    expect(limpio).toEqual({
      Permit: [{ name: 'spender', type: 'address' }],
      Roto: [],
    });
  });

  it('isVerifyingContractMismatch y canonicalMessageJson cubren sus guardas', () => {
    expect(isVerifyingContractMismatch(null, '0x')).toBe(false);
    expect(isVerifyingContractMismatch(ZERO_ADDRESS as Address, null)).toBe(true);
    expect(isVerifyingContractMismatch(CUENTA_1, '0x')).toBe(true);
    expect(isVerifyingContractMismatch(CUENTA_1, '0x0')).toBe(true);
    expect(isVerifyingContractMismatch(CUENTA_1, '0x1234')).toBe(false);
    expect(isVerifyingContractMismatch(CUENTA_1, null)).toBe(false);
    expect(canonicalMessageJson({ amount: 10n })).toBe('{"amount":"10"}');
  });
});

/** Comprueba el caso «nodo caído» sin inventarse la comprobación de despliegue. */
const nodoCaidoMismatch = (preview: TypedDataPreviewResult): boolean =>
  preview.verifyingContractMismatch === false;

describe('M19 · buildPersonalSignPreview (M19.c) y CA-RF-21', () => {
  it('hexadecimal legible como UTF-8 → texto y `isHexPayload: false`', () => {
    const preview = buildPersonalSignPreview('0x686f6c61');
    expect(preview.text).toBe('hola');
    expect(preview.isHexPayload).toBe(false);
    expect(preview.truncated).toBe(false);
    expect(preview.byteLength).toBe(4);
    expect(preview.bytesHex).toBe('0x686f6c61');
    expect(preview.payloadHash.startsWith('sha256:')).toBe(true);
    expect(personalSignRiskWarnings(preview)).toEqual([]);
  });

  it('hexadecimal NO legible → `text: null`, `isHexPayload: true` y aviso (CA-RF-21)', () => {
    const preview = buildPersonalSignPreview('0xfffe');
    expect(preview.text).toBeNull();
    expect(preview.isHexPayload).toBe(true);
    expect(preview.byteLength).toBe(2);
    expect(personalSignRiskWarnings(preview)).toContain(RISK_WARNINGS.unreadableContent);
  });

  it('texto plano y bytes UTF-8 se firman con su `bytesHex`', () => {
    const texto = buildPersonalSignPreview('hola mundo');
    expect(texto.text).toBe('hola mundo');
    expect(texto.isHexPayload).toBe(false);
    expect(texto.bytesHex).toBe('0x686f6c61206d756e646f');

    const bytes = buildPersonalSignPreview(new TextEncoder().encode('hola'));
    expect(bytes.text).toBe('hola');
    expect(bytes.bytesHex).toBe('0x686f6c61');
    expect(bytes.payloadHash.startsWith('sha256:')).toBe(true);
  });

  it('hexadecimal de longitud impar y valores no textuales se degradan sin lanzar', () => {
    // `0x1` es hexadecimal «con forma» pero `getBytes` no lo acepta: se firma su texto.
    const impar = buildPersonalSignPreview('0x1');
    expect(impar.text).toBe('0x1');
    expect(impar.bytesHex).toBe('0x307831');

    // Ni texto ni bytes → payload VACÍO (determinista y visible en la vista previa).
    const basura = buildPersonalSignPreview(42 as unknown as string);
    expect(basura.byteLength).toBe(0);
    expect(basura.bytesHex).toBe('0x');
    expect(basura.text).toBe('');
  });

  it('bytes no UTF-8 válidos se firman con texto vacío (no se inventa contenido)', () => {
    const invalido = buildPersonalSignPreview(new Uint8Array([0xff, 0xfe, 0xfd]));
    expect(invalido.text).toBe('');
    expect(invalido.isHexPayload).toBe(false);
    expect(invalido.byteLength).toBe(3);
    expect(invalido.bytesHex).toBe('0xfffefd');
  });

  it('mensaje por encima de 4096 bytes → extracto y aviso de longitud (ADT-21)', () => {
    const largo = 'a'.repeat(5000);
    const preview = buildPersonalSignPreview(largo);
    expect(preview.truncated).toBe(true);
    expect(preview.text).toHaveLength(4096);
    expect(personalSignRiskWarnings(preview)).toContain(RISK_WARNINGS.longMessage);
  });

  it('el extracto no parte un carácter multibyte', () => {
    const texto = `${'a'.repeat(4095)}é${'b'.repeat(10)}`;
    const preview = buildPersonalSignPreview(texto);
    expect(preview.truncated).toBe(true);
    expect(preview.text).toBe('a'.repeat(4095));
  });

  it('isReadableText rechaza reemplazos y controles, y admite tabulador y salto', () => {
    expect(isReadableText('hola')).toBe(true);
    expect(isReadableText('linea\n\totra\r')).toBe(true);
    expect(isReadableText('roto\uFFFD')).toBe(false);
    expect(isReadableText('control\u0001')).toBe(false);
  });
});

describe('M19 · buildApprovalPreview: entrada única por método', () => {
  it('eth_sendTransaction usa el `from` del parámetro y cae al contexto si falta', async () => {
    const conFrom = await buildApprovalPreview(
      'eth_sendTransaction',
      [{ from: CUENTA_1, to: CUENTA_1, data: TRANSFER }],
      { from: CUENTA_0, chainId: '0x7a69', toLabel: 'Destino' },
    );
    expect(conFrom?.kind).toBe('tx');
    if (conFrom?.kind !== 'tx') return;
    expect(conFrom.txPreview.from).toBe(CUENTA_1);
    expect(conFrom.txPreview.toLabel).toBe('Destino');

    const sinFrom = await buildApprovalPreview('eth_sendTransaction', [{ to: CUENTA_1 }], {
      from: CUENTA_0,
      chainId: '0x7a69',
    });
    expect(sinFrom?.kind).toBe('tx');
    if (sinFrom?.kind !== 'tx') return;
    expect(sinFrom.txPreview.from).toBe(CUENTA_0);
    expect(sinFrom.txPreview.to).toBe(CUENTA_1);
  });

  it('eth_sendTransaction admite `params` como objeto suelto y aplica el contexto', async () => {
    const preview = await buildApprovalPreview(
      'eth_sendTransaction',
      { to: CUENTA_1, gas: '50000', maxFeePerGas: '7', maxPriorityFeePerGas: '3', gasPrice: '9', nonce: '4' },
      {
        from: CUENTA_0,
        chainId: '0x7a69',
        balanceWei: '5',
        gasLimit: '1',
        maxFeePerGas: '2',
        maxPriorityFeePerGas: '2',
        gasPrice: '2',
        nonceInformativo: '1',
        estimationFailed: { reason: 'x' },
      },
    );
    expect(preview?.kind).toBe('tx');
    if (preview?.kind !== 'tx') return;
    // Los parámetros de la dApp mandan sobre el contexto.
    expect(preview.txPreview.gasLimit).toBe('0');
    expect(preview.txPreview.maxFeePerGas).toBe('7');
    expect(preview.txPreview.maxPriorityFeePerGas).toBe('3');
    expect(preview.txPreview.nonceInformativo).toBe(4);
  });

  it('eth_signTypedData_v4 construye la vista del dominio declarado', async () => {
    const preview = await buildApprovalPreview(
      'eth_signTypedData_v4',
      [
        CUENTA_0,
        {
          domain: { name: 'TrueKeate', chainId: 1 },
          types: { EIP712Domain: [{ name: 'name', type: 'string' }], Permit: [{ name: 'x', type: 'uint256' }] },
          message: { x: '1' },
          primaryType: 'Permit',
        },
      ],
      { from: CUENTA_0, chainId: '0x7a69' },
    );
    expect(preview?.kind).toBe('typedData');
    if (preview?.kind !== 'typedData') return;
    expect(preview.typedDataPreview.primaryType).toBe('Permit');
    expect(preview.typedDataPreview.domainChainMismatch).toBe(true);
    expect(preview.typedDataPreview.types).toEqual({ Permit: [{ name: 'x', type: 'uint256' }] });
  });

  it('eth_signTypedData_v4 con datos malformados no inventa dominio, tipos ni mensaje', async () => {
    const preview = await buildApprovalPreview(
      'eth_signTypedData_v4',
      [CUENTA_0, { domain: 'x', types: 'y', message: 'z', primaryType: 7 }],
      { from: CUENTA_0, chainId: '0x7a69' },
    );
    expect(preview?.kind).toBe('typedData');
    if (preview?.kind !== 'typedData') return;
    expect(preview.typedDataPreview.domain).toEqual({});
    expect(preview.typedDataPreview.types).toEqual({});
    expect(preview.typedDataPreview.message).toEqual({});
    expect(preview.typedDataPreview.primaryType).toBe('');
  });

  it('personal_sign construye la vista del mensaje y el resto de métodos no tienen vista', async () => {
    const preview = await buildApprovalPreview('personal_sign', ['hola', CUENTA_0], {
      from: CUENTA_0,
      chainId: '0x7a69',
    });
    expect(preview?.kind).toBe('personalSign');
    if (preview?.kind !== 'personalSign') return;
    expect(preview.signMessagePreview.text).toBe('hola');

    expect(
      await buildApprovalPreview('wallet_switchEthereumChain', [{}], { from: CUENTA_0, chainId: '0x7a69' }),
    ).toBeNull();
    expect(
      await buildApprovalPreview('wallet_addEthereumChain', [{}], { from: CUENTA_0, chainId: '0x7a69' }),
    ).toBeNull();
    expect(
      await buildApprovalPreview('wallet_revokePermissions', [], { from: CUENTA_0, chainId: '0x7a69' }),
    ).toBeNull();
  });
});
