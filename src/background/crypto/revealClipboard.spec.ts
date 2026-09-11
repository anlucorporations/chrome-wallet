// @vitest-environment node
/**
 * `src/background/crypto/revealClipboard.spec.ts` — M12 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre el criterio explícito de `§3.2.8` («Fuga por el portapapeles»): **al ocultarse el valor
 * revelado, si el portapapeles todavía lo contiene, se sobrescribe con cadena vacía**; si no lo
 * contiene, NO se destruye contenido ajeno. Este spec falla si el portapapeles conserva la
 * semilla, que es exactamente lo que exige el plan.
 *
 * Entorno `node`: ver la cabecera de `mnemonic.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { CLIPBOARD_CLEAR_ON_HIDE } from '../../shared/constants';
import {
  CLIPBOARD_POLICY_ENABLED,
  clearClipboardIfContains,
  createRevealSession,
  currentClipboard,
  type ClipboardApiLike,
} from './secrets';

/** Frase de Anvil (semilla de desarrollo del proyecto). */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Clave privada real de la cuenta 0 de Anvil. */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Dirección EIP-55 de la cuenta 0 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Contenido ajeno que el revelado NUNCA debe destruir. */
const FOREIGN_TEXT = 'notas personales del usuario';

/** Reloj fijo. */
const NOW = 1_700_000_000_000;

/** Portapapeles en memoria que registra cada escritura. */
class FakeClipboard implements ClipboardApiLike {
  text = '';
  writes: string[] = [];
  reads = 0;
  readFails = false;
  writeFails = false;

  async readText(): Promise<string> {
    this.reads += 1;
    if (this.readFails) throw new Error('lectura denegada por el navegador');
    return this.text;
  }

  async writeText(value: string): Promise<void> {
    if (this.writeFails) throw new Error('escritura denegada por el navegador');
    this.writes.push(value);
    this.text = value;
  }
}

/** Sesión de revelado con temporizadores controlados a mano. */
const newSession = (
  value: string,
  clipboard: ClipboardApiLike | null,
  kind: 'mnemonic' | 'privateKey' = 'mnemonic',
) =>
  createRevealSession(
    {
      kind,
      account: kind === 'privateKey' ? ANVIL_ADDRESS0 : null,
      value,
      revealedAt: NOW,
      hideAt: NOW + 30_000,
      hideAfterMs: 30_000,
      length: value.length,
    },
    {
      now: () => NOW,
      setTimer: () => 1,
      clearTimer: () => undefined,
      clipboard,
    },
  );

describe('Portapapeles · borrado selectivo al ocultar (CA-RF-50 / §3.2.8)', () => {
  it('si el portapapeles contiene el valor revelado, queda VACÍO al ocultar', async () => {
    const clipboard = new FakeClipboard();
    const session = newSession(ANVIL_MNEMONIC, clipboard);

    expect(await session.copy()).toBe(true);
    expect(clipboard.text).toBe(ANVIL_MNEMONIC);

    const report = await session.hide('manual');
    expect(report?.clipboard).toBe('cleared');
    expect(report?.clipboardWarn).toBe(false);
    expect(report?.wasCopied).toBe(true);
    expect(clipboard.text).toBe('');
    expect(clipboard.text).not.toBe(ANVIL_MNEMONIC);
    expect(clipboard.writes).toEqual([ANVIL_MNEMONIC, '']);
  });

  it('el borrado ocurre también cuando el valor llegó al portapapeles por otra vía', async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = ANVIL_MNEMONIC;
    // La sesión no copió, pero el contenido coincide: se borra igual (comparación por valor).
    const session = newSession(ANVIL_MNEMONIC, clipboard);
    const report = await session.hideOnFocusLoss();
    expect(report?.wasCopied).toBe(false);
    expect(report?.clipboard).toBe('cleared');
    expect(clipboard.text).toBe('');
  });

  it('si el portapapeles tiene OTRO contenido, NO se destruye', async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = FOREIGN_TEXT;
    const session = newSession(ANVIL_MNEMONIC, clipboard);
    await session.copy();
    // `copy()` sobrescribe con el valor: se restaura el contenido ajeno para simular el caso.
    clipboard.text = FOREIGN_TEXT;

    const report = await session.hide('manual');
    expect(report?.clipboard).toBe('not-present');
    expect(report?.clipboardWarn).toBe(false);
    expect(clipboard.text).toBe(FOREIGN_TEXT);
    expect(clipboard.writes).not.toContain('');
  });

  it('un portapapeles que contiene la CLAVE privada también se vacía al ocultar', async () => {
    const clipboard = new FakeClipboard();
    const session = newSession(ANVIL_KEY0, clipboard, 'privateKey');
    await session.copy();
    expect(clipboard.text).toBe(ANVIL_KEY0);
    await session.hide('manual');
    expect(clipboard.text).toBe('');
  });

  it('el valor se descarta de la memoria antes de comparar el portapapeles', async () => {
    const clipboard = new FakeClipboard();
    const session = newSession(ANVIL_MNEMONIC, clipboard);
    await session.copy();
    const report = await session.hide('manual');
    // Resultado observable del orden: el valor se borró del portapapeles Y `read()` es `null`.
    expect(report?.clipboard).toBe('cleared');
    expect(session.read()).toBeNull();
  });
});

describe('Portapapeles · casos límite de la política', () => {
  it('la política está activa en el producto', () => {
    expect(CLIPBOARD_CLEAR_ON_HIDE).toBe(true);
    expect(CLIPBOARD_POLICY_ENABLED).toBe(true);
  });

  it('sin API de portapapeles se avisa (`unavailable`) y no se lanza', async () => {
    const report = await clearClipboardIfContains(ANVIL_MNEMONIC, null);
    expect(report).toEqual({ outcome: 'unavailable', warn: true });
  });

  it('si la LECTURA falla, se aplica el borrado incondicional de respaldo y se avisa', async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = ANVIL_MNEMONIC;
    clipboard.readFails = true;
    const report = await clearClipboardIfContains(ANVIL_MNEMONIC, clipboard);
    expect(report).toEqual({ outcome: 'unconditional', warn: true });
    expect(clipboard.text).toBe('');
  });

  it('si lectura y escritura fallan, se informa `unavailable` con aviso', async () => {
    const clipboard = new FakeClipboard();
    clipboard.readFails = true;
    clipboard.writeFails = true;
    const report = await clearClipboardIfContains(ANVIL_MNEMONIC, clipboard);
    expect(report).toEqual({ outcome: 'unavailable', warn: true });
  });

  it('nunca escribe una cadena vacía cuando el valor a comparar está vacío', async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = FOREIGN_TEXT;
    const report = await clearClipboardIfContains('', clipboard);
    expect(report).toEqual({ outcome: 'not-present', warn: false });
    expect(clipboard.writes).toEqual([]);
    expect(clipboard.text).toBe(FOREIGN_TEXT);
  });

  it('al ocultar, un portapapeles con el valor se vacía y el informe de aviso es correcto', async () => {
    const clipboard = new FakeClipboard();
    clipboard.readFails = true;
    const session = newSession(ANVIL_MNEMONIC, clipboard);
    const report = await session.hide('manual');
    expect(report?.clipboard).toBe('unconditional');
    expect(report?.clipboardWarn).toBe(true);
    expect(clipboard.text).toBe('');
  });

  it('`dispose` NO toca el portapapeles (es un desmontaje, no un ocultado)', async () => {
    const clipboard = new FakeClipboard();
    clipboard.text = ANVIL_MNEMONIC;
    const session = newSession(ANVIL_MNEMONIC, clipboard);
    session.dispose();
    expect(clipboard.text).toBe(ANVIL_MNEMONIC);
    expect(clipboard.writes).toEqual([]);
    expect(session.read()).toBeNull();
  });

  it('`currentClipboard` devuelve `null` cuando no hay `navigator.clipboard`', () => {
    expect(currentClipboard()).toBeNull();
  });

  it('`currentClipboard` devuelve la API cuando está completa', () => {
    const fake = new FakeClipboard();
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: fake },
      configurable: true,
      writable: true,
    });
    try {
      expect(currentClipboard()).toBe(fake);
    } finally {
      if (originalNavigator === undefined) {
        delete (globalThis as { navigator?: unknown }).navigator;
      } else {
        Object.defineProperty(globalThis, 'navigator', originalNavigator);
      }
    }
  });
});
