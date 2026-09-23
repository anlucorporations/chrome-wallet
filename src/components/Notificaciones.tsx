/**
 * Notificaciones (M6 · RF-WN-19): fichas deslizables con el resumen de las
 * novedades no leídas. Se alimenta del bus de actividad de la wallet
 * (`LogEntry[]`) y guarda la marca de lectura en `chrome.storage.local`.
 */
import { useEffect, useState } from 'react'
import type { LogEntry } from '../types'

const CLAVE_VISTO = 'codecrypto_notifications_seen'

/** Fecha legible; si el timestamp no es parseable (formato antiguo) se muestra tal cual. */
function fecha(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString('es', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Icono por tipo de notificación del bus de actividad. */
const ICONOS: Record<LogEntry['type'], string> = {
  call: '📞',
  event: '📣',
  error: '⚠️',
  message: '✉️',
}

export function Notificaciones({ logs }: { logs: LogEntry[] }) {
  const [visto, setVisto] = useState(0)

  useEffect(() => {
    void chrome.storage.local.get(CLAVE_VISTO).then((s) => {
      setVisto(Number(s[CLAVE_VISTO]) || 0)
    })
  }, [])

  // Lista completa, de la más reciente a la más antigua.
  const lista = [...logs].reverse()
  const esNueva = (l: LogEntry) => new Date(l.timestamp).getTime() > visto
  const noLeidas = lista.filter(esNueva).length

  const marcarLeidas = async () => {
    const ahora = Date.now()
    setVisto(ahora)
    await chrome.storage.local.set({ [CLAVE_VISTO]: ahora })
  }

  return (
    <div className="tk-notifs">
      <div className="tk-notifs__cabecera">
        <span className="tk-muted" style={{ fontSize: 10 }}>
          {lista.length === 0
            ? 'Sin notificaciones'
            : noLeidas > 0
              ? `${lista.length} notificaciones · ${noLeidas} sin leer`
              : `${lista.length} notificaciones · todo leído`}
        </span>
        {noLeidas > 0 && (
          <button className="tk-notifs__marcar" onClick={() => void marcarLeidas()}>
            Marcar como leídas
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="tk-muted tk-notifs__vacio" style={{ fontSize: 11 }}>
          Sin novedades todavía. Aquí verás la actividad de la wallet y de las dApps conectadas.
        </p>
      ) : (
        <ul className="tk-notifs__lista">
          {lista.map((l, i) => (
            <li
              key={`${l.timestamp}-${i}`}
              className={`tk-notif${esNueva(l) ? ' tk-notif--nueva' : ''}`}
            >
              <span className="tk-notif__icono" aria-hidden>
                {ICONOS[l.type] ?? '🔔'}
              </span>
              <div className="tk-notif__cuerpo">
                <span className="tk-notif__texto">{l.content}</span>
                <span className="tk-notif__hora">
                  {fecha(l.timestamp)}
                  {l.source ? ` · ${l.source}` : ''}
                </span>
              </div>
              <span className="tk-notif__punto" aria-hidden />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
