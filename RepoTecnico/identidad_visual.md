# 🎨 Identidad Visual — TrueKeate

> **Fase:** 1 — Concepto (anexo) · **Versión:** 1.0
> Fuente: carpeta `TrueKeate/` del workspace (6 activos originales). Esta es la **guía vinculante** de diseño para la wallet y la dApp de pruebas.
> Los valores marcados como **(medido)** se extrajeron por análisis de píxeles de los activos originales; los marcados como **(derivado)** son extensiones necesarias para UI/estados que no aparecen en los activos.

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
| `--tk-success` | `#1F8A70` | Transacción confirmada, conexión OK | Verde frío para no chocar con el teal. Deriva de `--tk-teal-500`. |
| `--tk-info` | `#3E93A6` | Información, eventos | Igual al acento de marca. |
| `--tk-warning` | `#C9A97F` | Avisos, red de pruebas, gas alto | Reutiliza el oro de marca. |
| `--tk-danger` | `#D64545` | Errores (**RF-30 exige rojo en los logs**), rechazo de firma | Único color ajeno a la marca; obligado por el enunciado. |
| `--tk-danger-dark` | `#A62F2F` | Hover del peligro | — |

> **Accesibilidad:** `--tk-navy-800` sobre blanco da un contraste ≈ 12.6:1 (AAA). `--tk-teal-500` sobre blanco ≈ 3.4:1 → **no usar para texto pequeño**; reservarlo para iconos, bordes y textos ≥ 18 px o sobre fondos oscuros. `--tk-gold-500` sobre blanco ≈ 2.2:1 → **solo decorativo**.

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

/* Acento dorado (check, confirmaciones, "red local") */
--tk-grad-gold: linear-gradient(135deg, #C9A97F 0%, #E3C797 100%);

/* Estados */
--tk-grad-success: linear-gradient(135deg, #1F8A70 0%, #3E93A6 100%);
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
| Tagline | Poppins 600 | — | 11–12 px | **MAYÚSCULAS** con `letter-spacing: 0.14em`, color `--tk-navy-800`. |

> Las fuentes se **auto-hospedan** o se declaran con fallback del sistema: una extensión MV3 no debe depender de Google Fonts en tiempo de ejecución (CSP y privacidad). Si se auto-hospeda, usar solo los subconjuntos `latin` en `woff2` dentro de `public/fonts/`.

---

## 5. Aplicación a la wallet

### 5.1 Medidas y estructura

| Superficie | Tamaño | Encabezado |
|---|---|---|
| Popup (`index.html`) | 380 × 600 px | Franja `--tk-grad-brand` de 72 px con la marca de agua del isologo (`truekeate-mark-96.png` al 18 % de opacidad) y el nombre «TrueKeate» en blanco |
| Conexión (`connect.html`) | 420 × 650 px | Igual + origen de la dApp |
| Confirmación (`notification.html`) | 420 × 640 px | Igual + badge del tipo de solicitud (tx / firma / red) |
| dApp de pruebas (`test.html`) | Responsive | El logotipo horizontal `truekeate-titulo.png` centrado, fondo `--tk-gray-050` |

### 5.2 Componentes

| Componente | Especificación |
|---|---|
| **Botón primario** | Fondo `--tk-grad-mark`, texto blanco, radio 10 px, sombra `0 2px 6px rgba(29,43,87,.25)`; hover: `--tk-grad-mark` con brillo +4 %. |
| **Botón secundario** | Fondo transparente, borde 1.5 px `--tk-navy-800`, texto `--tk-navy-800`. |
| **Botón peligro** (Rechazar / Reset) | Fondo `--tk-grad-danger`, texto blanco. |
| **Botón fantasma** (Copiar dirección) | Borde `--tk-gold-500`, texto `--tk-gold-600`; al copiar → check ✓ dorado + toast. |
| **Tarjeta de cuenta** | Fondo `--tk-gray-100`, borde 1 px `--tk-gray-300`, radio 12 px; seleccionada: borde 2 px `--tk-teal-500` + fondo `rgba(62,147,166,.08)`. |
| **Dirección** | Mono, color `--tk-navy-800`, truncada `0x1234…abcd` con botón de copiado y `title` completo. |
| **Saldo** | Poppins 700, 20 px, color `--tk-gray-900`; `ETH` en 12 px `--tk-gray-600`. |
| **Badge de red** | «Anvil Local» en píldora `--tk-grad-gold` con texto `--tk-navy-800` (evoca el dorado del isologo). |
| **Badge del ícono** (`chrome.action.setBadgeText`) | `--tk-danger` con texto blanco para solicitudes pendientes (RF-38). |
| **Panel de logs** | Fondo `--tk-night-900`; `info` = `--tk-info`, `success` = `--tk-success`, `warn` = `--tk-warning`, `error` = `--tk-danger` (RF-30). |
| **Spinner** | Arco circular con `--tk-grad-mark` (guiño al isologo). |
| **Estado vacío** (sin cuentas) | Isologo 96 px al 30 % + texto `--tk-gray-600`. |

### 5.3 Reglas de uso de la marca

1. **Área de respeto:** mínimo el ancho de la "T" del wordmark alrededor del logotipo.
2. **Tamaño mínimo del isologo:** 24 px en UI (por debajo, usar el icono simplificado de 16/32).
3. **Fondo:** sobre blanco, `--tk-gray-050` o `--tk-night-900`. **Nunca** sobre el degradado de marca a menos que sea la versión en blanco del isologo.
4. **No hacer:** deformar, rotar, cambiar los colores del degradado, añadir sombras duras, recolorear el isologo a un color plano, retipear el wordmark.
5. **Modo oscuro:** fondo `--tk-night-900`, superficies `--tk-night-800`, texto `--tk-gray-100`; el acento sube a `--tk-teal-400` (`#5293A4`) para mantener el contraste; el degradado de marca se mantiene igual en los encabezados.
6. **La tagline** se usa **solo** en la pantalla de bienvenida / "Acerca de", nunca en el encabezado del popup (falta espacio).

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
  --tk-success: #1F8A70;
  --tk-info: #3E93A6;
  --tk-warning: #C9A97F;
  --tk-danger: #D64545;
  --tk-danger-dark: #A62F2F;

  /* Degradados */
  --tk-grad-brand: linear-gradient(100deg, #1D2B57 0%, #2E4A7D 22%, #3E93A6 52%, #88BFC4 72%, #C9A97F 92%, #E3C797 100%);
  --tk-grad-mark: linear-gradient(135deg, #1D2B57 0%, #3E93A6 48%, #88BFC4 68%, #C9A97F 100%);
  --tk-grad-gold: linear-gradient(135deg, #C9A97F 0%, #E3C797 100%);
  --tk-grad-success: linear-gradient(135deg, #1F8A70 0%, #3E93A6 100%);
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
| RF-03/E-03 (`window.codecrypto`) | **Pendiente de decisión (P-13):** la marca del producto es TrueKeate, pero el enunciado exige el provider `window.codecrypto`. |
| RF-30 (logs con colores, rojo en errores) | Se usa `--tk-danger` (`#D64545`). |
| RF-34 (UI en español) | La tagline de marca está en español y encaja. |
| RF-38 (badge contador) | `--tk-danger` sobre el icono. |
| RF-44 (EIP-6963: `name`, `icon`, `rdns`) | `name: "TrueKeate"`, `icon: data:image/png` del isologo 96 px, `rdns: "academy.codecrypto.truekeate"` (pendiente de confirmar con P-13). |
| RF-45/E-12 (Chrome/Edge) | Iconos 16/32/48/128 generados y verificados. |
| Nuevo | RNF-18: **consistencia visual** — todos los colores, tipografías y degradados provienen de los tokens de este documento. |
| Nuevo | RF-48: pantalla de **bienvenida / "Acerca de"** con el logotipo horizontal y la tagline. |

---

## 8. Verificación (criterios para la Fase 4)

- [ ] El `manifest.json` declara los 4 iconos y cargan sin error en `chrome://extensions`.
- [ ] El wordmark aparece únicamente como activo gráfico (ni una sola cadena "TrueKeate" renderizada con fuente de sistema en tamaño de logotipo).
- [ ] Ningún color literal en el CSS fuera de `tokens.css` (búsqueda de `#[0-9a-f]{3,6}` y `rgb(` en los demás archivos → 0 resultados).
- [ ] Contraste verificado: texto principal ≥ 4.5:1; teal solo en ≥ 18 px o sobre oscuro.
- [ ] El encabezado de las tres ventanas (popup, connect, notification) usa `--tk-grad-brand` en la misma dirección.
- [ ] Modo oscuro conmutables sin pérdida de legibilidad.
- [ ] La tagline aparece exactamente como `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`.
