// @vitest-environment node
/**
 * `src/background/crypto/integrity.spec.ts` — M13 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre RNF-22: un mnemonic con **checksum BIP-39 roto** o una dirección persistida con
 * **EIP-55 inválido** dejan la cartera en estado «wallet dañada», con **cero** derivaciones
 * silenciosas (el informe declara siempre `derivations: 0` y `canDerive: false`).
 *
 * Entorno `node`: ver la cabecera de `mnemonic.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { chromeStub } from '../../../test/setup/chrome-stub';
import { STORAGE_KEYS } from '../state/schema';
import { accountRefForIndex, type WalletState } from '../accounts';
import { DAMAGED_WALLET_LABEL, checkIntegrity, damagedAddresses, inspectWalletIntegrity, isWalletUsable } from './integrity';

/** Frase de Anvil (semilla de desarrollo del proyecto). */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Direcciones EIP-55 reales de las cuentas 0 y 1 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ANVIL_ADDRESS1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ANVIL_ADDRESS2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

/** Instante determinista de la comprobación. */
const NOW = 1_700_000_000_000;

/** Clave privada real de la cuenta 0 de Anvil. */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Clave privada real de la cuenta 1 de Anvil (no corresponde a la dirección 0). */
const ANVIL_KEY1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

/** Instantánea sana: frase, 5 direcciones derivadas y la activa. */
const healthySnapshot = (): Record<string, unknown> => ({
  [STORAGE_KEYS.mnemonic]: ANVIL_MNEMONIC,
  [STORAGE_KEYS.accounts]: [
    ANVIL_ADDRESS0,
    ANVIL_ADDRESS1,
    ANVIL_ADDRESS2,
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  ],
  [STORAGE_KEYS.importedAccounts]: [],
  [STORAGE_KEYS.currentAccount]: accountRefForIndex(0),
});

/** Escribe la instantánea en el almacén del stub antes de llamar a `checkIntegrity`. */
const seed = async (snapshot: Record<string, unknown>): Promise<void> => {
  await chromeStub.storage.local.set(snapshot);
};

/** Cartera sana como `WalletState` (contrato de M28). */
const healthyState = (): WalletState => ({
  mnemonic: ANVIL_MNEMONIC,
  accounts: [ANVIL_ADDRESS0, ANVIL_ADDRESS1],
  importedAccounts: [],
  currentAccount: accountRefForIndex(0),
  settings: {
    derivedAccountCount: 2,
    accountLabels: {},
    balancePollMs: 5_000,
    balancePollMaxAccounts: 10,
    logLimit: 500,
    logMaxPerOrigin: 200,
    sessionTtlMs: 86_400_000,
    pendingRequestsMax: 8,
    pendingRequestsMaxPerOrigin: 1,
    pendingRequestsPerMinute: 6,
    language: 'es',
    encryptionEnabled: false,
    requirePasswordOnOpen: false,
    schemaVersion: '1.4',
    hiddenAccounts: [],
  },
});

describe('M13 · cartera sana', () => {
  it('declara `ok` con la frase válida y las direcciones derivadas', () => {
    const report = inspectWalletIntegrity(healthySnapshot(), NOW);
    expect(report.status).toBe('ok');
    expect(report.label).toBeNull();
    expect(report.error).toBeNull();
    expect(report.issues).toEqual([]);
    expect(report.mnemonicPresent).toBe(true);
    expect(report.mnemonicValid).toBe(true);
    expect(report.derivedCount).toBe(5);
    expect(report.importedCount).toBe(0);
    expect(report.addressesChecked).toBe(5);
    expect(report.checkedAt).toBe(NOW);
    expect(isWalletUsable(report)).toBe(true);
  });

  it('declara `absent` cuando no hay cartera y no marca daño', () => {
    const report = inspectWalletIntegrity({}, NOW);
    expect(report.status).toBe('absent');
    expect(report.mnemonicPresent).toBe(false);
    expect(report.derivedCount).toBe(0);
    expect(report.addressesChecked).toBe(0);
    expect(report.issues).toEqual([]);
    expect(isWalletUsable(report)).toBe(true);
  });

  it('`checkIntegrity` lee el almacén real y deja el mismo informe', async () => {
    await seed(healthySnapshot());
    const report = await checkIntegrity(chromeStub.storage.local, NOW);
    expect(report.status).toBe('ok');
    expect(report.derivedCount).toBe(5);
    expect(report.canDerive).toBe(true);
    expect(report.derivations).toBe(0);
  });
});

describe('M13 · mnemonic corrupto (RNF-22)', () => {
  it('checksum BIP-39 roto ⇒ «wallet dañada» y sin poder derivar', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.mnemonic] =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.status).toBe('damaged');
    expect(report.label).toBe(DAMAGED_WALLET_LABEL);
    expect(report.label).toBe('Wallet dañada');
    expect(report.mnemonicValid).toBe(false);
    expect(report.canDerive).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(['mnemonic-checksum']);
    expect(report.issues[0]?.source).toBe('mnemonic');
    expect(report.error?.code).toBe(-32603);
    expect(report.error?.data).toMatchObject({ reason: 'wallet-damaged' });
  });

  it('palabra fuera de la lista BIP-39 ⇒ daño por forma y `canDerive: false`', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.mnemonic] =
      'zzzz abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.status).toBe('damaged');
    expect(report.issues[0]?.code).toBe('mnemonic-shape');
    expect(report.canDerive).toBe(false);
  });

  it('no deriva NADA: el informe declara `derivations: 0` en los tres estados', () => {
    const broken = healthySnapshot();
    broken[STORAGE_KEYS.mnemonic] = ANVIL_MNEMONIC.replace('junk', 'junkk');
    for (const snapshot of [healthySnapshot(), {}, broken]) {
      expect(inspectWalletIntegrity(snapshot, NOW).derivations).toBe(0);
    }
  });
});

describe('M13 · direcciones persistidas corruptas (RNF-22)', () => {
  it('una derivada con dirección malformada se detecta por forma', () => {
    const snapshot = healthySnapshot();
    (snapshot[STORAGE_KEYS.accounts] as string[])[2] = '0x1234';
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.status).toBe('damaged');
    const issue = report.issues.find((entry) => entry.code === 'address-shape');
    expect(issue?.source).toBe('derived');
    expect(issue?.message).toContain('índice 2');
    // El aviso lleva la dirección tal cual se guardó, para poder señalarla en la UI.
    expect(damagedAddresses(report)).toEqual(['0x1234']);
  });

  it('una derivada con EIP-55 inválido (todo minúsculas) se detecta por checksum', () => {
    const snapshot = healthySnapshot();
    (snapshot[STORAGE_KEYS.accounts] as string[])[1] = ANVIL_ADDRESS1.toLowerCase();
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.status).toBe('damaged');
    const issue = report.issues.find((entry) => entry.code === 'address-checksum');
    expect(issue?.address).toBe(ANVIL_ADDRESS1.toLowerCase());
    expect(issue?.message).toContain('índice 1');
    expect(damagedAddresses(report)).toEqual([ANVIL_ADDRESS1.toLowerCase()]);
  });

  it('una derivada con EIP-55 mal calculado (una letra cambiada de caso) se detecta', () => {
    const snapshot = healthySnapshot();
    // `ANVIL_ADDRESS0` termina en `2266`; se altera el caso de una letra del cuerpo.
    const corrupted = `${ANVIL_ADDRESS0.slice(0, 3)}F${ANVIL_ADDRESS0.slice(4)}`;
    (snapshot[STORAGE_KEYS.accounts] as string[])[0] = corrupted;
    expect(corrupted).not.toBe(ANVIL_ADDRESS0);
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.issues.some((entry) => entry.code === 'address-checksum')).toBe(true);
  });

  it('una importada con dirección malformada se detecta sin abortar el resto', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.importedAccounts] = [{ address: 'no-es-direccion', privateKey: ANVIL_KEY0 }];
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.status).toBe('damaged');
    expect(report.importedCount).toBe(1);
    expect(report.issues[0]).toMatchObject({ code: 'address-shape', source: 'imported' });
  });

  it('una importada cuya clave privada no corresponde a su dirección se detecta', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.importedAccounts] = [
      { address: ANVIL_ADDRESS1, privateKey: ANVIL_KEY1 },
    ];
    const okReport = inspectWalletIntegrity(snapshot, NOW);
    expect(okReport.status).toBe('ok');
    expect(okReport.importedCount).toBe(1);

    const mismatched = healthySnapshot();
    // La clave de la cuenta 1 con la dirección de la cuenta 0: pareja incoherente.
    mismatched[STORAGE_KEYS.importedAccounts] = [
      { address: ANVIL_ADDRESS0, privateKey: ANVIL_KEY1 },
    ];
    const report = inspectWalletIntegrity(mismatched, NOW);
    expect(report.status).toBe('damaged');
    expect(report.issues[0]?.code).toBe('imported-key-mismatch');
    expect(report.issues[0]?.address).toBe(ANVIL_ADDRESS0);
  });
});

describe('M13 · cuenta activa inexistente', () => {
  it('detecta que la cuenta activa guardada ya no está en la cartera', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.currentAccount] = accountRefForIndex(99);
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.status).toBe('damaged');
    expect(report.issues.map((issue) => issue.code)).toEqual(['current-account-missing']);
    expect(report.issues[0]?.source).toBe('current');
  });

  it('una activa `idx` que apunta fuera del array daña la cartera', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.currentAccount] = 'idx:5';
    expect(inspectWalletIntegrity(snapshot, NOW).status).toBe('damaged');
  });

  it('una referencia de activa ilegible daña la cartera', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.currentAccount] = 'cuenta-tres';
    expect(inspectWalletIntegrity(snapshot, NOW).issues[0]?.code).toBe('current-account-missing');
  });
});

describe('M13 · contrato del informe', () => {
  it('es una función pura: no muta la instantánea ni escribe en el almacén', async () => {
    const snapshot = healthySnapshot();
    const before = JSON.stringify(snapshot);
    inspectWalletIntegrity(snapshot, NOW);
    expect(JSON.stringify(snapshot)).toBe(before);

    await seed(healthySnapshot());
    const writesBefore = chromeStub.storage.local.writes().length;
    await checkIntegrity(chromeStub.storage.local, NOW);
    // Solo la siembra de la prueba escribe; la comprobación, no.
    expect(chromeStub.storage.local.writes().length).toBe(writesBefore);
  });

  it('acumula varios problemas y los informa todos', () => {
    const snapshot = healthySnapshot();
    snapshot[STORAGE_KEYS.mnemonic] =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    (snapshot[STORAGE_KEYS.accounts] as string[])[0] = '0xmal';
    snapshot[STORAGE_KEYS.currentAccount] = accountRefForIndex(42);
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.issues).toHaveLength(3);
    expect(report.issues.map((issue) => issue.code).sort()).toEqual([
      'address-shape',
      'current-account-missing',
      'mnemonic-checksum',
    ]);
  });

  it('tolera instantáneas con formas inesperadas sin lanzar', () => {
    const weird = {
      [STORAGE_KEYS.mnemonic]: 42,
      [STORAGE_KEYS.accounts]: 'no-es-lista',
      [STORAGE_KEYS.importedAccounts]: null,
      [STORAGE_KEYS.currentAccount]: { no: 'es-cadena' },
    };
    const report = inspectWalletIntegrity(weird, NOW);
    expect(report.status).toBe('absent');
    expect(report.derivedCount).toBe(0);
    expect(report.addressesChecked).toBe(0);
  });

  it('una cartera solo de importadas es válida (no exige mnemonic)', () => {
    const snapshot = {
      [STORAGE_KEYS.importedAccounts]: [{ address: ANVIL_ADDRESS1, privateKey: ANVIL_KEY1 }],
      [STORAGE_KEYS.currentAccount]: `imp:${ANVIL_ADDRESS1}`,
    };
    const report = inspectWalletIntegrity(snapshot, NOW);
    expect(report.status).toBe('ok');
    expect(report.mnemonicPresent).toBe(false);
    expect(report.canDerive).toBe(false);
    expect(report.importedCount).toBe(1);
    expect(healthyState().accounts).toHaveLength(2);
  });
});
