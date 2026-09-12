/**
 * M14 — `src/background/approvals/queue.ts` (spec del árbol `test/oracle/`, ramas que los specs
 * del módulo no tocan). Cola persistida `truekeate_pending_requests` como
 * `Record<approvalId, PendingRequest>`: RMW serializado (`CA-RF-37`), cardinalidad (8 / 1 / 6 por
 * minuto), cota de 64 KiB y purga de lo resuelto y lo vencido. Requisitos: **RF-37** (cola y
 * ventana única), **RF-41** (al resolver, la entrada desaparece de la cola) y **RNF-06** (todo
 * error lleva `code` numérico de §4.3: `4001`, `-32000`, `-32602`, `-32603`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../setup/chrome-stub';
import {
  INFLIGHT_TTL_MS,
  MAX_PAYLOAD_BYTES,
  SIGN_TIMEOUT_MS,
  pendingRequestsMax,
  pendingRequestsMaxPerOrigin,
  pendingRequestsPerMinute,
} from '../../src/shared/constants';
import { STORAGE_KEYS } from '../../src/background/state/schema';
import {
  accountLockState,
  asInflightTx,
  asPendingRequest,
  beginInflightTx,
  createSerialLock,
  deleteInflight,
  dropPendingRequest,
  enqueueApprovalRequest,
  inflightFor,
  isExpired,
  isInflightVigente,
  isPending,
  isRecord,
  markInflightBroadcast,
  newApprovalId,
  oldestPending,
  pendingCount,
  pendingForOrigin,
  planQueuePurge,
  purgeBadge,
  purgePendingRequests,
  readInflightTx,
  readInflightTxFromSnapshot,
  readPendingRequest,
  readPendingRequests,
  readPendingRequestsFromSnapshot,
  releaseInflightTx,
  resolveApprovalRequest,
  rmwLock,
  setInflight,
  timeoutMsForMethod,
  withRmwLock,
  type PendingRequestDraft,
} from '../../src/background/approvals/queue';
import { clearApprovalDecisions, waitForApprovalResolution } from '../../src/background/approvals/decisions';
import type { InflightTxByAccount, PendingRequest, PendingRequestsMap } from '../../src/shared/types';

/** Cuenta #0 de Anvil (EIP-55). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
/** Cuenta #1 de Anvil (EIP-55). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
/** Origen canónico de la dApp de pruebas. */
const ORIGEN = 'https://dapp.example';

/** Borrador válido de `eth_sendTransaction`. */
const borrador = (overrides: Partial<PendingRequestDraft> = {}): PendingRequestDraft => ({
  method: 'eth_sendTransaction',
  params: [{ from: CUENTA_0, to: CUENTA_1, value: '0x1' }],
  origin: ORIGEN,
  tabId: 7,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  ...overrides,
});

/** Entrada persistida con la forma de §2.8. */
const entrada = (approvalId: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  approvalId,
  method: 'personal_sign',
  params: ['hola', CUENTA_0],
  origin: ORIGEN,
  tabId: 7,
  frameId: 0,
  account: CUENTA_0,
  chainId: '0x7a69',
  createdAt: STUB_EPOCH_MS,
  expiresAt: STUB_EPOCH_MS + SIGN_TIMEOUT_MS,
  status: 'pending',
  ...overrides,
});

/** Siembra la cola persistida. */
const sembrarCola = async (mapa: PendingRequestsMap): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.pendingRequests]: mapa });
};

/** Siembra `truekeate_rate_windows`. */
const sembrarVentanas = async (mapa: Record<string, unknown>): Promise<void> => {
  await chromeStub.storage.local.set({ [STORAGE_KEYS.rateWindows]: mapa });
};

/**
 * Fuerza que TODA escritura del almacén agote la cuota, que es el modo de fallo de §2.15: el
 * doble del stub solo simula un fallo por llamada, así que aquí se hace persistente.
 */
const agotarCuota = (): void => {
  vi.spyOn(chromeStub.storage.local, 'set').mockImplementation(() =>
    Promise.reject(new Error('QUOTA_BYTES quota exceeded')),
  );
};

afterEach(() => {
  clearApprovalDecisions();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M14 · cerrojo de escritura serializada (H-08 / CA-RF-37)', () => {
  it('encadena las tareas FIFO, mide su profundidad y un fallo NO rompe la cadena', async () => {
    const lock = createSerialLock();
    const traza: string[] = [];
    let liberar: (() => void) | null = null;
    const bloqueo = new Promise<void>((resolve) => {
      liberar = resolve;
    });

    const primera = lock.run(async () => {
      traza.push('primera-inicio');
      await bloqueo;
      traza.push('primera-fin');
      return 1;
    });
    const segunda = lock.run(async () => {
      traza.push('segunda');
      return 2;
    });

    expect(lock.depth()).toBe(2);
    (liberar as unknown as () => void)();
    await expect(primera).resolves.toBe(1);
    await expect(segunda).resolves.toBe(2);
    expect(traza).toEqual(['primera-inicio', 'primera-fin', 'segunda']);
    expect(lock.depth()).toBe(0);

    await expect(
      lock.run(async () => {
        throw new Error('fallo de la tarea');
      }),
    ).rejects.toThrow('fallo de la tarea');
    await expect(lock.run(async () => 'siguiente')).resolves.toBe('siguiente');
    expect(rmwLock.depth()).toBe(0);
    await expect(withRmwLock(async () => 'bajo-cerrojo')).resolves.toBe('bajo-cerrojo');
  });
});

describe('M14 · identificadores y utilidades de la cola', () => {
  it('newApprovalId usa crypto.randomUUID y cae a un identificador propio si falta', () => {
    const generado = newApprovalId();
    expect(generado).toMatch(/^[0-9a-f-]{36}$/);

    vi.stubGlobal('crypto', {});
    const respaldo = newApprovalId();
    expect(respaldo.startsWith('approval-')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('isRecord y el plazo por método son los normativos', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(timeoutMsForMethod('eth_sendTransaction')).toBe(SIGN_TIMEOUT_MS);
    expect(timeoutMsForMethod('wallet_addEthereumChain')).toBe(SIGN_TIMEOUT_MS);
  });
});

describe('M14 · proyección tolerante de la cola persistida', () => {
  it('asPendingRequest rechaza lo inutilizable y rellena TODOS los ausentes', () => {
    expect(asPendingRequest('k', null)).toBeNull();
    expect(asPendingRequest('k', [])).toBeNull();
    expect(asPendingRequest('k', { params: [] })).toBeNull();

    const minimo = asPendingRequest('k', { method: 'personal_sign' });
    expect(minimo).toEqual({
      approvalId: 'k',
      method: 'personal_sign',
      params: [],
      origin: '',
      tabId: null,
      frameId: null,
      account: '0x',
      chainId: '0x0',
      createdAt: 0,
      // Sin `expiresAt` numérico la entrada NO se declara vencida por esta vía.
      expiresAt: Number.NaN,
      status: 'pending',
    });

    const completo = asPendingRequest('k', {
      approvalId: 'otro',
      method: 'eth_sendTransaction',
      params: ['a'],
      origin: ORIGEN,
      tabId: 3,
      frameId: 2,
      account: CUENTA_1,
      chainId: '0x1',
      createdAt: 5,
      expiresAt: 6,
      status: 'approved',
      resolvedAt: 7,
      errorCode: 4001,
      requestId: 'req-1',
      txPreview: { from: CUENTA_0 },
      typedDataPreview: { domain: {} },
      signMessagePreview: { text: 'hola' },
    });
    expect(completo).toMatchObject({
      approvalId: 'otro',
      tabId: 3,
      frameId: 2,
      status: 'approved',
      resolvedAt: 7,
      errorCode: 4001,
      requestId: 'req-1',
    });
    expect(completo?.txPreview).toEqual({ from: CUENTA_0 });
    expect(completo?.typedDataPreview).toEqual({ domain: {} });
    expect(completo?.signMessagePreview).toEqual({ text: 'hola' });

    // `requestId` vacío no se inventa; un estado desconocido vuelve a `pending`.
    const sinCorrelacion = asPendingRequest('k', { method: 'personal_sign', requestId: '', status: 'raro' });
    expect(sinCorrelacion?.requestId).toBeUndefined();
    expect(sinCorrelacion?.status).toBe('pending');
  });

  it('readPendingRequestsFromSnapshot descarta entradas malformadas (función pura)', () => {
    expect(readPendingRequestsFromSnapshot({})).toEqual({});
    expect(readPendingRequestsFromSnapshot({ [STORAGE_KEYS.pendingRequests]: 'no-mapa' })).toEqual({});
    const mapa = readPendingRequestsFromSnapshot({
      [STORAGE_KEYS.pendingRequests]: {
        buena: { method: 'personal_sign' },
        mala: { sinMethod: true },
      },
    });
    expect(Object.keys(mapa)).toEqual(['buena']);
  });

  it('readPendingRequests degrada a mapa vacío sin API de almacén', async () => {
    await sembrarCola({ 'id-1': entrada('id-1') });
    expect(Object.keys(await readPendingRequests())).toEqual(['id-1']);
    expect(await readPendingRequests(null)).toEqual({});
  });

  it('isPending e isExpired: solo `pending` ocupa la cola y solo un plazo numérico vence', () => {
    expect(isPending(entrada('id'))).toBe(true);
    expect(isPending(null)).toBe(false);
    expect(isPending(undefined)).toBe(false);
    expect(isPending(entrada('id', { status: 'rejected' }))).toBe(false);

    expect(isExpired(entrada('id'), STUB_EPOCH_MS)).toBe(false);
    expect(isExpired(entrada('id', { expiresAt: STUB_EPOCH_MS }), STUB_EPOCH_MS)).toBe(true);
    expect(isExpired(entrada('id', { expiresAt: Number.NaN }), STUB_EPOCH_MS)).toBe(false);
  });

  it('pendingCount, pendingForOrigin y oldestPending (FIFO con desempate determinista)', () => {
    const mapa: PendingRequestsMap = {
      b: entrada('b', { createdAt: STUB_EPOCH_MS + 2, origin: 'https://Dapp.example/' }),
      a: entrada('a', { createdAt: STUB_EPOCH_MS + 1, origin: 'https://dapp.example' }),
      c: entrada('c', { createdAt: STUB_EPOCH_MS + 1, origin: 'https://otra.example' }),
      z: entrada('z', { status: 'approved' }),
    };
    expect(pendingCount(mapa)).toBe(3);
    expect(pendingForOrigin(mapa, 'HTTPS://DAPP.EXAMPLE')).toHaveLength(2);
    expect(pendingForOrigin(mapa, 'https://nadie.example')).toEqual([]);
    // Mismo `createdAt`: gana el `approvalId` ascendente.
    expect(oldestPending(mapa)?.approvalId).toBe('a');
    expect(oldestPending({})).toBeNull();
  });

  it('readPendingRequest devuelve la entrada vigente y `null` en el resto de casos', async () => {
    await sembrarCola({
      'id-viva': entrada('id-viva'),
      'id-resuelta': entrada('id-resuelta', { status: 'rejected' }),
      'id-vencida': entrada('id-vencida', { expiresAt: STUB_EPOCH_MS - 1 }),
    });

    expect((await readPendingRequest('id-viva', { now: STUB_EPOCH_MS }))?.approvalId).toBe('id-viva');
    expect(await readPendingRequest('id-resuelta', { now: STUB_EPOCH_MS })).toBeNull();
    expect(await readPendingRequest('id-vencida', { now: STUB_EPOCH_MS })).toBeNull();
    expect(await readPendingRequest('id-fantasma', { now: STUB_EPOCH_MS })).toBeNull();
  });
});

describe('M14 · purga de la cola (§2.8 regla 3)', () => {
  it('planQueuePurge separa lo vencido de lo ya resuelto y lo conserva ordenado', () => {
    const vencidaVieja = entrada('vencida-vieja', { createdAt: 1, expiresAt: 2 });
    const vencidaNueva = entrada('vencida-nueva', { createdAt: 3, expiresAt: 4 });
    const resueltaVieja = entrada('resuelta-vieja', { createdAt: 1, status: 'expired' });
    const resueltaNueva = entrada('resuelta-nueva', { createdAt: 2, status: 'approved' });
    const viva = entrada('viva', { createdAt: 5, expiresAt: STUB_EPOCH_MS + 1 });

    const plan = planQueuePurge(
      {
        'vencida-nueva': vencidaNueva,
        'resuelta-nueva': resueltaNueva,
        viva,
        'vencida-vieja': vencidaVieja,
        'resuelta-vieja': resueltaVieja,
      },
      STUB_EPOCH_MS,
    );

    expect(Object.keys(plan.map)).toEqual(['viva']);
    expect(plan.expired.map((entry) => entry.approvalId)).toEqual(['vencida-vieja', 'vencida-nueva']);
    expect(plan.resolved.map((entry) => entry.approvalId)).toEqual(['resuelta-vieja', 'resuelta-nueva']);
    expect(plan.changed).toBe(true);
  });

  it('purgePendingRequests no escribe cuando no hay nada que purgar', async () => {
    await sembrarCola({ viva: entrada('viva') });
    const escriturasPrevias = chromeStub.storage.local.writes().length;

    const plan = await purgePendingRequests({ now: STUB_EPOCH_MS });

    expect(plan.changed).toBe(false);
    expect(chromeStub.storage.local.writes()).toHaveLength(escriturasPrevias);
    expect(Object.keys(await readPendingRequests())).toEqual(['viva']);
  });

  it('purgePendingRequests persiste la purga y sobrevive a un fallo de escritura', async () => {
    await sembrarCola({
      vencida: entrada('vencida', { expiresAt: STUB_EPOCH_MS - 1 }),
      resuelta: entrada('resuelta', { status: 'rejected' }),
    });

    const plan = await purgePendingRequests({ now: STUB_EPOCH_MS });
    expect(plan.changed).toBe(true);
    expect(await readPendingRequests()).toEqual({});

    await sembrarCola({ otra: entrada('otra', { expiresAt: STUB_EPOCH_MS - 1 }) });
    agotarCuota();
    const conFallo = await purgePendingRequests({ now: STUB_EPOCH_MS });
    // El plan NO se invalida por el fallo: la purga se reintenta en el siguiente arranque.
    expect(conFallo.expired.map((entry) => entry.approvalId)).toEqual(['otra']);
  });
});

describe('M14 · alta en la cola (§2.8 pasos 0 a 5)', () => {
  it('acepta el alta con correlación, previews y `expiresAt` anclado a `createdAt`', async () => {
    const resultado = await enqueueApprovalRequest(
      borrador({
        requestId: 'req-9',
        tabId: null,
        frameId: null,
        timeoutMs: 1_000,
        txPreview: { from: CUENTA_0 } as never,
        typedDataPreview: { domain: {} } as never,
        signMessagePreview: { text: 'hola' } as never,
      }),
      { now: STUB_EPOCH_MS, approvalId: 'id-1' },
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.request).toMatchObject({
      approvalId: 'id-1',
      tabId: null,
      frameId: null,
      requestId: 'req-9',
      createdAt: STUB_EPOCH_MS,
      expiresAt: STUB_EPOCH_MS + 1_000,
      status: 'pending',
    });
    expect(resultado.pendingCount).toBe(1);
    expect(resultado.shouldShow).toBe(true);
    expect(resultado.purgedExpired).toEqual([]);
  });

  it('un origen de la extensión (sin pestaña) se registra como `extension`', async () => {
    const resultado = await enqueueApprovalRequest(borrador({ origin: '', tabId: null }), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-extension',
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.request.origin).toBe('extension');
  });

  it('origen no normalizable con pestaña → `-32603 invalid-approval-origin` sin persistir', async () => {
    const resultado = await enqueueApprovalRequest(borrador({ origin: '   ', tabId: 7 }), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-malo',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32603);
    expect((resultado.error.data as { reason: string }).reason).toBe('invalid-approval-origin');
    expect(await readPendingRequests()).toEqual({});
  });

  it('cota de payload (ADT-21/D-L): `-32602` antes de persistir', async () => {
    const resultado = await enqueueApprovalRequest(borrador({ params: ['x'.repeat(200)] }), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-grande',
      maxPayloadBytes: 10,
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32602);
    expect((resultado.error.data as { payloadBytes: number }).payloadBytes).toBeGreaterThan(10);
    expect(await readPendingRequests()).toEqual({});
    expect(MAX_PAYLOAD_BYTES).toBe(65_536);
  });

  it('identificador duplicado → `-32603 duplicateApprovalId` sin tocar el almacén', async () => {
    await sembrarCola({ 'id-dup': entrada('id-dup') });

    const resultado = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-dup',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32603);
    expect(resultado.error.message).toBe('Ya existe una solicitud con ese identificador.');
  });

  it('cardinalidad global (8) → `4001` inmediato, sin persistir y sin ventana', async () => {
    const llena: PendingRequestsMap = {};
    for (let index = 0; index < pendingRequestsMax; index += 1) {
      llena[`id-${index}`] = entrada(`id-${index}`, {
        origin: `https://origen-${index}.example`,
      });
    }
    await sembrarCola(llena);

    const resultado = await enqueueApprovalRequest(borrador({ origin: 'https://nueva.example' }), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-nueva',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4001);
    expect(resultado.error.data).toMatchObject({ reason: 'global-limit', maxPending: pendingRequestsMax });
    expect(Object.keys(await readPendingRequests())).toHaveLength(pendingRequestsMax);
  });

  it('cardinalidad por origen (1) → `4001` con su motivo', async () => {
    await sembrarCola({ 'id-ya': entrada('id-ya', { origin: ORIGEN }) });

    const resultado = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-segunda',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4001);
    expect(resultado.error.data).toMatchObject({
      reason: 'origin-limit',
      maxPendingPerOrigin: pendingRequestsMaxPerOrigin,
    });
  });

  it('ventana de tasa (6 por minuto por origen) → `4001` sin persistir', async () => {
    await sembrarVentanas({
      [ORIGEN]: {
        tokens: 6,
        lastRefillAt: STUB_EPOCH_MS,
        approvalWindowStart: STUB_EPOCH_MS,
        approvalsInWindow: pendingRequestsPerMinute,
        deniedCount: 0,
        updatedAt: STUB_EPOCH_MS,
      },
    });

    const resultado = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-tasa',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(4001);
    expect(resultado.error.data).toMatchObject({ reason: 'rate-limit', perMinute: pendingRequestsPerMinute });
  });

  it('la cuota agotada ABORTA el alta con `-32603 storageQuotaExceeded`', async () => {
    agotarCuota();

    const resultado = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-cuota',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32603);
    expect(resultado.error.message).toContain('No hay espacio de almacenamiento');
  });

  it('purga perezosa: la vencida previa sale en `purgedExpired` y libera el hueco', async () => {
    await sembrarCola({
      'id-vencida': entrada('id-vencida', { origin: ORIGEN, expiresAt: STUB_EPOCH_MS - 1 }),
    });

    const resultado = await enqueueApprovalRequest(borrador(), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-nueva',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.purgedExpired.map((entry) => entry.approvalId)).toEqual(['id-vencida']);
    expect(resultado.shouldShow).toBe(true);
  });

  it('`shouldShow` es falso para la solicitud que NO es la más antigua (FIFO, P-21)', async () => {
    await sembrarCola({ 'id-vieja': entrada('id-vieja', { origin: 'https://a.example', createdAt: 1 }) });

    const resultado = await enqueueApprovalRequest(borrador({ origin: 'https://b.example' }), {
      now: STUB_EPOCH_MS,
      approvalId: 'id-joven',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.shouldShow).toBe(false);
    expect(resultado.pendingCount).toBe(2);
  });
});

describe('M14 · resolución y descarte de entradas (CA-RF-41 / X-06)', () => {
  it('resolver `approved` purga la entrada, baja el badge y despierta a quien esperaba', async () => {
    await sembrarCola({ 'id-ok': entrada('id-ok') });
    const espera = waitForApprovalResolution('id-ok');

    const resuelta = await resolveApprovalRequest('id-ok', 'approved', { now: STUB_EPOCH_MS });

    expect(resuelta).toMatchObject({ status: 'approved', resolvedAt: STUB_EPOCH_MS });
    expect(resuelta?.errorCode).toBeUndefined();
    expect(resuelta?.request.status).toBe('approved');
    await expect(espera.decision).resolves.toEqual({ ok: true, resolution: resuelta });
    expect(await readPendingRequests()).toEqual({});
    expect(chromeStub.action.badgeText()).toBe('');
  });

  it('rechazar marca `errorCode: 4001` y deja el badge con los pendientes restantes', async () => {
    await sembrarCola({ 'id-no': entrada('id-no'), 'id-otra': entrada('id-otra') });

    const resuelta = await resolveApprovalRequest('id-no', 'rejected', { now: STUB_EPOCH_MS });

    expect(resuelta).toMatchObject({ status: 'rejected', errorCode: 4001 });
    expect(chromeStub.action.badgeText()).toBe('1');
  });

  it('si el plazo ya venció, prevalece `expired` aunque se pidiera aprobar', async () => {
    await sembrarCola({ 'id-tarde': entrada('id-tarde', { expiresAt: STUB_EPOCH_MS - 1 }) });

    const resuelta = await resolveApprovalRequest('id-tarde', 'approved', { now: STUB_EPOCH_MS });

    expect(resuelta?.status).toBe('expired');
    expect(resuelta?.errorCode).toBe(4001);
  });

  it('una entrada inexistente o ya resuelta devuelve `null` (respuesta duplicada ignorada)', async () => {
    await sembrarCola({ 'id-resuelta': entrada('id-resuelta', { status: 'expired' }) });

    expect(await resolveApprovalRequest('id-fantasma', 'rejected', { now: STUB_EPOCH_MS })).toBeNull();
    expect(await resolveApprovalRequest('id-resuelta', 'rejected', { now: STUB_EPOCH_MS })).toBeNull();
  });

  it('un fallo de escritura al resolver NO pierde el desenlace', async () => {
    await sembrarCola({ 'id-fallo': entrada('id-fallo') });
    agotarCuota();

    const resuelta = await resolveApprovalRequest('id-fallo', 'rejected', { now: STUB_EPOCH_MS });

    expect(resuelta?.status).toBe('rejected');
    // La entrada sigue en disco (el RMW no se pudo persistir) pero el desenlace se notifica igual.
    expect(Object.keys(await readPendingRequests())).toEqual(['id-fallo']);
  });

  it('dropPendingRequest retira sin resolver y devuelve la entrada', async () => {
    await sembrarCola({ 'id-drop': entrada('id-drop') });

    const retirada = await dropPendingRequest('id-drop');
    expect(retirada?.approvalId).toBe('id-drop');
    expect(await readPendingRequests()).toEqual({});
    expect(await dropPendingRequest('id-drop')).toBeNull();
  });
});

describe('M14 · marca de transacción en vuelo por cuenta (§2.12)', () => {
  it('asInflightTx proyecta la fase y los ausentes', () => {
    expect(asInflightTx(CUENTA_0, null)).toBeNull();
    expect(asInflightTx(CUENTA_0, 'no-objeto')).toBeNull();

    const minimo = asInflightTx(CUENTA_0, {});
    expect(minimo).toEqual({
      account: CUENTA_0,
      approvalId: '',
      phase: 'broadcast',
      txHash: null,
      startedAt: 0,
      expiresAt: Number.NaN,
    });

    const completo = asInflightTx(CUENTA_0, {
      account: CUENTA_1,
      approvalId: 'id-1',
      phase: 'signing',
      nonce: 4,
      txHash: '0xdead',
      startedAt: 1,
      expiresAt: 2,
    });
    expect(completo).toMatchObject({ account: CUENTA_1, phase: 'signing', nonce: 4, txHash: '0xdead' });
  });

  it('el mapa persistido se proyecta y se lee con las utilidades sin `any`', async () => {
    expect(readInflightTxFromSnapshot({})).toEqual({});
    expect(readInflightTxFromSnapshot({ [STORAGE_KEYS.inflightTx]: 'no-mapa' })).toEqual({});

    const proyectado = readInflightTxFromSnapshot({
      [STORAGE_KEYS.inflightTx]: {
        [CUENTA_0]: { phase: 'signing', approvalId: 'id-1', expiresAt: 10 },
        rota: null,
      },
    });
    expect(Object.keys(proyectado)).toEqual([CUENTA_0]);

    const mapa: InflightTxByAccount = {};
    setInflight(mapa, CUENTA_0, asInflightTx(CUENTA_0, { phase: 'signing' })!);
    expect(inflightFor(mapa, CUENTA_0)?.phase).toBe('signing');
    deleteInflight(mapa, CUENTA_0);
    expect(inflightFor(mapa, CUENTA_0)).toBeUndefined();

    await chromeStub.storage.local.set({
      [STORAGE_KEYS.inflightTx]: { [CUENTA_0]: { phase: 'signing', expiresAt: STUB_EPOCH_MS + 1 } },
    });
    expect(Object.keys(await readInflightTx())).toEqual([CUENTA_0]);
    expect(await readInflightTx(null)).toEqual({});
  });

  it('isInflightVigente exige `expiresAt` numérico en el futuro', () => {
    expect(isInflightVigente(null, 0)).toBe(false);
    expect(isInflightVigente(undefined, 0)).toBe(false);
    expect(isInflightVigente(asInflightTx(CUENTA_0, { expiresAt: STUB_EPOCH_MS + 1 }), STUB_EPOCH_MS)).toBe(true);
    expect(isInflightVigente(asInflightTx(CUENTA_0, { expiresAt: STUB_EPOCH_MS }), STUB_EPOCH_MS)).toBe(false);
    expect(isInflightVigente(asInflightTx(CUENTA_0, { expiresAt: Number.NaN }), STUB_EPOCH_MS)).toBe(false);
  });

  it('accountLockState distingue libre, firmando y difundida', () => {
    const mapa: InflightTxByAccount = {};
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS)).toBe('free');

    setInflight(mapa, CUENTA_0, asInflightTx(CUENTA_0, { phase: 'signing', expiresAt: STUB_EPOCH_MS + 1 })!);
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS)).toBe('signing');

    setInflight(mapa, CUENTA_0, asInflightTx(CUENTA_0, { phase: 'broadcast', expiresAt: STUB_EPOCH_MS + 1 })!);
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS)).toBe('broadcast');

    // Marca vencida: la cuenta vuelve a estar libre.
    setInflight(mapa, CUENTA_0, asInflightTx(CUENTA_0, { phase: 'signing', expiresAt: STUB_EPOCH_MS - 1 })!);
    expect(accountLockState(mapa, CUENTA_0, STUB_EPOCH_MS)).toBe('free');
  });

  it('beginInflightTx toma la exclusión, rechaza la segunda firma y respeta la cuota', async () => {
    const primera = await beginInflightTx({
      account: CUENTA_0,
      approvalId: 'id-1',
      now: STUB_EPOCH_MS,
    });
    expect(primera.ok).toBe(true);
    if (!primera.ok) return;
    expect(primera.entry).toMatchObject({ phase: 'signing', txHash: null, startedAt: STUB_EPOCH_MS });
    expect(primera.entry.expiresAt).toBe(STUB_EPOCH_MS + INFLIGHT_TTL_MS);
    expect('nonce' in primera.entry).toBe(false);

    const conflicto = await beginInflightTx({
      account: CUENTA_0,
      approvalId: 'id-2',
      now: STUB_EPOCH_MS + 1,
    });
    expect(conflicto.ok).toBe(false);
    if (conflicto.ok) return;
    expect(conflicto.error.code).toBe(-32000);
    expect(conflicto.error.message).toContain('Ya hay una transacción de esta cuenta en vuelo');
    expect(conflicto.holder?.approvalId).toBe('id-1');

    // Con un `nonce` declarado la marca lo conserva.
    const conNonce = await beginInflightTx({
      account: CUENTA_1,
      approvalId: 'id-3',
      nonce: 9,
      now: STUB_EPOCH_MS,
      ttlMs: 5,
    });
    expect(conNonce.ok).toBe(true);
    if (!conNonce.ok) return;
    expect(conNonce.entry).toMatchObject({ nonce: 9, expiresAt: STUB_EPOCH_MS + 5 });
  });

  it('beginInflightTx con la cuota agotada devuelve `-32603` sin marca', async () => {
    agotarCuota();

    const resultado = await beginInflightTx({
      account: CUENTA_0,
      approvalId: 'id-cuota',
      now: STUB_EPOCH_MS,
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32603);
    expect(resultado.holder).toBeNull();
  });

  it('markInflightBroadcast libera la cuenta y conserva el nonce previo', async () => {
    expect(await markInflightBroadcast({ account: CUENTA_1, txHash: null })).toBeNull();

    await beginInflightTx({ account: CUENTA_0, approvalId: 'id-1', nonce: 3, now: STUB_EPOCH_MS });
    const difundida = await markInflightBroadcast({
      account: CUENTA_0,
      txHash: '0xabc',
      now: STUB_EPOCH_MS + 1,
    });
    expect(difundida).toMatchObject({ phase: 'broadcast', txHash: '0xabc', nonce: 3 });
    expect(accountLockState(await readInflightTx(), CUENTA_0, STUB_EPOCH_MS + 1)).toBe('broadcast');
  });

  it('releaseInflightTx responde si había marca y libera la cuenta', async () => {
    expect(await releaseInflightTx(CUENTA_0)).toBe(false);

    await beginInflightTx({ account: CUENTA_0, approvalId: 'id-1', now: STUB_EPOCH_MS });
    expect(await releaseInflightTx(CUENTA_0)).toBe(true);
    expect(accountLockState(await readInflightTx(), CUENTA_0, STUB_EPOCH_MS)).toBe('free');
  });
});

describe('M14 · badge derivado (§2.8 / RF-38)', () => {
  it('purgeBadge publica el contador o lo limpia, y nunca rompe el flujo', async () => {
    await purgeBadge(3);
    expect(chromeStub.action.badgeText()).toBe('3');
    await purgeBadge(0);
    expect(chromeStub.action.badgeText()).toBe('');

    vi.spyOn(chromeStub.action, 'setBadgeText').mockRejectedValue(new Error('sin badge'));
    await expect(purgeBadge(1)).resolves.toBeUndefined();
    vi.restoreAllMocks();

    const global = globalThis as { chrome?: unknown };
    const previo = global.chrome;
    try {
      global.chrome = {};
      await expect(purgeBadge(1)).resolves.toBeUndefined();
      global.chrome = { action: {} };
      await expect(purgeBadge(1)).resolves.toBeUndefined();
    } finally {
      global.chrome = previo;
    }
  });
});
