# 🎨 Identidad Visual — TrueKeate

> **Fase:** 1 — Concepto (anexo) · **Versión:** 1.5 · **Estado:** ✅ aprobado (P-14)
> Fuente: carpeta `TrueKeate/` del workspace (6 activos originales). Esta es la **guía vinculante** de diseño para la wallet y la dApp de pruebas.
> Los valores marcados como **(medido)** se extrajeron por análisis de píxeles de los activos originales; los marcados como **(derivado)** son extensiones necesarias para UI/estados que no aparecen en los activos.
> **v1.3:** cierra el hallazgo **ADT-32** de `AUDITORIA_DOCUMENTO_TECNICO_V1.md` (el botón fantasma queda con **una sola** especificación: fondo transparente, borde `--tk-gold-500` y **texto `--tk-navy-800`**) y las decisiones **P-20** (portapapeles del revelado: aviso de borrado, progreso de 30 s y ocultado inmediato) y **P-21** (contador de solicitudes pendientes y **una única ventana de confirmación global**). Verificación cruzada de tokens y medidas contra `documento_tecnico.md` §5.2.
> **v1.2 (remediación de la auditoría):** corregida la trazabilidad de §7 (E-12 → RNF-04, no RF-45), fijada la decisión del alias del provider (H-15/DEC-21) y añadida la matriz de contraste cerrada y los criterios de accesibilidad verificables (H-17).

---

## 1. Marca

| Elemento | Definición |
|---|---|
| **Nombre** | **TrueKeate** (un solo bloque, "T" y "K" mayúsculas, el resto minúsculas) |
| **Descriptor** | `PRODUCTOS \| SERVICIOS \| CRIPTOACTIVOS TOKENIZADOS` |
| **Isologo** | Hexágono de esquinas redondeadas que contiene **dos flechas circulares entrelazadas** (intercambio / ciclo de valor) |
| **Wordmark** | «TrueKeate» en geométrica sans **extrabold** con la **"E" final convertida en un check (✓)** |
| **Concepto** | Confianza verificable (el check) + intercambio (las flechas) + tokenización (el hexágono, forma de bloque/cripto) |
| **Gradiente maestro** | Azul marino → azul acero → teal → cian → oro champagne (de izquierda/bajo-izquierda hacia derecha/bajo-derecha) |

### 1.1 Activos originales y su destino

| Activo en `TrueKeate/` | Formato | Uso |
|---|---|---|
| `TrueKeate_logo.svg` | SVG (trazos negros) | Reserva vectorial monocroma del isologo. |
| `TrueKeate_logo.png` | PNG 983×881, fondo blanco | Fuente de los iconos de la extensión. |
| `TrueKeate_logo.ico` | ICO | Favicon de la dApp de pruebas. |
| `TrueKeate_titulo.svg` | SVG (trazos negros) | Reserva vectorial del wordmark. |
| `TrueKeate_titulo.png` | PNG 1399×684, fondo blanco | Logotipo horizontal para onboarding / "Acerca de". |

### 1.2 Activos generados (listos para usar)

| Activo | Ruta | Uso |
|---|---|---|
| Iconos de la extensión 16/32/48/128 px | `public/icons/icon-{16,32,48,128}.png` | `action.default_icon` del manifest. Los de **16/32 usan una variante simplificada** (zoom a las flechas + saturación 1.35/1.45) porque el isologo completo se emborrona a ese tamaño. |
| Isologo para UI | `public/brand/truekeate-mark-96.png` | Marca de agua del encabezado del popup y pantalla de bienvenida. |
| Copias de marca | `public/brand/truekeate-logo.svg`, `-logo.png`, `-logo.ico`, `-titulo.svg`, `-titulo.png` | Uso directo en la UI y en la dApp. |

> ⚠️ **Regla de oro:** el wordmark **nunca se retipea** con una fuente del sistema. Siempre se usa `truekeate-titulo.svg`/`.png`. Si se necesita texto de encabezado, se usa la tipografía de UI con los colores de marca.

---

## 2. Paleta de color

### 2.1 Colores primarios de marca (medidos)

| Token | Hex | Muestra | Origen en el activo | Uso |
|---|---|---|---|---|
| `--tk-navy-800` | `#1D2B57` | Azul marino | Inicio del wordmark ("T"), histograma dominante `#203058` | **Color primario**: texto principal, tagline, botones base |
| `--tk-navy-700` | `#243A6B` | Azul marino claro | — (derivado) | Hover del primario |
| `--tk-blue-600` | `#2E4A7D` | Azul | Stop 2 del gradiente (`#2E4166`) | Secundario |
| `--tk-steel-500` | `#3A6A85` | Azul acero | Centro del wordmark (`#386880`, `#3D4F73`) | Stop intermedio |
| `--tk-teal-500` | `#3E93A6` | Teal | Arco superior del isologo (`#4090A0`, `#4F92A2`) | **Color de acento**: foco, enlaces, elementos activos |
| `--tk-teal-400` | `#5293A4` | Teal claro | Final del wordmark (`#5293A4`) | Stop intermedio del degradado |
| `--tk-cyan-300` | `#88BFC4` | Cian | Borde superior del hexágono (`#88BFC4`, `#ACC9D1`) | Stop claro |
| `--tk-cyan-200` | `#ACC9D1` | Cian muy claro | Vértice superior (`#ACC9D1`) | Fondos suaves, `disabled` |
| `--tk-gold-500` | `#C9A97F` | Oro champagne | Borde derecho del hexágono (`#C4A882`, `#C7AE8A`) | Acento dorado: checks, recompensas, red local |
| `--tk-gold-400` | `#E3C797` | Oro claro | Histograma (`#E0C090`) | Stop final del degradado |
| `--tk-gold-600` | `#9F846F` | Oro oscuro | Borde inferior-derecho (`#9F846F`, `#907868`) | Sombra del dorado |

### 2.2 Neutros (derivados)

| Token | Hex | Uso |
|---|---|---|
| `--tk-white` | `#FFFFFF` | Superficie base clara |
| `--tk-gray-050` | `#F7F9FB` | Fondo de la app (claro) |
| `--tk-gray-100` | `#EEF2F6` | Superficie de tarjetas |
| `--tk-gray-300` | `#D3DBE4` | Bordes y separadores |
| `--tk-gray-600` | `#5B6B7C` | Texto secundario |
| `--tk-gray-900` | `#121A2B` | Texto principal (casi negro azulado) |
| `--tk-night-900` | `#0E1526` | Fondo del modo oscuro |
| `--tk-night-800` | `#1B2540` | Superficie de tarjetas en oscuro |

### 2.3 Colores semánticos de estado (derivados)

| Token | Hex | Uso | Nota |
|---|---|---|---|
| `--tk-success` | `#17806A` | Transacción confirmada, conexión OK | Verde frío para no chocar con el teal. Deriva de `--tk-teal-500`. **v1.5:** oscurecido desde `#1F8A70` (4,26:1 sobre blanco < 4,5:1) a `#17806A` (**4,85:1** sobre blanco, 4,59:1 sobre `--tk-gray-050`, 3,75:1 sobre `--tk-night-900`): como texto de la insignia «Red de pruebas» (11 px) tiene que cumplir 4,5:1 (H6, `contrast.spec.ts`). |
| `--tk-info` | `#3E93A6` | Información, eventos | Igual al acento de marca. |
| `--tk-warning` | `#C9A97F` | Avisos, red de pruebas, gas alto | Reutiliza el oro de marca. |
| `--tk-danger` | `#D64545` | Errores (**RF-30 exige rojo en los logs**), rechazo de firma | Único color ajeno a la marca; obligado por el enunciado. |
| `--tk-danger-dark` | `#A62F2F` | Hover del peligro | — |

### 2.4 Accesibilidad — matriz de contraste cerrada (H-17)

Umbrales WCAG 2.1 aplicados: **4,5:1** texto normal (< 18 px, o < 14 px en negrita), **3:1** texto grande (≥ 18 px o ≥ 14 px en negrita) y **3:1** para componentes de UI, bordes y foco (1.4.11). Los ratios se calcularon con la **fórmula WCAG real** (luminancia relativa con corrección de gamma) sobre los tokens de §6; **ningún par fuera de esta tabla puede usarse como texto**, y un test que lee `tokens.css` recalcula estos pares en cada build.

**Modo claro**

| Texto | Fondo | Ratio | Veredicto / uso |
|---|---|---|---|
| `--tk-gray-900` `#121A2B` | `--tk-gray-050` `#F7F9FB` | **16,47:1** | ✅ AAA — texto principal |
| `--tk-gray-900` | `--tk-white` `#FFFFFF` | **17,38:1** | ✅ AAA — texto principal sobre tarjeta |
| `--tk-gray-600` `#5B6B7C` | `--tk-gray-050` | **5,18:1** | ✅ AA — texto secundario |
| `--tk-gray-600` | `--tk-gray-100` `#EEF2F6` | **4,86:1** | ✅ AA — texto secundario en tarjeta |
| `--tk-navy-800` `#1D2B57` | `--tk-white` | **13,68:1** | ✅ AAA — tagline, direcciones, títulos |
| `--tk-navy-800` | `--tk-gray-050` `#F7F9FB` | **12,96:1** | ✅ AAA — **texto del botón fantasma** sobre el fondo de la app (ADT-32) |
| `--tk-navy-800` | `--tk-gray-100` `#EEF2F6` | **12,16:1** | ✅ AAA — **texto del botón fantasma** sobre tarjeta (ADT-32) |
| `--tk-white` | `--tk-navy-800` | **13,68:1** | ✅ AAA — texto sobre superficie oscura |
| `--tk-white` | `--tk-blue-600` `#2E4A7D` | **8,78:1** | ✅ AAA — encabezado, tramo 2 del degradado |
| `--tk-white` | `--tk-steel-500` `#3A6A85` | **5,87:1** | ✅ AA — encabezado, tramo 3 del degradado |
| `--tk-white` | `--tk-teal-500` `#3E93A6` | **3,54:1** | ⚠️ solo ≥ 18 px (o ≥ 14 px negrita) — tramo central del degradado |
| `--tk-white` | `--tk-cyan-300` `#88BFC4` | **2,04:1** | ❌ prohibido para texto (solo decoración) |
| `--tk-white` | `--tk-gold-500` `#C9A97F` | **2,22:1** | ❌ prohibido para texto |
| `--tk-teal-500` | `--tk-white` | **3,54:1** | ⚠️ acento: iconos, bordes y foco (3:1 ✅); texto solo ≥ 18 px |
| `--tk-gold-500` | `--tk-white` | **2,22:1** | ❌ decorativo — **nunca** texto (borde del botón fantasma: refuerzo de marca, regla 5) |
| `--tk-gold-600` `#9F846F` | `--tk-white` | **3,50:1** | ⚠️ **solo decorativo** (sombra del dorado): **no** es el texto del botón fantasma, que es `--tk-navy-800` (13,68:1) (ADT-32) |
| `--tk-navy-800` | `--tk-gold-500` (badge de red y contador de pendientes) | **6,16:1** | ✅ AA |
| `--tk-white` | `--tk-danger` `#D64545` | **4,38:1** | ⚠️ < 4,5: texto ≥ 18 px o fondo `--tk-danger-dark` `#A62F2F` (**6,84:1**) |
| `--tk-danger-dark` | `--tk-white` / `--tk-gray-050` | **6,84:1** / **6,48:1** | ✅ AA — rojo para texto pequeño |
| `--tk-danger` | `--tk-gray-050` | **4,15:1** | ⚠️ log `error` en claro: ≥ 18 px o iconos (RF-30) |
| `--tk-success` `#17806A` | `--tk-white` | **4,85:1** | ✅ AA — **insignia «Red de pruebas»** (texto de 11 px) y confirmaciones sobre tarjeta (**fila añadida en H6**; el valor anterior `#1F8A70` daba 4,26:1 y no cumplía) |

**Modo oscuro (fondo `--tk-night-900` `#0E1526`)**

| Texto | Fondo | Ratio | Veredicto / uso |
|---|---|---|---|
| `--tk-gray-100` `#EEF2F6` | `--tk-night-900` | **16,18:1** | ✅ AAA — texto principal |
| `--tk-gray-100` | `--tk-night-800` `#1B2540` | **13,48:1** | ✅ AAA — texto sobre tarjeta |
| `--tk-cyan-200` `#ACC9D1` | `--tk-night-900` | **10,42:1** | ✅ AAA — texto secundario en oscuro |
| `--tk-gold-500` (`warning`) | `--tk-night-900` | **8,20:1** | ✅ AAA — log `warn` y **borde del botón fantasma en oscuro** |
| `--tk-teal-400` `#5293A4` | `--tk-night-900` | **5,26:1** | ✅ AA — acento en oscuro |
| `--tk-teal-500` | `--tk-night-900` | **5,14:1** | ✅ AA — log `info` y foco |
| `--tk-success` `#17806A` | `--tk-night-900` | **3,75:1** | ⚠️ < 4,5: log `success` ≥ 18 px, o texto `--tk-cyan-200` (10,42:1) con el indicador en `--tk-success`. **v1.5:** el valor cambió de `#1F8A70` (4,27:1) a `#17806A` para que su uso como texto sobre blanco cumpla 4,5:1 (fila añadida en el modo claro) |
| `--tk-danger` `#D64545` | `--tk-night-900` | **4,16:1** | ⚠️ < 4,5: log `error` ≥ 18 px, o fondo `--tk-danger-dark` con texto blanco (6,84:1) |
| `--tk-gray-600` | `--tk-night-800` | **2,77:1** | ❌ **prohibido**: en oscuro el texto secundario es `--tk-gray-100` o `--tk-cyan-200` |

**Reglas derivadas (obligatorias):**

1. **Encabezado con degradado:** el texto blanco solo se admite sobre el tramo oscuro (`--tk-navy-800` → `--tk-blue-600` → `--tk-steel-500`, ≥ 5,87:1). Sobre el tramo cian/oro (`#88BFC4` 2,04:1, `#C9A97F` 2,22:1, `#E3C797` 1,63:1) se prohíbe cualquier texto.
2. **Texto grande** exige ≥ 18 px (o ≥ 14 px en negrita) cuando el par no alcanza 4,5:1.
3. La matriz es **cerrada**: cualquier par nuevo se añade aquí con su ratio medido antes de usarse.
4. La verificación es **automática** (test que lee `tokens.css`) y **manual** (checklist de §8).
5. **Botón fantasma (ADT-32):** fondo **transparente**, borde `--tk-gold-500` y **texto `--tk-navy-800`** —una sola especificación, sin variantes—. El borde dorado es **refuerzo de marca** (2,22:1 sobre blanco) y **no** el único identificador del control: por eso el botón **siempre lleva etiqueta de texto visible** (nunca solo un icono) y su texto alcanza AAA sobre las tres superficies claras (13,68:1 sobre blanco, 12,96:1 sobre `--tk-gray-050`, 12,16:1 sobre `--tk-gray-100`). En modo oscuro, el texto es `--tk-gray-100`/`--tk-cyan-200` y el borde `--tk-gold-500` (8,20:1 sobre `--tk-night-900`).

---

## 3. Degradados oficiales

```css
/* Encabezados (popup, connect, notification, onboarding) */
--tk-grad-brand: linear-gradient(
  100deg,
  #1D2B57 0%,
  #2E4A7D 22%,
  #3E93A6 52%,
  #88BFC4 72%,
  #C9A97F 92%,
  #E3C797 100%
);

/* Marca / botón primario / contorno del isologo */
--tk-grad-mark: linear-gradient(135deg, #1D2B57 0%, #3E93A6 48%, #88BFC4 68%, #C9A97F 100%);

/* Acento dorado (check, confirmaciones, "red local", progreso del temporizador de revelado) */
--tk-grad-gold: linear-gradient(135deg, #C9A97F 0%, #E3C797 100%);

/* Estados */
--tk-grad-success: linear-gradient(135deg, #17806A 0%, #3E93A6 100%);
--tk-grad-danger:  linear-gradient(135deg, #A62F2F 0%, #D64545 100%);
```

**Dirección obligatoria:** el degradado siempre va de **oscuro (marino, abajo-izquierda) → claro (cian) → cálido (oro, arriba-derecha)**, replicando el isologo. Nunca invertido.

---

## 4. Tipografía

| Rol | Fuente | Peso | Tamaño | Nota |
|---|---|---|---|---|
| Wordmark | **Activo gráfico** (`truekeate-titulo.svg`) | — | — | Nunca retipear. |
| Títulos / UI | **Poppins** (fallback `Montserrat`, `system-ui`) | 600/700 | 18–24 px | Geométrica redondeada, la más próxima al wordmark. |
| Cuerpo / etiquetas | **Inter** (fallback `system-ui`) | 400/500 | 13–15 px | Alta legibilidad en popups estrechos. |
| Direcciones, hashes, montos | **JetBrains Mono** (fallback `ui-monospace, Roboto Mono`) | 400/500 | 12–13 px | Crítico para no confundir `0/O` ni `1/l/I`. |
| Cuenta atrás del temporizador de revelado | **JetBrains Mono** | 400 | 12 px | `--tk-navy-800` en claro, `--tk-cyan-200` en oscuro (§5.2). |
| Tagline | Poppins 600 | — | 11–12 px | **MAYÚSCULAS** con `letter-spacing: 0.14em`, color `--tk-navy-800`. |

> Las fuentes se **auto-hospedan** o se declaran con fallback del sistema: una extensión MV3 no debe depender de Google Fonts en tiempo de ejecución (CSP y privacidad). Si se auto-hospeda, usar solo los subconjuntos `latin` en `woff2` dentro de `public/fonts/` (H1/DEC-50: `poppins-latin-400/600/700.woff2` —**Poppins no es variable**—, `inter-latin.woff2`, `jetbrains-mono-latin.woff2` y las licencias `LICENSE-*.txt` OFL-1.1).

---

## 5. Aplicación a la wallet

### 5.1 Medidas y estructura

| Superficie | Tamaño | Encabezado |
|---|---|---|
| Popup (`index.html`) | 380 × 600 px | Franja `--tk-grad-brand` de 72 px con la marca de agua del isologo (`truekeate-mark-96.png` al 18 % de opacidad) y el nombre «TrueKeate» en blanco |
| Conexión (`connect.html`) | 420 × 650 px | Igual + origen de la dApp |
| Confirmación (`notification.html`) | 420 × 640 px | Igual + badge del tipo de solicitud (tx / firma / red) y **contador de solicitudes pendientes**. Es la **única ventana de confirmación global** (P-21): las demás solicitudes **esperan** en la cola persistida |
| dApp de pruebas (`test.html`) | Responsive | El logotipo horizontal `truekeate-titulo.png` centrado, fondo `--tk-gray-050` |

> **Tamaño explícito del `body` (H1 / DEC-49).** Chrome dimensiona el popup y las ventanas por el tamaño **intrínseco** del contenido: si el `body` no declara altura, abre el popup con la altura por defecto del navegador (medido en H1: **720 px** en lugar de 600). Por eso `body.tk-popup`, `body.tk-connect` y `body.tk-notification` declaran `width`/`height` con los tokens `--tk-*-width/height` y el contenedor interno hereda `height: 100%`. `test.html` **no** lleva esas clases: allí el layout es fluido y responsive.
>
> **Verificación cruzada (v1.3).** Estas medidas y los tokens citados coinciden con `documento_tecnico.md` §5.2 —popup **380 × 600**, `connect.html` **420 × 650**, `notification.html` **420 × 640**, encabezado común `--tk-grad-brand` de **72 px**— y con los componentes vinculantes de esa sección, donde el botón fantasma ya se define con **borde `--tk-gold-500` y texto `--tk-navy-800`** (ADT-32). Las constantes de tiempo citadas en §5.2 provienen de `entornos_globales.md` §3 (`REVEAL_HIDE_MS = 30000`) y del diccionario §2.8 (cardinalidad de la cola).

### 5.2 Componentes

| Componente | Especificación |
|---|---|
| **Botón primario** | Fondo `--tk-grad-mark`, texto blanco, radio 10 px, sombra `0 2px 6px rgba(29,43,87,.25)`; hover: `--tk-grad-mark` con brillo +4 %. |
| **Botón secundario** | Fondo transparente, borde 1.5 px `--tk-navy-800`, texto `--tk-navy-800`. |
| **Botón peligro** (Rechazar / Reset) | Fondo `--tk-grad-danger`, texto blanco. |
| **Botón fantasma** (Copiar dirección / Copiar) | Fondo **transparente**, borde 1.5 px `--tk-gold-500`, **texto `--tk-navy-800`** (13,68:1 sobre blanco; 12,96:1 sobre `--tk-gray-050`; 12,16:1 sobre `--tk-gray-100`); al copiar → check ✓ dorado + toast de 3 s. En modo oscuro: mismo borde (8,20:1) y texto `--tk-gray-100`/`--tk-cyan-200`. Siempre con **etiqueta de texto visible** (nunca solo icono). **Única especificación** (ADT-32). |
| **Tarjeta de cuenta** | Fondo `--tk-gray-100`, borde 1 px `--tk-gray-300`, radio 12 px; seleccionada: borde 2 px `--tk-teal-500` + fondo `rgba(62,147,166,.08)`. |
| **Dirección** | Mono, color `--tk-navy-800`, truncada `0x1234…abcd` con botón de copiado y `title` completo. |
| **Saldo** | Poppins 700, 20 px, color `--tk-gray-900`; `ETH` en 12 px `--tk-gray-600`. |
| **Badge de red** | «Anvil Local» en píldora `--tk-grad-gold` con texto `--tk-navy-800` (evoca el dorado del isologo). |
| **Badge del ícono** (`chrome.action.setBadgeText`) | `--tk-danger` con texto blanco para solicitudes pendientes (RF-38). |
| **Panel de logs** | Fondo `--tk-night-900`; `info` = `--tk-info`, `success` = `--tk-success`, `warn` = `--tk-warning`, `error` = `--tk-danger` (RF-30). |
| **Spinner** | Arco circular con `--tk-grad-mark` (guiño al isologo). |
| **Estado vacío** (sin cuentas) | Isologo 96 px al 30 % + texto `--tk-gray-600`. |
| **Portapapeles del material de recuperación** (P-20) | Solo el botón **«Copiar»** (botón fantasma) escribe en el portapapeles, nunca el hecho de revelar. Bajo él se muestra el aviso permanente **«La frase se borrará del portapapeles al ocultarse»**. Al ocultarse el material —por el temporizador de 30 s, por pérdida de foco o al pulsar «Ocultar ahora»— la extensión **sobrescribe el portapapeles con una cadena vacía** y descarta el valor de la memoria de la UI; el aviso cambia a «Portapapeles vaciado» (`role="status"`). |
| **Temporizador de revelado** (P-20) | **Barra de progreso de 4 px**: pista `--tk-gray-300` en claro / `--tk-night-800` en oscuro, relleno `--tk-grad-gold`, que se vacía durante los **30 s** de `REVEAL_HIDE_MS`. A su lado, cuenta atrás en JetBrains Mono 12 px (`--tk-navy-800` en claro; `--tk-cyan-200` en oscuro) y el botón **«Ocultar ahora»** (botón secundario), que oculta el valor de inmediato y cancela el temporizador. Con `prefers-reduced-motion`, la barra se actualiza **sin animación**. |
| **Contador de solicitudes pendientes** (P-21) | En el encabezado de `notification.html`, junto al badge del tipo de solicitud: píldora `--tk-grad-gold` con texto `--tk-navy-800` (**6,16:1**, ya en la matriz de §2.4) que muestra el total de solicitudes `pending` (`Pendientes: N`, conteo **global**, no por origen). Con **N = 0** la píldora se oculta. Si **N > 1**, una franja en el cuerpo avisa «Hay N solicitudes en espera; se mostrarán al resolver esta»; nunca se abre una segunda ventana. |

> **Ventana de confirmación única (P-21, ADT-22).** Existe **una sola** `notification.html` **global**, abierta con `focused: true`: mientras está ocupada por una solicitud `pending`, las siguientes **esperan** en la cola persistida (`truekeate_pending_requests`, máximo **8 globales** y **1 por origen**, `diccionario_datos.md` §2.8) y **no** se abre otra ventana. Esta regla **sustituye** la invariante previa «una ventana de confirmación por origen». El contador del encabezado es el único aviso dentro de la ventana de que hay más trabajo en cola; el origen solicitante y su favicon (servido por el navegador, saneado) siguen **siempre visibles** (RF-35).

### 5.3 Reglas de uso de la marca

1. **Área de respeto:** mínimo el ancho de la "T" del wordmark alrededor del logotipo.
2. **Tamaño mínimo del isologo:** 24 px en UI (por debajo, usar el icono simplificado de 16/32).
3. **Fondo:** sobre blanco, `--tk-gray-050` o `--tk-night-900`. **Nunca** sobre el degradado de marca a menos que sea la versión en blanco del isologo.
4. **No hacer:** deformar, rotar, cambiar los colores del degradado, añadir sombras duras, recolorear el isologo a un color plano, retipear el wordmark.
5. **Modo oscuro (con accesibilidad):** fondo `--tk-night-900`, superficies `--tk-night-800`, texto `--tk-gray-100` (`#EEF2F6`); el acento sube a `--tk-teal-400` (`#5293A4`, 5,26:1); el texto secundario **nunca** es `--tk-gray-600` (2,77:1 sobre `--tk-night-800`, prohibido) sino `--tk-cyan-200` (`#ACC9D1`, 10,42:1) o `--tk-gray-100`; el degradado de marca se mantiene igual en los encabezados y **el foco visible se conserva** (contorno `--tk-teal-500` de 2 px con *offset* 2 px, 5,14:1 sobre `--tk-night-900`). En el panel de logs oscuro, `success` (3,75:1) y `error` (4,16:1) **no** alcanzan 4,5:1 a tamaño pequeño: su texto se rotula a ≥ 18 px o usa el par alternativo de la matriz de §2.4.
6. **La tagline** se usa **solo** en la pantalla de bienvenida / "Acerca de", nunca en el encabezado del popup (falta espacio).
7. **Accesibilidad verificable (H-17):**
   - **Foco visible** en todo control interactivo: contorno de 2 px `--tk-teal-500` con *offset* 2 px (3,54:1 sobre blanco y 5,14:1 sobre `--tk-night-900`; ≥ 3:1 exigido por WCAG 1.4.11). **Nunca** `outline: none` sin sustituto equivalente.
   - **Navegación por teclado en las tres ventanas** (popup 380×600, `connect.html` 420×650, `notification.html` 420×640) y en `test.html`: orden de tabulación lógico, `Enter`/`Espacio` activan, `Esc` cierra la confirmación (equivale a **rechazar**), sin trampas de foco, y el resultado de aprobar/rechazar se anuncia con `role="status"`/`aria-live="polite"`.
   - **Área táctil mínima** de los botones **Aprobar** y **Rechazar**: **44 × 44 px CSS** (WCAG 2.5.5), con separación ≥ 8 px entre ambos y sin colocarlos adyacentes sin margen.
   - **Verificación en los E2E:** `axe-core` sobre las tres ventanas (**0 violaciones** de nivel A/AA), recorrido completo del flujo de aprobación **solo con teclado** y ausencia de pérdida de contenido al **200 % de zoom** (WCAG 1.4.4).
   - **`prefers-reduced-motion`** desactiva el spinner, las transiciones y la animación de la barra del temporizador de revelado.

---

## 6. Tokens listos para el código

```css
:root {
  /* Marca (medidos) */
  --tk-navy-800: #1D2B57;
  --tk-navy-700: #243A6B;
  --tk-blue-600: #2E4A7D;
  --tk-steel-500: #3A6A85;
  --tk-teal-500: #3E93A6;
  --tk-teal-400: #5293A4;
  --tk-cyan-300: #88BFC4;
  --tk-cyan-200: #ACC9D1;
  --tk-gold-500: #C9A97F;
  --tk-gold-400: #E3C797;
  --tk-gold-600: #9F846F;

  /* Neutros (derivados) */
  --tk-white: #FFFFFF;
  --tk-gray-050: #F7F9FB;
  --tk-gray-100: #EEF2F6;
  --tk-gray-300: #D3DBE4;
  --tk-gray-600: #5B6B7C;
  --tk-gray-900: #121A2B;
  --tk-night-900: #0E1526;
  --tk-night-800: #1B2540;

  /* Estados (derivados) */
  --tk-success: #17806A;
  --tk-info: #3E93A6;
  --tk-warning: #C9A97F;
  --tk-danger: #D64545;
  --tk-danger-dark: #A62F2F;

  /* Degradados */
  --tk-grad-brand: linear-gradient(100deg, #1D2B57 0%, #2E4A7D 22%, #3E93A6 52%, #88BFC4 72%, #C9A97F 92%, #E3C797 100%);
  --tk-grad-mark: linear-gradient(135deg, #1D2B57 0%, #3E93A6 48%, #88BFC4 68%, #C9A97F 100%);
  --tk-grad-gold: linear-gradient(135deg, #C9A97F 0%, #E3C797 100%);
  --tk-grad-success: linear-gradient(135deg, #17806A 0%, #3E93A6 100%);
  --tk-grad-danger: linear-gradient(135deg, #A62F2F 0%, #D64545 100%);

  /* Tipografía */
  --tk-font-display: 'Poppins', 'Montserrat', system-ui, sans-serif;
  --tk-font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --tk-font-mono: 'JetBrains Mono', ui-monospace, 'Roboto Mono', monospace;

  /* Formas */
  --tk-radius-sm: 8px;
  --tk-radius: 12px;
  --tk-radius-pill: 999px;
  --tk-shadow-card: 0 2px 8px rgba(29, 43, 87, .10);
  --tk-shadow-pop: 0 6px 20px rgba(29, 43, 87, .18);
}
```

> Este bloque debe vivir en `src/styles/tokens.css` (o equivalente) y ser la **única** fuente de color y tipografía del proyecto. En Fase 4 se verificará que no existan colores "a mano" fuera de estos tokens.

---

## 7. Alcance del impacto en los requisitos

| Requisito | Efecto de la identidad visual |
|---|---|
| **E-03 → RF-13/RF-14/RF-45** (provider EIP-1193) | **Resuelto (P-13/DEC-21):** el provider es **`window.truekeate`** y **además** publica el alias **`window.codecrypto = window.truekeate`** (el **mismo objeto**) desde `inject.js`; un test verifica ambos nombres. Decisión **firme**, no condicional, que protege los 5 puntos de la rúbrica. |
| RF-30 (logs con colores, rojo en errores) | `--tk-danger` (`#D64545`) para ≥ 18 px y para fondo/indicador; el **texto pequeño** usa `--tk-danger-dark` (`#A62F2F`, 6,84:1 en claro) o el par alternativo de §2.4. |
| RF-34 (UI en español) | La tagline de marca está en español y encaja. |
| RF-38 (badge contador) | `--tk-danger` sobre el icono. |
| **RF-35 (anti-phishing de la confirmación)** | Origen y favicon **siempre visibles** y **una sola ventana global** con contador de pendientes (P-21, §5.1 y §5.2): el usuario ve cuántas solicitudes hay en cola y ninguna segunda ventana compite por su atención. |
| **RF-50 (revelado/exportación, Must)** | El material de recuperación se muestra en JetBrains Mono 12–13 px, oculto por defecto; portapapeles con aviso de borrado, barra de progreso de **30 s** y botón «Ocultar ahora» (§5.2, P-20 / `REVEAL_HIDE_MS = 30000`). |
| RF-44 (EIP-6963: `name`, `icon`, `rdns`) | `name: "TrueKeate"`, `icon`: data-URI PNG del isologo de 96 px, `rdns: "academy.codecrypto.truekeate"` (confirmado en P-13). |
| **E-12 (compatibilidad Chrome/Edge) → RNF-04, RT-04** | Iconos 16/32/48/128 generados y verificados, y manifest MV3 válido en Chrome/Edge ≥ 114; la compatibilidad de navegadores la cubre **RNF-04** (fuente **E-12**), **no** RF-45. |
| Nuevo | RNF-18: **consistencia visual** — todos los colores, tipografías y degradados provienen de los tokens de este documento. |
| Nuevo | RF-48: pantalla de **bienvenida / "Acerca de"** con el logotipo horizontal y la tagline. |
| Nuevo | Accesibilidad (H-17): matriz de contraste cerrada (§2.4), foco visible, teclado en las tres ventanas, área táctil ≥ 44×44 px y `axe-core` sin violaciones A/AA. |

---

## 8. Verificación (criterios para la Fase 4)

- [ ] El `manifest.json` declara los 4 iconos y cargan sin error: `Inspección: dist/manifest.json (icons 16/32/48/128)` · `E2E: 01-onboarding.spec.ts — carga de dist/ con 0 errores de consola y 0 en el badge`.
- [ ] El wordmark aparece únicamente como activo gráfico (ni una sola cadena "TrueKeate" renderizada con fuente de sistema en tamaño de logotipo).
- [ ] Ningún color literal en el CSS fuera de `tokens.css` (búsqueda de `#[0-9a-f]{3,6}` y `rgb(` en los demás archivos → 0 resultados).
- [ ] **Contraste:** los pares de la matriz de §2.4 se recalculan en un test que lee `tokens.css` y **todos** cumplen su umbral; ningún par se usa como texto fuera de la matriz.
- [ ] El encabezado de las tres ventanas (popup, connect, notification) usa `--tk-grad-brand` en la misma dirección y **no lleva texto sobre el tramo cian/oro**.
- [ ] Modo oscuro conmutable sin pérdida de legibilidad: los pares del bloque oscuro de §2.4 siguen cumpliendo su umbral y el conmutador no altera el ratio (`Vitest: contrast.spec.ts → 0 pares por debajo del umbral` · `E2E: 24-accesibilidad.spec.ts — axe-core 0 violaciones A/AA`).
- [ ] **`axe-core`** ejecutado en los E2E sobre popup, `connect.html` y `notification.html`: **0 violaciones** de nivel A/AA.
- [ ] **Teclado:** flujo completo (cargar/importar, seleccionar cuenta, aprobar, rechazar, reset) operable solo con teclado en las tres ventanas, con **foco visible** (contorno 2 px) y `Esc` = rechazar en la confirmación.
- [ ] Botones **Aprobar/Rechazar** con área ≥ **44 × 44 px** y separación ≥ 8 px.
- [ ] `prefers-reduced-motion` desactiva spinner y transiciones; sin pérdida de contenido al **200 % de zoom**.
- [ ] La tagline aparece exactamente como `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`.
- [ ] **Botón fantasma (ADT-32):** fondo transparente, borde `--tk-gold-500` y texto `--tk-navy-800`; **0 apariciones** de `--tk-gold-600` como color de texto y siempre con etiqueta visible.
- [ ] **Portapapeles del revelado (P-20):** el aviso «La frase se borrará del portapapeles al ocultarse» es visible, el portapapeles queda **vacío** tras el ocultado (temporizador, pérdida de foco o «Ocultar ahora») y la barra de progreso refleja los **30 s** de `REVEAL_HIDE_MS`.
- [ ] **Ventana única y contador (P-21):** `notification.html` es una **sola** ventana global, el contador de pendientes muestra el total (`Pendientes: N`) y se oculta con N = 0; con dos solicitudes `pending` de orígenes distintos **no** coexisten dos ventanas de confirmación.

---

## 9. Historial de cambios de este documento

| Versión | Cambio |
|---|---|
| 1.0 | Análisis de los activos originales, paleta medida, degradados, tipografía, componentes y tokens CSS. |
| 1.1 | Aprobación del sistema de diseño (P-14) y anexo de impacto en los requisitos (§7). |
| 1.2 | Remediación de la auditoría (Fase 2): corregida la fila mal atribuida de §7 dividiéndola en «E-12 → RNF-04, RT-04» y «E-03 → RF-13/RF-14/RF-45» (H-05); fijada la decisión del alias del provider (H-15/DEC-21); añadida la matriz de contraste cerrada §2.4 y la regla 7 de §5.3 con foco, teclado, área táctil y `axe-core` (H-17). |
| **1.3** | Cierre del hallazgo **ADT-32** y de las decisiones **P-20** y **P-21**: el **botón fantasma** queda con una única especificación (fondo transparente, borde `--tk-gold-500` y **texto `--tk-navy-800`**, regla 5 de §2.4 y fila de §5.2), con la matriz ampliada con los pares `--tk-navy-800` sobre `--tk-gray-050` (**12,96:1**) y sobre `--tk-gray-100` (**12,16:1**) y `--tk-gold-600` reclasificado como **solo decorativo**; **P-20**: portapapeles del revelado (aviso de borrado, vaciado al ocultarse, progreso de **30 s** y botón «Ocultar ahora»); **P-21**: contador de solicitudes pendientes en `notification.html` y **una única ventana de confirmación global** (sustituye «una ventana por origen»). Añadidos los criterios de verificación de §8 y la verificación cruzada de tokens y medidas con `documento_tecnico.md` §5.2. |
 **1.4 (esta versión)** — cierre de los residuales **R-07/R-08** del veredicto de reevaluación (§8): los criterios de iconos del manifest y de modo oscuro pasan a tener magnitud y evidencia canónica (`Inspección:` / `Vitest:` / `E2E:`).
 **1.5 (H6, parte 1)** — una única corrección de token, exigida por la puerta de contraste de la tarea 6.2: `--tk-success` pasa de `#1F8A70` (**4,26:1** sobre blanco, por debajo de 4,5:1) a `#17806A` (**4,85:1** sobre blanco, 4,59:1 sobre `--tk-gray-050`, 3,75:1 sobre `--tk-night-900`), porque se usa como **texto** de la insignia «Red de pruebas» (11 px). Se añade la fila correspondiente al modo claro de §2.4, se actualiza la fila del modo oscuro, el bloque de tokens de §6 y la nota de §5.3 regla 5. El resto de la matriz **no cambia**: `contrast.spec.ts` recalcula los 26 pares y verifica que el ratio de cada uno coincide con el publicado (±0,02).
