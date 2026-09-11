// @vitest-environment node
/**
 * `src/background/crypto/revealHygiene.spec.ts` — M12 (tarea 2.16, `plan_desarrollo.md` §3.2.7).
 *
 * Cubre RNF-09 / `CA-RF-50` en lo que el módulo PUEDE garantizar por sí mismo:
 *   · el plazo de ocultado es de 30 s (`REVEAL_HIDE_MS`) y el temporizador es inyectable;
 *   · la pérdida de foco (`hideOnFocusLoss`) oculta igual que el temporizador;
 *   · al ocultarse, el valor se **descarta de la memoria** (`read()` pasa a `null`);
 *   · el valor **nunca** viaja por `window.postMessage` ni por `chrome.runtime.sendMessage`.
 *
 * El doble disparador en la UI real (evento `blur`/`visibilitychange` de `SecurityView`) y el
 * borrado del portapapeles observable se verifican en `e2e/25-recuperacion.spec.ts`; aquí se fija
 * la parte pura y determinista, sin esperas reales.
 *
 * Entorno `node`: ver la cabecera de `mnemonic.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { chromeStub } from '../../../test/setup/chrome-stub';
import { REVEAL_HIDE_MS } from '../../shared/constants';
import { buildInternalMessage } from '../../popup/walletRpc';
import { createRevealSession, SECRET_HIDE_MS, type ClipboardApiLike } from './secrets';

/** Frase de Anvil (semilla de desarrollo del proyecto). */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

/** Dirección EIP-55 de la cuenta 0 de Anvil. */
const ANVIL_ADDRESS0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Clave privada real de la cuenta 0 de Anvil. */
const ANVIL_KEY0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Reloj fijo del revelado. */
const REVEALED_AT = 1_700_000_000_000;

/**
 * Deja vaciar la cola de microtareas: `hide()` es asíncrono (consulta el portapapeles) y el
 * temporizador lo lanza sin esperarlo. Ocho turnos cubren lectura + escritura del portapapeles.
 */
const flushMicrotasks = async (): Promise<void> => {
  for (let turn = 0; turn < 8; turn += 1) {
    await Promise.resolve();
  }
};

/**
 * Reloj de prueba con temporizadores manipulables: evita `waitForTimeout` y permite comprobar
 * que a los 29 999 ms el valor sigue visible y a los 30 000 ms ya no.
 */
class FakeTimers {
  private current = REVEALED_AT;
  private readonly pending = new Map<number, { at: number; handler: () => void }>();
  private nextHandle = 1;
  private fired = 0;

  readonly setTimer = (handler: () => void, ms: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.pending.set(handle, { at: this.current + ms, handler });
    return handle;
  };

  readonly clearTimer = (handle: number): void => {
    this.pending.delete(handle);
  };

  readonly now = (): number => this.current;

  /** Avanza el reloj `ms` y dispara los temporizadores vencidos (en orden). */
  advance(ms: number): number {
    this.current += ms;
    let fired = 0;
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= this.current)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      this.pending.delete(due[0]);
      due[1].handler();
      fired += 1;
    }
    this.fired += fired;
    return fired;
  }

  /** Temporizadores aún armados. */
  armed(): number {
    return this.pending.size;
  }

  /** Disparos acumulados (todos los avances). */
  totalFired(): number {
    return this.fired;
  }
}

/** Portapapeles en memoria con el texto actual y los fallos que se le pidan. */
class FakeClipboard implements ClipboardApiLike {
  text = '';
  writes: string[] = [];
  readFails = false;
  writeFails = false;

  async readText(): Promise<string> {
    if (this.readFails) throw new Error('lectura denegada');
    return this.text;
  }

  async writeText(value: string): Promise<void> {
    if (this.writeFails) throw new Error('escritura denegada');
    this.writes.push(value);
    this.text = value;
  }
}

/** Secreto de la frase, tal y como lo entrega M12. */
const mnemonicSecret = () => ({
  kind: 'mnemonic' as const,
  account: null,
  value: ANVIL_MNEMONIC,
  revealedAt: REVEALED_AT,
  hideAt: REVEALED_AT + SECRET_HIDE_MS,
  hideAfterMs: SECRET_HIDE_MS,
  length: ANVIL_MNEMONIC.length,
});

/** Secreto de una clave privada. */
const keySecret = () => ({
  kind: 'privateKey' as const,
  account: ANVIL_ADDRESS0,
  value: ANVIL_KEY0,
  revealedAt: REVEALED_AT,
  hideAt: REVEALED_AT + SECRET_HIDE_MS,
  hideAfterMs: SECRET_HIDE_MS,
  length: ANVIL_KEY0.length,
});

describe('CA-RF-50 · plazo de 30 s', () => {
  it('a los 29 999 ms el valor sigue visible y a los 30 000 ms se oculta', async () => {
    const timers = new FakeTimers();
    const clipboard = new FakeClipboard();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard,
    });

    timers.advance(29_999);
    expect(timers.totalFired()).toBe(0);
    expect(session.isVisible()).toBe(true);
    expect(session.read()).toBe(ANVIL_MNEMONIC);

    timers.advance(1);
    await Promise.resolve();
    expect(timers.totalFired()).toBe(1);
    expect(session.isVisible()).toBe(false);
    expect(session.read()).toBeNull();
  });

  it('el plazo armado es exactamente `REVEAL_HIDE_MS` (30 000 ms)', () => {
    const timers = new FakeTimers();
    createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    expect(timers.armed()).toBe(1);
    // Ni un milisegundo antes de 30 s no ha disparado nada; a 30 s sí.
    expect(timers.advance(29_999)).toBe(0);
    expect(timers.advance(1)).toBe(1);
    expect(REVEAL_HIDE_MS).toBe(30_000);
  });

  it('el informe del ocultado por temporizador es exacto', async () => {
    const timers = new FakeTimers();
    const reports: unknown[] = [];
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
      onHide: (report) => reports.push(report),
    });
    timers.advance(30_000);
    // El temporizador lanza `hide()` sin esperarlo: hay que dejar vaciar la cola de microtareas
    // (lectura y escritura del portapapeles) antes de comprobar el informe.
    await flushMicrotasks();
    expect(reports).toEqual([
      { reason: 'timer', hiddenAt: REVEALED_AT + 30_000, clipboard: 'not-present', clipboardWarn: false, wasCopied: false },
    ]);
    expect(session.read()).toBeNull();
  });
});

describe('CA-RF-50 · ocultado por pérdida de foco', () => {
  it('`hideOnFocusLoss` oculta y descarta el valor de inmediato', async () => {
    const timers = new FakeTimers();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    const report = await session.hideOnFocusLoss();
    expect(report?.reason).toBe('focus-loss');
    expect(session.isVisible()).toBe(false);
    expect(session.read()).toBeNull();
  });

  it('el ocultado es idempotente: el segundo disparador no vuelve a informar', async () => {
    const timers = new FakeTimers();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    const first = await session.hideOnFocusLoss();
    expect(first).not.toBeNull();
    expect(await session.hide('timer')).toBeNull();
    expect(await session.hide('manual')).toBeNull();
    expect(await session.hideOnFocusLoss()).toBeNull();
  });

  it('recuperar el foco NO vuelve a mostrar el valor: sigue en `null`', async () => {
    const timers = new FakeTimers();
    const session = createRevealSession(keySecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    await session.hideOnFocusLoss();
    // No existe ninguna API de "re-show": el valor solo se recupera pidiéndolo otra vez al SW.
    expect(session.read()).toBeNull();
    expect(session.isVisible()).toBe(false);
    expect(Object.keys(session)).not.toContain('show');
  });

  it('el ocultado por foco cancela el temporizador pendiente (no dispara después)', async () => {
    const timers = new FakeTimers();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    await session.hideOnFocusLoss();
    expect(timers.armed()).toBe(0);
    expect(timers.advance(30_000)).toBe(0);
  });
});

describe('RNF-09 · descarte de la memoria', () => {
  it('`dispose` descarta el valor y no deja copia accesible', () => {
    const timers = new FakeTimers();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    expect(session.read()).toBe(ANVIL_MNEMONIC);
    session.dispose();
    expect(session.read()).toBeNull();
    expect(session.isVisible()).toBe(false);
    expect(JSON.stringify(session)).not.toContain('junk');
  });

  it('`read()` solo entrega el valor mientras está visible', async () => {
    const timers = new FakeTimers();
    const session = createRevealSession(keySecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    expect(session.read()).toBe(ANVIL_KEY0);
    await session.hide('manual');
    expect(session.read()).toBeNull();
    expect(session.isVisible()).toBe(false);
  });

  it('copiar tras ocultar no escribe NADA en el portapapeles', async () => {
    const timers = new FakeTimers();
    const clipboard = new FakeClipboard();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard,
    });
    await session.hide('manual');
    const copied = await session.copy();
    expect(copied).toBe(false);
    expect(clipboard.writes).not.toContain(ANVIL_MNEMONIC);
    expect(clipboard.text).toBe('');
  });

  it('la sesión conserva el ancla temporal del revelado para la cuenta atrás de la UI', () => {
    const timers = new FakeTimers();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    expect(session.kind).toBe('mnemonic');
    expect(session.account).toBeNull();
    expect(session.revealedAt).toBe(REVEALED_AT);
    expect(session.hideAt).toBe(REVEALED_AT + 30_000);
    expect(session.hideAfterMs).toBe(30_000);
  });
});

describe('RNF-09 · el valor nunca sale por un canal de página', () => {
  it('ocultar y copiar no llaman a `window.postMessage` en ningún momento', async () => {
    const originalPostMessage = globalThis.postMessage;
    const calls: unknown[][] = [];
    const spy = (...args: unknown[]): void => {
      calls.push(args);
    };
    (globalThis as { postMessage: unknown }).postMessage = spy;
    const windowLike = (globalThis as { window?: { postMessage?: unknown } }).window;
    const previousWindowPost = windowLike?.postMessage;
    if (windowLike !== undefined) windowLike.postMessage = spy;
    try {
      const timers = new FakeTimers();
      const session = createRevealSession(mnemonicSecret(), {
        now: timers.now,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        clipboard: new FakeClipboard(),
      });
      await session.copy();
      await session.hideOnFocusLoss();
      session.dispose();
      expect(calls).toHaveLength(0);
    } finally {
      (globalThis as { postMessage: unknown }).postMessage = originalPostMessage;
      if (windowLike !== undefined) windowLike.postMessage = previousWindowPost;
    }
  });

  it('el mensaje interno del revelado NO transporta el valor: solo el objetivo y la confirmación', () => {
    const message = buildInternalMessage('wallet_revealSecret', [{ kind: 'mnemonic', confirmed: true }]);
    expect(message.type).toBe('TRUEKEATE_RPC');
    expect(message.origin).toBe('extension');
    expect(message.tabId).toBeNull();
    expect(message.frameId).toBeNull();
    // El propio mensaje de PETICIÓN no lleva el secreto: se pide, no se envía.
    expect(JSON.stringify(message)).not.toContain('junk');
    expect(JSON.stringify(message)).not.toContain('abandon');
  });

  it('el stub de `chrome` no registra ningún secreto tras pedir y ocultar', async () => {
    const timers = new FakeTimers();
    const session = createRevealSession(mnemonicSecret(), {
      now: timers.now,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      clipboard: new FakeClipboard(),
    });
    await session.hide('manual');
    expect(chromeStub.runtime.sentMessages()).toEqual([]);
    expect(chromeStub.storage.local.writes()).toEqual([]);
    expect(JSON.stringify(chromeStub.rawStorage())).not.toContain('junk');
  });
});
