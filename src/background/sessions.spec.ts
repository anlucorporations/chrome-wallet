/**
 * `src/background/sessions.spec.ts` — Sesiones de dApp por origen (M26, H3 tarea 3.7).
 *
 * Cubre `CA-RF-17` / `CA-RF-25` (§3.3.6): origen sin sesión → `[]` **sin ventana**; sesión vigente →
 * cuenta autorizada; `expiresAt = lastUsedAt + 86 400 000` (**renovable en cada uso**); tras 24 h
 * sin uso la entrada se ELIMINA y el origen vuelve a necesitar `eth_requestAccounts`. Y la
 * revocación de la tarea 3.11 (`revokeSession`, sin crear nada en la cola de aprobaciones).
 *
 * El reloj es INYECTADO (`now` como parámetro): las magnitudes son exactas y no dependen del reloj
 * real ni de *fake timers*. El almacén es el stub de `chrome.*` (mismo módulo que el producto).
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS, chromeStub } from '../../test/setup/chrome-stub';
import { SESSION_TTL_MS } from '../shared/constants';
import type { DappSession } from '../shared/types';
import {
  applyActiveAccountToSessions,
  connectSession,
  currentSessionFor,
  expiresAtFrom,
  isSessionValid,
  readSessions,
  rememberTab,
  revokeSession,
  sessionsLock,
  touchSession,
} from './sessions';

const T0 = STUB_EPOCH_MS;
const ORIGEN = 'http://localhost:5174';
const CUENTA = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
/** Cuenta 1 de Anvil: destino de los cambios de cuenta activa (`CA-RF-15`). */
const CUENTA_NUEVA = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Sesión persistida con las magnitudes que indique la prueba. */
const sessionOf = (overrides: Partial<DappSession> = {}): DappSession => ({
  origin: ORIGEN,
  account: CUENTA,
  chainId: '0x7a69',
  tabIds: [],
  connectedAt: T0,
  lastUsedAt: T0,
  expiresAt: T0 + SESSION_TTL_MS,
  connected: true,
  ...overrides,
});

/** Siembra `truekeate_connected_sites` directamente en el almacén del stub. */
const seed = async (sessions: Record<string, unknown>): Promise<void> => {
  await chrome.storage.local.set({ truekeate_connected_sites: sessions });
};

/** Lee el mapa persistido tal cual (sin proyectar), para comparar magnitudes exactas. */
const rawSessions = async (): Promise<Record<string, DappSession>> => {
  const stored = await chrome.storage.local.get('truekeate_connected_sites');
  return (stored.truekeate_connected_sites ?? {}) as Record<string, DappSession>;
};

describe('M26 · TTL de 24 h renovable en cada uso (CA-RF-17 / CA-RF-25)', () => {
  it('el TTL normativo es de 24 h y `expiresAtFrom` lo aplica sobre `lastUsedAt`', () => {
    expect(SESSION_TTL_MS).toBe(86_400_000);
    expect(expiresAtFrom(T0)).toBe(T0 + 86_400_000);
    expect(expiresAtFrom(T0, 1_000)).toBe(T0 + 1_000);
  });

  it('cada uso renueva `lastUsedAt` y recalcula `expiresAt` (magnitudes exactas)', async () => {
    await seed({ [ORIGEN]: sessionOf() });
    const usos = [T0 + 3_600_000, T0 + 7_200_000];

    let esperado: DappSession | null = null;
    for (const ahora of usos) {
      const tocada = await touchSession(ORIGEN, { now: ahora });
      expect(tocada.persisted).toBe(true);
      expect(tocada.session?.lastUsedAt).toBe(ahora);
      expect(tocada.session?.expiresAt).toBe(ahora + 86_400_000);
      esperado = tocada.session;
    }

    // El último uso quedó PERSISTIDO: no es solo el valor devuelto.
    const persistido = await rawSessions();
    expect(persistido[ORIGEN]?.lastUsedAt).toBe(usos[1]);
    expect(persistido[ORIGEN]?.expiresAt).toBe((usos[1] as number) + 86_400_000);
    expect(persistido[ORIGEN]).toEqual(esperado);
  });

  it('pasadas 24 h sin uso la entrada se ELIMINA y el origen no tiene sesión (sin error)', async () => {
    await seed({ [ORIGEN]: sessionOf({ expiresAt: T0 + SESSION_TTL_MS }) });

    const tocada = await touchSession(ORIGEN, { now: T0 + SESSION_TTL_MS });
    expect(tocada.session).toBeNull();
    expect(tocada.persisted).toBe(true);
    expect(await rawSessions()).toEqual({});
    // Un uso posterior tampoco la resucita: sigue sin sesión.
    expect((await touchSession(ORIGEN, { now: T0 + SESSION_TTL_MS + 1 })).session).toBeNull();
  });

  it('un origen sin entrada NO escribe NADA (eth_accounts nunca crea sesión ni abre ventana)', async () => {
    const escriturasAntes = chromeStub.storage.local.writes().length;

    const tocada = await touchSession('http://otra-dapp.test', { now: T0 });
    expect(tocada).toEqual({ session: null, persisted: false });
    expect(await readSessions()).toEqual({});
    expect(chromeStub.storage.local.writes().length).toBe(escriturasAntes);
  });
});

describe('M26 · creación y lectura sin renovación', () => {
  it('`connectSession` es la única vía de creación: fija `connectedAt` y TTL de 24 h', async () => {
    const primera = await connectSession({
      origin: ORIGEN,
      account: CUENTA,
      chainId: '0x7a69',
      tabId: 21,
      now: T0,
    });
    expect(primera?.isNewConnection).toBe(true);
    expect(primera?.session).toMatchObject({
      origin: ORIGEN,
      account: CUENTA,
      chainId: '0x7a69',
      tabIds: [21],
      connectedAt: T0,
      lastUsedAt: T0,
      expiresAt: T0 + 86_400_000,
      connected: true,
    });

    const segunda = await connectSession({
      origin: ORIGEN,
      account: CUENTA,
      chainId: '0x7a69',
      tabId: 22,
      now: T0 + 1_000,
    });
    expect(segunda?.isNewConnection).toBe(false);
    // `connectedAt` se conserva (es la conexión original) y el uso se refresca.
    expect(segunda?.session.connectedAt).toBe(T0);
    expect(segunda?.session.lastUsedAt).toBe(T0 + 1_000);
    expect(segunda?.session.expiresAt).toBe(T0 + 1_000 + 86_400_000);
  });

  it('`currentSessionFor` es una LECTURA PURA: no renueva ni escribe', async () => {
    await seed({ [ORIGEN]: sessionOf() });
    const escriturasAntes = chromeStub.storage.local.writes().length;

    const sesiones = await readSessions();
    const vigente = currentSessionFor(sesiones, ORIGEN, T0 + 1_000);
    expect(vigente?.account).toBe(CUENTA);
    expect(currentSessionFor(sesiones, ORIGEN, T0 + SESSION_TTL_MS)).toBeNull();
    expect(currentSessionFor(sesiones, 'http://otra-dapp.test', T0)).toBeNull();

    expect(chromeStub.storage.local.writes().length).toBe(escriturasAntes);
    expect((await rawSessions())[ORIGEN]?.expiresAt).toBe(T0 + SESSION_TTL_MS);
  });

  it('la clave canónica es el origen normalizado (minúsculas y sin barra final)', async () => {
    await connectSession({
      origin: 'HTTP://LOCALHOST:5174/',
      account: CUENTA,
      chainId: '0x7a69',
      now: T0,
    });
    const persistido = await rawSessions();
    expect(Object.keys(persistido)).toEqual([ORIGEN]);

    await seed(persistido as Record<string, unknown>);
    expect((await touchSession('http://localhost:5174/', { now: T0 + 1 })).session?.account).toBe(CUENTA);
  });

  it('`isSessionValid`: `expiresAt === null` es «sin caducidad» y `connected: false` invalida', () => {
    expect(isSessionValid(sessionOf({ expiresAt: null }), T0)).toBe(true);
    expect(isSessionValid(sessionOf({ expiresAt: T0 + 1 }), T0)).toBe(true);
    expect(isSessionValid(sessionOf({ expiresAt: T0 }), T0)).toBe(false);
    expect(isSessionValid(sessionOf({ connected: false }), T0)).toBe(false);
    expect(isSessionValid(null, T0)).toBe(false);
    expect(isSessionValid(undefined, T0)).toBe(false);
  });

  it('`rememberTab` registra la pestaña solo si el origen tiene sesión vigente', async () => {
    await rememberTab(ORIGEN, 33);
    expect(await readSessions(), 'sin sesión no debe escribir nada').toEqual({});

    await seed({ [ORIGEN]: sessionOf({ tabIds: [7] }) });
    await rememberTab(ORIGEN, 33);
    await rememberTab(ORIGEN, 7);
    await rememberTab(ORIGEN, null);
    expect((await rawSessions())[ORIGEN]?.tabIds).toEqual([7, 33]);
  });
});

describe('M26 · revocación desde el popup (CA-RF-26, tarea 3.11)', () => {
  it('elimina el origen, devuelve sus pestañas y es idempotente', async () => {
    await seed({
      [ORIGEN]: sessionOf({ tabIds: [7, 9] }),
      'http://otra-dapp.test': sessionOf({ origin: 'http://otra-dapp.test', account: CUENTA }),
    });

    const revocada = await revokeSession('HTTP://LOCALHOST:5174/');
    expect(revocada).toEqual({ origin: ORIGEN, revoked: true, tabIds: [7, 9] });

    const restantes = await rawSessions();
    expect(Object.keys(restantes)).toEqual(['http://otra-dapp.test']);
    expect((await readSessions())[ORIGEN]).toBeUndefined();

    // Idempotente: la segunda revocación no falla ni cambia nada.
    expect(await revokeSession(ORIGEN)).toEqual({ origin: ORIGEN, revoked: false, tabIds: [] });
    // Y un origen inválido no puede revocar nada.
    expect(await revokeSession(123 as unknown as string)).toBeNull();
  });

  it('tras revocar, el origen vuelve a `[]` y NO se crea ninguna entrada en la cola', async () => {
    await seed({ [ORIGEN]: sessionOf({ tabIds: [7] }) });
    // La cola de aprobaciones NO existe en H3: la revocación no debe escribirla.
    expect(await chrome.storage.local.get('truekeate_pending_requests')).toEqual({});

    await revokeSession(ORIGEN);

    const sesiones = await readSessions();
    expect(currentSessionFor(sesiones, ORIGEN, T0)).toBeNull();
    expect(await chrome.storage.local.get('truekeate_pending_requests')).toEqual({});
    const clavesEscritas = chromeStub.storage.local
      .writes()
      .flatMap((escritura: Record<string, unknown>) => Object.keys(escritura));
    expect(clavesEscritas).not.toContain('truekeate_pending_requests');
  });
});

describe('M26 · cambio de la cuenta activa (D-H3-A / D-H3-B, `CA-RF-15`)', () => {
  it('actualiza la cuenta compartida SOLO de las sesiones vigentes y devuelve sus pestañas', async () => {
    const OTRA = 'http://otra-dapp.test';
    await seed({
      [ORIGEN]: sessionOf({ tabIds: [7, 9] }),
      // Ya comparte la cuenta nueva: no se reescribe ni aporta pestañas al evento.
      [OTRA]: sessionOf({ origin: OTRA, account: CUENTA_NUEVA, tabIds: [11] }),
      // Vencida: no se toca (su purga sigue siendo perezosa).
      'http://vencida.test': sessionOf({
        origin: 'http://vencida.test',
        tabIds: [13],
        expiresAt: T0,
      }),
      // Marcada como desconectada: tampoco se toca.
      'http://desconectada.test': sessionOf({
        origin: 'http://desconectada.test',
        tabIds: [15],
        connected: false,
      }),
    });

    const propagado = await applyActiveAccountToSessions(CUENTA_NUEVA, { now: T0 });

    expect(propagado).toEqual({ origins: [ORIGEN], tabIds: [7, 9] });

    const persistido = await rawSessions();
    expect(persistido[ORIGEN]?.account).toBe(CUENTA_NUEVA);
    // El cambio de cuenta NO es un uso de la dApp: los plazos se conservan (RF-25).
    expect(persistido[ORIGEN]?.lastUsedAt).toBe(T0);
    expect(persistido[ORIGEN]?.expiresAt).toBe(T0 + SESSION_TTL_MS);
    expect(persistido[OTRA]?.account).toBe(CUENTA_NUEVA);
    expect(persistido['http://vencida.test']?.account).toBe(CUENTA);
    expect(persistido['http://desconectada.test']?.account).toBe(CUENTA);
  });

  it('sin sesiones vigentes que cambiar NO escribe nada (ni renueva ni purga)', async () => {
    await seed({ [ORIGEN]: sessionOf({ account: CUENTA_NUEVA, tabIds: [7] }) });
    const escriturasAntes = chromeStub.storage.local.writes().length;

    const propagado = await applyActiveAccountToSessions(CUENTA_NUEVA, { now: T0 });

    expect(propagado).toEqual({ origins: [], tabIds: [] });
    expect(chromeStub.storage.local.writes().length).toBe(escriturasAntes);
  });
});

/**
 * RMW SERIALIZADO (fleco 4 de la fase 4). La auditoría de unitarias midió que `sessions.ts` hacía
 * `readStorage` → mutar → `writeStorage` **sin cerrojo**: dos mutaciones solapadas partían de la
 * MISMA instantánea y la segunda pisaba a la primera, perdiendo una renovación, una pestaña o una
 * revocación. El patrón aplicado es el `rmwLock` que ya existía en `approvals/queue.ts`.
 */
describe('M26 · RMW serializado de `truekeate_connected_sites` (fleco 4 de la fase 4)', () => {
  it('dos renovaciones simultáneas de orígenes distintos NO se pisan', async () => {
    const A = 'http://a.test';
    const B = 'http://b.test';
    await seed({ [A]: sessionOf({ origin: A, tabIds: [1] }), [B]: sessionOf({ origin: B, tabIds: [2] }) });

    const [a, b] = await Promise.all([
      touchSession(A, { now: T0 + 1_000, tabId: 10 }),
      touchSession(B, { now: T0 + 2_000, tabId: 20 }),
    ]);

    expect(a.session?.tabIds).toEqual([1, 10]);
    expect(b.session?.tabIds).toEqual([2, 20]);
    const persistido = await rawSessions();
    // Sin cerrojo, la segunda escritura habría partido de la instantánea ANTERIOR a la primera y
    // uno de los dos orígenes habría perdido su renovación.
    expect(persistido[A]?.lastUsedAt).toBe(T0 + 1_000);
    expect(persistido[A]?.tabIds).toEqual([1, 10]);
    expect(persistido[B]?.lastUsedAt).toBe(T0 + 2_000);
    expect(persistido[B]?.tabIds).toEqual([2, 20]);
    expect(Object.keys(persistido).sort()).toEqual([A, B]);
  });

  it('una revocación y una renovación simultáneas del MISMO origen no se pisan', async () => {
    await seed({ [ORIGEN]: sessionOf({ tabIds: [4] }) });

    const [revocado, renovado] = await Promise.all([
      revokeSession(ORIGEN, { tabId: 5 }),
      touchSession(ORIGEN, { now: T0 + 5_000, tabId: 6 }),
    ]);

    expect(revocado?.revoked).toBe(true);
    // Una de las dos gana y la otra ve el estado ya mutado; lo que NO puede ocurrir es que la
    // sesión revocada «resucite» por una instantánea vieja.
    const persistido = await rawSessions();
    if (renovado.session === null) {
      expect(persistido[ORIGEN]).toBeUndefined();
    } else {
      expect(persistido[ORIGEN]?.tabIds).toContain(6);
    }
  });

  it('varias renovaciones simultáneas acumulan TODAS las pestañas (ninguna se pierde)', async () => {
    await seed({ [ORIGEN]: sessionOf({ tabIds: [] }) });

    await Promise.all([
      touchSession(ORIGEN, { now: T0 + 1, tabId: 1 }),
      touchSession(ORIGEN, { now: T0 + 2, tabId: 2 }),
      touchSession(ORIGEN, { now: T0 + 3, tabId: 3 }),
      touchSession(ORIGEN, { now: T0 + 4, tabId: 4 }),
    ]);

    const persistido = await rawSessions();
    expect(persistido[ORIGEN]?.tabIds).toEqual([1, 2, 3, 4]);
    expect(persistido[ORIGEN]?.lastUsedAt).toBe(T0 + 4);
    // El cerrojo se vacía: no queda ninguna tarea encadenada.
    expect(sessionsLock.depth()).toBe(0);
  });

  it('las escrituras serializadas nunca dejan el mapa con un número menor de orígenes', async () => {
    const origenes = ['http://o1.test', 'http://o2.test', 'http://o3.test'];
    await seed(Object.fromEntries(origenes.map((origen) => [origen, sessionOf({ origin: origen })])));

    await Promise.all(origenes.map((origen, indice) => rememberTab(origen, indice + 1)));

    const persistido = await rawSessions();
    expect(Object.keys(persistido).sort()).toEqual([...origenes].sort());
    for (const [indice, origen] of origenes.entries()) {
      expect(persistido[origen]?.tabIds).toEqual([indice + 1]);
    }
  });
});
