/**
 * M45 — `src/popup/views/LogsView.tsx`
 * Pestaña «Actividad»: **panel de logs** con los 24 eventos del catálogo, los errores en **rojo**
 * con su `code` numérico, las operaciones con su hash/firma y la **exportación JSON** del
 * histórico (tarea 5.10 de `plan_desarrollo.md` §3.5.5; `identidad_visual.md` §5.2).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §5.2 (ventanas y componentes): M45 es la vista del registro.
 * - `diccionario_datos.md` §2.11 (`truekeate_logs`) y §4.3 (literales de error).
 * - `plan_desarrollo.md` §3.5.6 `CA-RF-28`..`CA-RF-31`: método, `origin` y `ts` visibles; eventos
 *   con su `category`; errores en rojo con `code`; operaciones con hash/firma; y §3.5.8 (el panel
 *   muestra el **contador de descartes** por cuota, R13).
 *
 * CONTRATO QUE CONSUME (RNF-14: la UI **no** lee el almacén de la extensión)
 * - La lectura es SIEMPRE `wallet_getLogs` (§5.1.1): `{ entries, truncated, dropped }`. Este
 *   módulo no toca el almacén, no importa nada del Service Worker (repite las 5 categorías y los 4
 *   niveles, igual que `popupErrors.ts` repite la tabla de §4.3) y no limpia ni purga nada: el
 *   popup **solo lee**.
 * - La única escritura es la descarga del fichero JSON, que se genera en memoria con un `Blob` y
 *   no sale del equipo: no hay ninguna petición de red.
 *
 * Accesibilidad (RNF-19/RNF-21): el nivel y la categoría de cada entrada se leen como TEXTO —nunca
 * solo por color—, el panel y la lista llevan sus roles y etiquetas, y los contadores de descartes
 * y de entradas se publican además como atributos de datos para poder comprobarlos sin instrumentar
 * el canal (mismo patrón que los contadores del polling, M47).
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { LogCategory, LogEntry, LogLevel } from '../../shared/types';
import { formatTimestamp, shortHex } from '../../shared/format';
import { StatusMessage } from '../components/StatusMessage';
import type { PopupError } from '../popupErrors';
import { callInternal } from '../walletRpc';

// ---------------------------------------------------------------------------
// Tipos y catálogos transcritos (la UI no importa módulos del Service Worker)
// ---------------------------------------------------------------------------

/** Respuesta literal de `wallet_getLogs` (§5.1.1, tarea 5.9). */
export interface LogsResponse {
  entries: LogEntry[];
  /** `true` cuando hubo recorte (retención FIFO de 500/200 o descarte por cuota). */
  truncated: boolean;
  /** Contador de descartes por cuota: es el aviso visible de R13 (§2.15). */
  dropped: number;
}

/** Etiqueta en español de cada nivel (el valor viaja en el atributo de datos). */
export const LOG_LEVEL_LABELS: Readonly<Record<LogLevel, string>> = {
  info: 'Información',
  success: 'Correcto',
  warn: 'Aviso',
  error: 'Error',
};

/** Etiqueta en español de cada categoría de taxonomía (§2.11). */
export const LOG_CATEGORY_LABELS: Readonly<Record<LogCategory, string>> = {
  call: 'Llamada',
  event: 'Evento',
  tx: 'Transacción',
  sign: 'Firma',
  system: 'Sistema',
};

/** Los 4 niveles, en orden de severidad creciente (catálogo cerrado de §2.11). */
const LEVELS: readonly LogLevel[] = ['info', 'success', 'warn', 'error'];

/** Las 5 categorías, en su orden canónico de §2.11. */
const CATEGORIES: readonly LogCategory[] = ['call', 'event', 'tx', 'sign', 'system'];

/** Filtro «sin filtrar» de cada selector. */
const ANY_LEVEL = 'todos' as const;
const ANY_CATEGORY = 'todas' as const;

// ---------------------------------------------------------------------------
// Lecturas derivadas de una entrada (puras, exportadas para su comprobación)
// ---------------------------------------------------------------------------

/** ¿Es un objeto plano? Guarda sin `any`. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Código EIP-1193 que llevan los errores en su `data` (`rpc_error`, `storage_quota_exceeded`…).
 * Se publica como TEXTO en la tarjeta: el panel nunca muestra un error sin su código (§4.3/RNF-06).
 */
export const logEntryCode = (entry: LogEntry): number | null => {
  if (!isRecord(entry.data)) {
    return null;
  }
  const code = entry.data.code;
  return typeof code === 'number' && Number.isFinite(code) ? code : null;
};

/** Campos candidatos donde el escritor de la traza deja un hash o una firma (RF-31). */
const HASH_KEYS = ['txHash', 'hash', 'signature'] as const;

/**
 * Hash de transacción o firma de la operación, cuando la entrada la lleva. Se busca primero en el
 * campo de primer nivel que publica `LogEntry` (RF-31) y después en el `data` ya redactado.
 */
export const logEntryHash = (entry: LogEntry): string | null => {
  if (typeof entry.txHash === 'string' && entry.txHash.length > 0) {
    return entry.txHash;
  }
  if (!isRecord(entry.data)) {
    return null;
  }
  for (const key of HASH_KEYS) {
    const value = entry.data[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
};

/** ¿Es una entrada que el panel debe pintar en ROJO? Los errores son las de nivel `error`. */
export const isErrorEntry = (entry: LogEntry): boolean => entry.level === 'error';

// ---------------------------------------------------------------------------
// Exportación JSON (descarga local, sin red)
// ---------------------------------------------------------------------------

/** Fichero exportado: el histórico tal y como lo publica el SW, más la marca de la exportación. */
export interface LogsExport {
  /** Instante de la exportación (epoch ms). */
  exportedAt: number;
  /** Entradas exportadas (las FILTRADAS en pantalla, en orden cronológico). */
  entries: LogEntry[];
  /** Entradas totales que retuvo el Service Worker en el momento de la lectura. */
  totalEntries: number;
  /** Contador de descartes por cuota (§2.15 / R13). */
  dropped: number;
  /** `true` si la retención o la cuota dejaron entradas fuera. */
  truncated: boolean;
  /** Filtros aplicados, para que el fichero sea interpretable sin la pantalla. */
  filters: { level: string; category: string };
}

/**
 * Construye el contenido del fichero exportado. Es una función PURA: no toca el almacén, no hace
 * red y no sanea nada (el `data` persistido ya viene redactado por M22).
 */
export const buildLogsExport = (
  view: LogsResponse,
  visible: readonly LogEntry[],
  filters: { level: string; category: string },
  now: number,
): LogsExport => ({
  exportedAt: now,
  entries: [...visible],
  totalEntries: view.entries.length,
  dropped: view.dropped,
  truncated: view.truncated,
  filters,
});

/** Nombre del fichero exportado: `truekeate-logs-<fecha>.json`. */
export const logExportFileName = (now: number): string =>
  `truekeate-logs-${new Date(now).toISOString().slice(0, 10)}.json`;

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

/** Estado de la exportación en curso: URL del `Blob` y tamaño del fichero. */
interface ExportState {
  url: string;
  fileName: string;
  bytes: number;
  entries: number;
}

/** Vista de «Actividad» del popup: panel de logs con filtros y exportación JSON. */
export function LogsView(): JSX.Element {
  const [view, setView] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [level, setLevel] = useState<string>(ANY_LEVEL);
  const [category, setCategory] = useState<string>(ANY_CATEGORY);
  const [error, setError] = useState<PopupError | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [exported, setExported] = useState<ExportState | null>(null);
  /** URL de objeto viva, para revocarla al desmontar o al exportar de nuevo. */
  const exportUrlRef = useRef<string | null>(null);

  /** Lee el registro del Service Worker (lectura pura: el popup no escribe nada). */
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const response = await callInternal<LogsResponse>('wallet_getLogs');
      if (!mounted) {
        return;
      }
      setLoading(false);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setError(null);
      setView({
        entries: Array.isArray(response.result?.entries) ? response.result.entries : [],
        truncated: response.result?.truncated === true,
        dropped: typeof response.result?.dropped === 'number' ? response.result.dropped : 0,
      });
    })();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  /** Revoca la URL de objeto al desmontar (nunca deja un `Blob` vivo). */
  useEffect(
    () => () => {
      if (exportUrlRef.current !== null) {
        URL.revokeObjectURL(exportUrlRef.current);
        exportUrlRef.current = null;
      }
    },
    [],
  );

  const entries = useMemo<readonly LogEntry[]>(() => view?.entries ?? [], [view]);

  /** Entradas que se pintan y se exportan: es el resultado de los dos filtros. */
  const visible = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (level === ANY_LEVEL || entry.level === level) &&
          (category === ANY_CATEGORY || entry.category === category),
      ),
    [entries, level, category],
  );

  /** Número de errores visibles: es el dato que resume el estado del registro. */
  const errorCount = useMemo(() => visible.filter(isErrorEntry).length, [visible]);

  /**
   * Exporta el histórico VISIBLE a un fichero JSON descargado localmente.
   *
   * El contenido se construye en memoria (`Blob`) y se entrega con un ancla `download`: no hay
   * ninguna petición de red ni se escribe en el almacén de la extensión. El enlace queda además
   * publicado en el DOM para poder volver a descargarlo y para comprobarlo de extremo a extremo.
   */
  const handleExport = (): void => {
    if (view === null) {
      return;
    }
    const now = Date.now();
    const payload = buildLogsExport(view, visible, { level, category }, now);
    const text = `${JSON.stringify(payload, null, 2)}\n`;
    if (exportUrlRef.current !== null) {
      URL.revokeObjectURL(exportUrlRef.current);
    }
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    exportUrlRef.current = url;
    const fileName = logExportFileName(now);

    // Descarga inmediata: el ancla se pulsa una vez y se deja el enlace en pantalla.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.click();

    setExported({ url, fileName, bytes: text.length, entries: visible.length });
    setStatus(
      `Histórico exportado en ${fileName}: ${visible.length} entradas, ${text.length} bytes. El fichero se genera en el equipo: no se envía a ninguna red.`,
    );
  };

  return (
    <div className="tk-view">
      <StatusMessage error={error} />
      <StatusMessage message={status} tone="success" />

      <section className="tk-section" aria-labelledby="actividad-titulo">
        <div className="tk-section__head">
          <h2 className="tk-section__title" id="actividad-titulo">
            Panel de actividad
          </h2>
          <span className="tk-badge" id="actividad-errores" data-errors={errorCount}>
            {errorCount} errores
          </span>
          <button
            type="button"
            id="actividad-actualizar"
            className="tk-btn-secondary tk-btn-small"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setStatus(null);
              setReloadKey((previous) => previous + 1);
            }}
          >
            Actualizar registro
          </button>
        </div>

        <p className="tk-note">
          El registro lo escribe el Service Worker con una entrada por evento del catálogo y viaja
          ya redactado: no guarda claves, ni la frase de recuperación, ni payloads íntegros. Esta
          pantalla solo lee.
        </p>

        {/* Contador de descartes por cuota: aviso NO descartable de R13 (§2.15). */}
        <p
          className={`tk-quota${(view?.dropped ?? 0) > 0 || view?.truncated === true ? ' tk-quota--warn' : ''}`}
          id="actividad-cuota"
          data-dropped={view?.dropped ?? 0}
          data-truncated={view?.truncated === true ? 'true' : 'false'}
          data-total={entries.length}
        >
          Entradas retenidas: {entries.length} · descartadas por falta de espacio:{' '}
          <strong id="actividad-descartes">{view?.dropped ?? 0}</strong>
          {view?.truncated === true
            ? ' · el registro está recortado: exporta el histórico y borra los logs para liberar espacio.'
            : ''}
        </p>

        <div className="tk-filters">
          <label className="tk-filter" htmlFor="actividad-filtro-nivel">
            <span className="tk-field__label">Nivel</span>
            <select
              id="actividad-filtro-nivel"
              className="tk-select"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
              }}
            >
              <option value={ANY_LEVEL}>Todos los niveles</option>
              {LEVELS.map((value) => (
                <option key={value} value={value}>
                  {LOG_LEVEL_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="tk-filter" htmlFor="actividad-filtro-categoria">
            <span className="tk-field__label">Categoría</span>
            <select
              id="actividad-filtro-categoria"
              className="tk-select"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
              }}
            >
              <option value={ANY_CATEGORY}>Todas las categorías</option>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {LOG_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="tk-actions-row">
          <button
            type="button"
            id="actividad-exportar"
            className="tk-btn-primary"
            disabled={view === null || visible.length === 0}
            onClick={handleExport}
          >
            Exportar el histórico en JSON
          </button>
        </div>

        {exported !== null ? (
          <p className="tk-note" id="actividad-exportacion" data-bytes={exported.bytes}>
            <a id="actividad-descarga" href={exported.url} download={exported.fileName}>
              Volver a descargar {exported.fileName} ({exported.entries} entradas,{' '}
              {exported.bytes} bytes)
            </a>
          </p>
        ) : null}

        {loading ? (
          <p className="tk-empty__text" role="status" aria-busy="true">
            Cargando el registro de actividad…
          </p>
        ) : visible.length === 0 ? (
          <p className="tk-empty__text" id="actividad-vacia">
            No hay ninguna entrada que cumpla el filtro. Los 24 eventos del catálogo aparecen aquí
            en cuanto el Service Worker los registra.
          </p>
        ) : (
          <ul className="tk-logs" id="actividad-entradas" role="list" aria-label="Entradas del registro">
            {visible.map((entry) => {
              const code = logEntryCode(entry);
              const hash = logEntryHash(entry);
              return (
                <li
                  className={`tk-log${isErrorEntry(entry) ? ' tk-log--error' : ''}`}
                  key={entry.id}
                  data-level={entry.level}
                  data-category={entry.category}
                  data-event={entry.event}
                  data-origin={entry.origin}
                >
                  <span className="tk-log__head">
                    <span className="tk-log__level">{LOG_LEVEL_LABELS[entry.level]}</span>
                    <code className="tk-log__event">{entry.event}</code>
                    <span className="tk-log__time">{formatTimestamp(entry.ts)}</span>
                  </span>
                  <span className="tk-log__message">{entry.message}</span>
                  <span className="tk-log__meta">
                    {LOG_CATEGORY_LABELS[entry.category]} · origen {entry.origin} ·{' '}
                    {entry.method.length > 0 ? `método ${entry.method}` : 'sin método RPC'}
                  </span>
                  {code !== null ? (
                    <code className="tk-log__code" data-code={code}>
                      code {code}
                    </code>
                  ) : null}
                  {hash !== null ? (
                    <code className="tk-log__hash" title={hash}>
                      {shortHex(hash)}
                    </code>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default LogsView;
