/**
 * M33.b — `src/background/state/serialLock.ts`
 * Cerrojo FIFO de lectura-modificación-escritura (RMW) serializada sobre `chrome.storage.local`
 * (invariante H-08 de `documento_tecnico.md` §2.3 y `diccionario_datos.md` §2.8/§2.13).
 *
 * POR QUÉ ES UN MÓDULO PROPIO
 * Hasta la fase 4 el cerrojo vivía dentro de `approvals/queue.ts` y solo la cola lo usaba. La
 * auditoría de unitarias de la fase 4 midió que **`sessions.ts` (M26) y `connections.ts` (M26.b)
 * hacían su RMW sin cerrojo** —dos `touchSession` simultáneos del mismo origen, o dos altas de
 * `truekeate_connect_request` a la vez, podían perder una escritura— y que
 * `truekeate_connect_request` **nunca se purgaba**. Se extrae aquí el MISMO patrón (no uno nuevo)
 * para que los tres mapas se serialicen con la misma implementación, sin duplicar código.
 *
 * Naturaleza: es un cerrojo **volátil** y admisible, reconstruible en cada arranque del SW. NO es
 * fuente de verdad: la verdad vive siempre en el almacén.
 *
 * Requisitos: RF-16, RF-25, RF-37 (RNF-11, RNF-16).
 */

/** Cerrojo FIFO: encadena las tareas de lectura-modificación-escritura. */
export interface SerialLock {
  /**
   * Ejecuta `task` cuando todas las tareas anteriores hayan terminado. La promesa devuelta
   * resuelve o rechaza con el resultado de `task`; un fallo NO rompe la cadena.
   */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tareas encadenadas pendientes de terminar (diagnóstico y pruebas). */
  depth(): number;
}

/** Crea un cerrojo FIFO independiente. */
export const createSerialLock = (): SerialLock => {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(() => task());
      tail = result.then(
        () => {
          pending -= 1;
        },
        () => {
          pending -= 1;
        },
      );
      return result;
    },
    depth: () => pending,
  };
};
