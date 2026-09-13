/**
 * `e2e/34-revelado-plazo-30s.spec.ts` — El revelado se oculta SOLO, al agotarse los 30 s
 * (Fase 4 · RF-50 / `CA-RF-50`, P-20/ADT-06).
 *
 * HUECO QUE CIERRA: `25-recuperacion.spec.ts` demuestra la confirmación previa, el ocultado manual,
 * la pérdida de foco y el borrado del portapapeles, pero **nunca esperaba el plazo**: solo
 * comprobaba que la cuenta atrás pintaba `30|29 s`. La evidencia que el propio corpus exige
 * (`casos_uso.md` §CU-07: «`E2E: 25-recuperacion.spec.ts` — revelado y ocultado a los 30 s») no
 * existía. `REVEAL_HIDE_MS` NO es inyectable (es una constante de producto de 30 000 ms), así que
 * la prueba mide el plazo REAL con una condición observable —el valor desaparece del DOM— y
 * comprueba además que no se ocultó antes de tiempo.
 *
 * Evidencia: `RepoTecnico/evidencia/Fase4/34-revelado-plazo-30s-<fecha>.json`.
 */

import { join } from 'node:path';
import { ANVIL_MNEMONIC, seedWallet } from './fixtures/h2';
import {
  DIST_DIR,
  archivarEvidencia,
  distDisponible,
  expect,
  openPopupReady,
  test,
} from './fixtures/extension';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

/** Plazo de producción del revelado (`REVEAL_HIDE_MS`, P-20/ADT-06). NO se inyecta. */
const PLAZO_MS = 30_000;

/** Holgura inferior: por debajo de esto el valor se habría ocultado antes del plazo (defecto). */
const MINIMO_MS = 25_000;

/** Holgura superior: cota de la prueba, para no quedarse colgada si el temporizador no dispara. */
const MAXIMO_MS = 50_000;

test.describe('34 · Revelado: el valor se oculta solo a los 30 s (CA-RF-50 / P-20)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el revelado del mnemonic dura 30 s, se oculta SOLO con el aviso del plazo y vacía el portapapeles', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);
    const page = await openPopupReady(context, extensionId);

    await page.getByRole('tab', { name: 'Seguridad' }).click();
    await page.getByRole('button', { name: 'Revelar frase semilla' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Revelar frase semilla' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Acepto' }).click();

    const valor = page.locator('.tk-reveal__value');
    await expect(valor).toHaveText(ANVIL_MNEMONIC);
    // La cuenta atrás arranca en el plazo de producción.
    await expect(page.locator('.tk-reveal__countdown')).toHaveText(/^(30|29) s$/);

    // Se copia para que el ocultado tenga que borrar el portapapeles (política P-20).
    await page.getByRole('button', { name: 'Copiar' }).click();
    expect(await page.evaluate(async () => navigator.clipboard.readText())).toBe(ANVIL_MNEMONIC);

    const inicio = Date.now();
    // CONDICIÓN OBSERVABLE: el nodo de texto desaparece del DOM (no se oculta con CSS).
    await expect(valor).toHaveCount(0, { timeout: MAXIMO_MS });
    const transcurrido = Date.now() - inicio;

    // --- El plazo se respetó: ni antes (defecto de higiene) ni mucho después (temporizador roto) ---
    expect(
      transcurrido,
      `el valor se ocultó a los ${transcurrido} ms, antes del plazo de ${PLAZO_MS} ms`,
    ).toBeGreaterThanOrEqual(MINIMO_MS);
    expect(transcurrido, 'el temporizador del revelado no disparó en plazo').toBeLessThan(MAXIMO_MS);

    // El aviso nombra la causa exacta del ocultado.
    await expect(page.locator('.tk-status__message').first()).toContainText(
      'El plazo de 30 s ha terminado: el valor se ha ocultado.',
    );
    // Y el portapapeles queda vacío sin intervención del usuario.
    await expect
      .poll(async () => page.evaluate(async () => navigator.clipboard.readText()), {
        message: 'el portapapeles conservó la frase tras agotarse el plazo',
        timeout: 15_000,
      })
      .toBe('');

    // El valor NO reaparece solo: hay que volver a pedirlo con su confirmación explícita.
    await expect(page.locator('.tk-reveal__value')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revelar frase semilla' })).toBeVisible();

    archivarEvidencia('34-revelado-plazo-30s', {
      flujo: 'revelado del mnemonic ocultado por el plazo de 30 s',
      plazoDeProduccionMs: PLAZO_MS,
      transcurridoMs: transcurrido,
      seOcultoAntesDelPlazo: transcurrido < MINIMO_MS,
      avisoMostrado: 'El plazo de 30 s ha terminado: el valor se ha ocultado.',
      portapapelesVacio: true,
      valorDescartadoDelDom: true,
    });
  });
});
