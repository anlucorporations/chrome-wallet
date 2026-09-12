/**
 * Entry de la ventana de confirmación (`src/notification.html` → `dist/notification.html`).
 * Monta `App` (M50) en `#root`.
 *
 * El esqueleto de H1 (`Notification.tsx`) queda superado por M50: la ventana única decide con los
 * paneles M51–M54 y entrega `SIGN_RESPONSE`; este entry es el que la publica en el paquete.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles/tokens.css';
import '../styles/base.css';

/** Monta la ventana de confirmación y devuelve el contenedor. */
export const mountNotification = (): HTMLElement => {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('No existe el contenedor #root de notification.html');
  }
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return container;
};

mountNotification();
