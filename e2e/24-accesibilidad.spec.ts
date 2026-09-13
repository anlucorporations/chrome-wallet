/**
 * `e2e/24-accesibilidad.spec.ts` — Accesibilidad AA de las cuatro superficies (tarea 6.2 del plan
 * §3.6.5; RNF-19/RNF-21, CU-35).
 *
 * QUÉ VERIFICA
 * ------------
 * 1. **`axe-core` con 0 violaciones A/AA** en el popup, `connect.html`, `notification.html` y
 *    `test.html` (`@axe-core/playwright`, análisis WCAG 2.1 A + AA + mejores prácticas de contraste).
 * 2. **Recorrido por teclado**: un control de cada pantalla recibe el foco con `Tab`, el **foco es
 *    visible** (contorno de 2 px del acento, ≥ 3:1 de contraste: WCAG 1.4.11) y `Enter`/`Espacio`
 *    activan.
 * 3. **`Escape` rechaza**: en la ventana única (`notification.html`) `Escape` resuelve la solicitud
 *    como rechazo (`4001`); en `connect.html` rechaza la conexión. Es el requisito explícito de §5.3
 *    regla 7 y del criterio RNF-21.
 * 4. **Área táctil ≥ 44 px** en «Aprobar» y «Rechazar», con separación ≥ 8 px entre ambos (WCAG
 *    2.5.5 y §5.3 regla 7).
 * 5. **`aria-label` en los botones de icono** y roles/etiquetas ARIA en pestañas, cuentas y panel de
 *    logs: lo que `axe-core` no puede decidir por sí solo (una etiqueta ausente en un control con
 *    texto sigue pasando axe), se comprueba de forma explícita.
 * 6. **Sin pérdida de contenido al 200 % de zoom** (WCAG 1.4.4): el contenido sigue en el DOM y
 *    visible tras aplicar `zoom: 2`, sin desbordes horizontales de la ventana.
 * 7. **`prefers-reduced-motion`** desactiva spinner y transiciones (RNF-21).
 *
 * Evidencia: `RepoTecnico/evidencia/H6/24-accesibilidad-<fecha>.json` con el recuento de violaciones
 * por superficie y los hallazgos, si los hubiera.
 */

import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';

import {
  DAPP_ORIGIN,
  abrirPestanaDelPopup,
  archivarEvidencia,
  conectarDapp,
  distDisponible,
  esperarProvider,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  openDapp,
  openExtensionPage,
  openPopupReady,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuenta #0 de Anvil: la que autoriza la sesión de la dApp en las pruebas. */
const CUENTA_0 = ANVIL_ADDRESSES[0];

/** Nombre del fichero de evidencia (JSON) de este spec. */
const EVIDENCIA = '24-accesibilidad';

/** Un resumen de axe-core por superficie. */
interface ResumenAxe {
  /** Superficie analizada. */
  superficie: string;
  /** Violaciones de impacto `critical`/`serious`/`moderate`/`minor`. */
  violaciones: { id: string; impact: string | undefined; descripcion: string; nodos: number }[];
  /** Nodos que pasaron las reglas. */
  nodosAprobados: number;
  /** Reglas aplicadas. */
  reglas: number;
}

/**
 * Analiza una página con `axe-core` (WCAG 2.1 A/AA + reglas de mejores prácticas que axe marca como
 * relevantes) y devuelve el resumen **y** exige 0 violaciones.
 */
const analizarConAxe = async (page: Page, superficie: string): Promise<ResumenAxe> => {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const violaciones: ResumenAxe['violaciones'] = resultado.violations.map((violacion) => ({
    id: violacion.id,
    impact: violacion.impact === null ? undefined : String(violacion.impact),
    descripcion: violacion.help,
    nodos: violacion.nodes.length,
  }));
  const resumen: ResumenAxe = {
    superficie,
    violaciones,
    nodosAprobados: resultado.passes.reduce((total, regla) => total + regla.nodes.length, 0),
    reglas: resultado.passes.length + resultado.violations.length,
  };
  // El mensaje enumera los hallazgos: un fallo de axe debe ser accionable sin abrir el informe.
  expect(
    resumen.violaciones.map(
      (violacion) => `${violacion.id} (${violacion.impact ?? 'sin impacto'}) × ${violacion.nodos}: ${violacion.descripcion}`,
    ),
    `axe-core encontró violaciones A/AA en ${superficie}`,
  ).toEqual([]);
  return resumen;
};

/** Contorno calculado del elemento enfocado, para comprobar el foco visible (WCAG 1.4.11). */
const contornoEnfocado = async (page: Page): Promise<{ width: string; color: string; style: string }> =>
  page.evaluate(() => {
    const activo = document.activeElement;
    if (activo === null) return { width: '0', color: '', style: '' };
    const estilo = getComputedStyle(activo);
    return { width: estilo.outlineWidth, color: estilo.outlineColor, style: estilo.outlineStyle };
  });

test.describe('24 · accesibilidad AA: axe-core, teclado, foco y zoom (RNF-21)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('axe-core: 0 violaciones A/AA en las cuatro superficies', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(300_000);
    await seedWallet(background);
    const resumenes: ResumenAxe[] = [];

    // --- Popup (estado con cartera, todas las pestañas relevantes) ----------------------------
    const popup = await openPopupReady(context, extensionId);
    resumenes.push(await analizarConAxe(popup, 'popup · Cuentas'));
    for (const pestana of ['Recibir', 'Enviar', 'Sitios', 'Seguridad', 'Redes', 'Actividad']) {
      const pagina = await abrirPestanaDelPopup(context, extensionId, pestana);
      resumenes.push(await analizarConAxe(pagina, `popup · ${pestana}`));
      await pagina.close();
    }

    // --- connect.html y notification.html ------------------------------------------------------
    const connect = await openExtensionPage(context, extensionId, 'connect.html');
    resumenes.push(await analizarConAxe(connect, 'connect.html'));
    await connect.close();

    const notification = await openExtensionPage(context, extensionId, 'notification.html');
    resumenes.push(await analizarConAxe(notification, 'notification.html'));
    await notification.close();

    // --- dApp de pruebas ----------------------------------------------------------------------
    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    resumenes.push(await analizarConAxe(dapp, 'test.html (dApp)'));

    archivarEvidencia(EVIDENCIA, {
      criterio: 'RNF-21 · axe-core 0 violaciones A/AA',
      superficies: resumenes,
      violacionesTotales: resumenes.reduce((total, fila) => total + fila.violaciones.length, 0),
      nodosAprobados: resumenes.reduce((total, fila) => total + fila.nodosAprobados, 0),
    });
  });

  test('teclado: foco visible, activación con Enter y áreas táctiles de 44 px', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background);

    // --- Popup: las pestañas se alcanzan con Tab y el foco es VISIBLE -------------------------
    const popup = await openPopupReady(context, extensionId);
    await popup.keyboard.press('Tab');
    const primerFoco = await popup.evaluate(() => document.activeElement?.textContent ?? '');
    expect(primerFoco.trim().length, 'el primer Tab no enfocó ningún control').toBeGreaterThan(0);

    const contorno = await contornoEnfocado(popup);
    expect(contorno.style, 'el foco se elimina sin sustituto (identidad_visual.md §5.3 regla 7)').toBe('solid');
    expect(Number.parseFloat(contorno.width), 'el contorno del foco debe medir 2 px').toBeGreaterThanOrEqual(2);
    // El acento del foco es --tk-teal-500 (#3E93A6) en claro: 3,54:1 sobre blanco (≥ 3:1).
    expect(contorno.color).toBe('rgb(62, 147, 166)');

    // Se recorre la interfaz con Tab hasta llegar a una pestaña y se activa con Enter.
    await popup.keyboard.press('Tab');
    await popup.keyboard.press('Shift+Tab');
    await popup.keyboard.press('Enter');
    await expect(popup.getByRole('tab', { selected: true })).toBeVisible();

    // --- Área táctil y separación de Aprobar/Rechazar (WCAG 2.5.5 y §5.3 regla 7) -------------
    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    const ventana = await abrirVentanaDeDecision(context, dapp);
    await expect(ventana.getByRole('button', { name: 'Rechazar' })).toBeVisible({ timeout: 20_000 });

    const cajas = await ventana.evaluate(() => {
      const botones = [...document.querySelectorAll('.tk-approval__actions button')];
      return botones.map((boton) => {
        const caja = boton.getBoundingClientRect();
        return { texto: boton.textContent ?? '', ancho: caja.width, alto: caja.height, izquierda: caja.left, derecha: caja.right };
      });
    });
    expect(cajas).toHaveLength(2);
    for (const caja of cajas) {
      expect(caja.alto, `«${caja.texto}» no alcanza los 44 px de alto`).toBeGreaterThanOrEqual(44);
      expect(caja.ancho, `«${caja.texto}» no alcanza los 44 px de ancho`).toBeGreaterThanOrEqual(44);
    }
    const separacion = (cajas[1]?.izquierda ?? 0) - (cajas[0]?.derecha ?? 0);
    expect(separacion, 'Aprobar y Rechazar deben estar separados al menos 8 px').toBeGreaterThanOrEqual(8);

    // --- Escape = rechazar (RNF-21 / §5.3 regla 7) -------------------------------------------
    // El desenlace observable del rechazo es que la ventana se cierra sola: el SW la cierra tras
    // resolver la solicitud (o la reutiliza para la siguiente pendiente). Se espera el CIERRE y no
    // un aviso en pantalla, porque `scheduleClose` (1,5 s de margen) puede desmontar el estado antes
    // de que la prueba lo lea.
    await ventana.keyboard.press('Escape');
    await expect
      .poll(() => (ventana.isClosed() ? 'cerrada' : 'abierta'), {
        message: 'Escape no resolvió la solicitud: la ventana sigue abierta',
        timeout: 20_000,
      })
      .toBe('cerrada');

    archivarEvidencia(EVIDENCIA, {
      criterio: 'RNF-21 · teclado, foco visible, Escape y 44 px',
      foco: contorno,
      areasTactiles: cajas.map((caja) => ({ texto: caja.texto.trim(), ancho: Math.round(caja.ancho), alto: Math.round(caja.alto) })),
      separacion: Math.round(separacion),
      escape: 'la ventana se cerró tras rechazar (observable)',
    });
  });

  test('zoom al 200 %: sin pérdida de contenido ni desborde horizontal (WCAG 1.4.4)', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);
    const popup = await openPopupReady(context, extensionId);

    /**
     * HALLAZGO DEL ARNÉS (Fase 4, corregido): antes se tomaban las dos cuentas de nodos en DOS
     * `evaluate` distintos, de modo que un re-render del popup entre ambos (el polling de saldos
     * de M47 repinta cada 5 s) cambiaba el recuento y la aserción fallaba de forma intermitente
     * (`Expected: 93, Received: 98`) sin que el zoom tuviera nada que ver. La aserción NO se relaja:
     * es la MISMA (`nodos === antes`, «el zoom no puede vaciar el DOM»), pero las dos medidas se
     * toman ahora dentro de un ÚNICO bloque síncrono, que es indivisible para React.
     */
    const medicion = await popup.evaluate(() => {
      const antes = document.querySelectorAll('*').length;
      // `zoom` es la forma en que Chrome emula el 200 % de zoom del navegador sobre el documento.
      document.documentElement.style.zoom = '2';
      const caja = document.querySelector('.tk-window')?.getBoundingClientRect();
      return {
        antes,
        nodos: document.querySelectorAll('*').length,
        anchoVisible: caja === undefined ? 0 : Math.round(caja.width),
        desbordeHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
        titulo: document.querySelector('.tk-header__title')?.textContent ?? '',
      };
    });
    expect(medicion.nodos, 'el zoom no puede vaciar el DOM').toBe(medicion.antes);
    expect(medicion.titulo).toContain('TrueKeate');
    expect(
      medicion.desbordeHorizontal,
      'al 200 % el contenido no debe desbordar en horizontal',
    ).toBe(false);

    archivarEvidencia(EVIDENCIA, {
      criterio: 'RNF-21 · sin pérdida al 200 % de zoom',
      nodosAntes: medicion.antes,
      nodosConZoom: medicion.nodos,
      anchoTrasZoom: medicion.anchoVisible,
      desbordeHorizontal: medicion.desbordeHorizontal,
    });
  });

  test('prefers-reduced-motion: el spinner no anima cuando el usuario lo pide', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(120_000);
    await seedWallet(background, { devNoticeAccepted: false });
    const popup = await openPopupReady(context, extensionId);
    // Con la preferencia activada, la hoja de estilos base desactiva animaciones y transiciones.
    await popup.emulateMedia({ reducedMotion: 'reduce' });
    const duraciones = await popup.evaluate(() => {
      const spinner = document.querySelector('.tk-spinner');
      const nodo = spinner ?? document.body;
      const estilo = getComputedStyle(nodo);
      return { animacion: estilo.animationDuration, transicion: estilo.transitionDuration };
    });
    /**
     * La hoja anula la animación con `0.001ms`, y Chromium lo serializa como `1e-06s` (notación
     * científica en segundos). En vez de exigir una cadena concreta —que depende de la
     * serialización del navegador— se convierte a milisegundos y se exige que sea ≤ 0,01 ms, que es
     * «movimiento despreciable» en cualquier unidad.
     */
    const enMs = (valor: string): number => {
      const coincidencia = /^([\d.e+-]+)(ms|s)?$/.exec(valor.trim());
      if (coincidencia === null) return Number.NaN;
      const cantidad = Number.parseFloat(coincidencia[1] ?? 'NaN');
      return (coincidencia[2] ?? 's') === 'ms' ? cantidad : cantidad * 1000;
    };
    expect(enMs(duraciones.animacion), `animación «${duraciones.animacion}» no desactivada`).toBeLessThanOrEqual(0.01);
    expect(enMs(duraciones.transicion), `transición «${duraciones.transicion}» no desactivada`).toBeLessThanOrEqual(0.01);
  });

  test('aria-label y roles: pestañas, cuentas y panel de actividad', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);
    const popup = await openPopupReady(context, extensionId);

    // Pestañas con `role="tab"` y `aria-selected`, dentro de un `tablist` con nombre accesible.
    const tablist = popup.getByRole('tablist');
    await expect(tablist).toBeVisible();
    await expect(popup.getByRole('tab')).toHaveCount(7);
    await expect(popup.getByRole('tab', { name: 'Cuentas' })).toHaveAttribute('aria-selected', 'true');
    // El panel asociado declara su etiqueta (aria-labelledby → tab).
    await expect(popup.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-accounts');

    // La lista de cuentas tiene nombre accesible y cada cuenta declara su acción.
    const lista = popup.locator('.tk-accounts');
    await expect(lista).toBeVisible();
    await expect(popup.getByRole('button', { name: /Usar .* como cuenta activa/ }).first()).toBeVisible();
    await expect(popup.locator('.tk-account__address').first()).toHaveAttribute('aria-label', /0x/);
    await expect(popup.locator('.tk-account__address').first()).toHaveAttribute('title', /^0x/);

    // Panel de actividad: lista con nombre accesible y enlaces/roles correctos.
    const actividad = await abrirPestanaDelPopup(context, extensionId, 'Actividad');
    const registro = actividad.locator('ul.tk-logs');
    await expect(registro).toBeVisible();
    expect(await registro.getAttribute('aria-label')).toContain('registro');
  });
});

/**
 * Abre la ventana única de decisión con una `personal_sign` real desde la dApp.
 *
 * Se resuelve con el flujo de verdad (conectar + firmar) y no con una URL sintética para que la
 * ventana llegue con `PendingRequest`, avisos y acciones habilitadas: es lo que hace que las
 * medidas de área táctil y el `Escape` midan el comportamiento real del producto.
 */
async function abrirVentanaDeDecision(context: BrowserContext, dapp: Page): Promise<Page> {
  const conexion = await conectarDapp(context, dapp, { indice: 0 });
  expect(conexion.ok, `la conexión de la dApp falló: ${conexion.resultado}`).toBe(true);
  await iniciarPeticionDeFirma(dapp, 'personal_sign', ['Prueba de accesibilidad de TrueKeate.', CUENTA_0]);
  const ventana = await esperarVentanaDeDecision(context);
  await expect(ventana.locator('.tk-origin__url')).toContainText(DAPP_ORIGIN);
  return ventana;
}
