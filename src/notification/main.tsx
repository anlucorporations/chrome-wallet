/**
 * Entry de la ventana de confirmación (`src/notification.html` → `dist/notification.html`).
 * Monta `Notification` en `#root`.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Notification } from './Notification';
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
      <Notification />
    </StrictMode>,
  );
  return container;
};

mountNotification();
