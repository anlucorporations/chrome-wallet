/**
 * M39 (soporte) — `src/popup/components/StatusMessage.tsx`
 * Mensaje de estado en español con el `code` y la acción sugerida de §4.3 (RNF-06).
 *
 * Todo error que ve el usuario lleva su código numérico y la acción de la tabla: este
 * componente es el ÚNICO sitio del popup que pinta errores, para que la regla no se relaje.
 */

import type { JSX } from 'react';
import type { PopupError } from '../popupErrors';

/** Props del mensaje de estado. */
export interface StatusMessageProps {
  /** Error a mostrar con su código y su acción. */
  error?: PopupError | null;
  /** Texto informativo/éxito (sin código) cuando no hay error. */
  message?: string | null;
  /** Tono del mensaje. */
  tone?: 'info' | 'success' | 'warning';
}

/** Mensaje de estado (error tipado o texto informativo). */
export function StatusMessage({ error, message, tone = 'info' }: StatusMessageProps): JSX.Element | null {
  if (error !== undefined && error !== null) {
    return (
      <p className="tk-status tk-status--error" role="alert">
        <code className="tk-status__code">{error.code}</code>
        <span className="tk-status__message">{error.message}</span>
        <span className="tk-status__action">{error.action}</span>
      </p>
    );
  }
  if (message === undefined || message === null || message.length === 0) {
    return null;
  }
  return (
    <p className={`tk-status tk-status--${tone}`} role="status">
      <span className="tk-status__message">{message}</span>
    </p>
  );
}
