/**
 * M31 — `src/background/logging/events.spec.ts`
 * Catálogo CERRADO de la observabilidad (tarea 5.5, RNF-16).
 *
 * Fuente normativa: `documento_tecnico.md` §3.6 regla 2, `diccionario_datos.md` §2.11 y
 * `plan_desarrollo.md` §3.5.5 tarea 5.5. Lo que este spec fija, y que ninguna implementación
 * posterior puede relajar sin editar el corpus:
 *
 *   1. **24** eventos, con los 24 nombres EXACTOS del enum;
 *   2. **5** categorías (`call|event|tx|sign|system`) y **4** niveles (`info|success|warn|error`);
 *   3. ninguna categoría es un evento (el defecto que corrige ACU-04);
 *   4. toda pareja `(category, level)` que M30 pueda escribir está declarada en el catálogo.
 */

import { describe, expect, it } from 'vitest';
import type { LogCategory, LogEventName, LogLevel } from '../../shared/types';
import {
  LOG_CATEGORIES,
  LOG_CATEGORY_COUNT,
  LOG_EVENT_COUNT,
  LOG_EVENT_NAMES,
  LOG_EVENT_SPECS,
  LOG_LEVELS,
  LOG_LEVEL_COUNT,
  canonicalCategoryFor,
  categoriesFor,
  defaultLogLevelFor,
  isLogCategory,
  isLogEventName,
  isLogLevel,
  levelsFor,
  logEventDescription,
  logEventForProviderEvent,
  placementForEntry,
} from './events';

/** Los 24 nombres, transcritos del enum de `diccionario_datos.md` §2.11 (orden del corpus). */
const LOS_24_EVENTOS: readonly LogEventName[] = [
  'rpc_call',
  'rpc_error',
  'event_emit',
  'tx_sent',
  'tx_confirmed',
  'tx_failed',
  'tx_reverted',
  'sign_personal',
  'sign_typed_data',
  'approval_created',
  'approval_resolved',
  'approval_expired',
  'chain_changed',
  'accounts_changed',
  'wallet_created',
  'wallet_imported',
  'account_imported',
  'account_removed',
  'reset_wallet',
  'network_added',
  'permission_revoked',
  'sw_started',
  'sw_reconcile',
  'storage_quota_exceeded',
];

describe('M31 · catálogo cerrado de 24 eventos', () => {
  it('declara EXACTAMENTE los 24 nombres del enum, sin sobrantes ni ausencias', () => {
    expect(LOG_EVENT_COUNT).toBe(24);
    expect([...LOG_EVENT_NAMES].sort()).toEqual([...LOS_24_EVENTOS].sort());
    expect(LOG_EVENT_NAMES).toHaveLength(24);
  });

  it('incluye `storage_quota_exceeded` (evento 24, ADT-14 / D-M)', () => {
    expect(LOG_EVENT_NAMES).toContain('storage_quota_exceeded');
    expect(LOG_EVENT_SPECS.storage_quota_exceeded.category).toBe('system');
    expect(LOG_EVENT_SPECS.storage_quota_exceeded.level).toBe('error');
  });

  it('solo reconoce como evento los 24 nombres del catálogo', () => {
    for (const nombre of LOS_24_EVENTOS) {
      expect(isLogEventName(nombre), nombre).toBe(true);
    }
    expect(isLogEventName('evento_inventado')).toBe(false);
    expect(isLogEventName('')).toBe(false);
    expect(isLogEventName(7)).toBe(false);
  });

  it('una CATEGORÍA nunca es un evento (ACU-04): `event` y `category` son independientes', () => {
    for (const categoria of LOG_CATEGORIES) {
      expect(isLogEventName(categoria), `la categoría «${categoria}» no es un evento`).toBe(false);
      expect(isLogCategory(categoria)).toBe(true);
    }
    expect(isLogCategory('rpc_call')).toBe(false);
    expect(isLogCategory('system')).toBe(true);
  });

  it('declara 5 categorías y 4 niveles, con las uniones cerradas de `shared/types.ts`', () => {
    expect(LOG_CATEGORY_COUNT).toBe(5);
    expect(LOG_LEVEL_COUNT).toBe(4);
    const categorias: readonly LogCategory[] = LOG_CATEGORIES;
    const niveles: readonly LogLevel[] = LOG_LEVELS;
    expect(categorias).toEqual(['call', 'event', 'tx', 'sign', 'system']);
    expect(niveles).toEqual(['info', 'success', 'warn', 'error']);
    expect(isLogLevel('error')).toBe(true);
    expect(isLogLevel('fatal')).toBe(false);
  });

  it('cada evento tiene categoría primaria del enum, nivel del enum y descripción en español', () => {
    for (const nombre of LOG_EVENT_NAMES) {
      expect(LOG_CATEGORIES, nombre).toContain(canonicalCategoryFor(nombre));
      expect(LOG_LEVELS, nombre).toContain(defaultLogLevelFor(nombre));
      expect(logEventDescription(nombre).length, nombre).toBeGreaterThan(0);
      expect(categoriesFor(nombre)[0], nombre).toBe(canonicalCategoryFor(nombre));
      expect(levelsFor(nombre)[0], nombre).toBe(defaultLogLevelFor(nombre));
    }
  });

  it('fija los mapeos canónicos del corpus: `chain_changed`→event, `tx_sent`→tx, `sw_started`→system', () => {
    expect(canonicalCategoryFor('chain_changed')).toBe('event');
    expect(canonicalCategoryFor('tx_sent')).toBe('tx');
    expect(canonicalCategoryFor('sw_started')).toBe('system');
    expect(canonicalCategoryFor('sign_personal')).toBe('sign');
    expect(canonicalCategoryFor('rpc_call')).toBe('call');
    expect(canonicalCategoryFor('account_imported')).toBe('sign');
  });

  it('`account_imported` está reservado a la importación por clave privada (ACU-04)', () => {
    expect(logEventDescription('account_imported')).toContain('clave privada');
    expect(logEventDescription('account_imported')).toContain('derivación HD NO es una importación');
  });

  it('ninguna pareja (category, level) fuera del catálogo: M30 recibe SIEMPRE una declarada', () => {
    for (const nombre of LOG_EVENT_NAMES) {
      for (const level of LOG_LEVELS) {
        const placement = placementForEntry(nombre, level);
        expect(LOG_CATEGORIES, `${nombre}/${level}`).toContain(placement.category);
        expect(LOG_LEVELS, `${nombre}/${level}`).toContain(placement.level);
      }
    }
  });

  it('un evento fuera del catálogo se clasifica como código inválido (system/error), no como negocio', () => {
    const placement = placementForEntry('evento_inventado', 'info');
    expect(placement).toMatchObject({ category: 'system', level: 'error' });
  });

  it('`approval_resolved` y `sw_reconcile` conservan su variante `warn` (traza real de H4)', () => {
    expect(placementForEntry('approval_resolved', 'warn')).toMatchObject({
      category: 'event',
      level: 'warn',
    });
    expect(placementForEntry('sw_reconcile', 'warn')).toMatchObject({
      category: 'system',
      level: 'warn',
    });
    expect(placementForEntry('approval_resolved', null)).toMatchObject({
      category: 'event',
      level: 'info',
    });
  });

  it('`rpc_error` admite la variante de plataforma (system) y la de cuota (system/error)', () => {
    expect(placementForEntry('rpc_error', 'warn', 'system')).toMatchObject({
      category: 'system',
      level: 'warn',
    });
    expect(placementForEntry('rpc_error', 'error', 'quota')).toMatchObject({
      category: 'system',
      level: 'error',
    });
    expect(placementForEntry('rpc_error', null)).toMatchObject({ category: 'call', level: 'warn' });
  });

  it('instrumenta los eventos del provider con su evento propio (o `event_emit`)', () => {
    expect(logEventForProviderEvent('chainChanged')).toBe('chain_changed');
    expect(logEventForProviderEvent('accountsChanged')).toBe('accounts_changed');
    expect(logEventForProviderEvent('connect')).toBe('event_emit');
    expect(logEventForProviderEvent('desconocido')).toBe('event_emit');
  });
});
