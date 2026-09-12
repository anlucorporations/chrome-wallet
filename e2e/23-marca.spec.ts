/**
 * `e2e/23-marca.spec.ts` — Identidad visual en las **CUATRO superficies** (tarea 6.1 del plan
 * §3.6.5; `CA-RF-49`, RNF-18).
 *
 * QUÉ VERIFICA
 * ------------
 * 1. El **degradado de marca** (`--tk-grad-brand`) es el fondo de la franja de encabezado en el
 *    popup (380 × 600), `connect.html` (420 × 650), `notification.html` (420 × 640) y `test.html`,
 *    con la **misma** declaración CSS en las cuatro: si una se quedara atrás, el degradado calculado
 *    sería distinto y la prueba falla.
 * 2. La franja mide **72 px** (`--tk-header-height`, identidad_visual.md §5.1) y lleva la marca de
 *    agua del isologo al 18 % de opacidad.
 * 3. El **texto blanco solo se apoya en el tramo OSCURO** del degradado (regla 1 de §2.4): la caja
 *    del título termina antes de que el degradado entre en el tramo cian/oro, donde el contraste
 *    cae a 2,04:1 y 2,22:1 (prohibido para texto).
 * 4. La dApp de pruebas muestra el **logotipo horizontal** (`truekeate-titulo.png`), el fondo
 *    `--tk-gray-050` y la **tagline exacta** de marca.
 * 5. Ninguna superficie inventa colores: la hoja del producto carga y el degradado sale del token.
 *
 * Evidencia: `RepoTecnico/evidencia/H6/23-marca-<fecha>.png` (captura del popup con su encabezado).
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  EVIDENCE_DIR,
  RUN_DATE,
  archivarEvidencia,
  distDisponible,
  expect,
  getExtensionId,
  openDapp,
  openExtensionPage,
  openPopupReady,
  test,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Tagline exacta que exige §8 de `identidad_visual.md` (RNF-23). */
const TAGLINE = 'PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS';

/** Franja de marca de las tres ventanas de la extensión. */
const SELECTOR_ENCABEZADO = '.tk-header';

/** Resultado de medir el encabezado de una superficie. */
interface MedidaDeEncabezado {
  /** `background-image` calculado del encabezado. */
  backgroundImage: string;
  /** Altura en píxeles CSS. */
  altura: number;
  /** `opacity` de la marca de agua del isologo, o `null` si no hay. */
  opacidadMarca: string | null;
  /** Anchura de la caja de la marca de agua, o `null`. */
  anchoMarca: number | null;
}

/**
 * Mide el encabezado de una página. Devuelve `null` si la superficie no declara encabezado de marca
 * (eso es precisamente lo que la prueba debe detectar, no un fallo del helper).
 */
const medirEncabezado = async (page: import('@playwright/test').Page): Promise<MedidaDeEncabezado | null> =>
  page.evaluate((selector) => {
    const cabecera = document.querySelector(selector);
    if (cabecera === null) return null;
    const estilo = getComputedStyle(cabecera);
    const marca = cabecera.querySelector('.tk-header__mark');
    const cajaMarca = marca === null ? null : marca.getBoundingClientRect();
    return {
      backgroundImage: estilo.backgroundImage,
      altura: Number.parseFloat(estilo.height),
      opacidadMarca: marca === null ? null : getComputedStyle(marca).opacity,
      anchoMarca: cajaMarca === null ? null : Math.round(cajaMarca.width),
    };
  }, SELECTOR_ENCABEZADO);

test.describe('23 · marca en las cuatro superficies (CA-RF-49)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el degradado de marca es idéntico en popup, connect y notification, de 72 px', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background);

    // --- 1. Popup (380 × 600) -----------------------------------------------------------------
    const popup = await openPopupReady(context, extensionId);
    const medidaPopup = await medirEncabezado(popup);
    expect(medidaPopup, 'el popup no pinta el encabezado de marca (.tk-header)').not.toBeNull();
    expect(medidaPopup?.backgroundImage).toContain('linear-gradient');
    expect(medidaPopup?.altura).toBe(72);
    expect(medidaPopup?.opacidadMarca).toBe('0.18');
    expect(medidaPopup?.anchoMarca).toBe(96);

    // Las dimensiones declaradas de la superficie (identidad_visual.md §5.1 / DEC-49).
    const cajaPopup = await popup.evaluate(() => {
      const ventana = document.querySelector('.tk-window');
      const caja = ventana?.getBoundingClientRect();
      return caja === undefined ? null : { ancho: Math.round(caja.width), alto: Math.round(caja.height) };
    });
    expect(cajaPopup).toEqual({ ancho: 380, alto: 600 });

    // Captura de evidencia con el encabezado de marca ya pintado.
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await popup.screenshot({
      path: join(EVIDENCE_DIR, `23-marca-${RUN_DATE}.png`),
      clip: { x: 0, y: 0, width: 380, height: 160 },
    });

    // --- 2. connect.html (420 × 650) ----------------------------------------------------------
    const connect = await openExtensionPage(context, extensionId, 'connect.html');
    const medidaConnect = await medirEncabezado(connect);
    expect(medidaConnect?.backgroundImage).toBe(medidaPopup?.backgroundImage);
    expect(medidaConnect?.altura).toBe(72);
    expect(medidaConnect?.opacidadMarca).toBe('0.18');
    const cajaConnect = await connect.evaluate(() => {
      const caja = document.querySelector('.tk-window')?.getBoundingClientRect();
      return caja === undefined ? null : { ancho: Math.round(caja.width), alto: Math.round(caja.height) };
    });
    expect(cajaConnect).toEqual({ ancho: 420, alto: 650 });

    // --- 3. notification.html (420 × 640) -----------------------------------------------------
    const notification = await openExtensionPage(context, extensionId, 'notification.html');
    const medidaNotification = await medirEncabezado(notification);
    expect(medidaNotification?.backgroundImage).toBe(medidaPopup?.backgroundImage);
    expect(medidaNotification?.altura).toBe(72);
    expect(medidaNotification?.opacidadMarca).toBe('0.18');
    const cajaNotification = await notification.evaluate(() => {
      const caja = document.querySelector('.tk-window')?.getBoundingClientRect();
      return caja === undefined ? null : { ancho: Math.round(caja.width), alto: Math.round(caja.height) };
    });
    expect(cajaNotification).toEqual({ ancho: 420, alto: 640 });
  });

  test('el texto blanco del encabezado se apoya en el tramo OSCURO del degradado', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(120_000);
    await seedWallet(background);
    const popup = await openPopupReady(context, extensionId);

    /**
     * La regla 1 de `identidad_visual.md` §2.4 prohíbe el **texto blanco** sobre el tramo cian/oro
     * del degradado (2,04:1 y 2,22:1) y la regla 2 admite el umbral de texto grande (3:1) cuando el
     * par no llega a 4,5:1. Comprobar la fracción de ancho sería una HEURÍSTICA —el degradado de
     * 100deg se proyecta sobre una línea de gradiente más larga que la franja, así que los stops no
     * caen en el porcentaje del ancho—. Aquí se mide lo REAL: se captura el encabezado, se lee el
     * píxel de fondo bajo cada caja de texto y se calcula el ratio WCAG entre ese fondo y el color de
     * texto calculado, aplicando el umbral que corresponde al tamaño y peso REALES (WCAG 1.4.3).
     */
    const caja = await popup.evaluate(() => {
      const cabecera = document.querySelector('.tk-header');
      if (cabecera === null) return null;
      const cajaCabecera = cabecera.getBoundingClientRect();
      return {
        ancho: Math.round(cajaCabecera.width),
        alto: Math.round(cajaCabecera.height),
        textos: [...cabecera.querySelectorAll('h1, p, span, button')].map((nodo) => {
          const c = nodo.getBoundingClientRect();
          const estilo = getComputedStyle(nodo);
          const coincidencia = /rgba?\(([^)]+)\)/.exec(estilo.color);
          const canales = (coincidencia?.[1] ?? '0,0,0')
            .split(',')
            .map((v) => Number.parseFloat(v.trim()));
          const tamano = Number.parseFloat(estilo.fontSize);
          const peso = Number.parseInt(estilo.fontWeight, 10) || 400;
          // WCAG 1.4.3: texto grande = ≥ 18 px, o ≥ 14 px en negrita (≥ 700).
          const esGrande = tamano >= 18 || (tamano >= 14 && peso >= 700);
          return {
            etiqueta: `${nodo.tagName.toLowerCase()}.${nodo.className}`,
            texto: (nodo.textContent ?? '').trim().slice(0, 40),
            color: [canales?.[0] ?? 0, canales?.[1] ?? 0, canales?.[2] ?? 0] as [number, number, number],
            tamano,
            peso,
            umbral: esGrande ? 3 : 4.5,
            izquierda: Math.round(c.left - cajaCabecera.left),
            derecha: Math.round(c.right - cajaCabecera.left),
            arriba: Math.round(c.top - cajaCabecera.top),
            abajo: Math.round(c.bottom - cajaCabecera.top),
          };
        }),
      };
    });
    expect(caja, 'el popup no pinta el encabezado de marca').not.toBeNull();
    const captura = await popup.screenshot({ clip: { x: 0, y: 0, width: caja?.ancho ?? 0, height: caja?.alto ?? 0 } });

    // Lectura de los píxeles del encabezado: se devuelve la LISTA de colores de fondo muestreados.
    const fondos = await popup.evaluate(
      async ({ datos, puntos }) => {
        const imagen = new Image();
        imagen.src = `data:image/png;base64,${datos}`;
        await imagen.decode();
        const lienzo = document.createElement('canvas');
        lienzo.width = imagen.width;
        lienzo.height = imagen.height;
        const contexto = lienzo.getContext('2d');
        if (contexto === null) return [];
        contexto.drawImage(imagen, 0, 0);
        const leidos = contexto.getImageData(0, 0, lienzo.width, lienzo.height).data;
        return puntos.map((punto) => {
          const indice = (punto.y * lienzo.width + punto.x) * 4;
          return {
            ...punto,
            rgb: [leidos[indice] ?? 0, leidos[indice + 1] ?? 0, leidos[indice + 2] ?? 0] as [
              number,
              number,
              number,
            ],
          };
        });
      },
      {
        datos: captura.toString('base64'),
        puntos:
          caja?.textos.flatMap((texto) => {
            const x = Math.max(1, Math.min((caja.ancho ?? 2) - 2, Math.round(texto.derecha) - 1));
            return [texto.arriba + 2, Math.round((texto.arriba + texto.abajo) / 2), texto.abajo - 2].map(
              (y) => ({
                etiqueta: texto.etiqueta,
                texto: texto.texto,
                color: texto.color,
                umbral: texto.umbral,
                tamano: texto.tamano,
                peso: texto.peso,
                x,
                y: Math.max(1, y),
              }),
            );
          }) ?? [],
      },
    );
    expect(fondos.length).toBeGreaterThan(0);

    /** Luminancia relativa WCAG. */
    const luminancia = (rgb: readonly number[]): number => {
      const canales = rgb.map((canal) => {
        const v = (canal ?? 0) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (canales[0] ?? 0) + 0.7152 * (canales[1] ?? 0) + 0.0722 * (canales[2] ?? 0);
    };
    const ratioContra = (color: readonly number[], fondo: readonly number[]): number => {
      const a = luminancia(color);
      const b = luminancia(fondo);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };

    const medidos = fondos.map((fondo) => ({
      ...fondo,
      ratio: ratioContra(fondo.color, fondo.rgb),
    }));
    const insuficientes = medidos
      .filter((medida) => medida.ratio < medida.umbral)
      .map(
        (medida) =>
          `${medida.etiqueta} «${medida.texto}» (${medida.tamano}px/${medida.peso}): rgb(${medida.color.join(',')}) sobre rgb(${medida.rgb.join(',')}) → ${medida.ratio.toFixed(2)}:1 < ${medida.umbral}:1`,
      );
    expect(
      insuficientes,
      'el texto del encabezado pisa un tramo del degradado sin contraste suficiente (RNF-19)',
    ).toEqual([]);

    archivarEvidencia('23-marca', {
      criterio: 'RNF-19 · contraste real del texto del encabezado sobre --tk-grad-brand',
      puntosMuestreados: medidos.length,
      ratioMinimoObservado: Number(Math.min(...medidos.map((m) => m.ratio)).toFixed(2)),
      cajasDeTexto: caja?.textos.map((texto) => `${texto.etiqueta} «${texto.texto}»`),
    });
  });

  test('la dApp de pruebas usa la marca: logotipo horizontal, fondo y tagline exacta', async ({
    context,
  }) => {
    test.setTimeout(120_000);
    const dapp = await context.newPage();
    await openDapp(dapp);

    // El logotipo horizontal es un ACTIVO gráfico: nunca se retipea el wordmark (§1.1).
    const logotipo = dapp.locator('img[src*="truekeate-titulo"]');
    await expect(logotipo).toBeVisible();
    expect(await logotipo.getAttribute('alt')).toContain('TrueKeate');

    // La tagline aparece EXACTAMENTE como la exige §8.
    await expect(dapp.getByText(TAGLINE)).toBeVisible();

    // El encabezado de la dApp usa el MISMO degradado que la extensión, y el fondo de la página es
    // `--tk-gray-050` (#F7F9FB), tal y como fija §5.1 para `test.html`.
    const estilos = await dapp.evaluate(() => {
      const marca = document.querySelector('.marca');
      const marcaEstilo = marca === null ? null : getComputedStyle(marca);
      const cajaMarca = marca?.getBoundingClientRect();
      const textos = marca === null ? [] : [...marca.querySelectorAll('h1, p')];
      const derechaTexto = Math.max(
        0,
        ...textos.map((nodo) => nodo.getBoundingClientRect().right - (cajaMarca?.left ?? 0)),
      );
      return {
        degradado: marcaEstilo?.backgroundImage ?? '',
        alturaMarca: marcaEstilo === null ? 0 : Number.parseFloat(marcaEstilo.height),
        fondo: getComputedStyle(document.body).backgroundColor,
        titulo: document.querySelector('.marca__titulo')?.textContent ?? '',
        fraccionTextoSobreMarca: cajaMarca === undefined || cajaMarca.width === 0 ? 1 : derechaTexto / cajaMarca.width,
      };
    });
    expect(estilos.degradado).toContain('linear-gradient');
    expect(estilos.alturaMarca).toBe(72);
    expect(estilos.fondo).toBe('rgb(247, 249, 251)');
    expect(estilos.titulo).toContain('TrueKeate');
    // Y el texto del banner se apoya en el tramo OSCURO: su borde derecho queda dentro del 40 %
    // inicial del degradado, donde el contraste blanco va de 13,68:1 a 5,87:1.
    expect(estilos.fraccionTextoSobreMarca).toBeLessThan(0.4);

    // El degradado de la dApp y el de la extensión son la MISMA declaración CSS: se comparan los
    // `background-image` calculados de las dos superficies.
    const popup = await openPopupReady(context, await getExtensionId(context));
    const degradadoExtension = (await medirEncabezado(popup))?.backgroundImage ?? '';
    expect(degradadoExtension).not.toBe('');
    expect(estilos.degradado.replace(/\s+/g, '')).toBe(degradadoExtension.replace(/\s+/g, ''));
  });

  test('la marca no rompe los flujos de la dApp: el provider se sigue detectando', async ({
    context,
    background,
  }) => {
    test.setTimeout(120_000);
    await seedWallet(background, { accounts: ANVIL_ADDRESSES.slice(0, 1) });
    const dapp = await context.newPage();
    await openDapp(dapp);
    // La sonda de la propia dApp confirma que el provider inyectado sigue presente con la marca
    // nueva: si el encabezado hubiera roto el orden de los scripts, aquí no habría provider.
    await expect(dapp.locator('#estado-texto')).toContainText('provider detectado: TrueKeate', {
      timeout: 20_000,
    });
    await expect(dapp.locator('#estado')).toHaveClass(/estado--ok/, { timeout: 20_000 });
  });
});
