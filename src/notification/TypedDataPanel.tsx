/**
 * M53 — `src/notification/TypedDataPanel.tsx`
 * Panel de vista previa de `eth_signTypedData_v4` (EIP-712).
 *
 * Fuentes: `plan_desarrollo.md` §3.4.5 (tareas 4.9 y 4.12), `documento_tecnico.md` §3.4
 * (tabla de avisos) y §2.5.2 (`TypedDataPreview`).
 *
 * Reglas que implementa (`CA-RF-20`):
 * - Se muestran **siempre** `domain.name` (nombre del dominio) y `verifyingContract` **en claro**,
 *   además del `chainId` del dominio, el `primaryType`, los `types` y el `message`.
 * - Si `domain.chainId ≠` red activa (`domainChainMismatch`) el aviso es **destacado** y exige
 *   **doble confirmación** (la marca explícita la pinta M52 y la exige M50).
 * - `verifyingContractMismatch` —dirección cero o contrato no desplegado en la red activa
 *   (redefinido en D-K/ADT-08)— también queda visible y es **bloqueante por defecto**.
 * - El panel NO firma y NO lee el almacén de la extensión (RNF-14): todo lo que pinta viene del
 *   `TypedDataPreview` que persistió y entrega el Service Worker (M19).
 */

import type { JSX } from 'react';
import type { ChainIdHex, TypedDataPreview } from '../shared/types';
import { shortHex } from '../shared/format';

/** Texto literal del aviso de dominio (lo pinta también M52 con el mismo literal). */
export const DOMAIN_CHAIN_MISMATCH_NOTICE =
  'El dominio de los datos declara una red distinta de la red activa: firma solo si confías en el sitio.';

/** Texto literal del aviso de contrato verificador. */
export const VERIFYING_CONTRACT_MISMATCH_NOTICE =
  'El contrato verificador del dominio es la dirección cero o no está desplegado en la red activa.';

/**
 * Aviso de mensaje redactado en reposo (ADT-21 / D-L): por encima de `PREVIEW_INLINE_MAX_BYTES` la
 * preview se guarda como hash + longitud, así que la ventana no puede mostrar el contenido íntegro.
 */
export const LONG_MESSAGE_NOTICE =
  'El mensaje es demasiado largo para mostrarlo aquí: la cartera solo conserva su resumen (hash y longitud).';

/** Fila del resumen de redacción que se pinta cuando el mensaje llega redactado. */
export interface RedactionRow {
  label: string;
  value: string;
}

/**
 * Resumen del mensaje redactado. Los campos de redacción (`messageHash`, `messageBytes`) los publica
 * el Service Worker al persistir la preview; se leen de forma **defensiva** —sin tocar el contrato de
 * `src/shared/types.ts`— porque la vista puede llegar de un SW que aún no los incluye.
 */
const redactionRows = (preview: TypedDataPreview): readonly RedactionRow[] => {
  const raw = preview as unknown as Record<string, unknown>;
  const rows: RedactionRow[] = [];
  if (typeof raw.messageHash === 'string' && raw.messageHash.length > 0) {
    rows.push({
      label: 'Hash del mensaje',
      value: shortHex(raw.messageHash),
    });
  }
  if (typeof raw.messageBytes === 'number') {
    rows.push({ label: 'Longitud del mensaje', value: `${raw.messageBytes} bytes` });
  }
  if (rows.length === 0) {
    rows.push({ label: 'Contenido', value: 'no disponible (mensaje redactado)' });
  }
  return rows;
};

/**
 * Describe un valor del `message` o de un `type` como texto legible, sin `any`.
 *
 * Es la utilidad compartida por los dos paneles que pintan estructuras arbitrarias (M51 para los
 * argumentos decodificados y M53 para el `message` de EIP-712): los valores llegan como `unknown`
 * porque el JSON-RPC no garantiza su forma. Los `bigint` se serializan en decimal (nunca con
 * `Number`, que perdería precisión) y los `bytes` largos se recortan con {@link shortHex}.
 */
export const describeTypedValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '—';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value.length > 42 && value.startsWith('0x') ? shortHex(value) : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => describeTypedValue(item)).join(', ');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.map(([key, item]) => `${key}: ${describeTypedValue(item)}`).join(' · ');
  }
  return String(value);
};

/** Props del panel EIP-712. */
export interface TypedDataPanelProps {
  preview: TypedDataPreview;
  /** Nombre visible de la red activa, para contrastarla con la del dominio. */
  networkName?: string | null;
  /** `chainId` de la red activa; `null` si aún no se conoce. */
  activeChainId?: ChainIdHex | null;
}

/** Panel de vista previa de una firma EIP-712. */
export function TypedDataPanel({
  preview,
  networkName = null,
  activeChainId = null,
}: TypedDataPanelProps): JSX.Element {
  const domainChainId =
    preview.domain.chainId === undefined ? null : String(preview.domain.chainId);
  const fields = Object.entries(preview.types).flatMap(([typeName, members]) =>
    members.map((member) => ({ key: `${typeName}.${member.name}`, value: member.type })),
  );

  return (
    <section className="tk-section" aria-labelledby="tk-typeddata-title">
      <h2 className="tk-section__title" id="tk-typeddata-title">
        Firma de datos EIP-712
      </h2>

      <dl className="tk-summary">
        <div className="tk-summary__row">
          <dt className="tk-summary__label">Dominio</dt>
          <dd className="tk-summary__value">{preview.domainName ?? 'Sin nombre de dominio'}</dd>
        </div>
        <div className="tk-summary__row">
          <dt className="tk-summary__label">Red del dominio</dt>
          <dd className="tk-summary__value tk-mono">
            {domainChainId ?? 'sin declarar'}
            {activeChainId !== null ? ` · red activa ${activeChainId}` : ''}
          </dd>
        </div>
        <div className="tk-summary__row">
          <dt className="tk-summary__label">Contrato verificador</dt>
          {/*
            CA-RF-20: el contrato verificador se muestra EN CLARO. Se pinta la dirección
            COMPLETA (no `shortHex`): es el dato con el que el usuario contrasta contra qué
            contrato va a firmar, y una forma truncada obligaba a depender del `title` para
            leerlo. Se conserva el `title` con el mismo valor como refuerzo.
          */}
          <dd className="tk-summary__value tk-mono" title={preview.verifyingContract ?? undefined}>
            {preview.verifyingContract === null
              ? 'Sin contrato verificador'
              : preview.verifyingContract}
          </dd>
        </div>
        <div className="tk-summary__row">
          <dt className="tk-summary__label">Tipo principal</dt>
          <dd className="tk-summary__value tk-mono">{preview.primaryType}</dd>
        </div>
      </dl>

      {preview.domainChainMismatch ? (
        <p className="tk-warning-band" role="alert">
          {DOMAIN_CHAIN_MISMATCH_NOTICE}
        </p>
      ) : null}

      {preview.verifyingContractMismatch ? (
        <p className="tk-warning-band tk-warning-band--danger" role="alert">
          {VERIFYING_CONTRACT_MISMATCH_NOTICE}
        </p>
      ) : null}

      {networkName !== null ? <p className="tk-note">Red activa: {networkName}</p> : null}

      <div className="tk-section">
        <h3 className="tk-section__title">Campos que se firman</h3>
        {fields.length === 0 ? (
          <p className="tk-note">El dominio no declara tipos adicionales.</p>
        ) : (
          <dl className="tk-summary">
            {fields.map((field) => (
              <div className="tk-summary__row" key={field.key}>
                <dt className="tk-summary__label tk-mono">{field.key}</dt>
                <dd className="tk-summary__value tk-mono">{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="tk-section">
        <h3 className="tk-section__title">Contenido del mensaje</h3>
        {preview.message === null ? (
          // ADT-21/D-L: por encima de `PREVIEW_INLINE_MAX_BYTES` la preview se persiste REDACTADA, así
          // que la ventana declara el resumen en vez de mostrar un mensaje que no tiene.
          <>
            <p className="tk-warning-band tk-warning-band--danger" role="alert">
              {LONG_MESSAGE_NOTICE}
            </p>
            <dl className="tk-summary">
              {redactionRows(preview).map((row) => (
                <div className="tk-summary__row" key={row.label}>
                  <dt className="tk-summary__label">{row.label}</dt>
                  <dd className="tk-summary__value tk-mono">{row.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <pre className="tk-message" aria-label="Contenido del mensaje EIP-712">
            {Object.entries(preview.message)
              .map(([key, value]) => `${key}: ${describeTypedValue(value)}`)
              .join('\n')}
          </pre>
        )}
      </div>
    </section>
  );
}
