/**
 * M40 — `src/popup/views/AccountsView.tsx`
 * Pestaña «Cuentas»: lista, cuenta activa, añadir, importar (frase o clave privada), renombrar,
 * ocultar y eliminar.
 *
 * Tareas que cubre: 2.3 (flujo sin contraseña), 2.6 (etiquetas y visibilidad), 2.14 (validación
 * inline de los formularios de frase y clave privada). Requisitos: RF-01, RF-02, RF-03, RF-04,
 * RF-05, RF-06 (Should), RF-33 y RNF-23.
 *
 * Reglas que respeta:
 * - **Ninguna contraseña** (P-03): no hay ningún campo de contraseña ni se pide cifrado;
 *   `settings.encryptionEnabled` es siempre `false` (RE-02).
 * - **Cero criptografía**: crear, importar y derivar son métodos internos del SW (§5.1.1).
 * - **Validación inline antes de enviar** (RF-33) y mensaje con su `code` y su acción (§4.3).
 * - Toda la UI en español (RF-34) y con etiquetas accesibles (RNF-21).
 */

import { useState, type JSX } from 'react';
import { AccountCard } from '../components/AccountCard';
import { DialogoDecision } from '../components/DialogoDecision';
import { Field } from '../components/Field';
import { StatusMessage } from '../components/StatusMessage';
import type { PopupError } from '../popupErrors';
import { popupErrorOf } from '../popupErrors';
import {
  createWallet,
  deriveNextAccount,
  importMnemonic,
  importPrivateKey,
  removeImportedAccount,
  renameAccount,
  setAccountVisibility,
  setCurrentAccount,
  type AccountRow,
} from '../walletState';
import { normalizeMnemonicInput, validateLabel, validateMnemonic, validatePrivateKey } from '../validation';

/** Formulario abierto en la pestaña (uno cada vez). */
type OpenForm = 'none' | 'import-mnemonic' | 'import-key';

/** Props de la vista de cuentas. */
export interface AccountsViewProps {
  /** Cuentas a pintar (incluidas las ocultas). */
  accounts: readonly AccountRow[];
  /** Cuenta activa. */
  currentAccount: string | null;
  /** Recarga el estado tras una operación con éxito. */
  onChanged: () => Promise<void>;
  /** Informa de que la cartera dejó de existir (reset desde otra vista). */
  onWalletGone: () => void;
}

/** Vista de cuentas del popup. */
export function AccountsView({
  accounts,
  currentAccount,
  onChanged,
  onWalletGone,
}: AccountsViewProps): JSX.Element {
  const [form, setForm] = useState<OpenForm>('none');
  const [mnemonicDraft, setMnemonicDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [renamingRef, setRenamingRef] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [removing, setRemoving] = useState<AccountRow | null>(null);
  const [error, setError] = useState<PopupError | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mnemonicValidation = mnemonicDraft.length > 0 ? validateMnemonic(mnemonicDraft) : null;
  const keyValidation = keyDraft.length > 0 ? validatePrivateKey(keyDraft) : null;
  const labelValidation = renameDraft.length > 0 ? validateLabel(renameDraft) : null;

  const visibleAccounts = showHidden ? accounts : accounts.filter((account) => account.visible);
  const hiddenCount = accounts.filter((account) => !account.visible).length;

  /** Ejecuta una operación y recarga el estado; concentra el manejo de errores. */
  const run = async (operation: () => Promise<{ ok: boolean; error?: PopupError }>, success: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const result = await operation();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? popupErrorOf('internalError'));
      return false;
    }
    await onChanged();
    setStatus(success);
    return true;
  };

  const handleCreate = async (): Promise<void> => {
    const done = await run(createWallet, 'Cartera creada: revisa «Seguridad» para guardar tu frase.');
    if (done) {
      setForm('none');
    }
  };

  const handleImportMnemonic = async (): Promise<void> => {
    if (mnemonicValidation !== null && !mnemonicValidation.valid) {
      setError(mnemonicValidation.issue);
      return;
    }
    const done = await run(
      () => importMnemonic(normalizeMnemonicInput(mnemonicDraft)),
      'Cartera importada desde la frase de recuperación.',
    );
    if (done) {
      setForm('none');
      setMnemonicDraft('');
    }
  };

  const handleImportKey = async (): Promise<void> => {
    if (keyValidation !== null && !keyValidation.valid) {
      setError(keyValidation.issue);
      return;
    }
    const done = await run(
      () => importPrivateKey(keyDraft.trim(), labelDraft.trim()),
      'Cuenta importada con su clave privada.',
    );
    if (done) {
      setForm('none');
      setKeyDraft('');
      setLabelDraft('');
    }
  };

  const handleDerive = async (): Promise<void> => {
    await run(deriveNextAccount, 'Cuenta derivada y añadida a la lista.');
  };

  const handleSelect = async (account: AccountRow): Promise<void> => {
    await run(() => setCurrentAccount(account.ref), `Cuenta activa: ${account.label}.`);
  };

  const handleRename = async (account: AccountRow): Promise<void> => {
    if (labelValidation !== null && !labelValidation.valid) {
      setError(labelValidation.issue);
      return;
    }
    const done = await run(
      () => renameAccount(account, renameDraft.trim()),
      'Etiqueta actualizada.',
    );
    if (done) {
      setRenamingRef(null);
      setRenameDraft('');
    }
  };

  const handleVisibility = async (account: AccountRow): Promise<void> => {
    await run(
      () => setAccountVisibility(account, !account.visible),
      account.visible ? 'Cuenta ocultada.' : 'Cuenta visible de nuevo.',
    );
  };

  const handleRemove = async (): Promise<void> => {
    if (removing === null) {
      return;
    }
    const target = removing;
    setRemoving(null);
    const done = await run(
      () => removeImportedAccount(target),
      'Cuenta importada eliminada.',
    );
    if (done && target.ref === currentAccount) {
      onWalletGone();
    }
  };

  return (
    <div className="tk-view">
      <StatusMessage error={error} />
      <StatusMessage message={status} tone="success" />

      <section className="tk-section" aria-labelledby="cuentas-acciones">
        <h3 className="tk-section__title" id="cuentas-acciones">
          Cartera
        </h3>
        <div className="tk-actions-row">
          <button type="button" className="tk-btn-primary" onClick={handleCreate} disabled={busy}>
            Crear cartera nueva
          </button>
          <button
            type="button"
            className="tk-btn-secondary"
            onClick={() => {
              setForm(form === 'import-mnemonic' ? 'none' : 'import-mnemonic');
              setError(null);
            }}
          >
            Importar frase
          </button>
        </div>
        <p className="tk-note">
          Sin contraseña: la cartera queda operativa al crearla o importarla (entorno de
          desarrollo, no usar con fondos reales).
        </p>

        {form === 'import-mnemonic' ? (
          <form
            className="tk-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleImportMnemonic();
            }}
          >
            <Field
              id="import-mnemonic"
              label="Frase de recuperación de 12 palabras"
              value={mnemonicDraft}
              onChange={setMnemonicDraft}
              multiline
              rows={3}
              mono
              hint="Separa las palabras con espacios; da igual el uso de mayúsculas."
              error={mnemonicDraft.length > 0 ? mnemonicValidation?.issue ?? null : null}
            />
            <button type="submit" className="tk-btn-primary" disabled={busy}>
              Importar frase
            </button>
          </form>
        ) : null}
      </section>

      <section className="tk-section" aria-labelledby="cuentas-lista">
        <div className="tk-section__head">
          <h3 className="tk-section__title" id="cuentas-lista">
            Cuentas
          </h3>
          <span className="tk-badge">{visibleAccounts.length}</span>
        </div>

        {hiddenCount > 0 ? (
          <label className="tk-check" htmlFor="ver-ocultas">
            <input
              id="ver-ocultas"
              type="checkbox"
              checked={showHidden}
              onChange={(event) => {
                setShowHidden(event.target.checked);
              }}
            />
            Mostrar también las ocultas ({hiddenCount})
          </label>
        ) : null}

        <ul className="tk-accounts" role="list">
          {visibleAccounts.map((account) => (
            <AccountCard
              key={account.ref}
              account={account}
              active={account.ref === currentAccount}
              balance={null}
              onSelect={() => {
                void handleSelect(account);
              }}
              onRename={() => {
                setRenamingRef(account.ref);
                setRenameDraft(account.label);
                setError(null);
              }}
              onToggleVisibility={() => {
                void handleVisibility(account);
              }}
              onRemove={
                account.kind === 'imported'
                  ? () => {
                      setRemoving(account);
                    }
                  : null
              }
            />
          ))}
        </ul>

        {renamingRef !== null ? (
          <form
            className="tk-form"
            onSubmit={(event) => {
              event.preventDefault();
              const target = accounts.find((account) => account.ref === renamingRef);
              if (target !== undefined) {
                void handleRename(target);
              }
            }}
          >
            <Field
              id="renombrar"
              label="Nueva etiqueta (1 a 32 caracteres)"
              value={renameDraft}
              onChange={setRenameDraft}
              error={renameDraft.length > 0 ? labelValidation?.issue ?? null : null}
            />
            <div className="tk-actions-row">
              <button type="submit" className="tk-btn-primary" disabled={busy}>
                Guardar etiqueta
              </button>
              <button
                type="button"
                className="tk-btn-secondary"
                onClick={() => {
                  setRenamingRef(null);
                }}
              >
                Volver
              </button>
            </div>
          </form>
        ) : null}

        <div className="tk-actions-row">
          <button type="button" className="tk-btn-secondary" onClick={handleDerive} disabled={busy}>
            Añadir cuenta
          </button>
          <button
            type="button"
            className="tk-btn-secondary"
            onClick={() => {
              setForm(form === 'import-key' ? 'none' : 'import-key');
              setError(null);
            }}
          >
            Importar clave privada
          </button>
        </div>

        {form === 'import-key' ? (
          <form
            className="tk-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleImportKey();
            }}
          >
            <Field
              id="import-clave"
              label="Clave privada (0x + 64 hex)"
              value={keyDraft}
              onChange={setKeyDraft}
              mono
              hint="La cuenta se añade marcada como importada y con etiqueta renombrable."
              error={keyDraft.length > 0 ? keyValidation?.issue ?? null : null}
            />
            <Field
              id="import-etiqueta"
              label="Etiqueta (opcional, máximo 32 caracteres)"
              value={labelDraft}
              onChange={setLabelDraft}
            />
            <button type="submit" className="tk-btn-primary" disabled={busy}>
              Importar clave privada
            </button>
          </form>
        ) : null}
      </section>

      {removing !== null ? (
        <DialogoDecision
          title="Eliminar cuenta importada"
          etiquetaAfirmar="Eliminar"
          etiquetaAnular="Volver"
          destructive
          busy={busy}
          onAnular={() => {
            setRemoving(null);
          }}
          onAfirmar={() => {
            void handleRemove();
          }}
        >
          <p>
            Se eliminará la cuenta <strong>{removing.label}</strong> ({removing.address}) y su
            clave privada. Esta acción no se puede deshacer: si no has exportado la clave, la
            cuenta se perderá para siempre.
          </p>
          <p className="tk-note">
            Las cuentas derivadas de la frase de recuperación no se eliminan: solo se ocultan.
          </p>
        </DialogoDecision>
      ) : null}
    </div>
  );
}
