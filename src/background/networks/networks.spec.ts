/**
 * M23/M24/M25 — `src/background/networks/networks.spec.ts`
 * Especificación del hito H5 para **redes** (tareas 5.1, 5.2, 5.3 y 5.4 de
 * `plan_desarrollo.md` §3.5.5; criterios `CA-RF-22`, `CA-RF-23` y RNF-23).
 *
 * Lo que fija este fichero, literalmente:
 *   1. **Red destino YA activa**: `wallet_switchEthereumChain` responde `null` **sin** ciclo de
 *      aprobación (el `runner` no se llama), **sin** entrada en la cola y **sin** `chainChanged`
 *      (`CA-RF-22`, P-19/DEC-29).
 *   2. **Red dada de alta y distinta**: exige aprobación; al aprobarla se persiste el `chainId`
 *      nuevo y se propaga `chainChanged` a todas las pestañas (`CA-RF-24`).
 *   3. **Red NO dada de alta**: `4901` sin ventana y sin cola.
 *   4. **Rechazo** del usuario: `4001` y la red activa NO cambia.
 *   5. **Alta (`wallet_addEthereumChain`)**: la red queda en `truekeate_networks` con
 *      `isDefault: false` y `truekeate_chain_id` **no cambia**: el alta NO activa la red
 *      (`CA-RF-23`, ADT-25 / P-22).
 *   6. **Permiso de host denegado**: `4001` y la red **no** se persiste (DEC-36/ACU-27).
 *   7. **Aviso de red no testnet** (RNF-23): la vista previa publica el literal de
 *      `NON_TESTNET_WARNING` cuando la red no es de pruebas y `null` cuando sí lo es.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chromeStub } from '../../../test/setup/chrome-stub';
import { NON_TESTNET_WARNING } from '../../shared/constants';
import type { Address, ChainIdHex, StoredNetwork } from '../../shared/types';
import type { TrustedSenderContext } from '../security/senderGuard';
import { STORAGE_KEYS, readStorage } from '../state/schema';
import {
  buildNetworkPreview,
  addEthereumChain,
  type NetworkApprovalDraft,
  type NetworkApprovalOutcome,
} from './addChain';
import { ANVIL_NETWORK, readNetworksFromSnapshot, seedDefaultNetwork } from './catalog';
import { switchEthereumChain } from './switch';

/** Cuenta #0 de Anvil (la activa de la cartera y la de la sesión de la dApp). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;

/** `chainId` de la red de pruebas de Anvil (la activa). */
const ANVIL_CHAIN_ID = '0x7a69' as ChainIdHex;

/** Segunda red, ya dada de alta: Anvil secundario en `127.0.0.1:8546` (`plan_desarrollo.md` §3.5.7). */
const RED_SECUNDARIA: StoredNetwork = {
  chainId: '0x7a6a' as ChainIdHex,
  chainIdDecimal: 31_338,
  name: 'Anvil Secundario',
  rpcUrl: 'http://127.0.0.1:8546',
  symbol: 'ETH',
  decimals: 18,
  isTestnet: true,
  isDefault: false,
};

/** Origen de la dApp de pruebas. */
const ORIGEN = 'http://localhost:5174';

/** Contexto del POPUP (extensión): el alta desde aquí pide el permiso de host igualmente. */
const contextoExtension: TrustedSenderContext = {
  runtimeId: 'tk-stub-extension-id-for-tests',
  origin: 'extension',
  isExtensionContext: true,
  route: 'popup.html',
  tabId: null,
  frameId: 0,
  respondToFrameOnly: false,
  declaredOrigin: null,
};

/** Contexto de una dApp con sesión vigente. */
const contextoDapp: TrustedSenderContext = {
  runtimeId: 'tk-stub-extension-id-for-tests',
  origin: ORIGEN,
  isExtensionContext: false,
  route: null,
  tabId: 11,
  frameId: 0,
  respondToFrameOnly: false,
  declaredOrigin: ORIGEN,
};

/** Siembra el catálogo con Anvil (activa) y la red secundaria. */
const sembrarRedes = async (): Promise<void> => {
  await chromeStub.storage.local.set({
    [STORAGE_KEYS.networks]: {
      [ANVIL_NETWORK.chainId]: ANVIL_NETWORK,
      [RED_SECUNDARIA.chainId]: RED_SECUNDARIA,
    },
    [STORAGE_KEYS.chainId]: ANVIL_CHAIN_ID,
  });
};

/** `chainId` activo persistido. */
const chainIdActivo = async (): Promise<unknown> =>
  (await readStorage([STORAGE_KEYS.chainId]))[STORAGE_KEYS.chainId];

/** Entradas de la cola persistida. */
const colaPersistida = async (): Promise<Record<string, unknown>> => {
  const cola = (await readStorage([STORAGE_KEYS.pendingRequests]))[STORAGE_KEYS.pendingRequests];
  return typeof cola === 'object' && cola !== null ? (cola as Record<string, unknown>) : {};
};

/** `runner` que aprueba de inmediato y anota el borrador recibido. */
const runnerAprobado = (): {
  runner: (draft: NetworkApprovalDraft, now: number) => Promise<NetworkApprovalOutcome>;
  llamadas: NetworkApprovalDraft[];
} => {
  const llamadas: NetworkApprovalDraft[] = [];
  return {
    llamadas,
    runner: async (draft) => {
      llamadas.push(draft);
      return { ok: true, approved: true, status: 'approved', error: null };
    },
  };
};

/** Efecto de activación espía: ninguna prueba toca pestañas ni el almacén por su cuenta. */
const activacionEspia = (): {
  activate: (chainId: ChainIdHex) => Promise<{ chainId: ChainIdHex; delivered: number }>;
  activadas: ChainIdHex[];
} => {
  const activadas: ChainIdHex[] = [];
  return {
    activadas,
    activate: async (chainId) => {
      await chromeStub.storage.local.set({ [STORAGE_KEYS.chainId]: chainId });
      activadas.push(chainId);
      return { chainId, delivered: 2 };
    },
  };
};

beforeEach(async () => {
  await sembrarRedes();
});

describe('M24 · wallet_switchEthereumChain (CA-RF-22)', () => {
  it('la red destino YA es la activa: responde null SIN aprobación, sin cola y sin chainChanged', async () => {
    const { runner, llamadas } = runnerAprobado();
    const { activate, activadas } = activacionEspia();

    const resultado = await switchEthereumChain({
      params: [{ chainId: ANVIL_CHAIN_ID }],
      context: contextoDapp,
      runner,
      activate,
    });

    expect(resultado).toEqual({
      ok: true,
      result: null,
      switched: false,
      chainId: ANVIL_CHAIN_ID,
      delivered: 0,
    });
    // Sin ventana única: no hay borrador que aprobar.
    expect(llamadas).toHaveLength(0);
    expect(activadas).toHaveLength(0);
    // Sin entrada en la cola persistida y sin ventana creada.
    expect(await colaPersistida()).toEqual({});
    expect(await chromeStub.windows.getAll()).toEqual([]);
    // La red activa sigue siendo la misma.
    expect(await chainIdActivo()).toBe(ANVIL_CHAIN_ID);
  });

  it('una red dada de alta y distinta exige aprobación, persiste el chainId y propaga chainChanged', async () => {
    const { runner, llamadas } = runnerAprobado();
    const { activate, activadas } = activacionEspia();

    const resultado = await switchEthereumChain({
      params: [{ chainId: RED_SECUNDARIA.chainId }],
      context: contextoDapp,
      sessionAccount: CUENTA_0,
      runner,
      activate,
    });

    expect(resultado).toEqual({
      ok: true,
      result: null,
      switched: true,
      chainId: RED_SECUNDARIA.chainId,
      delivered: 2,
    });
    // Exactamente UNA aprobación, con la vista previa del CAMBIO (no del alta).
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.method).toBe('wallet_switchEthereumChain');
    expect(llamadas[0]?.networkPreview.kind).toBe('switch');
    expect(llamadas[0]?.networkPreview.chainId).toBe(RED_SECUNDARIA.chainId);
    expect(llamadas[0]?.networkPreview.currentChainId).toBe(ANVIL_CHAIN_ID);
    // La red activa SÍ cambia y el evento sale a las pestañas (CA-RF-24).
    expect(await chainIdActivo()).toBe(RED_SECUNDARIA.chainId);
    expect(activadas).toEqual([RED_SECUNDARIA.chainId]);
    expect(resultado.ok && resultado.delivered).toBe(2);
  });

  it('un chainId NO dado de alta responde 4901 sin ventana y sin entrada en la cola', async () => {
    const { runner, llamadas } = runnerAprobado();

    const resultado = await switchEthereumChain({
      params: [{ chainId: '0x89' }],
      context: contextoDapp,
      runner,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(4901);
    expect(resultado.ok ? null : resultado.error.message).toBe('La red solicitada no está dada de alta.');
    expect(llamadas).toHaveLength(0);
    expect(await colaPersistida()).toEqual({});
    expect(await chainIdActivo()).toBe(ANVIL_CHAIN_ID);
  });

  it('el rechazo del usuario responde 4001 y NO cambia la red activa', async () => {
    const runner = async (): Promise<NetworkApprovalOutcome> => ({
      ok: true,
      approved: false,
      status: 'rejected',
      error: { code: 4001, message: 'Operación cancelada por el usuario.' },
    });

    const resultado = await switchEthereumChain({
      params: [{ chainId: RED_SECUNDARIA.chainId }],
      context: contextoDapp,
      sessionAccount: CUENTA_0,
      runner,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(4001);
    expect(await chainIdActivo()).toBe(ANVIL_CHAIN_ID);
  });
});

describe('M25 · wallet_addEthereumChain (CA-RF-23)', () => {
  /** Declaración EIP-3085 de la red secundaria (la que el nodo de 8546 declara). */
  const declaracion = (): unknown[] => [
    {
      chainId: RED_SECUNDARIA.chainId,
      chainName: RED_SECUNDARIA.name,
      rpcUrls: [RED_SECUNDARIA.rpcUrl],
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      blockExplorerUrls: [],
    },
  ];

  it('el alta persiste la red con isDefault false y NO cambia la red activa (ADT-25 / P-22)', async () => {
    const { runner, llamadas } = runnerAprobado();
    const emit = vi.fn(async () => 2);

    const resultado = await addEthereumChain({
      params: declaracion(),
      context: contextoExtension,
      runner,
      deps: {
        currentAddress: async () => CUENTA_0,
        probe: async () => RED_SECUNDARIA.chainId,
        permissions: { request: async () => true },
        upsert: async (network) => ({ [network.chainId]: network }),
      },
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.network.isDefault).toBe(false);
    expect(resultado.network.chainId).toBe(RED_SECUNDARIA.chainId);
    // Aprobación pedida UNA vez con el aviso explícito de que la red NO se activará.
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.networkPreview.kind).toBe('add');
    expect(llamadas[0]?.networkPreview.activationNote).toContain('seguirás en la red actual');

    // La red activa NO cambia y NO se emite `chainChanged`.
    expect(await chainIdActivo()).toBe(ANVIL_CHAIN_ID);
    expect(emit).not.toHaveBeenCalled();
  });

  it('la denegación del permiso de host responde 4001 y la red NO se persiste', async () => {
    const { runner } = runnerAprobado();
    const upsert = vi.fn(async (network: StoredNetwork) => ({ [network.chainId]: network }));
    // Red que NO está en el catálogo sembrado: es la única forma de afirmar «no persistida».
    const chainIdDenegado = '0x7a6b' as ChainIdHex;

    const resultado = await addEthereumChain({
      params: [
        {
          chainId: chainIdDenegado,
          chainName: 'Anvil Tercero',
          rpcUrls: ['http://127.0.0.1:8547'],
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        },
      ],
      context: contextoExtension,
      runner,
      deps: {
        currentAddress: async () => CUENTA_0,
        probe: async () => chainIdDenegado,
        permissions: { request: async () => false },
        upsert,
      },
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(4001);
    expect(upsert).not.toHaveBeenCalled();
    // Y el catálogo persistido sigue sin la red nueva.
    const catalogo = readNetworksFromSnapshot(await readStorage([STORAGE_KEYS.networks]));
    expect(catalogo[chainIdDenegado]).toBeUndefined();
    expect(await chainIdActivo()).toBe(ANVIL_CHAIN_ID);
  });

  it('un rpcUrl no válido (http fuera del RPC local) responde -32602 sin abrir la ventana', async () => {
    const { runner, llamadas } = runnerAprobado();

    const resultado = await addEthereumChain({
      params: [
        {
          chainId: '0x1',
          chainName: 'Red con nodo inseguro',
          rpcUrls: ['http://rpc.example.com'],
          nativeCurrency: { symbol: 'ETH' },
        },
      ],
      context: contextoExtension,
      runner,
      deps: { currentAddress: async () => CUENTA_0 },
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok ? null : resultado.error.code).toBe(-32602);
    expect(llamadas).toHaveLength(0);
  });
});

describe('M25 · aviso de red no testnet (RNF-23, tarea 5.3)', () => {
  it('la vista previa publica el literal de RNF-23 solo cuando la red NO es de pruebas', () => {
    const base = {
      chainId: '0x1' as ChainIdHex,
      chainIdDecimal: 1,
      name: 'Ethereum',
      rpcUrl: 'https://rpc.example.com',
      symbol: 'ETH',
      decimals: 18,
    };

    const real = buildNetworkPreview('add', { ...base, isTestnet: false }, ANVIL_CHAIN_ID);
    expect(real.warning).toBe(NON_TESTNET_WARNING);
    expect(real.isTestnet).toBe(false);

    const pruebas = buildNetworkPreview('add', { ...base, isTestnet: true }, ANVIL_CHAIN_ID);
    expect(pruebas.warning).toBeNull();
    expect(pruebas.isTestnet).toBe(true);
  });
});

describe('M23 · CA-RT-06: solo Anvil en el catálogo, sin Sepolia', () => {
  it('el catálogo por defecto declara Anvil (0x7a69) con chainId 31337 y NO Sepolia (0xaa36a7)', async () => {
    // `chainId` hexadecimal de Sepolia: el arnés y el producto usan SOLO la red local (`CA-RT-06`).
    const SEPOLIA = '0xaa36a7';

    // Catálogo VACÍO (el `beforeEach` siembra la red secundaria para las demás pruebas).
    await chromeStub.storage.local.clear();
    await seedDefaultNetwork(chromeStub.storage.local);
    const catalogo = readNetworksFromSnapshot(await readStorage([STORAGE_KEYS.networks]));

    expect(Object.keys(catalogo)).toEqual([ANVIL_CHAIN_ID]);
    expect(catalogo[ANVIL_CHAIN_ID]?.chainIdDecimal).toBe(31_337);
    expect(catalogo[SEPOLIA], 'Sepolia NO puede estar dada de alta').toBeUndefined();
    // Y la red activa persistida es la de Anvil.
    expect(await chainIdActivo()).toBe(ANVIL_CHAIN_ID);
  });
});
