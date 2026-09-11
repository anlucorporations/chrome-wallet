/**
 * `e2e/fixtures/h2.ts` — Ayudas de los flujos de H2 (tarea 2.17, `plan_desarrollo.md` §3.2.7).
 *
 * Reúne lo que comparten `02`, `03`, `05`, `06`, `16` y `25`:
 *   · la frase y las direcciones REALES de Anvil, que son el contraste con `cast balance`;
 *   · la siembra del estado desde el Service Worker (§7.4.1.b) para partir de una cartera
 *     concreta sin repetir el flujo de creación;
 *   · la lectura del estado persistido y de la matriz del QR.
 */

import type { Page, Worker } from '@playwright/test';
import { readChromeStorage, readQrModules, writeChromeStorage } from './extension';
import { decodeQrMatrix } from './qr';

/** Frase de Anvil: semilla de desarrollo del proyecto (`constants.ts`, RF-12). */
export const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Direcciones EIP-55 reales de las 6 primeras cuentas de Anvil. */
export const ANVIL_ADDRESSES = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
] as const;

/** Clave privada REAL de la cuenta 0 de Anvil (pública: es la de desarrollo). */
export const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Dirección resultante de la clave privada 2 de secp256k1 (para las importadas). */
export const ADDRESS_KEY_TWO = '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF';

/** Clave privada 2 de secp256k1. */
export const KEY_TWO = `0x${'2'.padStart(64, '0')}`;

/** Clave privada 3 de secp256k1. */
export const KEY_THREE = `0x${'3'.padStart(64, '0')}`;

/** Origen de la dApp de pruebas (la que ocupa una cuenta para la guarda `-32000`). */
export const DAPP_ORIGIN = 'http://localhost:5174';

/** Ajustes mínimos que el popup necesita para pintarse sin aviso de primer arranque. */
const acceptedSettings = (): Record<string, unknown> => ({
  derivedAccountCount: 5,
  accountLabels: {},
  hiddenAccounts: [],
  language: 'es',
  encryptionEnabled: false,
  requirePasswordOnOpen: false,
  schemaVersion: '1.4',
  devNoticeAcceptedAt: 1,
});

/** Opciones de la siembra del estado inicial. */
export interface SeedOptions {
  /** Frase a persistir; `null` deja la cartera sin frase. */
  mnemonic?: string | null;
  /** Direcciones derivadas; por defecto, las 5 primeras de Anvil. */
  accounts?: readonly string[];
  /** Cuentas importadas, con su clave y etiqueta. */
  imported?: readonly { address: string; privateKey: string; label: string; visible?: boolean }[];
  /** Cuenta activa (`idx:0` por defecto; `null` deja la cartera SIN cuenta activa). */
  currentAccount?: string | null;
  /** Sesiones de dApp en `truekeate_connected_sites`. */
  connectedSites?: Record<string, unknown>;
  /** Entradas de `truekeate_pending_requests`. */
  pendingRequests?: Record<string, unknown>;
  /** Entradas de `truekeate_inflight_tx`. */
  inflightTx?: Record<string, unknown>;
  /** Entradas de `truekeate_logs` (sobreviven al reset, RF-32). */
  logs?: unknown[];
  /** Sin el aviso de primer arranque aceptado, el popup queda bloqueado por la capa modal. */
  devNoticeAccepted?: boolean;
}

/**
 * Siembra una cartera completa desde el Service Worker (§7.4.1.b) y acepta el aviso de primer
 * arranque por defecto, para que el popup se pinte sin interacción previa.
 */
export async function seedWallet(background: Worker, options: SeedOptions = {}): Promise<void> {
  const accounts = options.accounts ?? ANVIL_ADDRESSES.slice(0, 5);
  const importedAccounts = (options.imported ?? []).map((entry) => ({
    address: entry.address,
    privateKey: entry.privateKey,
    label: entry.label,
    importedAt: 1,
    visible: entry.visible !== false,
  }));
  /**
   * Cuenta activa COHERENTE con lo sembrado. Escribir `idx:0` con `accounts: []` deja el estado
   * incoherente y M13 lo clasifica como cartera dañada (`current-account-missing`, RNF-22): el
   * popup pintaría «Wallet dañada» en lugar del estado vacío. Sin cuentas ni frase no hay cuenta
   * activa que persistir (RF-09/RF-10).
   */
  const currentAccount =
    options.currentAccount !== undefined
      ? options.currentAccount
      : accounts.length > 0
        ? 'idx:0'
        : importedAccounts.length > 0
          ? `imp:${importedAccounts[0]?.address ?? ''}`
          : null;
  const items: Record<string, unknown> = {
    truekeate_imported_accounts: importedAccounts,
    truekeate_settings: {
      ...acceptedSettings(),
      devNoticeAcceptedAt: options.devNoticeAccepted === false ? undefined : 1,
    },
  };
  // La clave de las derivadas solo existe si hay derivadas: es lo que escribe el producto, y de
  // otro modo una cartera sin cuentas aparentaría tener una lista vacía ya persistida.
  if (accounts.length > 0) {
    items.truekeate_accounts = [...accounts];
  }
  if (currentAccount !== null) {
    items.truekeate_current_account = currentAccount;
  }
  if (options.mnemonic !== null) {
    items.truekeate_mnemonic = options.mnemonic ?? ANVIL_MNEMONIC;
  }
  if (options.connectedSites !== undefined) items.truekeate_connected_sites = options.connectedSites;
  if (options.pendingRequests !== undefined) items.truekeate_pending_requests = options.pendingRequests;
  if (options.inflightTx !== undefined) items.truekeate_inflight_tx = options.inflightTx;
  if (options.logs !== undefined) items.truekeate_logs = options.logs;
  await writeChromeStorage(background, items);
}

/** Sesión vigente de una dApp sobre `account` (guarda `-32000` de R-09a / DEC-45). */
export const activeSession = (account: string): Record<string, unknown> => ({
  [DAPP_ORIGIN]: {
    origin: DAPP_ORIGIN,
    account,
    connectedAt: 1,
    lastUsedAt: 2,
    expiresAt: null,
    connected: true,
  },
});

/** Lee y devuelve una clave del almacén, sin tipar. */
export const storedValue = async (background: Worker, key: string): Promise<unknown> =>
  (await readChromeStorage(background, key))[key];

/** Cuentas derivadas persistidas. */
export const storedAccounts = async (background: Worker): Promise<string[]> => {
  const value = await storedValue(background, 'truekeate_accounts');
  return Array.isArray(value) ? (value as string[]) : [];
};

/** Cuentas importadas persistidas. */
export const storedImported = async (
  background: Worker,
): Promise<Array<Record<string, unknown>>> => {
  const value = await storedValue(background, 'truekeate_imported_accounts');
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
};

/** Texto que codifica el QR pintado en el popup, o `null` si no se pudo decodificar. */
export async function readQrPayload(page: Page): Promise<string | null> {
  const modules = await readQrModules(page);
  return modules === null ? null : decodeQrMatrix(modules);
}
