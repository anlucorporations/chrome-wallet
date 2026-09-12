/**
 * M30/M22 — `src/background/logging/logRedaction.spec.ts`
 * Prohibición BLOQUEANTE de §3.5.8 (riesgo R4): **ninguna entrada de `truekeate_logs` contiene el
 * payload íntegro**, ni claves privadas, ni el mnemonic, ni firmas completas.
 *
 * Fuente normativa: `documento_tecnico.md` §3.6 regla 4 y §4.4, `diccionario_datos.md` §2.11
 * (regla única de `data`: **primeros 10 bytes** + `dataLength`) y `plan_desarrollo.md` §3.5.7
 * («`logRedaction.spec.ts` (0 claves, 0 payload íntegro, primeros 10 bytes de `data`)»).
 */

import { describe, expect, it } from 'vitest';
import { chromeStub, STUB_EPOCH_MS } from '../../../test/setup/chrome-stub';
import type { LogEntry } from '../../shared/types';
import { DATA_PREVIEW_BYTES, DATA_PREVIEW_CHARS, redactParams } from '../security/redaction';
import { STORAGE_KEYS } from '../state/schema';
import { sanitizeLogData, logEvent } from './logger';

/** Frase BIP-39 de pruebas (la de Anvil): NUNCA puede acabar en el log. */
const MNEMONIC = 'test test test test test test test test test test test junk';

/** Clave privada de pruebas (cuenta 0 de Anvil). */
const PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Calldata larga: el log solo puede conservar sus primeros 10 bytes (0x + 20 hex). */
const CALLDATA = `0xa9059cbb${'00'.repeat(31)}deadbeef${'ab'.repeat(64)}`;

/** Firma completa de 65 bytes. */
const SIGNATURE = `0x${'1b'.repeat(65)}`;

/** Lee `truekeate_logs` del stub. */
const leerLogs = async (): Promise<LogEntry[]> => {
  // El `get` del stub puede resolverse como `undefined` (sobrecarga con callback de la API real):
  // una lectura ausente es una instantánea VACÍA, nunca un fallo de la prueba.
  const items = (await chromeStub.storage.local.get(STORAGE_KEYS.logs)) ?? {};
  const value = items[STORAGE_KEYS.logs];
  return Array.isArray(value) ? (value as LogEntry[]) : [];
};

/** Serializa el log completo: es sobre el TEXTO persistido sobre el que se afirma la ausencia. */
const textoPersistido = async (): Promise<string> => JSON.stringify(await leerLogs());

describe('M22/M30 · redacción bloqueante de `truekeate_logs`', () => {
  it('de `data` solo se registran los primeros 10 bytes, con `dataLength`', async () => {
    await logEvent({
      event: 'rpc_call',
      method: 'eth_sendTransaction',
      data: redactParams('eth_sendTransaction', [
        { from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', to: null, value: '0x1', data: CALLDATA },
      ]),
    });

    const logs = await leerLogs();
    const data = logs[0]?.data as { data?: string; dataLength?: number };
    // La regla única de D-T: `0x` + 20 hex = 10 bytes.
    expect(data.data).toBe(`0x${CALLDATA.slice(2, 2 + DATA_PREVIEW_BYTES * 2)}`);
    expect(data.data).toHaveLength(DATA_PREVIEW_CHARS);
    expect(data.dataLength).toBe(Math.floor((CALLDATA.length - 2) / 2));
    // Y el calldata COMPLETO no está en ninguna parte de la entrada.
    expect(JSON.stringify(logs[0])).not.toContain(CALLDATA);
  });

  it('`redactParams` de `eth_sendTransaction` devuelve el recorte de 10 bytes y nunca el payload', () => {
    const redactado = redactParams('eth_sendTransaction', [
      { to: '0x0000000000000000000000000000000000000001', data: CALLDATA },
    ]) as { data: string; dataLength: number };
    expect(redactado.data).toHaveLength(22);
    expect(redactado.data).toBe(`0x${CALLDATA.slice(2, 22)}`);
    expect(redactado.dataLength).toBe((CALLDATA.length - 2) / 2);
  });

  it('NO persiste el mnemonic aunque el llamador lo entregue en claro', async () => {
    await logEvent({
      event: 'rpc_call',
      method: 'wallet_importMnemonic',
      data: { mnemonic: MNEMONIC, frase: MNEMONIC, anidado: { seed: MNEMONIC } },
    });

    const texto = await textoPersistido();
    expect(texto).not.toContain('junk');
    expect(texto).not.toContain(MNEMONIC);
    expect(texto).toContain('[redactado]');
  });

  it('NO persiste ninguna clave privada', async () => {
    await logEvent({
      event: 'rpc_call',
      method: 'wallet_importPrivateKey',
      data: { privateKey: PRIVATE_KEY, secret: PRIVATE_KEY },
    });

    const texto = await textoPersistido();
    expect(texto).not.toContain(PRIVATE_KEY);
    expect(texto).not.toContain('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  });

  it('NO persiste una firma completa: se trunca a `0x1234…abcd`', async () => {
    await logEvent({
      event: 'sign_personal',
      method: 'personal_sign',
      data: { signature: SIGNATURE },
    });

    const logs = await leerLogs();
    const texto = JSON.stringify(logs);
    expect(texto).not.toContain(SIGNATURE);
    expect(texto).toContain('…');
    const data = logs[0]?.data as { signature?: string };
    expect(data.signature?.length ?? 0).toBeLessThan(SIGNATURE.length);
  });

  it('un payload por encima de 4096 bytes se guarda como hash + longitud (ADT-21 / D-L)', () => {
    const largo = `0x${'ab'.repeat(5_000)}`;
    const saneado = sanitizeLogData(largo) as { payloadHash?: string; payloadBytes?: number; truncated?: boolean };
    expect(saneado.truncated).toBe(true);
    expect(saneado.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(saneado.payloadBytes).toBe(largo.length);
    expect(JSON.stringify(saneado)).not.toContain('abababababab');
  });

  it('las entradas de los 24 eventos con datos hostiles no filtran ningún secreto', async () => {
    const hostil = {
      privateKey: PRIVATE_KEY,
      mnemonic: MNEMONIC,
      signature: SIGNATURE,
      data: CALLDATA,
      deep: { nested: { seedPhrase: MNEMONIC, password: 'hunter2' } },
    };
    const { LOG_EVENT_NAMES } = await import('./events');
    for (const event of LOG_EVENT_NAMES) {
      await logEvent({ event, method: 'eth_sendTransaction', data: hostil, origin: 'http://localhost:5174' });
    }

    const texto = await textoPersistido();
    expect(texto).not.toContain(MNEMONIC);
    expect(texto).not.toContain(PRIVATE_KEY);
    expect(texto).not.toContain(SIGNATURE);
    expect(texto).not.toContain(CALLDATA);
    expect(texto).not.toContain('hunter2');
    expect(texto).not.toContain('junk');
    expect(await leerLogs()).toHaveLength(24);
  });

  it('el `ts` es el instante del llamador y el origen se normaliza a `extension` si falta', async () => {
    await logEvent({ event: 'sw_started' }, { now: STUB_EPOCH_MS });
    const logs = await leerLogs();
    expect(logs[0]?.ts).toBe(STUB_EPOCH_MS);
    expect(logs[0]?.origin).toBe('extension');
    expect(logs[0]?.method).toBe('');
  });
});
