/**
 * `e2e/14-polling.spec.ts` — Contador REAL de llamadas por ciclo (H3, tarea 3.16).
 *
 * §3.3.7: «`14-polling.spec.ts`»; §3.3.6 `CA-RF-27` y §3.3.8 («un contador mayor que 1 RPC por
 * cuenta visible invalida el hito»): el popup publica sus contadores del polling como atributos
 * `data-polling-requests` / `data-polling-cycles` de `#panel-accounts`, de modo que la relación
 * «1 `eth_getBalance` por cuenta VISIBLE y ciclo» se mide sobre el producto y no sobre un doble.
 *
 * El test exige una instantánea CONSISTENTE (`requests === cycles × 5`), que solo existe en el
 * límite entre ciclos: si el polling emitiera 2 RPC por cuenta, esa igualdad no se cumpliría nunca
 * y el test agotaría el plazo. Además comprueba que cerrar la vista PARA el ciclo (el contador no
 * avanza mientras la vista está cerrada) y que el periodo es de 5 s.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EVIDENCE_DIR,
  RUN_DATE,
  distDisponible,
  expect,
  leerContadoresDePolling,
  openPopupReady,
  test,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuentas visibles de la cartera sembrada (`ANVIL_ADDRESSES.slice(0, 5)`). */
const CUENTAS_VISIBLES = 5;

/** Instantánea consistente del contador: `requests === cycles × cuentas visibles`. */
interface Instantanea {
  requests: number;
  cycles: number;
  medidoEn: number;
}

test.describe('14 · Polling de saldos: 1 RPC por cuenta visible y ciclo', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el contador real del popup marca 5 RPC por ciclo, arranca y para con la vista', async ({
    background,
    context,
    extensionId,
  }) => {
    await seedWallet(background);
    const popup = await openPopupReady(context, extensionId);

    /** Espera una instantánea consistente con `cycles > minCiclos` y la devuelve. */
    const esperarInstantanea = async (minCiclos: number, timeout = 30_000): Promise<Instantanea> => {
      let capturada: Instantanea | null = null;
      await expect
        .poll(
          async () => {
            const contadores = await leerContadoresDePolling(popup);
            if (contadores.requests === null || contadores.cycles === null) {
              return 'vista cerrada';
            }
            if (contadores.cycles <= minCiclos) {
              return `esperando ciclos (${contadores.cycles})`;
            }
            if (contadores.requests !== contadores.cycles * CUENTAS_VISIBLES) {
              return `contador inconsistente: ${contadores.requests} RPC en ${contadores.cycles} ciclos`;
            }
            capturada = {
              requests: contadores.requests,
              cycles: contadores.cycles,
              medidoEn: Date.now(),
            };
            return 'consistente';
          },
          { message: 'nunca se observó 1 RPC por cuenta visible y ciclo', timeout },
        )
        .toBe('consistente');
      if (capturada === null) {
        throw new Error('[14-polling] no se pudo capturar la instantánea consistente');
      }
      return capturada;
    };

    // --- El ciclo arranca al abrir la vista y emite 5 RPC por ciclo --------------------------------
    const primera = await esperarInstantanea(0);
    expect(primera.requests).toBe(primera.cycles * CUENTAS_VISIBLES);

    const segunda = await esperarInstantanea(primera.cycles);
    expect(segunda.cycles - primera.cycles).toBeGreaterThanOrEqual(1);
    expect(segunda.requests - primera.requests).toBe(
      (segunda.cycles - primera.cycles) * CUENTAS_VISIBLES,
    );
    // El periodo es de 5 s: el ciclo siguiente NO llega antes de 4 s.
    expect(segunda.medidoEn - primera.medidoEn).toBeGreaterThanOrEqual(4_000);

    // --- Cerrar la vista (pestaña «Recibir») quita los contadores y PARA el ciclo ------------------
    await popup.getByRole('tab', { name: 'Recibir' }).click();
    await expect
      .poll(async () => leerContadoresDePolling(popup), { timeout: 15_000 })
      .toEqual({ requests: null, cycles: null });

    // Condición observable del «parado»: transcurre MÁS de un periodo con la vista cerrada. No hay
    // atributo que observar porque la vista no está montada; se deja correr el reloj del navegador.
    await popup.evaluate(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 6_500);
        }),
    );

    // --- Volver a la vista: EXACTAMENTE un ciclo nuevo (no los que habrían corrido ocultos) -------
    await popup.getByRole('tab', { name: 'Cuentas' }).click();
    const reanudada: { valor: { requests: number; cycles: number } | null } = { valor: null };
    await expect
      .poll(
        async () => {
          const contadores = await leerContadoresDePolling(popup);
          if (contadores.requests === null || contadores.cycles === null) {
            return 'vista cerrada';
          }
          if (contadores.cycles <= segunda.cycles) {
            return `esperando el ciclo de reanudación (${contadores.cycles})`;
          }
          reanudada.valor = { requests: contadores.requests, cycles: contadores.cycles };
          return 'reanudada';
        },
        { message: 'el ciclo no se reanudó al volver a la vista de Cuentas', timeout: 20_000 },
      )
      .toBe('reanudada');

    expect(reanudada.valor).not.toBeNull();
    expect(reanudada.valor?.cycles, 'con la vista cerrada no puede haber ciclos de más').toBe(
      segunda.cycles + 1,
    );
    expect(reanudada.valor?.requests).toBe(segunda.requests + CUENTAS_VISIBLES);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `14-polling-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'polling: contador real por ciclo',
          fecha: RUN_DATE,
          cuentasVisibles: CUENTAS_VISIBLES,
          instantaneaInicial: primera,
          instantaneaSiguiente: segunda,
          rpcPorCiclo: (segunda.requests - primera.requests) / (segunda.cycles - primera.cycles),
          periodoObservadoMs: segunda.medidoEn - primera.medidoEn,
          trasCerrarYReabrirLaVista: reanudada.valor,
          ciclosConLaVistaCerrada: 0,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });
});
