/**
 * Página de aprobación con los 10 bloques de información (RF-WN-44 · D-NW-9).
 *
 * Presentación pura: recibe la descripción ya calculada (`describirFirma` /
 * `describirConexion`) y la pinta según el nivel de detalle. La confirmación
 * extra ante avisos de peligro está aquí (decisión D5), sin bloquear.
 */
import { useState, type ReactNode } from 'react'
import type { DescripcionAprobacion } from '../utils/aprobacion'
import type { NivelDetalle } from '../utils/preferencias'

const ICONO_SEVERIDAD = { peligro: '🔴', atencion: '🟠', info: '🔵' } as const

const ICONO_VERBO: Record<string, string> = {
  Conectar: '🔗',
  Firmar: '✍️',
  Enviar: '💸',
  Cambiar: '🔀',
  'Añadir red': '➕',
  Aprobar: '✅',
}

export function DetalleAprobacion({
  desc,
  nivel,
  children,
  onRechazar,
  onAprobar,
}: {
  desc: DescripcionAprobacion
  nivel: NivelDetalle
  children?: ReactNode
  onRechazar: () => void
  onAprobar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)

  const mostrarDetalles = nivel !== 'basico'
  const mostrarTecnico = nivel === 'experto'
  const avisos =
    nivel === 'basico' ? desc.avisos.filter((a) => a.severidad === 'peligro') : desc.avisos

  const aprobar = () => {
    if (desc.peligro && !confirmando) {
      setConfirmando(true)
      return
    }
    onAprobar()
  }

  return (
    <div className="tk-aprobacion">
      {/* 1 · Encabezado */}
      <h2 className="tk-aprobacion__titulo">
        {desc.icono} {desc.titulo}
      </h2>

      {/* 2 · Origen */}
      {desc.origen && (
        <div className="tk-aprobacion__dapp">
          <span className="tk-mov__etq">Quién lo pide</span>
          <span className="tk-mono">{desc.origen}</span>
        </div>
      )}

      {/* 3 y 4 · Cuenta y red */}
      <div className="tk-aprobacion__resumen">
        <div className="tk-aprobacion__campo">
          <span className="tk-aprobacion__etq">Con qué cuenta</span>
          <span className="tk-mono">{desc.cuenta}</span>
        </div>
        <div className="tk-aprobacion__campo">
          <span className="tk-aprobacion__etq">Red</span>
          <span>{desc.red}</span>
        </div>
      </div>

      {/* 5 · Acción */}
      <div className="tk-aprobacion__accion">
        <span className="tk-aprobacion__etq">Qué autorizas</span>
        <p className="tk-aprobacion__accion-texto">{desc.accion}</p>
      </div>

      {children}

      {/* 6 · Detalles */}
      {mostrarDetalles && desc.detalles.length > 0 && (
        <section className="tk-aprobacion__bloque">
          <h3 className="tk-aprobacion__bloque-titulo">Detalles</h3>
          <dl className="tk-aprobacion__lista">
            {desc.detalles.map((d, i) => (
              <div key={`${d.etiqueta}-${i}`} className="tk-aprobacion__fila">
                <dt>{d.etiqueta}</dt>
                <dd className={d.mono ? 'tk-mono' : undefined} title={d.copiable ? d.valor : undefined}>
                  {d.valor}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 7 · Consecuencias */}
      {mostrarDetalles && desc.consecuencias.length > 0 && (
        <section className="tk-aprobacion__bloque">
          <h3 className="tk-aprobacion__bloque-titulo">Qué pasará</h3>
          <ul className="tk-aprobacion__consecuencias">
            {desc.consecuencias.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 8 · Avisos */}
      {avisos.length > 0 && (
        <section className="tk-aprobacion__bloque">
          <h3 className="tk-aprobacion__bloque-titulo">Avisos</h3>
          <ul className="tk-aprobacion__avisos">
            {avisos.map((a) => (
              <li key={a.id} className={`tk-aviso tk-aviso--${a.severidad}`}>
                <span aria-hidden>{ICONO_SEVERIDAD[a.severidad]}</span> {a.texto}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 9 · Datos técnicos */}
      {mostrarTecnico && (
        <details className="json-container" open>
          <summary className="json-label">Datos completos</summary>
          <pre className="json-display">{desc.tecnico}</pre>
        </details>
      )}

      {/* Confirmación extra si hay peligro (D5) */}
      {confirmando && (
        <div className="tk-aprobacion__confirmar" role="alert">
          <p>
            ⚠️ Esta operación tiene avisos de <strong>peligro</strong>. Revísalos antes de
            continuar.
          </p>
          <div className="tk-aprobacion__confirmar-acciones">
            <button className="tk-btn tk-btn--outline" onClick={() => setConfirmando(false)}>
              Volver
            </button>
            <button className="tk-btn tk-btn--danger" onClick={() => onAprobar()}>
              Continuar igualmente
            </button>
          </div>
        </div>
      )}

      {/* 10 · Acciones */}
      <div className="tk-aprobacion__acciones">
        <button className="tk-btn tk-btn--outline" onClick={onRechazar}>
          ❌ Rechazar
        </button>
        {!confirmando && (
          <button className="tk-btn" onClick={aprobar}>
            {ICONO_VERBO[desc.verboBoton] ?? '✅'} {desc.verboBoton}
          </button>
        )}
      </div>
    </div>
  )
}
