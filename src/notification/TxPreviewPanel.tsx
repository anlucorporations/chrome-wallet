/**
 * M51 — `src/notification/TxPreviewPanel.tsx`
 * Resumen de la transacción de la ventana única de confirmación (`CA-RF-19`).
 *
 * Fuentes: `plan_desarrollo.md` §3.4.5 (tareas 4.7 y 4.11), `documento_tecnico.md` §3.4 y §2.5.2
 * (`TxPreview`) y `identidad_visual.md` §5.2 (componentes: dirección truncada en JetBrains Mono,
 * tarjeta, badge de red).
 *
 * Reglas que implementa:
 * - Resumen **siempre visible**: cuenta de origen, **destino etiquetado** (`toLabel`), valor, red y
 *   **comisión estimada**.
 * - Si hay `data`, se muestra el calldata **decodificado por la tabla local cerrada** de M66:
 *   selector, nombre de la función y parámetros. Fuera de la tabla (`functionName === null`) se
 *   declara el hueco y el aviso **bloqueante** lo pinta M52 (nunca se consulta un servicio externo
 *   de firmas: RT-03).
 * - `estimationFailed` bloquea el envío (`-32000`, RNF-25) y aquí se muestra **su motivo**, que
 *   llega en el error tipado del Service Worker.
 * - `to === null` = despliegue de contrato. El panel no firma ni lee el almacén (RNF-14).
 */

import type { JSX } from 'react';
import type { TxPreview } from '../shared/types';
import { DEFAULT_CHAIN_SYMBOL } from '../shared/constants';
import { formatEthWithSymbol, formatTimestamp, shortHex } from '../shared/format';
import { describeTypedValue } from './TypedDataPanel';

/** Props del panel de resumen de la transacción. */
export interface TxPreviewPanelProps {
  preview: TxPreview;
  /** Etiqueta de la cuenta de origen, si el estado la conoce. */
  accountLabel?: string | null;
  /** Nombre visible de la red activa (`Anvil Local` en la red de pruebas). */
  networkName?: string | null;
  /** Símbolo de la moneda nativa de la red activa. */
  symbol?: string;
  /** Instante de vencimiento del plazo, si el Service Worker lo entregó. */
  expiresAt?: number | null;
}

/** Formatea el valor en wei sin lanzar cuando el dato llega malformado. */
const describeValue = (preview: TxPreview, symbol: string): string => {
  try {
    return formatEthWithSymbol(preview.valueWei, symbol);
  } catch {
    return preview.valueEth.length > 0 ? `${preview.valueEth} ${symbol}` : '—';
  }
};

/** Resumen de una transacción propuesta. */
export function TxPreviewPanel({
  preview,
  accountLabel = null,
  networkName = null,
  symbol = DEFAULT_CHAIN_SYMBOL,
  expiresAt = null,
}: TxPreviewPanelProps): JSX.Element {
  const args = preview.decodedArgs === null ? [] : Object.entries(preview.decodedArgs);
  return (
    <section className="tk-section" aria-labelledby="tk-tx-title">
      <h2 className="tk-section__title" id="tk-tx-title">
        Resumen de la transacción
      </h2>

      <dl className="tk-summary">
        <div className="tk-summary__row">
          <dt className="tk-summary__label">Cuenta</dt>
          <dd className="tk-summary__value">
            <span className="tk-summary__strong">{accountLabel ?? 'Cuenta de la cartera'}</span>
            <code className="tk-mono tk-summary__mono" title={preview.from}>
              {shortHex(preview.from)}
            </code>
          </dd>
        </div>

        <div className="tk-summary__row">
          <dt className="tk-summary__label">Destino</dt>
          <dd className="tk-summary__value">
            {preview.to === null ? (
              <span className="tk-summary__strong">Despliegue de contrato</span>
            ) : (
              <>
                <span className="tk-summary__strong">{preview.toLabel}</span>
                <code className="tk-mono tk-summary__mono" title={preview.to}>
                  {shortHex(preview.to)}
                </code>
              </>
            )}
          </dd>
        </div>

        <div className="tk-summary__row">
          <dt className="tk-summary__label">Valor</dt>
          <dd className="tk-summary__value tk-summary__strong">{describeValue(preview, symbol)}</dd>
        </div>

        <div className="tk-summary__row">
          <dt className="tk-summary__label">Red</dt>
          <dd className="tk-summary__value">
            <span className="tk-summary__strong">{networkName ?? 'Red activa'}</span>
            <code className="tk-mono tk-summary__mono">{preview.chainId}</code>
          </dd>
        </div>

        <div className="tk-summary__row">
          <dt className="tk-summary__label">Comisión estimada</dt>
          <dd className="tk-summary__value tk-summary__strong">
            {preview.estimationFailed === null
              ? `${preview.estimatedFeeEth} ${symbol}`
              : 'Sin estimar: el envío está bloqueado'}
          </dd>
        </div>

        <div className="tk-summary__row">
          <dt className="tk-summary__label">Tipo de transacción</dt>
          <dd className="tk-summary__value tk-mono">2 (EIP-1559) · límite {preview.gasLimit}</dd>
        </div>

        {expiresAt !== null ? (
          <div className="tk-summary__row">
            <dt className="tk-summary__label">Plazo</dt>
            <dd className="tk-summary__value tk-mono">{formatTimestamp(expiresAt)}</dd>
          </div>
        ) : null}
      </dl>

      {preview.estimationFailed !== null ? (
        <p className="tk-warning-band tk-warning-band--danger" role="alert">
          {`La estimación de gas falló: ${preview.estimationFailed.reason}. El envío se ha bloqueado.`}
        </p>
      ) : null}

      {preview.insufficientFunds ? (
        <p className="tk-warning-band tk-warning-band--danger" role="alert">
          Saldo insuficiente para cubrir el valor y la comisión estimada.
        </p>
      ) : null}

      {/*
        El bloque «Llamada a contrato» NO repite la clase `tk-section`: el panel ya es una
        `tk-section` y anidar otra con el MISMO texto de título hacía que cualquier selector
        `.tk-section` con `hasText` («Llamada a contrato») resolviera a DOS elementos (la sección
        del panel y este bloque), lo que rompe la lectura del panel por su título. La utilidad
        `tk-view` conserva el apilado en columna sin duplicar la identidad de la sección.
      */}
      <div className="tk-view">
        <h3 className="tk-section__title">Llamada a contrato</h3>
        {!preview.isContractCall ? (
          <p className="tk-note">
            Transferencia simple: la transacción no lleva datos adjuntos que decodificar.
          </p>
        ) : (
          <>
            <dl className="tk-summary">
              <div className="tk-summary__row">
                <dt className="tk-summary__label">Selector</dt>
                <dd className="tk-summary__value tk-mono">{preview.selector ?? 'sin selector'}</dd>
              </div>
              <div className="tk-summary__row">
                <dt className="tk-summary__label">Función</dt>
                <dd className="tk-summary__value tk-mono">
                  {preview.functionName ?? 'no reconocida'}
                </dd>
              </div>
              <div className="tk-summary__row">
                <dt className="tk-summary__label">Datos</dt>
                <dd className="tk-summary__value tk-mono">
                  {`${preview.dataLength} bytes · ${shortHex(preview.data)}`}
                </dd>
              </div>
            </dl>
            {args.length > 0 ? (
              <dl className="tk-summary">
                {args.map(([key, value]) => (
                  <div className="tk-summary__row" key={key}>
                    <dt className="tk-summary__label tk-mono">{key}</dt>
                    <dd className="tk-summary__value tk-mono" title={describeTypedValue(value)}>
                      {describeTypedValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {preview.functionName === null ? (
              <p className="tk-note">
                El selector no figura en la tabla local de funciones conocidas: la cartera no puede
                describir qué hará esta llamada.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
