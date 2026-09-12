/**
 * M19.b — `src/background/approvals/dispatch.spec.ts`
 * Especificación de la **ruta de producción de los 6 métodos aprobables** (H4, cierre de
 * `D-H4-E1`): vista previa (M19) → cola (M14) → plazo (M15) → ventana única (M18) → decisión
 * (M14.b) → efecto (M11/M7).
 *
 * Criterios que fija este fichero:
 * - `CA-RF-08`: la aprobación de un `eth_sendTransaction` termina en `signTransaction` +
 *   `eth_sendRawTransaction` y devuelve el **hash al difundir**; la marca en vuelo pasa a
 *   `broadcast` (la cuenta queda liberada) y ante un fallo se LIBERA.
 * - `CA-RF-19`/`CA-RF-21`: la solicitud que llega a la cola lleva su vista previa (tx / mensaje) y
 *   la respuesta de las firmas es `0x` + 130 hex.
 * - `CA-RF-35`: entre preview y ventana el orden es ENQUEUE → ARMAR PLAZO → `showOldestPending`.
 * - RNF-25: un `estimateGas` fallido responde `-32000` **sin** encolar y **sin** abrir ventana.
 * - RNF-11: la cuenta que firma es SIEMPRE la de la sesión; otra cuenta → `4100` sin ventana.
 * - §2.12: una segunda transacción de la misma cuenta con marca `signing` vigente → `-32000`
 *   `inflightTxInProgress`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chromeStub } from '../../../test/setup/chrome-stub';
import type { Address, PendingRequest } from '../../shared/types';
import { STORAGE_KEYS } from '../state/schema';
import { estimateGasFailedError, inflightTxInProgressError } from '../rpc/errors';
import type { TrustedSenderContext } from '../security/senderGuard';
import { dispatchApproval, resolveApprovalOrigin, type ApprovalDispatchDeps } from './dispatch';
import { settleApprovalDecision, waitForApprovalResolution } from './decisions';
import type { PendingRequestDraft } from './queue';

/** Cuenta #0 de Anvil (la de la sesión de la dApp). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;

/** Cuenta #1 de Anvil (destino y cuenta NO autorizada). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

/** Origen de la dApp de pruebas. */
const ORIGEN = 'http://localhost:5174';

/**
 * Reloj de la prueba. La sesión de `truekeate_connected_sites` caduca a las 24 h REALES
 * (`currentSessionFor` usa `Date.now()`), así que el instante inyectado tiene que ser actual; si
 * no, la ruta respondería `4100` por sesión vencida y la prueba mediría otra cosa.
 */
const ahora = (): number => Date.now();

/** `chainId` de Anvil. */
const CHAIN_ID = '0x7a69';

/** Hash devuelto por `eth_sendRawTransaction` en la prueba. */
const HASH = `0x${'ab'.repeat(32)}` as `0x${string}`;

/** Contexto confiable del emisor: una dApp con sesión vigente. */
const contexto = (): TrustedSenderContext => ({
  runtimeId: 'tk-stub-extension-id-for-tests',
  origin: ORIGEN,
  isExtensionContext: false,
  route: null,
  tabId: 11,
  frameId: 0,
  respondToFrameOnly: false,
  declaredOrigin: ORIGEN,
});

/** Sesión vigente del origen, red activa (Anvil) y etiquetas locales. */
const sembrarSesion = async (): Promise<void> => {
  await chromeStub.storage.local.set({
    [STORAGE_KEYS.connectedSites]: {
      [ORIGEN]: {
        origin: ORIGEN,
        account: CUENTA_0,
        chainId: CHAIN_ID,
        tabIds: [11],
        connectedAt: ahora(),
        lastUsedAt: ahora(),
        expiresAt: ahora() + 86_400_000,
      },
    },
    [STORAGE_KEYS.chainId]: CHAIN_ID,
    [STORAGE_KEYS.networks]: {
      [CHAIN_ID]: {
        chainId: CHAIN_ID,
        chainIdDecimal: 31_337,
        name: 'Anvil Local',
        rpcUrl: 'http://127.0.0.1:8545',
        symbol: 'ETH',
        decimals: 18,
        isTestnet: true,
        isDefault: true,
      },
    },
    [STORAGE_KEYS.settings]: { accountLabels: {} },
  });
};

/** Orden observable de las llamadas del despacho. */
const orden: string[] = [];

/**
 * Solicitud ya resuelta que devuelve la espera simulada. Conserva el MÉTODO y los `params`
 * ORIGINALES del borrador encolado: son el payload de firma (§2.8), y sin ellos el efecto de la
 * aprobación no tendría nada que firmar.
 */
const aprobada = (approvalId: string, draft: PendingRequestDraft | null): PendingRequest => ({
  approvalId,
  method: draft?.method ?? 'eth_sendTransaction',
  params: draft === null ? [] : [...draft.params],
  origin: draft?.origin ?? ORIGEN,
  tabId: draft?.tabId ?? 11,
  frameId: draft?.frameId ?? 0,
  account: draft?.account ?? CUENTA_0,
  chainId: draft?.chainId ?? CHAIN_ID,
  createdAt: ahora(),
  expiresAt: ahora() + 120_000,
  status: 'approved',
  resolvedAt: ahora() + 1,
});

/** Espera que aprueba de inmediato (sustituye a la promesa real de M14.b en las pruebas). */
const esperaAprobada = (
  approvalId: string,
  draft: PendingRequestDraft | null,
): ReturnType<ApprovalDispatchDeps['wait']> => ({
  decision: Promise.resolve({
    ok: true,
    resolution: {
      request: aprobada(approvalId, draft),
      status: 'approved',
      resolvedAt: ahora() + 1,
    },
  }),
  cancel: () => undefined,
});

/** Dependencias espía creadas por `buildDeps`. */
interface DepsEspia {
  deps: ApprovalDispatchDeps;
  enqueue: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
}

/** Dependencias espía: ninguna toca almacén, red ni ventanas reales. */
const buildDeps = (overrides: Partial<ApprovalDispatchDeps> = {}): DepsEspia => {
  /** Último borrador encolado: es lo que la espera simulada devuelve ya resuelto. */
  let ultimoBorrador: PendingRequestDraft | null = null;
  const enqueue = vi.fn(async (draft: PendingRequestDraft) => {
    orden.push('enqueue');
    ultimoBorrador = draft;
    const request: PendingRequest = {
      approvalId: 'aprobacion-1',
      method: draft.method,
      params: [...draft.params],
      origin: draft.origin,
      tabId: draft.tabId ?? null,
      frameId: draft.frameId ?? null,
      account: draft.account,
      chainId: draft.chainId,
      createdAt: ahora(),
      expiresAt: ahora() + 120_000,
      status: 'pending',
      ...(draft.txPreview === undefined ? {} : { txPreview: draft.txPreview }),
      ...(draft.typedDataPreview === undefined ? {} : { typedDataPreview: draft.typedDataPreview }),
      ...(draft.signMessagePreview === undefined
        ? {}
        : { signMessagePreview: draft.signMessagePreview }),
    };
    return { ok: true as const, request, pendingCount: 1, shouldShow: true };
  });
  const show = vi.fn(async () => {
    orden.push('show');
    return {
      action: 'opened' as const,
      windowId: 5,
      shownApprovalId: 'aprobacion-1',
      pendingCount: 1,
      reason: 'prueba',
    };
  });
  const armExpiry = vi.fn((_approvalId: string, _expiresAt: number) => {
    orden.push('armExpiry');
    return true;
  });
  const wait = vi.fn((approvalId: string) => {
    orden.push('wait');
    return esperaAprobada(approvalId, ultimoBorrador);
  });
  const deps: ApprovalDispatchDeps = {
    enqueue: enqueue as unknown as ApprovalDispatchDeps['enqueue'],
    show: show as unknown as ApprovalDispatchDeps['show'],
    armExpiry: armExpiry as unknown as ApprovalDispatchDeps['armExpiry'],
    signTransaction: vi.fn(async () => ({
      rawTransaction: '0x02f8',
      hash: HASH,
      from: CUENTA_0,
      to: null,
      txType: 2,
      chainId: 31_337,
      chainIdHex: CHAIN_ID,
      v: 1,
      yParity: 1,
      r: `0x${'1'.repeat(64)}`,
      s: `0x${'2'.repeat(64)}`,
      nonce: 4,
      gasLimit: '21000',
      maxFeePerGas: '2000000000',
      maxPriorityFeePerGas: '1000000000',
    })) as unknown as ApprovalDispatchDeps['signTransaction'],
    signTypedData: vi.fn(async () => ({
      signature: `0x${'3'.repeat(130)}`,
      from: CUENTA_0,
      digest: `0x${'4'.repeat(64)}`,
      primaryType: 'SignMessage',
      types: {},
      domain: {},
    })) as unknown as ApprovalDispatchDeps['signTypedData'],
    signPersonalMessage: vi.fn(async () => ({
      signature: `0x${'5'.repeat(130)}`,
      from: CUENTA_0,
      messageHash: `0x${'6'.repeat(64)}`,
      prefix: 'eip191',
      byteLength: 4,
    })) as unknown as ApprovalDispatchDeps['signPersonalMessage'],
    broadcast: vi.fn(async () => HASH) as unknown as ApprovalDispatchDeps['broadcast'],
    readNonce: vi.fn(async () => 4) as unknown as ApprovalDispatchDeps['readNonce'],
    readFees: vi.fn(async () => ({
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    })) as unknown as ApprovalDispatchDeps['readFees'],
    estimate: vi.fn(async () => ({
      ok: true as const,
      gasLimit: '0x5208',
    })) as unknown as ApprovalDispatchDeps['estimate'],
    readCode: vi.fn(async () => '0x') as unknown as ApprovalDispatchDeps['readCode'],
    beginInflight: vi.fn(async () => ({
      ok: true as const,
      entry: {
        account: CUENTA_0,
        approvalId: 'aprobacion-1',
        phase: 'signing' as const,
        nonce: 4,
        txHash: null,
        startedAt: ahora(),
        expiresAt: ahora() + 180_000,
      },
    })) as unknown as ApprovalDispatchDeps['beginInflight'],
    markBroadcast: vi.fn(async () => null) as unknown as ApprovalDispatchDeps['markBroadcast'],
    releaseInflight: vi.fn(async () => true) as unknown as ApprovalDispatchDeps['releaseInflight'],
    deliver: vi.fn(async () => 'none' as const) as unknown as ApprovalDispatchDeps['deliver'],
    wait: wait as unknown as ApprovalDispatchDeps['wait'],
    log: vi.fn(async () => []) as unknown as ApprovalDispatchDeps['log'],
    emitEvent: vi.fn(async () => 1) as unknown as ApprovalDispatchDeps['emitEvent'],
    ...overrides,
  };
  return { deps, enqueue, show };
};

/** Parámetros de un `eth_sendTransaction` de 1 ETH desde la cuenta de la sesión. */
const transferencia = (): unknown[] => [
  { from: CUENTA_0, to: CUENTA_1, value: '0xde0b6b3a7640000' },
];

beforeEach(async () => {
  orden.length = 0;
  await chromeStub.storage.local.clear();
  await sembrarSesion();
});

describe('M19.b · ruta de los 6 métodos aprobables', () => {
  it('eth_sendTransaction: preview → cola → plazo → ventana → firma → difusión → hash', async () => {
    const { deps, enqueue, show } = buildDeps();

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: transferencia(),
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado).toEqual({ ok: true, result: HASH });
    // Orden EXACTO de §3.1: primero se encola, después se arma el plazo y por último la ventana.
    expect(orden).toEqual(['enqueue', 'armExpiry', 'wait', 'show']);

    // La solicitud encolada lleva su vista previa decodificada.
    const draft = enqueue.mock.calls[0]?.[0] as PendingRequestDraft;
    expect(draft.method).toBe('eth_sendTransaction');
    expect(draft.origin).toBe(ORIGEN);
    expect(draft.account).toBe(CUENTA_0);
    expect(draft.txPreview?.from).toBe(CUENTA_0);
    expect(draft.txPreview?.toLabel).toBe('desconocido');
    expect(draft.txPreview?.valueWei).toBe('1000000000000000000');
    expect(draft.txPreview?.txType).toBe(2);

    // Firma tipo 2 con el `nonce` y las comisiones RECALCULADOS al aprobar (H-10).
    const firma = (deps.signTransaction as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as { nonce: number; chainId: string; gasLimit: string };
    expect(firma.nonce).toBe(4);
    expect(firma.chainId).toBe(CHAIN_ID);
    expect(firma.gasLimit).toBe('0x5208');

    // Se difunde y la marca en vuelo pasa a `broadcast` (la cuenta queda liberada).
    expect(deps.broadcast).toHaveBeenCalledWith('0x02f8');
    expect(deps.markBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ account: CUENTA_0, txHash: HASH, nonce: 4 }),
    );
    expect(deps.releaseInflight).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('un `estimateGas` fallido responde -32000 SIN encolar y SIN abrir ventana (RNF-25)', async () => {
    const error = estimateGasFailedError('execution reverted');
    const { deps, enqueue, show } = buildDeps({
      estimate: vi.fn(async () => ({
        ok: false as const,
        error,
      })) as unknown as ApprovalDispatchDeps['estimate'],
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: transferencia(),
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado).toEqual({ ok: false, error });
    expect(enqueue).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it('una cuenta distinta de la de la sesión responde 4100 sin abrir ventana (RNF-11)', async () => {
    const { deps, enqueue, show } = buildDeps();

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_1, to: CUENTA_1, value: '0x1' }],
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(4100);
    expect(enqueue).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it('sin sesión vigente para el origen responde 4100 y no toca la cola', async () => {
    await chromeStub.storage.local.set({ [STORAGE_KEYS.connectedSites]: {} });
    const { deps, enqueue } = buildDeps();

    const resultado = await dispatchApproval({
      method: 'personal_sign',
      params: ['hola', CUENTA_0],
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(4100);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('personal_sign devuelve la firma 0x+130 hex y encola su vista previa legible', async () => {
    const { deps, enqueue } = buildDeps();

    const resultado = await dispatchApproval({
      method: 'personal_sign',
      params: ['hola', CUENTA_0],
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado.ok).toBe(true);
    expect(String(resultado.ok ? resultado.result : '')).toMatch(/^0x[0-9a-fA-F]{130}$/);
    const draft = enqueue.mock.calls[0]?.[0] as PendingRequestDraft;
    expect(draft.signMessagePreview?.text).toBe('hola');
    expect(draft.signMessagePreview?.isHexPayload).toBe(false);
  });

  it('eth_signTypedData_v4 encola la preview EIP-712 y devuelve la firma', async () => {
    const { deps, enqueue } = buildDeps();
    const typedData = {
      types: { EIP712Domain: [], SignMessage: [{ name: 'content', type: 'string' }] },
      primaryType: 'SignMessage',
      domain: { name: 'TrueKeate Test App', version: '1', chainId: 31_337 },
      message: { content: 'hola' },
    };

    const resultado = await dispatchApproval({
      method: 'eth_signTypedData_v4',
      params: [CUENTA_0, JSON.stringify(typedData)],
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado.ok).toBe(true);
    expect(String(resultado.ok ? resultado.result : '')).toMatch(/^0x[0-9a-fA-F]{130}$/);
    const draft = enqueue.mock.calls[0]?.[0] as PendingRequestDraft;
    expect(draft.typedDataPreview?.domainName).toBe('TrueKeate Test App');
    expect(draft.typedDataPreview?.primaryType).toBe('SignMessage');
  });

  it('una segunda transacción de la misma cuenta responde -32000 inflightTxInProgress (§2.12)', async () => {
    const error = inflightTxInProgressError({
      reason: 'inflight-signing',
      account: CUENTA_0,
      approvalId: 'otra',
    });
    const { deps } = buildDeps({
      beginInflight: vi.fn(async () => ({
        ok: false as const,
        error,
        holder: null,
      })) as unknown as ApprovalDispatchDeps['beginInflight'],
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: transferencia(),
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(-32000);
    // No se difunde NADA y la marca del TITULAR previo no se toca: `beginInflightTx` no llegó a
    // tomarla, así que liberarla dejaría a la primera transacción sin su exclusión mutua.
    expect(deps.broadcast).not.toHaveBeenCalled();
    expect(deps.releaseInflight).not.toHaveBeenCalled();
  });

  it('un rechazo del usuario (4001) no firma, no difunde y deja la cuenta libre', async () => {
    const { deps } = buildDeps({
      wait: vi.fn(() => ({
        decision: Promise.resolve({
          ok: false as const,
          resolution: null,
          reason: 'abandoned' as const,
        }),
        cancel: () => undefined,
      })) as unknown as ApprovalDispatchDeps['wait'],
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: transferencia(),
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(4001);
    expect(resultado.ok ? null : resultado.error.message).toBe('Operación cancelada por el usuario.');
    expect(deps.signTransaction).not.toHaveBeenCalled();
    expect(deps.broadcast).not.toHaveBeenCalled();
  });

  it('wallet_switchEthereumChain a la red YA activa responde null sin ventana (DEC-29/P-19)', async () => {
    const { deps, enqueue, show } = buildDeps();

    const resultado = await dispatchApproval({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID }],
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado).toEqual({ ok: true, result: null });
    expect(enqueue).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it('wallet_switchEthereumChain a una red NO dada de alta responde 4901 sin ventana', async () => {
    const { deps, enqueue, show } = buildDeps();

    const resultado = await dispatchApproval({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }],
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(4901);
    expect(enqueue).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });

  it('wallet_switchEthereumChain aprobado activa la red y emite chainChanged (RF-24)', async () => {
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.networks]: {
        [CHAIN_ID]: {
          chainId: CHAIN_ID,
          chainIdDecimal: 31_337,
          name: 'Anvil Local',
          rpcUrl: 'http://127.0.0.1:8545',
          symbol: 'ETH',
          decimals: 18,
          isTestnet: true,
          isDefault: true,
        },
        '0x1': {
          chainId: '0x1',
          chainIdDecimal: 1,
          name: 'Ethereum',
          rpcUrl: 'https://rpc.example',
          symbol: 'ETH',
          decimals: 18,
          isTestnet: false,
          isDefault: false,
        },
      },
    });
    const { deps } = buildDeps();

    const resultado = await dispatchApproval({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }],
      context: contexto(),
      deps,
      now: ahora(),
    });

    expect(resultado).toEqual({ ok: true, result: null });
    const stored = (await chromeStub.storage.local.get(STORAGE_KEYS.chainId)) ?? {};
    expect(stored[STORAGE_KEYS.chainId]).toBe('0x1');
    expect(deps.emitEvent).toHaveBeenCalledWith('chainChanged', '0x1');
  });

  it('resolveApprovalOrigin devuelve la cuenta de la sesión y la red activa', async () => {
    const origen = await resolveApprovalOrigin(contexto());

    expect(origen.account).toBe(CUENTA_0);
    expect(origen.chainId).toBe(CHAIN_ID);
    expect(origen.network?.name).toBe('Anvil Local');
  });

  it('el desenlace de la cola despierta a quien espera (M14.b ↔ M14)', async () => {
    const waiter = waitForApprovalResolution('integracion');
    settleApprovalDecision({
      request: aprobada('integracion', null),
      status: 'approved',
      resolvedAt: ahora() + 1,
    });

    const decision = await waiter.decision;
    expect(decision.ok).toBe(true);
    expect(decision.ok ? decision.resolution.status : null).toBe('approved');
  });
});