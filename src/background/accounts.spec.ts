// @vitest-environment node
/**
 * `src/background/accounts.spec.ts` — M28 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre, sobre el almacén simulado del arnés (`test/setup/chrome-stub.ts`, reiniciado en cada
 * caso por su `beforeEach` global):
 *   · `CA-RF-01`/`CA-RF-04`: 5 cuentas al crear y la 6.ª al añadir.
 *   · `CA-RF-02`: la importación normaliza espacios y mayúsculas.
 *   · `CA-RF-03`: sin contraseña (`encryptionEnabled: false`, `requirePasswordOnOpen: false`).
 *   · `CA-RF-05`: etiqueta de importada persistida y duplicada rechazada con `-32602`.
 *   · Etiquetas (DEC-35): `accountLabels[índice]` en derivadas y `label` en importadas.
 *   · Guarda `-32000` de sesión de dApp activa al ELIMINAR una importada (R-09a / DEC-45).
 *
 * Entorno `node`: ver la cabecera de `src/background/crypto/mnemonic.spec.ts` (jsdom sustituye
 * `Uint8Array` y `ethers` deja de reconocer su propio digest de `node:crypto`).
 */

import { describe, expect, it } from 'vitest';
import { chromeStub } from '../../test/setup/chrome-stub';
import { getSettings } from './settings';
import { STORAGE_KEYS } from './state/schema';
import {
  accountRefForAddress,
  accountRefForIndex,
  activeDappOriginFor,
  addressForRef,
  buildAccountViews,
  createWallet,
  deriveNextAccount,
  findAccount,
  getAccountsSnapshot,
  getCurrentAccountRef,
  importAccountByPrivateKey,
  importWalletFromMnemonic,
  parseAccountRef,
  readWalletState,
  removeImportedAccount,
  renameAccount,
  setAccountVisible,
  setCurrentAccount,
  visibleAccounts,
  walletExists,
} from './accounts';

/** Frase de Anvil (semilla de desarrollo del proyecto). */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Direcciones EIP-55 reales de las cuentas 0 a 5 de Anvil. */
const ANVIL_ADDRESSES = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
] as const;

/** Clave privada real de la cuenta 0 de Anvil (pública: es la de desarrollo). */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Clave 2 de secp256k1 y su dirección, para la prueba de importación. */
const KEY_TWO = `0x${'2'.padStart(64, '0')}`;
const ADDRESS_TWO = '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF';

/** Clave 3 de secp256k1 y su dirección. */
const KEY_THREE = `0x${'3'.padStart(64, '0')}`;
const ADDRESS_THREE = '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69';

/** Origen de la dApp de pruebas. */
const DAPP_ORIGIN = 'http://localhost:5174';

/** Sesión vigente de una dApp sobre `account`. */
const activeSession = (account: string, expiresAt: number | null = null): Record<string, unknown> => ({
  [DAPP_ORIGIN]: {
    origin: DAPP_ORIGIN,
    account,
    connectedAt: 1,
    lastUsedAt: 2,
    expiresAt,
    connected: true,
  },
});

/** Almacén del stub, que es la fuente de verdad de la persistencia. */
const storage = chromeStub.storage.local;

/**
 * Importa la cartera de Anvil (frase fija) para poder contrastar los vectores conocidos de
 * BIP-44. `createWallet()` genera entropía NUEVA: se prueba en su propio caso.
 */
const createAnvilWallet = async (): Promise<void> => {
  const created = await importWalletFromMnemonic(ANVIL_MNEMONIC, storage);
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error.message);
  expect(created.accounts).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
};

/** Extrae las direcciones de `truekeate_accounts` directamente del almacén. */
const rawAccounts = (): string[] => {
  const value = chromeStub.rawStorage()[STORAGE_KEYS.accounts];
  return Array.isArray(value) ? (value as string[]) : [];
};

/** Extrae `truekeate_imported_accounts` del almacén. */
const rawImported = (): Array<Record<string, unknown>> => {
  const value = chromeStub.rawStorage()[STORAGE_KEYS.importedAccounts];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
};

/** Extrae `truekeate_settings` del almacén. */
const rawSettings = (): Record<string, unknown> => {
  const value = chromeStub.rawStorage()[STORAGE_KEYS.settings];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
};

describe('M28 · crear cartera: 5 cuentas y sin contraseña (CA-RF-01 / CA-RF-03 / CA-RF-04)', () => {
  it('crea la cartera con exactamente 5 cuentas, índices 0..4 y la 0 como activa', async () => {
    const created = await createWallet(storage);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.accounts).toHaveLength(5);
    expect(new Set(created.accounts).size).toBe(5);
    expect(created.accounts.every((address) => /^0x[0-9a-fA-F]{40}$/.test(address))).toBe(true);
    expect(created.derivedAccountCount).toBe(5);
    expect(created.currentAccount).toBe('idx:0');
    expect(rawAccounts()).toEqual(created.accounts);
  });

  it('la frase generada es BIP-39 de 12 palabras y queda persistida normalizada', async () => {
    const created = await createWallet(storage);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const words = created.mnemonic.split(' ');
    expect(words).toHaveLength(12);
    expect(created.mnemonic).toBe(created.mnemonic.trim().toLowerCase());
    expect(chromeStub.rawStorage()[STORAGE_KEYS.mnemonic]).toBe(created.mnemonic);
  });

  it('deja `encryptionEnabled` y `requirePasswordOnOpen` en `false` (P-03 / RE-02)', async () => {
    await createAnvilWallet();
    const settings = await getSettings(storage);
    expect(settings.encryptionEnabled).toBe(false);
    expect(settings.requirePasswordOnOpen).toBe(false);
    expect(rawSettings().encryptionEnabled).toBe(false);
  });

  it('`importWalletFromMnemonic` normaliza espacios y mayúsculas y da la MISMA cuenta 0 (CA-RF-02)', async () => {
    const irregular = `  ${ANVIL_MNEMONIC.toUpperCase().replace(/ /g, '   ')}\n `;
    const imported = await importWalletFromMnemonic(irregular, storage);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.mnemonic).toBe(ANVIL_MNEMONIC);
    expect(imported.accounts[0]).toBe(ANVIL_ADDRESSES[0]);
    expect(imported.accounts).toHaveLength(5);
    expect(chromeStub.rawStorage()[STORAGE_KEYS.mnemonic]).toBe(ANVIL_MNEMONIC);
  });

  it('un checksum roto responde `-32602 invalidMnemonic` y NO escribe nada', async () => {
    const broken = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    const imported = await importWalletFromMnemonic(broken, storage);
    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.error.code).toBe(-32602);
    expect(imported.error.message).toBe('La frase de recuperación no es válida: revisa las 12 palabras y su checksum.');
    expect(chromeStub.storage.local.writes()).toEqual([]);
    expect(walletExists(await readWalletState(storage))).toBe(false);
  });
});

describe('M28 · «Añadir cuenta» deriva la 6.ª (CA-RF-04)', () => {
  it('deriva el índice 5, lo persiste y amplía `derivedAccountCount`', async () => {
    await createAnvilWallet();
    const derived = await deriveNextAccount(storage);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.accounts).toHaveLength(6);
    expect(derived.account.index).toBe(5);
    expect(derived.account.address).toBe(ANVIL_ADDRESSES[5]);
    expect(derived.derivedAccountCount).toBe(6);
    expect(rawAccounts()[5]).toBe(ANVIL_ADDRESSES[5]);
    expect((await getSettings(storage)).derivedAccountCount).toBe(6);
  });

  it('las cinco primeras no cambian al añadir la sexta', async () => {
    await createAnvilWallet();
    await deriveNextAccount(storage);
    expect(rawAccounts().slice(0, 5)).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
  });

  it('sin frase guardada responde `-32000 walletNotCreated` y no inventa cuentas', async () => {
    const derived = await deriveNextAccount(storage);
    expect(derived.ok).toBe(false);
    if (derived.ok) return;
    expect(derived.error.code).toBe(-32000);
    expect(derived.error.message).toBe('Todavía no hay ninguna cartera: no se puede derivar ninguna cuenta.');
    expect(derived.error.data).toMatchObject({ reason: 'wallet-not-created' });
    expect(rawAccounts()).toEqual([]);
  });
});

describe('M28 · importar por clave privada (CA-RF-05)', () => {
  it('añade la cuenta marcada como importada con etiqueta por defecto `Importada 1`', async () => {
    await createAnvilWallet();
    const imported = await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.account.address).toBe(ADDRESS_TWO);
    expect(imported.account.kind).toBe('imported');
    expect(imported.account.index).toBeNull();
    expect(imported.account.label).toBe('Importada 1');
    expect(imported.accountRef).toBe(`imp:${ADDRESS_TWO}`);
    expect(rawImported()).toHaveLength(1);
    expect(rawImported()[0]?.privateKey).toBe(KEY_TWO);
  });

  it('guarda la etiqueta indicada (recortada y con espacios colapsados)', async () => {
    await createAnvilWallet();
    const imported = await importAccountByPrivateKey(KEY_TWO, '  Mi   cuenta  ', storage);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.account.label).toBe('Mi cuenta');
    expect(rawImported()[0]?.label).toBe('Mi cuenta');
  });

  it('una clave repetida responde `-32602 duplicateAccount` sin escribir', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    const writesAfterFirst = storage.writes().length;
    const again = await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe(-32602);
    expect(again.error.message).toBe('Esa cuenta ya está en la cartera.');
    expect(storage.writes().length).toBe(writesAfterFirst);
    expect(rawImported()).toHaveLength(1);
  });

  it('importar la clave de una cuenta YA DERIVADA también responde `-32602`', async () => {
    await createAnvilWallet();
    const derived = await importAccountByPrivateKey(ANVIL_KEY0, undefined, storage);
    expect(derived.ok).toBe(false);
    if (derived.ok) return;
    expect(derived.error.code).toBe(-32602);
    expect(derived.error.data).toBeUndefined();
    expect(rawImported()).toEqual([]);
  });

  it('una clave fuera del rango de secp256k1 responde `-32602 invalidPrivateKey`', async () => {
    await createAnvilWallet();
    const zero = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const imported = await importAccountByPrivateKey(zero, undefined, storage);
    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.error.code).toBe(-32602);
    expect(imported.error.message).toContain('secp256k1');
    expect(rawImported()).toEqual([]);
  });

  it('la etiqueta de una importada persiste en `truekeate_imported_accounts` (CA-RF-05)', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, 'Ahorros', storage);
    const renamed = await renameAccount(`imp:${ADDRESS_TWO}`, 'Ahorros fríos', storage);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.label).toBe('Ahorros fríos');
    expect(rawImported()[0]?.label).toBe('Ahorros fríos');
    // El mecanismo de las importadas NO toca `accountLabels` (DEC-35).
    expect(rawSettings().accountLabels).toEqual({});
  });
});

describe('M28 · etiquetas de las derivadas (DEC-35)', () => {
  it('renombrar una derivada escribe `accountLabels[índice]`', async () => {
    await createAnvilWallet();
    const renamed = await renameAccount(accountRefForIndex(2), 'Nómina', storage);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.account.label).toBe('Nómina');
    expect(rawSettings().accountLabels).toEqual({ 2: 'Nómina' });
    expect((await getSettings(storage)).accountLabels[2]).toBe('Nómina');
  });

  it('la etiqueta de una derivada persiste y se vuelve a leer con `listAccounts`', async () => {
    await createAnvilWallet();
    await renameAccount(accountRefForIndex(0), 'Principal', storage);
    const views = buildAccountViews(await readWalletState(storage));
    expect(views[0]?.label).toBe('Principal');
    expect(views[1]?.label).toBe('Cuenta 2');
  });

  it('una etiqueta vacía o demasiado larga no se acepta y no escribe', async () => {
    // La causa `invalidLabel` se añadió al catálogo en la v1.9 de `diccionario_datos.md` §4.3:
    // M28 responde `-32602` con el literal de la tabla (no degrada a `-32603`).
    await createAnvilWallet();
    const writesBefore = storage.writes().length;
    for (const label of ['', '   ', 'x'.repeat(33)]) {
      const result = await renameAccount(accountRefForIndex(1), label, storage);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(-32602);
      expect(result.error.message).toBe('La etiqueta no es válida: debe tener entre 1 y 32 caracteres.');
      expect(result.error.data).toMatchObject({ reason: 'invalid-label' });
    }
    expect(storage.writes().length).toBe(writesBefore);
    expect(rawSettings().accountLabels).toEqual({});
  });

  it('renombrar una cuenta inexistente responde `-32602 unknownAccount`', async () => {
    await createAnvilWallet();
    const result = await renameAccount(accountRefForIndex(42), 'Fantasma', storage);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32602);
    expect(result.error.message).toBe('La cuenta indicada no existe en la cartera.');
    expect(result.error.data).toMatchObject({ reason: 'unknown-account' });
  });
});

describe('M28 · visibilidad: se oculta, no se elimina (RF-06 / DEC-35)', () => {
  it('ocultar una derivada la retira de la lista sin borrar su derivación', async () => {
    await createAnvilWallet();
    const hidden = await setAccountVisible(accountRefForIndex(1), false, storage);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.account.visible).toBe(false);
    // La dirección SIGUE en `truekeate_accounts`: no se borra la derivación.
    expect(rawAccounts()).toEqual([...ANVIL_ADDRESSES.slice(0, 5)]);
    expect(rawSettings().hiddenAccounts).toEqual([1]);
    const views = buildAccountViews(await readWalletState(storage));
    expect(visibleAccounts(views).map((view) => view.ref)).toEqual(['idx:0', 'idx:2', 'idx:3', 'idx:4']);
  });

  it('volver a mostrar devuelve LA MISMA dirección (no re-deriva distinto)', async () => {
    await createAnvilWallet();
    await setAccountVisible(accountRefForIndex(1), false, storage);
    const shown = await setAccountVisible(accountRefForIndex(1), true, storage);
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(shown.account.address).toBe(ANVIL_ADDRESSES[1]);
    expect(shown.account.visible).toBe(true);
    expect(rawSettings().hiddenAccounts).toEqual([]);
    expect(rawAccounts()[1]).toBe(ANVIL_ADDRESSES[1]);
  });

  it('ocultar una importada marca su campo `visible` sin borrarla', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    const hidden = await setAccountVisible(`imp:${ADDRESS_TWO}`, false, storage);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.account.visible).toBe(false);
    expect(rawImported()).toHaveLength(1);
    expect(rawImported()[0]?.visible).toBe(false);
    expect(rawImported()[0]?.privateKey).toBe(KEY_TWO);
  });
});

describe('M28 · eliminar una importada con la guarda `-32000` (R-09a / DEC-45)', () => {
  it('con una dApp vigente sobre la cuenta, la baja se bloquea con `-32000` y NO se toca el almacén', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, 'Ahorros', storage);
    await storage.set({ [STORAGE_KEYS.connectedSites]: activeSession(ADDRESS_TWO) });
    const writesBefore = storage.writes().length;

    const removed = await removeImportedAccount(`imp:${ADDRESS_TWO}`, storage);
    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.code).toBe(-32000);
    expect(removed.error.message).toBe(
      `La cuenta está en uso por la dApp ${DAPP_ORIGIN}: revoca ese permiso antes de revelar su clave privada o eliminarla.`,
    );
    expect(removed.error.data).toBeUndefined();
    expect(storage.writes().length).toBe(writesBefore);
    expect(rawImported()).toHaveLength(1);
    expect(rawImported()[0]?.privateKey).toBe(KEY_TWO);
  });

  it('tras revocar la sesión, la baja elimina la entrada y su clave privada', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    await storage.set({ [STORAGE_KEYS.connectedSites]: activeSession(ADDRESS_TWO) });
    await removeImportedAccount(`imp:${ADDRESS_TWO}`, storage);

    // Revocación desde el popup: el origen sale de `truekeate_connected_sites`.
    await storage.set({ [STORAGE_KEYS.connectedSites]: {} });
    const removed = await removeImportedAccount(`imp:${ADDRESS_TWO}`, storage);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.removed).toBe(ADDRESS_TWO);
    expect(removed.accounts).toEqual([]);
    expect(rawImported()).toEqual([]);
    expect(JSON.stringify(chromeStub.rawStorage())).not.toContain(KEY_TWO);
  });

  it('una sesión caducada ya no bloquea la baja', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    await storage.set({ [STORAGE_KEYS.connectedSites]: activeSession(ADDRESS_TWO, Date.now() - 1) });
    const removed = await removeImportedAccount(`imp:${ADDRESS_TWO}`, storage);
    expect(removed.ok).toBe(true);
  });

  it('una sesión sobre OTRA cuenta no bloquea la baja', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    await storage.set({ [STORAGE_KEYS.connectedSites]: activeSession(ANVIL_ADDRESSES[0]) });
    const removed = await removeImportedAccount(`imp:${ADDRESS_TWO}`, storage);
    expect(removed.ok).toBe(true);
  });

  it('una cuenta DERIVADA no se puede eliminar por esta vía', async () => {
    await createAnvilWallet();
    const result = await removeImportedAccount(accountRefForIndex(0), storage);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32602);
    expect(result.error.message).toBe('La cuenta indicada no existe en la cartera.');
    expect(result.error.data).toMatchObject({ reason: 'not-an-imported-account' });
    expect(rawAccounts()).toHaveLength(5);
  });

  it('al eliminar la cuenta activa, la activa pasa a `idx:0`', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    await setCurrentAccount(`imp:${ADDRESS_TWO}`, storage);
    expect(chromeStub.rawStorage()[STORAGE_KEYS.currentAccount]).toBe(`imp:${ADDRESS_TWO}`);

    const removed = await removeImportedAccount(`imp:${ADDRESS_TWO}`, storage);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.currentAccount).toBe('idx:0');
    expect(chromeStub.rawStorage()[STORAGE_KEYS.currentAccount]).toBe('idx:0');
  });

  it('la guarda del borrado consulta el origen de la dApp real, no la referencia', async () => {
    const sessions = activeSession(ADDRESS_TWO);
    expect(activeDappOriginFor([ADDRESS_TWO], sessions, 10)).toBe(DAPP_ORIGIN);
    expect(activeDappOriginFor([ADDRESS_THREE], sessions, 10)).toBeNull();
  });
});

describe('M28 · cuenta activa y referencias', () => {
  it('`setCurrentAccount` acepta `idx`, `imp` y la forma heredada `"3"`', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, undefined, storage);
    expect((await setCurrentAccount('3', storage)).ok).toBe(true);
    expect(chromeStub.rawStorage()[STORAGE_KEYS.currentAccount]).toBe('idx:3');
    expect((await setCurrentAccount(`imp:${ADDRESS_TWO}`, storage)).ok).toBe(true);
    expect(chromeStub.rawStorage()[STORAGE_KEYS.currentAccount]).toBe(`imp:${ADDRESS_TWO}`);
  });

  it('rechaza una cuenta que no existe con `-32602 invalidAddress`', async () => {
    await createAnvilWallet();
    const result = await setCurrentAccount(accountRefForIndex(9), storage);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(-32602);
  });

  it('`getCurrentAccountRef` cae a la primera cuenta si la guardada no existe', async () => {
    await createAnvilWallet();
    await storage.set({ [STORAGE_KEYS.currentAccount]: 'idx:99' });
    expect(await getCurrentAccountRef(storage)).toBe('idx:0');
  });

  it('`parseAccountRef` interpreta las tres formas y rechaza el resto', () => {
    expect(parseAccountRef('idx:4')).toEqual({ kind: 'derived', index: 4 });
    expect(parseAccountRef('4')).toEqual({ kind: 'derived', index: 4 });
    expect(parseAccountRef(`imp:${ADDRESS_TWO}`)).toEqual({ kind: 'imported', address: ADDRESS_TWO });
    expect(parseAccountRef(`imp:${ADDRESS_TWO.toLowerCase()}`)).toEqual({
      kind: 'imported',
      address: ADDRESS_TWO.toLowerCase(),
    });
    // Una dirección ENTERA en mayúsculas es una forma hexadecimal legítima (sin checksum
    // verificable) y se conserva tal cual; con mayúsculas mezcladas pero no EIP-55 se rechaza.
    expect(parseAccountRef(`imp:0x${ADDRESS_TWO.slice(2).toUpperCase()}`)).toEqual({
      kind: 'imported',
      address: `0x${ADDRESS_TWO.slice(2).toUpperCase()}`,
    });
    // Una dirección con mayúsculas mezcladas que NO respeta EIP-55 se rechaza.
    expect(parseAccountRef('imp:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb9226')).toBeNull();
    expect(parseAccountRef('idx:-1')).toBeNull();
    expect(parseAccountRef('imp:0x1234')).toBeNull();
    expect(parseAccountRef('otra-cosa')).toBeNull();
    expect(parseAccountRef(null)).toBeNull();
  });
});

describe('M28 · instantánea del popup', () => {
  it('resume cuentas, activa, recuento y ajustes en una sola lectura', async () => {
    await createAnvilWallet();
    await importAccountByPrivateKey(KEY_TWO, 'Ahorros', storage);
    const snapshot = await getAccountsSnapshot(storage);
    expect(snapshot.walletExists).toBe(true);
    expect(snapshot.accounts).toHaveLength(6);
    expect(snapshot.currentAccount).toBe('idx:0');
    expect(snapshot.derivedAccountCount).toBe(5);
    expect(snapshot.accounts.filter((account) => account.kind === 'imported')).toHaveLength(1);
    expect(findAccount(snapshot.accounts, 'idx:0')?.address).toBe(ANVIL_ADDRESSES[0]);
    expect(findAccount(snapshot.accounts, accountRefForAddress(ADDRESS_TWO))?.label).toBe('Ahorros');
  });

  it('una cartera vacía declara `walletExists: false` y ninguna cuenta', async () => {
    const snapshot = await getAccountsSnapshot(storage);
    expect(snapshot.walletExists).toBe(false);
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.currentAccount).toBeNull();
  });

  it('`addressForRef` resuelve derivadas e importadas y devuelve `null` si no existen', async () => {
    await createAnvilWallet();
    const state = await readWalletState(storage);
    expect(addressForRef(state, accountRefForIndex(1))).toBe(ANVIL_ADDRESSES[1]);
    expect(addressForRef(state, accountRefForIndex(9))).toBeNull();
    expect(addressForRef(state, `imp:${ADDRESS_THREE}`)).toBeNull();
  });
});
