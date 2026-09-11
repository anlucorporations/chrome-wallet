/**
 * Entry de la ventana de conexión (`src/connect.html` → `dist/connect.html`).
 * Monta `Connect` en `#root`.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Connect } from './Connect';
import '../styles/tokens.css';
import '../styles/base.css';

/** Monta la ventana de conexión y devuelve el contenedor. */
export const mountConnect = (): HTMLElement => {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('No existe el contenedor #root de connect.html');
  }
  createRoot(container).render(
    <StrictMode>
      <Connect />
    </StrictMode>,
  );
  return container;
};

mountConnect();
