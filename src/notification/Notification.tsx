/**
 * M50 (esqueleto) — `src/notification/Notification.tsx`
 * Ventana ÚNICA de confirmación 420×640. Es la ventana que DECIDE y nunca firma (RF-41).
 * H1 solo entrega el esqueleto con el encabezado de marca, las medidas correctas y la
 * insignia de tipo de solicitud; los paneles de resumen llegan en H4.
 */

import type { JSX } from 'react';
import '../styles/tokens.css';
import '../styles/base.css';

/** Ruta pública del isologo de 96 px. */
const MARK_SRC = 'brand/truekeate-mark-96.png';

/**
 * Esqueleto de la ventana de confirmación. No resuelve nada: la cola persistida y los
 * mensajes `SIGN_RESPONSE`/`CONNECT_RESPONSE` llegan en H4.
 */
export function Notification(): JSX.Element {
  return (
    <div className="tk-window tk-notification">
      <header className="tk-header">
        <h1 className="tk-header__title">TrueKeate Wallet</h1>
        <span className="tk-badge">Solicitud pendiente</span>
        <img className="tk-header__mark" src={MARK_SRC} alt="" aria-hidden="true" />
      </header>

      <main className="tk-main">
        <section className="tk-card">
          <h2>Confirmación de la solicitud</h2>
          <p className="tk-pending">
            Pendiente de implementar (H4): aquí se mostrarán el origen y su favicon, la
            insignia de riesgo, el resumen de la transacción o la vista previa EIP-712 /
            personal_sign, y el contador de solicitudes en espera.
          </p>
        </section>

        <p className="tk-notice" role="status">
          Esqueleto de H1. La ventana es única para toda la extensión y solo ofrecerá
          «Aprobar» y «Rechazar» (Esc = rechazar), con área táctil ≥ 44 px.
        </p>
      </main>
    </div>
  );
}

export default Notification;
