/**
 * `e2e/26-avisos.spec.ts` — Avisos in-product de RNF-23 (tarea 6.3 del plan §3.6.5).
 *
 * QUÉ VERIFICA
 * ------------
 * Los **tres** avisos que exige el criterio, cada uno en la superficie donde toca:
 *
 *   1. **Primer arranque** (ya existía en H2, tarea 2.15): es **no descartable** —no se cierra con
 *      `Escape`, ni con un botón de cierre—, bloquea el resto de la interfaz y la aceptación queda
 *      registrada en `truekeate_settings.devNoticeAcceptedAt` (se comprueba DESDE el Service Worker).
 *   2. **«Acerca de»**: se abre desde la cabecera del popup, de `connect.html` y de
 *      `notification.html`; muestra el **logotipo horizontal**, la **tagline exacta**
 *      `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`, el aviso de entorno y las **licencias**
 *      empaquetadas con la referencia al `NOTICE`.
 *   3. **Antes de la primera firma**: aparece en la ventana única mientras `truekeate_logs` no
 *      demuestre ninguna firma anterior, explica qué se firma y **bloquea «Aprobar»** hasta marcar
 *      su acuse; cuando ya hay una firma en el registro, NO aparece.
 *
 * Evidencia: `RepoTecnico/evidencia/H6/26-avisos-<fecha>.json`.
 */

import {
  abrirPestanaDelPopup,
  aprobarEnLaVentana,
  archivarEvidencia,
  conectarDapp,
  distDisponible,
  esperarProvider,
  esperarResultadoDeFirma,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  openDapp,
  openExtensionPage,
  openPopup,
  openPopupReady,
  readChromeStorage,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Tagline exacta exigida por §8 de `identidad_visual.md` y por RNF-23. */
const TAGLINE = 'PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS';

/** Cuenta #0 de Anvil. */
const CUENTA_0 = ANVIL_ADDRESSES[0];

/** Texto de la ventana única que anuncia el bloqueo del aviso de primera firma. */
const BLOQUEO_PRIMERA_FIRMA = 'primera firma';

/** Lee el texto completo del diálogo «Acerca de» de una superficie. */
const textoDeAcercaDe = async (page: import('@playwright/test').Page): Promise<string> => {
  const dialogo = page.getByRole('dialog', { name: 'Acerca de TrueKeate Wallet' });
  await expect(dialogo).toBeVisible({ timeout: 15_000 });
  return (await dialogo.innerText()).replace(/\s+/g, ' ');
};

test.describe('26 · avisos in-product: primer arranque, «Acerca de» y primera firma (RNF-23)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el aviso del primer arranque es NO descartable y se registra al aceptarlo', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    // Cartera sembrada SIN el aviso aceptado: es el estado del primer arranque real.
    await seedWallet(background, { devNoticeAccepted: false });
    // Se abre el popup SIN el helper `openPopupReady`, que precisamente acepta el aviso: esta prueba
    // mide el aviso mismo.
    const popup = await openPopup(context, extensionId);

    const dialogo = popup.locator('.tk-dialog--notice');
    await expect(dialogo).toBeVisible({ timeout: 20_000 });
    await expect(dialogo).toContainText('Entorno de desarrollo — no usar con fondos reales');
    // Mientras bloquea, la interfaz de cartera NO está disponible (no se puede operar sin aceptar).
    await expect(popup.locator('.tk-tabs')).toHaveCount(0);

    // Es NO descartable: `Escape` no lo cierra y no hay ningún botón de cierre.
    await popup.keyboard.press('Escape');
    await expect(dialogo).toBeVisible();
    const cierres = await dialogo.locator('button').count();
    expect(cierres, 'el aviso del primer arranque no puede tener un botón de cierre').toBe(1);

    // La aceptación queda REGISTRADA en el almacén (leído desde el Service Worker).
    const antes = (await readChromeStorage(background, ['truekeate_settings'])).truekeate_settings;
    expect((antes as { devNoticeAcceptedAt?: unknown }).devNoticeAcceptedAt).toBeUndefined();

    await popup.getByRole('button', { name: 'He entendido, continuar' }).click();
    await expect(dialogo).toHaveCount(0);
    const despues = (await readChromeStorage(background, ['truekeate_settings'])).truekeate_settings;
    const aceptadoEn = (despues as { devNoticeAcceptedAt?: unknown }).devNoticeAcceptedAt;
    expect(typeof aceptadoEn === 'number' && aceptadoEn > 0).toBe(true);
    // Y la interfaz queda operativa: aparecen las pestañas.
    await expect(popup.getByRole('tab', { name: 'Cuentas' })).toBeVisible();

    archivarEvidencia('26-avisos', {
      avisoPrimerArranque: {
        texto: 'Entorno de desarrollo — no usar con fondos reales',
        descartable: false,
        bloqueaLaInterfaz: true,
        devNoticeAcceptedAt: aceptadoEn,
      },
    });
  });

  test('«Acerca de»: logotipo, tagline exacta, licencias y NOTICE en las tres ventanas', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background);

    // --- Popup: el botón vive en la cabecera y abre el diálogo --------------------------------
    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('button', { name: 'Acerca de' }).click();
    const textoPopup = await textoDeAcercaDe(popup);
    expect(textoPopup).toContain(TAGLINE);
    expect(textoPopup).toContain('Licencias y avisos legales');
    expect(textoPopup).toContain('OFL-1.1');
    expect(textoPopup).toContain('NOTICE');
    expect(textoPopup).toContain('LICENSE');
    expect(textoPopup).toContain('Entorno de desarrollo');
    expect(textoPopup).toContain('Versión');

    // El logotipo horizontal es el ACTIVO gráfico (nunca el wordmark retipeado).
    const logotipo = popup.getByRole('dialog').locator('img[src*="truekeate-titulo"]');
    await expect(logotipo).toBeVisible();
    // La tagline se pinta con el estilo de marca de §4 (mayúsculas con `letter-spacing`).
    const tagline = popup.locator('.tk-about__tagline');
    await expect(tagline).toHaveText(TAGLINE);
    const estiloTagline = await tagline.evaluate((nodo) => {
      const estilo = getComputedStyle(nodo);
      return { transform: estilo.textTransform, espaciado: estilo.letterSpacing, color: estilo.color };
    });
    expect(estiloTagline.transform).toBe('uppercase');
    expect(estiloTagline.espaciado).not.toBe('normal');
    // `--tk-navy-800` #1D2B57 sobre superficie clara: 13,68:1 (matriz de §2.4).
    expect(estiloTagline.color).toBe('rgb(29, 43, 87)');

    // `Escape` cierra el diálogo informativo (navegación por teclado, RNF-21).
    await popup.keyboard.press('Escape');
    await expect(popup.getByRole('dialog')).toHaveCount(0);

    // --- connect.html y notification.html: el mismo aviso --------------------------------------
    const textos: Record<string, string> = { popup: textoPopup };
    for (const ruta of ['connect.html', 'notification.html']) {
      const page = await openExtensionPage(context, extensionId, ruta);
      await page.getByRole('button', { name: 'Acerca de' }).click();
      textos[ruta] = await textoDeAcercaDe(page);
      expect(textos[ruta]).toContain(TAGLINE);
      expect(textos[ruta]).toContain('NOTICE');
      await page.close();
    }

    // --- La pantalla también es alcanzable desde una pestaña del popup ------------------------
    const seguridad = await abrirPestanaDelPopup(context, extensionId, 'Seguridad');
    await seguridad.getByRole('button', { name: 'Acerca de' }).click();
    expect(await textoDeAcercaDe(seguridad)).toContain(TAGLINE);

    archivarEvidencia('26-avisos', {
      acercaDe: {
        tagline: TAGLINE,
        logotipo: 'brand/truekeate-titulo.png',
        licencias: ['fonts/LICENSE-poppins.txt', 'fonts/LICENSE-inter.txt', 'fonts/LICENSE-jetbrains-mono.txt'],
        notice: 'NOTICE',
        superficies: Object.keys(textos),
      },
    });
  });

  test('antes de la primera firma: el aviso aparece, bloquea «Aprobar» y no reaparece', async ({
    context,
    background,
  }) => {
    test.setTimeout(300_000);
    // Cartera SIN registro de actividad: la cartera no ha firmado nunca.
    await seedWallet(background, { logs: [] });

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    const conexion = await conectarDapp(context, dapp, { indice: 0 });
    expect(conexion.ok, `la conexión de la dApp falló: ${conexion.resultado}`).toBe(true);

    await iniciarPeticionDeFirma(dapp, 'personal_sign', ['Primera firma de la cartera.', CUENTA_0]);
    const ventana = await esperarVentanaDeDecision(context);

    // --- El aviso está ANTES de las acciones y «Aprobar» queda bloqueado -----------------------
    const aviso = ventana.locator('[data-first-signature="true"]');
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText('Antes de tu primera firma');
    await expect(aviso).toContainText('no firmes operaciones con fondos reales');
    await expect(aviso).toContainText('frase de recuperación');

    const aprobar = ventana.getByRole('button', { name: 'Aprobar' });
    const rechazar = ventana.getByRole('button', { name: 'Rechazar' });
    await expect(aprobar).toBeDisabled();
    // «Rechazar» sigue disponible en todo momento: el aviso no puede atrapar al usuario.
    await expect(rechazar).toBeEnabled();
    await expect(ventana.getByText(BLOQUEO_PRIMERA_FIRMA, { exact: false }).first()).toBeVisible();

    // El acuse se marca SOLO con teclado (RNF-21) y entonces se habilita «Aprobar».
    const casilla = ventana.locator('#tk-primera-firma-ack');
    await casilla.focus();
    await ventana.keyboard.press('Space');
    await expect(casilla).toBeChecked();
    await expect(aprobar).toBeEnabled();

    archivarEvidencia('26-avisos', {
      primeraFirma: {
        avisoVisible: true,
        bloqueaAprobar: true,
        acusePorTeclado: true,
      },
    });

    // --- Se firma y el aviso NO reaparece en la firma siguiente -------------------------------
    await aprobarEnLaVentana(ventana);
    const primera = await esperarResultadoDeFirma(dapp);
    expect(primera.estado, `la primera firma falló: ${JSON.stringify(primera)}`).toBe('ok');

    await iniciarPeticionDeFirma(dapp, 'personal_sign', ['Segunda firma de la cartera.', CUENTA_0]);
    const segundaVentana = await esperarVentanaDeDecision(context);
    await expect(segundaVentana.getByRole('button', { name: 'Rechazar' })).toBeVisible({ timeout: 30_000 });
    await expect(segundaVentana.locator('[data-first-signature="true"]')).toHaveCount(0);
    await expect(segundaVentana.getByRole('button', { name: 'Aprobar' })).toBeEnabled();

    await aprobarEnLaVentana(segundaVentana);
    const segunda = await esperarResultadoDeFirma(dapp);
    expect(segunda.estado, `la segunda firma falló: ${JSON.stringify(segunda)}`).toBe('ok');

    archivarEvidencia('26-avisos', {
      primeraFirma: {
        avisoVisible: true,
        bloqueaAprobar: true,
        acusePorTeclado: true,
        reapareceEnLaSegunda: false,
      },
    });
  });
});
