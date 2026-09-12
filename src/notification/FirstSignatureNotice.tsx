/**
 * M50/M52 (soporte) — `src/notification/FirstSignatureNotice.tsx`
 * Aviso **antes de la primera firma** (RNF-23, tarea 6.3 del plan §3.6.5).
 *
 * QUÉ ES Y POR QUÉ BLOQUEA
 * ------------------------
 * El plan exige tres avisos in-product: el del **primer arranque** (ya existía, M39), el de
 * **«Acerca de»** y el que precede a la **primera firma**. Este módulo implementa el tercero.
 *
 * La primera firma es el momento en que la cartera demuestra que controla una clave: hasta aquí el
 * usuario podía crear o importar cuentas sin haber firmado nunca nada. El aviso explica qué se
 * firma, insiste en el entorno de desarrollo y exige un **acuse explícito** que desbloquea
 * «Aprobar»; sin él la ventana única no permite firmar. Es el mismo patrón que los avisos de riesgo
 * bloqueantes de M52 (`tk-risk__ack`), con un identificador propio (`tk-primera-firma-ack`) para
 * que el arnés E2E pueda distinguirlos.
 *
 * CÓMO SE DECIDE QUE ES LA PRIMERA VEZ
 * ------------------------------------
 * No se inventa un estado nuevo ni se lee el almacén desde la UI (RNF-14): el propio **registro de
 * actividad** (`truekeate_logs`, RF-28/RF-32) es la evidencia. Si no hay ninguna entrada de firma
 * (`sign_personal`, `sign_typed_data`, `tx_sent`), la cartera no ha firmado todavía. El registro
 * sobrevive al reset, así que el aviso no reaparece tras vaciar la cartera.
 *
 * El componente es presentacional: recibe `visible`, `acknowledged` y el cambio de la casilla.
 */

import type { JSX } from 'react';
import {
  AVISO_PRIMERA_FIRMA_ACUSE,
  AVISO_PRIMERA_FIRMA_ACUSE_ID,
  AVISO_PRIMERA_FIRMA_CUERPO,
  AVISO_PRIMERA_FIRMA_ENTORNO,
  AVISO_PRIMERA_FIRMA_TITULO,
} from '../shared/i18n';

/** Props del aviso de primera firma. */
export interface FirstSignatureNoticeProps {
  /** Marca explícita del usuario; desbloquea «Aprobar» (obligatoria la primera vez). */
  acknowledged: boolean;
  /** Cambio de la marca explícita. */
  onAcknowledge: (acknowledged: boolean) => void;
}

/**
 * Aviso de RNF-23 que precede a la PRIMERA firma. Se pinta sobre el tramo oscuro (mismo lenguaje
 * visual que los avisos de riesgo de M52) y lleva la casilla de acuse en una etiqueta real.
 */
export function FirstSignatureNotice({
  acknowledged,
  onAcknowledge,
}: FirstSignatureNoticeProps): JSX.Element {
  return (
    <section className="tk-notice-first" aria-labelledby="tk-primera-firma-titulo" data-first-signature="true">
      <div className="tk-notice-first__item">
        <h3 className="tk-notice-first__title" id="tk-primera-firma-titulo">
          {AVISO_PRIMERA_FIRMA_TITULO}
        </h3>
        <p className="tk-notice-first__detail">{AVISO_PRIMERA_FIRMA_CUERPO}</p>
        <p className="tk-notice-first__detail">{AVISO_PRIMERA_FIRMA_ENTORNO}</p>
      </div>
      <label className="tk-check tk-notice-first__ack" htmlFor={AVISO_PRIMERA_FIRMA_ACUSE_ID}>
        <input
          id={AVISO_PRIMERA_FIRMA_ACUSE_ID}
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => {
            onAcknowledge(event.target.checked);
          }}
        />
        <span>{AVISO_PRIMERA_FIRMA_ACUSE}</span>
      </label>
    </section>
  );
}

export default FirstSignatureNotice;
