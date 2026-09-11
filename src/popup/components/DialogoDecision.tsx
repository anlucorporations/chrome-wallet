/**
 * M39 (soporte) — `src/popup/components/DialogoDecision.tsx`
 * Diálogo de decisión **previa y explícita** sobre una capa modal.
 *
 * Lo usan dos flujos con requisito propio:
 * - **Revelado/exportación** (RF-50): sin esta aceptación previa y explícita no se pide ningún secreto al SW y el
 *   valor permanece oculto; la capa modal bloquea el fondo y el foco entra en el diálogo.
 * - **Reset destructivo** (RF-11, DEC-46): enumera lo que se pierde antes de permitir continuar.
 *
 * Teclado (RNF-21): `Escape` cierra el diálogo sin aceptar, el foco se mueve al primer botón al abrirse y el foco
 * vuelve al elemento que lo abrió al cerrarse. El diálogo se anuncia con `role="dialog"` y
 * `aria-modal`.
 */

import { useEffect, useRef, type JSX, type ReactNode } from 'react';

/** Props del diálogo de decisión. */
export interface DialogoDecisionProps {
  /** Título visible y etiqueta accesible del diálogo. */
  title: string;
  /** Cuerpo: advertencia y, si procede, la enumeración de lo que se pierde. */
  children: ReactNode;
  /** Etiqueta del botón que acepta la acción. */
  etiquetaAfirmar: string;
  /** Etiqueta del botón que la anula. */
  etiquetaAnular: string;
  /** Acción afirmada. */
  onAfirmar: () => void;
  /** Cierre sin aceptar. */
  onAnular: () => void;
  /** `true` para el diálogo destructivo (botón de peligro). */
  destructive?: boolean;
  /** `true` mientras la operación está en curso: bloquea los dos botones. */
  busy?: boolean;
}

/** Diálogo modal de decisión previa y explícita. */
export function DialogoDecision({
  title,
  children,
  etiquetaAfirmar,
  etiquetaAnular,
  onAfirmar,
  onAnular,
  destructive = false,
  busy = false,
}: DialogoDecisionProps): JSX.Element {
  const afirmarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    afirmarRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onAnular();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onAnular]);

  return (
    <div className="tk-overlay" role="presentation">
      <div className="tk-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="tk-dialog__title">{title}</h2>
        <div className="tk-dialog__body">{children}</div>
        <div className="tk-dialog__actions">
          <button type="button" className="tk-btn-secondary" onClick={onAnular} disabled={busy}>
            {etiquetaAnular}
          </button>
          <button
            ref={afirmarRef}
            type="button"
            className={destructive ? 'tk-btn-danger' : 'tk-btn-primary'}
            onClick={onAfirmar}
            disabled={busy}
          >
            {etiquetaAfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
