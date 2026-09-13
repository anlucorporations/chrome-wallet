/**
 * M28/M29 — `src/background/accountsRef.spec.ts`
 * Forma ESTRICTA de las referencias de cuenta y de las etiquetas de importación.
 *
 * Requisitos: RF-06 (`CA-RF-33`, formularios de cuenta y etiqueta) y RF-33 (RNF-09).
 *
 * HUECO QUE CUBRE (fase 4): `accounts.spec.ts` cubría la referencia canónica (`idx:0`, `imp:0x…`)
 * y el rechazo de una etiqueta larga en `renameAccount`, pero no que `parseAccountRef` valide la
 * FORMA del cuerpo de `idx:` (`Number('') === 0`, `Number('0x10') === 16`), ni que la IMPORTACIÓN
 * aplique la MISMA cota de 1..32 caracteres que el renombrado.
 */

import { describe, expect, it } from 'vitest';

import { chromeStub } from '../../test/setup/chrome-stub';
import { MAX_LABEL_LENGTH } from '../shared/constants';
import { MAX_DERIVATION_INDEX } from './crypto/hd';
import {
  accountRefForIndex,
  importAccountByPrivateKey,
  parseAccountRef,
  readWalletStateFromSnapshot,
} from './accounts';
import { STORAGE_KEYS } from './state/schema';

/** Clave privada de la cuenta #1 de Anvil (SOLO PRUEBAS). */
const CLAVE_1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

/** Dirección EIP-55 de la cuenta #0 de Anvil (índice BIP-44 0). */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Dirección EIP-55 de la cuenta #1 de Anvil (índice BIP-44 1). */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Dirección EIP-55 de la cuenta #3 de Anvil (índice BIP-44 3). */
const CUENTA_3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

/** Almacén del stub, con su registro de escrituras para afirmar «no se persistió nada». */
const storage = chromeStub.storage.local;

describe('M28 · `parseAccountRef` exige la FORMA de la referencia, no solo el prefijo', () => {
  it('acepta las dos formas canónicas y la heredada sin prefijo', () => {
    expect(parseAccountRef('idx:0')).toEqual({ kind: 'derived', index: 0 });
    expect(parseAccountRef('idx:7')).toEqual({ kind: 'derived', index: 7 });
    expect(parseAccountRef('0')).toEqual({ kind: 'derived', index: 0 });
    expect(parseAccountRef('12')).toEqual({ kind: 'derived', index: 12 });
    expect(parseAccountRef(` ${accountRefForIndex(3)} `)).toEqual({ kind: 'derived', index: 3 });
    expect(parseAccountRef(`imp:${CUENTA_1}`)).toEqual({ kind: 'imported', address: CUENTA_1 });
  });

  it('rechaza un cuerpo vacío o no numérico en `idx:` (antes resolvía a la cuenta 0)', () => {
    // `Number('')` es 0, `Number('0x10')` es 16 y `Number('1e1')` es 10: con la conversión
    // directa, «ninguna cuenta» actuaba sobre la PRIMERA cuenta de la cartera.
    for (const referencia of ['idx:', 'idx: ', 'idx:0x10', 'idx:1e1', 'idx:1.5', 'idx: 3x', 'idx:-1', 'idx:3.0']) {
      expect(parseAccountRef(referencia), `«${referencia}»`).toBeNull();
    }
  });

  it('rechaza el índice fuera de rango en las DOS ramas (antes la heredada no lo comprobaba)', () => {
    const fuera = MAX_DERIVATION_INDEX + 1;
    expect(parseAccountRef(`idx:${MAX_DERIVATION_INDEX}`)).toEqual({
      kind: 'derived',
      index: MAX_DERIVATION_INDEX,
    });
    expect(parseAccountRef(String(MAX_DERIVATION_INDEX))).toEqual({
      kind: 'derived',
      index: MAX_DERIVATION_INDEX,
    });
    expect(parseAccountRef(`idx:${fuera}`)).toBeNull();
    // La rama heredada devolvía el índice SIN validarlo.
    expect(parseAccountRef(String(fuera))).toBeNull();
    expect(parseAccountRef('9999999999')).toBeNull();
  });

  it('rechaza direcciones malformadas en `imp:` y cualquier otro tipo', () => {
    expect(parseAccountRef(`imp:${CUENTA_1.slice(0, -1)}`)).toBeNull();
    expect(parseAccountRef('imp:')).toBeNull();
    expect(parseAccountRef('cuenta-1')).toBeNull();
    expect(parseAccountRef(null)).toBeNull();
    expect(parseAccountRef(3)).toBeNull();
  });
});

describe('M28/M29 · la importación aplica la MISMA cota de etiqueta que el renombrado', () => {
  it('una etiqueta de 33 caracteres responde -32602 invalidLabel y NO persiste nada', async () => {
    const escrituras = storage.writes().length;
    const resultado = await importAccountByPrivateKey(CLAVE_1, 'x'.repeat(MAX_LABEL_LENGTH + 1), storage);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32602);
    expect(resultado.error.message).toBe('La etiqueta no es válida: debe tener entre 1 y 32 caracteres.');
    expect(resultado.error.data).toEqual({ reason: 'invalid-label', problem: 'tooLong' });
    // Ni la etiqueta ni la cuenta se han guardado.
    expect(storage.writes().length).toBe(escrituras);
    expect(chromeStub.rawStorage()[STORAGE_KEYS.importedAccounts]).toBeUndefined();
  });

  it('una etiqueta con caracteres de control responde -32602 invalidLabel', async () => {
    const resultado = await importAccountByPrivateKey(CLAVE_1, 'Ahorros\u0000', storage);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe(-32602);
    expect(resultado.error.data).toEqual({ reason: 'invalid-label', problem: 'control' });
    expect(chromeStub.rawStorage()[STORAGE_KEYS.importedAccounts]).toBeUndefined();
  });

  it('justo en el límite (32) la importación se acepta y la etiqueta se normaliza', async () => {
    const limite = 'y'.repeat(MAX_LABEL_LENGTH);
    const resultado = await importAccountByPrivateKey(CLAVE_1, `  ${limite}  `, storage);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.account.label).toBe(limite);
    expect(resultado.account.label).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('sin etiqueta (o con espacios) se usa la de por defecto: no es un fallo de validación', async () => {
    const sinEtiqueta = await importAccountByPrivateKey(CLAVE_1, undefined, storage);
    expect(sinEtiqueta.ok).toBe(true);
    if (!sinEtiqueta.ok) return;
    expect(sinEtiqueta.account.label).toBe('Importada 1');

    const conEspacios = await importAccountByPrivateKey(
      '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
      '   ',
      storage,
    );
    expect(conEspacios.ok).toBe(true);
    if (!conEspacios.ok) return;
    expect(conEspacios.account.label).toBe('Importada 2');
  });
});

describe('M28 · una lista de derivadas con un hueco NO se compacta (el índice ES el BIP-44)', () => {
  it('un elemento que no es dirección invalida la lista entera en vez de desplazar índices', () => {
    // DEFECTO MEDIDO Y CORREGIDO (fase 4): al compactar, `CUENTA_3` pasaba a ocupar la posición 2
    // y `wallet_revealSecret('idx:2')` entregaba la clave privada de OTRA cuenta.
    const conHueco = readWalletStateFromSnapshot({
      [STORAGE_KEYS.accounts]: [CUENTA_0, CUENTA_1, null, CUENTA_3],
    });
    expect(conHueco.accounts).toEqual([]);

    const conBasura = readWalletStateFromSnapshot({
      [STORAGE_KEYS.accounts]: [CUENTA_0, 'no-es-direccion', CUENTA_1],
    });
    expect(conBasura.accounts).toEqual([]);
  });

  it('una lista ÍNTEGRA conserva posiciones y orden (control positivo)', () => {
    const integra = readWalletStateFromSnapshot({
      [STORAGE_KEYS.accounts]: [CUENTA_0, CUENTA_1, CUENTA_3],
    });
    expect(integra.accounts).toEqual([CUENTA_0, CUENTA_1, CUENTA_3]);
    expect(integra.accounts[2]).toBe(CUENTA_3);
  });
});
