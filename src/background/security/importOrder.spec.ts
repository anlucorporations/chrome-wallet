// @vitest-environment node
/**
 * `src/background/security/importOrder.spec.ts` — regresión de **D-H3-C**.
 *
 * El defecto: `senderGuard.ts` capturaba `INTERNAL_METHODS` al evaluar su módulo, dentro del ciclo
 * `catalog → connections → sessions → senderGuard → catalog`. Si el CATÁLOGO se evaluaba primero,
 * la captura veía `undefined` y `isInternalMethodName` lanzaba
 * `TypeError: Cannot read properties of undefined (reading 'includes')`, de modo que el router
 * respondía `-32603` a cualquier petición.
 *
 * Este fichero reproduce EXACTAMENTE el orden temido: la PRIMERA importación es `./rpc/catalog`
 * (no `senderGuard`), de modo que al evaluar la guarda el catálogo ya está en curso. Con la lista
 * en el módulo hoja `./rpc/internalMethods` no hay ciclo que resolver y la guarda funciona sea
 * cual sea el orden; si alguien vuelve a importar la lista desde el catálogo, este caso falla.
 *
 * Entorno `node`: ver la cabecera de `src/background/crypto/mnemonic.spec.ts`.
 */

import { describe, expect, it } from 'vitest';

// ORDEN DELIBERADO: el catálogo primero (es el orden que rompía la guarda antes de D-H3-C).
import { INTERNAL_METHODS, isInternalMethod } from '../rpc/catalog';
import { guardSender, isInternalMethodName } from './senderGuard';

const SENDER_PAGINA = {
  id: 'tk-stub-extension-id-for-tests',
  origin: 'http://localhost:5174',
  tab: { id: 5 },
  frameId: 0,
};

describe('D-H3-C · la guarda de emisor no depende del orden de evaluación', () => {
  it('la allowlist de internos está completa aunque el catálogo se evalúe primero', () => {
    expect(INTERNAL_METHODS).toHaveLength(16);
    for (const method of INTERNAL_METHODS) {
      expect(isInternalMethodName(method), `«${method}» debería ser interno`).toBe(true);
      expect(isInternalMethod(method)).toBe(true);
    }
    expect(isInternalMethodName('eth_accounts')).toBe(false);
    expect(isInternalMethodName('eth_sign')).toBe(false);
  });

  it('un `wallet_*` desde una página responde `4200` (NUNCA `-32603`) pese al orden de import', () => {
    const guard = guardSender(SENDER_PAGINA, {}, 'wallet_getState');

    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.error.code).toBe(4200);
    // Literal de la causa `methodNotAllowedInContext` del catálogo de §4.3 (M6).
    expect(guard.error.message).toBe('El método solicitado no está permitido en este contexto.');
  });

  it('una lectura de página desde la misma página sigue siendo aceptada', () => {
    const guard = guardSender(SENDER_PAGINA, {}, 'eth_accounts');

    expect(guard.ok).toBe(true);
    if (!guard.ok) return;
    expect(guard.context.origin).toBe('http://localhost:5174');
  });
});
