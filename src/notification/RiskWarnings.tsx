/**
 * M52 — `src/notification/RiskWarnings.tsx`
 * Insignia de riesgo y avisos de la ventana única de confirmación.
 *
 * Fuentes: `plan_desarrollo.md` §3.4.5 (tareas 4.7 y 4.11), `documento_tecnico.md` §3.4 (tabla de
 * «avisos de riesgo obligatorios», DEC-23) y `identidad_visual.md` §5.2 (insignia y botón de
 * peligro).
 *
 * Reglas que implementa:
 * - Los avisos están **siempre visibles** antes de decidir y cada uno lleva `role="alert"`
 *   (RNF-21 / H-17).
 * - Un aviso `blocking` —**llamada a contrato NO reconocida** (selector fuera de la tabla local
 *   cerrada de M66), `verifyingContractMismatch` o saldo insuficiente— **impide aprobar** hasta
 *   que el usuario lo marque explícitamente: es la «firma ciega» que el hito declara invalidante
 *   (riesgo R-05 del plan).
 * - Un aviso `highlight` —allowance ilimitada, `setApprovalForAll` o destino sin etiqueta— se
 *   pinta destacado sobre el tramo oscuro del degradado y **no** bloquea.
 * - El panel es SOLO presentación: los avisos los deriva M50 (`App.tsx`) a partir del
 *   `PendingRequest` publicado en `src/shared/types.ts`. Aquí no se lee el almacén de la
 *   extensión y no se firma nada (RNF-14).
 */

import type { JSX } from 'react';

/** Gravedad del aviso: `blocking` exige marcarlo para poder aprobar. */
export type RiskSeverity = 'highlight' | 'blocking';

/** Un aviso de riesgo, ya redactado en español para pintarlo tal cual (RF-34). */
export interface RiskWarning {
  /** Identificador estable del aviso (no es texto visible). */
  id: string;
  /** `blocking` = impide aprobar sin marcarlo; `highlight` = aviso destacado. */
  severity: RiskSeverity;
  /** Titular corto del aviso. */
  title: string;
  /** Explicación para el usuario. */
  detail: string;
}

/** Props de la insignia de riesgo. */
export interface RiskBadgeProps {
  warnings: readonly RiskWarning[];
}

/**
 * Insignia de riesgo del encabezado: resume en una palabra el peor aviso presente. Es la
 * «insignia de riesgo» que la ventana debe mostrar siempre (§5.2).
 */
export function RiskBadge({ warnings }: RiskBadgeProps): JSX.Element {
  const blocking = warnings.some((warning) => warning.severity === 'blocking');
  const high = blocking || warnings.length > 0;
  const label = blocking ? 'Riesgo alto' : warnings.length > 0 ? 'Revisar antes de aprobar' : 'Sin avisos de riesgo';
  return (
    <span className={`tk-risk-badge${high ? ' tk-risk-badge--high' : ''}`} data-risk-count={warnings.length}>
      {label}
    </span>
  );
}

/** Props de la lista de avisos. */
export interface RiskWarningsProps {
  warnings: readonly RiskWarning[];
  /** Marca explícita del usuario; solo se pide si hay algún aviso `blocking`. */
  acknowledged?: boolean;
  /** Cambio de la marca explícita. */
  onAcknowledge?: (acknowledged: boolean) => void;
}

/** Etiqueta única de la marca explícita (doble confirmación de las operaciones de riesgo). */
export const RISK_ACKNOWLEDGEMENT_LABEL =
  'He revisado estos avisos y quiero aprobar la solicitud igualmente.';

/**
 * Lista de avisos de riesgo. Cuando hay algún aviso `blocking` muestra además la **marca
 * explícita** que desbloquea «Aprobar»: sin ella el botón queda deshabilitado (M50).
 */
export function RiskWarnings({
  warnings,
  acknowledged = false,
  onAcknowledge,
}: RiskWarningsProps): JSX.Element | null {
  if (warnings.length === 0) {
    return null;
  }
  const blocking = warnings.some((warning) => warning.severity === 'blocking');
  return (
    <section className="tk-risk" aria-labelledby="tk-risk-title">
      <h3 className="tk-section__title" id="tk-risk-title">
        Avisos de riesgo
      </h3>
      {warnings.map((warning) => (
        <div
          key={warning.id}
          className={`tk-risk__item tk-risk__item--${warning.severity}`}
          role="alert"
        >
          <p className="tk-risk__title">{warning.title}</p>
          <p className="tk-risk__detail">{warning.detail}</p>
        </div>
      ))}
      {blocking && onAcknowledge !== undefined ? (
        <label className="tk-check tk-risk__ack" htmlFor="tk-risk-ack">
          <input
            id="tk-risk-ack"
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => {
              onAcknowledge(event.target.checked);
            }}
          />
          <span>{RISK_ACKNOWLEDGEMENT_LABEL}</span>
        </label>
      ) : null}
    </section>
  );
}
