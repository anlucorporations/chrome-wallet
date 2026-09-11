/**
 * Entry de la página del popup (`src/index.html` → `dist/index.html`).
 * Monta `App` (M39) en `#root`. No importa `ethers` (RNF-14).
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles/tokens.css';
import '../styles/base.css';

/** Monta la aplicación y devuelve el contenedor, para las pruebas de humo. */
export const mountPopup = (): HTMLElement => {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('No existe el contenedor #root del popup');
  }
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return container;
};

mountPopup();
