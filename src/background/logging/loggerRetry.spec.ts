/**
 * M30/M33 — `src/background/logging/loggerRetry.spec.ts`
 * Política de **1 reintento** tras la retención FIFO (§2.15 paso 1) y clasificación del error.
 *
 * Fuente normativa: `diccionario_datos.md` §2.15 y `plan_desarrollo.md` §3.5.5 tarea 5.8. Lo que
 * fija este spec:
 *
 *   1. un rechazo por cuota produce **exactamente 1 reintento**, no un bucle de escritura;
 *   2. el reintento reescribe la lista YA retenida (la entrada sobrevive si el recorte la hace
 *      caber);
 *   3. un fallo que NO es de cuota no inventa el aviso de almacenamiento lleno ni reintenta.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chromeStub } from '../../../test/setup/chrome-stub';
import type { LogEntry } from '../../shared/types';
import { STORAGE_KEYS, isStorageQuotaError } from '../state/schema';
import { logEvent, readLogDiagnostics, resetLogDiagnostics, writeLogEntries } from './logger';

/** Implementación ORIGINAL de `set` (el `reset` del stub no la repara). */
const setOriginal = chromeStub.storage.local.set.bind(chromeStub.storage.local);

/** Vuelve a dejar `storage.local.set` en su implementación real. */
const restaurarAlmacen = (): void => {
  chromeStub.storage.local.set = setOriginal as typeof chromeStub.storage.local.set;
};

/** Instala un rechazo sobre las N primeras escrituras; devuelve el contador de intentos. */
const instalarFallo = (veces: number, mensaje = 'QUOTA_BYTES quota exceeded'): { intentos: () => number } => {
  let restantes = veces;
  let intentos = 0;
  chromeStub.storage.local.set = ((items: Record<string, unknown>) => {
    intentos += 1;
    if (restantes > 0) {
      restantes -= 1;
      return Promise.reject(new Error(mensaje));
    }
    return setOriginal(items);
  }) as typeof chromeStub.storage.local.set;
  return { intentos: () => intentos };
};

/** Lee `truekeate_logs` del stub. */
const leerLogs = async (): Promise<LogEntry[]> => {
  const items = await chromeStub.storage.local.get(STORAGE_KEYS.logs);
  const value = items[STORAGE_KEYS.logs];
  return Array.isArray(value) ? (value as LogEntry[]) : [];
};

beforeEach(() => {
  resetLogDiagnostics();
});

afterEach(() => {
  restaurarAlmacen();
});

describe('M30 · 1 reintento tras la retención FIFO', () => {
  it('un rechazo por cuota reintenta UNA vez y, si el recorte basta, la entrada sobrevive', async () => {
    // 200 entradas del mismo origen (límite por origen): la retención global deja sitio a la nueva.
    await writeLogEntries(
      Array.from({ length: 200 }, (_, index) => ({
        event: 'rpc_call' as const,
        category: 'call' as const,
        level: 'info' as const,
        message: `previa ${index}`,
        data: { index },
        origin: 'http://localhost:5174',
      })),
      { now: 1_000, limits: { global: 500, perOrigin: 200 } },
    );
    expect(await leerLogs()).toHaveLength(200);

    // El PRIMER `set` falla por cuota (el 2.º es el reintento, que sí escribe).
    const fallo = instalarFallo(1);
    const entry = await logEvent(
      { event: 'tx_sent', origin: 'http://localhost:5174', data: { txHash: `0x${'11'.repeat(32)}` } },
      { limits: { global: 500, perOrigin: 200 } },
    );

    expect(entry).not.toBeNull();
    expect(entry?.event).toBe('tx_sent');
    const logs = await leerLogs();
    expect(logs).toHaveLength(200);
    expect(logs[199]?.event).toBe('tx_sent');
    // Un intento fallido + UN reintento del log = 2 escrituras de la traza (sin bucle). El
    // contador de descartes añade una tercera, que no es un reintento de la entrada.
    expect(fallo.intentos()).toBe(3);
    const diagnostico = readLogDiagnostics();
    expect(diagnostico).toMatchObject({ retries: 1, dropped: 0, attempts: 2 });
  });

  it('un fallo que NO es de cuota no reintenta ni avisa de almacenamiento lleno', async () => {
    const fallo = instalarFallo(1, 'disco roto');

    const entry = await logEvent({ event: 'rpc_call' });
    restaurarAlmacen();

    expect(entry).toBeNull();
    // Un único intento: ni reintento del log, ni entrada de diagnóstico (no es cuota).
    console.log('DEBUG no-cuota intentos', fallo.intentos(), JSON.stringify(readLogDiagnostics()), JSON.stringify(await leerLogs()).slice(0, 200));
    expect(fallo.intentos()).toBe(1);
    expect(readLogDiagnostics()).toMatchObject({ dropped: 0, retries: 0, attempts: 1 });
    expect(await leerLogs()).toEqual([]);
  });

  it('clasifica el rechazo por cuota con la fuente única de M33', () => {
    expect(isStorageQuotaError(new Error('QUOTA_BYTES quota exceeded'))).toBe(true);
    expect(isStorageQuotaError({ name: 'QuotaExceededError', message: 'exceeded' })).toBe(true);
    expect(isStorageQuotaError(new Error('otra cosa'))).toBe(false);
    expect(isStorageQuotaError('QUOTA_BYTES')).toBe(true);
  });

  it('sin API de almacén no lanza y no cuenta el descarte como cuota', async () => {
    const entry = await logEvent({ event: 'rpc_call' }, { storage: null });
    expect(entry).toBeNull();
    expect(await leerLogs()).toEqual([]);
    expect(readLogDiagnostics()).toMatchObject({ dropped: 0, retries: 0 });
  });
});
