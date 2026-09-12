/**
 * M31 — `src/background/logging/events.ts`
 * **Catálogo CERRADO** de la observabilidad: 24 eventos, 5 categorías y 4 niveles.
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §3.6 regla 2: enum de **24** eventos (incluye
 *   `storage_quota_exceeded`, ADT-14 / D-M) y las **5** categorías de taxonomía, que son
 *   **independientes** del nombre del evento.
 * - `diccionario_datos.md` §2.11: la tabla de `truekeate_logs` con los campos `event` y
 *   `category`, su enum cerrado de 24 valores y la nota vinculante «`event` y `category` son
 *   campos independientes; **nunca** se usa una categoría como si fuera un evento».
 * - `plan_desarrollo.md` §3.5.5 tarea 5.5: «Enum de 24 eventos, 5 categorías y 4 niveles, sin
 *   valores fuera del catálogo (RNF-16)».
 *
 * REGLAS QUE ESTE MÓDULO HACE CUMPLIR
 * 1. El catálogo es la **fuente única** de la forma válida: `LogEventName`, `LogCategory` y
 *    `LogLevel` (declarados en `shared/types.ts`, M55) se contrastan aquí evento a evento con
 *    `satisfies`, de modo que añadir un nombre a la unión sin declararlo en el catálogo —o al
 *    revés— **no compila**.
 * 2. Cada evento tiene su **categoría primaria** y su **nivel por defecto**, y puede declarar
 *    variantes admitidas. La clave `''` de `variants` es la **situación de código inválido**
 *    (una entrada con `event` desconocido se trata como error de programación y se clasifica
 *    `system`/`error`, nunca como una categoría de negocio).
 * 3. `system`, `call`, `tx`, `sign` y `event` **no** son valores válidos de `event`: son
 *    categorías. {@link isLogEventName} lo impone.
 * 4. Este módulo es PURO: no toca el almacén, no usa `ethers` y no escribe nada.
 */

import type { LogCategory, LogEventName, LogLevel } from '../../shared/types';

// ---------------------------------------------------------------------------
// Las 5 categorías y los 4 niveles (uniones CERRADAS)
// ---------------------------------------------------------------------------

/** Las **5** categorías de taxonomía de `diccionario_datos.md` §2.11, en su orden canónico. */
export const LOG_CATEGORIES = ['call', 'event', 'tx', 'sign', 'system'] as const;

/** Los **4** niveles de `LogLevel`, en orden de severidad creciente. */
export const LOG_LEVELS = ['info', 'success', 'warn', 'error'] as const;

/**
 * Comprobación de exhaustividad en compilación: las listas de arriba son EXACTAMENTE las uniones
 * de `shared/types.ts`. Si una de las dos partes cambia sin la otra, este módulo no compila.
 */
const CATEGORIES_ARE_CLOSED: readonly LogCategory[] = LOG_CATEGORIES;
const LEVELS_ARE_CLOSED: readonly LogLevel[] = LOG_LEVELS;
void CATEGORIES_ARE_CLOSED;
void LEVELS_ARE_CLOSED;

/** ¿Es `value` una de las 5 categorías del catálogo? */
export const isLogCategory = (value: unknown): value is LogCategory =>
  (LOG_CATEGORIES as readonly unknown[]).includes(value);

/** ¿Es `value` uno de los 4 niveles del catálogo? */
export const isLogLevel = (value: unknown): value is LogLevel =>
  (LOG_LEVELS as readonly unknown[]).includes(value);

// ---------------------------------------------------------------------------
// Especificación de cada evento
// ---------------------------------------------------------------------------

/** Variante admitida de un evento: la misma cosa ocurrida en otro contexto de la aplicación. */
export interface LogEventVariant {
  category: LogCategory;
  level: LogLevel;
  /** Motivo por el que la variante existe (documental; queda en el código, no en el log). */
  note: string;
}

/** Especificación completa de un evento del catálogo. */
export interface LogEventSpec {
  category: LogCategory;
  level: LogLevel;
  /** Descripción del evento (en español), base de los mensajes legibles de M30. */
  description: string;
  /** Variantes admitidas, indexadas por motivo. La clave `''` es la situación de código inválido. */
  variants?: Readonly<Record<string, LogEventVariant>>;
}

/** Categoría primaria de `rpc_error`: es una llamada que falló. */
const RPC_ERROR_CODE_VIOLATION: LogEventVariant = {
  category: 'system',
  level: 'error',
  note: 'Entrada con `event` fuera del catálogo: es un error de programación, no una llamada de la dApp',
};

/**
 * **EL CATÁLOGO.** Los 24 eventos de §3.6 y §2.11, cada uno con su categoría primaria, su nivel
 * por defecto y sus variantes admitidas. El orden es el del corpus.
 */
export const LOG_EVENT_SPECS = {
  rpc_call: {
    category: 'call',
    level: 'info',
    description: 'Llamada RPC del catálogo',
  },
  rpc_error: {
    category: 'call',
    level: 'warn',
    description: 'Llamada RPC que devolvió un error EIP-1193 del catálogo',
    variants: {
      // Una traza de reconciliación o de cuota no es la llamada de una dApp: es un aviso del
      // sistema, y ese matiz es el que §2.15 y §2.12 piden registrar.
      system: {
        category: 'system',
        level: 'warn',
        note: 'Traza de plataforma: marca en vuelo liberada, difusión interrumpida o reconciliación',
      },
      quota: {
        category: 'system',
        level: 'error',
        note: 'La escritura de un log se descartó por cuota de almacenamiento (§2.15 paso 2)',
      },
      '': RPC_ERROR_CODE_VIOLATION,
    },
  },
  event_emit: {
    category: 'event',
    level: 'info',
    description: 'Evento del provider EIP-1193 propagado a las pestañas',
  },
  tx_sent: {
    category: 'tx',
    level: 'info',
    description: 'Transacción difundida y pendiente de confirmación',
  },
  tx_confirmed: {
    category: 'tx',
    level: 'success',
    description: 'Transacción confirmada con recibo `status 0x1`',
  },
  tx_failed: {
    category: 'tx',
    level: 'error',
    description: 'Transacción fallida: recibo `status 0x0`',
  },
  tx_reverted: {
    category: 'tx',
    level: 'error',
    description: 'Transacción revertida por el nodo antes de confirmarse',
  },
  sign_personal: {
    category: 'sign',
    level: 'success',
    description: 'Firma de texto plano (`personal_sign`)',
  },
  sign_typed_data: {
    category: 'sign',
    level: 'success',
    description: 'Firma de datos estructurados (`eth_signTypedData_v4`)',
  },
  approval_created: {
    category: 'event',
    level: 'info',
    description: 'Solicitud de aprobación creada en la cola persistida',
  },
  approval_resolved: {
    category: 'event',
    level: 'info',
    description: 'Solicitud de aprobación resuelta por el usuario',
    variants: {
      warn: {
        category: 'event',
        level: 'warn',
        note: 'Resolución sin aprobación: rechazo, vencimiento o cierre de la ventana única',
      },
    },
  },
  approval_expired: {
    category: 'event',
    level: 'warn',
    description: 'Solicitud de aprobación vencida por el plazo',
  },
  chain_changed: {
    category: 'event',
    level: 'success',
    description: 'Red activa cambiada',
  },
  accounts_changed: {
    category: 'event',
    level: 'info',
    description: 'Lista de cuentas compartida con las dApp cambiada',
  },
  wallet_created: {
    category: 'system',
    level: 'success',
    description: 'Cartera creada o restaurada desde la frase de recuperación',
  },
  wallet_imported: {
    category: 'system',
    level: 'success',
    description: 'Cartera importada desde una frase de recuperación',
  },
  account_imported: {
    category: 'sign',
    level: 'success',
    description:
      'Cuenta importada por clave privada (RESERVADO a RF-05: la derivación HD NO es una importación)',
  },
  account_removed: {
    category: 'system',
    level: 'warn',
    description: 'Cuenta importada eliminada de la cartera',
  },
  reset_wallet: {
    category: 'system',
    level: 'warn',
    description: 'Cartera reseteada (los logs sobreviven al reset, RF-32)',
  },
  network_added: {
    category: 'event',
    level: 'success',
    description: 'Red dada de alta (sin pasar a ser la activa)',
  },
  permission_revoked: {
    category: 'event',
    level: 'info',
    description: 'Permiso de una dApp revocado',
  },
  sw_started: {
    category: 'system',
    level: 'info',
    description: 'Service Worker arrancado',
  },
  sw_reconcile: {
    category: 'system',
    level: 'info',
    description: 'Reconciliación de plazos al arrancar el Service Worker',
    variants: {
      warn: {
        category: 'system',
        level: 'warn',
        note: 'La reconciliación encontró huérfanas, marcas vencidas o difusiones sin recibo',
      },
    },
  },
  storage_quota_exceeded: {
    category: 'system',
    level: 'error',
    description: 'Cuota de `chrome.storage.local` agotada: la escritura se descartó (§2.15)',
  },
} as const satisfies Record<LogEventName, LogEventSpec>;

/** Nombre de un evento del catálogo. */
export type LogEvent = keyof typeof LOG_EVENT_SPECS;

/**
 * Comprobación de que la tabla cubre la unión cerrada `LogEventName` sin sobrantes: si un nombre
 * se añade a la unión sin declararlo arriba (o al revés), esta asignación deja de compilar.
 */
const SPECS_ARE_COMPLETE: Record<LogEventName, LogEventSpec> = LOG_EVENT_SPECS;
void SPECS_ARE_COMPLETE;

/**
 * **Los 24 nombres del catálogo**, en el orden del corpus. Es la lista que consume el panel de
 * actividad y la que fija el conteo exacto exigido por la tarea 5.5.
 */
export const LOG_EVENT_NAMES = Object.keys(LOG_EVENT_SPECS) as readonly LogEventName[];

/** Número exacto de eventos del catálogo: **24**. */
export const LOG_EVENT_COUNT = 24 as const;

/** Número exacto de categorías: **5**. */
export const LOG_CATEGORY_COUNT = 5 as const;

/** Número exacto de niveles: **4**. */
export const LOG_LEVEL_COUNT = 4 as const;

// ---------------------------------------------------------------------------
// Consultas del catálogo
// ---------------------------------------------------------------------------

/**
 * ¿Es `value` un evento del catálogo cerrado? Un valor fuera del enum —incluida una CATEGORÍA
 * usada como si fuera un evento, el defecto que corrige ACU-04— devuelve `false`.
 */
export const isLogEventName = (value: unknown): value is LogEventName =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(LOG_EVENT_SPECS, value);

/** Especificación del evento; `undefined` si no pertenece al catálogo. */
export const logEventSpec = (event: string): LogEventSpec | undefined => {
  const specs: Record<string, LogEventSpec> = LOG_EVENT_SPECS;
  return specs[event];
};

/** Variantes declaradas de un evento, o un mapa vacío si no declara ninguna. */
const variantsOf = (spec: LogEventSpec): Readonly<Record<string, LogEventVariant>> =>
  spec.variants ?? {};

/** Variante declarada de un evento, o `undefined` si esa variante no está admitida. */
export const logEventVariant = (event: string, variant: string): LogEventVariant | undefined =>
  variantsOf(logEventSpec(event) ?? { category: 'system', level: 'error', description: '' })[
    variant
  ];

/** Categoría CANÓNICA (primaria) del evento. */
export const canonicalCategoryFor = (event: LogEventName): LogCategory =>
  LOG_EVENT_SPECS[event].category;

/** Nivel por DEFECTO del evento. */
export const defaultLogLevelFor = (event: LogEventName): LogLevel => LOG_EVENT_SPECS[event].level;

/** Descripción del evento (base de los mensajes legibles de M30). */
export const logEventDescription = (event: LogEventName): string =>
  LOG_EVENT_SPECS[event].description;

/** Todas las categorías admitidas para un evento (la primaria primero). */
export const categoriesFor = (event: LogEventName): readonly LogCategory[] => {
  const spec: LogEventSpec = LOG_EVENT_SPECS[event];
  return [spec.category, ...Object.values(variantsOf(spec)).map((variant) => variant.category)];
};

/** Todos los niveles admitidos para un evento (el de por defecto primero). */
export const levelsFor = (event: LogEventName): readonly LogLevel[] => {
  const spec: LogEventSpec = LOG_EVENT_SPECS[event];
  return [spec.level, ...Object.values(variantsOf(spec)).map((variant) => variant.level)];
};

/**
 * Ubica una pareja `(category, level)` en el catálogo de un evento.
 *
 * Devuelve la variante declarada que coincide **exactamente**; si ninguna coincide, la
 * especificación primaria. Es la operación que usa M30 para clasificar una entrada de log: el
 * resultado SIEMPRE es una pareja declarada, de modo que ninguna entrada escrita puede llevar una
 * `category` o un `level` inventados.
 */
export const resolveLogPlacement = (
  event: LogEventName,
  category: LogCategory,
  level: LogLevel,
): LogEventVariant => {
  const spec: LogEventSpec = LOG_EVENT_SPECS[event];
  if (spec.category === category && spec.level === level) {
    return { category: spec.category, level: spec.level, note: 'primary' };
  }
  const match = Object.values(variantsOf(spec)).find(
    (variant) => variant.category === category && variant.level === level,
  );
  return match ?? { category: spec.category, level: spec.level, note: 'primary' };
};

// ---------------------------------------------------------------------------
// Clasificación por defecto de cada entrada
// ---------------------------------------------------------------------------

/** Clave de variante derivada del `level` para los eventos que declaran variantes por nivel. */
const VARIANT_BY_LEVEL: Record<string, string> = { warn: 'warn', error: 'error' };

/**
 * Pareja `(category, level)` por defecto de una entrada, a partir del evento y del nivel pedido.
 *
 * - `null` como nivel ⇒ nivel por defecto del catálogo.
 * - Con `variant` explícita ⇒ esa variante (o la primaria si no está admitida).
 * - Sin `variant` ⇒ si el nivel coincide con una variante declarada de ese nivel, se adopta (es
 *   el caso de `approval_resolved`/`sw_reconcile` en `warn`); si no, la primaria.
 * - Evento fuera del catálogo ⇒ `system`/`error` (situación de código inválido, §2.11).
 */
export const placementForEntry = (
  event: string,
  level: LogLevel | null,
  variant?: string,
): LogEventVariant => {
  if (!isLogEventName(event)) {
    return RPC_ERROR_CODE_VIOLATION;
  }
  const spec: LogEventSpec = LOG_EVENT_SPECS[event];
  if (variant !== undefined) {
    return (
      logEventVariant(event, variant) ?? {
        category: spec.category,
        level: spec.level,
        note: 'primary',
      }
    );
  }
  const effective: LogLevel = level ?? spec.level;
  const byLevel = variantsOf(spec)[VARIANT_BY_LEVEL[effective] ?? ''];
  if (byLevel !== undefined && byLevel.level === effective) {
    return byLevel;
  }
  return { category: spec.category, level: effective, note: 'primary' };
};

// ---------------------------------------------------------------------------
// Puente con el catálogo de eventos del provider (EIP-1193, M27/M31)
// ---------------------------------------------------------------------------

/** Eventos del provider que tienen un evento de log propio; el resto se registra como `event_emit`. */
const PROVIDER_EVENT_TO_LOG_EVENT: Readonly<Record<string, LogEventName>> = {
  chainChanged: 'chain_changed',
  accountsChanged: 'accounts_changed',
  connect: 'event_emit',
  disconnect: 'event_emit',
  message: 'event_emit',
};

/**
 * Evento del catálogo con el que se instrumenta un evento del provider (§3.6): `chainChanged` y
 * `accountsChanged` tienen nombre propio y los demás se registran como `event_emit`. Un nombre
 * ajeno al catálogo del provider cae a `event_emit`, que es el evento genérico de propagación.
 */
export const logEventForProviderEvent = (providerEvent: string): LogEventName =>
  PROVIDER_EVENT_TO_LOG_EVENT[providerEvent] ?? 'event_emit';
