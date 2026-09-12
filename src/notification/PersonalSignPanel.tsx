/**
 * M54 — `src/notification/PersonalSignPanel.tsx`
 * Panel de vista previa de `personal_sign` (`CA-RF-21`).
 *
 * Fuentes: `plan_desarrollo.md` §3.4.5 (tareas 4.9 y 4.13), `documento_tecnico.md` §3.4 (tabla de
 * avisos) y §2.5.2 (`PersonalSignPreview`).
 *
 * Reglas que implementa:
 * - El contenido del mensaje se muestra como **texto UTF-8 legible y completo** (nunca en
 *   hexadecimal cuando es legible: el usuario debe leer lo que firma).
 * - Si el payload es hexadecimal **no decodificable** (`isHexPayload`), se muestra el aviso
 *   «contenido no legible» con su `byteLength`; los bytes solo se pintan en la UI —truncados— y
 *   **nunca** se copian a `truekeate_logs` (H-42 / RNF-09): este módulo no registra nada.
 * - El panel no firma y no lee el almacén de la extensión (RNF-14).
 */

import type { JSX } from 'react';
import type { PersonalSignPreview } from '../shared/types';
import { shortHex } from '../shared/format';

/** Literal del aviso de contenido no legible (aparece tal cual en la ventana). */
export const ILLEGIBLE_PAYLOAD_NOTICE = 'El contenido no es legible como texto UTF-8.';

/**
 * Aviso del texto persistido como **extracto** (ADT-21 / D-L): por encima de
 * `PREVIEW_INLINE_MAX_BYTES` la preview guarda solo el principio del mensaje.
 */
export const TRUNCATED_PAYLOAD_NOTICE =
  'El mensaje es más largo de lo que la cartera guarda en claro: lo que se muestra es un extracto.';

/** Props del panel de firma de texto. */
export interface PersonalSignPanelProps {
  preview: PersonalSignPreview;
}

/** Panel de vista previa de una firma `personal_sign`. */
export function PersonalSignPanel({ preview }: PersonalSignPanelProps): JSX.Element {
  const legible = preview.text !== null && preview.text.length > 0;
  // Campo de redacción publicado por el SW al persistir la preview; se lee de forma defensiva.
  const truncated = (preview as unknown as Record<string, unknown>).truncated === true;
  return (
    <section className="tk-section" aria-labelledby="tk-personal-title">
      <h2 className="tk-section__title" id="tk-personal-title">
        Firma de mensaje
      </h2>

      {legible ? (
        <>
          <p className="tk-note">
            Este sitio pide tu firma sobre el texto siguiente. La firma no mueve fondos, pero puede
            autorizar acciones en tu nombre: léelo antes de aprobar.
          </p>
          {truncated ? (
            <p className="tk-warning-band" role="alert">
              {TRUNCATED_PAYLOAD_NOTICE}
            </p>
          ) : null}
          <pre className="tk-message" aria-label="Mensaje que se va a firmar">
            {preview.text}
          </pre>
        </>
      ) : (
        <>
          <p className="tk-warning-band tk-warning-band--danger" role="alert">
            {ILLEGIBLE_PAYLOAD_NOTICE}
          </p>
          <dl className="tk-summary">
            <div className="tk-summary__row">
              <dt className="tk-summary__label">Longitud</dt>
              <dd className="tk-summary__value tk-mono">{`${preview.byteLength} bytes`}</dd>
            </div>
            <div className="tk-summary__row">
              <dt className="tk-summary__label">Contenido</dt>
              <dd className="tk-summary__value tk-mono" title={preview.bytesHex}>
                {shortHex(preview.bytesHex)}
              </dd>
            </div>
          </dl>
        </>
      )}

      <p className="tk-note">
        {`Longitud del mensaje: ${preview.byteLength} bytes.`}
      </p>
    </section>
  );
}
