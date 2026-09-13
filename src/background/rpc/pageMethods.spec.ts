/**
 * `src/background/rpc/pageMethods.spec.ts` — catálogo de página ante un RECHAZO del nodo
 * (fleco 3 de la fase 4).
 *
 * DEFECTO MEDIDO EN E2E (`33-envio-desde-el-popup`): cuando el nodo rechazaba una estimación
 * (`-32003 Insufficient funds for gas * price + value`), el mensaje que acompañaba al bloqueo
 * `-32000` era el de `4900` —«Sin conexión con la red local (Anvil).»—, la UI pasaba a
 * «desconectado» y se gastaban 4 intentos con 7 s de backoff para un fallo determinista.
 *
 * Estas pruebas fijan la semántica corregida en la cara de PÁGINA del catálogo:
 * - el nodo que responde con un error de respuesta NO es «sin conexión»;
 * - `eth_estimateGas` lo tipa con la causa de §4.3 `-32000 estimateGasFailed` y el motivo del
 *   nodo dentro del mensaje (no inventa ningún literal nuevo);
 * - un fallo de TRANSPORTE sigue propagándose como `4900`, sin convertirse en `-32000`.
 *
 * Módulos de contrato: M4.b.
 *
 * Requisitos: RF-45 y RNF-07 (CA-RF-18).
 */

import { describe, expect, it } from 'vitest';

import { invokePageMethod, type PageCallContext, type PageHandlerDeps } from './pageMethods';

/** Contexto mínimo de página: solo se ejercita `eth_estimateGas`, que no toca sesiones. */
const contexto = (params: unknown[]): PageCallContext => ({
  context: {
    runtimeId: 'truekeate-runtime',
    origin: 'http://localhost:5173',
    isExtensionContext: false,
    route: null,
    tabId: 1,
    frameId: 0,
    respondToFrameOnly: false,
    declaredOrigin: 'http://localhost:5173',
  },
  origin: 'http://localhost:5173',
  tabId: 1,
  frameId: 0,
  now: 1_700_000_000_000,
  params,
});

/** Dependencias con el cliente RPC doblado (las demás no se usan en esta ruta). */
const deps = (send: (method: string, params?: unknown[]) => Promise<unknown>): PageHandlerDeps => ({
  rpc: { send, getBalance: async () => 0n },
  sessions: {
    touchSession: async () => ({ session: null, persisted: false }),
    currentSessionFor: () => null,
    readSessions: async () => ({}),
    revokeSession: async () => null,
  },
  events: { emitEvent: async () => 0 },
  openConnect: async () => ({ success: false }),
});

/** Error JSON-RPC de Anvil tal y como llega desde el nodo. */
const rechazoDelNodo = (code: number, message: string): Error =>
  Object.assign(new Error(message), { code, data: { message } });

describe('M4.b · `eth_estimateGas` ante un rechazo del nodo (fleco 3 de la fase 4)', () => {
  it('un rechazo `-32003` sale como -32000 `estimateGasFailed` con el motivo del nodo', async () => {
    const motivo = 'Insufficient funds for gas * price + value';
    const error = await invokePageMethod(
      'eth_estimateGas',
      [{ from: '0x1', to: '0x2', value: '0x1' }],
      contexto([{ from: '0x1', to: '0x2', value: '0x1' }]),
      deps(async () => {
        throw rechazoDelNodo(-32003, motivo);
      }),
    ).then(
      () => null,
      (causa: unknown) => causa as { code: number; message: string },
    );

    // Literal ÚNICO de §4.3 (`estimateGasFailed`, -32000) con `<motivo>` ya sustituido.
    expect(error?.code).toBe(-32000);
    expect(error?.message).toBe(
      `La estimación de gas falló: ${motivo}. El envío se ha bloqueado.`,
    );
    // Y NUNCA el literal de «sin conexión».
    expect(error?.message).not.toContain('Sin conexión con la red local');
  });

  it('un rechazo sin mensaje cae al código numérico, sin dejar el hueco vacío', async () => {
    const error = await invokePageMethod(
      'eth_estimateGas',
      [{}],
      contexto([{}]),
      deps(async () => {
        throw Object.assign(new Error(''), { code: -32003 });
      }),
    ).then(
      () => null,
      (causa: unknown) => causa as { code: number; message: string },
    );

    expect(error?.code).toBe(-32000);
    expect(error?.message).toBe(
      'La estimación de gas falló: error JSON-RPC -32003. El envío se ha bloqueado.',
    );
  });

  it('un fallo de TRANSPORTE sigue propagándose como 4900, sin tiparse como estimación', async () => {
    const transporte = Object.assign(new Error('Sin conexión con la red local (Anvil).'), {
      code: 4900,
      message: 'Sin conexión con la red local (Anvil).',
      data: { reason: 'transport' },
    });
    const error = await invokePageMethod(
      'eth_estimateGas',
      [{}],
      contexto([{}]),
      deps(async () => {
        throw transporte;
      }),
    ).then(
      () => null,
      (causa: unknown) => causa as { code: number },
    );

    expect(error?.code).toBe(4900);
  });

  it('una estimación correcta del nodo se devuelve tal cual, sin envoltorio', async () => {
    const resultado = await invokePageMethod(
      'eth_estimateGas',
      [{ from: '0x1' }],
      contexto([{ from: '0x1' }]),
      deps(async () => '0x5208'),
    );
    expect(resultado).toBe('0x5208');
  });
});
