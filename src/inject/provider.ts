/**
 * M35 — `src/inject/provider.ts`
 * Objeto EIP-1193 publicado en la página: `request` / `on` / `removeListener`, con el `chainId`
 * y el `selectedAddress` **cacheados** y refrescados en cuanto llega un evento (H3, tareas 3.8 y
 * 3.9).
 *
 * FUENTE NORMATIVA
 * - `documento_tecnico.md` §5.1 (interfaz del provider inyectado) y §2.5.3 (`TruekeateProvider`).
 * - `diccionario_datos.md` §4.1 (protocolo del salto 1) y §4.3 (literales de error, fuente única).
 * - `plan_desarrollo.md` §3.3.5 (tareas 3.8 y 3.9) y §3.3.6 (`CA-RF-13`, `CA-RF-14`, `CA-RF-15`,
 *   `CA-RF-45`).
 *
 * CONTRATO CERRADO DE ESTE MÓDULO
 * 1. `request({ method, params })` devuelve **siempre** una promesa y **nunca lanza de forma
 *    síncrona**: ni con un `args` malformado, ni con `params` no clonables por `postMessage`.
 * 2. El catálogo del provider es **cerrado**: solo los 16 métodos de la unión `PageMethod` (M55)
 *    cruzan el puente; cualquier otro responde `4200` con el literal de §4.3 **sin** viaje de ida
 *    y vuelta (es el caso de `eth_sign`, retirado en H-11a/DEC-22).
 * 3. Sin puente con el content script (M38) no hay catálogo al que preguntar: se responde `4200`
 *    de inmediato en lugar de dejar la promesa colgada (`CA-RF-14`/`CA-RF-45`).
 * 4. Ningún secreto cruza `window.postMessage` (RNF-09): el provider solo transporta el método,
 *    los `params` y el resultado público que devuelve el Service Worker.
 *
 * El objeto publicado NO se puede sustituir ni borrar por la página: `inject/index.ts` (M37) lo
 * define con `Object.defineProperty(..., { writable: false, configurable: false })` (ADT-26/D-S).
 */

import {
  PROVIDER_EVENTS,
  PROVIDER_NAME,
  PROVIDER_RDNS,
  PROVIDER_UUID,
} from '../shared/constants';
import type {
  Address,
  ChainIdHex,
  Eip1193Error,
  Eip6963ProviderInfo,
  PageMethod,
  ProviderEventName,
  ProviderListener,
  RequestArguments,
  TruekeateProvider,
} from '../shared/types';

// ---------------------------------------------------------------------------
// Literales de error (diccionario_datos.md §4.3, FUENTE ÚNICA)
// ---------------------------------------------------------------------------

/**
 * Error EIP-1193 `4200` de la fila «Método fuera del catálogo» de §4.3. Es el MISMO literal que
 * devuelve el Service Worker desde M6 (`unsupportedMethodError`): la página no puede distinguir
 * de qué capa vino el rechazo, así que no hay dos mensajes para la misma causa.
 *
 * El bundle de `inject.js` no importa módulos del Service Worker (ADR-01 y §2.2: `inject.js` no
 * accede a `chrome.*` ni al almacén), de modo que este literal se transcribe aquí, fila a fila,
 * igual que hace el resto del corpus con `diccionario_datos.md` §4.3.
 */
export const UNSUPPORTED_METHOD_ERROR: Eip1193Error = {
  code: 4200,
  message: 'El método solicitado no está soportado por TrueKeate Wallet.',
};

/** Copia NUEVA del error `4200`: la página puede mutar el objeto que recibe. */
export const unsupportedMethodError = (): Eip1193Error => ({ ...UNSUPPORTED_METHOD_ERROR });

/**
 * Error EIP-1193 `4001` de la fila «Vencimiento del plazo» de §4.3, que la capa inject usa como
 * **red de seguridad** con margen superior sobre el Service Worker (H-07): si la respuesta no
 * llega nunca (SW destruido, content script recargado a mitad de una petición), la promesa de la
 * página se resuelve con el error tipado del catálogo en lugar de quedarse colgada para siempre.
 */
export const pageTimeoutError = (segundos: number): Eip1193Error => ({
  code: 4001,
  message: `El usuario no respondió en el plazo establecido (${segundos} s); la solicitud ha caducado.`,
});

/**
 * Error EIP-1193 `-32603` de la fila «Fallo no clasificado del SW» de §4.3, usado como error de
 * transporte cuando el mensaje no se puede entregar (p. ej. `params` con un valor no clonable,
 * que hacen fallar `postMessage` con `DataCloneError`). Nunca hay un error sin `code` (RNF-06).
 */
export const internalTransportError = (): Eip1193Error => ({
  code: -32603,
  message: 'Error interno de la cartera.',
});

// ---------------------------------------------------------------------------
// Catálogo CERRADO de métodos de página (espejo en ejecución de la unión `PageMethod`)
// ---------------------------------------------------------------------------

/**
 * Los **16** métodos que una página puede invocar (§4.3): las 10 lecturas de `PageReadMethod` y
 * los 6 aprobables de `ApprovalMethod`. `eth_sign` NO figura a propósito: está retirado del
 * catálogo y responde `4200` (H-11a / DEC-22).
 */
export const PAGE_METHODS = [
  'eth_requestAccounts',
  'eth_accounts',
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_feeHistory',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'personal_sign',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_revokePermissions',
] as const satisfies readonly PageMethod[];

/**
 * Verificación de exhaustividad en TIEMPO DE COMPILACIÓN: si la unión `PageMethod` (M55) gana un
 * método y esta lista no lo incorpora, `PageMethodsNotListed` deja de ser `never` y la constante
 * siguiente no compila. El catálogo del provider no puede quedarse atrás del contrato.
 */
type PageMethodsNotListed = Exclude<PageMethod, (typeof PAGE_METHODS)[number]>;
export const pageMethodCatalogIsComplete: [PageMethodsNotListed] extends [never] ? true : false =
  true;

/** ¿Es `method` uno de los métodos de la unión CERRADA `PageMethod` (M55)? */
export const isPageMethod = (method: string): method is PageMethod =>
  (PAGE_METHODS as readonly string[]).includes(method);

/** ¿Es `value` uno de los 5 eventos del catálogo cerrado EIP-1193? */
export const isProviderEvent = (value: unknown): value is ProviderEventName =>
  typeof value === 'string' && (PROVIDER_EVENTS as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Identidad EIP-6963 (valores vinculantes de RT-13 / D-A)
// ---------------------------------------------------------------------------

/** `info` del anuncio EIP-6963 (valores vinculantes de RT-13 / D-A). */
export const providerInfo = (icon: string): Eip6963ProviderInfo => ({
  uuid: PROVIDER_UUID,
  name: PROVIDER_NAME,
  icon,
  rdns: PROVIDER_RDNS,
});

// ---------------------------------------------------------------------------
// Puente con el content script (M38)
// ---------------------------------------------------------------------------

/**
 * Resultado de una petición del salto 1: **o** `result`, **o** `error`, nunca los dos
 * (`diccionario_datos.md` §4.1). El `error` es siempre un objeto EIP-1193 con `code`.
 */
export type ProviderRelayOutcome = { result: unknown } | { error: Eip1193Error };

/**
 * Puente del provider con el content script. Lo implementa `inject/index.ts` (M37) sobre
 * `window.postMessage` con `targetOrigin = location.origin`; se inyecta en la fábrica para que
 * M35 sea comprobable sin `window` y para que exista UNA sola instancia publicada.
 */
export interface ProviderRelay {
  /**
   * ¿Hay content script al otro lado del puente? Sin él no existe catálogo que consultar (el
   * provider se limita a publicar la superficie y a responder `4200`).
   */
  readonly attached: boolean;
  /**
   * Envía la petición al content script y espera su respuesta. **Nunca lanza y nunca deja la
   * promesa colgada**: resuelve `{ result }` o `{ error }` (con la red de seguridad de H-07 como
   * último recurso). El `id` de correlación y el sobre `TRUEKEATE_REQUEST` los construye el
   * puente (M37): M35 no conoce el protocolo de transporte.
   */
  send(method: PageMethod, params: unknown[]): Promise<ProviderRelayOutcome>;
}

// ---------------------------------------------------------------------------
// Fábrica del provider
// ---------------------------------------------------------------------------

/** Piezas devueltas por la fábrica: el provider y el emisor interno de eventos. */
export interface TruekeateProviderHandle {
  provider: TruekeateProvider;
  /** Emite un evento del catálogo a las escuchas de la página (uso interno del puente). */
  emit(eventName: ProviderEventName, data: unknown): void;
}

/** ¿Es un objeto plano utilizable como mensaje? */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Primera cuenta de un `accountsChanged`/`eth_accounts`; `null` si la lista viene vacía. */
const firstAccount = (value: unknown): Address | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const first: unknown = value[0];
  return typeof first === 'string' && first !== '' ? (first as Address) : null;
};

/** Lee `method` de los argumentos de `request` sin lanzar nunca. */
const readMethod = (args: unknown): string | null => {
  const record = asRecord(args);
  const method: unknown = record?.method;
  return typeof method === 'string' && method !== '' ? method : null;
};

/** Normaliza `params` a lista (el contrato admite lista u objeto; `postMessage` exige lista). */
const readParams = (args: unknown): unknown[] => {
  const record = asRecord(args);
  const params: unknown = record?.params;
  if (Array.isArray(params)) {
    return params;
  }
  // Un objeto de `params` (p. ej. `{ address, blockTag }`) se envuelve en una lista de uno para
  // no perderlo por el camino; el catálogo del SW decide si el método acepta esa forma.
  return params === undefined || params === null ? [] : [params];
};

/**
 * Construye el objeto provider y su emisor de eventos. Es una fábrica (y no un singleton de
 * módulo) para que `inject/index.ts` (M37) publique exactamente UNA instancia y su alias apunte
 * a ella.
 *
 * @param relay Puente con el content script. Si se omite (o su `attached` es `false`) el provider
 *   publica la superficie completa pero todo método responde `4200`: no hay catálogo alcanzable.
 */
export const createTruekeateProvider = (relay?: ProviderRelay): TruekeateProviderHandle => {
  /** Registro de escuchas por evento. Estado volátil del contexto de la página. */
  const listeners = new Map<ProviderEventName, Set<ProviderListener>>();

  const provider: TruekeateProvider = {
    isTrueKeate: true,
    chainId: null,
    selectedAddress: null,

    /**
     * Toda petición se resuelve como PROMESA y nunca lanza de forma síncrona. El orden de guardas
     * es: forma del argumento → catálogo cerrado local → puente disponible → transporte.
     */
    request(args: RequestArguments): Promise<unknown> {
      const method = readMethod(args);
      if (method === null || !isPageMethod(method)) {
        // Fuera del catálogo cerrado (incluido `eth_sign`): `4200` sin viaje de ida y vuelta.
        return Promise.reject(unsupportedMethodError());
      }
      if (relay === undefined || !relay.attached) {
        // Sin relay no hay catálogo remoto: se responde `4200` en lugar de colgar la promesa.
        return Promise.reject(unsupportedMethodError());
      }
      // El puente resuelve SIEMPRE (nunca rechaza): aquí solo se traduce a promesa EIP-1193.
      return relay.send(method, readParams(args)).then(
        (outcome) => {
          if ('error' in outcome) {
            throw outcome.error;
          }
          observeResponse(method, outcome.result);
          return outcome.result;
        },
        () => {
          // Defensa en profundidad: un puente que rechace se traduce a error tipado (RNF-06).
          throw internalTransportError();
        },
      );
    },

    on(eventName: ProviderEventName, listener: ProviderListener): TruekeateProvider {
      if (!isProviderEvent(eventName) || typeof listener !== 'function') {
        // Evento fuera del catálogo cerrado: se ignora sin romper la página.
        return provider;
      }
      const bucket = listeners.get(eventName) ?? new Set<ProviderListener>();
      bucket.add(listener);
      listeners.set(eventName, bucket);
      return provider;
    },

    removeListener(eventName: ProviderEventName, listener: ProviderListener): TruekeateProvider {
      if (!isProviderEvent(eventName)) {
        return provider;
      }
      listeners.get(eventName)?.delete(listener);
      return provider;
    },
  };

  /**
   * Refresca las cachés publicadas a partir de un evento del catálogo. Se ejecuta SIEMPRE, haya
   * o no escuchas registradas: `provider.chainId` y `provider.selectedAddress` son estado del
   * provider, no de las escuchas.
   */
  const observe = (eventName: ProviderEventName, data: unknown): void => {
    switch (eventName) {
      case 'chainChanged':
        provider.chainId = typeof data === 'string' ? (data as ChainIdHex) : null;
        break;
      case 'accountsChanged':
        provider.selectedAddress = firstAccount(data);
        break;
      case 'connect': {
        const chainId: unknown = asRecord(data)?.chainId;
        if (typeof chainId === 'string') {
          provider.chainId = chainId as ChainIdHex;
        }
        break;
      }
      case 'disconnect':
        // El provider deja de estar conectado a ninguna cadena (EIP-1193): se limpian las cachés.
        provider.chainId = null;
        provider.selectedAddress = null;
        break;
      case 'message':
      default:
        break;
    }
  };

  /**
   * Refresca las cachés con el resultado de una LECTURA ya respondida (`eth_chainId`,
   * `eth_accounts`, `eth_requestAccounts`), de modo que el estado cacheado sea coherente incluso
   * antes de que llegue el primer evento.
   */
  const observeResponse = (method: PageMethod, result: unknown): void => {
    if (method === 'eth_chainId' && typeof result === 'string') {
      provider.chainId = result as ChainIdHex;
      return;
    }
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
      provider.selectedAddress = firstAccount(result);
    }
  };

  /** Emite un evento del catálogo: primero refresca las cachés y luego avisa a las escuchas. */
  const emit = (eventName: ProviderEventName, data: unknown): void => {
    if (!isProviderEvent(eventName)) {
      return;
    }
    observe(eventName, data);
    const bucket = listeners.get(eventName);
    if (bucket === undefined) {
      return;
    }
    // Copia de la lista: una escucha puede darse de baja desde dentro de su propio callback.
    for (const listener of [...bucket]) {
      try {
        listener(data);
      } catch {
        // Una escucha hostil (o con un fallo propio) no puede romper el provider ni al resto.
      }
    }
  };

  return { provider, emit };
};
