import type { LogEntry } from '../types'
import { horaLog } from '../utils/logs'

/**
 * Panel de actividad: muestra las operaciones de la wallet **y** las llamadas,
 * eventos y errores que provienen de las dApps (publicados por el service worker
 * en el bus de logs).
 */
interface LogsPanelProps {
  logs: LogEntry[]
  onClear: () => void
}

function LogsPanel({ logs, onClear }: LogsPanelProps) {
  return (
    <div className="logs-section">
      <div className="logs-header">
        <h3>Logs de Interacción {logs.length > 0 && <span className="logs-count">({logs.length})</span>}</h3>
        <button
          type="button"
          className="secondary-button clear-logs"
          onClick={onClear}
          disabled={logs.length === 0}
        >
          🗑️ Limpiar
        </button>
      </div>

      <div className="logs">
        {logs.length === 0 && (
          <div className="log-empty">Sin actividad todavía</div>
        )}
        {logs.map((log, index) => (
          <div key={`${log.timestamp}-${index}`} className={`log log-${log.type}`}>
            <span className="log-timestamp">[{horaLog(log)}]</span>
            <span className="log-type">[{log.type.toUpperCase()}]</span>
            {log.source && <span className="log-source">{log.source}</span>}
            <span className="log-content">{log.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LogsPanel
