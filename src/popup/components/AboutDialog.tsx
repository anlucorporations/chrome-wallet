/**
 * M39/M50 (soporte) — `src/popup/components/AboutDialog.tsx`
 * Pantalla **«Acerca de»** compartida por el popup y la ventana única de confirmación (RNF-23,
 * tarea 6.3 del plan §3.6.5; `identidad_visual.md` §5.1 y §8).
 *
 * QUÉ MUESTRA Y POR QUÉ
 * ---------------------
 * - El **logotipo horizontal** (`brand/truekeate-titulo.png`): el wordmark NUNCA se retipea con una
 *   fuente del sistema (regla de oro de `identidad_visual.md` §1.1).
 * - La **tagline exacta** `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS` (§8 de la identidad).
 * - El **aviso de entorno** de RNF-23, el mismo del primer arranque, para que siga visible.
 * - Las **licencias** de los activos empaquetados y la referencia al `NOTICE`.
 *
 * REGLAS DE USO DE LA MARCA (§5.3): el logotipo va sobre `--tk-surface-raised`, nunca sobre el
 * degradado, y su ancho respeta el área de respeto (`--tk-brand-logo-width`).
 *
 * El diálogo es **modal y descartable**: se cierra con el botón, con `Escape` y pulsando el fondo;
 * a diferencia del aviso del primer arranque, su contenido es informativo y no bloquea ninguna
 * operación de cartera. `role="dialog"` + `aria-modal` + foco inicial en el botón de cierre lo
 * hacen navegable solo con teclado (RNF-21).
 */

import { useEffect, type JSX } from 'react';
import {
  ACERCA_DE_AVISO,
  ACERCA_DE_RESUMEN,
  ACERCA_DE_TITULO,
  ACERCA_DE_VERSION,
  LICENCIAS_NOTAS,
  LICENCIAS_TITULO,
  TAGLINE_MARCA,
} from '../../shared/i18n';

/** Ruta pública del logotipo horizontal (`public/brand/truekeate-titulo.png`). */
export const TITULO_SRC = 'brand/truekeate-titulo.png';

/** Etiqueta del botón que cierra el diálogo. */
export const ACERCA_DE_CERRAR = 'Cerrar';

/** Props del diálogo «Acerca de». */
export interface AboutDialogProps {
  /** Cierra el diálogo (botón, `Escape` o clic en el fondo). */
  onClose: () => void;
}

/**
 * Diálogo «Acerca de». Es presentacional: el estado de apertura lo posee cada superficie, porque el
 * popup y la ventana de confirmación tienen cabeceras distintas.
 */
export function AboutDialog({ onClose }: AboutDialogProps): JSX.Element {
  /** `Escape` cierra el diálogo informativo (RNF-21: navegación por teclado completa). */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="tk-overlay"
      /*
       * El fondo cierra el diálogo SOLO si la pulsación empieza y termina en él (`target` es el
       * propio contenedor): así un arrastre de texto que acabe fuera del diálogo no lo cierra.
       */
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="tk-dialog tk-dialog--about" role="dialog" aria-modal="true" aria-label={ACERCA_DE_TITULO}>
        <h2 className="tk-dialog__title">{ACERCA_DE_TITULO}</h2>

        <img className="tk-about__logo" src={TITULO_SRC} alt="Logotipo de TrueKeate" />
        <p className="tk-about__tagline">{TAGLINE_MARCA}</p>

        <div className="tk-dialog__body">
          <p>{ACERCA_DE_RESUMEN}</p>
          {/* El aviso de RNF-23 se repite aquí como texto normal: `role="alert"` haría que un
              lector de pantalla lo anunciara como una incidencia al abrir una pantalla informativa. */}
          <p className="tk-warning-band">{ACERCA_DE_AVISO}</p>

          <h3 className="tk-section__title">{LICENCIAS_TITULO}</h3>
          <ul className="tk-list" role="list">
            {LICENCIAS_NOTAS.map((nota) => (
              <li key={nota} className="tk-list__item">
                <span>{nota}</span>
              </li>
            ))}
          </ul>

          <p className="tk-note">{ACERCA_DE_VERSION}</p>
        </div>

        <div className="tk-dialog__actions">
          <button type="button" className="tk-btn-primary" autoFocus onClick={onClose}>
            {ACERCA_DE_CERRAR}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AboutDialog;
