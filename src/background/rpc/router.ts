/**
 * M3 — `src/background/rpc/router.ts`
 * Esqueleto del router del Service Worker: recibe un `TRUEKEATE_RPC` ya validado por M20 y
 * decide qué hacer con él.
 *
 * Estado de H1 (andamiaje): el router aplica las dos guardas que ya están cerradas —el
 * `method` debe pertenecer al catálogo CERRADO y, además, estar IMPLEMENTADO— y responde
 * `4200 Unsupported method` cuando no lo está. Como el catálogo de H1 está vacío, HOY
 * toda llamada de página responde `4200`.
 *
 * Lo que NO hace todavía (hitos siguientes): `token bucket` y cardinalidad (H3/H5),
 * ventana de aprobación (H4), sesiones por origen (H3), llamadas al nodo (H3).
 */

import type { Eip1193Error, WalletMethod } from '../../shared/types';
import {
  guardSender,
  type DeclaredContext,
  type SenderLike,
  type TrustedSenderContext,
} from '../security/senderGuard';
import { getCatalogEntry, isCatalogMethod } from './catalog';
import { internalError, unsupportedMethodError } from './errors';

// Reexportación de la comprobación de nomenclatura canónica: el rechazo de una clave que no
// empieza por `truekeate_` se responde como error interno `-32603` (M33/M34, ACU-25).
export { canonicalKeyProblem } from '../state/schema';

/** Resultado discriminado del router. */
export type RouterResult =
  | { ok: true; result: unknown; context: TrustedSenderContext }
  | { ok: false; error: Eip1193Error; context: TrustedSenderContext | null };

/** Parámetros del router: el emisor real + los datos declarados (NO fiables). */
export interface HandleRpcRequestParams {
  sender: SenderLike;
  declared?: DeclaredContext;
  method: string;
  params?: unknown[];
}

/**
 * Único punto de entrada del router.
 *
 * Orden de comprobaciones:
 * 1. Guarda de emisor (M20): `sender.id`, allowlist de rutas y de métodos internos, y
 *    recálculo del `origin` SOLO desde `sender.origin` (D-J / ADT-07).
 * 2. Catálogo cerrado (M4): método no declarado o no implementado → `4200`.
 * 3. Ejecución del método: pendiente de H3/H4/H5; hoy inalcanzable.
 */
export const handleRPCRequest = async (
  input: HandleRpcRequestParams,
): Promise<RouterResult> => {
  const { sender, declared = {}, method, params = [] } = input;

  // 1. Guardas de emisor y de contexto.
  const guard = guardSender(sender, declared, isCatalogMethod(method) ? method : undefined);
  if (!guard.ok) {
    return { ok: false, error: guard.error, context: null };
  }
  const context = guard.context;

  // 2. Catálogo cerrado: fuera del catálogo o aún sin implementar → 4200.
  if (!isCatalogMethod(method)) {
    return { ok: false, error: unsupportedMethodError(), context };
  }
  const entry = getCatalogEntry(method);
  if (entry === undefined) {
    // Declarado pero no implementado: el catálogo de H1 está vacío, así que es el caso normal.
    return { ok: false, error: unsupportedMethodError(), context };
  }

  // 3. Ejecución real del método: llegar aquí exige que M4 tenga la entrada implementada.
  void params;
  return { ok: false, error: internalError({ reason: 'not-implemented', method }), context };
};

/** Firma tipada del método del catálogo, para cuando M4 los implemente. */
export type CatalogInvoker = (
  method: WalletMethod,
  params: unknown[],
  context: TrustedSenderContext,
) => Promise<unknown>;

/**
 * Punto de extensión reservado para H3..H5: cada hito rellena `CATALOG` (M4) sin cambiar
 * la forma del router. Se declara aquí para que el contrato quede fijado desde H1.
 */
export const createCatalogInvoker = (
  entries: Readonly<Partial<Record<WalletMethod, (params: unknown[], context: TrustedSenderContext) => Promise<unknown>>>>,
): CatalogInvoker => {
  return async (method, params, context) => {
    const invoke = entries[method];
    if (invoke === undefined) {
      throw unsupportedMethodError();
    }
    return invoke(params, context);
  };
};
