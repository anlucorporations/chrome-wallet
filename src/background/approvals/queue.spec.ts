/**
 * M14 — `src/background/approvals/queue.spec.ts`
 * Especificación de la cola persistida `truekeate_pending_requests` (H4, tareas 4.1, 4.6 y 4.8 de
 * `plan_desarrollo.md` §3.4.5; §3.4.7 «Vitest»).
 *
 * Criterios que fija este fichero:
 * - `CA-RF-37` — dos solicitudes simultáneas **coexisten** en `Record<approvalId, PendingRequest>`
 *   sin sobrescribirse: el `rmwLock` serializa la lectura-modificación-escritura (§2.8, H-08).
 * - `CA-RF-41` — al resolver, la entrada **desaparece** de la cola persistida y su `resolvedAt`
 *   queda marcado; una respuesta duplicada se ignora (X-06: el SW nunca firma dos veces).
 * - Cardinalidad del alta: 8 globales / 1 por origen / 6 por minuto → `4001` **inmediato, sin
 *   persistir y sin abrir ventana**.
 * - Serialización por cuenta: `truekeate_inflight_tx` con `phase: 'signing'` bloquea la cuenta y
 *   `'broadcast'` la libera (§2.12).
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../../test/setup/chrome-stub';
import { STORAGE_KEYS } from '../state/schema';
import {
  accountLockState,
  beginInflightTx,
  deleteInflight,
  inflightFor,
  isExpired,
  isInflightVigente,
  isPending,
  markInflightBroadcast,
  oldestPending,
  pendingCount,
  pendingForOrigin,
  planQueuePurge,
  purgeBadge,
  readInflightTx,
  readPendingRequest,
  readPendingRequests,
  releaseInflightTx,
  resolveApprovalRequest,
  rmwLock,
  enqueueApprovalRequest,
  type PendingRequestDraft,
} from './queue';
import { INFLIGHT_TTL_MS, SIGN_TIMEOUT_MS } from '../../shared/constants';

/** Cuenta #0 de Anvil: la `from` de todas las solicitudes de esta especificación. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** Origen de la dApp de pruebas (clave canónica normalizada, §2.7). */
const ORIGEN_DAPP = 'http://localhost:5174';

/** Construye un borrador válido de `eth_sendTransaction` sobre la cuenta #0. */
const borrador = (overrides: Partial<PendingRequestDraft> = {}): PendingRequestDraft => ({
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_0, value: '0x2386f26fc10000' }],
  origin: ORIGEN_DAPP,
  tabId: 7,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  ...overrides,
});

/** Lee el mapa persistido directamente del almacén del stub. */
const mapaPersistido = async (): Promise<Record<string, unknown>> => {
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.pendingRequests)) as Record<
    string,
    unknown
  >;
  return (items[STORAGE_KEYS.pendingRequests] ?? {}) as Record<string, unknown>;
};

describe('M14 · cola persistida de aprobaciones (CA-RF-37 / CA-RF-41)', () => {
  it('da de alta con la forma exacta y el plazo ANCLADO a createdAt', async () => {
    const resultado = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'aprobacion-1',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const { request } = resultado;
    expect(request.approvalId).toBe('aprobacion-1');
    expect(request.method).toBe('eth_sendTransaction');
    expect(request.origin).toBe(ORIGEN_DAPP);
    expect(request.tabId).toBe(7);
    expect(request.frameId).toBe(0);
    expect(request.account).toBe(CUENTA_0);
    expect(request.chainId).toBe('0x7a69');
    expect(request.createdAt).toBe(STUB_EPOCH_MS);
    // El plazo NO se cuenta desde la apertura de la ventana: 120 000 ms exactos desde createdAt.
    expect(request.expiresAt).toBe(STUB_EPOCH_MS + 120_000);
    expect(request.expiresAt - request.createdAt).toBe(SIGN_TIMEOUT_MS);
    expect(request.status).toBe('pending');
    expect(resultado.pendingCount).toBe(1);
    expect(resultado.shouldShow).toBe(true);
    expect(resultado.purgedExpired).toEqual([]);

    const persistido = await mapaPersistido();
    expect(Object.keys(persistido)).toEqual(['aprobacion-1']);
  });

  it('dos solicitudes simultáneas de orígenes distintos COEXISTEN sin sobrescribirse (CA-RF-37)', async () => {
    const [primera, segunda] = await Promise.all([
      enqueueApprovalRequest(borrador({ origin: 'https://uno.example', params: ['uno'] }), {
        now: STUB_EPOCH_MS,
        approvalId: 'id-uno',
      }),
      enqueueApprovalRequest(borrador({ origin: 'https://dos.example', params: ['dos'] }), {
        now: STUB_EPOCH_MS,
        approvalId: 'id-dos',
      }),
    ]);

    expect(primera.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    const mapa = await readPendingRequests();
    expect(Object.keys(mapa).sort()).toEqual(['id-dos', 'id-uno']);
    expect(mapa['id-uno']?.origin).toBe('https://uno.example');
    expect(mapa['id-dos']?.origin).toBe('https://dos.example');
    // Ninguna sustituyó los parámetros de la otra: es el oráculo del RMW serializado.
    expect(mapa['id-uno']?.params).toEqual(['uno']);
    expect(mapa['id-dos']?.params).toEqual(['dos']);
    expect(pendingCount(mapa)).toBe(2);
  });

  it('el cerrojo RMW encadena las altas concurrentes y vuelve a 0 al terminar', async () => {
    const enVuelo = Promise.all(
      ['a', 'b', 'c', 'd'].map((sufijo) =>
        enqueueApprovalRequest(borrador({ origin: `https://${sufijo}.example` }), {
          now: STUB_EPOCH_MS,
          approvalId: `id-${sufijo}`,
        }),
      ),
    );
    // Las cuatro altas están encadenadas en el cerrojo (incremento síncrono en `run`).
    expect(rmwLock.depth()).toBe(4);

    const resultados = await enVuelo;
    expect(resultados.map((resultado) => resultado.ok)).toEqual([true, true, true, true]);
    expect(rmwLock.depth()).toBe(0);
    expect(pendingCount(await readPendingRequests())).toBe(4);
  });

  it('exceder 8 solicitudes globales → 4001 inmediato y la novena NO se persiste', async () => {
    for (let indice = 0; indice < 8; indice += 1) {
      const aceptada = await enqueueApprovalRequest(
        borrador({ origin: `https://sitio-${indice}.example` }),
        { now: STUB_EPOCH_MS, approvalId: `global-${indice}` },
      );
      expect(aceptada.ok).toBe(true);
    }
    expect(pendingCount(await readPendingRequests())).toBe(8);

    const novena = await enqueueApprovalRequest(borrador({ origin: 'https://novena.example' }), {
      now: STUB_EPOCH_MS,
      approvalId: 'global-8',
    });

    expect(novena.ok).toBe(false);
    if (novena.ok) return;
    expect(novena.error.code).toBe(4001);
    expect(novena.error.message).toBe(
      'Hay demasiadas solicitudes pendientes para este origen; espera a que se resuelva la actual.',
    );
    expect(novena.error.data).toEqual({
      reason: 'global-limit',
      pendingCount: 8,
      maxPending: 8,
    });
    expect(Object.keys(await mapaPersistido())).toHaveLength(8);
    expect(await mapaPersistido()).not.toHaveProperty('global-8');
    // Sin ventana abierta: la cola rechazó antes de cualquier apertura (M18).
    expect(await chromeStub.windows.getAll()).toEqual([]);
  });

  it('una segunda solicitud del MISMO origen → 4001 con reason origin-limit', async () => {
    const primera = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'mismo-origen-1',
    });
    expect(primera.ok).toBe(true);

    const segunda = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'mismo-origen-2',
    });
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.error.code).toBe(4001);
    expect(segunda.error.data).toEqual({
      reason: 'origin-limit',
      origin: ORIGEN_DAPP,
      maxPendingPerOrigin: 1,
    });
    const mapa = await readPendingRequests();
    expect(Object.keys(mapa)).toEqual(['mismo-origen-1']);
    expect(pendingForOrigin(mapa, ORIGEN_DAPP)).toHaveLength(1);
  });

  it('la 7ª solicitud del mismo origen dentro de 60 s → 4001 por la ventana de 6 por minuto', async () => {
    for (let indice = 0; indice < 6; indice += 1) {
      const aceptada = await enqueueApprovalRequest(borrador(), {
        now: STUB_EPOCH_MS,
        approvalId: `tasa-${indice}`,
        // Se aísla la cota de TASA de la de origen elevando esta última.
        maxPendingPerOrigin: 10,
      });
      expect(aceptada.ok).toBe(true);
    }

    const septima = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'tasa-6',
      maxPendingPerOrigin: 10,
    });
    expect(septima.ok).toBe(false);
    if (septima.ok) return;
    expect(septima.error.code).toBe(4001);
    expect(septima.error.data).toEqual({
      reason: 'rate-limit',
      origin: ORIGEN_DAPP,
      perMinute: 6,
    });
    expect(Object.keys(await readPendingRequests())).toHaveLength(6);

    const almacen = (await chromeStub.storage.local.get(STORAGE_KEYS.rateWindows)) as Record<
      string,
      Record<string, { approvalsInWindow: number }>
    >;
    expect(
      almacen[STORAGE_KEYS.rateWindows]?.[ORIGEN_DAPP]?.approvalsInWindow,
      'solo las 6 solicitudes ACEPTADAS cuentan en la ventana de tasa',
    ).toBe(6);
  });

  it('un identificador duplicado → -32603 sin sobrescribir la entrada existente', async () => {
    await enqueueApprovalRequest(borrador({ params: ['original'] }), {
      now: STUB_EPOCH_MS,
      approvalId: 'duplicado',
    });

    const repetida = await enqueueApprovalRequest(borrador({ params: ['nueva'] }), {
      now: STUB_EPOCH_MS + 1_000,
      approvalId: 'duplicado',
    });

    expect(repetida.ok).toBe(false);
    if (repetida.ok) return;
    expect(repetida.error.code).toBe(-32603);
    expect(repetida.error.data).toBeUndefined();
    const mapa = await readPendingRequests();
    expect(Object.keys(mapa)).toEqual(['duplicado']);
    expect(mapa['duplicado']?.params).toEqual(['original']);
    expect(mapa['duplicado']?.createdAt).toBe(STUB_EPOCH_MS);
  });

  it('la purga perezosa retira lo vencido y lo devuelve como huérfano al dar de alta (4001)', async () => {
    await enqueueApprovalRequest(borrador({ origin: 'https://vieja.example' }), {
      now: STUB_EPOCH_MS,
      approvalId: 'vencida',
    });

    const nueva = await enqueueApprovalRequest(borrador({ origin: 'https://nueva.example' }), {
      now: STUB_EPOCH_MS + 120_001,
      approvalId: 'vigente',
    });

    expect(nueva.ok).toBe(true);
    if (!nueva.ok) return;
    expect(nueva.purgedExpired.map((entrada) => entrada.approvalId)).toEqual(['vencida']);
    const mapa = await readPendingRequests();
    expect(Object.keys(mapa)).toEqual(['vigente']);
  });

  it('el alta es FIFO: solo la más antigua debe mostrarse en la ventana única', async () => {
    const primera = await enqueueApprovalRequest(borrador({ origin: 'https://a.example' }), {
      now: STUB_EPOCH_MS,
      approvalId: 'a',
    });
    const segunda = await enqueueApprovalRequest(borrador({ origin: 'https://b.example' }), {
      now: STUB_EPOCH_MS + 10,
      approvalId: 'b',
    });

    expect(primera.ok && primera.shouldShow).toBe(true);
    expect(segunda.ok && segunda.shouldShow).toBe(false);
    expect(oldestPending(await readPendingRequests())?.approvalId).toBe('a');
  });

  it('al aprobar, la entrada DESAPARECE de la cola persistida y queda resolvedAt (CA-RF-41)', async () => {
    await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'aprobar',
    });

    const resuelta = await resolveApprovalRequest('aprobar', 'approved', {
      now: STUB_EPOCH_MS + 5_000,
    });

    expect(resuelta).not.toBeNull();
    expect(resuelta?.status).toBe('approved');
    expect(resuelta?.resolvedAt).toBe(STUB_EPOCH_MS + 5_000);
    // Una aprobación NO lleva errorCode: es el único desenlace sin `4001`.
    expect(resuelta?.errorCode).toBeUndefined();
    expect(resuelta?.request.status).toBe('approved');
    expect(await mapaPersistido()).toEqual({});
    expect(await readPendingRequest('aprobar')).toBeNull();
  });

  it('una respuesta duplicada se ignora y no vuelve a resolver (X-06)', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'unica' });

    const primera = await resolveApprovalRequest('unica', 'approved', { now: STUB_EPOCH_MS + 100 });
    const duplicada = await resolveApprovalRequest('unica', 'approved', {
      now: STUB_EPOCH_MS + 200,
    });

    expect(primera?.status).toBe('approved');
    expect(duplicada).toBeNull();
    expect(await readPendingRequest('unica')).toBeNull();
  });

  it('un rechazo lleva errorCode 4001 y un identificador inexistente devuelve null', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'rechazo' });

    const rechazada = await resolveApprovalRequest('rechazo', 'rejected', {
      now: STUB_EPOCH_MS + 1,
    });
    expect(rechazada?.status).toBe('rejected');
    expect(rechazada?.errorCode).toBe(4001);
    expect(await resolveApprovalRequest('no-existe', 'approved')).toBeNull();
  });

  it('si el plazo ya venció, prevalece expired aunque se pida aprobar', async () => {
    await enqueueApprovalRequest(borrador(), { now: STUB_EPOCH_MS, approvalId: 'tarde' });

    const resuelta = await resolveApprovalRequest('tarde', 'approved', {
      now: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
    });

    expect(resuelta?.status).toBe('expired');
    expect(resuelta?.errorCode).toBe(4001);
    expect(await mapaPersistido()).toEqual({});
  });

  it('planQueuePurge separa resueltas y vencidas y señala si hay que reescribir', () => {
    // Función PURA: se comprueban sus tres cubos (mapa limpio, resueltas y vencidas) de una vez.
    const mapa = {
      resuelta: {
        approvalId: 'resuelta',
        method: 'personal_sign' as const,
        params: [],
        origin: ORIGEN_DAPP,
        tabId: null,
        frameId: null,
        account: CUENTA_0,
        chainId: '0x7a69' as const,
        createdAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
        status: 'approved' as const,
      },
      vencida: {
        approvalId: 'vencida',
        method: 'personal_sign' as const,
        params: [],
        origin: ORIGEN_DAPP,
        tabId: null,
        frameId: null,
        account: CUENTA_0,
        chainId: '0x7a69' as const,
        createdAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
        status: 'pending' as const,
      },
      viva: {
        approvalId: 'viva',
        method: 'personal_sign' as const,
        params: [],
        origin: 'https://viva.example',
        tabId: null,
        frameId: null,
        account: CUENTA_0,
        chainId: '0x7a69' as const,
        createdAt: STUB_EPOCH_MS,
        expiresAt: STUB_EPOCH_MS + 2 * SIGN_TIMEOUT_MS,
        status: 'pending' as const,
      },
    };

    const plan = planQueuePurge(mapa, STUB_EPOCH_MS + SIGN_TIMEOUT_MS + 1);

    expect(plan.changed).toBe(true);
    expect(Object.keys(plan.map)).toEqual(['viva']);
    expect(plan.resolved.map((entrada) => entrada.approvalId)).toEqual(['resuelta']);
    expect(plan.expired.map((entrada) => entrada.approvalId)).toEqual(['vencida']);
    expect(isExpired(mapa.vencida, STUB_EPOCH_MS + SIGN_TIMEOUT_MS + 1)).toBe(true);
    expect(isPending(mapa.resuelta)).toBe(false);
  });

  it('oldestPending ordena por createdAt y desempata por approvalId', async () => {
    const base = {
      method: 'personal_sign' as const,
      params: [],
      origin: ORIGEN_DAPP,
      tabId: null,
      frameId: null,
      account: CUENTA_0,
      chainId: '0x7a69' as const,
      createdAt: 5,
      expiresAt: 5 + SIGN_TIMEOUT_MS,
      status: 'pending' as const,
    };
    const mapa = {
      'zeta': { ...base, approvalId: 'zeta' },
      'alfa': { ...base, approvalId: 'alfa' },
      'beta': { ...base, approvalId: 'beta', createdAt: 1 },
      'resuelta': { ...base, approvalId: 'resuelta', status: 'rejected' as const, createdAt: 0 },
    };

    expect(oldestPending(mapa)?.approvalId).toBe('beta');
    expect(pendingCount(mapa)).toBe(3);
    expect(oldestPending({})).toBeNull();
  });

  it('el badge derivado refleja el número de pendientes y se limpia al vaciar la cola', async () => {
    await enqueueApprovalRequest(borrador({ origin: 'https://a.example' }), {
      now: STUB_EPOCH_MS,
      approvalId: 'b1',
    });
    await enqueueApprovalRequest(borrador({ origin: 'https://b.example' }), {
      now: STUB_EPOCH_MS,
      approvalId: 'b2',
    });
    expect(chromeStub.action.badgeText()).toBe('2');

    await resolveApprovalRequest('b1', 'rejected', { now: STUB_EPOCH_MS + 1 });
    expect(chromeStub.action.badgeText()).toBe('1');

    await resolveApprovalRequest('b2', 'approved', { now: STUB_EPOCH_MS + 2 });
    expect(chromeStub.action.badgeText()).toBe('');

    await purgeBadge(0);
    expect(chromeStub.action.badgeText()).toBe('');
  });
});

describe('M14 · marca de transacción en vuelo por cuenta (tarea 4.6)', () => {
  it('beginInflightTx escribe phase signing y bloquea la cuenta', async () => {
    const resultado = await beginInflightTx({
      account: CUENTA_0,
      approvalId: 'envio-1',
      nonce: 4,
      now: STUB_EPOCH_MS,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.entry.phase).toBe('signing');
    expect(resultado.entry.txHash).toBeNull();
    expect(resultado.entry.nonce).toBe(4);
    expect(resultado.entry.expiresAt).toBe(STUB_EPOCH_MS + INFLIGHT_TTL_MS);

    const mapa = await readInflightTx();
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS)).toBe('signing');
  });

  it('una segunda firma sobre la misma cuenta → -32000 inflightTxInProgress con el titular', async () => {
    await beginInflightTx({ account: CUENTA_0, approvalId: 'envio-1', now: STUB_EPOCH_MS });

    const segunda = await beginInflightTx({
      account: CUENTA_0,
      approvalId: 'envio-2',
      now: STUB_EPOCH_MS + 1_000,
    });

    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    // Causa `inflightTxInProgress` de §4.3 v1.10 (H4): conflicto de estado, no cardinalidad.
    expect(segunda.error.code).toBe(-32000);
    expect(segunda.error.message).toBe(
      'Ya hay una transacción de esta cuenta en vuelo; espera a que se difunda antes de firmar otra.',
    );
    expect(segunda.error.data).toEqual({
      reason: 'inflight-signing',
      account: CUENTA_0,
      approvalId: 'envio-1',
    });
    expect(segunda.holder?.approvalId).toBe('envio-1');
    // La marca NO se sobrescribió: sigue siendo la del primer titular.
    const mapa = await readInflightTx();
    expect(inflightFor(mapa, CUENTA_0)?.approvalId).toBe('envio-1');
  });

  it('markInflightBroadcast libera la cuenta y conserva el hash devuelto por el nodo', async () => {
    const hash = `0x${'ab'.repeat(32)}` as `0x${string}`;
    await beginInflightTx({ account: CUENTA_0, approvalId: 'envio-1', now: STUB_EPOCH_MS });
    const marcada = await markInflightBroadcast({
      account: CUENTA_0,
      txHash: hash,
      nonce: 4,
      now: STUB_EPOCH_MS + 500,
    });

    expect(marcada?.phase).toBe('broadcast');
    expect(marcada?.txHash).toBe(hash);
    expect(marcada?.nonce).toBe(4);
    const mapa = await readInflightTx();
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS + 600)).toBe('broadcast');

    // `broadcast` NO bloquea: el nonce ya está consumido, otra transacción puede comenzar.
    const siguiente = await beginInflightTx({
      account: CUENTA_0,
      approvalId: 'envio-2',
      now: STUB_EPOCH_MS + 700,
    });
    expect(siguiente.ok).toBe(true);
    expect(inflightFor(await readInflightTx(), CUENTA_0)?.approvalId).toBe('envio-2');
  });

  it('una marca signing con el TTL agotado no bloquea la cuenta', async () => {
    await beginInflightTx({ account: CUENTA_0, approvalId: 'envio-1', now: STUB_EPOCH_MS });

    const mapa = await readInflightTx();
    const entrada = inflightFor(mapa, CUENTA_0);
    expect(isInflightVigente(entrada, STUB_EPOCH_MS + INFLIGHT_TTL_MS - 1)).toBe(true);
    expect(isInflightVigente(entrada, STUB_EPOCH_MS + INFLIGHT_TTL_MS)).toBe(false);
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS + INFLIGHT_TTL_MS)).toBe('free');
  });

  it('releaseInflightTx elimina la marca y solo devuelve true si existía', async () => {
    await beginInflightTx({ account: CUENTA_0, approvalId: 'envio-1', now: STUB_EPOCH_MS });

    expect(await releaseInflightTx(CUENTA_0)).toBe(true);
    expect(await readInflightTx()).toEqual({});
    expect(await releaseInflightTx(CUENTA_0)).toBe(false);
  });

  it('una marca sin expiresAt numérico no se considera vigente (nunca bloquea para siempre)', () => {
    const mapa = {
      [CUENTA_0]: {
        account: CUENTA_0,
        approvalId: 'envio-1',
        phase: 'signing' as const,
        txHash: null,
        startedAt: STUB_EPOCH_MS,
        expiresAt: Number.NaN,
      },
    };
    expect(isInflightVigente(inflightFor(mapa, CUENTA_0), STUB_EPOCH_MS)).toBe(false);
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS)).toBe('free');

    const limpio = { ...mapa };
    deleteInflight(limpio, CUENTA_0);
    expect(limpio).toEqual({});
  });
});
