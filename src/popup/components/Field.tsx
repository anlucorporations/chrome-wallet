/**
 * M39 (soporte) — `src/popup/components/Field.tsx`
 * Campo de formulario con etiqueta, ayuda y **validación inline** (RF-33).
 *
 * La etiqueta es siempre visible (accesibilidad RNF-21); el mensaje de error se asocia al campo
 * con `aria-describedby` y el campo se marca con `aria-invalid` cuando la validación falla.
 */

import type { JSX, ReactNode } from 'react';
import type { PopupError } from '../popupErrors';

/** Props del campo de texto o de área de texto. */
export interface FieldProps {
  /** Identificador del control (`id` y `htmlFor`). */
  id: string;
  /** Etiqueta visible. */
  label: string;
  /** Valor actual. */
  value: string;
  /** Cambio de valor. */
  onChange: (value: string) => void;
  /** Texto de ayuda bajo el control. */
  hint?: string;
  /** Error de validación inline. */
  error?: PopupError | null;
  /** `textarea` cuando la entrada es larga (frase de recuperación). */
  multiline?: boolean;
  /** Filas del `textarea`. */
  rows?: number;
  /** Marca el contenido como sensible: se pinta en mono y sin corrección automática. */
  mono?: boolean;
  /** Deshabilita el control. */
  disabled?: boolean;
  /** Contenido a la derecha del control (botón de pegado, etc.). */
  action?: ReactNode;
}

/** Campo de formulario con validación inline. */
export function Field({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  multiline = false,
  rows = 3,
  mono = false,
  disabled = false,
  action,
}: FieldProps): JSX.Element {
  const describedBy = error !== undefined && error !== null ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined;
  const className = `tk-input${mono ? ' tk-mono' : ''}`;

  return (
    <div className="tk-field">
      <label className="tk-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="tk-field__row">
        {multiline ? (
          <textarea
            id={id}
            className={className}
            value={value}
            rows={rows}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error !== undefined && error !== null ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        ) : (
          <input
            id={id}
            className={className}
            type="text"
            value={value}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error !== undefined && error !== null ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        )}
        {action}
      </div>
      {hint !== undefined && (error === undefined || error === null) ? (
        <p className="tk-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error !== undefined && error !== null ? (
        <p className="tk-field__error" id={`${id}-error`} role="alert">
          <code className="tk-status__code">{error.code}</code>
          <span>{error.message}</span>
          <span className="tk-status__action">{error.action}</span>
        </p>
      ) : null}
    </div>
  );
}
