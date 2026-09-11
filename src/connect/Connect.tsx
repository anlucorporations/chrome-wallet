/**
 * M48 (esqueleto) — `src/connect/Connect.tsx`
 * Ventana de conexión 420×650. H1 solo entrega el esqueleto con el encabezado de marca y
 * las medidas correctas; la elección de cuenta y el polling de saldos llegan en H3.
 */

import type { JSX } from 'react';
import '../styles/tokens.css';
import '../styles/base.css';

/** Ruta pública del isologo de 96 px. */
const MARK_SRC = 'brand/truekeate-mark-96.png';

/**
 * Esqueleto de la ventana de conexión. No lee ni escribe nada: no hay sesiones ni cuentas
 * todavía (RNF-09: ninguna clave cruza `window.postMessage`).
 */
export function Connect(): JSX.Element {
  return (
    <div className="tk-window tk-connect">
      <header className="tk-header">
        <h1 className="tk-header__title">TrueKeate Wallet</h1>
        <img className="tk-header__mark" src={MARK_SRC} alt="" aria-hidden="true" />
      </header>

      <main className="tk-main">
        <section className="tk-card">
          <h2>Solicitud de conexión</h2>
          <p className="tk-pending">
            Pendiente de implementar (H3): aquí se mostrarán el origen solicitante con su
            favicon, la lista de cuentas con su saldo y la elección de la cuenta a compartir.
          </p>
        </section>

        <p className="tk-notice" role="status">
          Esqueleto de H1. Cancelar equivale a rechazar con el código 4001 «Operación
          cancelada por el usuario.».
        </p>
      </main>
    </div>
  );
}

export default Connect;
