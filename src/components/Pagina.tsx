/**
 * Página interna de la wallet (rediseño): cada sección ocupa todo el espacio de
 * la billetera y tiene flecha para volver al inicio.
 */
import type { ReactNode } from 'react'

export function Pagina({
  titulo,
  onVolver,
  children,
}: {
  titulo: string
  onVolver: () => void
  children: ReactNode
}) {
  return (
    <div className="tk-pagina">
      <div className="tk-pagina__cabecera">
        <button
          type="button"
          className="tk-pagina__volver"
          onClick={onVolver}
          aria-label="Volver al inicio"
          title="Volver"
        >
          ←
        </button>
        <h2 className="tk-pagina__titulo">{titulo}</h2>
      </div>
      <div className="tk-pagina__cuerpo">{children}</div>
    </div>
  )
}
