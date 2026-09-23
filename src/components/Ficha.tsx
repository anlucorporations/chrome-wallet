/**
 * Ficha contraíble del popup (M2.1 del requerimiento de la wallet nativa).
 *
 * Cada sección del index (cuenta, balance, saldo, red, características…) se
 * muestra como una ficha que se puede plegar/desplegar. El estado se recuerda
 * en `localStorage` para que el usuario conserve su vista entre aperturas.
 *
 * Solo presentación: no toca lógica de wallet, RPC ni firma.
 */
import { useState, type ReactNode } from 'react'

interface Props {
  /** Identificador estable para recordar el estado plegado. */
  id: string
  titulo: string
  icono?: string
  /** Estado inicial si el usuario aún no ha interactuado. */
  abierta?: boolean
  children: ReactNode
}

export function Ficha({ id, titulo, icono, abierta = true, children }: Props) {
  const clave = `codecrypto_ficha_${id}`
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return abierta
    const guardado = window.localStorage.getItem(clave)
    return guardado === null ? abierta : guardado === '1'
  })

  const alternar = () => {
    setOpen((previo) => {
      const nuevo = !previo
      try {
        window.localStorage.setItem(clave, nuevo ? '1' : '0')
      } catch {
        /* almacenamiento no disponible: se ignora */
      }
      return nuevo
    })
  }

  return (
    <section className={`tk-ficha${open ? ' tk-ficha--abierta' : ''}`}>
      <button
        type="button"
        className="tk-ficha__cabecera"
        aria-expanded={open}
        aria-controls={`ficha-${id}`}
        onClick={alternar}
      >
        <span className="tk-ficha__titulo">
          {icono ? <span aria-hidden>{icono} </span> : null}
          {titulo}
        </span>
        <span className="tk-ficha__chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="tk-ficha__cuerpo" id={`ficha-${id}`}>
          {children}
        </div>
      )}
    </section>
  )
}
