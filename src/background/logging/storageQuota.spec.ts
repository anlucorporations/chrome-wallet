/**
 * M33/M30/M3 — `src/background/logging/storageQuota.spec.ts`
 * **Cuota de 10 MB observable** (tarea 5.8, §2.15 y riesgo R13).
 *
 * Es la prueba de aceptación literal de §2.15: se llena el stub **hasta el rechazo** y se afirma
 * (a) **exactamente 1 reintento**, (b) **1 `rpc_error` con `code: -32603`** y el evento
 * `storage_quota_exceeded` (`category: 'system'`, `level: 'error'`) y (c) el **contador de
 * descartes** visible, que `wallet_getLogs` publica en `dropped` (tarea 5.9).
 *
 * Ningún fallo queda en silencio: si ni la entrada de diagnóstico cabe, el contador en memoria, el
 * persistido en `truekeate_logs_dropped` y el `dropped` de `wallet_getLogs` siguen publicándolo.
 *
 * Requisitos: RNF-16 (ADT-14 / D-M).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chromeStub, STUB_EPOCH_MS } from '../../../test/setup/chrome-stub';
import type { TrustedSenderContext } from '../security/senderGuard';
import {
  LOG_DROPPED_COUNTER_KEY,
  STORAGE_KEYS,
  STORAGE_QUOTA_BYTES,
  STORAGE_QUOTA_WARN_RATIO,
  isStorageQuotaError,
  readStorageQuota,
} from '../state/schema';
import { invokeInternalMethod, type InternalWalletResultMap } from '../rpc/catalog';
import {
  hydrateLogDiagnostics,
  logEvent,
  readLogDiagnostics,
  readLogsView,
  resetLogDiagnostics,
} from './logger';

/** Contexto de la extensión (el popup es el único que invoca los internos, M20). */
const CONTEXTO: TrustedSenderContext = {
  runtimeId: 'tk-stub-extension-id-for-tests',
  origin: 'extension',
  isExtensionContext: true,
  route: 'popup.html',
  tabId: null,
  frameId: 0,
  respondToFrameOnly: false,
  declaredOrigin: null,
};

/** Implementación ORIGINAL de `set` (el `reset` del stub no la repara). */
const setOriginal = chromeStub.storage.local.set.bind(chromeStub.storage.local);

/** Vuelve a dejar `storage.local.set` en su implementación real. */
const restaurarAlmacen = (): void => {
  chromeStub.storage.local.set = setOriginal as typeof chromeStub.storage.local.set;
};

/**
 * Instala un rechazo de cuota sobre las `rechazos` PRIMERAS escrituras de `storage.local.set`.
 *
 * Modela el modo de fallo de §2.15 con precisión: el **lote** de la traza se rechaza (intento +
 * reintento) mientras que las escrituras PEQUEÑAS que vienen después —el contador de descartes y
 * la propia entrada de diagnóstico `storage_quota_exceeded`— sí caben; con `rechazos` igual al
 * total de escrituras (4) se modela el caso extremo en el que NADA cabe.
 */
const instalarCuotaAgotada = (rechazos: number): { intentos: () => number } => {
  let intentos = 0;
  chromeStub.storage.local.set = ((items: Record<string, unknown>) => {
    intentos += 1;
    if (intentos <= rechazos) {
      return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    }
    return setOriginal(items);
  }) as typeof chromeStub.storage.local.set;
  return { intentos: () => intentos };
};

/** Lee `truekeate_logs` del stub. */
const leerLogs = async (): Promise<Record<string, unknown>[]> => {
  // El `get` del stub puede resolverse como `undefined` (sobrecarga con callback de la API real):
  // una lectura ausente es una instantánea VACÍA, nunca un fallo de la prueba.
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) ?? {};
  const value = items[STORAGE_KEYS.logs];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
};

beforeEach(() => {
  resetLogDiagnostics();
});

afterEach(() => {
  restaurarAlmacen();
});

describe('M33/M30 · cuota de 10 MB observable (§2.15, R13)', () => {
  it('declara la cuota objetivo de 10 MB y el umbral de aviso del 90 %', () => {
    expect(STORAGE_QUOTA_BYTES).toBe(10_485_760);
    expect(STORAGE_QUOTA_WARN_RATIO).toBe(0.9);
    expect(chromeStub.storage.local.QUOTA_BYTES).toBe(STORAGE_QUOTA_BYTES);
  });

  it('llena el stub hasta el rechazo y demuestra (a) 1 reintento, (b) `rpc_error -32603` + evento y (c) contador', async () => {
    // 1. El almacén se llena hasta el rechazo con un relleno realista (aún no hay clave de logs).
    await chromeStub.storage.local.set({ truekeate_relleno: 'x'.repeat(20_000) });
    expect(await chromeStub.storage.local.getBytesInUse(null)).toBeGreaterThan(20_000);

    // 2. El LOTE del log se rechaza por cuota (intento + reintento), como con el almacén lleno;
    //    las escrituras pequeñas posteriores (contador y diagnóstico) sí caben.
    const cuota = instalarCuotaAgotada(2);

    // 3. Se emite un evento del catálogo: su entrada NO puede persistirse.
    const entrada = await logEvent(
      {
        event: 'rpc_error',
        origin: 'http://localhost:5174',
        method: 'eth_sendTransaction',
        data: { code: -32603, reason: 'difusion-interrumpida' },
      },
      { now: STUB_EPOCH_MS },
    );
    restaurarAlmacen();

    expect(entrada, 'la entrada descartada no puede devolverse como escrita').toBeNull();

    // (a) EXACTAMENTE 1 reintento de la escritura del log: `attempts` solo cuenta el camino de
    //     escritura de la traza (1 intento + 1 reintento); las escrituras del contador pasan por
    //     `persistDiagnostics` y NO son reintentos de la entrada descartada.
    const diagnostico = readLogDiagnostics();
    expect(diagnostico).toMatchObject({ retries: 1, dropped: 1, attempts: 2 });
    // 4 `set` observados: intento + reintento del log, contador de descartes y entrada de
    // diagnóstico. Ninguno más: no hay bucle de escritura.
    expect(cuota.intentos()).toBe(4);

    // (b) El descarte deja SIEMPRE la constancia observable: el `rpc_error -32603` con el mensaje
    //     «no se pudo guardar el registro por falta de espacio» vive en el `data` de la entrada
    //     `storage_quota_exceeded` (`category: 'system'`, `level: 'error'`).
    const logs = await leerLogs();
    const cuotaEntry = logs.find((item) => item.event === 'storage_quota_exceeded');
    expect(cuotaEntry).toBeDefined();
    expect(cuotaEntry).toMatchObject({
      event: 'storage_quota_exceeded',
      category: 'system',
      level: 'error',
    });
    const data = cuotaEntry?.data as Record<string, unknown>;
    expect(data.code).toBe(-32603);
    expect(data.message).toBe('no se pudo guardar el registro por falta de espacio');
    expect(data.key).toBe(STORAGE_KEYS.logs);
    expect(data.retried).toBe(true);
    expect(data.bytesInUse).toBeGreaterThan(20_000);
    expect(data.droppedEvent).toBe('rpc_error');
    expect(data.droppedCount).toBe(1);
    // Y la entrada descartada NO se inventa ni se escribe a medias.
    expect(logs.filter((item) => item.event === 'rpc_error')).toHaveLength(0);
    expect(logs).toHaveLength(1);

    // (c) El contador de descartes es VISIBLE y queda persistido para sobrevivir al SW.
    const persistido = (await chromeStub.storage.local.get(LOG_DROPPED_COUNTER_KEY)) ?? {};
    expect(persistido[LOG_DROPPED_COUNTER_KEY]).toMatchObject({ dropped: 1, retries: 1 });
    expect((await readLogsView()).dropped).toBe(1);
  });

  it('`wallet_getLogs` publica `dropped` y `truncated` (tarea 5.9): el descarte es visible en el panel', async () => {
    const cuota = instalarCuotaAgotada(2);
    await logEvent({ event: 'tx_sent', origin: 'http://localhost:5174' }, { now: STUB_EPOCH_MS });
    restaurarAlmacen();
    expect(cuota.intentos()).toBe(4);

    const respuesta = (await invokeInternalMethod('wallet_getLogs', [], CONTEXTO)) as
      InternalWalletResultMap['wallet_getLogs'];

    expect(respuesta.dropped).toBe(1);
    expect(respuesta.truncated).toBe(true);
    expect(respuesta.entries.some((entry) => entry.event === 'storage_quota_exceeded')).toBe(true);
    // La entrada descartada no viaja al panel: solo el aviso de cuota.
    expect(respuesta.entries.some((entry) => entry.event === 'tx_sent')).toBe(false);

    // Y una segunda lectura no inventa descartes: el contador es del logger, no de la lectura.
    const segunda = await readLogsView();
    expect(segunda.dropped).toBe(1);
    expect(segunda.trimmed).toBe(0);
  });

  it('si NADA cabe (ni el diagnóstico), el descarte sigue siendo visible por el contador', async () => {
    // Caso extremo: las CUATRO escrituras (lote, reintento, contador y diagnóstico) se rechazan.
    const cuota = instalarCuotaAgotada(4);
    await logEvent({ event: 'rpc_call', origin: 'http://localhost:5174' }, { now: STUB_EPOCH_MS });

    expect(cuota.intentos()).toBe(4);
    restaurarAlmacen();
    expect(await leerLogs()).toEqual([]);
    // El contador en memoria se publica aunque el almacén esté lleno: nunca un fallo silencioso.
    const vista = await readLogsView();
    expect(vista.dropped).toBe(1);
    expect(vista.truncated).toBe(true);
    expect(readLogDiagnostics().dropped).toBe(1);
  });

  it('el contador de descartes se reconstruye al arrancar el SW (`hydrateLogDiagnostics`)', async () => {
    // Se simula el estado dejado por un arranque anterior en el que hubo 4 descartes.
    await chromeStub.storage.local.set({
      [LOG_DROPPED_COUNTER_KEY]: { dropped: 4, retries: 2, updatedAt: STUB_EPOCH_MS },
    });
    resetLogDiagnostics();

    const hidratado = await hydrateLogDiagnostics();

    expect(hidratado).toMatchObject({ dropped: 4, retries: 2 });
    expect(readLogDiagnostics().dropped).toBe(4);
    expect((await readLogsView()).dropped).toBe(4);
  });

  it('la cuota es medible y avisa al 90 % sin persistir ningún contador propio', async () => {
    await chromeStub.storage.local.set({ truekeate_relleno: 'x'.repeat(1_000) });

    const medicion = await readStorageQuota(null);
    expect(medicion.quotaBytes).toBe(STORAGE_QUOTA_BYTES);
    expect(medicion.bytesInUse).toBeGreaterThan(0);
    expect(medicion.usedRatio).toBeLessThan(STORAGE_QUOTA_WARN_RATIO);
    expect(medicion.warning).toBe(false);

    const porClave = await readStorageQuota(STORAGE_KEYS.logs);
    expect(porClave.key).toBe(STORAGE_KEYS.logs);
    expect(porClave.bytesInUse).toBe(0);
    expect(porClave.warning).toBe(false);
  });

  it('`unlimitedStorage` NO se declara: la cuota del almacén es la de Chrome 114', () => {
    const manifest = chromeStub.runtime.getManifest();
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions ?? []).not.toContain('unlimitedStorage');
  });

  it('la clasificación del rechazo por cuota es la de M33 (fuente única)', () => {
    expect(isStorageQuotaError(new Error('QUOTA_BYTES quota exceeded'))).toBe(true);
    expect(isStorageQuotaError(new Error('QuotaExceededError'))).toBe(true);
    expect(isStorageQuotaError(new Error('disco lleno pero no es la cuota de Chrome'))).toBe(false);
  });
});
