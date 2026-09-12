/**
 * M66 — `src/shared/i18n.ts`
 * Textos de UI en **español** centralizados (`CA-RT-10` / RF-34), compartidos por las CUATRO
 * superficies del producto: popup, `connect.html`, `notification.html` y la dApp de pruebas.
 *
 * POR QUÉ EXISTE (tarea 6.4 del plan §3.6.5)
 * ------------------------------------------
 * Hasta H5 cada componente escribía sus propias cadenas. Eso hace imposible comprobar de una vez
 * «qué textos ve el usuario» y garantizar que los avisos de RNF-23 (primer arranque, «Acerca de» y
 * antes de la primera firma) dicen exactamente lo mismo en todas las superficies. Aquí viven las
 * cadenas que **cruzan más de un fichero** o que la suite comprueba literalmente.
 *
 * ALCANCE (deliberadamente estrecho)
 * ----------------------------------
 * - **NO** es un motor de internacionalización con catálogos por idioma: el producto se entrega en
 *   español (`CA-RT-10`) y un segundo idioma no forma parte del alcance de H6 (§3.6.2). Este módulo
 *   es la **fuente única del literal**, no un sistema de traducción.
 * - Un componente puede conservar sus propias cadenas locales cuando solo las usa él (`Aprobar`,
 *   `Rechazar`…). Lo que se garantiza aquí es que **no haya dos literales distintos para el mismo
 *   texto** ni ninguna superficie sin cubrir.
 * - La regla de `CA-RT-10` (cero texto visible en inglés) la comprueba `src/popup/i18n.spec.ts` con
 *   el AST de TypeScript, y los avisos de este módulo quedan dentro de su ámbito porque los
 *   consumen los tres directorios de UI.
 *
 * RNF-14: módulo **hoja** de la UI (no importa `ethers`, no habla con el Service Worker y no toca el
 * almacén). Solo depende de constantes puras y del formateador compartido.
 */

import { ETH_DISPLAY_DECIMALS } from './constants';
import { formatEthWithSymbol } from './format';
import type { LogEventName } from './types';

// ---------------------------------------------------------------------------
// Identidad de marca (identidad_visual.md §1, documento_tecnico.md §4.2.1)
// ---------------------------------------------------------------------------

/** Nombre del producto: un solo bloque, «T» y «K» mayúsculas (identidad_visual.md §1). */
export const NOMBRE_MARCA = 'TrueKeate';

/** Nombre completo, con el sustantivo de producto. */
export const NOMBRE_PRODUCTO = 'TrueKeate Wallet';

/**
 * Descriptor de marca **exacto** exigido por §8 de la identidad visual y por RNF-23:
 * `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`. Se escribe con barras verticales ASCII
 * (no con la barra partida `¦`) porque es el literal que comprueban los E2E.
 */
export const TAGLINE_MARCA = 'PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS';

/** Versión publicada del producto (`package.json` vía `src/manifest.ts`), sin la `v`. */
export const VERSION_PRODUCTO = '1.0.0';

// ---------------------------------------------------------------------------
// «Acerca de» (RNF-23 / tarea 6.3)
// ---------------------------------------------------------------------------

/** Título del diálogo y nombre accesible de la pantalla. */
export const ACERCA_DE_TITULO = 'Acerca de TrueKeate Wallet';

/** Etiqueta del botón que abre el diálogo (también es su nombre accesible). */
export const ACERCA_DE_BOTON = 'Acerca de';

/** Resumen del producto en una frase, sin jerga. */
export const ACERCA_DE_RESUMEN =
  'Monedero Ethereum no custodial para la red local de pruebas (Anvil). Practica con ETH de ' +
  'desarrollo: nunca con fondos reales.';

/**
 * Aviso de entorno del «Acerca de»: es el MISMO mensaje que el aviso no descartable del primer
 * arranque (RNF-23), y se repite aquí para que siga visible cuando alguien lo consulte más tarde.
 */
export const ACERCA_DE_AVISO =
  'Entorno de desarrollo — no usar con fondos reales. Esta cartera funciona sin contraseña y ' +
  'guarda el material de recuperación en el almacén local de la extensión.';

/** Licencias de los activos que viajan DENTRO del paquete (`public/fonts/LICENSE-*.txt`, OFL-1.1). */
export const LICENCIAS_EMPAQUETADAS: readonly { readonly nombre: string; readonly fichero: string }[] = [
  { nombre: 'Poppins', fichero: 'fonts/LICENSE-poppins.txt' },
  { nombre: 'Inter', fichero: 'fonts/LICENSE-inter.txt' },
  { nombre: 'JetBrains Mono', fichero: 'fonts/LICENSE-jetbrains-mono.txt' },
];

/** Encabezado de la sección de licencias y avisos legales. */
export const LICENCIAS_TITULO = 'Licencias y avisos legales';

/**
 * Ruta del fichero `NOTICE` en la RAÍZ del repositorio (tarea 6.5 del plan: `NOTICE` versionado
 * junto a `LICENSE`). No viaja dentro de `dist/` —Chrome no sirve ficheros sueltos de la raíz del
 * paquete—, así que el aviso se **declara** aquí y la auditoría de licencias se hace sobre los
 * activos que sí están empaquetados.
 */
export const NOTICE_FICHERO = 'NOTICE';

/** Nombre del fichero de licencia del proyecto. */
export const LICENCIA_FICHERO = 'LICENSE';

/** Texto de la auditoría de licencias que el «Acerca de» muestra al usuario. */
export const LICENCIAS_NOTAS: readonly string[] = [
  `El paquete incluye las licencias OFL-1.1 de las tipografías auto-hospedadas: ${LICENCIAS_EMPAQUETADAS.map(
    (licencia) => `${licencia.nombre} (${licencia.fichero})`,
  ).join(', ')}.`,
  `La licencia del proyecto (${LICENCIA_FICHERO}) y el fichero de avisos (${NOTICE_FICHERO}) se entregan con el repositorio.`,
  'No hay ninguna dependencia remota en tiempo de ejecución: la extensión no descarga código, tipografías ni hojas de estilo de terceros.',
];

/** Línea de la versión, para el pie del diálogo. */
export const ACERCA_DE_VERSION = `Versión ${VERSION_PRODUCTO}`;

// ---------------------------------------------------------------------------
// Aviso «antes de la primera firma» (RNF-23 / tarea 6.3)
// ---------------------------------------------------------------------------

/** Título del aviso que precede a la PRIMERA firma de la cartera. */
export const AVISO_PRIMERA_FIRMA_TITULO = 'Antes de tu primera firma';

/** Cuerpo del aviso: qué se firma, con qué cuenta y qué NO ocurre. */
export const AVISO_PRIMERA_FIRMA_CUERPO =
  'Vas a firmar con la clave que guarda esta extensión. El mensaje firmado no mueve fondos por sí ' +
  'solo, pero sí demuestra que controlas la cuenta: revisa el origen, la cuenta y el detalle antes ' +
  'de aprobar. TrueKeate nunca te pedirá la frase de recuperación ni la clave privada.';

/** Advertencia de entorno, inseparable del aviso (RNF-23). */
export const AVISO_PRIMERA_FIRMA_ENTORNO =
  'Esto es un entorno de desarrollo con red local: no firmes operaciones con fondos reales.';

/** Etiqueta de la casilla que desbloquea «Aprobar» en la primera firma. */
export const AVISO_PRIMERA_FIRMA_ACUSE =
  'He leído el aviso y quiero firmar por primera vez con esta cartera.';

/** Identificador de la casilla del aviso (no es texto visible). */
export const AVISO_PRIMERA_FIRMA_ACUSE_ID = 'tk-primera-firma-ack';

/**
 * Eventos de `truekeate_logs` que demuestran una firma **directa**. Son los del catálogo cerrado de
 * `LogEventName` que solo se escriben tras firmar.
 */
export const EVENTOS_DE_FIRMA: readonly LogEventName[] = ['sign_personal', 'sign_typed_data', 'tx_sent'];

/**
 * Métodos aprobables cuyo desenlace **aprobado** equivale a una firma (los cuatro que firman o
 * difunden una transacción). Los dos de red (`wallet_switchEthereumChain`,
 * `wallet_addEthereumChain`) también se aprueban, pero NO firman nada: no cuentan como firma.
 */
export const METODOS_QUE_FIRMAN: readonly string[] = [
  'personal_sign',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
];

/**
 * Entrada del registro reducida a lo que decide el aviso. Es el contrato entre el registro
 * (`truekeate_logs`, que escribe el Service Worker) y la UI que lo lee con `wallet_getLogs`.
 *
 * Los tres campos se copian de `LogEntry` tal cual: `method` es un campo de PRIMER NIVEL de la
 * entrada (no va dentro de `data`) y el desenlace (`status`) sí vive dentro de `data`.
 */
export interface EntradaDeFirma {
  /** Nombre del evento instrumentado (`LogEntry.event`). */
  evento: string;
  /** Método del catálogo al que se refiere la entrada (`LogEntry.method`), si lo hay. */
  metodo?: string;
  /** Datos publicados con el evento: payload REDACTADO de `LogEntry.data`. */
  datos?: unknown;
}

/** ¿Los datos de `approval_resolved` describen una solicitud APROBADA? */
const aprobadaEnLosDatos = (datos: unknown): boolean =>
  typeof datos === 'object' &&
  datos !== null &&
  (datos as { status?: unknown }).status === 'approved';

/**
 * ¿Alguna entrada del registro demuestra una firma anterior?
 *
 * Es el oráculo observable del aviso de RNF-23 (tarea 6.3). Se apoya en DOS señales del registro,
 * porque en este repositorio la firma de `personal_sign` se resuelve por el ciclo de aprobaciones y
 * puede no dejar su evento `sign_*`:
 *
 *  1. los eventos de firma **directa** ({@link EVENTOS_DE_FIRMA});
 *  2. `approval_resolved` con `status: 'approved'` (dentro de `data`) y un `method` de
 *     {@link METODOS_QUE_FIRMAN}: la aprobación humana de una firma o de una transacción. Estructura
 *     REAL medida en el arnés: `{ event: 'approval_resolved', method: 'personal_sign',
 *     data: { status: 'approved' } }`.
 *
 * El registro **sobrevive al reset** de la cartera (RF-32), así que el aviso no se repite tras
 * reiniciarla.
 */
export const yaFirmoAntes = (entradas: readonly EntradaDeFirma[]): boolean =>
  entradas.some((entrada) => {
    if ((EVENTOS_DE_FIRMA as readonly string[]).includes(entrada.evento)) {
      return true;
    }
    if (entrada.evento !== 'approval_resolved') {
      return false;
    }
    return (
      aprobadaEnLosDatos(entrada.datos) &&
      typeof entrada.metodo === 'string' &&
      METODOS_QUE_FIRMAN.includes(entrada.metodo)
    );
  });

// ---------------------------------------------------------------------------
// Formato de datos (RF-34 / CA-RT-10)
// ---------------------------------------------------------------------------

/** Ejemplo canónico del formato de importes: `1,0000 ETH` (4 decimales y coma española). */
export const IMPORTE_EJEMPLO = formatEthWithSymbol(1_000_000_000_000_000_000n);

/** Ejemplo canónico del formato de direcciones: `0x1234…abcd`. */
export const DIRECCION_EJEMPLO = '0x1234…abcd';
