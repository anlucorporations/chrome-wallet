/**
 * M12 — `src/background/crypto/secrets.ts`
 * Revelado y exportación del material de recuperación (RF-50 / `CA-RF-50`) con la **higiene**
 * de P-20 y la guarda de sesión de dApp activa (R-09a / DEC-45).
 *
 * Fuentes: `documento_tecnico.md` **§3.8** y **§3.3**, `diccionario_datos.md` **§3.10** y
 * `plan_desarrollo.md` §3.2.5 tareas 2.7 y 2.9.
 *
 * Reglas que implementa:
 * 1. **Confirmación explícita obligatoria**: sin `confirmed: true` no se entrega nada (`4001`).
 * 2. **Solo contextos de confianza**: contexto de la extensión (`senderGuard`) **y** ruta en la
 *    allowlist (`index.html`); cualquier otro contexto responde `4200`. La frontera es el
 *    ORIGEN, no `sender.tab` (D-H2-G): el popup del `action` y la página `index.html` abierta en
 *    una pestaña llegan CON `sender.tab` —igual que ya documentó D-H2-B para el router—, así que
 *    exigir `sender.tab === undefined` dejaba el revelado inalcanzable. El valor **jamás** viaja
 *    por `window.postMessage` (RNF-09): el canal es el mensaje interno del protocolo.
 * 3. **Guarda `-32000`**: con una entrada **vigente** en `truekeate_connected_sites` para la
 *    cuenta (o, al revelar el mnemonic, para cualquiera de las cuentas que este deriva) la
 *    operación se bloquea con el literal de la causa «Cuenta en uso por una dApp» de §4.3.
 * 4. **Higiene del revelado**: valor oculto por defecto, plazo de **30 s** (`REVEAL_HIDE_MS`),
 *    ocultado **también por pérdida de foco**, descarte del valor de la memoria de la UI y
 *    **borrado del portapapeles** al ocultar si aún contiene el valor revelado.
 *
 * NOTA DE EMPAQUETADO (RNF-14). Este módulo resuelve el secreto con `ethers.js` (M9/M10), así que
 * **el popup NO debe importarlo**: arrastraría el paquete de `ethers` al bundle de la UI. La
 * vista de seguridad (M46) consume el revelado por `TRUEKEATE_RPC` (`wallet_revealSecret`) y
 * reproduce el MECANISMO de ocultado con las constantes de M57. Aquí queda la POLÍTICA completa
 * y su parte de higiene es pura e inyectable (sin DOM, sin temporizadores globales), de modo
 * que es la referencia verificable de `secretsExport.spec.ts`, `revealHygiene.spec.ts` y
 * `revealClipboard.spec.ts`.
 *
 * Desviación declarada de §3.10: el campo de UI `clipboardHash` se sustituye por la comparación
 * **directa** del contenido del portapapeles con el valor revelado en memoria, que es lo que
 * exige §3.8 regla 5 y evita introducir criptografía en la capa de UI.
 */

import type { AccountRef, Address, Eip1193Error } from '../../shared/types';
import { CLIPBOARD_CLEAR_ON_HIDE, REVEAL_HIDE_MS } from '../../shared/constants';
import { EXTENSION_ROUTE_POPUP } from '../../shared/protocol';
import { internalError, methodNotAllowedInContextError, unknownAccountError, userRejectedError } from '../rpc/errors';
import { getStorageLocal, readStorage, STORAGE_KEYS, type StorageLocalLike } from '../state/schema';
import { accountInUseError, addressForRef, parseAccountRef, readWalletState } from '../accounts';
import { derivePrivateKey } from './hd';

/** Plazo de revelado: 30 s (P-20 / DEC-37); la constante vive en M57. */
export const SECRET_HIDE_MS = REVEAL_HIDE_MS;

/** Politica de portapapeles activa (P-20): la constante vive en M57. */
export const CLIPBOARD_POLICY_ENABLED = CLIPBOARD_CLEAR_ON_HIDE;

/** Qué se revela. */
export type SecretKind = 'mnemonic' | 'privateKey';

/** Motivo del ocultado (el primero que ocurra gana). */
export type HideReason = 'timer' | 'focus-loss' | 'manual' | 'closed';

/** Petición de revelado/exportación. */
export interface RevealTarget {
  kind: SecretKind;
  /** Obligatorio en `privateKey`; ignorado en `mnemonic`. */
  accountRef?: AccountRef | null;
  /** Confirmación explícita de la UI: sin ella no se revela ni se exporta nada (regla 1). */
  confirmed: boolean;
}

/**
 * Semilla de una sesión de revelado: los datos del valor revelado tal y como los maneja la UI.
 * El `account` es la **dirección de presentación** (`0x…`, o `null` en el mnemonic): el SW la
 * resolvió con M28 antes de entregar el valor, pero la sesión solo la usa como etiqueta de
 * origen, así que se declara como cadena para no imponer el tipo `Address` a quien la pinta.
 */
export interface RevealSessionSeed {
  kind: SecretKind;
  account: string | null;
  value: string;
  revealedAt: number;
  /** `revealedAt + REVEAL_HIDE_MS`. */
  hideAt: number;
  hideAfterMs: number;
  /** Longitud del valor (32 para una clave privada; el mnemonic, sus caracteres). */
  length: number;
}

/** Valor revelado, con su ventana temporal. Vive SOLO en memoria. */
export interface RevealedSecret extends RevealSessionSeed {
  /** Cuenta revelada, ya normalizada a dirección EIP-55 (`null` en el mnemonic). */
  account: Address | null;
}

/** Resultado del revelado: unión discriminada, nunca lanza. */
export type SecretResult = { ok: true; secret: RevealedSecret } | { ok: false; error: Eip1193Error };

/** Contexto del emisor ya validado por M20 (solo se usan estos tres campos). */
export interface RevealContextLike {
  isExtensionContext: boolean;
  route: string | null;
  tabId: number | null;
}

/** Rutas internas autorizadas a recibir el valor: solo el popup (§3.8 regla 6). */
export const REVEAL_ALLOWED_ROUTES: readonly string[] = [EXTENSION_ROUTE_POPUP];

/**
 * ¿Puede este contexto recibir un secreto?
 *
 * Criterio (D-H2-G): **contexto de la extensión + ruta del popup**. NO se exige
 * `sender.tab === undefined`: el popup del `action` y la página `index.html` abierta en una
 * pestaña —que es la superficie que §5.2 define como «Popup (`index.html`)»— llegan con
 * `sender.tab`, de modo que esa condición respondía `4200` SIEMPRE y el revelado de RF-50 no se
 * podía completar nunca. Es la misma corrección que D-H2-B aplicó en `security/senderGuard.ts`.
 *
 * La frontera de seguridad se mantiene: una página web NUNCA es contexto de la extensión
 * (`isExtensionContext` es `false` y responde `4200`), y una página de la extensión cuya ruta no
 * sea el popup (`connect.html`, `notification.html`) tampoco está en `REVEAL_ALLOWED_ROUTES`.
 */
export const canRevealInContext = (context: RevealContextLike): boolean =>
  context.isExtensionContext &&
  context.route !== null &&
  REVEAL_ALLOWED_ROUTES.includes(context.route);

/** Direcciones derivadas de la cartera (para la guarda del mnemonic). */
const derivedAddresses = (accounts: readonly Address[]): string[] => [...accounts];

/**
 * Resuelve el secreto pedido (RF-50) aplicando, en este orden, la guarda de contexto, la
 * confirmación explícita y la guarda `-32000` de sesión de dApp vigente.
 */
export const resolveSecret = async (
  target: RevealTarget,
  context: RevealContextLike,
  deps: { now?: () => number; storage?: StorageLocalLike | null } = {},
): Promise<SecretResult> => {
  const now = deps.now ?? (() => Date.now());
  const storage = deps.storage === undefined ? getStorageLocal() : deps.storage;

  // 1. Contexto de confianza.
  if (!canRevealInContext(context)) {
    return { ok: false, error: methodNotAllowedInContextError() };
  }
  // 2. Confirmación explícita.
  if (target.confirmed !== true) {
    return { ok: false, error: userRejectedError({ reason: 'reveal-not-confirmed' }) };
  }

  const state = await readWalletState(storage);
  const sessions = (await readStorage([STORAGE_KEYS.connectedSites], storage))[
    STORAGE_KEYS.connectedSites
  ];

  // 3. Guarda de sesión de dApp vigente (R-09a / DEC-45).
  if (target.kind === 'mnemonic') {
    if (state.mnemonic === null) {
      return { ok: false, error: internalError({ reason: 'no-mnemonic' }) };
    }
    const blocked = accountInUseError(derivedAddresses(state.accounts), sessions, now());
    if (blocked !== null) {
      return { ok: false, error: blocked };
    }
    const revealedAt = now();
    return {
      ok: true,
      secret: {
        kind: 'mnemonic',
        account: null,
        value: state.mnemonic,
        revealedAt,
        hideAt: revealedAt + SECRET_HIDE_MS,
        hideAfterMs: SECRET_HIDE_MS,
        length: state.mnemonic.length,
      },
    };
  }

  // Exportación de la clave privada de una cuenta concreta.
  const accountRef = target.accountRef ?? null;
  if (accountRef === null) {
    return { ok: false, error: internalError({ reason: 'missing-account-ref' }) };
  }
  const parsed = parseAccountRef(accountRef);
  const address = addressForRef(state, accountRef);
  if (parsed === null || address === null) {
    // Causa canónica de §4.3 desde la v1.9: «referencia inexistente».
    return { ok: false, error: unknownAccountError({ reason: 'unknown-account', accountRef }) };
  }
  const blocked = accountInUseError([address], sessions, now());
  if (blocked !== null) {
    return { ok: false, error: blocked };
  }

  let value: string | null = null;
  if (parsed.kind === 'derived') {
    value = state.mnemonic === null ? null : derivePrivateKey(state.mnemonic, parsed.index);
  } else {
    value =
      state.importedAccounts.find(
        (entry) => entry.address.toLowerCase() === parsed.address.toLowerCase(),
      )?.privateKey ?? null;
  }
  if (value === null) {
    return { ok: false, error: internalError({ reason: 'secret-unavailable', accountRef }) };
  }
  const revealedAt = now();
  return {
    ok: true,
    secret: {
      kind: 'privateKey',
      account: address,
      value,
      revealedAt,
      hideAt: revealedAt + SECRET_HIDE_MS,
      hideAfterMs: SECRET_HIDE_MS,
      length: value.length,
    },
  };
};

// ---------------------------------------------------------------------------
// Política de portapapeles (P-20 / §3.10)
// ---------------------------------------------------------------------------

/** Superficie mínima del portapapeles que usa la política. */
export interface ClipboardApiLike {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

/** Desenlace del borrado del portapapeles. */
export type ClipboardOutcome =
  /** El portapapeles contenía el valor y se sobrescribió con cadena vacía. */
  | 'cleared'
  /** El portapapeles no contenía el valor (o estaba vacío): no se destruye nada ajeno. */
  | 'not-present'
  /** La lectura falló y se aplicó el borrado incondicional de respaldo (§3.10 regla 4). */
  | 'unconditional'
  /** No hay API de portapapeles o también falló la escritura: hay que avisar en la UI. */
  | 'unavailable';

/** Informe del borrado: alimenta el aviso «no se pudo limpiar el portapapeles». */
export interface ClipboardClearReport {
  outcome: ClipboardOutcome;
  /** `true` cuando hay que avisar al usuario (regla 4: nunca en silencio). */
  warn: boolean;
}

/** Portapapeles del contexto actual, si existe (defensivo: jsdom y el SW pueden no tenerlo). */
export const currentClipboard = (): ClipboardApiLike | null => {
  const clipboard: unknown = (globalThis as { navigator?: { clipboard?: unknown } }).navigator
    ?.clipboard;
  if (typeof clipboard !== 'object' || clipboard === null) {
    return null;
  }
  const candidate = clipboard as { readText?: unknown; writeText?: unknown };
  if (typeof candidate.readText !== 'function' || typeof candidate.writeText !== 'function') {
    return null;
  }
  return clipboard as ClipboardApiLike;
};

/**
 * Borra el portapapeles si todavía contiene `value`. Nunca destruye contenido ajeno: solo
 * sobrescribe cuando el texto leído **coincide** con el valor revelado (§3.8 regla 5 / §3.10
 * regla 5). Si la lectura falla, aplica el borrado incondicional de respaldo y lo informa.
 */
export const clearClipboardIfContains = async (
  value: string,
  clipboard: ClipboardApiLike | null = currentClipboard(),
): Promise<ClipboardClearReport> => {
  if (clipboard === null) {
    return { outcome: 'unavailable', warn: true };
  }
  try {
    const current = await clipboard.readText();
    if (current === value && value.length > 0) {
      await clipboard.writeText('');
      return { outcome: 'cleared', warn: false };
    }
    return { outcome: 'not-present', warn: false };
  } catch {
    try {
      await clipboard.writeText('');
      return { outcome: 'unconditional', warn: true };
    } catch {
      return { outcome: 'unavailable', warn: true };
    }
  }
};

// ---------------------------------------------------------------------------
// Sesión de revelado: estado de UI efímero con higiene (SecretReveal, §3.10)
// ---------------------------------------------------------------------------

/** Informe del ocultado: motivo, resultado del portapapeles y descarte del valor. */
export interface RevealHideReport {
  reason: HideReason;
  hiddenAt: number;
  clipboard: ClipboardOutcome;
  /** `true` cuando hay que avisar en el popup (nunca en silencio). */
  clipboardWarn: boolean;
  /** `true` si el valor se había copiado al portapapeles. */
  wasCopied: boolean;
}

/** Dependencias inyectables de la sesión (timers, reloj y portapapeles). */
export interface RevealSessionDeps {
  now?: () => number;
  clipboard?: ClipboardApiLike | null;
  setTimer?: (handler: () => void, ms: number) => number;
  clearTimer?: (handle: number) => void;
  onHide?: (report: RevealHideReport) => void;
  /** Arma el temporizador de 30 s al crear la sesión (por defecto sí). */
  autoStart?: boolean;
}

/** Sesión de revelado: el valor solo se lee mientras está visible. */
export interface RevealSession {
  readonly kind: SecretKind;
  /** Dirección de origen del valor (etiqueta de presentación); `null` en el mnemonic. */
  readonly account: string | null;
  readonly revealedAt: number;
  readonly hideAt: number;
  readonly hideAfterMs: number;
  /** ¿Sigue visible el valor? */
  isVisible(): boolean;
  /** Valor en claro **solo** mientras está visible; `null` tras el ocultado. */
  read(): string | null;
  /** Copia el valor (acción explícita del usuario, P-20). */
  copy(): Promise<boolean>;
  /** Oculta el valor: cancela el temporizador, borra el portapapeles y descarta el estado. */
  hide(reason: HideReason): Promise<RevealHideReport | null>;
  /** Atajo del disparador de pérdida de foco (`blur` / `visibilitychange`). */
  hideOnFocusLoss(): Promise<RevealHideReport | null>;
  /** Cancela el temporizador y descarta el valor SIN tocar el portapapeles (desmontaje). */
  dispose(): void;
}

/**
 * Crea la sesión de revelado de un secreto ya resuelto. Implementa los **dos disparadores** del
 * ocultado (temporizador de `REVEAL_HIDE_MS` y pérdida de foco), el descarte del valor de la
 * memoria y el borrado del portapapeles. Es idempotente: el primer disparador gana y los
 * siguientes son un no-op (`null`).
 */
export const createRevealSession = (
  secret: RevealSessionSeed,
  deps: RevealSessionDeps = {},
): RevealSession => {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((handler: () => void, ms: number) => setTimeout(handler, ms) as unknown as number);
  const clearTimer = deps.clearTimer ?? ((handle: number) => clearTimeout(handle));

  // El valor vive en esta clausura y se anula al ocultar: no queda copia en el estado de la UI.
  let value: string | null = secret.value;
  let visible = true;
  let copied = false;
  let timer: number | null = null;

  const session: RevealSession = {
    kind: secret.kind,
    account: secret.account,
    revealedAt: secret.revealedAt,
    hideAt: secret.hideAt,
    hideAfterMs: secret.hideAfterMs,
    isVisible: () => visible,
    read: () => (visible ? value : null),
    async copy(): Promise<boolean> {
      if (!visible || value === null) {
        return false;
      }
      const clipboard = deps.clipboard === undefined ? currentClipboard() : deps.clipboard;
      if (clipboard === null) {
        return false;
      }
      try {
        await clipboard.writeText(value);
        copied = true;
        return true;
      } catch {
        return false;
      }
    },
    async hide(reason: HideReason): Promise<RevealHideReport | null> {
      if (!visible) {
        return null;
      }
      // 1. Ocultar y descartar el estado ANTES de tocar el portapapeles (la comparación usa la
      //    copia local de la clausura, que es la última que existe).
      visible = false;
      const revealed = value;
      value = null;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      // 2. Política de portapapeles (P-20): solo se borra si aún contiene el valor revelado.
      const clipboard = deps.clipboard === undefined ? currentClipboard() : deps.clipboard;
      const cleared: ClipboardClearReport =
        revealed === null || !CLIPBOARD_POLICY_ENABLED
          ? { outcome: 'not-present', warn: false }
          : await clearClipboardIfContains(revealed, clipboard);
      const wasCopied = copied;
      copied = false;
      const report: RevealHideReport = {
        reason,
        hiddenAt: now(),
        clipboard: cleared.outcome,
        clipboardWarn: cleared.warn,
        wasCopied,
      };
      deps.onHide?.(report);
      return report;
    },
    hideOnFocusLoss: () => session.hide('focus-loss'),
    dispose(): void {
      visible = false;
      value = null;
      copied = false;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };

  if (deps.autoStart !== false) {
    timer = setTimer(() => {
      void session.hide('timer');
    }, secret.hideAfterMs);
  }
  return session;
};
