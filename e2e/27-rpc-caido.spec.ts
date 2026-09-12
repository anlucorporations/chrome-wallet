/**
 * `e2e/27-rpc-caido.spec.ts` — Anvil detenido → `4900` y almacén intacto (H3, tarea 3.16).
 *
 * §3.3.7: «`27-rpc-caido.spec.ts` (Anvil detenido → `4900`)»; §3.3.6 `CA-RF-18` y RNF-07: con el
 * nodo caído, la política CERRADA de M5 agota **4 llamadas** (1 + 3) con backoff **1/2/4 s**, la
 * página recibe `4900` con el literal de §4.3, la UI queda «desconectado» y el **almacén no se
 * toca**.
 *
 * La prueba DETIENE el proceso `anvil.exe` del proyecto y lo DEVUELVE a su estado al terminar
 * (bloque `finally`): deja el nodo arrancado y comprueba que responde `0x7a69` antes de salir.
 * Evidencia: `rpc-caido-<fecha>.log`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EVIDENCE_DIR,
  RUN_DATE,
  anvilPids,
  anvilResponde,
  arrancarAnvil,
  detenerAnvil,
  distDisponible,
  esperarAnvil,
  expect,
  getBackgroundWorker,
  llamarDesdeLaExtension,
  openPopupReady,
  readChromeStorage,
  test,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Respuesta de error observable del canal. */
interface RespuestaDeError {
  error?: { code?: number; message?: string; data?: Record<string, unknown> };
  result?: unknown;
}

test.describe('27 · RPC caído: 4900, UI desconectada y almacén intacto', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('con Anvil detenido la lectura responde 4900 tras 4 intentos y el almacén no cambia', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);

    await seedWallet(background);
    const popup = await openPopupReady(context, extensionId);

    // El punto de partida es un nodo VIVO: sin él la prueba no mediría nada.
    expect(await anvilResponde(), 'Anvil no responde antes de empezar: no se puede medir el 4900').toBe(
      true,
    );

    const antes = await readChromeStorage(background, null);
    const pidsDetenidos = detenerAnvil();
    const lineas: string[] = [
      `# Evidencia 27-rpc-caido — ${RUN_DATE}`,
      `Anvil detenido (PIDs): ${pidsDetenidos.join(', ') || '(ninguno)'}`,
    ];
    let restaurado = false;
    let fallo: unknown = null;

    try {
      await expect
        .poll(anvilResponde, { message: 'Anvil siguió respondiendo', timeout: 20_000 })
        .toBe(false);
      lineas.push('Anvil confirmado caído: http://127.0.0.1:8545 deja de responder (condición observada).');

      // --- La lectura de página falla con el error tipado del catálogo --------------------------
      const inicio = Date.now();
      const respuesta = (await llamarDesdeLaExtension(popup, 'eth_chainId')) as RespuestaDeError;
      const transcurrido = Date.now() - inicio;

      lineas.push(
        `eth_chainId con el nodo caído: ${JSON.stringify(respuesta)} en ${transcurrido} ms`,
      );
      expect(respuesta.error?.code).toBe(4900);
      expect(respuesta.error?.message).toBe('Sin conexión con la red local (Anvil).');
      // El diagnóstico declara la política cerrada: 4 intentos y backoff 1/2/4 s.
      expect(respuesta.error?.data?.attempts).toBe(4);
      expect(respuesta.error?.data?.retries).toBe(3);
      expect(respuesta.error?.data?.backoffMs).toEqual([1_000, 2_000, 4_000]);
      // `reason` es diagnóstico: en el navegador el fallo de transporte de `fetch` no lleva el
      // `code` de Node (`ECONNREFUSED`), así que se admite el motivo de error RPC. Un `timeout`
      // aquí significaría que el nodo seguía aceptando la conexión.
      expect(['rpc-error', 'transport']).toContain(respuesta.error?.data?.reason);
      // 1+2+4 s de backoff: la magnitud se mide, no se supone.
      expect(transcurrido, 'la política de reintentos no esperó el backoff completo').toBeGreaterThanOrEqual(
        6_900,
      );

      // --- La UI queda «desconectado» sin perder los datos ya leídos ----------------------------
      await expect(popup.getByText(/sin respuesta del nodo local/i)).toBeVisible({ timeout: 40_000 });
      lineas.push('UI: el popup muestra «Desconectado: sin respuesta del nodo local».');

      // --- El almacén de la CARTERA queda INTACTO (RNF-07) -------------------------------------
      const swDespues = await getBackgroundWorker(context);
      const despues = await readChromeStorage(swDespues, null);
      /**
       * Claves de la OBSERVABILIDAD, excluidas a propósito desde H5: el Service Worker escribe
       * **una traza por llamada del catálogo** (`rpc_call`/`rpc_error`, `CA-RF-28`) y su contador de
       * descartes por cuota (`truekeate_logs_dropped`, §2.15), así que estas claves **cambian por
       * diseño** —también con el nodo caído, que es justo lo que hay que registrar—. Lo que RNF-07
       * exige es que no se pierda ni se modifique el estado de la CARTERA, que se comprueba abajo.
       */
      const CLAVES_OBSERVABILIDAD = ['truekeate_logs', 'truekeate_logs_dropped'];
      const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(
        (clave) => !CLAVES_OBSERVABILIDAD.includes(clave),
      );
      const cambiadas = claves.filter(
        (clave) => JSON.stringify(antes[clave]) !== JSON.stringify(despues[clave]),
      );
      lineas.push(
        `Claves comparadas (sin ${CLAVES_OBSERVABILIDAD.join(', ')}): ${claves.length}; cambiadas: ${cambiadas.join(', ') || 'ninguna'}`,
      );
      expect(cambiadas, 'el RPC caído modificó el almacén').toEqual([]);
      // Y el estado de cartera sigue ahí: nada se ha perdido.
      expect(despues.truekeate_accounts).toEqual(antes.truekeate_accounts);
    } catch (error) {
      fallo = error;
    } finally {
      // Restauración OBLIGATORIA: Anvil vuelve a estar en marcha para el resto de la suite.
      arrancarAnvil();
      restaurado = await esperarAnvil(30_000);
      lineas.push(`Anvil restaurado: ${restaurado ? 'OK (chainId 0x7a69)' : 'FALLO'}`);

      if (restaurado) {
        const recuperacion = (await llamarDesdeLaExtension(popup, 'eth_chainId')) as RespuestaDeError;
        lineas.push(`eth_chainId tras restaurar Anvil: ${JSON.stringify(recuperacion)}`);
        expect(recuperacion.result).toBe('0x7a69');
      }

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        join(EVIDENCE_DIR, `rpc-caido-${RUN_DATE}.log`),
        `${lineas.join('\n')}\n`,
        'utf8',
      );
      if (!restaurado) {
        throw new Error('[27-rpc-caido] Anvil NO se pudo restaurar: el nodo queda caído');
      }
    }

    if (fallo !== null) {
      throw fallo;
    }
    expect(anvilPids().length, 'Anvil debe quedar en marcha al terminar la prueba').toBeGreaterThan(0);
  });
});
