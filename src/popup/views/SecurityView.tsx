/**
 * M46 — `src/popup/views/SecurityView.tsx`
 * Pestaña «Seguridad»: revelado/exportación del material de recuperación (RF-50) y reset
 * destructivo de la cartera (RF-11, parte 1).
 *
 * HIGIENE DEL REVELADO (documento_tecnico.md §3.8, RF-50 / P-20 / DEC-37). Es el punto más
 * delicado de H2 y estas son las reglas que implementa, una por una:
 *
 * 1. **Aceptación previa y explícita**: sin aceptar el diálogo no se pide nada al SW; el
 *    valor no existe todavía en el popup.
 * 2. **Oculto por defecto**: el valor solo vive en el estado de React mientras `visible` es
 *    `true`. El nodo del DOM no existe cuando está oculto (no se oculta con CSS).
 * 3. **Plazo único de 30 s** (`REVEAL_HIDE_MS`, leído de `shared/constants`): cuenta atrás en
 *    mono con **barra de progreso** que se vacía y botón «Ocultar ahora».
 * 4. **Doble disparador**: temporizador **o** pérdida de foco (`window.blur` y
 *    `visibilitychange` con `document.hidden`). Recuperar el foco NO vuelve a mostrarlo.
 * 5. **Descarte al ocultar**: el valor se pone a `null` en el estado y se anulan temporizador
 *    y escuchas. Si el portapapeles **sigue conteniendo** el valor, se **sobrescribe con cadena
 *    vacía** (`navigator.clipboard.readText()` y `writeText('')`); nunca se borra a ciegas.
 * 6. **Nunca por `window.postMessage`**: el canal es la función de mensajería del runtime y el valor no
 *    se registra en ningún log.
 * 7. **Aviso de captura** durante el revelado.
 *
 * RESET DESTRUCTIVO (documento_tecnico.md §3.9, RF-11 / DEC-46):
 * el orden estricto de guardas —cola `pending` vacía → sin transacción en vuelo → confirmación
 * destructiva → limpieza— lo aplica el **Service Worker** dentro de `wallet_resetWallet`: el
 * popup no lee el almacén (RNF-14). Aquí solo se muestra el diálogo que **enumera las cuentas
 * importadas que se pierden**, se aporta la confirmación explícita y se avisa de que
 * `truekeate_logs` **se conserva** (RF-32). Si una guarda bloquea el reset, el SW responde
 * `-32000` con el literal de «Reset bloqueado» de §4.3 y su número de solicitudes pendientes.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { DialogoDecision } from '../components/DialogoDecision';
import { StatusMessage } from '../components/StatusMessage';
import { REVEAL_HIDE_MS } from '../../shared/constants';
import { probeResetGuards, resetWallet, type AccountRow } from '../walletState';
import { popupErrorOf, type PopupError } from '../popupErrors';
import { callInternal } from '../walletRpc';

/** Qué se revela. */
type SecretKind = 'mnemonic' | 'privateKey';

/** Motivo por el que se ha ocultado el valor (para el aviso de la UI). */
type HideReason = 'timer' | 'blur' | 'manual';

/** Confirmación visible del reset (CU-30 paso 6). */
export const RESET_SUCCESS_MESSAGE =
  'Cartera reseteada: se han eliminado las cuentas, la frase y las sesiones. El registro de actividad se conserva.';

/** Valor revelado, con su ancla temporal. */
interface RevealedSecret {
  kind: SecretKind;
  /** Cuenta de la que procede la clave privada; `null` para la frase semilla. */
  account: string | null;
  /** Valor en claro: SOLO existe en memoria mientras está visible. */
  value: string;
  /** Epoch ms del revelado, ancla de la cuenta atrás. */
  revealedAt: number;
  /** `true` cuando ya se ha copiado al portapapeles al menos una vez. */
  volcado: boolean;
}

/** Props de la vista de seguridad. */
export interface SecurityViewProps {
  /** Cuentas de la cartera (las importadas son las que se pierden en el reset). */
  accounts: readonly AccountRow[];
  /** ¿Hay frase semilla guardada? */
  mnemonicPresent: boolean;
  /** Recarga el estado tras el reset. */
  onChanged: () => Promise<void>;
  /**
   * Confirmación del reset con éxito. La entrega el contenedor (`App`) porque el reset deja la
   * cartera vacía y esta vista se desmonta al volver al formulario inicial (CU-30 paso 6): el
   * aviso tiene que sobrevivir en una superficie que siga montada.
   */
  onResetDone: (message: string) => void;
}

/** Contenido del portapapeles, o `null` si no se pudo leer. */
const readClipboard = async (): Promise<string | null> => {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
};

/** Sobrescribe el portapapeles con una cadena vacía. */
const clearClipboard = async (): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText('');
    return true;
  } catch {
    return false;
  }
};

/**
 * Huella SHA-256 (hex) de un texto, o `null` si el digest no está disponible.
 *
 * Es el mecanismo que `diccionario_datos.md` §3.10 prescribe (`clipboardHash`): permite
 * comprobar MÁS TARDE si el portapapeles sigue conteniendo el valor revelado **sin** conservar
 * el valor en memoria (regla 4 de §3.8) y **sin** borrar a ciegas el portapapeles del usuario
 * (regla 5 de §3.8 / P-20): solo se sobrescribe si el contenido COINCIDE con la huella.
 */
const hashText = async (text: string): Promise<string | null> => {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
};

/** Vista de seguridad del popup. */
export function SecurityView({
  accounts,
  mnemonicPresent,
  onChanged,
  onResetDone,
}: SecurityViewProps): JSX.Element {
  const [revelandoTipo, setRevelandoTipo] = useState<SecretKind | null>(null);
  const [cuentaARevelar, setCuentaARevelar] = useState<AccountRow | null>(null);
  const [secret, setSecret] = useState<RevealedSecret | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hideNotice, setHideNotice] = useState<string | null>(null);
  const [error, setError] = useState<PopupError | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const secretRef = useRef<RevealedSecret | null>(null);
  secretRef.current = secret;

  /**
   * Huella del valor copiado que quedó PENDIENTE de borrar del portapapeles. Solo se rellena
   * cuando el ocultado ocurre sin foco (Chrome rechaza leer y escribir el portapapeles con el
   * documento sin foco: `NotAllowedError: Document is not focused`), y se resuelve en cuanto la
   * ventana recupera el foco. Nunca contiene el valor revelado, solo su SHA-256.
   */
  const pendingClipboardRef = useRef<string | null>(null);

  const importedAccounts = accounts.filter((account) => account.kind === 'imported');

  /**
   * Oculta el valor: descarta el secreto del estado (y del DOM), borra el portapapeles si aún lo
   * contiene y deja el aviso correspondiente.
   */
  const hideSecret = useCallback(async (reason: HideReason): Promise<void> => {
    const current = secretRef.current;
    if (current === null) {
      return;
    }
    // El valor se lee ANTES de descartarlo: hace falta para comparar con el portapapeles.
    const value = current.value;
    const wasCopied = current.volcado;
    secretRef.current = null;
    setSecret(null);
    setElapsed(0);

    let clipboardCleared = false;
    let clipboardFailed = false;
    let aplazado = false;
    if (wasCopied && value.length > 0) {
      const clipboard = await readClipboard();
      if (clipboard === null) {
        // Sin foco, Chrome RECHAZA leer y escribir el portapapeles (`Document is not focused`),
        // así que el borrado inmediato es imposible: se aplaza guardando solo la HUELLA del valor
        // (§3.10 `clipboardHash`) y se ejecuta en cuanto la ventana recupere el foco.
        const digest = await hashText(value);
        if (digest === null) {
          // Sin digest no se puede comparar después: se aplica el borrado incondicional de
          // respaldo de §3.10 regla 4 y se informa si también falla.
          clipboardFailed = !(await clearClipboard());
        } else {
          pendingClipboardRef.current = digest;
          aplazado = true;
        }
      } else if (clipboard === value) {
        clipboardCleared = await clearClipboard();
        clipboardFailed = !clipboardCleared;
      }
    }

    const reasonText =
      reason === 'timer'
        ? 'El plazo de 30 s ha terminado: el valor se ha ocultado.'
        : reason === 'blur'
          ? 'La ventana ha perdido el foco: el valor se ha ocultado.'
          : 'Has ocultado el valor.';
    setHideNotice(
      wasCopied
        ? clipboardFailed
          ? `${reasonText} No se pudo limpiar el portapapeles: revísalo y bórralo a mano.`
          : aplazado
            ? `${reasonText} El portapapeles se vaciará en cuanto la ventana recupere el foco.`
            : `${reasonText} Portapapeles vaciado.`
        : reasonText,
    );
    if (clipboardFailed) {
      // Causa canónica de §4.3 (v1.9): «fallo del portapapeles».
      setError(popupErrorOf('clipboardFailure', {}, { reason: 'clipboard-clear' }));
    }
  }, []);

  /**
   * Ejecuta el borrado aplazado del portapapeles: al recuperar el foco (o al volver a ser
   * visible) compara el contenido con la huella guardada y **solo** lo sobrescribe si COINCIDE
   * con el valor revelado (nunca se borra a ciegas lo que el usuario haya copiado entretanto).
   * Si el portapapeles ya no contiene el valor, se descarta la huella sin tocarlo.
   */
  const limpiarPortapapelesPendiente = useCallback(async (): Promise<void> => {
    const digest = pendingClipboardRef.current;
    if (digest === null) {
      return;
    }
    const actual = await readClipboard();
    if (actual === null) {
      return; // Sigue sin foco: se reintentará en el siguiente cambio de foco.
    }
    pendingClipboardRef.current = null;
    if (actual.length === 0 || (await hashText(actual)) !== digest) {
      return;
    }
    if (await clearClipboard()) {
      setHideNotice('Portapapeles vaciado al recuperar el foco.');
      return;
    }
    setError(popupErrorOf('clipboardFailure', {}, { reason: 'clipboard-clear-deferred' }));
  }, []);

  // Cambio de foco/visibilidad: resuelve el borrado aplazado del portapapeles (D-H2-J).
  useEffect(() => {
    const onFocus = (): void => {
      void limpiarPortapapelesPendiente();
    };
    const onVisibility = (): void => {
      if (!document.hidden) {
        onFocus();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [limpiarPortapapelesPendiente]);

  // Cuenta atrás del revelado: relee el tiempo transcurrido y oculta al llegar al plazo.
  useEffect(() => {
    if (secret === null) {
      return;
    }
    const tick = (): void => {
      const current = secretRef.current;
      if (current === null) {
        return;
      }
      const difference = Date.now() - current.revealedAt;
      setElapsed(difference);
      if (difference >= REVEAL_HIDE_MS) {
        void hideSecret('timer');
      }
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => {
      window.clearInterval(interval);
    };
  }, [secret, hideSecret]);

  // Pérdida de foco: `blur` de la ventana y `visibilitychange` hacia oculto (doble disparador).
  useEffect(() => {
    if (secret === null) {
      return;
    }
    const onBlur = (): void => {
      void hideSecret('blur');
    };
    const onVisibility = (): void => {
      if (document.hidden) {
        void hideSecret('blur');
      }
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [secret, hideSecret]);

  // Cierre de la vista con el valor revelado: se descarta sin dejar rastro.
  useEffect(
    () => () => {
      secretRef.current = null;
    },
    [],
  );

  /**
   * Pide el secreto al SW tras la aceptación previa y explícita.
   *
   * `confirmed: true` es la confirmación EXPLÍCITA del usuario que exige RF-50 (D-H2-C): esta
   * función solo se invoca desde `DialogoDecision.onAfirmar`, es decir, después de que el usuario
   * haya aceptado el diálogo. Sin ese campo, M12 (`secrets.ts`) y el catálogo (`catalog.ts`)
   * responden `4001` «no confirmado» y el revelado no llega a producirse nunca.
   */
  const reveal = async (kind: SecretKind, account: AccountRow | null): Promise<void> => {
    setBusy(true);
    setError(null);
    setHideNotice(null);
    const params =
      kind === 'mnemonic'
        ? [{ kind, confirmed: true }]
        : [{ kind, accountRef: account?.ref ?? null, confirmed: true }];
    const response = await callInternal<{ kind: SecretKind; value: string; hideAfterMs: number }>(
      'wallet_revealSecret',
      params,
    );
    setBusy(false);
    setRevelandoTipo(null);
    setCuentaARevelar(null);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    const value = response.result.value;
    if (typeof value !== 'string' || value.length === 0) {
      setError(popupErrorOf('internalError', {}, { reason: 'empty-secret' }));
      return;
    }
    const revealed: RevealedSecret = {
      kind,
      account: account?.address ?? null,
      value,
      revealedAt: Date.now(),
      volcado: false,
    };
    secretRef.current = revealed;
    setSecret(revealed);
    setElapsed(0);
  };

  /** Copia el valor revelado (permitido por P-20 mientras está visible). */
  const volcarSecreto = async (): Promise<void> => {
    const current = secretRef.current;
    if (current === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(current.value);
      const volcado = { ...current, volcado: true };
      secretRef.current = volcado;
      setSecret(volcado);
    } catch {
      // Causa canónica de §4.3 (v1.9): «fallo del portapapeles».
      setError(popupErrorOf('clipboardFailure', {}, { reason: 'clipboard-write' }));
    }
  };

  /**
   * Abre el diálogo de reset SOLO si las guardas de estado lo permiten.
   *
   * CU-30 fija el orden: al pulsar «Reset wallet» el SW comprueba primero la cola
   * `truekeate_pending_requests` y la transacción en vuelo (`truekeate_inflight_tx`); con alguna
   * guarda activa el reset se bloquea con `-32000`, la UI lo explica con el número exacto de
   * pendientes y **no se abre** el diálogo destructivo. El popup no puede leer el almacén
   * (RNF-14), así que la consulta la responde el SW con `wallet_resetWallet { confirm: false }`
   * (`probeResetGuards`); las guardas en verde se traducen en `4001` cancelado sin tocar nada.
   */
  const requestReset = async (): Promise<void> => {
    setError(null);
    setResetBusy(true);
    const blocked = await probeResetGuards();
    setResetBusy(false);
    if (blocked !== null) {
      setError(blocked);
      return;
    }
    setResetOpen(true);
  };

  const ejecutarReset = async (): Promise<void> => {
    setResetBusy(true);
    setError(null);
    const result = await resetWallet();
    setResetBusy(false);
    setResetOpen(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // El aviso se entrega al contenedor ANTES de recargar: el reset deja la cartera vacía y esta
    // vista se desmonta al volver al formulario inicial (CU-30 paso 6).
    onResetDone(RESET_SUCCESS_MESSAGE);
    await onChanged();
  };

  const remaining = secret === null ? 0 : Math.max(0, REVEAL_HIDE_MS - elapsed);
  const remainingSeconds = Math.ceil(remaining / 1000);
  const progress = secret === null ? 0 : Math.max(0, Math.min(1, remaining / REVEAL_HIDE_MS));

  return (
    <div className="tk-view">
      <StatusMessage error={error} />
      <StatusMessage message={hideNotice} />

      <section className="tk-section" aria-labelledby="seguridad-revelar">
        <h3 className="tk-section__title" id="seguridad-revelar">
          Material de recuperación
        </h3>
        <p className="tk-note">
          Guarda la frase y las claves privadas en un lugar seguro y sin conexión. El valor se
          muestra 30 segundos y se oculta también si la ventana pierde el foco.
        </p>

        {secret === null ? (
          <div className="tk-actions-row">
            <button
              type="button"
              className="tk-btn-secondary"
              onClick={() => {
                setRevelandoTipo('mnemonic');
              }}
              disabled={!mnemonicPresent}
            >
              Revelar frase semilla
            </button>
          </div>
        ) : null}

        {secret !== null ? (
          <div className="tk-reveal">
            <p className="tk-reveal__warning">
              Cuidado: cualquiera que vea este valor puede vaciar la cartera. Evita capturas de
              pantalla o grabaciones mientras esté visible.
            </p>
            {secret.kind === 'mnemonic' ? (
              <p className="tk-reveal__value tk-mono">{secret.value}</p>
            ) : (
              <p className="tk-reveal__value tk-mono">{secret.value}</p>
            )}

            <div className="tk-reveal__bar">
              <div className="tk-progress" role="presentation">
                <div className="tk-progress__fill" style={{ transform: `scaleX(${progress})` }} />
              </div>
              <span className="tk-reveal__countdown tk-mono" role="status">
                {remainingSeconds} s
              </span>
            </div>

            <div className="tk-actions-row">
              <button type="button" className="tk-btn-ghost" onClick={() => void volcarSecreto()}>
                Copiar
              </button>
              <button
                type="button"
                className="tk-btn-secondary"
                onClick={() => void hideSecret('manual')}
              >
                Ocultar ahora
              </button>
            </div>
            <p className="tk-note">La frase se borrará del portapapeles al ocultarse.</p>
          </div>
        ) : null}

        <div className="tk-actions-row">
          {accounts
            .filter((account) => account.kind === 'imported' && account.visible)
            .map((account) => (
              <button
                key={account.ref}
                type="button"
                className="tk-btn-secondary tk-btn-small"
                onClick={() => {
                  setRevelandoTipo('privateKey');
                  setCuentaARevelar(account);
                }}
                disabled={secret !== null}
              >
                Exportar clave de {account.label}
              </button>
            ))}
        </div>
      </section>

      <section className="tk-section" aria-labelledby="seguridad-reset">
        <h3 className="tk-section__title" id="seguridad-reset">
          Reset de la cartera
        </h3>
        <p className="tk-note">
          Elimina la frase, las cuentas y las sesiones de dApps. El registro de actividad se
          conserva.
        </p>
        <button
          type="button"
          className="tk-btn-danger"
          onClick={() => {
            void requestReset();
          }}
          disabled={resetBusy}
        >
          Reset wallet
        </button>
      </section>

      {revelandoTipo !== null ? (
        <DialogoDecision
          title={revelandoTipo === 'mnemonic' ? 'Revelar frase semilla' : 'Exportar clave privada'}
          etiquetaAfirmar="Acepto"
          etiquetaAnular="Volver"
          busy={busy}
          onAnular={() => {
            setRevelandoTipo(null);
            setCuentaARevelar(null);
          }}
          onAfirmar={() => {
            void reveal(revelandoTipo, revelandoTipo === 'privateKey' ? cuentaARevelar : null);
          }}
        >
          <p>
            Vas a mostrar {revelandoTipo === 'mnemonic' ? 'TU FRASE SEMILLA completa' : 'la clave privada de una cuenta'}.
            Cualquiera que la vea puede hacerse con el control de los fondos. Nadie de TrueKeate te
            la pedirá nunca.
          </p>
          <p className="tk-note">
            El valor se mostrará 30 segundos, se ocultará si la ventana pierde el foco y se
            descartará de la memoria del popup al ocultarse.
          </p>
        </DialogoDecision>
      ) : null}

      {resetOpen ? (
        <DialogoDecision
          title="Reset wallet"
          etiquetaAfirmar="Resetear cartera"
          etiquetaAnular="Volver"
          destructive
          busy={resetBusy}
          onAnular={() => {
            setResetOpen(false);
          }}
          onAfirmar={() => {
            void ejecutarReset();
          }}
        >
          <p>Se eliminarán la frase de recuperación, las cuentas derivadas y las sesiones de dApps.</p>
          {importedAccounts.length > 0 ? (
            <>
              <p>Estas cuentas importadas se perderán y no se pueden volver a derivar:</p>
              <ul className="tk-list" role="list">
                {importedAccounts.map((account) => (
                  <li key={account.ref} className="tk-list__item">
                    <span>{account.label}</span>
                    <code className="tk-mono">{account.address}</code>
                  </li>
                ))}
              </ul>
              <p className="tk-note">
                Si no has exportado su clave privada, guárdala antes de continuar.
              </p>
            </>
          ) : (
            <p className="tk-note">No hay cuentas importadas: solo se perderá la cartera derivada.</p>
          )}
          <p className="tk-note">El registro de actividad (`truekeate_logs`) se conserva.</p>
        </DialogoDecision>
      ) : null}
    </div>
  );
}
