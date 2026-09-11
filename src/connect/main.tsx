/**
 * Entry de la ventana de conexión (`src/connect.html` → `dist/connect.html`).
 * Monta la ventana M48 (`App`) en `#root`.
 *
 * La ventana resuelve `eth_requestAccounts`: elige la cuenta que se comparte y responde al
 * Service Worker con `CONNECT_RESPONSE` (o `4001` si se rechaza). Los estilos de marca se cargan
 * aquí (tokens + base) y también en `App.tsx`, para que el módulo sea autosuficiente si se monta
 * desde otra prueba.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
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
      <App />
    </StrictMode>,
  );
  return container;
};

mountConnect();
