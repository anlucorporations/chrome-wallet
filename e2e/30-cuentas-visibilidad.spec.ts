/**
 * `e2e/30-cuentas-visibilidad.spec.ts` — Visibilidad de cuentas: **ocultar y volver a mostrar**
 * (Fase 4 · RF-06 / `CA-RF-06` / DEC-35).
 *
 * HUECO QUE CIERRA: hasta la Fase 4 la suite cubría crear, importar, derivar y renombrar
 * (`01-onboarding.spec.ts` y `02-cuentas.spec.ts`) pero **ninguna** prueba pulsaba el botón
 * «Ocultar»/«Mostrar» de `src/popup/components/AccountCard.tsx:85`, que es la ÚNICA vía de la
 * cartera para retirar una cuenta derivada de la lista (las derivadas no se eliminan nunca, RF-06)
 * y la que sostiene el final de `CA-RF-06`: «al ocultar una cuenta derivada, la cuenta puede volver
 * a mostrarse con la **misma dirección**».
 *
 * Lo que se verifica, superficie a superficie:
 *   `truekeate_settings.hiddenAccounts` para las derivadas y el campo `visible` de
 *   `truekeate_imported_accounts` para las importadas (`diccionario_datos.md` §2.10 y §2.3);
 *   el contador de la lista, la casilla «Mostrar también las ocultas (N)» y el mensaje de estado.
 *
 * Evidencia: `RepoTecnico/evidencia/Fase4/30-cuentas-visibilidad-<fecha>.json`.
 */

import { join } from 'node:path';
import {
  ADDRESS_KEY_TWO,
  ANVIL_ADDRESSES,
  KEY_TWO,
  seedWallet,
  storedAccounts,
  storedImported,
  storedValue,
} from './fixtures/h2';
import { DIST_DIR, archivarEvidencia, distDisponible, expect, openPopupReady, test } from './fixtures/extension';

/** Motivo del salto cuando falta el artefacto cargable. */
const MOTIVO_SIN_DIST = `no existe ${join(DIST_DIR, 'manifest.json')}: ejecuta «npm run build» antes de «npm run test:e2e»`;

/** Índice BIP-44 (0-based) de «Cuenta 3»: la derivada que se oculta en la primera prueba. */
const INDICE_CUENTA_TRES = 2;

/** Ajustes persistidos (`truekeate_settings`), leídos de la fuente de verdad. */
interface AjustesPersistidos {
  hiddenAccounts?: number[];
}

test.describe('30 · Visibilidad de cuentas: ocultar y volver a mostrar (RF-06 / CA-RF-06)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('ocultar una derivada la retira SIN borrar su derivación y «Mostrar» la devuelve con la MISMA dirección', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);

    const popup = await openPopupReady(context, extensionId);
    await expect(popup.locator('.tk-account')).toHaveCount(5);
    const cuentasAntesDelOcultado = await storedAccounts(background);

    // La tarjeta se localiza por su ETIQUETA (el `ref` no se pinta): es lo que hace el usuario.
    const tarjeta = popup.locator('.tk-account').filter({ hasText: 'Cuenta 3' });
    await expect(tarjeta).toHaveCount(1);
    await expect(tarjeta.locator('.tk-account__address')).toHaveAttribute(
      'title',
      ANVIL_ADDRESSES[INDICE_CUENTA_TRES],
    );

    await tarjeta.getByRole('button', { name: 'Ocultar' }).click();

    // 1. Mensaje de estado explícito y tarjeta retirada de la lista visible.
    await expect(popup.locator('.tk-status__message', { hasText: 'Cuenta ocultada.' })).toBeVisible();
    await expect(popup.locator('.tk-account')).toHaveCount(4);
    await expect(popup.locator('.tk-account').filter({ hasText: 'Cuenta 3' })).toHaveCount(0);

    // 2. `hiddenAccounts` es la clave canónica de la visibilidad de las DERIVADAS (RF-06 / DEC-35).
    const ajustes = (await storedValue(background, 'truekeate_settings')) as AjustesPersistidos;
    expect(ajustes.hiddenAccounts).toEqual([INDICE_CUENTA_TRES]);

    // 3. La derivación NO se borra: la dirección sigue en `truekeate_accounts`, en su orden.
    const cuentasOcultas = await storedAccounts(background);
    expect(cuentasOcultas).toEqual([...cuentasAntesDelOcultado]);
    expect(cuentasOcultas).toContain(ANVIL_ADDRESSES[INDICE_CUENTA_TRES]);

    // 4. La UI ofrece el recuento de ocultas y permite volver a pintarlas.
    const casilla = popup.locator('#ver-ocultas');
    await expect(casilla).toBeVisible();
    await expect(popup.locator('label[for="ver-ocultas"]')).toContainText('Mostrar también las ocultas (1)');

    await casilla.check();
    await expect(popup.locator('.tk-account')).toHaveCount(5);
    const tarjetaOculta = popup.locator('.tk-account').filter({ hasText: 'Cuenta 3' });
    await expect(tarjetaOculta).toBeVisible();
    await expect(tarjetaOculta.getByRole('button', { name: 'Mostrar' })).toBeVisible();

    // 5. «Mostrar» devuelve LA MISMA dirección (CA-RF-06) y limpia `hiddenAccounts`.
    await tarjetaOculta.getByRole('button', { name: 'Mostrar' }).click();
    await expect(
      popup.locator('.tk-status__message', { hasText: 'Cuenta visible de nuevo.' }),
    ).toBeVisible();
    await expect(popup.locator('.tk-account')).toHaveCount(5);
    await expect(popup.locator('#ver-ocultas')).toHaveCount(0);
    await expect(
      popup
        .locator('.tk-account')
        .filter({ hasText: 'Cuenta 3' })
        .locator('.tk-account__address'),
    ).toHaveAttribute('title', ANVIL_ADDRESSES[INDICE_CUENTA_TRES]);

    const ajustesFinales = (await storedValue(background, 'truekeate_settings')) as AjustesPersistidos;
    expect(ajustesFinales.hiddenAccounts).toEqual([]);
    expect(await storedAccounts(background)).toEqual([...cuentasAntesDelOcultado]);

    // 6. El ocultado SOBREVIVE a reabrir el popup: no es estado de UI (RNF-14).
    await tarjetaOculta.getByRole('button', { name: 'Ocultar' }).click();
    await expect(popup.locator('.tk-status__message', { hasText: 'Cuenta ocultada.' })).toBeVisible();
    await popup.reload();
    await expect(popup.locator('.tk-account')).toHaveCount(4);
    await expect(popup.locator('#ver-ocultas')).toBeVisible();
    await expect(popup.locator('label[for="ver-ocultas"]')).toContainText('Mostrar también las ocultas (1)');

    archivarEvidencia('30-cuentas-visibilidad', {
      flujo: 'ocultar y volver a mostrar una cuenta derivada',
      cuentasDerivadas: cuentasAntesDelOcultado.length,
      oculta: ANVIL_ADDRESSES[INDICE_CUENTA_TRES],
      indiceBip44: INDICE_CUENTA_TRES,
      hiddenAccountsTrasOcultar: [INDICE_CUENTA_TRES],
      hiddenAccountsTrasMostrar: [],
      direccionConservada: true,
      visibleTrasReabrir: false,
    });
  });

  test('ocultar una IMPORTADA marca `visible:false` sin borrar su clave privada y se restaura', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background, {
      imported: [{ address: ADDRESS_KEY_TWO, privateKey: KEY_TWO, label: 'Ahorros' }],
    });

    const popup = await openPopupReady(context, extensionId);
    await expect(popup.locator('.tk-account')).toHaveCount(6);

    const tarjeta = popup.locator('.tk-account').filter({ hasText: 'Ahorros' });
    await expect(tarjeta).toHaveCount(1);
    await tarjeta.getByRole('button', { name: 'Ocultar' }).click();

    await expect(popup.locator('.tk-status__message', { hasText: 'Cuenta ocultada.' })).toBeVisible();
    await expect(popup.locator('.tk-account')).toHaveCount(5);

    const importadaOculta = (await storedImported(background))[0];
    expect(importadaOculta?.visible, 'la importada oculta debe quedar con `visible:false`').toBe(false);
    // Ocultar es reversible: la clave privada y la dirección siguen intactas (no es un borrado).
    expect(importadaOculta?.privateKey).toBe(KEY_TWO);
    expect(importadaOculta?.address).toBe(ADDRESS_KEY_TWO);

    // La lista no la pinta, pero el recuento de ocultas la reconoce y se puede recuperar.
    await expect(popup.locator('label[for="ver-ocultas"]')).toContainText('Mostrar también las ocultas (1)');
    await popup.locator('#ver-ocultas').check();
    await expect(popup.locator('.tk-account')).toHaveCount(6);

    const tarjetaRecuperada = popup.locator('.tk-account').filter({ hasText: 'Ahorros' });
    await expect(tarjetaRecuperada.locator('.tk-account__kind')).toHaveText('importada');
    await tarjetaRecuperada.getByRole('button', { name: 'Mostrar' }).click();
    await expect(
      popup.locator('.tk-status__message', { hasText: 'Cuenta visible de nuevo.' }),
    ).toBeVisible();
    await expect(popup.locator('#ver-ocultas')).toHaveCount(0);

    const importadaVisible = (await storedImported(background))[0];
    expect(importadaVisible?.visible).toBe(true);
    expect(importadaVisible?.privateKey).toBe(KEY_TWO);
    expect(importadaVisible?.address).toBe(ADDRESS_KEY_TWO);

    archivarEvidencia('30-cuentas-visibilidad', {
      flujo: 'ocultar y volver a mostrar una cuenta importada',
      etiqueta: 'Ahorros',
      direccion: ADDRESS_KEY_TWO,
      visibleTrasOcultar: false,
      clavePrivadaConservada: true,
      visibleTrasMostrar: true,
    });
  });
});
