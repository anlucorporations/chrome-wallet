/**
 * M30 — `src/background/logging/logger.spec.ts`
 * Regla «**exactamente 1 entrada por evento del catálogo**» (tarea 5.6, RNF-16).
 *
 * Fuente normativa: `documento_tecnico.md` §3.6 (fuente de verdad del log y regla 3),
 * `diccionario_datos.md` §2.11 y `plan_desarrollo.md` §3.5.5 tarea 5.6. Lo que fija este spec:
 *
 *   1. cada evento del catálogo produce **UNA** entrada, con `ts`, `level`, `category`, `event`,
 *      `origin` y `method`;
 *   2. un `event` fuera del catálogo es un error de programación (`RangeError`), no una entrada;
 *   3. la escritura la hace el Service Worker sobre `truekeate_logs` y el popup solo lee;
 *   4. la retención FIFO de M32 se aplica al escribir (500 globales / 200 por origen).
 */

import { describe, expect, it } from 'vitest';
import { chromeStub, STUB_EPOCH_MS } from '../../../test/setup/chrome-stub';
import type { LogEntry } from '../../shared/types';
import { STORAGE_KEYS, readStorage } from '../state/schema';
import {
  LOG_EVENT_NAMES,
  readLogsView,
  logEvent,
  writeLogEntries,
  type LogEntryInput,
} from './logger';
import { LOG_CATEGORIES } from './events';

/** Lee `truekeate_logs` del stub. */
const leerLogs = async (): Promise<LogEntry[]> => {
  // El `get` del stub puede resolverse como `undefined` (sobrecarga con callback de la API real):
  // una lectura ausente es una instantánea VACÍA, nunca un fallo de la prueba.
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) ?? {};
  const value = items[STORAGE_KEYS.logs];
  return Array.isArray(value) ? (value as LogEntry[]) : [];
};

/** Entrada mínima de la forma de H3/H4. */
const entrada = (event: LogEntryInput['event'], extra: Partial<LogEntryInput> = {}): LogEntryInput => ({
  event,
  category: 'call',
  level: 'info',
  message: `traza de ${event}`,
  data: { ok: true },
  ...extra,
});

describe('M30 · exactamente 1 entrada por evento del catálogo', () => {
  it('los 24 eventos producen 24 entradas, una por evento, con los 6 campos obligatorios', async () => {
    for (const event of LOG_EVENT_NAMES) {
      const entry = await logEvent({
        event,
        origin: 'http://localhost:5174',
        method: 'eth_chainId',
        data: { ok: true },
      });
      expect(entry, event).not.toBeNull();
      expect(entry?.event).toBe(event);
    }

    const logs = await leerLogs();
    expect(logs).toHaveLength(24);
    expect(new Set(logs.map((entry) => entry.event)).size).toBe(24);

    for (const entry of logs) {
      // Los 6 campos obligatorios de §3.6 regla 3.
      expect(typeof entry.ts, entry.event).toBe('number');
      expect(['info', 'success', 'warn', 'error'], entry.event).toContain(entry.level);
      expect(LOG_CATEGORIES, entry.event).toContain(entry.category);
      expect(LOG_EVENT_NAMES, entry.event).toContain(entry.event);
      expect(entry.origin, entry.event).toBe('http://localhost:5174');
      expect(entry.method, entry.event).toBe('eth_chainId');
      // Y los que completan la forma de §2.11.
      expect(typeof entry.id, entry.event).toBe('string');
      expect(typeof entry.message, entry.event).toBe('string');
      expect(entry.message.length, entry.event).toBeGreaterThan(0);
    }
  });

  it('un lote de N entradas escribe N entradas con UNA sola escritura del almacén', async () => {
    const antesEscrituras = chromeStub.storage.local.writes().length;

    const escritas = await writeLogEntries(
      [
        entrada('approval_expired', { category: 'event', level: 'warn' }),
        entrada('sw_reconcile', { category: 'system', level: 'info' }),
        entrada('tx_sent', { category: 'tx', level: 'info' }),
      ],
      { now: STUB_EPOCH_MS },
    );

    expect(escritas).toHaveLength(3);
    expect(await leerLogs()).toHaveLength(3);
    // Escritura del lote + el contador de descartes: no hay una escritura por entrada.
    const escrituras = chromeStub.storage.local.writes().slice(antesEscrituras);
    expect(escrituras.filter((item) => STORAGE_KEYS.logs in item)).toHaveLength(1);
  });

  it('un `event` fuera del catálogo es un error de programación y NO se persiste', async () => {
    await expect(
      logEvent({ event: 'evento_inventado' as never }),
    ).rejects.toThrowError(/no pertenece al catálogo cerrado de 24 eventos/);

    await expect(
      writeLogEntries([entrada('inventado' as never)]),
    ).rejects.toBeInstanceOf(RangeError);

    expect(await leerLogs()).toEqual([]);
  });

  it('una categoría usada como evento se rechaza (ACU-04: `event` y `category` son distintos)', async () => {
    await expect(logEvent({ event: 'system' as never })).rejects.toBeInstanceOf(RangeError);
    await expect(logEvent({ event: 'tx' as never })).rejects.toBeInstanceOf(RangeError);
    expect(await leerLogs()).toEqual([]);
  });

  it('la escritura la hace el SW y el popup solo lee: `truekeate_logs` está en `chrome.storage.local`', async () => {
    await logEvent({ event: 'sw_started', origin: 'extension' });

    const persistido = await readStorage([STORAGE_KEYS.logs], chromeStub.storage.local);
    const logs = persistido[STORAGE_KEYS.logs] as LogEntry[];
    expect(logs).toHaveLength(1);
    expect(logs[0]?.event).toBe('sw_started');
    expect(logs[0]?.origin).toBe('extension');
    // El popup no tiene otra fuente: `readLogsView` es lectura pura y no escribe.
    const escriturasAntes = chromeStub.storage.local.writes().length;
    const vista = await readLogsView();
    expect(vista.entries).toHaveLength(1);
    expect(vista.dropped).toBe(0);
    expect(chromeStub.storage.local.writes().length).toBe(escriturasAntes);
  });

  it('los 24 eventos con el MISMO origen caben: la retención por origen no recorta por debajo de 200', async () => {
    for (const event of LOG_EVENT_NAMES) {
      await logEvent({ event, origin: 'http://localhost:5174' });
    }
    expect(await leerLogs()).toHaveLength(24);
  });

  it('aplica la retención FIFO de M32: se descartan las entradas más antiguas (200 por origen)', async () => {
    // 201 entradas del mismo origen: el límite por origen (`logMaxPerOrigin = 200`) recorta la
    // más antigua y el resultado sigue siendo 200.
    const lote: LogEntryInput[] = Array.from({ length: 201 }, (_, index) =>
      entrada('rpc_call', {
        message: `llamada ${index}`,
        origin: 'http://localhost:5174',
      }),
    );
    await writeLogEntries(lote, { now: STUB_EPOCH_MS });

    const logs = await leerLogs();
    expect(logs).toHaveLength(200);
    expect(logs[0]?.message).toBe('llamada 1');
    expect(logs[199]?.message).toBe('llamada 200');
  });
});
