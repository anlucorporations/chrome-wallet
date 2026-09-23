/** Punto de entrada de la ventana de conexión (`connect.html`): monta Connect. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import Connect from './Connect.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Connect />
  </StrictMode>,
)

