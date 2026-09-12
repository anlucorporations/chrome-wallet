/**
 * M19.b — `src/background/approvals/dispatch.ts` (spec del árbol `test/oracle/`)
 * Ruta de PRODUCCIÓN de los 6 métodos aprobables: contexto de la sesión del origen (RNF-11),
 * bloqueo previo por `estimateGas` (`-32000`, RNF-25), alta en la cola + plazo + ventana única,
 * espera de la decisión y efecto según el método (RF-19/RF-22/RF-23). Se fija el contrato
 * observable: `result` o error EIP-1193 con `code` de §4.3 (`4100`, `4001`, `4900`, `4901`,
 * `-32000`, `-32602`, `-32603`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../setup/chrome-stub';
import { DEFAULT_RPC_URL } from '../../src/shared/constants';
import { STORAGE_KEYS } from '../../src/background/state/schema';
import type { TrustedSenderContext } from '../../src/background/security/senderGuard';
import {
  asNetworkRecord,
  assertSessionAccount,
  buildPreviewFields,
  defaultApprovalDispatchDeps,
  dispatchApproval,
  estimationFailureOf,
  requestHostPermission,
  resolveApprovalOrigin,
  runApprovalCycle,
  storedNetworkFrom,
  transactionFieldsOf,
  type ApprovalDispatchDeps,
} from '../../src/background/approvals/dispatch';
import type { ResolvedRequest } from '../../src/background/approvals/queue';
import type { PendingRequestDraft } from '../../src/background/approvals/queue';
import type { Address, Eip1193Error, PendingRequest } from '../../src/shared/types';

// El nodo no existe en el arnés: se sustituyen las DOS dependencias de red de la ruta para que
// las pruebas midan el contrato del despacho (no el cliente RPC, que tiene su propia especificación).
vi.mock('../../src/background/rpc/client', () => ({
  getBalanceWei: vi.fn(async () => '1000000000000000000'),
  rpcSend: vi.fn(async () => '0x1'),
  getRpcProvider: vi.fn(() => {
    throw new Error('sin nodo en el arnés');
  }),
}));

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
/** Cuenta #1 de Anvil (EIP-55). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
/** Origen canónico de la dApp de pruebas. */
const ORIGEN = 'https://dapp.example';

/** Contexto confiable de una dApp conectada. */
const contexto = (overrides: Partial<TrustedSenderContext> = {}): TrustedSenderContext => ({
  runtimeId: chromeStub.runtime.id,
  origin: ORIGEN,
  isExtensionContext: false,
  route: null,
  tabId: 3,
  frameId: 0,
  respondToFrameOnly: false,
  declaredOrigin: null,
  ...overrides,
});

/** Entrada persistida con la forma de §2.8. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_1, value: '0x1' }],
  origin: ORIGEN,
  tabId: 3,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + 120_000,
  status: 'pending',
  ...overrides,
});

/** Resolución de una entrada (forma de `ResolvedRequest`). */
const resuelta = (status: 'approved' | 'rejected' | 'expired'): ResolvedRequest => ({
  request: { ...entrada('id-1'), status },
  status,
  resolvedAt: STUB_EPOCH_MS,
  ...(status === 'approved' ? {} : { errorCode: 4001 }),
});

/** Siembra una sesión vigente de dApp para el origen. */
const sembrarSesion = async (origin: string = ORIGEN, account: Address = CUENTA_0): Promise<void> => {
  await chromeStub.storage.local.set({
    [STORAGE_KEYS.connectedSites]: {
      [origin]: {
        origin,
        account,
        chainId: '0x7a69',
        tabIds: [3],
        connectedAt: STUB_EPOCH_MS,
        lastUsedAt: STUB_EPOCH_MS,
        expiresAt: null,
        connected: true,
      },
    },
  });
};

/** Dependencias del despacho con dobles deterministas (sin red, sin cola real y sin ventanas). */
const depsDoble = (overrides: Partial<ApprovalDispatchDeps> = {}): ApprovalDispatchDeps => {
  // La decisión aprobada devuelve la MISMA solicitud que se encoló: es lo que hace el ciclo real.
  let borrador: PendingRequestDraft | null = null;
  const base: ApprovalDispatchDeps = {
    enqueue: (async (draft: PendingRequestDraft) => {
      borrador = draft;
      return {
        ok: true,
        request: {
          ...entrada('id-1'),
          method: draft.method,
          params: draft.params,
          origin: draft.origin,
          account: draft.account,
          chainId: draft.chainId,
          tabId: draft.tabId ?? null,
          frameId: draft.frameId ?? null,
        },
        pendingCount: 1,
        purgedExpired: [],
        shouldShow: true,
      };
    }) as never,
    show: (async () => ({
      action: 'opened',
      windowId: 1,
      shownApprovalId: 'id-1',
      pendingCount: 1,
      reason: 'primera-apertura',
    })) as never,
    armExpiry: (() => true) as never,
    signTransaction: (async () => ({ rawTransaction: '0xraw', signature: '0xsig' })) as never,
    signTypedData: (async () => ({ signature: `0x${'a'.repeat(130)}` })) as never,
    signPersonalMessage: (async () => ({ signature: `0x${'b'.repeat(130)}` })) as never,
    broadcast: (async () => '0xhash-difundido') as never,
    readNonce: (async () => 3) as never,
    readFees: (async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n })) as never,
    estimate: (async () => ({ ok: true, gasLimit: '21000' })) as never,
    readCode: (async () => '0x1234') as never,
    beginInflight: (async () => ({ ok: true, entry: { account: CUENTA_0 } })) as never,
    markBroadcast: (async () => null) as never,
    releaseInflight: (async () => true) as never,
    deliver: (async () => 'none') as never,
    wait: (() => ({
      decision: Promise.resolve({
        ok: true,
        resolution: { request: { ...(borrador as unknown as PendingRequest) }, status: 'approved', resolvedAt: STUB_EPOCH_MS },
      }),
      cancel: () => undefined,
    })) as never,
    log: (async () => []) as never,
    emitEvent: (async () => 1) as never,
  };
  return { ...base, ...overrides };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('M19.b · contexto de la sesión del origen (RNF-11)', () => {
  it('sin sesión vigente NO se abre nada: `4100`', async () => {
    await expect(resolveApprovalOrigin(contexto())).rejects.toMatchObject({ code: 4100 });
    await expect(resolveApprovalOrigin(contexto())).rejects.toMatchObject({
      data: { reason: 'no-session-for-approval', origin: ORIGEN },
    });
  });

  it('con sesión vigente devuelve la cuenta autorizada y la red activa', async () => {
    await sembrarSesion();

    const resuelto = await resolveApprovalOrigin(contexto());

    expect(resuelto.account).toBe(CUENTA_0);
    // Sin catálogo persistido la red activa es la de por defecto (Anvil, CA-RF-18).
    expect(resuelto.chainId).toBe('0x7a69');
    expect(resuelto.network?.isDefault).toBe(true);
  });

  it('la red activa persistida manda sobre la de por defecto cuando está dada de alta', async () => {
    await sembrarSesion();
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.chainId]: '0x2',
      [STORAGE_KEYS.networks]: {
        '0x2': {
          chainId: '0x2',
          chainIdDecimal: 2,
          name: 'Otra',
          rpcUrl: 'https://rpc.example',
          symbol: 'OTR',
          decimals: 18,
          isTestnet: false,
          isDefault: false,
        },
      },
    });

    const resuelto = await resolveApprovalOrigin(contexto());
    expect(resuelto.chainId).toBe('0x2');
    expect(resuelto.network?.name).toBe('Otra');
  });

  it('assertSessionAccount exige que la firma sea de la cuenta de la sesión', () => {
    expect(assertSessionAccount(null, CUENTA_0, ORIGEN)).toBe(CUENTA_0);
    expect(assertSessionAccount(CUENTA_0.toLowerCase() as Address, CUENTA_0, ORIGEN)).toBe(CUENTA_0);

    let capturado: unknown;
    try {
      assertSessionAccount(CUENTA_1, CUENTA_0, ORIGEN);
    } catch (error) {
      capturado = error;
    }
    expect(capturado).toMatchObject({ code: 4100 });
    expect((capturado as Eip1193Error).data).toMatchObject({
      reason: 'account-not-authorized',
      requested: CUENTA_1,
      authorized: CUENTA_0,
    });
  });
});

describe('M19.b · parámetros de red (EIP-3085)', () => {
  it('asNetworkRecord exige un objeto plano', () => {
    expect(asNetworkRecord({ chainId: '0x1' })).toEqual({ chainId: '0x1' });
    for (const valor of [null, 'texto', 7, [1]]) {
      expect(() => asNetworkRecord(valor)).toThrowError(
        expect.objectContaining({ code: -32603 }) as Error,
      );
    }
  });

  it('storedNetworkFrom proyecta el alta SIN activarla (`isDefault: false`)', () => {
    const completa = storedNetworkFrom({
      chainId: '0x1',
      chainIdDecimal: 1,
      chainName: 'Ethereum',
      rpcUrls: ['https://rpc.example'],
      nativeCurrency: { symbol: 'eth', decimals: 18 },
    });
    expect(completa).toEqual({
      chainId: '0x1',
      chainIdDecimal: 1,
      name: 'Ethereum',
      rpcUrl: 'https://rpc.example',
      symbol: 'eth',
      decimals: 18,
      isTestnet: false,
      isDefault: false,
    });

    const minima = storedNetworkFrom({ chainId: '0x2' });
    expect(minima).toEqual({
      chainId: '0x2',
      chainIdDecimal: 2,
      name: '0x2',
      rpcUrl: '',
      symbol: 'ETH',
      decimals: 18,
      isTestnet: false,
      isDefault: false,
    });

    expect(() => storedNetworkFrom({ chainId: 'no-hex' })).toThrowError(
      expect.objectContaining({ code: 4901 }) as Error,
    );
  });

  it('transactionFieldsOf y estimationFailureOf traducen el parámetro y el fallo', () => {
    expect(transactionFieldsOf([{ to: CUENTA_1 }])).toEqual({ to: CUENTA_1 });
    expect(transactionFieldsOf(['no-objeto'])).toEqual({});
    expect(estimationFailureOf(new Error('execution reverted'))).toEqual({
      code: -32000,
      message: 'La estimación de gas falló: execution reverted. El envío se ha bloqueado.',
    });
    expect(estimationFailureOf('fallo textual').message).toContain('fallo textual');
  });

  it('requestHostPermission pide el permiso del origen del `rpcUrl` en runtime (ACU-27/D-G)', async () => {
    // Sin `rpcUrl` no hay nada que conceder.
    await expect(requestHostPermission('')).resolves.toBeUndefined();

    // Sin API de permisos (contexto sin `chrome.permissions`) tampoco.
    const global = globalThis as { chrome?: unknown };
    const previo = global.chrome;
    try {
      global.chrome = {};
      await expect(requestHostPermission('https://rpc.example')).resolves.toBeUndefined();
    } finally {
      global.chrome = previo;
    }

    chromeStub.permissions.setGranted(true);
    await expect(requestHostPermission('https://rpc.example')).resolves.toBeUndefined();
    expect(chromeStub.permissions.grantedOrigins()).toContain('https://rpc.example/*');

    // Denegación explícita del usuario: `4001` (la red NO se persiste).
    chromeStub.permissions.setGranted(false);
    await expect(requestHostPermission('https://rpc.example')).rejects.toMatchObject({
      code: 4001,
      data: { reason: 'host-permission-denied', rpcUrl: 'https://rpc.example' },
    });

    // La API que rechaza (sin gesto de usuario) se trata igual: denegación.
    vi.spyOn(chromeStub.permissions, 'request').mockRejectedValue(new Error('sin gesto de usuario'));
    await expect(requestHostPermission('https://rpc.example')).rejects.toMatchObject({
      code: 4001,
    });
  });
});

describe('M19.b · vista previa por método y ciclo común', () => {
  it('buildPreviewFields solo construye la vista de los tres métodos con preview propia', async () => {
    const deps = depsDoble();
    const contextoPreview = { from: CUENTA_0, chainId: '0x7a69' as const, toLabel: 'Destino' };

    expect(await buildPreviewFields('wallet_switchEthereumChain', [], contextoPreview, deps)).toEqual({});
    expect(await buildPreviewFields('wallet_addEthereumChain', [], contextoPreview, deps)).toEqual({});
    expect(await buildPreviewFields('wallet_revokePermissions', [], contextoPreview, deps)).toEqual({});

    const tx = await buildPreviewFields(
      'eth_sendTransaction',
      [{ from: CUENTA_0, to: CUENTA_1, value: '0x1' }],
      contextoPreview,
      deps,
    );
    expect(tx.txPreview?.toLabel).toBe('Destino');

    const typed = await buildPreviewFields(
      'eth_signTypedData_v4',
      [CUENTA_0, { domain: {}, types: { Permit: [{ name: 'x', type: 'uint256' }] }, message: {} }],
      contextoPreview,
      deps,
    );
    expect(typed.typedDataPreview?.primaryType).toBe('Permit');
    expect(typed.typedDataPreview?.verifyingContractMismatch).toBe(false);

    const personal = await buildPreviewFields('personal_sign', ['hola', CUENTA_0], contextoPreview, deps);
    expect(personal.signMessagePreview?.text).toBe('hola');
  });

  it('runApprovalCycle: alta rechazada, abandono, aprobación, rechazo y vencimiento', async () => {
    const errorCola: Eip1193Error = { code: 4001, message: 'demasiadas pendientes' };
    const rechazada = await runApprovalCycle(
      { method: 'personal_sign', params: [], origin: ORIGEN, account: CUENTA_0, chainId: '0x7a69' },
      depsDoble({ enqueue: (async () => ({ ok: false, error: errorCola })) as never }),
      STUB_EPOCH_MS,
    );
    expect(rechazada).toEqual({ ok: false, approved: false, error: errorCola });

    const armadas: string[] = [];
    const mostradas: number[] = [];
    let cancelada = false;
    const depsComun = depsDoble({
      armExpiry: ((approvalId: string) => {
        armadas.push(approvalId);
        return true;
      }) as never,
      show: (async (options: { now?: number }) => {
        mostradas.push(options.now ?? 0);
        return { action: 'opened', windowId: 1, shownApprovalId: 'id-1', pendingCount: 1, reason: 'x' };
      }) as never,
      wait: (() => ({
        decision: Promise.resolve({ ok: false, resolution: null, reason: 'abandoned' as const }),
        cancel: () => {
          cancelada = true;
        },
      })) as never,
    });

    const abandonada = await runApprovalCycle(
      { method: 'personal_sign', params: [], origin: ORIGEN, account: CUENTA_0, chainId: '0x7a69' },
      depsComun,
      STUB_EPOCH_MS,
    );
    expect(abandonada).toMatchObject({ ok: true, approved: false });
    if (abandonada.ok && !abandonada.approved) {
      expect(abandonada.error.code).toBe(4001);
      expect(abandonada.error.data).toMatchObject({ reason: 'approval-abandoned' });
    }
    expect(armadas).toEqual(['id-1']);
    expect(mostradas).toEqual([STUB_EPOCH_MS]);
    expect(cancelada).toBe(true);

    const aprobada = await runApprovalCycle(
      { method: 'personal_sign', params: [], origin: ORIGEN, account: CUENTA_0, chainId: '0x7a69' },
      depsDoble(),
      STUB_EPOCH_MS,
    );
    expect(aprobada).toMatchObject({ ok: true, approved: true });

    for (const status of ['rejected', 'expired'] as const) {
      const desenlace = await runApprovalCycle(
        { method: 'personal_sign', params: [], origin: ORIGEN, account: CUENTA_0, chainId: '0x7a69' },
        depsDoble({
          wait: (() => ({
            decision: Promise.resolve({ ok: true, resolution: resuelta(status) }),
            cancel: () => undefined,
          })) as never,
        }),
        STUB_EPOCH_MS,
      );
      expect(desenlace).toMatchObject({ ok: true, approved: false });
      if (desenlace.ok && !desenlace.approved) {
        expect(desenlace.error.data).toMatchObject({
          reason: status === 'expired' ? 'approval-expired' : 'approval-rejected',
        });
      }
    }
  });
});

describe('M19.b · dispatchApproval: guardas del contexto y de la sesión', () => {
  it('sin sesión del origen responde `4100` sin abrir ventana', async () => {
    const deps = depsDoble();
    const enqueue = vi.fn(deps.enqueue);

    const resultado = await dispatchApproval({
      method: 'personal_sign',
      params: ['hola', CUENTA_0],
      context: contexto(),
      deps: { ...deps, enqueue: enqueue as never },
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4100);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('firmar con una cuenta NO autorizada responde `4100`', async () => {
    await sembrarSesion();

    const resultado = await dispatchApproval({
      method: 'personal_sign',
      params: ['hola', CUENTA_1],
      context: contexto(),
      deps: depsDoble(),
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4100);
    expect(resultado.error.data).toMatchObject({ reason: 'account-not-authorized' });
  });

  it('un fallo inesperado (no EIP-1193) se clasifica como `-32603`', async () => {
    await sembrarSesion();
    const deps = depsDoble({
      estimate: (async () => {
        throw new Error('explosión inesperada');
      }) as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1 }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32603);
    expect(resultado.error.data).toMatchObject({ reason: 'approval-dispatch-failed' });
  });
});

describe('M19.b · dispatchApproval: `eth_sendTransaction` de principio a fin', () => {
  it('estimación fallida ANTES de la ventana: `-32000` y nada encolado (RNF-25)', async () => {
    await sembrarSesion();
    const deps = depsDoble({
      estimate: (async () => ({
        ok: false,
        error: { code: -32000, message: 'La estimación de gas falló: revert. El envío se ha bloqueado.' },
      })) as never,
    });
    const enqueue = vi.fn(deps.enqueue);

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1, data: '0x' }],
      context: contexto(),
      deps: { ...deps, enqueue: enqueue as never },
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32000);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('aprobada: firma tipo 2 con nonce y comisiones releídos y devuelve el hash al difundir', async () => {
    await sembrarSesion();
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.settings]: { accountLabels: { [CUENTA_1]: 'Destino conocido' } },
    });
    const firmados: Array<Record<string, unknown>> = [];
    const difundidas: string[] = [];
    const marcas: Array<Record<string, unknown>> = [];
    const deps = depsDoble({
      signTransaction: (async (input: Record<string, unknown>) => {
        firmados.push(input);
        return { rawTransaction: '0xraw', signature: '0xsig' };
      }) as never,
      broadcast: (async (raw: string) => {
        difundidas.push(raw);
        return '0xhash-difundido';
      }) as never,
      markBroadcast: (async (options: Record<string, unknown>) => {
        marcas.push(options);
        return null;
      }) as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1, value: '0x2', data: '0x', gas: '0x5208' }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: '0xhash-difundido' });
    expect(firmados[0]).toMatchObject({
      from: CUENTA_0,
      to: CUENTA_1,
      nonce: 3,
      chainId: '0x7a69',
      activeChainId: '0x7a69',
      feeData: { maxFeePerGas: 2n, maxPriorityFeePerGas: 1n },
    });
    expect(difundidas).toEqual(['0xraw']);
    // La marca pasa a `broadcast`: la cuenta se libera (§2.12 regla 2).
    expect(marcas[0]).toMatchObject({ account: CUENTA_0, txHash: '0xhash-difundido', nonce: 3 });
  });

  it('la cuenta ya está en vuelo: `-32000` sin firmar ni difundir (§2.12 regla 5)', async () => {
    await sembrarSesion();
    const signTransaction = vi.fn(async () => ({ rawTransaction: '0xraw', signature: '0xsig' }));
    const deps = depsDoble({
      beginInflight: (async () => ({
        ok: false,
        error: { code: -32000, message: 'Ya hay una transacción de esta cuenta en vuelo.' },
        holder: null,
      })) as never,
      signTransaction: signTransaction as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1 }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32000);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('un fallo de firma/difusión LIBERA la marca y se clasifica como `-32603`', async () => {
    await sembrarSesion();
    const releaseInflight = vi.fn(async () => true);
    const deps = depsDoble({
      signTransaction: (async () => {
        throw new Error('la clave no está disponible');
      }) as never,
      releaseInflight: releaseInflight as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1 }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32603);
    expect(releaseInflight).toHaveBeenCalledWith(CUENTA_0);
  });

  it('un fallo al leer las comisiones para la VISTA PREVIA no impide aprobar y difundir', async () => {
    await sembrarSesion();
    let lecturas = 0;
    const deps = depsDoble({
      readFees: (async () => {
        lecturas += 1;
        if (lecturas === 1) {
          // La primera lectura es la de la vista previa: cae y se registra sin abortar nada.
          throw new Error('nodo sin feeData');
        }
        return { maxFeePerGas: 2n, maxPriorityFeePerGas: 1n };
      }) as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1 }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: '0xhash-difundido' });
    expect(lecturas).toBe(2);
  });

  it('la traza `tx_sent` caída no invalida la difusión', async () => {
    await sembrarSesion();
    const deps = depsDoble({
      log: (async () => {
        throw new Error('logs caídos');
      }) as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1 }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: '0xhash-difundido' });
  });

  it('el rechazo del usuario devuelve `4001` y `approval-abandoned` al descartarse', async () => {
    await sembrarSesion();
    const deps = depsDoble({
      wait: (() => ({
        decision: Promise.resolve({ ok: true, resolution: resuelta('rejected') }),
        cancel: () => undefined,
      })) as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_sendTransaction',
      params: [{ from: CUENTA_0, to: CUENTA_1 }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4001);
  });
});

describe('M19.b · dispatchApproval: firmas de mensaje', () => {
  it('`personal_sign` aprobado devuelve la firma de M11', async () => {
    await sembrarSesion();
    const firmados: Array<Record<string, unknown>> = [];
    const deps = depsDoble({
      signPersonalMessage: (async (input: Record<string, unknown>) => {
        firmados.push(input);
        return { signature: `0x${'b'.repeat(130)}` };
      }) as never,
    });

    const resultado = await dispatchApproval({
      method: 'personal_sign',
      params: ['hola', CUENTA_0],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: `0x${'b'.repeat(130)}` });
    expect(firmados[0]).toMatchObject({ from: CUENTA_0, message: 'hola' });
  });

  it('`eth_signTypedData_v4` aprobado devuelve la firma EIP-712', async () => {
    await sembrarSesion();
    const deps = depsDoble();

    const resultado = await dispatchApproval({
      method: 'eth_signTypedData_v4',
      params: [
        CUENTA_0,
        {
          domain: { name: 'TrueKeate' },
          types: { Permit: [{ name: 'x', type: 'uint256' }] },
          message: { x: '1' },
          primaryType: 'Permit',
        },
      ],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: `0x${'a'.repeat(130)}` });
  });

  it('`eth_signTypedData_v4` sin `typedData` no firma: `-32603`', async () => {
    await sembrarSesion();
    const deps = depsDoble();

    const resultado = await dispatchApproval({
      method: 'eth_signTypedData_v4',
      params: ['sin-datos'],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32603);
    expect(resultado.error.data).toMatchObject({ reason: 'invalid-typed-data-params' });
  });

  it('`eth_signTypedData_v4` con dominio, tipos y mensaje no utilizables firma objetos vacíos', async () => {
    await sembrarSesion();
    const firmados: Array<Record<string, unknown>> = [];
    const deps = depsDoble({
      signTypedData: (async (input: Record<string, unknown>) => {
        firmados.push(input);
        return { signature: `0x${'a'.repeat(130)}` };
      }) as never,
    });

    const resultado = await dispatchApproval({
      method: 'eth_signTypedData_v4',
      params: [CUENTA_0, { domain: 'x', types: 'y', message: 'z', primaryType: 7 }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado.ok).toBe(true);
    expect(firmados[0]).toMatchObject({ domain: {}, types: {}, message: {}, primaryType: null });
  });
});

describe('M19.b · dispatchApproval: métodos de red (M24/M25)', () => {
  it('`wallet_switchEthereumChain` a la red YA activa responde `null` sin cola (CA-RF-22)', async () => {
    await sembrarSesion();
    await chromeStub.storage.local.set({ [STORAGE_KEYS.chainId]: '0x7a69' });
    const enqueue = vi.fn(depsDoble().enqueue);

    const resultado = await dispatchApproval({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x7a69' }],
      context: contexto(),
      deps: { ...depsDoble(), enqueue: enqueue as never },
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: null });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('`wallet_switchEthereumChain` a una red no dada de alta responde `4901` sin ventana', async () => {
    await sembrarSesion();
    const enqueue = vi.fn(depsDoble().enqueue);

    const resultado = await dispatchApproval({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x5' }],
      context: contexto(),
      deps: { ...depsDoble(), enqueue: enqueue as never },
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4901);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('`wallet_switchEthereumChain` aprobado activa la red y emite `chainChanged` (RF-24)', async () => {
    await sembrarSesion();
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.chainId]: '0x7a69',
      [STORAGE_KEYS.networks]: {
        '0x5': {
          chainId: '0x5',
          chainIdDecimal: 5,
          name: 'Goerli',
          rpcUrl: DEFAULT_RPC_URL,
          symbol: 'ETH',
          decimals: 18,
          isTestnet: true,
          isDefault: false,
        },
      },
    });
    const eventos: Array<{ event: string; data: unknown }> = [];
    const deps = depsDoble({
      emitEvent: (async (event: string, data: unknown) => {
        eventos.push({ event, data });
        return 1;
      }) as never,
    });

    const resultado = await dispatchApproval({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x5' }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: null });
    expect(eventos).toEqual([{ event: 'chainChanged', data: '0x5' }]);
    const guardado = (await chromeStub.storage.local.get(STORAGE_KEYS.chainId)) as Record<string, unknown>;
    expect(guardado[STORAGE_KEYS.chainId]).toBe('0x5');
  });

  it('el rechazo del cambio de red devuelve `4001` y NO cambia la red activa', async () => {
    await sembrarSesion();
    await chromeStub.storage.local.set({
      [STORAGE_KEYS.chainId]: '0x7a69',
      [STORAGE_KEYS.networks]: {
        '0x5': {
          chainId: '0x5',
          chainIdDecimal: 5,
          name: 'Goerli',
          rpcUrl: DEFAULT_RPC_URL,
          symbol: 'ETH',
          decimals: 18,
          isTestnet: true,
          isDefault: false,
        },
      },
    });
    const deps = depsDoble({
      wait: (() => ({
        decision: Promise.resolve({ ok: true, resolution: resuelta('rejected') }),
        cancel: () => undefined,
      })) as never,
    });

    const resultado = await dispatchApproval({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x5' }],
      context: contexto(),
      deps,
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4001);
    const guardado = (await chromeStub.storage.local.get(STORAGE_KEYS.chainId)) as Record<string, unknown>;
    expect(guardado[STORAGE_KEYS.chainId]).toBe('0x7a69');
  });

  it('`wallet_addEthereumChain` con datos inválidos responde `-32602` sin abrir ventana', async () => {
    await sembrarSesion();
    const enqueue = vi.fn(depsDoble().enqueue);

    const resultado = await dispatchApproval({
      method: 'wallet_addEthereumChain',
      params: [{}],
      context: contexto(),
      deps: { ...depsDoble(), enqueue: enqueue as never },
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toMatchObject({ ok: false });
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32602);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('`wallet_addEthereumChain` aprobado persiste la red SIN activarla (ADT-25/P-22)', async () => {
    await sembrarSesion();
    await chromeStub.storage.local.set({ [STORAGE_KEYS.chainId]: '0x7a69' });
    chromeStub.permissions.setGranted(true);

    const resultado = await dispatchApproval({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0x1',
          chainName: 'Red de prueba',
          rpcUrls: ['https://rpc.example'],
          nativeCurrency: { symbol: 'TST', decimals: 18 },
        },
      ],
      context: contexto(),
      deps: depsDoble(),
      now: STUB_EPOCH_MS,
    });

    expect(resultado).toEqual({ ok: true, result: null });
    const guardado = (await chromeStub.storage.local.get([
      STORAGE_KEYS.networks,
      STORAGE_KEYS.chainId,
    ])) as Record<string, unknown>;
    const catalogo = guardado[STORAGE_KEYS.networks] as Record<string, { isDefault: boolean }>;
    expect(catalogo['0x1']?.isDefault).toBe(false);
    // El alta NUNCA activa la red.
    expect(guardado[STORAGE_KEYS.chainId]).toBe('0x7a69');
  });
});

describe('M19.b · dependencias reales del despacho', () => {
  it('el objeto de dependencias por defecto cablea la cola, la ventana, la firma y la difusión', () => {
    expect(Object.keys(defaultApprovalDispatchDeps).sort()).toEqual([
      'armExpiry',
      'beginInflight',
      'broadcast',
      'deliver',
      'emitEvent',
      'enqueue',
      'estimate',
      'log',
      'markBroadcast',
      'readCode',
      'readFees',
      'readNonce',
      'releaseInflight',
      'show',
      'signPersonalMessage',
      'signTransaction',
      'signTypedData',
      'wait',
    ]);
    for (const dependency of Object.values(defaultApprovalDispatchDeps)) {
      expect(typeof dependency).toBe('function');
    }
  });
});
