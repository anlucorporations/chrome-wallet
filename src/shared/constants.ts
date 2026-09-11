/**
 * M57 — `src/shared/constants.ts`
 * Fuente ÚNICA de las constantes de build de TrueKeate Wallet.
 *
 * Reglas que este módulo respeta:
 * - Ninguna constante de tiempo compartida se declara dos veces: los módulos M2, M3, M6,
 *   M15, M20, M21, M33, M35, M36, M37 y M38 importan de aquí.
 * - Las constantes congeladas del limitador de tasa y de la marca NO son ajustes de
 *   `truekeate_settings`: viven en el código para que la UI no pueda debilitarlas
 *   (`diccionario_datos.md` §2.13, `entornos_globales.md` §3).
 * - `SIGN_TIMEOUT_MS`, `CONNECT_TIMEOUT_MS` y `REVEAL_HIDE_MS` se pueden inyectar por
 *   `import.meta.env.VITE_*` (solo para el arnés E2E), conservando SIEMPRE el valor de
 *   producción como valor por defecto (`documento_tecnico.md` §7.4.1.d).
 */

// ---------------------------------------------------------------------------
// Red local de pruebas (Foundry Anvil)
// ---------------------------------------------------------------------------

/** `chainId` de Anvil en hexadecimal. Fuente: `entornos_globales.md` §3. */
export const DEFAULT_CHAIN_ID = '0x7a69' as const;

/** `chainId` de Anvil en decimal (31337), derivado del anterior. */
export const DEFAULT_CHAIN_ID_DECIMAL = 31337 as const;

/** Endpoint JSON-RPC de la red local. Nunca se declara un host remoto (RE-04). */
export const DEFAULT_RPC_URL = 'http://127.0.0.1:8545' as const;

/** Nombre visible de la red por defecto (badge de red del popup). */
export const DEFAULT_CHAIN_NAME = 'Anvil Local' as const;

/** Símbolo y decimales de la moneda nativa de la red por defecto. */
export const DEFAULT_CHAIN_SYMBOL = 'ETH' as const;
export const DEFAULT_CHAIN_DECIMALS = 18 as const;

/** Marca de red de pruebas (color de aviso en la UI). */
export const DEFAULT_CHAIN_IS_TESTNET = true as const;

/**
 * Frase BIP-39 de Anvil. Es SOLO una pista de desarrollo (RF-12): nunca se persiste
 * como cartera del usuario ni se escribe en `truekeate_logs`.
 */
export const DEFAULT_MNEMONIC =
  'test test test test test test test test test test test junk' as const;

/** Cuentas derivadas al crear la cartera; el botón «Añadir cuenta» lo incrementa (RF-04). */
export const DERIVED_ACCOUNTS = 5 as const;

// ---------------------------------------------------------------------------
// Plazos (inyectables solo en pruebas; el valor de producción es el normativo)
// ---------------------------------------------------------------------------

/** Lee un override numérico de las variables de build y cae al valor de producción. */
const numericEnvOverride = (raw: unknown, fallback: number): number => {
  if (typeof raw !== 'string' || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Variables de build inyectadas por Vite. Se leen de forma defensiva e inequívoca (sin
 * `any`) para que el módulo compile con `strict` en cualquier orden de compilación.
 */
const buildEnv: Record<string, string | undefined> = import.meta.env as Record<
  string,
  string | undefined
>;

/** Plazo de firma/aprobación: 120 s de producción (RF-40). */
export const SIGN_TIMEOUT_MS = numericEnvOverride(buildEnv.VITE_SIGN_TIMEOUT_MS, 120_000);

/** Plazo de conexión de dApp: 60 s de producción (RF-40). */
export const CONNECT_TIMEOUT_MS = numericEnvOverride(buildEnv.VITE_CONNECT_TIMEOUT_MS, 60_000);

/** Red de seguridad de la capa inject/content: margen superior sobre el SW (H-07). */
export const TIMEOUT_SAFETY_MARGIN_MS = 5_000 as const;

/** Ocultado automático del material de recuperación revelado (RF-50, P-20). */
export const REVEAL_HIDE_MS = numericEnvOverride(buildEnv.VITE_REVEAL_HIDE_MS, 30_000);

/** Caducidad de la sesión de dApp desde `lastUsedAt`: 24 h renovables (RF-25, D-B). */
export const SESSION_TTL_MS = 86_400_000 as const;

/** TTL de la marca persistida de «transacción en vuelo»: 3 min (ADT-23 / D-R). */
export const INFLIGHT_TTL_MS = 180_000 as const;

/** Intervalo de polling de saldos del popup y de `connect.html` (RF-27). */
export const BALANCE_POLL_MS = 5_000 as const;

/** Máximo de cuentas polleadas por ciclo (RNF-03, H-21). */
export const BALANCE_POLL_MAX_ACCOUNTS = 10 as const;

/** Ventana deslizante del límite de solicitudes aprobables por origen. */
export const RATE_WINDOW_MS = 60_000 as const;

// ---------------------------------------------------------------------------
// Cotas de payload y de log
// ---------------------------------------------------------------------------

/**
 * Cota del payload aceptado por solicitud: 64 KiB. Por encima → `-32602`, sin persistir,
 * sin abrir ventana y sin entrar en la cola (ADT-21 / D-L).
 *
 * Nota de nomenclatura: el plan de desarrollo (`plan_desarrollo.md` §3.1.5, tarea 1.3)
 * nombra esta constante `PAYLOAD_MAX_BYTES`; el resto del corpus la nombra
 * `MAX_PAYLOAD_BYTES`. Se siguen las dos con una única fuente de verdad.
 */
export const MAX_PAYLOAD_BYTES = 65_536 as const;

/** Alias exigido por `plan_desarrollo.md` §3.1.5 (mismo valor, misma fuente). */
export const PAYLOAD_MAX_BYTES: number = MAX_PAYLOAD_BYTES;

/** Umbral de redacción de previews en reposo: por encima se guarda hash + longitud. */
export const PREVIEW_INLINE_MAX_BYTES = 4_096 as const;

/** Retención FIFO de `truekeate_logs` (global y por origen). */
export const logLimit = 500 as const;
export const logMaxPerOrigin = 200 as const;

// ---------------------------------------------------------------------------
// Cardinalidad de la cola de aprobaciones y limitador de tasa
// ---------------------------------------------------------------------------

/** Máximo global de solicitudes `pending` (H-18). */
export const pendingRequestsMax = 8 as const;
export const PENDING_REQUESTS_MAX: number = pendingRequestsMax;

/** Máximo de solicitudes `pending` por origen (aplica también a la conexión). */
export const pendingRequestsMaxPerOrigin = 1 as const;
export const PENDING_REQUESTS_MAX_PER_ORIGIN: number = pendingRequestsMaxPerOrigin;

/** Solicitudes aprobables por minuto y origen: rige el más estricto junto al bucket. */
export const pendingRequestsPerMinute = 6 as const;
export const PENDING_REQUESTS_PER_MINUTE: number = pendingRequestsPerMinute;

/** Capacidad del *token bucket* por origen (1 token = 1 llamada RPC de página). */
export const rateLimitBurst = 20 as const;

/** Recarga lineal del bucket por segundo. */
export const rateLimitRefillPerSecond = 5 as const;

/** Purga de entradas inactivas de `truekeate_rate_windows`: 10 min sin uso. */
export const rateWindowTtlMs = 600_000 as const;

/** *Debounce* máximo de escritura de la ventana de tasa de los métodos no aprobables. */
export const RATE_PERSIST_DEBOUNCE_MS = 1_000 as const;

// ---------------------------------------------------------------------------
// Identidad del provider (EIP-6963) y protocolo interno
// ---------------------------------------------------------------------------

/** Nombre CORTO de marca del anuncio EIP-6963. No es `manifest.name` (RT-13, D-A). */
export const PROVIDER_NAME = 'TrueKeate' as const;

/** RDNS del anuncio EIP-6963. Literal vinculante, no se abrevia ni se traduce. */
export const PROVIDER_RDNS = 'academy.codecrypto.truekeate' as const;

/**
 * UUID v4 literal y CONGELADO del provider (ADT-19 / D-N). Nunca se regenera por carga:
 * un UUID nuevo cambiaría la identidad de la extensión ante las dApp.
 */
export const PROVIDER_UUID = '9f2a4c1e-6b7d-4e0a-8c33-4f5b6d7e8a90' as const;

/** Nombres del objeto publicado en `window`: el provider y su alias, el MISMO objeto. */
export const PROVIDER_WINDOW_KEY = 'truekeate' as const;
export const PROVIDER_WINDOW_ALIAS = 'codecrypto' as const;

/** Puerto de larga vida `chrome.runtime.connect` (canal, NO *keep-alive*). */
export const APPROVAL_PORT_NAME = 'truekeate_approval' as const;

/** Prefijo de las alarmas de vencimiento: `truekeate_expire:<approvalId>`. */
export const EXPIRE_ALARM_PREFIX = 'truekeate_expire:' as const;

/** Origen lógico de los contextos de la propia extensión (popup, connect, notification). */
export const EXTENSION_ORIGIN = 'extension' as const;

/** Nombres de evento del provider EIP-1193 (catálogo cerrado de 5). */
export const PROVIDER_EVENTS = [
  'accountsChanged',
  'chainChanged',
  'connect',
  'disconnect',
  'message',
] as const;

/** Reintentos de reconexión del puerto: backoff 1/2/4/8/16 s con tope de 30 s (H-02). */
export const PORT_RECONNECT_BASE_MS = 1_000 as const;
export const PORT_RECONNECT_MAX_MS = 30_000 as const;

// ---------------------------------------------------------------------------
// Ampliación de H2 (M33/M57/M58..M62): cuentas, etiquetas, revelado y formato
// ---------------------------------------------------------------------------

/**
 * Política de portapapeles del revelado (P-20 / ADT-09, `documento_tecnico.md` §3.8,
 * `diccionario_datos.md` §3.10): al ocultarse el valor revelado, si el portapapeles **aún lo
 * contiene**, se sobrescribe con cadena vacía. La comparación se hace por `sha256` del valor
 * revelado, así que nunca se destruye contenido ajeno.
 */
export const CLIPBOARD_CLEAR_ON_HIDE = true as const;

/** Longitud máxima de una etiqueta de cuenta (derivada o importada): 32 caracteres. */
export const MAX_LABEL_LENGTH = 32 as const;

/** Decimales con los que la UI muestra los importes en ETH (RF-34, M62). */
export const ETH_DISPLAY_DECIMALS = 4 as const;

/**
 * Decimales máximos aceptados en un importe ETH tecleado por el usuario (M60). El corpus fija
 * el formato de ETH a 4 decimales (RF-34/M60); la cota es configurable por parámetro para no
 * cerrar la puerta a entradas de más precisión en hitos posteriores.
 */
export const ETH_AMOUNT_MAX_DECIMALS = 4 as const;

/** Decimales de la moneda nativa (18): base del paso de ETH a wei en M60. */
export const ETH_DECIMALS = 18 as const;

/** Recorte de direcciones y hashes: `0x1234…abcd` (M62, `identidad_visual.md` §5). */
export const ADDRESS_SHORT_PREFIX = 6 as const;
export const ADDRESS_SHORT_SUFFIX = 4 as const;

/** Carácter de elipsis del recorte (U+2026), no tres puntos. */
export const SHORT_ELLIPSIS = '…' as const;

/**
 * Orden del grupo de la curva secp256k1 (`n`). Solo se usa para comprobar el **rango** de una
 * clave privada (`0 < d < n`) en la validación estructural de M61: es aritmética, no
 * criptografía, y por eso puede vivir en la capa compartida que consume el popup.
 */
export const SECP256K1_N_HEX =
  '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141' as const;
