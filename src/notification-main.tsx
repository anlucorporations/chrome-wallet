/** Punto de entrada de la ventana de confirmación (`notification.html`). */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import Notification from './Notification.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Notification />
  </StrictMode>,
)

