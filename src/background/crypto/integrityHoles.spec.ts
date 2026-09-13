/**
 * M13 — `src/background/crypto/integrityHoles.spec.ts`
 * Huecos de detección de la comprobación de integridad al arrancar (RNF-22).
 *
 * Requisitos: RNF-22 (`CA-RF-11`, «cartera dañada» sin correcciones silenciosas) y RNF-08.
 *
 * HUECO QUE CUBRE (fase 4): `integrity.spec.ts` probaba una dirección malformada DENTRO de una
 * lista de cadenas y una lista que no es array, pero no un HUECO no-cadena ni una cuenta importada
 * sin clave utilizable. En los dos casos el informe decía `status: 'ok'` mientras el estado real
 * de la cartera ya se había degradado en silencio: la lista se compactaba (desplazando el índice
 * BIP-44) o la cuenta importada desaparecía de M28.
 */

import { describe, expect, it } from 'vitest';

import { STUB_EPOCH_MS } from '../../../test/setup/chrome-stub';
import { inspectWalletIntegrity } from './integrity';
import { STORAGE_KEYS } from '../state/schema';

/** Frase BIP-39 válida de Anvil (necesaria para que `canDerive` pueda ser `true`). */
const MNEMONIC = 'test test test test test test test test test test test junk';

/** Dirección EIP-55 de la cuenta #0 de Anvil. */
const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Dirección EIP-55 de la cuenta #1 de Anvil. */
const CUENTA_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** Dirección EIP-55 de la cuenta #3 de Anvil (índice BIP-44 3). */
const CUENTA_3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

/** Cartera sana de referencia: frase válida y dos derivadas EIP-55. */
const carteraSana = (): Record<string, unknown> => ({
  [STORAGE_KEYS.mnemonic]: MNEMONIC,
  [STORAGE_KEYS.accounts]: [CUENTA_0, CUENTA_1],
  [STORAGE_KEYS.importedAccounts]: [],
});

describe('M13 · un HUECO no-cadena en `truekeate_accounts` es cartera dañada', () => {
  it('el informe deja de decir «ok» y nombra el índice exacto del hueco', () => {
    // Antes: `readAddressList` FILTRABA el `null`, así que `derivedCount` era 3, `issues` vacío y
    // `status: 'ok'` con una lista que M28 ya no podía usar sin desplazar índices.
    const report = inspectWalletIntegrity(
      { ...carteraSana(), [STORAGE_KEYS.accounts]: [CUENTA_0, CUENTA_1, null, CUENTA_3] },
      STUB_EPOCH_MS,
    );

    expect(report.status).toBe('damaged');
    expect(report.label).toBe('Wallet dañada');
    expect(report.canDerive).toBe(false);
    expect(report.error?.code).toBe(-32603);
    // La lista conserva las CUATRO posiciones: el índice del array es el índice BIP-44.
    expect(report.derivedCount).toBe(4);
    expect(report.addressesChecked).toBe(4);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ code: 'address-shape', source: 'derived' });
    // El hueco está en la posición 2 (no en la 3): los avisos siguientes mantienen su índice.
    expect(report.issues[0]?.message).toContain('índice 2');
  });

  it('el índice del aviso NO se desplaza cuando el hueco va en medio de dos válidas', () => {
    const report = inspectWalletIntegrity(
      { ...carteraSana(), [STORAGE_KEYS.accounts]: [CUENTA_0, '', CUENTA_3] },
      STUB_EPOCH_MS,
    );
    expect(report.status).toBe('damaged');
    expect(report.issues[0]?.message).toContain('índice 1');
    // Y la cuenta válida de la posición 2 sigue siendo la tercera: nada se ha compactado.
    expect(report.derivedCount).toBe(3);
  });

  it('una lista ÍNTEGRA sigue siendo `ok` y derivable (control positivo)', () => {
    const report = inspectWalletIntegrity(carteraSana(), STUB_EPOCH_MS);
    expect(report.status).toBe('ok');
    expect(report.canDerive).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.derivedCount).toBe(2);
  });
});

describe('M13 · una cuenta importada sin clave utilizable es cartera dañada', () => {
  it('una `privateKey` que no es cadena deja de pasar como `ok`', () => {
    // Antes: `typeof entry.privateKey === 'string' && …` se SALTABA la comprobación, así que el
    // informe decía `ok` con `importedCount: 1` mientras M28 descartaba la entrada y la cuenta
    // desaparecía de la cartera (no se listaba, no firmaba ni se podía borrar).
    const report = inspectWalletIntegrity(
      {
        ...carteraSana(),
        [STORAGE_KEYS.importedAccounts]: [{ address: CUENTA_1, privateKey: 42 }],
      },
      STUB_EPOCH_MS,
    );

    expect(report.status).toBe('damaged');
    expect(report.importedCount).toBe(1);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      code: 'imported-key-mismatch',
      source: 'imported',
      address: CUENTA_1,
    });
    expect(report.issues[0]?.message).toContain(CUENTA_1);
  });

  it('una clave que no corresponde a la dirección sigue detectándose (control positivo)', () => {
    const claveDeOtra =
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const report = inspectWalletIntegrity(
      {
        ...carteraSana(),
        [STORAGE_KEYS.importedAccounts]: [{ address: CUENTA_0, privateKey: claveDeOtra }],
      },
      STUB_EPOCH_MS,
    );
    expect(report.status).toBe('damaged');
    expect(report.issues.map((issue) => issue.code)).toContain('imported-key-mismatch');
  });

  it('una cuenta importada coherente no genera ningún aviso', () => {
    const claveDeCuenta1 =
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const report = inspectWalletIntegrity(
      {
        ...carteraSana(),
        [STORAGE_KEYS.importedAccounts]: [{ address: CUENTA_1, privateKey: claveDeCuenta1 }],
      },
      STUB_EPOCH_MS,
    );
    expect(report.issues).toEqual([]);
    expect(report.status).toBe('ok');
    expect(report.importedCount).toBe(1);
  });
});
