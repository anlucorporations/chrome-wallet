# Casos de Uso — TrueKeate Wallet

> **Fase:** 2 — Auditoría/especificación · **Versión:** 1.1 · **Estado:** ✅ propuesto para revisión
> **Producto:** **TrueKeate Wallet** (extensión Chrome/Edge Manifest V3) + dApp de pruebas (`test.html`) sobre Foundry Anvil.
> **Cambio de versión:** v1.1 cierra los 30 hallazgos **ACU-01..ACU-30** de `RepoTecnico/casos_uso/AUDITORIA_CASOS_USO_V1.md`; el detalle está en **«Historial de cambios»** (final del documento).
> **Fuentes (vinculantes, leídas antes de redactar):**
> `RepoTecnico/requerimientos.md` v1.4 (§1 RF-01..RF-49 **+ RF-50 en curso**, §2 RNF-01..RNF-25, §3 RT-01..RT-13 y RE-01..RE-04, §4 actores/rúbrica/MVP, §9 Anexo A con `CA-RF-xx`/`CA-RT-xx`) · `RepoTecnico/diccionario_datos.md` v1.3 (claves `truekeate_*`, entidades, protocolo `TRUEKEATE_*`, catálogo RPC y códigos EIP-1193) · `RepoTecnico/entornos_globales.md` v1.5 (permisos, constantes, comandos, nomenclatura) · `RepoTecnico/identidad_visual.md` v1.2 (medidas, tokens, contraste) · `RepoTecnico/INFORME_OPTIMIZACION_V1.md` (42 hallazgos ya remediados: no se reintroduce ninguno).
>
> **Convenciones de este documento**
> 1. **Un CU = un objetivo de actor.** Los escenarios distintos del mismo objetivo se modelan como flujos alternativos (`A#`) o de excepción (`E#`), no como CU nuevos.
> 2. Notación: **Gherkin** (`Dado / Cuando / Entonces / Y / Pero`) para comportamientos observables; **EARS** (`Mientras…`, `Cuando…`, `Si… entonces…`, `El sistema deberá…`, `De acuerdo con…`) para restricciones del sistema.
> 3. **Regla dura:** ningún criterio sin evidencia. Toda evidencia es una de estas cuatro formas —y solo estas cuatro—: `Vitest: <spec>`, `E2E: <spec> — <flujo>`, `Comando: <comando>` o `Inspección: <qué se revisa>`. **ACU-29:** no se admite `Revisión:` ni `E2E` sin identificar spec y flujo.
> 4. Los criterios **transversales** (RNF/RT aplicables a todos los CU) se consolidan en **§8** y no se repiten en cada ficha; cada CU los referencia por su ID. **ACU-26:** la ficha cita el `CA-RF-xx` de `requerimientos.md` §9 y añade únicamente el **delta propio del CU**; no reproduce su texto.
> 5. Alcance: **MVP = los RF Must** (§4.5 de `requerimientos.md`), hoy **40 con RF-50** (ver §9, hueco 1). Los RF Should se especifican igualmente —RNF-01 exige que el 100 % de los RF, Must y Should, tenga al menos un CU— pero su CU se marca **ciclo posterior** en §2 y se listan en §6.
> 6. Los CU que no provienen de un RF se marcan **DERIVADO** con su justificación (§3 y §9).
> 7. **Regla de trazabilidad «la ficha declara, la matriz agrega» (ACU-01).** La columna **Trazabilidad** de cada ficha es la **única fuente de verdad**; §2 (índice), §5 (RF→CU) y §7 (actores) se **regeneran** desde ella y **no pueden** contener un CU ni un RF que la ficha no declare, ni omitir uno que sí declare.
> 8. **Claves canónicas (ACU-25).** Todo almacén se nombra siempre con su prefijo (`truekeate_networks`, `truekeate_settings`, `truekeate_logs`…); quedan prohibidas las formas abreviadas `settings.*`/`networks.*`.
> 9. **Errores (ACU-05/D-E).** Todo error que vea el usuario es un objeto EIP-1193 **con `code`** y con el mensaje, causa y acción sugerida de la tabla §2.1 de `requerimientos.md` (un mensaje por causa).

---

## 1. Actores

| Actor | Tipo | Descripción | Interactúa en |
|---|---|---|---|
| **Usuario (dueño de la cartera)** | Humano · primario | Instala la extensión, crea/importa la cartera, gestiona cuentas, aprueba o rechaza solicitudes. Se desdobla en **Perfil A — estudiante/autor** (opera Anvil, usa `test.html`) y **Perfil B — evaluador** (carga `dist/` en un equipo limpio, puede no tener Anvil). | **Primario en:** CU-01 … CU-14, CU-19, CU-24, CU-26, CU-30, CU-32 … CU-35. **Secundario en:** CU-15 (decide antes del plazo), CU-16, CU-17 (elige la cuenta a compartir en connect.html), CU-18, CU-20, CU-21, CU-23, CU-25 (solo en su flujo A1, alta desde el popup), CU-27, CU-28, CU-29, CU-31, CU-36 |
| **dApp de terceros** (`test.html`) | Sistema externo · primario | Aplicación web que consume `window.truekeate` y su alias `window.codecrypto`: se conecta, lee saldo, envía transacciones, firma y escucha eventos. | **Primario en:** CU-17, CU-18, CU-22, CU-23, CU-25, CU-27, CU-28, CU-20 (negativo), CU-21 (negativo). **Secundario en:** CU-11 … CU-16, CU-19, CU-24, CU-26, CU-29, CU-31, CU-36 |
| **dApp no autorizada** | Actor **adversario** · primario (negativo) | Origen que nunca pasó por `eth_requestAccounts` e intenta leer cuentas o invocar métodos sensibles. | CU-20 |
| **dApp hostil** | Actor **adversario** · primario (negativo) | Origen que intenta `eth_sign`, alta de red con RPC arbitrario, suplantación de `origin` o inyección desde un iframe. | CU-21 |
| **Service Worker (background)** | Actor de sistema · primario | Custodia el material criptográfico, ejecuta el RPC, es **dueño único del plazo** de aprobación, reconcilia la cola al arrancar y emite eventos y logs. | Primario en CU-15, CU-16, CU-29 y CU-31; secundario en CU-01 … CU-14, CU-17 … CU-28, CU-30 y CU-32 … CU-35 |
| **UI de la extensión** (`popup`, `connect.html`, `notification.html`) | Actor de sistema · secundario | Superficies de la extensión: renderizan estado y capturan la decisión del usuario; solo leen la cola persistida, nunca la escriben. | Secundario en CU-01 … CU-36 |
| **Nodo RPC local (Anvil)** | Sistema externo · secundario | Valida y ejecuta transacciones, entrega `feeData`, saldos, nonce y recibos en `127.0.0.1:8545`. | CU-10, CU-11, CU-12, CU-15, CU-16, CU-17, CU-23, CU-24, CU-25, CU-27, CU-31 |
| **Navegador Chrome/Edge (plataforma)** | Plataforma · secundario | Ciclo de vida del Service Worker, ventanas, `chrome.alarms`, badge, notificaciones, permisos de host, inyección en `document_start` y `all_frames`. | CU-08, CU-11, CU-12, CU-13, CU-14, CU-15, CU-16, CU-18, CU-19, CU-20, CU-21, CU-22, CU-23, CU-24, CU-25, CU-26, CU-27, CU-29, CU-31, CU-35, CU-36 |
| **Docente/evaluador** | Stakeholder · primario en CU-36 | Verifica la **rúbrica de 100 puntos** (`requerimientos.md` §4.1) cargando `dist/` sin conocer el proyecto. | Primario en CU-36; secundario en CU-23 y CU-33 (perfil B: revisa la dApp de pruebas y la marca) |
| **Responsable de seguridad (autor del proyecto)** | Humano · no interactúa | Rol humano que responde por RNF-09, RNF-10, RNF-12, RNF-22 y RNF-23 (§4.4 de `requerimientos.md`). | Referenciado en CU-07, CU-21, CU-30 |
| **Titular de los activos de marca y fuentes** | Stakeholder · no interactúa | Cedió la marca TrueKeate y las tipografías OFL (DEC-15); habilita RT-12 y RNF-23. | Referenciado en CU-33, CU-36 |

---

## 2. Índice de casos de uso

| CU | Nombre | Actor primario | RF cubiertos | RNF/RT/RE clave | MVP / ciclo posterior |
|---|---|---|---|---|---|
| CU-01 | Crear una cartera nueva con frase semilla BIP-39 | Usuario | RF-01, RF-03, RF-49 | RNF-18, RNF-22, RNF-23; RT-02, RT-12 | **MVP** |
| CU-02 | Importar una cartera desde frase de recuperación | Usuario | RF-02, RF-03, RF-12, RF-33 | RNF-22; RT-02 | **MVP** (RF-12 ciclo posterior) |
| CU-03 | Importar una cuenta por clave privada | Usuario | RF-05, RF-33 | RNF-09, RNF-22 | **MVP** |
| CU-04 | Derivar y añadir cuentas HD | Usuario | RF-04, RF-10 | RT-02 | **MVP** |
| CU-05 | Renombrar una cuenta | Usuario | RF-05, RF-10 | — | **MVP** |
| CU-06 | Eliminar una cuenta importada | Usuario | RF-06 | RNF-22 | **MVP** (RF-06 Should) |
| CU-07 | Revelar/exportar el material de recuperación | Usuario | RF-50 | RNF-09, RNF-22 | **MVP** (RF-50 Must, en curso) |
| CU-08 | Reabrir el popup y restaurar el estado persistido | Usuario | RF-09, RF-10, RF-17 | RNF-08, RNF-22 | **MVP** |
| CU-09 | Recibir fondos: dirección, copiar y QR | Usuario | RF-07, RF-49 | RNF-18, RNF-20 | **MVP** |
| CU-10 | Consultar el saldo y su actualización cada 5 s | Usuario | RF-18, RF-27, RF-34 | RNF-02, RNF-03; RT-06, RT-10, RE-04 | **MVP** (RF-34 ciclo posterior) |
| CU-11 | Enviar ETH a una dirección externa | Usuario | RF-08, RF-19, RF-33, RF-42, RF-43 | RNF-05, RNF-12, RNF-25 | **MVP** |
| CU-12 | Transferir ETH entre cuentas propias | Usuario | RF-08, RF-19, RF-42, RF-43 | RNF-05, RNF-25 | **MVP** |
| CU-13 | Aprobar una transacción con vista previa decodificada | Usuario | RF-19, RF-35, RF-41 | RNF-05, RNF-12, RNF-21 | **MVP** |
| CU-14 | Rechazar una solicitud pendiente | Usuario | RF-35, RF-41, RF-14 | RNF-06 | **MVP** |
| CU-15 | Vencer una solicitud por plazo (120 s / 60 s) | Service Worker | RF-40 | RNF-06, RNF-08 | **MVP** (RF-40 Should) |
| CU-16 | Atender dos solicitudes simultáneas y serializar por cuenta | Service Worker | RF-37, RF-38, RF-39 | RNF-08 | **MVP** (RF-38/RF-39 ciclo posterior — P-17) |
| CU-17 | Conectar una dApp y elegir la cuenta a compartir | dApp de terceros | RF-16, RF-36, RF-17 | RNF-05 | **MVP** |
| CU-18 | Mantener la conexión por origen entre recargas y reinicios | dApp de terceros | RF-25, RF-17, RF-10 | RNF-08, RNF-11 | **MVP** |
| CU-19 | Revocar el permiso de una dApp | Usuario | RF-26, RF-24 | RNF-11 | **MVP** |
| CU-20 | Rechazar a una dApp no autorizada | dApp no autorizada | RF-17, RF-14 | RNF-10, RNF-11 | **MVP** |
| CU-21 | Resistir a una dApp hostil | dApp hostil | RF-14, RF-23 | RNF-09, RNF-10, RNF-12; RT-03, RT-04 | **MVP** |
| CU-22 | Manifestar el provider `window.truekeate` (y alias) + EIP-6963 | dApp de terceros | RF-13, RF-44, RF-45 | RNF-20; RT-13 | **MVP** (RF-44 ciclo posterior) |
| CU-23 | Ejecutar la dApp de pruebas de extremo a extremo | dApp de terceros (`test.html`) | RF-46, RF-47 | RNF-15, RNF-25; RT-09, RE-01 | **MVP** (RF-47 ciclo posterior) |
| CU-24 | Cambiar de red y propagar `chainChanged` | Usuario | RF-22, RF-24, RF-10 | RNF-08; RT-06, RE-04 | **MVP** |
| CU-25 | Dar de alta una red nueva | dApp de terceros | RF-23, RF-22 | RNF-23; RT-04 | **MVP** |
| CU-26 | Cambiar la cuenta activa y propagar `accountsChanged` | Usuario | RF-15, RF-24, RF-10, RF-27 | — | **MVP** |
| CU-27 | Firmar datos tipados EIP-712 | dApp de terceros | RF-20 | RNF-09, RNF-25; RT-02, RT-11 | **MVP** |
| CU-28 | Firmar un mensaje de texto plano (`personal_sign`) | dApp de terceros | RF-21, RF-14 | RNF-09; RT-02 | **MVP** |
| CU-29 | Consultar el registro de actividad y su persistencia | Service Worker | RF-28, RF-29, RF-30, RF-31, RF-32 | RNF-09, RNF-16 | **MVP** (RF-32 ciclo posterior) |
| CU-30 | Resetear la cartera | Usuario | RF-11, RF-32 | RNF-22 | **MVP** |
| CU-31 | Operar con el nodo RPC local caído | Service Worker | RF-18, RF-27 | RNF-06, RNF-07; RE-04 | **MVP** |
| CU-32 | Validar entradas de formulario con feedback inline | Usuario | RF-33 | RNF-06; RT-10 | **MVP** |
| CU-33 | Ver la bienvenida y «Acerca de» con la tagline de marca | Usuario | RF-48, RF-49 | RNF-18, RNF-19, RNF-20, RNF-23; RT-12; RE-02 | **MVP** (RF-48 ciclo posterior) |
| CU-34 | Interpretar los estados de error con color y mensaje correctos | Usuario | RF-30, RF-49 | RNF-06, RNF-18, RNF-19, RNF-21; RT-10 | **MVP** |
| CU-35 | Recorrer las tres ventanas solo con teclado | Usuario | *(ninguno — DERIVADO)* · ver §9 | RNF-19, RNF-21 | **MVP** (derivado) |
| CU-36 | Instalar desde `dist/` y verificar el build limpio | Docente/evaluador | *(ninguno — DERIVADO)* · ver §9 | RNF-04, RNF-13, RNF-14, RNF-15, RNF-17, RNF-20, RNF-23, RNF-24; RT-01 … RT-09, RT-10, RT-12, RT-13; RE-01, RE-04 | **MVP** (derivado) |

> **Cómo se lee esta tabla (ACU-01).** Las columnas «RF cubiertos» y «RNF/RT/RE clave» son un **agregado literal** de la columna **Trazabilidad** de las 36 fichas de §3: la ficha declara, la matriz agrega. Cualquier fila que contradiga una ficha es un defecto de este documento, no de la ficha.
> **RNF/RT/RE clave** no es la lista exhaustiva de normas que un CU menciona en prosa (§3 y §8 las desarrollan); enumera las que la ficha **cita en su trazabilidad**.
> **RF-50** (`CA-RF-50`, revelar/exportar el material de recuperación) se está añadiendo a `requerimientos.md` vía P-18; se referencia aquí y en CU-07, y no se redefine en este documento.
**Totales:** 36 CU · 34 derivan de al menos un RF y cubren los **50 RF (40 Must con RF-50 + 10 Should)** · 2 son **DERIVADOS** de RNF (CU-35, CU-36). CU-07 deja de ser derivado por P-18 (RF-50, Must).

---

## 3. Casos de uso detallados

### CU-01 · Crear una cartera nueva con frase semilla BIP-39
**Actor primario:** Usuario (dueño de la cartera) · **Secundarios/sistemas:** Service Worker, UI del popup, Navegador Chrome/Edge
**Objetivo:** Disponer de una cartera operativa generando localmente una frase BIP-39 de 12 palabras, sin contraseña y sin exponer la semilla a la página.
**Precondiciones:** Extensión cargada desde `dist/`; `chrome.storage.local` sin `truekeate_mnemonic` ni `truekeate_accounts`; popup abierto (380 × 600 px).
**Postcondición de éxito:** `truekeate_mnemonic` contiene 12 palabras válidas, `truekeate_accounts` contiene 5 direcciones (`m/44'/60'/0'/0/0`..`/4`), el popup muestra la cuenta 0 con su saldo y la aceptación del aviso de entorno de desarrollo queda registrada en `truekeate_settings`.
**Postcondición de fallo:** Si el usuario no confirma la frase o el almacenamiento falla, no se persiste ningún mnemonic y el popup permanece en el formulario inicial con el aviso de error inline.
**Datos implicados:** `truekeate_mnemonic` (§2.1), `truekeate_accounts` (§2.2), `truekeate_current_account` (§2.4, valor `idx:0`), `truekeate_settings` (§2.10), `truekeate_logs` (§2.11, `event`: `wallet_created`).
**Trazabilidad:** RF-01, RF-03, RF-49 · RNF-18, RNF-22, RNF-23 · RT-02, RT-12 · CA-RF-01, CA-RF-03, CA-RF-49

**Flujo principal**
1. El Usuario abre el popup; el SW arranca, ejecuta `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` y detecta que no hay cartera.
2. El popup muestra la pantalla de bienvenida con el logotipo horizontal, la tagline `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS` y el aviso no descartable de entorno de desarrollo (RNF-23).
3. El Usuario pulsa «Crear cartera nueva».
4. El SW genera la frase con `ethers.Mnemonic.fromEntropy(ethers.randomBytes(16))` (12 palabras, 128 bits) y la devuelve al popup, que la muestra en pantalla.
5. El popup exige confirmar la frase antes de habilitar «Continuar» (las palabras se piden en orden o mediante casillas de confirmación).
6. El SW persiste `truekeate_mnemonic` normalizado (minúsculas, espacios simples) y deriva 5 cuentas BIP-44 en `truekeate_accounts`, fijando `truekeate_current_account = "idx:0"`.
7. El SW escribe la entrada `wallet_created` en `truekeate_logs` (sin mnemonic ni claves) y el popup muestra la cuenta 0 con su saldo ya pintado.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (el Usuario ya tiene una frase):** pulsa «Importar» y continúa en **CU-02**.
- **A2 — desde el paso 5 (el Usuario no confirma):** «Continuar» permanece deshabilitado; no se persiste nada; el flujo termina sin postcondición de éxito.
- **E1 — desde el paso 6 (fallo de `chrome.storage.local.set`):** el SW no deja estado parcial, responde `-32603` con «Error interno de la cartera.» y el popup muestra «No se pudo guardar la cartera. Vuelve a intentarlo.»
- **E2 — desde el paso 7 (RPC local no disponible):** la cartera queda creada y persistida; la UI muestra «desconectado» y aplica **CU-31**; la creación **no** se revierte.

**Criterios de aceptación**
```gherkin
Dado el popup abierto sin cartera en chrome.storage.local
Cuando el Usuario pulsa «Crear cartera nueva» y confirma las 12 palabras
Entonces se muestran 12 palabras separadas por espacios
Y ethers.Mnemonic.isValidMnemonic(frase) devuelve true
Y truekeate_accounts contiene exactamente 5 direcciones con rutas m/44'/60'/0'/0/0 a /4
Y truekeate_current_account es "idx:0"
Y no aparece en ningún momento un campo de contraseña
```

```gherkin
Dado el popup abierto con las 12 palabras generadas en pantalla
Cuando el Usuario no confirma la frase y pulsa «Continuar»
Entonces «Continuar» sigue deshabilitado
Y truekeate_mnemonic y truekeate_accounts siguen ausentes de chrome.storage.local
```

```gherkin
Dado el flujo de creación en el paso 6 (persistencia)
Cuando chrome.storage.local.set rechaza la escritura
Entonces la promesa se rechaza con code -32603 y el mensaje de la tabla §2.1
Y ninguna de las claves truekeate_mnemonic, truekeate_accounts ni truekeate_current_account queda escrita
```
**EARS.** *Mientras* la cartera se crea, *el sistema deberá* generar la entropía y derivar las claves **exclusivamente** en el Service Worker con `ethers.js v6`; la frase **no deberá** viajar por `window.postMessage` ni figurar en `truekeate_logs`. *Al primer arranque*, *el sistema deberá* registrar la aceptación del aviso «entorno de desarrollo — no usar con fondos reales» en `truekeate_settings`.
**Evidencia:** `Vitest: mnemonic.spec.ts — 12 palabras, checksum y 128 bits` · `Vitest: derivation.spec.ts` · `Vitest: state.spec.ts — fallo de set no deja estado parcial` · `E2E: 01-onboarding.spec.ts — sin prompt de contraseña` · `E2E: 26-avisos.spec.ts` · `Comando: grep -rn "postMessage" src/background/crypto` (0 coincidencias)

---

### CU-02 · Importar una cartera desde frase de recuperación
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, UI del popup
**Objetivo:** Restaurar una cartera existente a partir de sus 12 palabras, con validación de checksum y normalización de la entrada.
**Precondiciones:** Popup abierto sin cartera en storage; el Usuario dispone de una frase BIP-39 de 12 palabras (por ejemplo la de Anvil `test … junk`).
**Postcondición de éxito:** `truekeate_mnemonic` normalizado y `truekeate_accounts` con las 5 cuentas derivadas; la cuenta 0 coincide con la derivación canónica de la frase.
**Postcondición de fallo:** Ante checksum inválido, número de palabras distinto de 12 o entrada vacía, la UI muestra «frase inválida» y **no** se crea ni modifica ninguna clave de storage.
**Datos implicados:** `truekeate_mnemonic` (§2.1), `truekeate_accounts` (§2.2), `truekeate_settings.derivedAccountCount` (§2.10), `truekeate_logs` (§2.11, `event`: `wallet_imported`).
**Trazabilidad:** RF-02, RF-03, RF-12, RF-33 · RNF-22 · RT-02 · CA-RF-02, CA-RF-03, CA-RF-12, CA-RF-33

**Flujo principal**
1. El Usuario elige «Importar cartera existente» y el popup muestra el formulario de 12 palabras.
2. El Usuario pega o escribe las 12 palabras.
3. El popup normaliza (minúsculas, espacios simples, sin tildes ni comas), valida `ethers.Mnemonic.isValidMnemonic` y habilita «Importar» solo si es válida.
4. El Usuario pulsa «Importar».
5. El SW valida de nuevo el checksum, persiste el mnemonic normalizado, deriva las 5 cuentas y responde con la cuenta 0.
6. El popup muestra la cuenta 0 con su saldo sin pedir contraseña.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 2 (hint de Anvil, RF-12):** el Usuario pulsa el hint de la frase de prueba y el campo queda relleno con las 12 palabras de `DEFAULT_MNEMONIC`; «Importar» pasa a habilitado.
- **E1 — desde el paso 3 (checksum o número de palabras inválido):** mensaje inline «frase inválida» (texto exacto de **CU-32**); «Importar» permanece deshabilitado.
- **E2 — desde el paso 5 (ya existe cartera):** el SW exige confirmación destructiva de reemplazo; si se cancela, la cartera previa permanece intacta.

**Criterios de aceptación**
```gherkin
Dado el formulario de importación
Cuando pego las 12 palabras con espacios dobles y mayúsculas irregulares
Entonces la cuenta 0 derivada coincide con la derivación canónica de la frase normalizada
Y no aparece ningún campo de contraseña
```

```gherkin
Dado el formulario de importación
Cuando introduzco una entrada inválida
Entonces la UI muestra «frase inválida» junto al campo
Y chrome.storage.local no cambia

Ejemplos:
| entrada |
| 11 palabras |
| 12 palabras con checksum alterado |
| campo vacío |
```

```gherkin
Dado el formulario de importación vacío
Cuando el Usuario pulsa el hint de la frase de Anvil
Entonces el campo contiene exactamente las 12 palabras de prueba
Y el botón «Importar» queda habilitado
```
**EARS.** *Si* el número de palabras es distinto de 12 o el checksum BIP-39 falla, *entonces* *el sistema deberá* responder `-32602` con el mensaje de la tabla §2.1 sin escribir en `chrome.storage.local`. *Cuando* se importe una cartera, *el sistema deberá* derivar `truekeate_settings.derivedAccountCount = 5` cuentas en orden `m/44'/60'/0'/0/i`.
**Evidencia:** `Vitest: mnemonic.spec.ts — normalización y checksum` · `E2E: 01-onboarding.spec.ts — hint Anvil` · `Vitest: integrity.spec.ts` (mnemonic corrupto, RNF-22)

---

### CU-03 · Importar una cuenta por clave privada
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, UI del popup
**Objetivo:** Añadir a la cartera una cuenta cuya clave privada no se puede re-derivar del mnemonic, marcándola como «importada» y etiquetándola.
**Precondiciones:** Cartera creada o importada; formulario «Importar cuenta» abierto.
**Postcondición de éxito:** `truekeate_imported_accounts` contiene una entrada con `address` (EIP-55), `privateKey`, `label`, `importedAt` y `visible: true`; la cuenta aparece en la lista marcada «importada».
**Postcondición de fallo:** Con 63/65 hex, sin prefijo `0x`, con caracteres no hexadecimales o con una clave fuera del rango de secp256k1, la UI muestra error inline y no se añade ninguna entrada.
**Datos implicados:** `truekeate_imported_accounts` (§2.3), `truekeate_current_account` (§2.4, valor `imp:<address>`), `truekeate_logs` (§2.11, `event`: `account_imported`, sin clave privada).
**Trazabilidad:** RF-05, RF-33 · RNF-09, RNF-22 · CA-RF-05

**Flujo principal**
1. El Usuario abre «Importar cuenta» y pega `0x` + 64 dígitos hexadecimales.
2. El popup valida el formato (63/65 hex y `0x` obligatorios) y muestra la dirección derivada como vista previa.
3. El Usuario confirma; el SW deriva `ethers.computeAddress(privateKey)`, comprueba el checksum EIP-55 y persiste la entrada en `truekeate_imported_accounts`.
4. El SW registra `account_imported` en `truekeate_logs` (solo `origin`, `method` y resultado) y la cuenta pasa a estar disponible en la lista y en `connect.html`.
5. El popup muestra la cuenta como «importada» con su etiqueta por defecto `Importada N`.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (clave ya presente):** el SW no duplica la entrada; responde `-32602` con el mensaje de la **causa «cuenta duplicada»** de la tabla §2.1 (`requerimientos.md` §2.1, ampliada a un mensaje por causa — D-E).
- **A2 — desde el paso 5 (renombrar):** el Usuario edita la etiqueta y continúa en **CU-05**.
- **E1 — desde el paso 2 (formato inválido):** error inline de **CU-32**; no se envía ninguna solicitud al SW.
- **E2 — desde el paso 3 (el usuario cancela):** ninguna entrada se crea ni se modifica.

**Criterios de aceptación**
```gherkin
Dado el formulario «Importar cuenta»
Cuando introduzco 0x más 64 hex válidos
Entonces la cuenta aparece marcada «importada» con la dirección derivada de esa clave
Y truekeate_imported_accounts contiene privateKey, label, importedAt y visible
```

```gherkin
Dado el formulario «Importar cuenta»
Cuando introduzco una clave con formato inválido
Entonces la UI muestra «clave privada inválida» junto al campo
Y no se añade ninguna entrada a truekeate_imported_accounts

Ejemplos:
| clave introducida |
| 63 hex sin prefijo 0x |
| 65 hex |
| 64 hex con carácter no hexadecimal |
| 64 hex fuera del rango de secp256k1 |
```

```gherkin
Dado truekeate_logs tras importar una cuenta
Cuando se inspeccionan las entradas
Entonces no aparece la clave privada ni el mnemonic en ninguna entrada
Y existe exactamente 1 entrada account_imported
```
**EARS.** *Mientras* se importe una cuenta, *el sistema deberá* mantener la clave privada confinada en el Service Worker y `chrome.storage.local` con `accessLevel: 'TRUSTED_CONTEXTS'`. *El sistema deberá* rechazar con `-32602` cualquier clave que no sea 64 hex en el rango de la curva secp256k1.
**Evidencia:** `Vitest: importPrivateKey.spec.ts` · `Vitest: logRedaction.spec.ts` · `E2E: 02-cuentas.spec.ts` · `Comando: grep -rn "privateKey" src/popup` (0 coincidencias)

---

### CU-04 · Derivar y añadir cuentas HD
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, UI del popup
**Objetivo:** Ampliar la lista de cuentas derivadas del mnemonic con la siguiente ruta BIP-44 disponible.
**Precondiciones:** Cartera con `truekeate_mnemonic`; `truekeate_accounts` con 5 direcciones (índices 0..4).
**Postcondición de éxito:** `truekeate_accounts` contiene una dirección más (índice 5), distinta de todas las anteriores, y `truekeate_settings.derivedAccountCount` se incrementa en 1.
**Postcondición de fallo:** Si el SW no puede derivar (por ejemplo `ethers` no disponible o el mnemonic está corrupto), se responde `-32603`, la lista permanece con 5 cuentas y la UI muestra «No se pudo añadir la cuenta.»
**Datos implicados:** `truekeate_accounts` (§2.2), `truekeate_settings.derivedAccountCount` (§2.10), `truekeate_logs` (§2.11, campo `event`: `account_imported` — **ACU-04/D-D**: se retira el uso de la categoría `system` como si fuera un evento).
**Trazabilidad:** RF-04, RF-10 · RT-02 · CA-RF-04

**Flujo principal**
1. El Usuario abre la lista de cuentas y comprueba que hay 5 cuentas (índices 0 a 4).
2. El Usuario pulsa «Añadir cuenta».
3. El SW deriva `m/44'/60'/0'/0/5`, comprueba que la dirección no está ya en la lista y la añade en orden.
4. El popup refresca la lista y muestra la 6.ª cuenta.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (el índice ya existe por una importación previa):** el SW avanza al siguiente índice libre y lo informa en la UI («se añadió el índice N»).
- **E1 — desde el paso 3 (mnemonic ausente o corrupto):** RNF-22 → la UI muestra «wallet dañada» y **no** deriva direcciones distintas en silencio; se registra el fallo en `truekeate_logs`.

**Criterios de aceptación**
```gherkin
Dado una cartera recién creada
Cuando se abre la lista de cuentas
Entonces hay exactamente 5 cuentas con rutas m/44'/60'/0'/0/0 a /4
```
```gherkin
Dado truekeate_accounts con 5 cuentas (índices 0..4) y derivedAccountCount = 5
Cuando el Usuario pulsa «Añadir cuenta»
Entonces truekeate_accounts contiene una 6.ª cuenta con índice 5 y dirección distinta de las anteriores
Y truekeate_settings.derivedAccountCount pasa de 5 a 6
```
**EARS.** *El sistema deberá* derivar cada cuenta con la ruta `m/44'/60'/0'/0/i` mediante `ethers.js v6`. *Si* el mnemonic almacenado no supera el checksum BIP-39, *entonces* *el sistema deberá* mostrar «wallet dañada» y no modificar `truekeate_accounts`.
**Evidencia:** `Vitest: derivation.spec.ts` · `E2E: 02-cuentas.spec.ts` · `Vitest: integrity.spec.ts`

---

### CU-05 · Renombrar una cuenta
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, UI del popup
**Objetivo:** Asignar una etiqueta legible a una cuenta (derivada o importada) que persista entre aperturas del popup.
**Precondiciones:** Al menos una cuenta en la lista; popup abierto.
**Postcondición de éxito:** La etiqueta queda persistida —`truekeate_imported_accounts[].label` en cuentas importadas y **`truekeate_settings.accountLabels: Record<indice, string>`** en cuentas derivadas (ACU-06/D-F)— y se muestra en la lista, en `connect.html` y en `notification.html`.
**Postcondición de fallo:** Con una etiqueta vacía o de más de 32 caracteres, la UI muestra error inline y la etiqueta anterior se conserva.
**Datos implicados:** `truekeate_imported_accounts[].label` (§2.3), `truekeate_settings.accountLabels: Record<indice, string>` (§2.10 — **ACU-06/D-F**), `truekeate_current_account` (§2.4).
**Trazabilidad:** RF-05, RF-10 · CA-RF-05, CA-RF-10

**Flujo principal**
1. El Usuario abre el detalle de una cuenta y pulsa «Renombrar».
2. El popup muestra el campo con la etiqueta actual y el contador de 32 caracteres.
3. El Usuario escribe la nueva etiqueta y confirma.
4. El SW valida la longitud, persiste el cambio y responde con la cuenta actualizada.
5. El popup refleja la etiqueta nueva de inmediato.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (el Usuario cancela):** la etiqueta anterior se conserva sin cambios.
- **E1 — desde el paso 4 (etiqueta de 33 o más caracteres):** `-32602` con «Los parámetros de la solicitud no son válidos.» y error inline de **CU-32**.

**Criterios de aceptación**
```gherkin
Dado una cuenta derivada con índice 3 y una cuenta importada con etiqueta por defecto «Importada 1»
Cuando el Usuario renombra la derivada a «Cuenta de pruebas» y confirma
Entonces truekeate_settings.accountLabels["3"] es «Cuenta de pruebas»
Y tras cerrar y reabrir el popup la etiqueta sigue siendo «Cuenta de pruebas»
```
```gherkin
Dado el diálogo de renombrado abierto
Cuando el Usuario confirma una etiqueta inválida
Entonces la UI muestra el mensaje inline junto al campo
Y la etiqueta anterior se conserva

Ejemplos:
| etiqueta introducida |
| vacía |
| de 33 caracteres |
```
**EARS.** *Cuando* el Usuario confirme una etiqueta de entre 1 y 32 caracteres, *el sistema deberá* persistirla en `chrome.storage.local` y reflejarla en las tres ventanas de la extensión.
**Evidencia:** `Vitest: accounts.spec.ts` · `E2E: 02-cuentas.spec.ts — renombrado y persistencia` · `E2E: 05-persistencia.spec.ts`

---

### CU-06 · Eliminar una cuenta importada
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, UI del popup
**Objetivo:** Retirar de la cartera una cuenta importada por clave privada, eliminando su material sensible del almacenamiento.
**Precondiciones:** `truekeate_imported_accounts` con al menos una entrada.
**Postcondición de éxito:** La entrada desaparece de `truekeate_imported_accounts` (incluida su `privateKey`), la cuenta deja de ofrecerse en `connect.html` y, si era la activa, `truekeate_current_account` pasa a `idx:0`.
**Postcondición de fallo:** Si el Usuario cancela el diálogo destructivo, no se elimina nada; si la cuenta está referenciada por una sesión de dApp activa, la operación se bloquea con `-32602` y se indica la dApp que debe revocarse primero.
**Datos implicados:** `truekeate_imported_accounts` (§2.3), `truekeate_current_account` (§2.4), `truekeate_connected_sites` (§2.7), `truekeate_logs` (§2.11, `event`: `account_removed`).
**Trazabilidad:** RF-06 · RNF-22 · CA-RF-06

**Flujo principal**
1. El Usuario abre el detalle de una cuenta importada y pulsa «Eliminar cuenta».
2. El popup muestra un diálogo destructivo que nombra la cuenta y advierte de que su clave privada no se puede re-derivar del mnemonic.
3. El Usuario confirma.
4. El SW comprueba que no hay sesiones de dApp usando esa cuenta y elimina la entrada completa.
5. El popup refresca la lista y registra `account_removed` en `truekeate_logs` (sin clave privada).

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (ocultar una cuenta derivada):** las cuentas derivadas no se eliminan; se marca `visible: false` y la cuenta puede volver a mostrarse con la misma dirección.
- **E1 — desde el paso 3 (existe una sesión con esa cuenta):** `-32602` con el mensaje de la **causa «cuenta en uso por una dApp»** de la tabla §2.1 (D-E: un mensaje por causa) y ninguna escritura.
- **E2 — desde el paso 4 (cuenta activa):** `truekeate_current_account` se reasigna a `idx:0` en la misma operación.

**Criterios de aceptación**
```gherkin
Dado una cuenta importada con etiqueta
Cuando el Usuario confirma «Eliminar cuenta»
Entonces la cuenta desaparece de la lista y su clave privada ya no existe en chrome.storage.local
Y si era la cuenta activa, truekeate_current_account pasa a "idx:0"
```

```gherkin
Dado una cuenta importada y el diálogo destructivo abierto
Cuando el Usuario cancela el diálogo
Entonces la entrada permanece intacta en truekeate_imported_accounts con su privateKey
```
```gherkin
Dado una cuenta derivada del mnemonic
Cuando el Usuario la oculta
Entonces la entrada no se borra y la cuenta puede volver a mostrarse con la misma dirección
```
**EARS.** *El sistema deberá* eliminar la `privateKey` de una cuenta importada solo tras confirmación explícita, y *nunca deberá* eliminar cuentas derivadas del mnemonic (solo ocultarlas). *Si* la cuenta está en uso por una sesión de dApp, *entonces* *el sistema deberá* bloquear el borrado con `-32602`.
**Evidencia:** `Vitest: accounts.spec.ts — borrado de importada` · `E2E: 25-recuperacion.spec.ts` (texto del diálogo) · `Comando: chrome.storage.local.get('truekeate_imported_accounts')`

---

### CU-07 · Revelar/exportar el material de recuperación
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, UI del popup · **Responsable de seguridad** (rol de custodia)
**Objetivo:** Obtener una copia verificable del mnemonic o de la clave privada de una cuenta, tras confirmación explícita, para poder restaurar la cartera en otro equipo.
**Requisito que lo respalda (P-18):** **RF-50 (Must) · `CA-RF-50`**, en curso de incorporación a `requerimientos.md`. Este documento **no** reescribe el requisito: lo referencia. Complementa a **RNF-22** («Exportación/revelado del mnemonic y de las claves privadas tras confirmación explícita») y cubre el riesgo «pérdida irrecuperable de cuentas importadas» declarado como Alto en `requerimientos.md` §8.
**Precondiciones:** Cartera operativa; popup abierto; el Usuario conoce que el entorno es de desarrollo.
**Postcondición de éxito:** La UI muestra la frase o la clave privada bajo demanda (`type="password"` con botón «Mostrar»), el portapapeles contiene el valor solo tras pulsar «Copiar» y se registra **exactamente 1 entrada** en `truekeate_logs` con `event: approval_resolved` y `origin: extension` **sin el valor** (ACU-04: `truekeate_logs` usa el campo `event` del catálogo de 23 nombres; `system` es una **categoría**, no un evento — ver §9, hueco 13).
**Postcondición de fallo:** Si el Usuario cancela la confirmación, no se muestra nada; el valor nunca se envía al content script ni a la página.
**Datos implicados:** `truekeate_mnemonic` (§2.1), `truekeate_imported_accounts[].privateKey` (§2.3), `truekeate_logs` (§2.11: `event`, `category`, `origin`, sin payload sensible).
**Trazabilidad:** RF-50 · RNF-09, RNF-22 · CA-RF-50
> **Delta propio del CU (ACU-26).** No se reproduce el texto de `CA-RF-50`: además del criterio del requisito, este CU exige (a) entrega **solo** a contextos de la extensión (`sender.tab === undefined` y `sender.url` en la allowlist), (b) ocultado a los 60 s y al perder el foco, y (c) que el valor **nunca** aparezca en `truekeate_logs` ni viaje por `window.postMessage`.

**Flujo principal**
1. El Usuario abre «Seguridad → Revelar material de recuperación».
2. El popup muestra la advertencia de RNF-23 y exige confirmación explícita en un diálogo destructivo (texto de RNF-22).
3. El Usuario confirma; el SW responde con el valor solicitado (mnemonic o clave privada de la cuenta elegida) **solo al contexto del popup** verificado por `sender.url` en la allowlist.
4. El popup muestra el valor oculto por defecto, con botón «Mostrar» y temporizador de ocultado de 60 s.
5. El SW registra la entrada con `event: approval_resolved`, `origin: extension` y el resultado `ok`, sin el valor.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (el Usuario cancela):** no se devuelve ningún valor y el diálogo se cierra.
- **E1 — desde el paso 3 (invocación desde un content script):** el SW responde `4200 Unsupported method` (guarda de `sender` de §4.2 del diccionario) y registra el intento.
- **E2 — desde el paso 4 (pérdida de foco o cierre del popup):** el valor se oculta y se descarta de la memoria de la UI.

**Criterios de aceptación**
```gherkin
Dado el popup con una cartera creada
Cuando el Usuario abre «Revelar material de recuperación» y confirma el diálogo destructivo
Entonces puede mostrar y copiar las 12 palabras, que coinciden con truekeate_mnemonic
Y la clave privada revelada deriva exactamente la dirección que se muestra en la lista
```

```gherkin
Dado el diálogo destructivo de revelado abierto
Cuando el Usuario cancela la confirmación
Entonces no se muestra ningún valor en la UI
Y el portapapeles no contiene la frase ni la clave privada
Y truekeate_logs no registra ninguna entrada de revelado
```
```gherkin
Dado un content script de una dApp
Cuando solicita wallet_generateMnemonic o el revelado de claves
Entonces recibe un error con code 4200
Y truekeate_logs registra el intento sin ningún valor sensible
```
**EARS.** *Mientras* se revele material de recuperación, *el sistema deberá* entregarlo únicamente a páginas de la extensión (`sender.tab === undefined` y `sender.url` en la allowlist) y *nunca deberá* incluirlo en `truekeate_logs` ni en mensajes `window.postMessage`.
**Evidencia:** `E2E: 25-recuperacion.spec.ts — revelado y ocultado a los 60 s` · `Vitest: logRedaction.spec.ts — 0 coincidencias del valor revelado` · `Vitest: eip1193.spec.ts — guarda de contexto del revelado` · `Inspección: allowlist de `sender.url` en `handleRPCRequest` (§4.2 del diccionario)`

---

### CU-08 · Reabrir el popup y restaurar el estado persistido
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, Navegador (ciclo de vida MV3)
**Objetivo:** Recuperar automáticamente la cartera al abrir el popup, sin volver a pedir la frase.
**Precondiciones:** `truekeate_mnemonic` y/o `truekeate_imported_accounts` presentes; Service Worker detenido («frío»).
**Postcondición de éxito:** El popup muestra la cuenta activa, su saldo, la red activa, las cuentas importadas y las sesiones de dApp con los mismos valores previos; no se pide la frase en ninguna pantalla.
**Postcondición de fallo:** Si el estado persistido está corrupto (checksum BIP-39 o EIP-55 inválidos), la UI muestra «wallet dañada» y ofrece «Resetear cartera» (**CU-30**) sin derivar direcciones distintas en silencio.
**Datos implicados:** Todas las claves `truekeate_*` (§2.1–§2.11); entidades volátiles reconstruidas: `portsByApprovalId`, `windowsByApprovalId`, `expiryAlarms`, `rmwLock` (§3.4 del diccionario).
**Trazabilidad:** RF-09, RF-10, RF-17 · RNF-08, RNF-22 · CA-RF-09, CA-RF-10, CA-RF-17

**Flujo principal**
1. El Usuario pulsa el icono de la extensión; el popup monta y registra `performance.mark('popup-mount')`.
2. El popup lee `truekeate_current_account`, `truekeate_chain_id`, `truekeate_accounts`, `truekeate_imported_accounts` y `truekeate_connected_sites` de `chrome.storage.local`.
3. El SW arranca, aplica `setAccessLevel('TRUSTED_CONTEXTS')`, purga entradas con `status !== 'pending'` o `expiresAt <= now` y rearma `chrome.alarms` de las `pending`.
4. El popup renderiza cuenta activa, red y lista de cuentas; la primera lectura de saldo se lanza de inmediato (**CU-10**).
5. El popup marca `performance.mark('balance-rendered')` cuando el saldo está pintado; **no** aparece ningún campo de frase ni de contraseña.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 2 (no hay cartera):** el popup muestra la pantalla inicial y el flujo continúa en **CU-01** o **CU-02**.
- **A2 — desde el paso 3 (había solicitudes `pending`):** el SW reconcilia y responde a las huérfanas con `4001`; ver **CU-15** y **CU-16**.
- **E1 — desde el paso 2 (mnemonic o dirección corruptos):** mensaje «wallet dañada» + opción de reset; el estado persistido **no** se modifica automáticamente.
- **E2 — desde el paso 3 (el SW solo recibe el evento):** la reconstrucción de la cola debe completarse en **< 1 s** (RNF-08); si se excede, se registra en `truekeate_logs` como incidencia de rendimiento.

**Criterios de aceptación**
```gherkin
Dado el estado: cuenta activa 2, red X, 1 cuenta importada y 1 sesión de dApp
Cuando se cierra y se reabre el popup
Entonces se restauran los cuatro elementos con los mismos valores
Y no se solicita la frase semilla en ninguna pantalla
```
```gherkin
Dado el Service Worker detenido y truekeate_pending_requests con 1 entrada pending vigente y 1 entrada con expiresAt ya vencido
Cuando el SW arranca
Entonces truekeate_pending_requests conserva exactamente las 1 entrada pending no vencida
Y la reconciliación completa en menos de 1000 ms medidos con performance.now() entre el arranque y la cola reconstruida
Y truekeate_logs contiene exactamente 1 entrada con event sw_reconcile
```
```gherkin
Dado truekeate_pending_requests con 50 entradas pending vigentes y el Service Worker detenido
Cuando el SW arranca con el reloj inyectado y la reconciliación completa
Entonces el scrapeo completo de la cola termina en menos de 1000 ms
Y las 50 entradas siguen presentes con su approvalId original
```
**EARS.** *Cuando* el popup se abra con cartera existente, *el sistema deberá* restaurar el estado sin solicitar la frase. *Si* el estado persistido no supera el checksum BIP-39 o el formato EIP-55, *entonces* *el sistema deberá* mostrar «wallet dañada» en lugar de derivar direcciones distintas en silencio. *Mientras* el SW se reinicie, *el sistema deberá* reconstruir la cola persistida en menos de 1 s.
**Evidencia:** `E2E: 05-persistencia.spec.ts — restauración del estado` · `Vitest: state.spec.ts` · `Vitest: approvalReconcile.spec.ts — 50 pendientes < 1 s con reloj inyectado` · `E2E: 05-persistencia.spec.ts — RNF-02 en caliente: performance.getEntriesByName('popup-mount') y ('balance-rendered'), 10 repeticiones, mediana < 800 ms (artefacto RepoTecnico/perf/popup-<fecha>.json)`

---

### CU-09 · Recibir fondos: dirección, copiar y QR
**Actor primario:** Usuario · **Secundarios/sistemas:** UI del popup, Navegador (portapapeles)
**Objetivo:** Obtener la dirección de la cuenta activa en tres formas equivalentes (texto completo, portapapeles y QR) para poder recibir transferencias.
**Precondiciones:** Cuenta activa seleccionada; popup abierto.
**Postcondición de éxito:** La vista «Recibir» muestra la dirección completa `0x` + 40 hex, el botón «Copiar» deja exactamente esa cadena en el portapapeles y el QR decodificado devuelve la misma cadena.
**Postcondición de fallo:** Si el portapapeles no está disponible (permiso denegado), la UI muestra un aviso y ofrece la dirección seleccionable como alternativa; nunca copia una cadena distinta.
**Datos implicados:** `truekeate_current_account` (§2.4), `truekeate_accounts` (§2.2), `truekeate_imported_accounts` (§2.3) — el QR es estado de UI y **no** se persiste.
**Trazabilidad:** RF-07, RF-49 · RNF-18 · CA-RF-07

**Flujo principal**
1. El Usuario pulsa «Recibir» en la cuenta activa.
2. El popup muestra la dirección completa en tipografía mono (`JetBrains Mono`), el código QR generado localmente y el botón «Copiar dirección».
3. El Usuario pulsa «Copiar dirección».
4. El portapapeles recibe la cadena exacta y el botón pasa al estado copiado (check dorado `--tk-gold-500` + toast de 3 s).

**Flujos alternativos y de excepción**
- **A1 — desde el paso 2 (cuenta importada):** se muestra la misma vista con la dirección de la cuenta importada.
- **A2 — desde el paso 2 (etiqueta larga):** la etiqueta se trunca con puntos suspensivos y la dirección **no** se trunca en esta vista (solo en la lista se abrevia `0x1234…abcd`).
- **E1 — desde el paso 3 (portapapeles no disponible):** aviso inline «No se pudo copiar. Selecciona la dirección manualmente.» (es un aviso de UI **con causa propia**; no es un error EIP-1193 porque no hay llamada al provider — D-E) y la dirección queda seleccionable.

**Criterios de aceptación**
```gherkin
Dado la cuenta activa seleccionada
Cuando el Usuario abre «Recibir»
Entonces se muestra la dirección completa 0x más 40 hex
Y al pulsar «Copiar», el portapapeles contiene exactamente esa dirección
Y el QR decodificado devuelve la misma cadena
```
**EARS.** *El sistema deberá* generar el QR localmente a partir de la dirección de la cuenta activa, sin peticiones de red. *Si* el portapapeles no está disponible, *entonces* *el sistema deberá* mostrar un aviso en español y mantener la dirección seleccionable.
**Evidencia:** `E2E: 03-recibir.spec.ts — copiar y QR` · `Inspección: red del popup sin peticiones externas (RNF-20)`

---

### CU-10 · Consultar el saldo y su actualización cada 5 s
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, UI del popup, Nodo RPC local Anvil
**Objetivo:** Conocer el saldo de sus cuentas con un valor actualizado periódicamente y con la red activa visible.
**Precondiciones:** Cartera con al menos 1 cuenta; popup abierto; Anvil en marcha en `127.0.0.1:8545` con la cuenta 0 con saldo.
**Postcondición de éxito:** La UI muestra el saldo en ETH con 4 decimales y la dirección abreviada `0x1234…abcd`; con el popup abierto se ejecuta **exactamente 1 `eth_getBalance` por cuenta visible cada 5000 ms**.
**Postcondición de fallo:** Si el RPC no responde, se conserva el último saldo mostrado, se marca «desconectado» y se aplica la política de reintentos de **CU-31**; el polling no acumula llamadas en vuelo.
**Datos implicados:** `truekeate_settings.balancePollMs` (5000), `balancePollMaxAccounts` (10) (§2.10), `truekeate_chain_id` (§2.5), `truekeate_networks` (§2.6), `truekeate_logs` (§2.11, `event`: `rpc_call` y `category`: `call`).
**Trazabilidad:** RF-18, RF-27, RF-34 · RNF-02, RNF-03 · CA-RF-18, CA-RF-27, CA-RF-34

**Flujo principal**
1. El popup monta y lanza una lectura inmediata de saldo de la cuenta activa.
2. El SW resuelve `eth_getBalance(cuenta, 'latest')` contra Anvil y devuelve el valor en wei.
3. La UI pinta el saldo con 4 decimales y sufijo `ETH`, y abrevia la dirección.
4. El popup programa `setInterval(balancePollMs = 5000)`; cada ciclo hace **una** lectura por cuenta visible (hasta 10).
5. Al desmontar el popup, el intervalo se limpia de forma explícita y no se registra ninguna llamada adicional.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 4 (`connect.html` abierta):** el polling lo posee esa ventana mientras está abierta, con el mismo ciclo y el mismo alcance por cuenta.
- **A2 — desde el paso 4 (pestaña oculta):** con `document.visibilityState === 'hidden'` el ciclo se pausa; al volver a `visible` se relanza con lectura inmediata.
- **A3 — desde el paso 4 (cambio de cuenta o de red):** el ciclo se reinicia con la nueva cuenta/red (**CU-24**, **CU-26**).
- **E1 — desde el paso 2 (RPC caído):** se conserva el último saldo y se muestra «desconectado»; continúa en **CU-31**.

**Criterios de aceptación**
```gherkin
Dado el popup abierto con 1 cuenta visible y un contador RPC instrumentado
Cuando transcurren 5 s
Entonces el contador registra exactamente 1 eth_getBalance
Y a los 10 s el total es exactamente 2
```
```gherkin
Dado el popup abierto con 1 cuenta visible y un contador RPC instrumentado
Cuando el Usuario cierra el popup
Entonces no se registra ninguna llamada de polling adicional en los 15 s siguientes
```
```gherkin
Dado un saldo de 1000000000000000000 wei en la cuenta activa
Cuando el popup lo pinta
Entonces el texto muestra «1.0000 ETH»
Y la dirección se abrevia como 0x1234…abcd con el valor completo en el atributo title
```
**EARS.** *Mientras* el popup esté abierto, *el sistema deberá* ejecutar exactamente 1 `eth_getBalance` por cuenta visible por ciclo de 5000 ms, hasta `balancePollMaxAccounts = 10`, y *deberá* detener el ciclo al cerrarse la vista. *Si* el RPC no responde, *entonces* *el sistema deberá* conservar el último saldo y mostrar «desconectado» sin acumular llamadas en vuelo.
**Evidencia:** `Vitest: polling.spec.ts — contador RPC` · `E2E: 14-polling.spec.ts` · `E2E: 07-provider.spec.ts` · `Comando: cast balance 0xf39F…2266 --rpc-url http://127.0.0.1:8545`

---

### CU-11 · Enviar ETH a una dirección externa
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, Nodo RPC local Anvil, `notification.html`
**Objetivo:** Transferir ETH desde una cuenta de la cartera a una dirección que no pertenece a la cartera, con estimación de comisión y confirmación del usuario.
**Precondiciones:** Cartera operativa; Anvil en marcha; saldo suficiente para valor + comisión; el destinatario es una dirección válida.
**Postcondición de éxito:** El SW difunde una transacción EIP-1559 (tipo 2) con `chainId` de la red activa, `maxFeePerGas`/`maxPriorityFeePerGas` de `getFeeData()`, y devuelve el hash `0x` + 64 hex; el recibo es `status 1` y el saldo del destinatario aumenta en el valor menos la comisión.
**Postcondición de fallo:** Si el valor supera el saldo, la dirección es inválida o `estimateGas` revierte, **no** se abre `notification.html`, no se difunde nada y la llamada se rechaza con el código tipado correspondiente (`-32000` / `-32602`).
**Datos implicados:** `truekeate_current_account` (§2.4), `truekeate_networks` (§2.6), `TxPreview` (§3.1) con `nonceInformativo`, `gasLimit`, `estimationFailed`, `maxFeePerGas`; `truekeate_pending_requests` (§2.8); `truekeate_logs` (`call`, `sign`, `tx`).
**Trazabilidad:** RF-08, RF-19, RF-33, RF-42, RF-43 · RNF-05, RNF-25 · CA-RF-08, CA-RF-19, CA-RF-33, CA-RF-42, CA-RF-43

**Flujo principal**
1. El Usuario abre «Enviar», escribe la dirección de destino y el valor en ETH.
2. La UI valida dirección (checksum EIP-55), valor > 0 y saldo suficiente, y muestra la comisión estimada.
3. El SW construye `TxPreview` (destino, valor, `gasLimit` por `estimateGas`, `maxFeePerGas`, `nonceInformativo`) y crea una entrada `pending` en `truekeate_pending_requests`.
4. Se abre **una** ventana `notification.html` (420 × 640 px) con foco, en primer plano y con el origen solicitante visible; el Usuario decide en **CU-13**.
5. Al aprobar, el SW recalcula `nonce` con `getTransactionCount(account, 'pending')` y `getFeeData()`, firma con `chainId` activo y difunde.
6. El SW devuelve el hash y escribe en `truekeate_logs` una entrada `tx` con `txStatus: 'pending'` y el hash.
7. El SW consulta `eth_getTransactionReceipt(hash)`; al obtener `status 0x1` marca la entrada como `confirmed`; si es `0x0`, como `failed` con nivel `error` y el motivo del revert.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 2 (destino dentro de la propia cartera):** el flujo continúa en **CU-12**, que preselecciona las cuentas propias.
- **A2 — desde el paso 4 (el Usuario rechaza):** **CU-14**; no se firma ni se difunde; la dApp recibe `4001`.
- **A3 — desde el paso 4 (el plazo vence):** **CU-15**; el SW cierra la ventana y la página recibe `4001`.
- **E1 — desde el paso 3 (`estimateGas` revierte):** `estimationFailed = { reason }`, envío bloqueado, `-32000` con «La red rechazó la transacción: nonce o gas inválidos.» y traza en logs.
- **E2 — desde el paso 5 (efectivo insuficiente para valor + comisión):** `-32000` con «Saldo insuficiente.»; no se firma.
- **E3 — desde el paso 5 (el nodo rechaza el nonce):** `-32000`; el SW reintenta una vez recalculando `nonce` y `getFeeData()`; si vuelve a fallar, se registra `tx_failed`.
- **E4 — desde el paso 7 (revert on-chain):** recibo `status 0x0` → `txStatus: 'failed'` con `level: 'error'` y el motivo del revert si el nodo lo entrega.

**Criterios de aceptación**
```gherkin
Dado Anvil en marcha con la cuenta 0 con saldo y la cuenta 1 con 0
Cuando envío 1 ETH de la cuenta 0 a la 1 y apruebo en notification.html
Entonces eth_sendTransaction resuelve un hash 0x más 64 hex
Y eth_getTransactionReceipt(hash).status es 1
Y el saldo de la cuenta 1 aumenta en 1 ETH menos la comisión
```

```gherkin
Dado Anvil en marcha y la cuenta 0 con saldo
Cuando intento enviar con una entrada inválida
Entonces la llamada se rechaza sin difundir ninguna transacción
Y no se abre ninguna ventana notification.html
Y el código y el mensaje son los de la tabla §2.1 para esa causa

Ejemplos:
| causa | código esperado |
| valor mayor que el saldo | -32000 |
| dirección de destino con checksum EIP-55 inválido | -32602 |
| estimateGas revierte | -32000 |
```
```gherkin
Dado una transacción firmada por la cartera
Cuando se inspecciona su recibo
Entonces el recibo tiene type 2
Y maxFeePerGas y maxPriorityFeePerGas son mayores que 0 y provienen de getFeeData()
Y el chainId de la firma es 31337 (0x7a69) con v = chainId*2+35 o chainId*2+36
```

```gherkin
Dado un eth_sendTransaction cuyo chainId no es el de la red activa
Cuando la dApp envía la solicitud
Entonces la promesa se rechaza con error tipado de la tabla §2.1
Y no se difunde ninguna transacción
```
**EARS.** *El sistema deberá* construir toda transacción como EIP-1559 tipo 2 con `maxFeePerGas`/`maxPriorityFeePerGas` de `getFeeData()`. *Si* `estimateGas` falla o revierte, *entonces* *el sistema deberá* bloquear el envío y responder `-32000` con mensaje accionable en español. *Mientras* firme, *el sistema deberá* recalcular `nonce` y `getFeeData()` e incluir el `chainId` activo (EIP-155).
```gherkin
Dado un nodo falso que rechaza la primera difusión por nonce inválido y acepta la segunda
Cuando el SW difunde la transacción firmada
Entonces se observan exactamente 2 llamadas a eth_sendRawTransaction
Y entre ambas el SW recalcula eth_getTransactionCount y eth_gasPrice
Y la transacción queda registrada con event tx_sent y el hash definitivo
```
```gherkin
Dado un nodo falso que rechaza las 2 difusiones por nonce inválido
Cuando el SW agota el reintento
Entonces la promesa se rechaza con code -32000 y el mensaje de la tabla §2.1
Y truekeate_logs registra exactamente 1 entrada con event tx_failed
Y no queda ninguna transacción en vuelo para esa cuenta
```
**Evidencia:** `E2E: 04-enviar.spec.ts` · `Vitest: tx.spec.ts` · `Vitest: eip1559.spec.ts` · `Vitest: eip155.spec.ts` · `Vitest: txContract.spec.ts — reintento de nonce y tx_failed` · `Comando: cast tx <hash> --rpc-url http://127.0.0.1:8545`

---

### CU-12 · Transferir ETH entre cuentas propias
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, Nodo RPC local Anvil, `notification.html`
**Objetivo:** Mover saldo entre dos cuentas de la propia cartera sin escribir ninguna dirección, eligiendo origen y destino de la lista.
**Precondiciones:** Cartera con al menos 2 cuentas visibles; Anvil en marcha; saldo suficiente en la cuenta de origen.
**Postcondición de éxito:** Se difunde una transacción tipo 2 desde la cuenta de origen a la cuenta de destino elegidas, con hash `0x` + 64 hex y recibo `status 1`; los saldos de ambas cuentas se actualizan en el siguiente ciclo de polling.
**Postcondición de fallo:** Si origen y destino coinciden, si el saldo es insuficiente o si `estimateGas` falla, no se abre ventana de confirmación ni se difunde nada.
**Datos implicados:** `truekeate_accounts` (§2.2), `truekeate_imported_accounts` (§2.3), `TxPreview` (§3.1), `truekeate_pending_requests` (§2.8), `truekeate_logs` (`tx`).
**Trazabilidad:** RF-08, RF-19, RF-42, **RF-43** · RNF-05, RNF-25 · CA-RF-08, CA-RF-19, CA-RF-42, **CA-RF-43** (ACU-13: la transferencia interna también exige `chainId` activo en la firma, igual que CU-11)

**Flujo principal**
1. El Usuario pulsa «Enviar entre mis cuentas».
2. El popup muestra dos selectores con las cuentas visibles y sus saldos; preselecciona `from` = cuenta activa.
3. El Usuario elige `to` (distinta de `from`) e introduce el valor.
4. La UI valida que `from ≠ to`, que el valor es > 0 y que hay saldo; muestra la comisión estimada.
5. El SW construye `TxPreview`, crea la solicitud `pending` y abre `notification.html`; el Usuario decide en **CU-13**.
6. Al aprobar, el SW firma y difunde; polling (**CU-10**) refleja los saldos nuevos en ≤ 5 s.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (`from` y `to` iguales):** el selector de destino excluye la cuenta de origen y la UI muestra «El destino debe ser distinto del origen».
- **A2 — desde el paso 5 (el Usuario rechaza o vence el plazo):** **CU-14** / **CU-15**; no se difunde nada.
- **E1 — desde el paso 4 (saldo insuficiente):** botón «Enviar» deshabilitado y mensaje inline de **CU-32**.
- **E2 — desde el paso 6 (el nodo rechaza por nonce):** `-32000`; se aplica la reintentología de CU-11/E3.

**Criterios de aceptación**
```gherkin
Dado una cartera con las cuentas 0 y 1 visibles y la cuenta 0 con saldo
Cuando el Usuario elige origen 0, destino 1, valor 1 ETH y aprueba en notification.html
Entonces la dApp no interviene y la extensión difunde la transacción
Y el saldo de la cuenta 1 aumenta en 1 ETH menos la comisión
```
```gherkin
Dado una cartera con las cuentas 0 y 1 visibles
Cuando el Usuario selecciona la misma cuenta como origen y destino
Entonces la UI muestra «El destino debe ser distinto del origen»
Y no se crea ninguna entrada pending en truekeate_pending_requests
Y no se abre ninguna ventana notification.html
```
**EARS.** *El sistema deberá* ofrecer únicamente cuentas de la propia cartera como destino y *deberá* impedir `from === to` antes de construir `TxPreview`. *Mientras* la transferencia sea interna, *el sistema deberá* aplicar el mismo contrato observable de transacción (`pending → confirmada`/`fallida`) que en CU-11.
**Evidencia:** `E2E: 04-enviar.spec.ts — entre cuentas propias` · `Vitest: tx.spec.ts` · `Vitest: eip155.spec.ts — chainId activo en la transferencia interna` · `E2E: 14-polling.spec.ts — saldos nuevos ≤ 5 s`

---

### CU-13 · Aprobar una transacción con vista previa decodificada
**Actor primario:** Usuario · **Secundarios/sistemas:** `notification.html`, Service Worker, Navegador
**Objetivo:** Decidir con información suficiente sobre una solicitud pendiente, viendo qué se autoriza realmente (destino etiquetado, calldata decodificado y avisos de riesgo).
**Precondiciones:** Existe una entrada `pending` en `truekeate_pending_requests` creada por CU-11, CU-12, CU-24, CU-25, CU-27 o CU-28; la ventana `notification.html` está abierta con foco.
> **ACU-30.** **CU-17 queda retirado** de esta precondición: la conexión de dApp no usa `truekeate_pending_requests` ni `notification.html`; vive en `truekeate_connect_request` y se aprueba en `connect.html` (§2.9 del diccionario). En su lugar se cita **CU-24**, que sí crea una entrada `pending` en `truekeate_pending_requests` al pedir el cambio a una red no activa (P-19).
**Postcondición de éxito:** El SW recibe `SIGN_RESPONSE` con `success: true`, ejecuta la firma/difusión, cierra la ventana, elimina la entrada de la cola persistida, recalcula el badge y devuelve el resultado a la página o al popup.
**Postcondición de fallo:** Si el SW no puede firmar (material ausente, RPC caído, plazo vencido), la ventana muestra el error en español, la entrada pasa a `rejected` o `expired` y la página recibe el código EIP-1193 correspondiente.
**Datos implicados:** `truekeate_pending_requests` (§2.8), `TxPreview` (§3.1: `toLabel`, `selector`, `functionName`, `decodedArgs`, `isUnrecognizedContractCall`, `riskWarnings[]`), `TypedDataPreview` (§3.2), `PersonalSignPreview` (§3.3), `truekeate_logs` (`approval_resolved`).
**Trazabilidad:** RF-19, RF-35, RF-41 · RNF-05, RNF-12, RNF-21 · CA-RF-19, CA-RF-35, CA-RF-41

**Flujo principal**
1. El SW abre `notification.html` (420 × 640 px) con foco y en primer plano, y muestra el origen solicitante con su favicon, siempre visible.
2. La ventana renderiza el resumen: cuenta que firma, destino etiquetado (`toLabel`), valor, red y comisión estimada (`estimatedFeeEth`).
3. Si `data !== '0x'`, la ventana muestra **selector**, **nombre de función** y **parámetros legibles**; si el selector es desconocido, marca `isUnrecognizedContractCall` y muestra el aviso «llamada a contrato no reconocida».
4. Si `riskWarnings[]` no está vacío (allowance ilimitada en `approve`, `setApprovalForAll`, `data` no vacío desconocido, destino sin etiqueta), cada aviso se muestra destacado sobre el tramo oscuro del degradado de marca.
5. El Usuario pulsa «Aprobar» (un solo clic; área ≥ 44 × 44 px, separación ≥ 8 px respecto de «Rechazar»).
6. El SW valida que la entrada sigue `pending` y no vencida, recalcula `nonce` y `getFeeData()`, firma y difunde, y envía `SIGN_RESPONSE` con `success: true`.
7. El SW cierra la ventana, purga la entrada, recalcula el badge y registra `approval_resolved` en `truekeate_logs`.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 5 (el Usuario pulsa «Rechazar» o `Esc`):** continúa en **CU-14**; `Esc` equivale a rechazar.
- **A2 — desde el paso 6 (el plazo venció mientras la ventana estaba abierta):** el SW **no** firma; responde `4001` y el flujo termina en **CU-15**.
- **A3 — desde el paso 5 (el Usuario cierra la ventana con la X):** se trata como rechazo (`4001`) y la entrada se elimina de la cola.
- **E1 — desde el paso 6 (el SW no puede firmar por RPC caído):** `4900` con «Sin conexión con la red local (Anvil).»; la ventana se cierra y la entrada pasa a `rejected`.
- **E2 — desde el paso 6 (doble pulsación de «Aprobar»):** el SW ignora la segunda respuesta (la entrada ya no está `pending`) y no difunde una segunda transacción.

**Criterios de aceptación**
```gherkin
Dado una transacción con data de un approve ilimitado hacia un contrato no reconocido
Cuando se abre notification.html
Entonces la vista previa muestra selector, nombre de función y parámetros legibles
Y etiqueta el destino como «contrato no reconocido»
Y muestra un aviso destacado por allowance ilimitada
```
```gherkin
Dado la vista previa de un approve ilimitado con el aviso de riesgo visible
Cuando el Usuario aprueba en notification.html
Entonces la dApp recibe el hash de la transacción difundida
Y notification.html se cierra y la entrada desaparece de truekeate_pending_requests
```
```gherkin
Dado el popup abierto y una solicitud de firma de un origen
Cuando llega la solicitud
Entonces se abre exactamente 1 ventana notification.html
Y la llamada observada es chrome.windows.create con focused true y type popup
Y tras la creación se observa chrome.windows.update con focused true sobre ese windowId
Y la ventana muestra el origen solicitante con su favicon
Y ofrece únicamente «Aprobar» y «Rechazar»
```
**EARS.** *El sistema deberá* exigir aprobación explícita del usuario antes de firmar cualquier transacción o mensaje, y *nunca deberá* firmar en silencio. *Cuando* la solicitud provenga de una llamada a contrato, *el sistema deberá* mostrar selector, nombre de función y parámetros decodificados, o el aviso de contrato no reconocido. *Si* la ventana se cierra, vence o el usuario pulsa `Esc`, *entonces* *el sistema deberá* tratar la solicitud como rechazada con `4001`.
**Evidencia:** `E2E: 10-aprobar-tx.spec.ts — origen visible y conteo de clics` · `Vitest: windowContract.spec.ts — espía sobre chrome.windows.create/update (focused: true, type: 'popup')` · `Vitest: calldata.spec.ts` · `Vitest: approvalReconcile.spec.ts` · `E2E: 24-accesibilidad.spec.ts — teclado y axe-core`

---

### CU-14 · Rechazar una solicitud pendiente
**Actor primario:** Usuario · **Secundarios/sistemas:** `notification.html`, Service Worker
**Objetivo:** Denegar una solicitud de firma, conexión o cambio de red sin que se firme ni se difunda nada.
**Precondiciones:** Existe una solicitud `pending` y su ventana está abierta.
**Postcondición de éxito:** La entrada queda `rejected` con `resolvedAt` y `errorCode: 4001`, la ventana se cierra, la página recibe un objeto EIP-1193 con `code: 4001` y el badge se recalcula.
**Postcondición de fallo:** Si el envío del error falla (pestaña cerrada), la entrada se marca igualmente `rejected`, se purga y se deja traza en `truekeate_logs`; la solicitud **nunca** queda huérfana.
**Datos implicados:** `truekeate_pending_requests[approvalId].status/resolvedAt/errorCode` (§2.8), `truekeate_connect_request` (§2.9), `truekeate_logs` (`approval_resolved`).
**Trazabilidad:** RF-35, RF-41, RF-14 · RNF-06 · CA-RF-35, CA-RF-41, CA-RF-14

**Flujo principal**
1. El Usuario pulsa «Rechazar» (o `Esc`) en la ventana de confirmación.
2. La ventana envía `SIGN_RESPONSE` con `success: false` y `sender.url` en la allowlist de páginas de la extensión.
3. El SW marca la entrada como `rejected`, anota `resolvedAt` y `errorCode: 4001`, y purga la entrada de la cola persistida.
4. El SW cierra la ventana, recalcula el badge (índice derivado) y entrega a la página `{ code: 4001, message: "Operación cancelada por el usuario." }` por el puerto vivo o por `chrome.tabs.sendMessage`.
5. El SW registra `approval_resolved` en `truekeate_logs`.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 2 (rechazo de una conexión):** aplica el mismo flujo sobre `truekeate_connect_request` y la dApp recibe `4001`; el origen **no** queda en `truekeate_connected_sites`.
- **E1 — desde el paso 4 (la pestaña se cerró):** `chrome.tabs.onRemoved` marca la entrada `rejected`, purga el badge y deja traza; no se intenta entregar el error.
- **E2 — desde el paso 4 (el puerto está cerrado pero la pestaña vive):** la entrega se hace por `chrome.tabs.sendMessage(tabId, { type: 'TRUEKEATE_RESPONSE', ... }, { frameId })`.

**Criterios de aceptación**
```gherkin
Dado una solicitud de transacción pendiente en notification.html
Cuando el Usuario pulsa «Rechazar»
Entonces la ventana se cierra
Y la página recibe un error con code 4001 y message «Operación cancelada por el usuario.»
Y truekeate_pending_requests ya no contiene esa entrada
Y el badge ya no la cuenta
```
```gherkin
Dado un rechazo del Usuario registrado en truekeate_logs
Cuando se consulta el panel de logs
Entonces existe 1 entrada con level error que muestra el código 4001 y el mensaje de la tabla §2.1
Y ninguna entrada del log contiene un objeto Error sin campo code
```
**EARS.** *Cuando* el Usuario rechace una solicitud, *el sistema deberá* responder con un objeto EIP-1193 `{ code: 4001, message: "Operación cancelada por el usuario." }` y *nunca deberá* resolver con `new Error(...)` sin `code`. *Mientras* se rechace, *el sistema deberá* purgar la entrada de la cola persistida y recalcular el badge en la misma operación.
**Evidencia:** `E2E: 10-aprobar-tx.spec.ts — rechazo con Esc y con botón` · `Vitest: approvalQueue.spec.ts — purga de la entrada rechazada` · `Vitest: logger.spec.ts — 1 entrada con event approval_resolved y code 4001` · `E2E: 15-logs.spec.ts — rojo`

---

### CU-15 · Vencer una solicitud por plazo (120 s / 60 s)
**Actor primario:** Service Worker (actor de sistema) · **Secundarios/sistemas:** `chrome.alarms`, `notification.html`, Navegador, dApp
> **Deslinde (ACU-12).** Un único actor primario: el **Service Worker**, dueño único del plazo. §2 y §7 declaran lo mismo.
**Objetivo:** Garantizar que ninguna solicitud quede pendiente indefinidamente: al vencer el plazo, cerrarla, marcarla vencida y devolver un error tipado a la página.
**Precondiciones:** Entrada `pending` con `createdAt = t0` y `expiresAt = t0 + 120000` (firma) o `t0 + 60000` (conexión); `chrome.alarms` disponible.
**Postcondición de éxito:** A los 120 s (firmas) o 60 s (conexión) el SW marca la entrada `expired` con `resolvedAt` y `errorCode: 4001`, **cierra** la ventana `notification.html`, **purga** el badge y la página recibe `{ code: 4001, message: "El usuario no respondió en el plazo establecido; la solicitud ha caducado." }`.
**Postcondición de fallo:** Si el SW estaba dormido, `chrome.alarms` lo despierta y el vencimiento se produce igualmente; si la ventana ya no existe, se re-descubre por URL y, si no aparece, la entrada se marca `expired` sin dejar ventana huérfana.
**Datos implicados:** `truekeate_pending_requests[approvalId].expiresAt/status/resolvedAt/errorCode/windowId` (§2.8), `truekeate_connect_request.expiresAt` (§2.9), `SIGN_TIMEOUT_MS = 120000`, `CONNECT_TIMEOUT_MS = 60000` (§3 del diccionario), `truekeate_logs` (`approval_expired`).
**Trazabilidad:** RF-40 · RNF-06, RNF-08 · CA-RF-40, CA-RF-38 *(MVP)*
> **Alcance del `CA-RF-38` en esta ficha (P-17 / ACU-01).** Aquí se cita **solo** la **operación de purga** del badge al expirar (un `Comando`/`Inspección` sobre `chrome.action.setBadgeText`), no el criterio funcional del **RF-38**, que es el contador de solicitudes pendientes y se verifica en CU-16/A3 dentro del **ciclo posterior**. El RF-38 **no** se agrega a esta ficha en §5.2 para no declarar cobertura funcional inexistente.
> **Delta propio del CU (ACU-26).** No se reproduce el texto de `CA-RF-40`: este CU añade (a) el cierre de `notification.html` por `windowId` con re-descubrimiento, (b) el margen `SIGN_TIMEOUT_MS + 5000` de la capa inject y (c) el rearme del `alarm` desde el `expiresAt` persistido.

**Flujo principal**
1. Al crear una solicitud, el SW fija `expiresAt` anclado a `createdAt` y registra `chrome.alarms.create('truekeate_expire:<approvalId>', { when: expiresAt })`.
2. El reloj avanza sin que el Usuario decida; el SW puede dormirse entre medias.
3. `chrome.alarms` despierta al SW en `expiresAt`.
4. El SW marca la entrada como `expired` con `resolvedAt` y `errorCode: 4001` (persistido, no solo en memoria).
5. El SW cierra la ventana `notification.html` con `chrome.windows.remove(windowId)`.
6. El SW emite el objeto EIP-1193 de `4001` a la página por puerto o `chrome.tabs.sendMessage`, purga el badge y registra `approval_expired`.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 4 (solicitud de conexión):** el plazo es de 60 000 ms y el destinatario es `connect.html`; la dApp recibe `4001` y el origen no queda conectado.
- **A2 — desde el paso 4 (rearme tras reinicio del SW):** en el arranque, el SW purga las entradas vencidas y rearma los `alarms` de las que siguen `pending` desde su `expiresAt` persistido.
- **E1 — desde el paso 5 (`windowId` perdido):** se re-descubre la ventana con `chrome.windows.getAll({ populate: true })`; si no existe, la entrada se marca `expired` y se registra la traza.
- **E2 — desde el paso 6 (la pestaña ya no existe):** se descarta la entrega, se deja traza en `truekeate_logs` y la entrada se purga igualmente.

**Criterios de aceptación**
```gherkin
Dado una firma pendiente creada en t0 con expiresAt = t0 + 120000 y el SW como dueño del plazo
Cuando el reloj avanza 120 s con el SW dormido entre medias y despertado por chrome.alarms
Entonces el SW cierra notification.html
Y marca la solicitud como expired con resolvedAt y errorCode 4001
Y purga el badge
Y la página recibe un error EIP-1193 con code 4001
```
```gherkin
Dado una solicitud de conexión pendiente creada en t0
Cuando el reloj avanza 60 s
Entonces la solicitud queda expired y la dApp recibe code 4001
```
```gherkin
Dado una solicitud de conexión pendiente creada en t0
Cuando el reloj avanza 59 s
Entonces la solicitud sigue pending
Y connect.html sigue abierta
```

**EARS.** *El sistema deberá* anclar el vencimiento a `createdAt` (`expiresAt`) y disparar el plazo con `chrome.alarms`, de modo que ocurra aunque el SW esté dormido. *Mientras* la capa inject/content mantenga un temporizador propio, *el sistema deberá* usar un margen superior (`SIGN_TIMEOUT_MS + 5000 = 125000` ms) y delegar siempre en el `approvalId`. *Al expirar*, *el sistema deberá* cerrar la ventana, marcar `expired` y purgar el badge.
```gherkin
Dado una firma pendiente con windowId registrado y una ventana notification.html que ya no existe
Cuando el reloj alcanza expiresAt
Entonces el SW re-descubre la ventana con chrome.windows.getAll con populate true
Y al no encontrarla marca la entrada como expired sin dejar ventana huérfana
Y truekeate_logs registra exactamente 1 entrada con event approval_expired
```
**Evidencia:** `Vitest: approvalTimeout.spec.ts — fake timers + chrome.alarms` · `Vitest: windowRediscovery.spec.ts — CU-15/E1 con windowId perdido` · `Vitest: approvalReconcile.spec.ts` · `E2E: 18-concurrencia.spec.ts`

---

### CU-16 · Atender dos solicitudes simultáneas y serializar por cuenta
**Actor primario:** Service Worker · **Secundarios/sistemas:** dApp(es), `chrome.runtime.connect`, Navegador (badge, notificaciones), Nodo RPC local
> **Deslinde (ACU-12).** El actor primario es el **Service Worker**, que es dueño de la cola y de la serialización; §2 y §7 declaran lo mismo (la v1.0 los hacía discrepar).
**Objetivo (MVP, P-17):** Sostener varias solicitudes a la vez sin sobrescribirlas, con una sola ventana por origen y una sola transacción en vuelo por cuenta. **El oráculo del MVP se limita a «2 entradas `pending` en `truekeate_pending_requests` + como máximo 1 transacción en vuelo por cuenta»**; el **badge (RF-38)** y las **notificaciones (RF-39)** se verifican en el **ciclo posterior**.
**Precondiciones:** Cola `truekeate_pending_requests` vacía; dos orígenes distintos (o dos peticiones de distinto tipo) inician una firma cada uno; el content script mantiene un puerto de larga vida.
**Postcondición de éxito (MVP):** `truekeate_pending_requests` contiene 2 entradas con `approvalId` distintos; resolver la primera no altera la segunda; cada cuenta difunde como máximo una transacción en vuelo.
**Postcondición de éxito (ciclo posterior — RF-38/RF-39):** el badge refleja el total de `pending` y cada solicitud nueva produce 1 notificación de Chrome con su origen.
**Postcondición de fallo:** Si se supera la cardinalidad (`pendingRequestsMax = 8` global, `1` por origen, `6` por minuto y origen), la nueva solicitud se rechaza de inmediato con `4001` sin persistirse, sin abrir ventana y sin contar para el badge.
**Datos implicados:** `truekeate_pending_requests` (§2.8), `truekeate_connect_request` (§2.9), `truekeate_settings.pendingRequestsMax / pendingRequestsMaxPerOrigin / pendingRequestsPerMinute` (§2.10), `fifoByAccount` y `rmwLock` (§3.4), `portsByApprovalId` (§3.4), `truekeate_logs` (§2.11, `event`: `approval_created`, `approval_resolved`).
**Trazabilidad:** RF-37, RF-38, RF-39 · RNF-08 · CA-RF-37, CA-RF-38, CA-RF-39
> **Reparto de oráculos (P-17).** **MVP:** RF-37 y RNF-08 (2 entradas `pending` + como máximo 1 transacción en vuelo por cuenta). **Ciclo posterior, ya especificado pero fuera del alcance comprometido:** RF-38 (badge contador, flujo A3) y RF-39 (notificación de Chrome, flujo A3). §5.2 refleja los tres RF porque **la ficha los declara y los especifica**; la columna «MVP / ciclo posterior» de §2 y §6 indica cuáles se verifican en cada ciclo.

**Flujo principal**
1. El content script abre el puerto `chrome.runtime.connect({ name: 'truekeate_approval' })`, que mantiene vivo el SW durante la espera.
2. Llega la primera solicitud: el SW genera un `approvalId` UUID v4, la persiste con `status: 'pending'` mediante read-modify-write serializado (`rmwLock`) y abre `notification.html`.
3. Llega la segunda solicitud de **otro** origen: el SW la persiste como una entrada independiente y abre su propia ventana. *(Ciclo posterior: además actualizaría el badge al total de `pending`, RF-38.)*
4. El SW emite un `eth_getBalance`/`getTransactionCount` por cuenta y encola las firmas en `fifoByAccount`: una transacción en vuelo por `from`.
5. Al aprobarse la primera, el SW la resuelve y elimina **solo** su entrada; la segunda permanece `pending` e intacta.
6. Al resolver la última, la cola queda vacía. *(Ciclo posterior: el badge se limpia con `chrome.action.setBadgeText({ text: '' })`, RF-38.)*

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (segunda solicitud del mismo origen):** se rechaza con `4001` (regla «máximo 1 por origen») sin abrir una segunda ventana y sin persistirla.
- **A2 — desde el paso 2 (dos solicitudes de la misma cuenta y distinto origen):** la segunda espera en `fifoByAccount`; el `nonce` se recalcula al aprobar con `getTransactionCount(account, 'pending')`.
- **A3 — desde el paso 3 (ciclo posterior — RF-39/RF-38):** al llegar la solicitud se muestra 1 notificación de Chrome con el origen y el badge pasa al total; descartar la notificación **no** resuelve la solicitud. **No forma parte del oráculo del MVP (P-17).**
- **E1 — desde el paso 2 (cardinalidad global de 8 `pending` alcanzada):** `4001` inmediato, sin persistir, sin ventana y sin badge; queda traza en logs.
- **E2 — desde el paso 2 (más de 6 solicitudes del mismo origen en 60 s):** `4001` sin abrir ventana.
- **E3 — desde el paso 1 (el SW se duerme y el puerto se cierra):** el content script se reconecta con backoff (1 s, 2 s, 4 s, 8 s, 16 s, máx. 30 s) y envía `RESUME` con el `approvalId`; el SW contesta desde la entrada persistida o con `4001` si ya no está `pending`.
- **E4 — desde el paso 4 (colisión de `approvalId`/`requestId`):** `-32603` y rechazo de la solicitud duplicada.

**Criterios de aceptación**
```gherkin
Dado el popup con la cola de solicitudes vacía
Cuando dos orígenes distintos envían una firma cada uno
Entonces truekeate_pending_requests contiene 2 entradas con claves approvalId distintas
Y resolver la primera no elimina ni altera la segunda
```
```gherkin
Dado un puerto truekeate_approval abierto y truekeate_pending_requests con 1 entrada pending
Cuando transcurren 30 s sin actividad y el content script envía RESUME con ese approvalId
Entonces el SW responde desde la entrada persistida en menos de 200 ms
Y la entrada sigue pending
```
```gherkin
Dado el puerto truekeate_approval cerrado porque el Service Worker se durmió y 1 entrada pending persistida
Cuando el content script reconecta y envía RESUME con ese approvalId
Entonces se observan exactamente los reintentos de reconexión con esperas de 1 s, 2 s, 4 s, 8 s y 16 s sin superar 30 s entre intentos
Y el SW responde desde la entrada persistida con el mismo approvalId
Y no se crea ninguna entrada nueva en truekeate_pending_requests
```
```gherkin
Dado el puerto truekeate_approval cerrado y una entrada que ya no está pending
Cuando el content script reconecta y envía RESUME con ese approvalId
Entonces el SW responde con code 4001 y el mensaje de la tabla §2.1
Y no se reabre ninguna ventana notification.html
```

```gherkin
Dado un origen con una solicitud pending
Cuando ese mismo origen envía una segunda solicitud
Entonces la segunda se rechaza con code 4001
Y no se persiste ni se abre una segunda ventana notification.html
```
```gherkin
Dado un origen cuya primera solicitud ya fue resuelta
Cuando ese mismo origen envía otra solicitud
Entonces se persiste como una nueva entrada pending con un approvalId distinto
```
**EARS.** *Mientras* haya solicitudes `pending`, *el sistema deberá* mantener como máximo 8 globales, 1 por origen y 6 por minuto y origen, y *deberá* rechazar el exceso con `4001` sin persistir ni abrir ventana. *El sistema deberá* serializar el envío con una cola FIFO por cuenta, permitiendo como máximo una transacción en vuelo por `from`. *Cuando* el SW se duerma y el puerto se cierre, *el sistema deberá* reconectar con backoff y reanudar por `approvalId`.
**Evidencia (MVP):** `Vitest: approvalQueue.spec.ts — 2 entradas y 1 tx en vuelo por cuenta` · `Vitest: approvalReconcile.spec.ts` · `Vitest: approvalResume.spec.ts — RESUME < 200 ms tras 30 s` · `E2E: 18-concurrencia.spec.ts` · `Inspección: chrome.storage.local.get('truekeate_pending_requests')`
**Evidencia (ciclo posterior — RF-38/RF-39, no cuenta para el cierre del MVP):** `E2E: 19-badge.spec.ts` · `E2E: 20-notificaciones.spec.ts`

---

### CU-17 · Conectar una dApp y elegir la cuenta a compartir
**Actor primario:** dApp de terceros · **Secundarios/sistemas:** Usuario, `connect.html`, Service Worker, Nodo RPC local Anvil
> **Deslinde (ACU-12).** **Un único actor primario: la dApp de terceros** (es quien dispara el flujo con `eth_requestAccounts`); el Usuario es **secundario** —decide en `connect.html`, no inicia el CU—. Esto corrige la doble asignación «dApp / Usuario» de la v1.0 y la discrepancia con §7.
**Objetivo:** Obtener autorización de la cartera para operar, dejando que el Usuario elija exactamente qué cuenta se comparte.
**Precondiciones:** dApp servida en `http://localhost:5174`; extensión cargada; popup puede estar cerrado; el origen no tiene sesión previa en `truekeate_connected_sites`.
**Postcondición de éxito:** `eth_requestAccounts` resuelve `['<dirección elegida>']`; `truekeate_connected_sites['http://localhost:5174']` contiene `account`, `chainId`, `connectedAt`, `lastUsedAt` y `expiresAt`; la dApp recibe el evento `connect`.
**Postcondición de fallo:** Si el Usuario cancela o cierra `connect.html`, `eth_requestAccounts` rechaza con `code: 4001` y **no** se escribe ninguna entrada en `truekeate_connected_sites`.
**Datos implicados:** `truekeate_connect_request` (§2.9), `truekeate_connected_sites` (§2.7), `DappSession` (§3.5), `truekeate_accounts`/`truekeate_imported_accounts` (§2.2/§2.3), `truekeate_logs` (`rpc_call`).
**Trazabilidad:** RF-16, RF-36, RF-17 · RNF-05 · CA-RF-16, CA-RF-36

**Flujo principal**
1. La dApp llama `window.truekeate.request({ method: 'eth_requestAccounts' })`.
2. El SW recalcula el `origin` desde `sender.origin`/`sender.tab.url` (nunca confía en el campo declarado), normaliza a minúsculas y sin barra final, y crea una entrada en `truekeate_connect_request`.
3. El SW abre `connect.html` (420 × 650 px) con la lista de todas las cuentas y su saldo actual.
4. El Usuario selecciona la cuenta 2 y confirma.
5. El SW persiste la sesión por origen, cierra la ventana y resuelve la promesa con `['0x…cuenta2']`.
6. La dApp recibe `connect` y el `eth_accounts` posterior devuelve la cuenta compartida sin volver a pedir permiso.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 4 (el Usuario cancela):** `connect.html` se cierra y la promesa rechaza con `4001`; no se escribe sesión.
- **A2 — desde el paso 3 (origen ya conectado):** el SW no abre ventana; resuelve de inmediato con la cuenta ya autorizada (**CU-18**).
- **E1 — desde el paso 3 (plazo de conexión de 60 s vencido):** **CU-15**; la dApp recibe `4001` y la solicitud queda `expired`.
- **E2 — desde el paso 2 (solicitud de conexión duplicada del mismo origen):** se rechaza con `4001` mientras la primera siga `pending`.

**Criterios de aceptación**
```gherkin
Dado un origen no conectado
Cuando la dApp llama eth_requestAccounts
Entonces se abre connect.html con la lista de cuentas y sus saldos
```
```gherkin
Dado connect.html abierto con una solicitud de conexión pendiente y el Usuario con la cuenta 2 seleccionada
Cuando el Usuario confirma la conexión
Entonces la promesa de eth_requestAccounts resuelve con la dirección de la cuenta 2
Y truekeate_connected_sites contiene ese origen con account, chainId, connectedAt, lastUsedAt y expiresAt
```
```gherkin
Dado un origen no conectado y connect.html abierto con la lista de cuentas
Cuando el Usuario rechaza la conexión
Entonces la promesa de eth_requestAccounts rechaza con code 4001
Y truekeate_connected_sites no contiene ninguna entrada para ese origen
```
```gherkin
Dado connect.html abierto con 5 cuentas y sus saldos
Cuando el Usuario elige una cuenta
Entonces se comparte exactamente esa dirección y ninguna otra
Y el resto de direcciones no viaja a la página
```
**EARS.** *Cuando* una dApp solicite conexión, *el sistema deberá* abrir `connect.html` y compartir únicamente la cuenta elegida por el Usuario. *El sistema deberá* recalcular el `origin` desde `sender` y normalizarlo (minúsculas, sin barra final, con puerto) antes de usarlo como clave de sesión.
```gherkin
Dado que el Usuario cierra la ventana connect.html sin decidir
Cuando transcurren 60 s desde la creación de truekeate_connect_request
Entonces la entrada queda con status expired
Y la promesa de eth_requestAccounts rechaza con code 4001
Y truekeate_connected_sites no contiene ninguna entrada para ese origen
```
**Evidencia:** `E2E: 09-conectar.spec.ts — elección de cuenta y rechazo` · `Vitest: connectRequest.spec.ts — CU-17/E1, cierre sin decidir a los 60 s` · `Vitest: accounts.spec.ts` · `E2E: 24-accesibilidad.spec.ts` · `Inspección: chrome.storage.local.get('truekeate_connected_sites')`

---

### CU-18 · Mantener la conexión por origen entre recargas y reinicios
**Actor primario:** dApp de terceros · **Secundarios/sistemas:** Service Worker, Navegador (ciclo de vida MV3)
**Objetivo:** Seguir operando tras recargar la página o tras dormirse el Service Worker, sin obligar al Usuario a reconectar, **mientras la sesión no haya caducado**.
**Precondiciones:** `truekeate_connected_sites['http://localhost:5174']` con `account` y `chainId`; `expiresAt` no vencido, calculado como **`lastUsedAt + truekeate_settings.sessionTtlMs`** (`sessionTtlMs = 86400000` ms = 24 h).
> **ACU-17 / D-B.** La **caducidad de sesión de dApp** (24 h **renovables** en cada uso) forma parte de **RF-25**: cada llamada atendida refresca `lastUsedAt` y con ello `expiresAt = lastUsedAt + 86400000` (ecuación literal). El comportamiento se especifica aquí con criterio y evidencia propios, que es lo que faltaba en la v1.0.
**Postcondición de éxito:** `eth_accounts` devuelve `['0x…cuenta2']` sin abrir `connect.html`, tanto tras recargar `test.html` como tras reiniciar el SW; `lastUsedAt` se refresca en cada llamada atendida y `expiresAt` se recalcula como `lastUsedAt + 86400000`.
**Postcondición de fallo:** Si la sesión venció (`expiresAt <= now`), la entrada se elimina, `eth_accounts` devuelve `[]` y la dApp debe volver a pasar por `eth_requestAccounts` (**CU-17**).
**Datos implicados:** `truekeate_connected_sites` (§2.7: `account`, `chainId`, `connectedAt`, `lastUsedAt`, `expiresAt`), `truekeate_settings.sessionTtlMs = 86400000` (§2.10), `DappSession` (§3.5).
**Trazabilidad:** RF-25, RF-17, RF-10 · RNF-08, RNF-11 · CA-RF-25, CA-RF-17, CA-RF-10
> **Delta propio del CU (ACU-26).** No se reproduce el texto de `CA-RF-25`: este CU añade (a) el refresco de `lastUsedAt` en **cada** llamada atendida, (b) la ecuación `expiresAt = lastUsedAt + 86400000` y (c) la eliminación de la entrada al vencer con `eth_accounts → []`.

**Flujo principal**
1. La dApp recarga `test.html`; un nuevo content script se inyecta con `document_start` y `all_frames: true`.
2. La dApp llama `eth_accounts`.
3. El SW recalcula y normaliza el `origin`, busca la entrada en `truekeate_connected_sites` y encuentra la sesión.
4. El SW comprueba `expiresAt > now`, refresca `lastUsedAt` y devuelve `['0x…cuenta2']` **sin** abrir ninguna ventana.
5. Si el SW se durmió entre medias, al despertar reconstruye el estado desde `chrome.storage.local` y atiende igual.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (origen con distinta caja o barra final):** la clave se normaliza (`HTTP://LOCALHOST:5174/` → `http://localhost:5174`) y la sesión se encuentra igualmente.
- **A2 — desde el paso 4 (sesión vencida por TTL de 24 h):** la entrada se elimina y `eth_accounts` devuelve `[]`; continúa en **CU-17**.
- **E1 — desde el paso 2 (origen nunca conectado):** `eth_accounts` devuelve `[]` sin abrir ventana; es el escenario de **CU-20**.
- **E2 — desde el paso 5 (el estado persistido está vacío o corrupto):** el SW responde `[]` (nunca una cuenta inventada) y registra la incidencia.

**Criterios de aceptación**
```gherkin
Dado el origen http://localhost:5174 conectado con la cuenta 2
Cuando se recarga test.html y se detiene el Service Worker
Entonces eth_accounts devuelve ['0x…cuenta2'] sin abrir connect.html
Y lastUsedAt se ha refrescado
```
```gherkin
Dado truekeate_connected_sites con una entrada cuyo expiresAt ya pasó
Cuando la dApp llama eth_accounts
Entonces la entrada se elimina
Y la respuesta es []
Y no se abre ninguna ventana
```
```gherkin
Dado truekeate_settings.sessionTtlMs = 86400000 y una sesión con lastUsedAt = t0
Cuando la dApp llama eth_accounts en t0 + 3600000
Entonces lastUsedAt pasa a t0 + 3600000
Y expiresAt queda exactamente en lastUsedAt + 86400000
```
```gherkin
Dado truekeate_connected_sites con una entrada vencida y una vigente
Cuando la dApp llama eth_accounts
Entonces la entrada vencida se elimina de chrome.storage.local
Y la vigente se conserva con su account y su chainId
```
**EARS.** *Mientras* exista una sesión por origen no vencida, *el sistema deberá* resolver `eth_accounts` sin abrir ninguna ventana. *Si* `expiresAt <= now`, *entonces* *el sistema deberá* eliminar la entrada y devolver `[]`. *Cuando* el Service Worker se reinicie, *el sistema deberá* reconstruir las sesiones desde `chrome.storage.local`.
**Evidencia:** `E2E: 05-persistencia.spec.ts — sesión por origen` · `Vitest: state.spec.ts` · `Vitest: approvalReconcile.spec.ts` · `Inspección: chrome.storage.local.get('truekeate_connected_sites')`

---

### CU-19 · Revocar el permiso de una dApp
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, popup, dApp afectada, Navegador
**Objetivo:** Desconectar una dApp concreta para que deje de acceder a la cuenta compartida.
**Precondiciones:** Existe al menos una entrada en `truekeate_connected_sites`; popup abierto.
**Postcondición de éxito:** La entrada del origen desaparece de `truekeate_connected_sites`; la dApp recibe `accountsChanged` con `[]` y un `eth_accounts` posterior devuelve `[]` exigiendo `eth_requestAccounts`.
**Postcondición de fallo:** Si la entrega del evento falla porque la pestaña está cerrada, la sesión se elimina igualmente y se deja traza en logs; la revocación nunca queda a medias.
**Datos implicados:** `truekeate_connected_sites` (§2.7), `DappSession` (§3.5), `truekeate_pending_requests` (entrada `wallet_revokePermissions`, §2.8), `truekeate_logs` (§2.11, `event`: `permission_revoked`, `accounts_changed`).
**Trazabilidad:** RF-26, RF-24 · RNF-11 · CA-RF-26, CA-RF-24

**Flujo principal**
1. El Usuario abre «Sitios conectados» en el popup y ve la lista de orígenes con su cuenta y fecha.
2. El Usuario pulsa «Revocar permiso» en `http://localhost:5174`.
3. La confirmación es la propia UI del popup; el SW elimina la entrada por su clave normalizada.
4. El SW emite `accountsChanged` con `[]` a todas las pestañas de ese origen y registra `permission_revoked`.
5. La dApp, al llamar `eth_accounts`, recibe `[]` y debe volver a conectar.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 2 (la revocación la pide la propia dApp):** `wallet_revokePermissions` se representa como entrada `pending` en `truekeate_pending_requests` y exige aprobación en `notification.html` (**CU-13**).
- **E1 — desde el paso 4 (la pestaña del origen está cerrada):** no hay destinatario; la entrada se elimina igual y se registra la traza.
- **E2 — desde el paso 3 (el origen no existe):** operación idempotente; el SW responde con éxito sin cambios.

**Criterios de aceptación**
```gherkin
Dado un origen conectado con la cuenta 2
Cuando el Usuario pulsa «Revocar permiso» en el popup
Entonces el origen recibe accountsChanged con []
Y un eth_accounts posterior resuelve []
Y ese origen exige eth_requestAccounts para volver a operar
Y truekeate_connected_sites ya no contiene la entrada
```
```gherkin
Dado que la revocación se origina en la dApp
Cuando la dApp llama wallet_revokePermissions
Entonces se crea una entrada pending en truekeate_pending_requests
Y la revocación solo se aplica tras la aprobación del Usuario
```
**EARS.** *Cuando* el Usuario revoque un origen, *el sistema deberá* eliminar la entrada por su clave normalizada y emitir `accountsChanged` con `[]`. *De acuerdo con* RF-17 y RNF-11, *el sistema deberá* devolver `[]` en `eth_accounts` a todo origen sin sesión vigente.
**Evidencia:** `E2E: 13-revocar.spec.ts` · `E2E: 08-eventos.spec.ts` · `Vitest: accounts.spec.ts — RNF-11`

---

### CU-20 · Rechazar a una dApp no autorizada *(caso adversario)*
**Actor primario:** dApp no autorizada · **Secundarios/sistemas:** Service Worker, content script, Navegador
**Objetivo (del adversario):** leer las cuentas de la cartera o invocar métodos sensibles sin haber obtenido autorización.
**Objetivo del sistema:** negar el acceso sin filtrar información y sin abrir ninguna ventana.
**Precondiciones:** Origen sin entrada en `truekeate_connected_sites`; content script inyectado; provider presente.
**Postcondición de éxito (del sistema):** `eth_accounts` devuelve `[]`, ningún método sensible se ejecuta, no se abre ninguna ventana y el intento queda registrado con su código de error.
**Postcondición de fallo:** Si por cualquier vía la dApp obtuviera una dirección sin sesión, el CU se considera fallido y el defecto es bloqueante (RNF-11).
**Datos implicados:** `truekeate_connected_sites` (§2.7), `truekeate_logs` (`rpc_error`), protocolo `TRUEKEATE_REQUEST/RESPONSE` (§4.1).
**Trazabilidad:** RF-17, RF-14 · RNF-10, RNF-11 · CA-RF-17, CA-RF-14

**Flujo principal**
1. La dApp no autorizada llama `eth_accounts`.
2. El content script reenvía `TRUEKEATE_REQUEST` validando `event.source === window` y `event.origin === location.origin`.
3. El SW recalcula el `origin` desde `sender`, no encuentra sesión y responde `[]` sin abrir ventana.
4. La dApp intenta `eth_sendTransaction` sin autorización; el SW responde `4100` con «Esta dApp no tiene permiso para usar la cartera.» y no crea ninguna entrada en la cola.
5. El SW registra el intento en `truekeate_logs` con `level: 'error'` y el código emitido.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 1 (la dApp sí pasa por `eth_requestAccounts`):** el flujo continúa en **CU-17** y obtiene autorización legítima.
- **E1 — desde el paso 2 (mensaje con `event.origin` distinto de `location.origin`):** se descarta sin respuesta; no se propaga al SW.
- **E2 — desde el paso 4 (método interno `wallet_*` desde un content script):** `4200 Unsupported method` (allowlist de contextos de §4.2 del diccionario).
- **E3 — desde el paso 2 (mensaje con `sender.id !== chrome.runtime.id`):** se descarta con `4100`.

**Criterios de aceptación**
```gherkin
Dado un origen que nunca se ha conectado
Cuando la dApp llama eth_accounts
Entonces resuelve []
Y no se abre ninguna ventana
```
```gherkin
Dado un origen sin sesión
Cuando la dApp llama eth_sendTransaction
Entonces la promesa se rechaza con code 4100 y el mensaje de la tabla §2.1
Y truekeate_pending_requests permanece vacío
Y truekeate_logs registra exactamente 1 entrada rpc_error con ese código
```
**EARS.** *Mientras* un origen no tenga sesión vigente, *el sistema deberá* devolver `[]` en `eth_accounts` y `4100` en cualquier método sensible, sin abrir ventanas. *Si* un mensaje llega con `sender.id` distinto de `chrome.runtime.id` o con un `origin` no coincidente, *entonces* *el sistema deberá* descartarlo sin ejecutar el método.
**Evidencia:** `E2E: 09-conectar.spec.ts — test negativo de origen no conectado` · `Vitest: accounts.spec.ts — RNF-11` · `Vitest: errors.spec.ts — 4100 con code y mensaje de §2.1` · `E2E: 22-dapp.spec.ts — panel de escenarios negativos`

---

### CU-21 · Resistir a una dApp hostil *(caso adversario)*
**Actor primario:** dApp hostil · **Secundarios/sistemas:** Service Worker, content script, `inject.js`, Navegador (permisos de host)
**Objetivo (del adversario):** obtener una firma de digest arbitrario, dar de alta un RPC malicioso, suplantar el `origin` o inyectar código desde un iframe para leer el almacenamiento.
**Objetivo del sistema:** rechazar cada vector con un error tipado y sin exponer claves, mnemonic ni payloads.
**Precondiciones:** Extensión cargada; página hostil (o iframe de origen distinto) con el content script inyectado por `all_frames: true`.
**Postcondición de éxito (del sistema):** `eth_sign` responde `4200`; `wallet_addEthereumChain` con RPC no `https` fuera de local se rechaza con error tipado y sin solicitar permiso; los `postMessage` salientes usan `targetOrigin = location.origin`; ningún content script puede leer `chrome.storage.local`; ninguna entrada de log contiene el mnemonic, una clave privada ni el payload firmado íntegro.
**Postcondición de fallo:** Si la página obtiene un valor sensible o logra una firma no autorizada, el CU falla y el defecto se considera crítico (RNF-09/RNF-10).
**Datos implicados:** `truekeate_networks` (§2.6), `truekeate_logs` (§2.11, política de redacción), `truekeate_mnemonic` (§2.1, nunca accesible fuera de contextos confiables), protocolo §4.1/§4.2 del diccionario.
**Trazabilidad:** RF-14, RF-23 · RNF-09, RNF-10, RNF-12 · RT-03, RT-04 · CA-RF-14, CA-RF-23, CA-RT-04

**Flujo principal**
1. La dApp hostil llama `eth_sign` con un digest arbitrario; el SW responde `4200` con «El método solicitado no está soportado por TrueKeate Wallet.» **sin abrir ninguna ventana**.
2. La dApp intenta `wallet_addEthereumChain` con `rpcUrl: "http://203.0.113.10:8545"`; el SW rechaza por esquema/host no permitido con error tipado y no solicita permiso en runtime.
3. La dApp intenta alta de red con `rpcUrl` `https` legítima; el SW exige aprobación explícita y solicita `chrome.permissions.request` para el host (**CU-25**).
4. Un iframe de origen distinto intenta leer `chrome.storage.local` desde un content script; `setAccessLevel('TRUSTED_CONTEXTS')` lo impide.
5. La dApp inspecciona los mensajes salientes de la extensión y comprueba que usan `targetOrigin = location.origin`, nunca `'*'`.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 1 (la dApp usa `personal_sign`):** el flujo continúa en **CU-28** con vista previa del texto y aviso si el payload es hex ilegible.
- **A2 — desde el paso 3 (el Usuario rechaza el alta de la red):** `4001` y la red **no** se añade a `truekeate_networks`.
- **E1 — desde el paso 2 (RPC `http` en `127.0.0.1`/`localhost`):** se admite, por ser entorno local, siempre con aprobación explícita del Usuario.
- **E2 — desde el paso 5 (intento de inyección de `inject.js` desde un iframe hostil):** al venir de `web_accessible_resources` declarado, la inyección no aporta acceso al storage ni a las claves; se registra el intento.

**Criterios de aceptación**
```gherkin
Dado el provider inyectado en una página hostil
Cuando la página llama request con el método eth_sign
Entonces la promesa se rechaza con code 4200
Y no se abre ninguna ventana de confirmación
Y truekeate_logs registra 1 entrada rpc_error
```
```gherkin
Dado un wallet_addEthereumChain con un RPC no https fuera de local
Cuando llega la solicitud
Entonces se rechaza con error tipado sin solicitar permiso de host
```
```gherkin
Dado un wallet_addEthereumChain con un RPC https válido
Cuando llega la solicitud
Entonces se exige aprobación explícita del Usuario
Y el SW solicita el permiso de host en runtime con chrome.permissions.request
```
```gherkin
Dado un log producido por personal_sign, eth_signTypedData_v4 y eth_sendTransaction
Cuando se exporta truekeate_logs en JSON
Entonces ninguna entrada contiene el mnemonic, una clave privada, la firma completa ni el payload íntegro
```
**EARS.** *Si* un método no figura en el catálogo (incluido `eth_sign`), *entonces* *el sistema deberá* responder `4200 Unsupported method`. *Si* el `rpcUrl` de una red nueva no es `https` (salvo `127.0.0.1`/`localhost`), *entonces* *el sistema deberá* rechazar la solicitud con error tipado. *Mientras* la extensión se comunique con la página, *el sistema deberá* usar `targetOrigin = location.origin` y validar `source` y `origin` entrantes. *El sistema deberá* registrar en los logs solo el hash y la longitud de los payloads firmados.
**Evidencia:** `Vitest: errors.spec.ts` · `Vitest: networks.spec.ts` · `Vitest: logRedaction.spec.ts` · `Comando: npm run lint:prohibited` · `Inspección: test negativo de iframe hostil y `setAccessLevel` en src/background`

---

### CU-22 · Manifestar el provider `window.truekeate` (y alias) + EIP-6963
**Actor primario:** dApp de terceros · **Secundarios/sistemas:** `inject.js`, content script, Navegador (inyección en `document_start` y `all_frames`)
**Objetivo:** Detectar el provider de TrueKeate en cualquier página, con independencia del nombre que use la dApp (`window.truekeate` o `window.codecrypto`) y por descubrimiento EIP-6963.
**Precondiciones:** Extensión cargada con `content_scripts` en `document_start`, `all_frames: true` y `inject.js` accesible por `web_accessible_resources`.
**Postcondición de éxito:** En la página, `window.truekeate` existe, `window.truekeate === window.codecrypto` (el mismo objeto), ambos exponen `request`, `on` y `removeListener`, y quien emita `eip6963:requestProvider` recibe `eip6963:announceProvider` con `uuid`, `name`, `icon` y `rdns`.
**Postcondición de fallo:** Si la dApp lee el provider antes de que `inject.js` se ejecute, el objeto es `undefined` y el CU falla: la inyección debe ser síncrona en `document_start`.
**Datos implicados:** `inject.js`, contrato EIP-6963 de §4.1.1 del diccionario, `PROVIDER_UUID` y `PROVIDER_RDNS` (§3 de `entornos_globales.md`), activos `public/brand/truekeate-mark-96.png` (RT-12).
> **Literal vinculante (ACU-03 / D-A).** La fuente de verdad de EIP-6963 es **`requerimientos.md` RT-13** y se escribe aquí literalmente: `name: "TrueKeate"` y `rdns: "academy.codecrypto.truekeate"`. El `uuid` es constante. La divergencia con el diccionario v1.3 (`"TrueKeate Wallet"` / `"com.truekeate.wallet"`) la cierra el diccionario; **§9, hueco 1 queda cerrado en este documento**.
**Trazabilidad:** RF-13, RF-44, RF-45 · RT-13, RNF-20 · CA-RF-13, CA-RF-44, CA-RF-45, CA-RT-13

**Flujo principal**
1. El navegador inyecta `inject.js` de forma síncrona en `document_start`, en todos los frames.
2. `inject.js` publica `window.truekeate` y, en la línea siguiente, `window.codecrypto = window.truekeate` (mismo objeto, no una copia ni un envoltorio).
3. `inject.js` registra de forma síncrona el listener `eip6963:requestProvider` y emite un primer `eip6963:announceProvider`.
4. La dApp registra su listener y emite `eip6963:requestProvider`; recibe `detail.info` con `uuid` constante, `name`, `icon` como data-URI PNG de 96 px y `rdns`, y `detail.provider === window.truekeate`.
5. Ante `DOMContentLoaded`, `inject.js` vuelve a anunciar para las dApp que registraron su listener tarde.
6. La dApp usa indistintamente `window.truekeate` o `window.codecrypto` con idéntico resultado.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 6 (la dApp usa el nombre heredado `window.codecrypto`):** el objeto es el mismo y todas las llamadas funcionan; se cubren los 5 puntos de rúbrica del nombre heredado sin renunciar a la marca.
- **E1 — desde el paso 2 (la dApp ya había definido su propio `window.truekeate`):** la extensión no sobrescribe silenciosamente un objeto ajeno; se registra un aviso en `truekeate_logs` y se conserva el objeto de la extensión como fuente de verdad del provider.
- **E2 — desde el paso 4 (dApp que no soporta EIP-6963):** sigue funcionando por `window.truekeate`/`window.codecrypto`; el descubrimiento es adicional, no sustitutivo.

**Criterios de aceptación**
```gherkin
Dado una página con un script que lee el provider en document_start
Cuando la página se carga
Entonces window.truekeate existe y window.truekeate === window.codecrypto
Y ambos exponen request, on y removeListener
Y en un iframe (all_frames: true) el provider también está presente
```
```gherkin
Dado inject.js cargado de forma síncrona en document_start
Cuando la dApp registra su listener de eip6963:announceProvider después de DOMContentLoaded y emite eip6963:requestProvider
Entonces recibe un announceProvider cuyo detail.info es exactamente el objeto del bloque JSON siguiente
Y el objeto detail.info contiene los cuatro campos uuid, name, icon y rdns
Y detail.info.name es TrueKeate
Y detail.info.rdns es academy.codecrypto.truekeate
Y detail.info.uuid coincide con la constante PROVIDER_UUID del paquete
Y detail.info.icon empieza por data:image/png;base64,
Y detail.provider es el mismo objeto que window.truekeate
```

```json
{
  "uuid": "<PROVIDER_UUID constante>",
  "name": "TrueKeate",
  "icon": "data:image/png;base64,<isologo de 96 px>",
  "rdns": "academy.codecrypto.truekeate"
}
```
**EARS.** *El sistema deberá* exponer `window.truekeate` con el alias `window.codecrypto` apuntando al **mismo objeto**, y *deberá* usar el prefijo `truekeate_` en todo identificador persistido y los tipos `TRUEKEATE_*` en los mensajes internos. *Si* alguna cadena de código conserva el prefijo heredado `codecrypto_`, *entonces* el `grep` de nomenclatura deberá fallar. *El sistema deberá* servir el `icon` del anuncio desde el propio paquete, sin peticiones a CDN.
```gherkin
Dado una página cuyo script define su propio window.truekeate antes de que se ejecute inject.js
Cuando inject.js se carga en document_start
Entonces la extensión registra un aviso en truekeate_logs con event event_emit
Y window.truekeate sigue exponiendo request, on y removeListener y es el provider de la extensión
```

**Evidencia:** `Vitest: inject.spec.ts — alias window.codecrypto y convivencia con provider preexistente (CU-22/E1)` · `Vitest: naming.spec.ts` · `Vitest: eip6963.spec.ts — uuid fijo, name y rdns literales` · `E2E: 07-provider.spec.ts` · `E2E: 21-eip6963.spec.ts` · `Comando: grep -rn "codecrypto_" src/` (0 coincidencias)

---

### CU-23 · Ejecutar la dApp de pruebas de extremo a extremo
**Actor primario:** dApp de terceros (`test.html`) · **Secundarios/sistemas:** Usuario (Perfil A), Service Worker, Nodo RPC local Anvil
> **Deslinde (ACU-12).** **Un único actor primario: la dApp de pruebas**, que ejecuta los siete flujos y muestra el resultado; el Usuario es **secundario** (pulsa los botones). §2 y §7 se alinean con esta declaración.
**Objetivo:** Recorrer los siete flujos de la dApp de pruebas con resultado visible en pantalla, como banco de pruebas del provider y de la cartera.
**Precondiciones:** Extensión cargada desde `dist/`; `test.html` servido en `http://localhost:5174` (`strictPort`); Anvil en marcha; cartera con cuenta conectada.
**Postcondición de éxito:** Los 7 flujos (detectar, conectar, saldo, enviar, EIP-712, cambiar red, eventos) muestran su resultado (hash, firma, `chainId` o error) y ninguno queda en blanco ni sin respuesta.
**Postcondición de fallo:** Si un flujo no responde en **5 s** (magnitud medida con `performance.now()` desde el clic hasta la pintura del resultado) o deja el contenedor de resultado vacío, el CU falla y se registra la incidencia en `truekeate_logs` con `level: 'error'`.
**Datos implicados:** `truekeate_connected_sites` (§2.7), `truekeate_logs` (§2.11), dominio EIP-712 `TrueKeate Test App` (§10 de `entornos_globales.md`).
**Trazabilidad:** RF-46, RF-47 · RNF-25, RNF-15 · CA-RF-46, CA-RF-47

**Flujo principal**
1. La dApp detecta el provider (`window.truekeate`/`window.codecrypto`) y lo muestra en pantalla.
2. El Usuario pulsa «Conectar» y completa **CU-17**; la dApp muestra la cuenta compartida.
3. El Usuario pulsa «Consultar saldo» y ve el valor devuelto por `eth_getBalance`.
4. El Usuario pulsa «Enviar 1 ETH» y completa **CU-11**/**CU-13**; la dApp muestra el hash.
5. El Usuario pulsa «Firmar EIP-712» y completa **CU-27**; la dApp muestra la firma.
6. El Usuario pulsa «Cambiar red» y completa **CU-24**; la dApp muestra el `chainId` nuevo.
7. La dApp registra el historial de operaciones y muestra la última respuesta como JSON completo sin recortar.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 4 (el Usuario rechaza la transacción):** la dApp muestra `code 4001` y su acción sugerida; el historial añade la fila del rechazo.
- **A2 — desde el paso 6 (la red no está dada de alta):** la dApp recibe `4901` y puede iniciar el alta en **CU-25**.
- **E1 — desde cualquier paso (Anvil detenido):** la dApp muestra `4900` y la UI de la extensión entra en **CU-31**.
- **E2 — desde el paso 7 (más de 3 operaciones):** el historial crece con una fila por operación, sin límite funcional declarado.

**Criterios de aceptación**
```gherkin
Dado test.html servido en http://localhost:5174 con la extensión cargada
Cuando el Usuario recorre los 7 flujos: detectar, conectar, saldo, enviar, EIP-712, cambiar red y eventos
Entonces cada flujo muestra en pantalla su resultado (hash, firma, chainId o error)
Y ningún flujo queda en blanco ni sin respuesta
Y cada resultado aparece en pantalla en menos de 5000 ms medidos con performance.now() desde el clic
```
```gherkin
Dado test.html tras ejecutar 3 operaciones
Cuando se revisa el historial
Entonces hay 3 filas con la operación y su resultado
Y la última respuesta se muestra como JSON completo sin recortar
```
**EARS.** *El sistema deberá* servir la dApp de pruebas en `http://localhost:5174` con puerto fijo, de modo que el origen sea estable y coincida con la clave de `truekeate_connected_sites`. *Cuando* una operación de la dApp termine, *el sistema deberá* mostrar su resultado sin recortar.
**Evidencia:** `E2E: 22-dapp.spec.ts — los 7 flujos con umbral de 5000 ms` · `E2E: 22-dapp.spec.ts — historial de operaciones` · `Comando: npm run dev` (puerto 5174, `strictPort`)

---

### CU-24 · Cambiar de red y propagar `chainChanged`
**Actor primario:** Usuario · **Secundarios/sistemas:** dApp de terceros, `notification.html`, Service Worker, Navegador (todas las pestañas), Nodo RPC local Anvil
**Objetivo:** Operar contra otra red dada de alta, con notificación inmediata a todas las pestañas conectadas.
> **Deslinde (ACU-12).** **Un único actor primario: el Usuario** (cambia de red desde el popup y es quien decide la aprobación). El cambio disparado por la dApp (`wallet_switchEthereumChain`) se modela como **flujo alternativo A1**, no como segundo actor primario.
> **P-19 (decisión).** `wallet_switchEthereumChain` **requiere aprobación cuando la red no es la activa**: el SW crea una solicitud en `truekeate_pending_requests`, abre `notification.html` y **solo tras la aprobación** cambia la red y emite `chainChanged`. Es coherente con el catálogo del diccionario («Sí (si la red no es la activa)»).
**Precondiciones:** Existe al menos una segunda red en `truekeate_networks` (por ejemplo `31338` = `0x7a6a`); la red activa es `31337` (`0x7a69`).
**Postcondición de éxito:** Tras la aprobación (ventana `notification.html` cuando el cambio viene de la dApp), `truekeate_chain_id` es el `chainId` nuevo, `eth_chainId` devuelve ese valor, **todas** las pestañas con provider reciben `chainChanged` con el nuevo id y el polling se reinicia contra la red nueva.
**Postcondición de fallo (aprobación):** Si el Usuario rechaza, la red activa **no** cambia, la entrada queda `rejected` con `errorCode: 4001`, la ventana se cierra y la dApp recibe `4001`.
**Postcondición de fallo:** Si el `chainId` solicitado no está dado de alta, la llamada se rechaza con `4901` («La red solicitada no está dada de alta.») y la red activa no cambia.
**Datos implicados:** `truekeate_chain_id` (§2.5), `truekeate_networks` (§2.6), `truekeate_connected_sites[].chainId` (§2.7), `truekeate_pending_requests` (entrada `wallet_switchEthereumChain`, §2.8), `truekeate_logs` (§2.11, `event`: `chain_changed`).
**Trazabilidad:** RF-22, RF-24, RF-10 · RNF-08; RT-06, RE-04 · CA-RF-22, CA-RF-24, CA-RF-10

**Flujo principal (cambio desde el popup)**
1. El Usuario abre el selector de red en el popup y elige la red `31338` (`0x7a6a`), ya dada de alta en `truekeate_networks`.
2. El SW comprueba que `0x7a6a` está en `truekeate_networks` y que el host de su RPC está permitido.
3. El SW persiste `truekeate_chain_id = 0x7a6a`, actualiza `chainId` de las sesiones afectadas y reinicia el polling.
4. El SW emite `chainChanged` con `0x7a6a` a **todas** las pestañas con provider (salto SW → content → inject → página).
5. `eth_chainId` devuelve `0x7a6a` y la UI muestra la red nueva.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 1 (el cambio lo pide la dApp, P-19):** la dApp llama `wallet_switchEthereumChain` con `chainId: '0x7a6a'`; el SW valida que la red está dada de alta y **crea una entrada `pending` en `truekeate_pending_requests`**; abre `notification.html` con el nombre de la red y su `chainId`; el Usuario aprueba en **CU-13**; **solo entonces** el SW aplica los pasos 3–5. La aprobación es obligatoria porque la red solicitada no es la activa; la confirmación del Usuario es lo único que autoriza la emisión de `chainChanged`.
- **A2 — desde el paso 1 (la red solicitada ya es la activa):** no hay aprobación: el SW responde de inmediato con el `chainId` vigente y no abre ventana ni emite `chainChanged` (el valor no cambia).
- **A3 — desde el paso 1 (`chainId` desconocido):** `4901` sin abrir ventana ni crear entrada `pending`; la dApp puede iniciar el alta en **CU-25**.
- **A4 — desde el paso 1 (el Usuario rechaza la aprobación):** la red activa no cambia y la dApp recibe `4001` (X-01).
- **E1 — desde el paso 2 (el RPC de la red destino no responde):** se mantiene la red anterior como activa efectiva, se muestra «desconectado» y continúa en **CU-31**.
- **E2 — desde el paso 4 (una pestaña sin provider):** no recibe el evento; no se considera error y queda traza en logs.

**Criterios de aceptación**
```gherkin
Dado la red activa 31337 y una segunda red local (31338) dada de alta
Cuando el Usuario cambia de red a 31338 desde el popup
Entonces eth_chainId devuelve 0x7a6a
Y todas las pestañas con provider reciben chainChanged con 0x7a6a
Y truekeate_chain_id queda persistido como 0x7a6a
```
```gherkin
Dado la red activa 31337 y una segunda red local (31338) dada de alta
Cuando la dApp llama wallet_switchEthereumChain con 31338
Entonces se crea exactamente 1 entrada pending en truekeate_pending_requests
Y se abre exactamente 1 ventana notification.html
Y antes de la aprobación el valor de truekeate_chain_id sigue siendo 0x7a69
Y ninguna pestaña ha recibido chainChanged
```
```gherkin
Dado una solicitud de cambio de red pendiente en notification.html
Cuando el Usuario pulsa «Aprobar»
Entonces truekeate_chain_id pasa a 0x7a6a
Y todas las pestañas con provider reciben chainChanged con 0x7a6a
Y la entrada desaparece de truekeate_pending_requests
```
```gherkin
Dado una solicitud wallet_switchEthereumChain con un chainId sin dar de alta o rechazada por el Usuario
Cuando la solicitud se resuelve
Entonces la promesa se rechaza con el código de la tabla §2.1
Y truekeate_chain_id no cambia
Y no se emite ningún chainChanged

Ejemplos:
| caso | código esperado |
| chainId no dado de alta | 4901 |
| el Usuario rechaza la aprobación | 4001 |
```
```gherkin
Dado un eth_chainId contra la red por defecto
Cuando Anvil escucha en 127.0.0.1:8545
Entonces el resultado es 0x7a69
Y truekeate_networks no contiene Sepolia
```
**EARS.** *Mientras* Anvil escuche en `127.0.0.1:8545`, *el sistema deberá* responder `eth_chainId = 0x7a69` y no tener Sepolia entre las redes dadas de alta. *Cuando* cambie la red, *el sistema deberá* emitir `chainChanged` a todas las pestañas con provider y persistir el `chainId` nuevo. *Si* el `chainId` no está dado de alta, *entonces* *el sistema deberá* responder `4901`.
**Evidencia:** `E2E: 12-redes.spec.ts — cambio desde el popup` · `E2E: 12-redes.spec.ts — aprobación del cambio pedido por la dApp (P-19)` · `E2E: 08-eventos.spec.ts — chainChanged en 2 pestañas` · `Vitest: networks.spec.ts — cadena de aprobación y 4901` · `Comando: cast chain-id --rpc-url http://127.0.0.1:8545`

---

### CU-25 · Dar de alta una red nueva
**Actor primario:** dApp de terceros · **Secundarios/sistemas:** Usuario, Service Worker, `notification.html`, Navegador (permisos de host), nodo RPC
> **Deslinde (ACU-12).** **Un único actor primario: la dApp de terceros** (llama `wallet_addEthereumChain`). El alta desde el popup es el **flujo alternativo A1**, con el Usuario como disparador, no un segundo actor primario.
**Objetivo:** Incorporar una red (nombre, `chainId`, RPC, símbolo, explorador) para poder operar contra ella.
**Precondiciones:** El `chainId` no está en `truekeate_networks`; el RPC propuesto es `https` o `http` en `127.0.0.1`/`localhost`.
**Postcondición de éxito:** La red aparece en `truekeate_networks` con el `chainId` declarado, el permiso de host concedido queda registrado por red y la red pasa a ser la activa.
**Postcondición de fallo:** Si el Usuario rechaza, si el host no está permitido o si el RPC no es alcanzable, la red **no** se añade y no se modifica `truekeate_chain_id`.
**Datos implicados:** `truekeate_networks` (§2.6: `chainId`, `chainIdDecimal`, `name`, `rpcUrl`, `symbol`, `decimals`, `explorerUrl`, `isTestnet`, `isDefault`), `truekeate_pending_requests` (entrada `wallet_addEthereumChain`), `truekeate_logs` (`network_added`).
**Trazabilidad:** RF-23, RF-22 · RT-04, RNF-23 · CA-RF-23, CA-RT-04

**Flujo principal**
1. La dApp llama `wallet_addEthereumChain` con `{ chainId: '0x7a6a', chainName, rpcUrls, nativeCurrency, blockExplorerUrls }`.
2. El SW valida esquema y host (`https` preferente; `http` solo para local) y crea una entrada `pending` en la cola.
3. Se abre `notification.html` con los datos de la red y, si `isTestnet` es `false`, con la advertencia adicional de RNF-23.
4. El Usuario aprueba; el SW solicita el permiso de host en runtime con `chrome.permissions.request`.
5. El SW persiste la red en `truekeate_networks`, la marca como activa, emite `chainChanged` (**CU-24**) y registra `network_added`.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 1 (alta desde la UI del popup):** mismo flujo con origen `extension` en los logs. **D-G (ACU-27):** solicita **igual** el permiso de host en runtime con `chrome.permissions.request` — el clic del Usuario en el popup es el gesto válido de la API—; **se elimina la excepción** que eximía de permiso al alta desde el popup. Si el permiso se deniega, aplica E2 y la red no se persiste.
- **A2 — desde el paso 4 (el Usuario rechaza):** `4001`; la red no se añade y se deja traza.
- **E1 — desde el paso 2 (RPC no `https` fuera de local):** rechazo con error tipado **antes** de abrir ventana y sin pedir permiso.
- **E2 — desde el paso 4 (el permiso de host se deniega):** la red no se persiste; se informa «Permiso de host denegado» y se registra en logs.
- **E3 — desde el paso 5 (el `chainId` declarado no coincide con el que reporta el nodo):** se rechaza el alta con error tipado y no se persiste.

**Criterios de aceptación**
```gherkin
Dado un wallet_addEthereumChain con chainId 31338 y RPC local no dado de alta
Cuando llega la solicitud
Entonces se crea exactamente 1 entrada pending en truekeate_pending_requests
Y se abre notification.html con los datos de la red
Y todavía no se solicita ningún permiso de host
```
```gherkin
Dado una solicitud de alta de red pendiente en notification.html
Cuando el Usuario pulsa «Aprobar»
Entonces el SW llama a chrome.permissions.request con el origen del RPC
Y la red aparece en truekeate_networks con ese chainId
Y esa red pasa a ser la activa
Y truekeate_logs registra exactamente 1 entrada con event network_added
```
```gherkin
Dado el alta de una red desde el popup (flujo A1)
Cuando el Usuario confirma el alta
Entonces el SW llama igualmente a chrome.permissions.request con el origen del RPC
Y si el permiso se deniega la red no se persiste en truekeate_networks
```
```gherkin
Dado un wallet_addEthereumChain con un RPC no https y fuera de local
Cuando llega la solicitud
Entonces la promesa se rechaza con el código de la tabla §2.1
Y no se crea ninguna entrada pending
Y no se abre ninguna ventana
Y no se llama a chrome.permissions.request
```
```gherkin
Dado el alta de una red con isTestnet = false
Cuando se abre notification.html
Entonces se muestra la advertencia de red no marcada como red de pruebas
Y el alta no se aplica sin aprobación explícita
```
**EARS.** *Si* un permiso (`tabs`, `activeTab`, `scripting`) no se usa, *entonces* no se declarará en el manifest. *Cuando* la dApp dé de alta una red cuyo host no esté declarado, *el sistema deberá* solicitar el permiso en runtime o rechazar la solicitud con error tipado. *Cuando* la red no esté marcada `isTestnet`, *el sistema deberá* mostrar la advertencia de RNF-23 antes de aplicarla.
**Evidencia:** `E2E: 12-redes.spec.ts — permiso en runtime desde la dApp y desde el popup (D-G)` · `Vitest: networks.spec.ts — solicitud de permiso y denegación` · `Vitest: manifest.spec.ts` · `Inspección: dist/manifest.json (permissions y host_permissions declarados)` · `E2E: 26-avisos.spec.ts`

---

### CU-26 · Cambiar la cuenta activa y propagar `accountsChanged`
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, Navegador (todas las pestañas), dApp
**Objetivo:** Pasar a operar con otra cuenta de la cartera y que todas las dApp conectadas lo sepan de inmediato.
**Precondiciones:** Cartera con al menos 2 cuentas visibles; al menos una pestaña con provider y sesión vigente.
**Postcondición de éxito:** `truekeate_current_account` apunta a la cuenta nueva, el popup muestra su saldo, **todas** las pestañas reciben `accountsChanged` con la nueva cuenta y las sesiones de los orígenes conectados se actualizan.
**Postcondición de fallo:** Si la cuenta elegida no existe en `truekeate_accounts` ni en `truekeate_imported_accounts`, no se cambia nada y se registra el error; la UI conserva la cuenta anterior.
**Datos implicados:** `truekeate_current_account` (§2.4), `truekeate_accounts` (§2.2), `truekeate_imported_accounts` (§2.3), `truekeate_connected_sites[].account` (§2.7), `truekeate_logs` (`accounts_changed`).
**Trazabilidad:** RF-15, RF-24, RF-10, RF-27 · CA-RF-15, CA-RF-24, CA-RF-10, CA-RF-27

**Flujo principal**
1. El Usuario abre la lista de cuentas y elige otra cuenta.
2. El SW valida que el identificador (`idx:<n>` o `imp:<address>`) existe y persiste `truekeate_current_account`.
3. El SW actualiza `account` de las sesiones de dApp activas y limpia los listeners/respuestas asociados a la cuenta anterior.
4. El SW emite `accountsChanged` con la nueva cuenta a todas las pestañas conectadas.
5. El popup reinicia el polling (**CU-10**) y pinta el saldo de la cuenta nueva.
6. La dApp, si tenía un `cb` registrado con `on('accountsChanged', cb)`, lo recibe exactamente una vez.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 4 (la dApp ejecutó `removeListener`):** el callback ya no se invoca; la cuenta activa cambia igual.
- **A2 — desde el paso 4 (el cambio se origina en la dApp):** la propagación llega a las demás pestañas igualmente.
- **E1 — desde el paso 2 (identificador inexistente):** `-32602`; ninguna escritura y la cuenta anterior permanece activa.
- **E2 — desde el paso 3 (una sesión apunta a una cuenta eliminada):** la sesión se revoca y la dApp afectada recibe `accountsChanged` con `[]`.

**Criterios de aceptación**
```gherkin
Dado dos pestañas (A y B) con el provider conectado
Cuando el Usuario cambia de cuenta en el popup
Entonces A y B reciben accountsChanged con la nueva cuenta
Y si el cambio se origina en la dApp de A, B también lo recibe
```
```gherkin
Dado un dApp suscrito con on('accountsChanged', cb)
Cuando el Usuario cambia de cuenta en el popup
Entonces cb se invoca exactamente 1 vez con la nueva cuenta
```
```gherkin
Dado un dApp suscrito con on('accountsChanged', cb) que después ejecuta removeListener('accountsChanged', cb)
Cuando el Usuario cambia de cuenta en el popup
Entonces cb no se invoca
Y truekeate_current_account sí cambia a la cuenta nueva
```
**EARS.** *Cuando* cambie la cuenta activa, *el sistema deberá* persistirla y emitir `accountsChanged` con la nueva cuenta a todas las pestañas con provider. *Si* el identificador no existe en el almacenamiento, *entonces* *el sistema deberá* responder `-32602` sin modificar `truekeate_current_account`.
**Evidencia:** `E2E: 08-eventos.spec.ts — 2 pestañas` · `E2E: 08-eventos.spec.ts — removeListener` · `Vitest: state.spec.ts` · `E2E: 14-polling.spec.ts`

---

### CU-27 · Firmar datos tipados EIP-712
**Actor primario:** dApp de terceros · **Secundarios/sistemas:** Usuario, Service Worker, `notification.html`, contrato Foundry `EIP712Verifier.sol`
> **Deslinde (ACU-12).** **Un único actor primario: la dApp de terceros** (llama `eth_signTypedData_v4`); el Usuario es **secundario** (aprueba en `notification.html`). §2 y §7 declaran lo mismo.
**Objetivo:** Obtener una firma EIP-712 de la cuenta compartida mostrando con claridad el dominio (incluido `verifyingContract`) y el mensaje firmado.
**Precondiciones:** Origen conectado; payload `eth_signTypedData_v4` con `domain`, `types`, `primaryType` y `message` válidos.
**Postcondición de éxito:** La dApp recibe una firma `0x`+130 hex verificable por `EIP712Verifier.verify` con `true`; `truekeate_logs` guarda `primaryType`, `domain.name`, `domain.chainId`, `domain.verifyingContract` y el hash del mensaje, nunca el mensaje íntegro.
**Postcondición de fallo:** Si el payload es inválido, el Usuario rechaza o el dominio es incoherente con la advertencia bloqueante, no se firma y la llamada se rechaza con el código correspondiente.
**Datos implicados:** `TypedDataPreview` (§3.2: `domain`, `domainName`, `verifyingContract`, `types`, `message`, `primaryType`, `domainChainMismatch`, `verifyingContractMismatch`), `truekeate_pending_requests` (§2.8), `truekeate_logs` (`sign_typed_data`).
**Trazabilidad:** RF-20 · RT-11, RNF-25, RNF-09 · CA-RF-20, CA-RT-11

**Flujo principal**
1. La dApp llama `eth_signTypedData_v4` con el dominio `TrueKeate Test App` y el mensaje.
2. El SW valida la estructura, elimina `EIP712Domain` de `types`, calcula `primaryType` y construye `TypedDataPreview`.
3. El SW compara `domain.chainId` con el `chainId` activo → `domainChainMismatch`, y `verifyingContract` con el contrato declarado → `verifyingContractMismatch`.
4. Se abre `notification.html` y se muestran `domain` (`name` y `verifyingContract` en claro), `types` y `message`.
5. Si hay `domainChainMismatch` o `verifyingContractMismatch`, se muestra un aviso destacado en español; si `verifyingContract` es la dirección cero, el aviso es bloqueante por defecto.
6. El Usuario aprueba; el SW firma con `signer.signTypedData`, cierra la ventana y devuelve la firma a la dApp.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 6 (el Usuario rechaza):** **CU-14**; la dApp recibe `4001`.
- **A2 — desde el paso 3 (`domain.chainId` distinto del activo):** el aviso se muestra destacado y el botón «Aprobar» exige una confirmación adicional (doble confirmación) antes de firmar.
- **E1 — desde el paso 2 (estructura inválida o `types` sin `primaryType` resoluble):** `-32602`; no se abre ventana.
- **E2 — desde el paso 6 (el SW duerme entre la aprobación y la firma):** la firma se reanuda desde la entrada persistida; el resultado es el mismo o `4001` si el plazo venció.

**Criterios de aceptación**
```gherkin
Dado un eth_signTypedData_v4 con domain.name y verifyingContract declarados
Cuando se abre la confirmación
Entonces se muestran domain, types, message, name y verifyingContract
Y si domain.chainId es distinto del activo aparece un aviso destacado en español
Y si verifyingContract no coincide con el contrato declarado aparece una advertencia
Y si se altera un byte del mensaje, la firma deja de verificar en el contrato Foundry
```
```gherkin
Dado truekeate_logs tras una firma EIP-712 aprobada
Cuando se inspecciona la entrada con event sign_typed_data
Entonces contiene primaryType, domain.name, domain.chainId, domain.verifyingContract y el hash del mensaje
```
```gherkin
Dado truekeate_logs tras una firma EIP-712 aprobada
Cuando se inspecciona la entrada con event sign_typed_data
Entonces su campo data no contiene el mensaje completo en claro
```
**EARS.** *Cuando* se solicite una firma EIP-712, *el sistema deberá* mostrar `domain` (con `name` y `verifyingContract`), `types` y `message` antes de firmar. *Si* `domain.chainId` no coincide con la red activa o `verifyingContract` no coincide con el contrato declarado, *entonces* *el sistema deberá* mostrar una advertencia destacada en español. *El sistema deberá* registrar en los logs solo el hash del mensaje firmado.
**Evidencia:** `E2E: 11-firmar-eip712.spec.ts — dominio, avisos y doble confirmación` · `Vitest: typedData.spec.ts` · `Vitest: logRedaction.spec.ts — hash y longitud, nunca el mensaje` · `Comando: forge test --match-contract EIP712VerifierTest`

---

### CU-28 · Firmar un mensaje de texto plano (`personal_sign`)
**Actor primario:** dApp de terceros · **Secundarios/sistemas:** Usuario, Service Worker, `notification.html`
> **Deslinde (ACU-12).** **Un único actor primario: la dApp de terceros** (llama `personal_sign`); el Usuario es **secundario** (aprueba en `notification.html`). §2 y §7 declaran lo mismo.
**Objetivo:** Obtener la firma de un mensaje legible, viendo exactamente el texto que se firma y con rechazo explícito de `eth_sign`.
**Precondiciones:** Origen conectado; payload `personal_sign` (texto UTF-8 o hex).
**Postcondición de éxito:** La dApp recibe una firma con prefijo `\x19Ethereum Signed Message`; la ventana mostró el texto legible completo y `truekeate_logs` guardó la dirección y el hash del mensaje (sha256), nunca el texto.
**Postcondición de fallo:** Si el payload hexadecimal no es decodificable como UTF-8, se muestra el aviso «contenido no legible» y, si el Usuario no aprueba expresamente, no se firma.
**Datos implicados:** `PersonalSignPreview` (§3.3: `text`, `isHexPayload`, `byteLength`, `bytesHex`), `truekeate_pending_requests` (§2.8), `truekeate_logs` (`sign_personal`).
**Trazabilidad:** RF-21, RF-14 · RNF-09 · CA-RF-21, CA-RF-14

**Flujo principal**
1. La dApp llama `personal_sign` con `[mensaje, cuenta]`.
2. El SW comprueba que la cuenta es la autorizada para ese origen, decodifica el payload como UTF-8 y construye `PersonalSignPreview`.
3. Se abre `notification.html` y se muestra el texto legible completo; si `isHexPayload` es `true`, se muestra el aviso «contenido no legible» y el número de bytes.
4. El Usuario aprueba; el SW firma con `signer.signMessage`, cierra la ventana y devuelve la firma.
5. El SW registra `sign_personal` con la dirección y `sha256:` del mensaje.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 4 (el Usuario rechaza):** **CU-14**; `4001`.
- **A2 — desde el paso 1 (la dApp llama `eth_sign`):** el SW responde `4200 Unsupported method` **sin abrir ventana** y sugiere `personal_sign` o `eth_signTypedData_v4` como alternativa.
- **E1 — desde el paso 2 (la cuenta no está autorizada para ese origen):** `4100`.
- **E2 — desde el paso 2 (payload vacío o cuenta malformada):** `-32602`.

**Criterios de aceptación**
```gherkin
Dado un personal_sign con payload UTF-8
Cuando se abre la confirmación
Entonces se muestra el texto legible completo
Y eth_sign responde code 4200 sin abrir ninguna ventana
```
```gherkin
Dado un personal_sign con payload hexadecimal no decodificable como UTF-8
Cuando se abre la confirmación
Entonces se muestra el aviso «contenido no legible» con el número de bytes
Y sin aprobación expresa del Usuario no se firma
```
```gherkin
Dado truekeate_logs tras un personal_sign aprobado
Cuando se inspecciona la entrada con event sign_personal
Entonces contiene la dirección y un hash sha256 del mensaje
```
```gherkin
Dado truekeate_logs tras un personal_sign aprobado
Cuando se inspecciona la entrada con event sign_personal
Entonces su campo data no contiene el texto completo firmado
```
**EARS.** *El sistema deberá* admitir `personal_sign` y responder `4200 Unsupported method` a `eth_sign`, que *no deberá* figurar en el catálogo RPC ni en el enum `method` de la cola. *Si* el payload no es legible como UTF-8, *entonces* *el sistema deberá* advertirlo antes de firmar. *El sistema deberá* registrar solo el hash del mensaje.
**Evidencia:** `Vitest: personalSign.spec.ts` · `Vitest: errors.spec.ts` · `Vitest: logRedaction.spec.ts` · `E2E: 11-firmar-mensaje.spec.ts`

---

### CU-29 · Consultar el registro de actividad y su persistencia
**Actor primario:** Service Worker · **Secundarios/sistemas:** Usuario, popup (solo renderiza)
> **Deslinde (ACU-12 y ACU-11).** El actor primario es el **Service Worker**: el CU verifica que **escribe siempre el log aunque el popup esté cerrado** (RF-28), que es un objetivo de sistema, no de usuario. El Usuario consume el panel como actor secundario. §2 y §7 declaran lo mismo; §5 lo asigna a RF-28 … RF-32.
**Objetivo:** Auditar qué ha hecho la cartera (llamadas, eventos, transacciones, firmas y errores) con el popup cerrado y sin perder el histórico al resetear.
**Precondiciones:** Extensión instalada; el SW ha registrado al menos una operación; `chrome.storage.local` accesible.
**Postcondición de éxito:** `truekeate_logs` contiene exactamente una entrada por evento del catálogo cerrado (23 tipos), con `ts`, `level`, **`event`** (nombre del evento, **ACU-04/D-D**), `category`, `origin`, `message` y `data` redactado; el panel las renderiza (errores en rojo) y el export en JSON es descargable.
**Postcondición de fallo:** Si una operación se ejecuta con el popup cerrado y no deja traza, el CU falla: el SW escribe siempre en `chrome.storage.local`, no el popup.
**Datos implicados:** `truekeate_logs` (§2.11: `ts`, `level`, `event`, `category`, `origin`, `message`, `data`), `truekeate_settings.logLimit = 500` y `logMaxPerOrigin = 200` (§2.10), catálogo cerrado de eventos y política de redacción (§2.2 de `requerimientos.md`).
**Trazabilidad:** RF-28, RF-29, RF-30, RF-31, RF-32 · RNF-16, RNF-09 · CA-RF-28, CA-RF-29, CA-RF-30, CA-RF-31, CA-RF-32

**Flujo principal**
1. La dApp ejecuta `eth_blockNumber` **con el popup cerrado**.
2. El SW atiende la llamada, emite el resultado y escribe en `truekeate_logs` una entrada con `event: rpc_call` y `category: 'call'`, con método, origen y `ts`.
3. El Usuario abre el popup y entra en «Registro de actividad»; el popup lee de storage y renderiza.
4. Las entradas `level: 'error'` se pintan en rojo con el `code` numérico y el mensaje en español de la tabla §2.1.
5. Cada transacción aprobada produce una entrada con `event: tx_sent` y `category: 'tx'`, con `txHash` y `txStatus: 'pending'`, que pasa a `event: tx_confirmed` (o `tx_failed`) conservando el mismo hash.
6. El Usuario descarga el histórico en JSON completo.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 5 (transacción revertida):** la misma entrada pasa a `txStatus: 'failed'` con `level: 'error'` y el motivo del revert si el nodo lo entrega.
- **A2 — desde el paso 3 (log vacío):** se muestra el estado vacío con el isologo al 30 % y el texto `--tk-gray-600`.
- **E1 — desde el paso 2 (el SW se duerme tras atender):** la escritura se realiza **antes** de responder o en la misma transacción de trabajo; si falla, se reintenta una vez y se registra la incidencia.
- **E2 — desde cualquier paso (retención superada):** al superar 500 entradas globales o 200 por origen se descartan las más antiguas (FIFO por `ts`).

**Criterios de aceptación**
```gherkin
Dado el popup cerrado y test.html abierto
Cuando la dApp llama eth_blockNumber
Entonces truekeate_logs contiene al menos 1 entrada con el método, el origen y el timestamp
```
```gherkin
Dado el log activo
Cuando se produce un rechazo del Usuario (code 4001)
Entonces la entrada se renderiza en rojo
Y contiene el código 4001 y el mensaje de la tabla §2.1
```
```gherkin
Dado un log con al menos 5 entradas
Cuando el Usuario ejecuta resetWallet
Entonces las 5 últimas entradas siguen presentes
```
```gherkin
Dado un servicio de log con 500 entradas almacenadas
Cuando se registra 1 entrada nueva
Entonces truekeate_logs conserva exactamente las 500 entradas más recientes por ts
Y la entrada descartada es la de ts más antiguo
Y lo mismo por origen con logMaxPerOrigin = 200
```
```gherkin
Dado un fallo simulado de escritura en chrome.storage.local
Cuando el SW atiende una llamada con el popup cerrado
Entonces reintenta la escritura una vez
Y registra la incidencia con event rpc_error y level error
```
**EARS.** *El sistema deberá* escribir siempre `truekeate_logs` desde el Service Worker en `chrome.storage.local`, y *nunca deberá* depender del popup para registrar una operación. *Mientras* exista el log, *el sistema deberá* producir exactamente una entrada por evento del catálogo cerrado, con el campo `event` y su `category`. *El sistema deberá* retener como máximo 500 entradas globales y 200 por origen, descartando las más antiguas por `ts`.
**Evidencia:** `Vitest: logger.spec.ts — 1 entrada por event del catálogo y retención FIFO de 500/200` · `Vitest: logger.spec.ts — supervivencia al reset` · `Vitest: loggerRetry.spec.ts — CU-29/E1 con fallo de escritura` · `E2E: 15-logs.spec.ts` · `Inspección: chrome.storage.local.get('truekeate_logs')` tras la suite E2E completa

---

### CU-30 · Resetear la cartera
**Actor primario:** Usuario · **Secundarios/sistemas:** Service Worker, popup
**Objetivo:** Devolver la extensión a su estado inicial eliminando mnemonic, cuentas y sesiones, sabiendo exactamente qué se pierde.
**Precondiciones:** Cartera operativa; popup abierto.
**Postcondición de éxito:** `chrome.storage.local` no contiene `truekeate_mnemonic`, `truekeate_accounts`, `truekeate_imported_accounts`, `truekeate_current_account`, `truekeate_connected_sites`, `truekeate_pending_requests` ni `truekeate_connect_request`; el popup vuelve al formulario inicial; **`truekeate_logs` se conserva**.
**Postcondición de fallo:** Si el Usuario cancela el diálogo destructivo, no se borra nada; si el borrado falla a medias, la UI informa y el usuario puede reintentar (operación idempotente).
**Datos implicados:** todas las claves `truekeate_*` salvo `truekeate_logs` (§2.1–§2.11), `truekeate_logs` (§2.11, `event`: `reset_wallet`).
**Trazabilidad:** RF-11, RF-32 · RNF-22 · CA-RF-11, CA-RF-32

**Flujo principal**
1. El Usuario abre «Ajustes → Reset wallet».
2. El popup muestra un diálogo destructivo que **enumera** las cuentas importadas que se perderán (no re-derivables del mnemonic) y exige confirmación explícita.
3. El Usuario confirma; el SW cancela alarmas de vencimiento y elimina las claves de cartera, cuentas, sesiones y colas.
4. El SW conserva `truekeate_logs`, purga el badge y registra `reset_wallet`.
5. El popup vuelve a la pantalla inicial de bienvenida.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 2 (el Usuario cancela):** nada se modifica.
- **A2 — desde el paso 2 (no hay cuentas importadas):** el diálogo lo indica expresamente («no hay cuentas importadas que se pierdan») y sigue exigiendo confirmación.
- **E1 — desde el paso 3 (alguna clave no se puede borrar):** el SW reintenta una vez y, si persiste, rechaza con **`-32603`** y el mensaje de la causa «reset incompleto» de la tabla §2.1 (**ACU-05/D-E: el error que ve el usuario siempre lleva `code`**), informando «No se pudo completar el reset. Vuelve a intentarlo.»; el estado parcial se documenta en `truekeate_logs`.
- **E2 — desde el paso 4 (había solicitudes `pending`):** se resuelven con `4001` antes de purgar la cola; ninguna dApp queda colgada.

**Criterios de aceptación**
```gherkin
Dado una cartera con mnemonic, cuentas importadas y sesiones
Cuando el Usuario pulsa «Reset wallet» y confirma el diálogo destructivo
Entonces chrome.storage.local no contiene mnemonic, cuentas ni sesiones
Y el popup vuelve al formulario inicial
```
```gherkin
Dado una cartera con truekeate_logs con al menos 5 entradas
Cuando el Usuario pulsa «Reset wallet» y confirma
Entonces las 5 últimas entradas de truekeate_logs siguen presentes
Y truekeate_mnemonic, truekeate_accounts y truekeate_connected_sites ya no existen
```
```gherkin
Dado una cartera con 2 cuentas importadas
Cuando se abre el diálogo de reset
Entonces el texto enumera las 2 cuentas importadas que se perderán
```
**EARS.** *Cuando* el Usuario confirme el reset, *el sistema deberá* eliminar mnemonic, cuentas, sesiones y colas, y *deberá* excluir `truekeate_logs` de la limpieza. *El sistema deberá* enumerar en el diálogo destructivo las cuentas importadas que se perderán. *Si* hay solicitudes `pending`, *entonces* *el sistema deberá* resolverlas con `4001` antes de purgar.
**Evidencia:** `E2E: 06-reset.spec.ts` · `Vitest: reset.spec.ts` · `E2E: 25-recuperacion.spec.ts` (texto exacto del diálogo) · `Inspección: chrome.storage.local.get(null)`

---

### CU-31 · Operar con el nodo RPC local caído
**Actor primario:** Service Worker · **Secundarios/sistemas:** Usuario, dApp, Nodo RPC local Anvil (ausente)
> **Deslinde (ACU-12).** El actor primario es el **Service Worker**: ejecuta la política de 4 llamadas RPC, decide el `4900` y conserva el storage. El Usuario y la dApp son secundarios (observan «desconectado» y reciben el error). §2 y §7 declaran lo mismo.
**Objetivo:** Seguir entendiendo el estado de la cartera y poder recuperarse cuando Anvil no responde, sin perder el estado persistido.
**Precondiciones:** Extensión con cartera; Anvil detenido (puerto 8545 sin escuchar).
**Postcondición de éxito:** La UI muestra «desconectado», los métodos que dependen del RPC fallan con `4900`, el estado persistido queda intacto y, al volver Anvil, la UI se recupera sin recargar la cartera.
**Postcondición de fallo:** Si la UI se bloquea, pierde el último saldo conocido, deja de ser interactiva o corrompe `chrome.storage.local`, el CU falla.
**Datos implicados:** `truekeate_logs` (`rpc_error`), último saldo en memoria de la UI, `truekeate_networks` (§2.6), todas las claves persistidas (deben quedar intactas).
**Trazabilidad:** RF-18, RF-27 · RNF-06, RNF-07 · CA-RF-18, CA-RF-27

**Flujo principal**
1. El popup intenta leer el saldo y el SW no obtiene respuesta de `127.0.0.1:8545`.
2. El SW ejecuta la política de reintentos: **1 intento inicial + 3 reintentos = 4 llamadas RPC**, contadas por el provider falso, con esperas observadas de **1 s, 2 s y 4 s** (backoff ×2) y **timeout de 5 s por intento** (ACU-02).
3. Agotadas las 4 llamadas, el SW responde `4900` con «Sin conexión con la red local (Anvil).» y acción sugerida «Arrancar Anvil en 127.0.0.1:8545».
4. La UI conserva el último saldo conocido, muestra «desconectado» y permanece operable: el botón «Reintentar» queda habilitado y la lista de cuentas sigue respondiendo a `Tab`.
5. Al volver Anvil, el siguiente ciclo de polling recupera el saldo y la UI vuelve a «conectado» sin recargar la cartera.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 1 (fallo durante `eth_sendTransaction`):** la solicitud se rechaza con `4900` **antes** de abrir `notification.html`; no se firma nada.
- **A2 — desde el paso 1 (fallo durante `wallet_switchEthereumChain`):** se mantiene la red anterior como activa efectiva y se aplica **CU-24/E1**.
- **E1 — desde el paso 2 (el RPC responde en la cuarta y última llamada):** se considera éxito; no se muestra el estado «desconectado» y no se acumulan llamadas en vuelo.
- **E2 — desde el paso 4 (el Usuario pulsa «Reintentar»):** se reinicia la secuencia completa de 4 llamadas RPC inmediatamente.

**Criterios de aceptación**
```gherkin
Dado el popup abierto, Anvil detenido y un provider falso instrumentado
Cuando se intenta leer el saldo
Entonces el provider falso registra exactamente 4 llamadas RPC (1 intento inicial más 3 reintentos)
Y las esperas observadas entre llamadas son 1 s, 2 s y 4 s
Y cada intento tiene un timeout de 5 s
Y la UI muestra «desconectado» con la acción sugerida «Arrancar Anvil en 127.0.0.1:8545»
Y chrome.storage.local permanece intacto
```
```gherkin
Dado el popup abierto y Anvil detenido
Cuando el SW agota las 4 llamadas RPC
Entonces el botón «Reintentar» queda habilitado
Y la lista de cuentas sigue respondiendo al recorrido con Tab
Y axe-core no reporta violaciones nuevas de nivel A/AA
```
```gherkin
Dado un provider falso que responde correctamente en la cuarta llamada
Cuando se intenta leer el saldo
Entonces el provider falso registra exactamente 4 llamadas RPC
Y la UI muestra el saldo y no muestra el estado «desconectado»
Y no queda ninguna llamada en vuelo
```
```gherkin
Dado Anvil detenido
Cuando la dApp llama eth_sendTransaction
Entonces la promesa se rechaza con code 4900
Y no se abre notification.html
Y no se crea ninguna entrada en truekeate_pending_requests
```
**EARS.** *Si* el RPC no responde, *entonces* *el sistema deberá* ejecutar **1 intento inicial más 3 reintentos (4 llamadas RPC en total)** con backoff ×2 (esperas de 1 s, 2 s y 4 s) y timeout de 5 s por intento, mostrando «desconectado» y conservando `chrome.storage.local` intacto. *Mientras* el RPC esté caído, *el sistema deberá* responder `4900` a los métodos que dependen de la red y *no deberá* abrir ventanas de confirmación.
**Evidencia:** `Vitest: rpcRetry.spec.ts — provider falso con fake timers: contador exacto de 4 llamadas RPC, esperas observadas 1/2/4 s, timeout 5 s por intento, y el caso de éxito en la 4.ª llamada` · `E2E: 27-rpc-caido.spec.ts — Anvil detenido` · `Vitest: errors.spec.ts — 4900` · `Inspección: chrome.storage.local.get(null)` antes y después

---

### CU-32 · Validar entradas de formulario con feedback inline
**Actor primario:** Usuario · **Secundarios/sistemas:** UI del popup, Service Worker (validación final)
**Objetivo:** Detectar y corregir una entrada inválida antes de que se envíe cualquier operación.
**Precondiciones:** Popup abierto en cualquiera de los formularios: frase, clave privada, dirección de envío, valor, etiqueta o alta de red.
**Postcondición de éxito:** Cada caso inválido muestra su mensaje inline en español junto al campo, el botón de acción permanece deshabilitado y **no** se envía ninguna solicitud al Service Worker.
**Postcondición de fallo:** Si una entrada inválida llega al SW, este responde `-32602` con «Los parámetros de la solicitud no son válidos.» y no modifica el storage; el defecto de UI asociado se registra.
**Datos implicados:** `truekeate_accounts` (§2.2), `truekeate_imported_accounts` (§2.3), `truekeate_mnemonic` (§2.1), `truekeate_networks` (§2.6).
**Trazabilidad:** RF-33 · RNF-06 · CA-RF-33

**Flujo principal**
1. El Usuario introduce una entrada en cualquiera de los formularios.
2. La UI valida en el evento de cambio (no en el envío) y muestra el resultado inline.
3. Con la entrada inválida, el botón de acción se deshabilita y el foco permanece en el campo.
4. Con la entrada válida, el botón se habilita y la operación puede continuar en el CU correspondiente.

**Flujos alternativos y de excepción**
- **A1 — frase con checksum erróneo o ≠ 12 palabras:** «frase inválida»; continúa en **CU-02**.
- **A2 — clave privada de 63/65 hex, sin `0x` o fuera de rango:** «clave privada inválida»; continúa en **CU-03**.
- **A3 — dirección con checksum EIP-55 inválido:** «dirección inválida»; continúa en **CU-11**.
- **A4 — valor mayor que el saldo disponible:** «saldo insuficiente»; continúa en **CU-11**/**CU-12**.
- **A5 — etiqueta vacía o de más de 32 caracteres:** «la etiqueta debe tener entre 1 y 32 caracteres»; continúa en **CU-05**.
- **E1 — entrada válida en la UI pero rechazada por el SW:** `-32602` con el mensaje de la tabla §2.1; la UI refleja el error y no modifica el storage.

**Criterios de aceptación**
```gherkin
Dado el formulario de envío o de importación
Cuando introduzco una dirección inválida, un valor mayor que el saldo, una frase con checksum erróneo o una clave privada de 63 hex
Entonces cada caso muestra su mensaje inline en español junto al campo
Y el botón de acción permanece deshabilitado
Y la operación no se envía en ningún caso
```
```gherkin
Dado un formulario con una entrada inválida
Cuando se inspecciona el DOM
Entonces el mensaje de error está asociado al campo mediante aria-describedby
Y el foco permanece en el campo con foco visible de 2 px
```
```gherkin
Dado una entrada válida en la UI
Cuando el SW la rechaza por validación de servidor
Entonces la promesa se rechaza con code -32602 y el mensaje de la tabla §2.1
Y chrome.storage.local no se modifica
```
**EARS.** *Si* una entrada no supera la validación, *entonces* *el sistema deberá* mostrar un mensaje inline en español y no enviar la operación. *Cuando* una entrada inválida alcance el Service Worker, *el sistema deberá* responder `-32602` sin modificar `chrome.storage.local`.
**Evidencia:** `Vitest: validation.spec.ts` · `E2E: 16-validacion.spec.ts` · `E2E: 24-accesibilidad.spec.ts` (asociación ARIA y foco)

---

### CU-33 · Ver la bienvenida y «Acerca de» con la tagline de marca
**Actor primario:** Usuario · **Secundarios/sistemas:** UI del popup, activos de marca `public/brand/`
**Objetivo:** Reconocer el producto y entender qué es (y qué no es) antes de usarlo, mediante la identidad de marca y los avisos obligatorios.
**Precondiciones:** Extensión instalada; primera apertura del popup o acceso a «Acerca de».
**Postcondición de éxito:** La pantalla muestra el logotipo horizontal `truekeate-titulo.png` (nunca retipeado), la tagline exacta `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS` en Poppins 600 con `letter-spacing: 0.14em` y color `--tk-navy-800`, y el aviso no descartable de entorno de desarrollo.
**Postcondición de fallo:** Si la tagline se renderiza con fuente de sistema, con otro texto, o falta el logotipo, el CU falla (regla de oro de la identidad visual).
**Medición exacta de la tagline (ACU-24).** La tagline se comprueba con `getComputedStyle` sobre su nodo: familia `Poppins` (auto-hospedada, sin fallback de sistema activo), `font-weight: 600`, `letter-spacing: 0.14em`, color computado igual al token `--tk-navy-800`, texto exacto `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS` y ausencia de recorte. El encabezado usa `--tk-grad-brand` con altura 72 px y la marca de agua del isologo al 18 % de opacidad.
**Datos implicados:** `public/brand/truekeate-titulo.{svg,png}`, `public/brand/truekeate-mark-96.png`, `src/styles/tokens.css`, `truekeate_settings` (registro de aceptación del aviso).
**Trazabilidad:** RF-48, RF-49 · RNF-18, RNF-19, RNF-23, RT-12 · CA-RF-48, CA-RF-49

**Flujo principal**
1. El Usuario abre el popup por primera vez; ve el encabezado con `--tk-grad-brand` de 72 px, la marca de agua del isologo al 18 % y el nombre «TrueKeate» en blanco.
2. La pantalla de bienvenida muestra el logotipo horizontal y la tagline exacta.
3. Se muestra el aviso no descartable «entorno de desarrollo — no usar con fondos reales»; la aceptación se registra en `truekeate_settings`.
4. El Usuario abre «Acerca de» y vuelve a ver el logotipo horizontal, la tagline y el aviso.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 1 (aperturas posteriores):** el aviso de primer arranque no se repite, pero sigue disponible en «Acerca de».
- **A2 — desde el paso 3 (200 % de zoom):** no hay pérdida de contenido; la tagline y el logotipo se reajustan sin recortes.
- **E1 — desde el paso 1 (activo de marca ausente):** se muestra el texto alternativo en español, se registra la incidencia y el CU se marca como fallido (el activo es entregable de RT-12).

**Criterios de aceptación**
```gherkin
Dado el popup recién abierto
Cuando el Usuario abre «Acerca de»
Entonces se muestra el logotipo horizontal de TrueKeate
Y la tagline exacta PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS
Y el aviso no descartable de entorno de desarrollo
```
```gherkin
Dado el popup recién abierto
Cuando el Usuario abre «Acerca de»
Entonces getComputedStyle del nodo de la tagline devuelve font-family Poppins
Y devuelve font-weight 600
Y devuelve letter-spacing 0.14em
Y el color computado es el valor del token --tk-navy-800
Y el texto es exactamente PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS
Y el encabezado tiene 72 px de alto y usa el degradado --tk-grad-brand
Y la marca de agua del isologo está al 18 por ciento de opacidad
```
```gherkin
Dado popup, connect.html, notification.html y la dApp
Cuando se inspeccionan encabezados y estilos
Entonces los encabezados usan el degradado de marca y el isologo
Y las tipografías son Poppins, Inter y JetBrains Mono auto-hospedadas
Y el número de colores literales fuera de tokens.css es 0
```
**EARS.** *El sistema deberá* mostrar la tagline exacta `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS` únicamente en la bienvenida y en «Acerca de», nunca en el encabezado del popup. *El sistema deberá* servir el logotipo como activo gráfico y *nunca deberá* retipear el wordmark con una fuente del sistema. *El sistema deberá* mostrar el aviso de entorno de desarrollo en el primer arranque, en «Acerca de» y antes de la primera firma.
**Evidencia:** `E2E: 23-marca.spec.ts — tagline con getComputedStyle` · `E2E: 26-avisos.spec.ts` · `Comando: grep -rnE "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(|linear-gradient|radial-gradient|font-family:" src --exclude=tokens.css --include=*.css --include=*.tsx --include=*.ts` → 0 coincidencias · `Inspección: árbol public/brand/ + LICENSE/NOTICE`

---

### CU-34 · Interpretar los estados de error con color y mensaje correctos
**Actor primario:** Usuario · **Secundarios/sistemas:** UI del popup, panel de logs, Service Worker
**Objetivo:** Entender qué ha fallado y qué hacer, con el color de estado correcto y una causa y acción sugerida en español.
**Precondiciones:** Existe al menos un error EIP-1193 registrado (por ejemplo un rechazo `4001` o un `4900`).
**Postcondición de éxito:** Cada estado usa el token correcto —`error` en `--tk-danger`/`--tk-danger-dark`, `warning` en `--tk-warning`, `success` en `--tk-success`, `info` en `--tk-info`— y cada mensaje muestra el `code` y la acción sugerida de la tabla §2.1.
**Postcondición de fallo:** Si un error se muestra sin `code`, en otro idioma o con un color fuera de los tokens, el CU falla (RNF-06/RNF-18/RNF-19).
**Datos implicados:** `truekeate_logs` (§2.11: `level`, `message`, `data`), tokens `--tk-danger`, `--tk-danger-dark`, `--tk-warning`, `--tk-success`, `--tk-info` (§2.3 de `identidad_visual.md`).
**Trazabilidad:** RF-30, RF-49 · RNF-06, RNF-18, RNF-19 · CA-RF-30, CA-RF-49

**Flujo principal**
1. Se produce un error, por ejemplo el rechazo del Usuario (`4001`).
2. El SW registra la entrada con `level: 'error'` y el código numérico.
3. El panel de logs la pinta sobre `--tk-night-900` con el texto en `--tk-danger` a ≥ 18 px o con el par alternativo `--tk-danger-dark` sobre blanco (6,84:1).
4. El mensaje mostrado es el de la tabla §2.1 con su causa y su acción sugerida.
5. En el caso de `4900`, además, la cabecera de la vista muestra el estado «desconectado» con `--tk-warning`.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 1 (`4900` por RPC caído):** mensaje «Sin conexión con la red local (Anvil).» + acción «Arrancar Anvil en 127.0.0.1:8545»; continúa en **CU-31**.
- **A2 — desde el paso 1 (`4200` por método no soportado):** mensaje «El método solicitado no está soportado por TrueKeate Wallet.» + acción «Usar `personal_sign` o `eth_signTypedData_v4`».
- **A3 — desde el paso 1 (operación correcta):** el estado pasa a `success` con `--tk-success`, y a ≥ 18 px si el par no alcanza 4,5:1.
- **E1 — desde el paso 3 (modo oscuro):** se aplican los pares de la matriz de contraste de `identidad_visual.md` §2.4 para oscuro; nunca `--tk-gray-600` sobre `--tk-night-800`.

**Criterios de aceptación**
```gherkin
Dado el log activo
Cuando se produce un rechazo del Usuario (code 4001)
Entonces la entrada se renderiza con el token de peligro de la identidad visual
Y contiene el código 4001, el mensaje de la tabla §2.1, su causa y su acción sugerida
```
```gherkin
Dado cualquier mensaje de error visible en la extensión
Cuando se inspecciona su contenido
Entonces está en español
Y contiene un campo code numérico
Y no utiliza un color fuera de los tokens de tokens.css
```
**EARS.** *Mientras* la UI muestre un error, *el sistema deberá* usar el `code` numérico de la tabla §2.1 con su mensaje, causa y acción sugerida en español, y los tokens de estado de la identidad visual. *Si* un par texto/fondo no figura en la matriz de contraste cerrada, *entonces* no se usará para texto. *El sistema deberá* conservar el foco visible de 2 px en todos los controles interactivos.
**Evidencia:** `E2E: 15-logs.spec.ts — rojo con code y acción sugerida` · `E2E: 16-validacion.spec.ts` · `Vitest: errors.spec.ts` · `Vitest: contrast.spec.ts — matriz de contraste desde tokens.css` · `Vitest: goldUsage.spec.ts — ACU-23: falla si un nodo cuyo color computado resuelve a --tk-gold-500 contiene texto (se excluyen SVG con aria-hidden)` · `E2E: 24-accesibilidad.spec.ts — axe-core, 0 violaciones A/AA`

---

### CU-35 · Recorrer las tres ventanas solo con teclado — **DERIVADO**
**Actor primario:** Usuario (incluye usuarios que no usan ratón) · **Secundarios/sistemas:** Navegador (foco), `axe-core`
**Objetivo:** Completar las acciones críticas sin ratón, con foco siempre visible y sin trampas de foco.
**Justificación de derivación (sin RF):** proviene de **RNF-21** (accesibilidad) y **RNF-19** (contraste). No hay RF de accesibilidad en el enunciado; se especifica porque RNF-21 es un requisito Must de la v1.4 y necesita oráculo.
**Precondiciones:** Popup (380 × 600), `connect.html` (420 × 650) y `notification.html` (420 × 640) abiertas; extensión cargada.
**Postcondición de éxito:** Las acciones críticas (cargar cartera, importar clave, seleccionar cuenta, aprobar, rechazar, reset) se ejecutan solo con teclado; `Esc` en la confirmación equivale a rechazar; foco visible de 2 px `--tk-teal-500` con `offset` 2 px; `axe-core` reporta 0 violaciones de nivel A/AA.
**Postcondición de fallo:** Si alguna acción crítica exige ratón, si el foco no es visible o si hay una trampa de foco, el CU falla (defecto de RNF-21).
**Datos implicados:** `src/styles/tokens.css` (`--tk-teal-500`), contratos de foco y teclado de `identidad_visual.md` §5.3 regla 7.
**Trazabilidad:** *(sin RF)* · RNF-19, RNF-21 · Declarado en §9

**Flujo principal**
1. El Usuario abre el popup y navega con `Tab`; cada control recibe foco visible de 2 px con contraste ≥ 3:1.
2. Con `Enter`/`Espacio` crea o importa la cartera y avanza por las pantallas sin usar el ratón.
3. En `connect.html` selecciona una cuenta con las flechas y confirma con `Enter`.
4. En `notification.html` recorre el resumen y los avisos de riesgo con `Tab`, aprueba con `Enter` o rechaza con `Esc`.
5. `axe-core` se ejecuta sobre las tres ventanas y devuelve 0 violaciones de nivel A/AA; con 200 % de zoom no hay pérdida de contenido.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 4 (`prefers-reduced-motion` activo):** el spinner y las transiciones se desactivan; el flujo se completa igual.
- **A2 — desde el paso 4 (botones Aprobar/Rechazar):** cada uno mide al menos 44 × 44 px CSS y están separados ≥ 8 px.
- **E1 — desde el paso 1 (foco invisible en algún control):** se considera violación de RNF-21 y el CU falla.
- **E2 — desde el paso 5 (violación detectada por `axe-core`):** el CU falla y se registra la violación como incidencia bloqueante del hito.

**Criterios de aceptación**
```gherkin
Dado el popup abierto en modo claro
Cuando el Usuario recorre con Tab todos los controles interactivos
Entonces cada control muestra un contorno de foco de 2 px con contraste mayor o igual que 3:1
Y ninguna acción crítica exige el ratón
Y axe-core reporta 0 violaciones de nivel A/AA
```
```gherkin
Dado notification.html con una solicitud pendiente
Cuando el Usuario pulsa Esc
Entonces la solicitud se rechaza con code 4001
Y los botones Aprobar y Rechazar miden al menos 44 × 44 px y distan 8 px o más
```
**EARS.** *Mientras* la UI esté operativa, *el sistema deberá* exponer foco visible (contorno de 2 px `--tk-teal-500`, `offset` 2 px) en todo control interactivo y *deberá* permitir ejecutar las acciones críticas solo con teclado. *El sistema deberá* conservar todo el contenido al 200 % de zoom y *deberá* desactivar spinner y transiciones con `prefers-reduced-motion`.
**Evidencia:** `E2E: 24-accesibilidad.spec.ts` (recorrido por teclado + `axe-core`) · `Vitest: contrast.spec.ts` · `Inspección: `outline: none` en src/styles` (0 coincidencias sin sustituto)

---

### CU-36 · Instalar desde `dist/` y verificar el build limpio — **DERIVADO**
**Actor primario:** Docente/evaluador (Perfil B) · **Secundarios/sistemas:** Navegador Chrome/Edge, `npm`/Vite, WSL2 o CI `ubuntu-latest`
**Objetivo:** Cargar la extensión en un equipo limpio y comprobar, sin la ayuda del autor, que el producto funciona y que la entrega es reproducible.
**Justificación de derivación (sin RF):** proviene de **RNF-04, RNF-15, RNF-20, RNF-23, RNF-24** y de los **RT-01…RT-13**, más el paquete de entregables de `requerimientos.md` §4.1/§4.2. No hay RF que cubra la instalación ni el build; se especifica porque es la rúbrica del evaluador.
**Precondiciones:** Repositorio con `package-lock.json` versionado; Node `v24.16.0` y Foundry dentro de `>=1.0.0 <2.0.0`; `LICENSE`, `NOTICE` y los tres `LICENSE-*.txt` presentes.
**Postcondición de éxito:** `npm ci && npm run build` termina con exit 0 y cero errores de tipos; `dist/` se carga en `chrome://extensions` y `edge://extensions` (≥ 114) sin errores; `npm run test`, `npm run test:e2e` y `forge test` terminan con exit 0; README e INSTRUCCIONES permiten instalar sin ayuda del autor.
**Postcondición de fallo:** Si el build requiere ajustes manuales, si aparece cualquier warning de código propio, si falta una licencia o si la extensión no carga, el CU falla y el hito no se cierra.
**Datos implicados:** `dist/manifest.json` (generado desde `src/manifest.ts`), `public/icons/icon-{16,32,48,128}.png`, `public/brand/`, `public/fonts/*.woff2` + `LICENSE-*.txt`, `package-lock.json`.
**Trazabilidad:** *(sin RF)* · RNF-04, RNF-13, RNF-14, RNF-15, RNF-17, RNF-20, RNF-23, RNF-24 · RT-01, RT-02, RT-03, RT-04, RT-05, RT-06, RT-07, RT-08, RT-09, RT-10, RT-12, RT-13 · RE-01, RE-04 · Declarado en §9

**Flujo principal**
1. El evaluador clona el repositorio y ejecuta `npm ci` (instalación reproducible desde `package-lock.json`).
2. Ejecuta `npm run build` (`tsc -b && vite build`): exit 0, cero errores de tipos y `dist/manifest.json` generado.
3. Comprueba que el bundle de ethers vive en `dist/` sin URLs de CDN y que no hay peticiones a CDN en runtime.
4. Abre `chrome://extensions`, activa el modo desarrollador, carga `dist/` descomprimida y verifica que aparecen los 4 iconos y el nombre «TrueKeate Wallet»; repite en `edge://extensions`.
5. Ejecuta `npm run test`, `npm run test:e2e` (con Anvil en marcha y verificación previa de versión) y `forge test`, los tres con exit 0.
6. Repite `npm ci && npm run build` en WSL2 o CI `ubuntu-latest` y compara el resultado.
7. Sigue `INSTRUCCIONES.md` para servir `test.html` en `http://localhost:5174` y abrir la cartera sin ayuda del autor.

**Flujos alternativos y de excepción**
- **A1 — desde el paso 3 (activo remoto detectado):** se considera defecto de RNF-20; el CU falla.
- **A2 — desde el paso 5 (Anvil no responde o versión fuera de rango):** la suite E2E **no se ejecuta** y se marca «no verificada», nunca como satisfactoria.
- **E1 — desde el paso 2 (warning del código propio):** invalida el «build limpio»; solo se admiten warnings de dependencias de terceros listados.
- **E2 — desde el paso 4 (verificación Linux no disponible):** RNF-15 se marca «verificado solo en Windows; pendiente en Linux», nunca como cumplido.
- **E3 — desde el paso 1 (`npm run lint:prohibited` detecta `viem`, `@scure/bip39`, `@metamask/*`, `axios` o `fetch` propio):** el build falla y el CU también.

**Criterios de aceptación**
```gherkin
Dado el repositorio con package-lock.json versionado
Cuando el evaluador ejecuta npm ci && npm run build
Entonces ambos comandos terminan con exit 0
Y dist/manifest.json se ha generado desde src/manifest.ts
Y no hay ninguna URL de CDN en dist/
```
```gherkin
Dado el navegador Chrome 114 o superior
Cuando el evaluador carga dist/ descomprimida y abre el popup
Entonces la extensión aparece como «TrueKeate Wallet» con sus 4 iconos
Y manifest_version es 3
Y no se declaran los permisos tabs, activeTab ni scripting sin uso demostrado
Y la consola del Service Worker y de la página registran 0 errores
Y el badge de errores de chrome://extensions permanece en 0
```
**EARS.** *El sistema deberá* ofrecer un «build limpio»: `npm ci && npm run build` con exit 0, cero errores de tipos con `strict: true` y solo los warnings permitidos, en Windows y en Linux (WSL2 o CI `ubuntu-latest`). *El sistema deberá* declarar los permisos `storage`, `alarms` y `notifications`, y solo los permisos de host de las redes dadas de alta. *El sistema deberá* funcionar en Chrome ≥ 114 y Edge ≥ 114 sin `manifest_version: 2`. *De acuerdo con* DEC-15 y RT-12, *el sistema deberá* incluir `LICENSE`, `NOTICE` y los `LICENSE-*.txt` OFL-1.1 de las tres familias tipográficas.
**Criterios de aceptación — documentación (ACU-15: cubre los 10 puntos de «Documentación» de la rúbrica)**
```gherkin
Dado el repositorio entregado
Cuando el evaluador lee README.md sin ayuda del autor
Entonces README.md documenta los 4 puntos exigidos: qué es el producto, requisitos previos con versiones, instalación y build paso a paso, y cómo cargar dist/ en Chrome
Y INSTRUCCIONES.md documenta los 3 puntos exigidos: arranque de Anvil con su rango de versión, arranque de la dApp en el puerto 5174 y ejecución de las tres suites
Y cada módulo de src/background, src/popup y src/shared tiene comentarios JSDoc en sus funciones y tipos exportados
```
```gherkin
Dado un módulo TypeScript de src/ con funciones exportadas
Cuando se inspecciona su cabecera
Entonces cada función exportada tiene un bloque JSDoc con descripción, parámetros y valor de retorno
Y no hay funciones exportadas sin JSDoc en src/background/crypto, src/background/approvals y src/shared/validation
```
```gherkin
Dado README.md e INSTRUCCIONES.md
Cuando el evaluador sigue sus pasos en un equipo limpio
Entonces completa la instalación, el build y el arranque de la dApp sin ayuda del autor
Y ninguno de los dos documentos contiene pasos que exijan conocimiento tácito del proyecto
```
**Evidencia:** `E2E: 01-onboarding.spec.ts — carga de dist/ con 0 errores de consola y 0 en el badge de errores` · `Inspección: README.md — 4 puntos de la rúbrica (qué es, requisitos, instalación/build, carga de dist/)` · `Inspección: INSTRUCCIONES.md — 3 puntos de la rúbrica (Anvil, dApp 5174, suites)` · `Comando: grep -rn "@param\|@returns" src --include=*.ts --include=*.tsx` (cobertura de JSDoc en src/background/crypto, src/background/approvals y src/shared/validation) · `Comando: npm ci && npm run build` (Windows y WSL2) · `Comando: npm run test -- --coverage` (ramas ≥ 70 % global y ≥ 80 % en `src/background/crypto/`, `src/background/approvals/`, `src/shared/validation/`) · `Comando: npm run test:e2e` · `Comando: forge test` · `Comando: npm run lint:prohibited` · `Comando: npx tsc -b` · `Comando: npm ls react typescript vite` · `Inspección: git ls-files` con `LICENSE`, `NOTICE` y los 3 `LICENSE-*.txt` · `Inspección: dist/manifest.json y árbol public/`

---

## 4. Flujos alternativos consolidados

Estos flujos atraviesan varios CU y se definen una sola vez para no repetirlos. Cada CU que los invoca lo referencia por su etiqueta local (`A#`/`E#`).

| ID | Flujo transversal | CUs que lo invocan | Regla única |
|---|---|---|---|
| **X-01** | Cancelación del Usuario en cualquier ventana de decisión | CU-03, CU-05, CU-06, CU-13, CU-14, CU-16, CU-17, CU-25, CU-30 | La ventana se cierra, la entrada se marca `rejected` con `errorCode: 4001`, el badge se recalcula y no se firma ni se persiste nada nuevo. |
| **X-02** | Cierre de la ventana con la X o por el sistema operativo | CU-13, CU-14, CU-15 | Equivale a rechazo (`4001`), salvo que el plazo ya haya vencido, en cuyo caso prevalece `expired` con el mensaje de vencimiento. |
| **X-03** | El Service Worker se duerme en mitad del flujo | CU-08, CU-13, CU-15, CU-16, CU-18, CU-27 | El estado se reconstruye desde `chrome.storage.local`; el puerto se reconecta con backoff (1 s, 2 s, 4 s, 8 s, 16 s, máx. 30 s) y el `RESUME` lleva el `approvalId`. |
| **X-04** | RPC local caído | CU-10, CU-11, CU-12, CU-24, CU-27, CU-28 | `4900` + política de 3 reintentos con backoff ×2 y timeout de 5 s; `chrome.storage.local` intacto; **CU-31**. |
| **X-05** | Entrada inválida en un formulario | CU-02, CU-03, CU-05, CU-11, CU-12, CU-25 | Validación inline en español, botón deshabilitado y `-32602` si llega al SW; **CU-32**. |
| **X-06** | Doble pulsación de «Aprobar» o respuesta duplicada | CU-13, CU-14, CU-17, CU-25 | El SW ignora la segunda respuesta porque la entrada ya no está `pending`; nunca se difunde dos veces. |
| **X-07** | Origen con formato distinto (`HTTP://LOCALHOST:5174/`) | CU-17, CU-18, CU-19, CU-20, CU-25 | Clave canónica: minúsculas, sin barra final, con puerto explícito. |
| **X-08** | Exceso de cardinalidad (8 globales, 1 por origen, 6 por minuto) | CU-16, CU-17, CU-25, CU-28 | `4001` inmediato, sin persistir, sin abrir ventana y sin contar para el badge; queda traza en `truekeate_logs`. |
| **X-09** | Pestaña cerrada con una solicitud pendiente | CU-14, CU-15, CU-19 | `chrome.tabs.onRemoved` marca la entrada `rejected` (o `expired` si ya venció), purga el badge y deja traza. |
| **X-10** | Sobre de error EIP-1193 | Todos | Toda respuesta de error es un objeto con `code` numérico y `message` en español de la tabla §2.1 de `requerimientos.md`; prohibido `new Error(...)` sin `code`. |

---

## 5. Matriz de trazabilidad RF → CU

> **Regenerada desde las 36 fichas de §3 conforme a la regla «la ficha declara, la matriz agrega» (ACU-01).** El número entre paréntesis de la última columna es la **cardinalidad** (cuántos CU cubren el RF) y coincide con las columnas «RF cubiertos» de §2.
> Cobertura: **50 / 50 RF** con al menos un CU · **RF huérfanos: 0** · **40 / 40 RF Must cubiertos (incluido RF-50)** + los 10 RF Should.

### 5.1 RF Must (MVP)

| RF | Prioridad | CU que lo cubre | ¿Más de un CU? | Criterios de referencia |
|---|---|---|---|---|
| RF-01 | Must | CU-01 | no (1) | CA-RF-01 |
| RF-02 | Must | CU-02 | no (1) | CA-RF-02 |
| RF-03 | Must | CU-01, CU-02 | sí (2) | CA-RF-03 |
| RF-04 | Must | CU-04 | no (1) | CA-RF-04 |
| RF-05 | Must | CU-03, CU-05 | sí (2) | CA-RF-05 |
| RF-07 | Must | CU-09 | no (1) | CA-RF-07 |
| RF-08 | Must | CU-11, CU-12 | sí (2) | CA-RF-08 |
| RF-09 | Must | CU-08 | no (1) | CA-RF-09 |
| RF-10 | Must | CU-04, CU-05, CU-08, CU-18, CU-24, CU-26 | sí (6) | CA-RF-10 |
| RF-11 | Must | CU-30 | no (1) | CA-RF-11 |
| RF-13 | Must | CU-22 | no (1) | CA-RF-13 |
| RF-14 | Must | CU-14, CU-20, CU-21, CU-28 | sí (4) | CA-RF-14 |
| RF-15 | Must | CU-26 | no (1) | CA-RF-15 |
| RF-16 | Must | CU-17 | no (1) | CA-RF-16 |
| RF-17 | Must | CU-08, CU-17, CU-18, CU-20 | sí (4) | CA-RF-17 |
| RF-18 | Must | CU-10, CU-31 | sí (2) | CA-RF-18 |
| RF-19 | Must | CU-11, CU-12, CU-13 | sí (3) | CA-RF-19 |
| RF-20 | Must | CU-27 | no (1) | CA-RF-20 |
| RF-21 | Must | CU-28 | no (1) | CA-RF-21 |
| RF-22 | Must | CU-24, CU-25 | sí (2) | CA-RF-22 |
| RF-23 | Must | CU-21, CU-25 | sí (2) | CA-RF-23 |
| RF-24 | Must | CU-19, CU-24, CU-26 | sí (3) | CA-RF-24 |
| RF-25 | Must | CU-18 | no (1) | CA-RF-25 (caducidad 24 h renovables incluida — D-B) |
| RF-26 | Must | CU-19 | no (1) | CA-RF-26 |
| RF-27 | Must | CU-10, CU-26, CU-31 | sí (3) | CA-RF-27 |
| RF-28 | Must | CU-29 | no (1) | CA-RF-28 |
| RF-29 | Must | CU-29 | no (1) | CA-RF-29 |
| RF-30 | Must | CU-29, CU-34 | sí (2) | CA-RF-30 |
| RF-31 | Must | CU-29 | no (1) | CA-RF-31 |
| RF-33 | Must | CU-02, CU-03, CU-11, CU-32 | sí (4) | CA-RF-33 |
| RF-35 | Must | CU-13, CU-14 | sí (2) | CA-RF-35 |
| RF-36 | Must | CU-17 | no (1) | CA-RF-36 |
| RF-37 | Must | CU-16 | no (1) | CA-RF-37 |
| RF-41 | Must | CU-13, CU-14 | sí (2) | CA-RF-41 |
| RF-42 | Must | CU-11, CU-12 | sí (2) | CA-RF-42 |
| RF-43 | Must | CU-11, CU-12 | sí (2) | CA-RF-43 |
| RF-45 | Must | CU-22 | no (1) | CA-RF-45 |
| RF-46 | Must | CU-23 | no (1) | CA-RF-46 |
| RF-49 | Must | CU-01, CU-09, CU-33, CU-34 | sí (4) | CA-RF-49 |
| RF-50 | Must | CU-07 | no (1) | CA-RF-50 (P-18; requisito en curso en `requerimientos.md`) |

**Total Must cubiertos: 40 / 40 · RF Must huérfanos: 0.**

### 5.2 RF Should (especificados ya; alcance en el ciclo posterior)

| RF | Prioridad | CU que lo cubre | ¿Más de un CU? | Criterios de referencia |
|---|---|---|---|---|
| RF-06 | Should | CU-06 | no (1) | CA-RF-06 |
| RF-12 | Should | CU-02 (A1) | no (1) | CA-RF-12 |
| RF-32 | Should | CU-29, CU-30 | sí (2) | CA-RF-32 |
| RF-34 | Should | CU-10 | no (1) | CA-RF-34 |
| RF-38 | Should | CU-16 (A3) | no (1) | CA-RF-38 *(el `CA-RF-38` que cita CU-15 es solo la operación de purga del badge: no agrega el RF — P-17)* |
| RF-39 | Should | CU-16 (A3) | no (1) | CA-RF-39 |
| RF-40 | Should | CU-15 | no (1) | CA-RF-40 |
| RF-44 | Should | CU-22 | no (1) | CA-RF-44 |
| RF-47 | Should | CU-23 | no (1) | CA-RF-47 |
| RF-48 | Should | CU-33 | no (1) | CA-RF-48 |

**Total Should cubiertos: 10 / 10.**
**Total global: 50 / 50 RF cubiertos · RF huérfanos: 0.**

> **Correcciones concretas aplicadas en esta regeneración (ACU-01).** (a) RF-10 agrega CU-04, CU-05, CU-08, CU-18, CU-24 y CU-26 —la v1.0 lo marcaba «más de un CU» mientras §2 declaraba uno solo—; (b) RF-24 agrega CU-19, que la v1.0 tenía en la ficha y no en la matriz; (c) RF-27 agrega CU-26 y RF-49 incorpora CU-09 (la v1.0 los omitía pese a declararlos las fichas); (d) RNF-02, RNF-18, RNF-19 y RT-11 dejan de faltar en el índice §2 (ACU-11) y se reflejan en la columna «RNF/RT/RE clave»; (e) RF-14, RF-17 y RF-38 quedan verificados contra las fichas: RF-14 → CU-14, CU-20, CU-21, CU-28; RF-17 → CU-08, CU-17, CU-18, CU-20; RF-38 → CU-15 (solo purga) y CU-16 (A3, ciclo posterior); (f) RF-43 incorpora CU-12 (ACU-13).
> **Aserción de cierre (ACU-01).** La equivalencia **ficha ↔ matriz es bidireccional y es una aserción de RNF-01**: para cada uno de los 36 CU, el conjunto `{RF ∪ RNF ∪ RT ∪ RE}` declarado en su ficha §3 es **idéntico** al conjunto agregado en §2 y en §5; y para cada uno de los 50 RF, el conjunto de CU de esta matriz es **idéntico** al de las fichas que lo declaran. El incumplimiento de cualquiera de las dos direcciones es un defecto bloqueante del hito.

---

## 6. Requisitos del ciclo posterior (los 10 RF Should)

Se especifican en este documento —RNF-01 exige cubrir el 100 % de los RF, Must y Should— pero **quedan fuera del alcance comprometido del MVP (40 RF Must, con RF-50 incluido por P-18)** y son el primer recorte si el presupuesto se agota (`requerimientos.md` §4.5).

| RF | Requisito | CU | Razón de la postergación |
|---|---|---|---|
| RF-06 | Eliminar cuenta importada | CU-06 | Cierra el ciclo de RF-05 (Must) pero no es necesario para operar: la cuenta importada es funcional desde el momento en que se añade. |
| RF-12 | Hint interactivo con la frase de Anvil | CU-02 (A1) | Comodidad del **Perfil A** (estudiante/autor); el Perfil B puede pegar la frase manualmente. No aporta capacidad nueva. |
| RF-32 | Historial de logs persistente al reset | CU-29, CU-30 | La observabilidad Must (RF-28..RF-31) ya funciona; lo postergable es la exención del reset y el límite de 500 entradas. |
| RF-34 | UI en español con formato de 4 decimales y direcciones abreviadas | CU-10 | RT-10 (idioma) es transversal y barato; el formato fino (4 decimales, `0x1234…abcd`) puede llegar después sin bloquear ningún flujo. |
| RF-38 | Badge contador de solicitudes pendientes | CU-16 (A3) | Mejora de visibilidad: la cola persistida (RF-37, Must) funciona sin badge. CU-16/A3 ya define su regla de conteo para cuando se implemente. **P-17:** se retira del oráculo del MVP; la única mención en CU-15 es la operación de purga (no cubre el RF). |
| RF-39 | Notificaciones de Chrome | CU-16 (A3) | Requiere el permiso `notifications`; la solicitud es visible sin él al abrir el popup. Depende de una API de plataforma con comportamiento variable. |
| RF-40 | Timeout de 120 s (firma) y 60 s (conexión) | CU-15 | Es la deuda técnica más delicada (dueño único del plazo en el SW + `chrome.alarms`); se especifica ya porque **RNF-08 es Must** y sin plazo ninguna solicitud pendiente puede cerrarse de forma determinista. |
| RF-44 | EIP-6963 (descubrimiento de provider) | CU-22 | El provider por `window.truekeate`/`window.codecrypto` (RF-13, Must) ya cubre la detección; EIP-6963 añade interoperabilidad con dApp multi-wallet. |
| RF-47 | Historial de operaciones en la dApp | CU-23 | La dApp Must (RF-46) ya muestra el resultado de cada flujo; solo falta el histórico acumulado y el JSON completo. |
| RF-48 | Pantalla «Acerca de» con logotipo y tagline | CU-33 | Aportación de identidad visual sin correspondencia en el enunciado; la aplicación de la identidad (RF-49, Must) sí es MVP. |

---

## 7. Matriz de actores → CU

> **Regenerada desde las 36 fichas de §3 (ACU-01/ACU-12).** «Primario» = el actor cuyo objetivo persigue el CU; **exactamente un actor primario por CU**. Los disparadores alternos de otros actores se modelan como flujos `A#` dentro de la ficha y **no** convierten a ese actor en primario.
> La notación de rango (`CU-01 … CU-14`) es cerrada: incluye todos los CU del intervalo salvo los que se excluyan expresamente en la misma celda.

| Actor | CU donde es **primario** | CU donde es secundario/sistema |
|---|---|---|
| **Usuario (dueño de la cartera)** | CU-01, CU-02, CU-03, CU-04, CU-05, CU-06, CU-07, CU-08, CU-09, CU-10, CU-11, CU-12, CU-13, CU-14, CU-19, CU-24, CU-26, CU-30, CU-32, CU-33, CU-34, CU-35 | CU-15, CU-16, CU-17, CU-18, CU-20, CU-21, CU-23, CU-25 (solo en su flujo A1, alta desde el popup), CU-27, CU-28, CU-29, CU-31, CU-36 |
| **dApp de terceros** (`test.html`) | CU-17, CU-18, CU-22, CU-23, CU-25, CU-27, CU-28 | CU-11 … CU-16, CU-19, CU-24, CU-26, CU-29, CU-31, CU-36 |
| **dApp no autorizada** (adversario) | CU-20 | — |
| **dApp hostil** (adversario) | CU-21 | CU-23 (banco de pruebas de escenarios negativos) |
| **Service Worker (background)** | CU-15, CU-16, CU-29, CU-31 | CU-01 … CU-14, CU-17 … CU-28, CU-30, CU-32 … CU-35 |
| **UI de la extensión** (popup / connect / notification) | — | CU-01 … CU-36 |
| **Nodo RPC local (Anvil)** | — | CU-10, CU-11, CU-12, CU-15, CU-16, CU-17, CU-23, CU-24, CU-25, CU-27, CU-31 |
| **Navegador Chrome/Edge (plataforma)** | — | CU-08, CU-11 … CU-16, CU-18, CU-19, CU-20, CU-21, CU-22, CU-23, CU-24, CU-25, CU-26, CU-27, CU-29, CU-31, CU-35, CU-36 |
| **Docente/evaluador** | CU-36 | CU-23, CU-33 |
| **Responsable de seguridad (autor)** | — | CU-07, CU-21, CU-30 |
| **Titular de los activos de marca y fuentes** | — | CU-33, CU-36 |

**Cuadre con §2 (ACU-01).** El reparto de actores primarios de esta matriz es **idéntico**, CU por CU, a la columna «Actor primario» del índice §2: 36 CU, 36 asignaciones primarias, sin ningún CU con dos actores primarios ni con cero. Los dos perfiles adversarios (dApp no autorizada, dApp hostil) siguen siendo los actores primarios de CU-20 y CU-21.

**Cobertura mínima exigida:** Usuario ✔ · dApp de terceros ✔ · Service Worker ✔ · Nodo RPC local Anvil ✔ · Navegador Chrome/Edge ✔ · **dApp no autorizada** ✔ (CU-20) · **dApp hostil** ✔ (CU-21) · Docente/evaluador ✔ (CU-36).

---

## 8. Criterios de aceptación no funcionales transversales (RNF/RT aplicables a todos los CU)

Estos criterios aplican a **todos** los CU y no se repiten en cada ficha. Cada fila es un criterio con su evidencia.

### 8.1 Requisitos no funcionales

| RNF | Criterio verificable (EARS / Gherkin) | CU donde se ejercita | Evidencia |
|---|---|---|---|
| RNF-01 | *El sistema deberá* tener el 100 % de sus RF (Must y Should) cubiertos por un `CA-RF-xx` y por al menos un CU. | Todos | `Inspección: §5 y §6 de este documento; 0 RF huérfanos` |
| RNF-02 | *Mientras* el estado sea «frío» (SW detenido y sin popup), el popup *deberá* renderizar en **< 800 ms** (percentil 95 sobre ≥ 10 ejecuciones) y `eth_getBalance` responder en **< 1,5 s**. **«En caliente» (ACU-22) = Service Worker ya arrancado, bundle en caché y 10 repeticiones; el estadístico es la mediana**: `notification.html` y `connect.html` *deberán* abrir en **< 500 ms**. | CU-08, CU-10, CU-13, CU-17 | `E2E: 10-aprobar-tx.spec.ts y 09-conectar.spec.ts — aserción sobre performance.getEntriesByName('notification-open')/('connect-open') (mediana de 10 repeticiones < 500 ms; popup: percentil 95 < 800 ms)` + artefacto `RepoTecnico/perf/popup-<fecha>.json` |
| RNF-03 | *El sistema deberá* ejecutar exactamente **1 llamada RPC por cuenta visible por ciclo de 5 s**, verificado con contador instrumentado y no por inspección visual. | CU-10 | `Vitest: polling.spec.ts — contador RPC` |
| RNF-04 | *El sistema deberá* cargar y funcionar en **Chrome ≥ 114** y **Edge ≥ 114** sin `manifest_version: 2`. | CU-36 | `Inspección: carga en chrome://extensions y edge://extensions` |
| RNF-05 | Toda solicitud *deberá* ser aprobable o rechazable en **≤ 2 clics**, mostrando origen, destino, valor, red, comisión estimada y —en llamadas a contrato— el calldata decodificado. | CU-11 … CU-14, CU-17, CU-27 | `E2E: 10-aprobar-tx.spec.ts` (conteo de clics y aserción sobre nodos del DOM) |
| RNF-06 | Todo error *deberá* ser un objeto EIP-1193 con `code` numérico y `message` en español con causa y acción sugerida, según la tabla cerrada §2.1 de `requerimientos.md`. | Todos (X-10) | `Vitest: errors.spec.ts` (contrasta los 8 códigos con §2.1) |
| RNF-07 | *Si* el RPC no responde, *el sistema deberá* reintentar **máx. 3 veces con backoff ×2 (1 s / 2 s / 4 s)**, timeout de **5 s por intento**, mostrar «desconectado» y dejar el storage intacto y la UI interactiva. | CU-31 | `Vitest: rpcRetry.spec.ts` + `E2E` con Anvil detenido |
| RNF-08 | *Cuando* el SW se reinicie, *el sistema deberá* reconstruir `Record<approvalId, PendingRequest>` desde `chrome.storage.local` en **< 1 s** sin dejar solicitudes huérfanas. | CU-08, CU-15, CU-16, CU-18 | `Vitest: approvalReconcile.spec.ts` + `E2E` «stop service worker» con `performance.now()` |
| RNF-09 | *El sistema deberá* mantener la clave privada y el mnemonic fuera de la página y de los logs, y redactar los payloads firmados (solo hash y longitud en `personal_sign`/`eth_signTypedData_v4`; `to`, `value`, `dataLength` y selector en `eth_sendTransaction`). | CU-03, CU-07, CU-21, CU-27, CU-28, CU-29 | `Vitest: logRedaction.spec.ts` (0 coincidencias de mnemonic, clave o payload íntegro) + `Inspección: mensajes del content script` |
| RNF-10 | *El sistema deberá* validar `source`/`origin` en el canal externo y `sender.id` + allowlist de rutas y métodos internos en el canal interno, con `targetOrigin = location.origin` y `setAccessLevel('TRUSTED_CONTEXTS')`. | CU-20, CU-21 | `Inspección: código` + test negativo de iframe hostil + `Vitest: eip1193.spec.ts` |
| RNF-11 | Una dApp no autorizada *deberá* recibir `[]` en `eth_accounts` y `4100` en métodos sensibles. | CU-18, CU-20 | `Vitest: accounts.spec.ts — RNF-11` + `E2E: 09-conectar.spec.ts` (test negativo) |
| RNF-12 | *El sistema deberá* exigir aprobación explícita del Usuario para toda transacción o firma; *nunca deberá* firmar en silencio. | CU-11 … CU-14, CU-27, CU-28 | `Inspección: handleRPCRequest` + `E2E: 10-aprobar-tx.spec.ts` |
| RNF-13 | *Cuando* se ejecute `tsc -b`, *el sistema deberá* compilar en TypeScript `strict: true` sin `any` implícitos. | CU-36 | `Comando: npx tsc -b` |
| RNF-14 | React *deberá* ser UI sin criptografía y el Service Worker *deberá* concentrar criptografía y RPC (`ethers` solo en background). | CU-36 | `Inspección: revisión de imports` + `Comando: grep -rn "from 'ethers'" src/popup src/components` (0 coincidencias) |
| RNF-15 | «Build limpio» = `npm ci && npm run build` con **exit 0**, cero errores de tipos y solo los warnings permitidos, en Windows **y** en Linux (WSL2 o CI `ubuntu-latest`). | CU-36 | `Comando: npm ci && npm run build` en ambos entornos |
| RNF-16 | *El sistema deberá* producir **exactamente 1 entrada** por evento del catálogo cerrado de 23 tipos, con `ts`, `level` y `origin`, en `chrome.storage.local`, exportable en JSON y sin claves ni payloads íntegros. | CU-29 | `Vitest: logger.spec.ts` + aserción sobre `chrome.storage.local` tras la suite E2E completa |
| RNF-17 | Cobertura de **ramas** con `@vitest/coverage-v8`: **≥ 70 % global** y **≥ 80 %** en `src/background/crypto/`, `src/background/approvals/` y `src/shared/validation/`. | CU-36 | `Comando: npm run test -- --coverage` |
| RNF-18 | *El sistema deberá* consumir todos los colores, tipografías y degradados de `src/styles/tokens.css`: **0** literales de color, **0** familias tipográficas literales y **0** degradados fuera de tokens. | CU-33, CU-34 | `Comando: grep -rnE "#[0-9a-fA-F]{3,8}\|rgb\(\|hsl\(\|linear-gradient\|radial-gradient\|font-family:" src --exclude=tokens.css --include=*.css --include=*.tsx --include=*.ts` → 0 coincidencias (**ACU-09**: alcance cerrado y patrones de degradado y familia tipográfica incluidos) |
| RNF-19 | *El sistema deberá* cumplir la matriz cerrada de contraste de `identidad_visual.md` §2.4 (≥ 4,5:1 texto normal; ≥ 3:1 foco y componentes); el teal `#3E93A6` solo como texto ≥ 18 px y el oro `#C9A97F` **solo decorativo**. | CU-33, CU-34, CU-35 | `Vitest: contrast.spec.ts — lee tokens.css y recalcula la matriz` + `Vitest: goldUsage.spec.ts — ACU-23: falla si un nodo cuyo color computado resuelve a --tk-gold-500 contiene texto, excluyendo SVG con aria-hidden` |
| RNF-20 | *El sistema deberá* servir activos y fuentes desde el propio paquete (`public/brand/`, `public/fonts/`), sin peticiones a CDN en runtime. | CU-22, CU-33, CU-36 | `Inspección: bundle y peticiones de red del popup` |
| RNF-21 | *El sistema deberá* permitir ejecutar las acciones críticas solo con teclado, con foco visible ≥ 3:1, roles/etiquetas ARIA, sin pérdida de contenido al 200 % de zoom y con `prefers-reduced-motion` respetado; `axe-core` con **0 violaciones** A/AA. | CU-13, CU-32, CU-34, CU-35 | `E2E: 24-accesibilidad.spec.ts` + `axe-core` + `Vitest: contrast.spec.ts` |
| RNF-22 | *El sistema deberá* revelar mnemonic y claves solo tras confirmación explícita, exigir confirmación destructiva que enumere las cuentas importadas en el reset y mostrar «wallet dañada» ante corrupción BIP-39/EIP-55. | CU-01, CU-02, CU-04, CU-07, CU-30 | `E2E: 25-recuperacion.spec.ts` + `Vitest: integrity.spec.ts` |
| RNF-23 | *El sistema deberá* mostrar el aviso no descartable «entorno de desarrollo — no usar con fondos reales» en el primer arranque, en «Acerca de» y antes de la primera firma, registrar la aceptación en `truekeate_settings`, advertir al dar de alta una red con `isTestnet: false` y distribuir `LICENSE`, `NOTICE` y los `LICENSE-*.txt` OFL-1.1. | CU-01, CU-25, CU-33, CU-36 | `E2E: 26-avisos.spec.ts` + `Comando: git ls-files` con `LICENSE`, `NOTICE` y los 3 `LICENSE-*.txt` |
| RNF-24 | *El sistema deberá* fijar las versiones de `ethers`, React y Vite con `package-lock.json` versionado, declarar y verificar el rango de Foundry `>=1.0.0 <2.0.0` antes de la suite E2E y revisar la compatibilidad MV3 en cada actualización mayor. | CU-36 | `Comando: npm ci && npm run build` reproducible en dos equipos + `Comando: anvil --version` |
| RNF-25 | *El sistema deberá* devolver el hash al difundir, reflejar `pending → confirmed`/`failed`, bloquear el envío con error tipado si `estimateGas` falla, mostrar el motivo del revert y soportar `eth_getTransactionReceipt`. | CU-11, CU-12, CU-13, CU-23, CU-27 | `Vitest: txContract.spec.ts` + `E2E: 04-enviar.spec.ts` con recibo `status 1` |

### 8.2 Requisitos técnicos y restricciones

| RT/RE | Criterio verificable | CU | Evidencia |
|---|---|---|---|
| RT-01 | *El sistema deberá* construir su UI y su build solo con React 19, TypeScript 5.9 y Vite 7. | CU-36 | `Comando: npm ls react typescript vite` |
| RT-02 | *Mientras* se realicen operaciones de mnemonic, HD, firma, provider o serialización, *el sistema deberá* usar únicamente `ethers.js v6`. | CU-01, CU-04, CU-27, CU-28 | `Comando: npm ls ethers` + `Comando: grep -rn "from 'ethers'" src/popup src/components` (0 coincidencias) |
| RT-03 | *Si* el código propio incluye `viem`, `@scure/bip39`, `@metamask/*`, `axios` o `fetch` directo, *entonces* el lint fallará el build. | CU-21, CU-36 | `Comando: npm run lint:prohibited` |
| RT-04 | *El sistema deberá* generar `manifest.json` MV3 con Service Worker `type: module`, content script e inject script; *si* un permiso no se usa, no se declarará; el alta de red sin permiso de host se rechazará con error tipado. | CU-21, CU-25, CU-36 | `Vitest: manifest.spec.ts` + `Inspección: dist/manifest.json` |
| RT-05 | *Cuando* se ejecute `npm run build`, *el sistema deberá* generar `manifest.json` desde `src/manifest.ts` e incluir el bundle de ethers localmente, sin URLs de CDN. | CU-36 | `Comando: npm run build` + `grep` de `http` en `dist/` |
| RT-06 | *Mientras* Anvil escuche en `127.0.0.1:8545`, *el sistema deberá* responder `eth_chainId = 0x7a69` y no tener Sepolia entre las redes dadas de alta. | CU-10, CU-24 | `Comando: cast chain-id --rpc-url http://127.0.0.1:8545` + `E2E: 07-provider.spec.ts` |
| RT-07 | *El sistema deberá* pasar `npm run test`, `npm run test:e2e` y `forge test` antes de cerrar cada hito. | CU-36 | `Comando: los tres scripts` |
| RT-08 | *Cuando* se ejecute `tsc -b`, *el sistema deberá* compilar con `@types/chrome` y `@types/node` y sin `any` implícitos. | CU-36 | `Comando: npx tsc -b` |
| RT-09 | *El sistema deberá* distribuirse 100 % en local: artefacto `dist/` y dApp en `http://localhost:5174`; *no deberá* existir despliegue remoto. | CU-23, CU-36 | `Inspección: dist/ y vite.config.ts (port 5174, strictPort)` |
| RT-10 | *El sistema deberá* escribir UI, mensajes de error y documentación en español y los identificadores de código en inglés. | CU-10, CU-32, CU-34 | `Comando: grep -rnE "TODO|FIXME" src` (0 coincidencias de literales de UI en otro idioma) + `E2E: 17-i18n.spec.ts` |
| RT-11 | *Cuando* `forge test` verifique una firma EIP-712 producida por la cartera, `verify` *deberá* devolver `true`; *si* se altera un byte, `false`. | CU-27 | `Comando: forge test --match-contract EIP712VerifierTest` |
| RT-12 | *El sistema deberá* servir los activos en `public/brand/`, los iconos en `public/icons/` y las fuentes woff2 latin en `public/fonts/` con sus `LICENSE-*.txt` OFL-1.1. | CU-33, CU-36 | `Inspección: árbol public/ + LICENSE/NOTICE` |
| RT-13 | *El sistema deberá* exponer `window.truekeate` con el alias `window.codecrypto` (mismo objeto), usar el prefijo `truekeate_` y los tipos `TRUEKEATE_*`, y publicar el `rdns` declarado en RT-13. | CU-22 | `Vitest: naming.spec.ts` + `Comando: grep -rn "codecrypto_" src/` (0 coincidencias) |
| RE-01 | *El sistema deberá* operar sin backend: ninguna petición sale hacia un servicio propio. | CU-23, CU-36 | `Inspección: análisis de red del popup` |
| RE-02 | *Mientras* el modo desarrollo esté activo, *el sistema deberá* avisar de que no se usen fondos reales. | CU-01, CU-33 | `E2E: 26-avisos.spec.ts` |
| RE-03 | *El sistema deberá* abstenerse de hacer `push`: solo con la orden explícita `/push`. **Restricción de proceso, no observable en tiempo de ejecución (ACU-11): no tiene CU**; se verifica por historial de comandos. | *(sin CU — ver §9, hueco 12)* | `Inspección: historial de comandos del repositorio (no debe existir ningún git push sin la orden /push)` |
| RE-04 | *El sistema deberá* usar CORS con allowlist concreta en Anvil (`chrome-extension://<ID>,http://localhost:5174,http://127.0.0.1:5174`), nunca `*`, y escuchar solo en `127.0.0.1`. | CU-10, CU-24, CU-31, CU-36 | `Comando: anvil --http.corsdomain <lista>` + `Inspección: --host 127.0.0.1` |

---

## 9. Cobertura y huecos conocidos

**Lo que este documento cubre.** Los **50 RF** (`40 Must` —incluido **RF-50**, P-18— + `10 Should`) con al menos un CU cada uno; los 25 RNF y los 13 RT; **RE-01 … RE-04**; los 4 actores exigidos más los dos perfiles adversarios; y los 25 temas mínimos enumerados en el encargo, cada uno con un CU propio (creación, importación por frase y por clave privada, derivación, renombrado, recibo con QR, envío externo, transferencia interna, conexión con selección de cuenta, persistencia por origen, revocación, saldo y polling, cambio y alta de redes, EIP-712, `personal_sign`, aprobación con vista previa decodificada, rechazo, expiración, concurrencia con FIFO, reset, logs, propagación de eventos, manifestación del provider con alias y EIP-6963, RPC caído, UI de marca y estados de error).

**Casos de uso DERIVADOS (no provienen de un RF).** Son **CU-35** (recorrido solo con teclado) y **CU-36** (instalación desde `dist/` y build limpio). Se derivan de RNF-21/RNF-19 y de RNF-04/RNF-13/RNF-14/RNF-15/RNF-17/RNF-20/RNF-23/RNF-24 + RT-01 … RT-13 respectivamente; no se inventó ningún RF para justificarlos. **CU-07 dejó de ser DERIVADO en la v1.1**: queda respaldado por **RF-50 (Must)** con `CA-RF-50` (P-18).

**Huecos declarados (no se crea requisito nuevo; se anota aquí).**

1. **`RF-50` y su `CA-RF-50` están en curso en `requerimientos.md`.** Este documento **referencia** el requisito (CU-07 y §5) y **no lo define**, conforme a P-18. Hasta que `requerimientos.md` lo publique, el total de RF Must es **40** contando RF-50; el recuento de §2 y §5 se actualizará en el mismo turno en que el requisito se publique con su `CA-RF-50`.
2. **Cierre de ACU-03 / D-A (EIP-6963).** El literal vinculante es el de `requerimientos.md` **RT-13**: `name: "TrueKeate"` y `rdns: "academy.codecrypto.truekeate"`. CU-22 lo escribe literalmente y su criterio exige ese `rdns` exacto. **Este hueco queda cerrado**: el diccionario v1.3 debe alinearse a RT-13, y la divergencia deja de bloquear la Fase 3.
3. **Badge y notificaciones fuera del MVP (P-17).** El oráculo del MVP de CU-16 es «2 entradas `pending` en `truekeate_pending_requests` + como máximo 1 transacción en vuelo por cuenta». El **badge (RF-38)** y las **notificaciones (RF-39)** se verifican en el **ciclo posterior**; `CA-RF-38` se retira del oráculo de CU-15 (queda solo como operación de purga). Con esto, el alcance comprometido del MVP no depende de dos requisitos Should.
4. **Control de tasa y cardinalidad sin RF.** `pendingRequestsMax = 8`, `pendingRequestsMaxPerOrigin = 1` y `pendingRequestsPerMinute = 6` son decisiones de datos (§2.8/§2.10 del diccionario) que CU-16 verifica, pero no hay RF que los exija; el enunciado solo pide la cola (RF-37).
5. **`truekeate_settings.logMaxPerOrigin = 200` y la exportación de logs en JSON** no tienen RF propio: se verifican dentro de CU-29 como parte de RNF-16.
6. **Caducidad de sesión sin RF propio (ACU-17/D-B).** `truekeate_connected_sites.lastUsedAt`/`expiresAt` y `truekeate_settings.sessionTtlMs = 86400000` no tienen RF exclusivo: la caducidad (24 h renovables en cada uso) se **incorpora a RF-25** y CU-18 la verifica con criterio y evidencia propios. **Hueco cerrado.**
7. **Aviso de copia y contexto fuera de EIP-1193 (ACU-05/D-E).** El aviso «No se pudo copiar…» de CU-09/E1 es un aviso de UI con causa propia, no un error EIP-1193: no hay llamada al provider que devolver. La tabla §2.1 ampliada a un mensaje por causa sí cubre todos los errores del provider (`code` obligatorio en todo error que vea el usuario).
8. **Modo oscuro** aparece en `identidad_visual.md` §5.3 y en la matriz de contraste, pero no tiene RF ni RNF propio ni CU dedicado; CU-34/E1 lo menciona como variante de los pares de contraste.
9. **`wallet_revokePermissions` desde una dApp**: el catálogo del diccionario lo admite desde página o popup, mientras RF-26 lo describe solo desde el popup. CU-19 cubre ambos caminos; la ambigüedad de alcance queda declarada aquí.
10. **Verificación en Linux (RNF-15) y CI**: este documento no puede cerrarla (es una ejecución, no una especificación). CU-36 define el criterio y la marca «verificado solo en Windows; pendiente en Linux» si no hay WSL2/CI.
11. **`rmwLock`, `fifoByAccount` y `portsByApprovalId` (ACU-28): contrato observable ya especificado.** La v1.0 los presentaba como pertenecientes a un `documento_tecnico.md` pendiente; en realidad **ya son criterio de aceptación de CU-16** (una transacción en vuelo por cuenta, puerto de larga vida con `RESUME` y read-modify-write serializada). Lo que queda para `documento_tecnico.md` son **solo los detalles internos de implementación** (estructura de las colas, granularidad del lock, secuencia exacta de mensajes), no el comportamiento exigible. **Hueco reclasificado.**
12. **RE-03 (no hacer `push`) — restricción de proceso sin CU (ACU-11).** No es observable en tiempo de ejecución: se verifica por **historial de comandos** y se declara así en §8.2 en lugar de dejarla sin cobertura aparente.
13. **Revelado de material de recuperación y catálogo de eventos (ACU-04).** `truekeate_logs` gana el campo `event` (enum de los 23 nombres) separado de `category`; CU-07 registra su traza con `event: approval_resolved` porque el catálogo cerrado de §2.2 de `requerimientos.md` **no incluye un evento específico de revelado**. Si el catálogo incorpora uno (`secret_revealed` o equivalente), CU-07 deberá adoptarlo en el mismo turno.
14. **`videos`, ZIP de entrega, `README.md` e `INSTRUCCIONES.md`** son entregables de la fase de manuales (`requerimientos.md` §4.2). **CU-36 ya los verifica** con criterio Gherkin explícito de README / INSTRUCCIONES / JSDoc y evidencia `Inspección:` (ACU-15), cubriendo los 10 puntos de «Documentación» de la rúbrica.
15. **Los números de caso de prueba (`*.spec.ts`, flujos `E2E`) citados como evidencia** son los declarados por `requerimientos.md` v1.4 más los specs nuevos incorporados en la v1.1 (`windowContract.spec.ts`, `windowRediscovery.spec.ts`, `approvalResume.spec.ts`, `connectRequest.spec.ts`, `goldUsage.spec.ts`, `loggerRetry.spec.ts`, `rpcRetry.spec.ts`, `27-rpc-caido.spec.ts`). Si en la Fase 3 se renombran, deberá actualizarse la columna de evidencia de este documento en el mismo turno.

---

> **Trazabilidad completa:** `E-xx → RF-xx → CA-RF-xx → CU-xx → test`, con los CUs de este documento como eslabón `CA/CU` de la matriz única que exige RNF-01 (`requerimientos.md` §9.4).
> **Regla de mantenimiento (ACU-01).** §2, §5 y §7 se **regeneran** desde las 36 fichas de §3 en el mismo turno en que se modifique cualquier trazabilidad. La equivalencia bidireccional ficha ↔ matriz es una **aserción de RNF-01**: si una matriz y una ficha discrepan, el defecto es bloqueante.

---

## Historial de cambios

### v1.1 — cierre de los 30 hallazgos ACU-01 … ACU-30

Origen: `RepoTecnico/casos_uso/AUDITORIA_CASOS_USO_V1.md` (30 hallazgos: 2 críticos, 9 altos, 17 medios y 2 bajos) y las decisiones **D-A … D-G** y **P-17 … P-19**. **Los 30 hallazgos quedan cerrados.**

| ACU | Sev. | Qué se cambió en la v1.1 |
|---|---|---|
| ACU-01 | 🔴 | Se fija la regla **«la ficha declara, la matriz agrega»** (convención 7) y se **regeneran §2, §5 y §7** desde las 36 fichas. RF-10 → CU-04, CU-05, CU-08, CU-18, CU-24, CU-26; RF-24 → CU-19; RF-27 → CU-26; RF-49 → CU-09; RF-14 → CU-14, CU-20, CU-21, CU-28; RF-17 → CU-08, CU-17, CU-18, CU-20; RF-38 → CU-15 (purga) + CU-16/A3; RF-43 → CU-12; RNF-02, RNF-18, RNF-19 y RT-11 incorporados al índice. **Aserción de cierre:** la bidireccionalidad ficha ↔ matriz es una aserción de **RNF-01**. |
| ACU-02 | 🔴 | Política RPC reescrita a **«1 intento inicial + 3 reintentos = 4 llamadas RPC»**, esperas observadas 1/2/4 s y timeout 5 s por intento, con contador sobre provider falso; CU-31, su EARS, su evidencia, su A1/E1/E2 y RNF-07 y X-04 alineados. |
| ACU-03 | 🟠 | **D-A:** el `rdns` se escribe **literal** en CU-22 (`name: "TrueKeate"`, `rdns: "academy.codecrypto.truekeate"`) con su bloque JSON y su criterio; **hueco 2 de §9 cerrado** (el de la v1.0 pasa a ser el hueco 2 actual). |
| ACU-04 | 🟠 | **D-D:** `truekeate_logs` usa el campo **`event`** (23 nombres) separado de `category`; CU-04 (retira `system`), CU-07, CU-19, CU-27, CU-28 y CU-29 corregidos; §9 gana el hueco 13. |
| ACU-05 | 🟠 | **D-E:** todos los CU se alinean a la tabla §2.1 **ampliada a un mensaje por causa**; CU-03/A1 y CU-06/E1 citan su causa; **CU-30/E1 recibe `code: -32603`**; CU-09/E1 se declara aviso de UI con causa propia (§9, hueco 7). |
| ACU-06 | 🟠 | **D-F:** CU-05 persiste las etiquetas de cuentas derivadas en **`truekeate_settings.accountLabels: Record<indice, string>`**, con criterio y evidencia propios. |
| ACU-07 | 🟠 | **P-17:** el oráculo del MVP de CU-16 se limita a «2 entradas `pending` + 1 transacción en vuelo por cuenta»; badge (RF-38) y notificaciones (RF-39) pasan al ciclo posterior; **`CA-RF-38` se retira del oráculo de CU-15** (queda como purga). |
| ACU-08 | 🟠 | `Entonces` no observables sustituidos: «el puerto mantiene vivo el SW» → **`RESUME` con el `approvalId` responde en < 200 ms tras 30 s** (CU-16); «la UI sigue aceptando interacción» → **botón «Reintentar» habilitado + recorrido con `Tab` + `axe-core`** (CU-31); «sin errores» al cargar `dist/` → **0 errores en consola y 0 en el badge de errores de `chrome://extensions`** (CU-36, flujo principal y criterio de instalación). |
| ACU-09 | 🟠 | El `grep` de RNF-18 pasa a `grep -rnE "#[0-9a-fA-F]{3,8}\|rgb\(\|hsl\(\|linear-gradient\|radial-gradient\|font-family:" src --exclude=tokens.css --include=*.css --include=*.tsx --include=*.ts` (alcance cerrado y patrones de degradado y familia tipográfica incluidos), en CU-33 y en §8.1. |
| ACU-10 | 🟠 | Se añade bloque Gherkin **falsable y con evidencia** a los 5 flujos alternativos huérfanos: **X-03** (X-03 tiene su bloque en CU-16/E3), **CU-11/E3** (2 llamadas a `eth_sendRawTransaction` con recálculo de `nonce`), **CU-29/E1** (reintento de escritura y traza), **CU-15/E1** (re-descubrimiento de ventana con `chrome.windows.getAll`), **CU-22/E1** (provider preexistente). Nuevos specs citados en cada caso. |
| ACU-11 | 🟡 | **RE-03** se declara como **restricción de proceso verificada por historial de comandos, sin CU** (§8.2 y §9, hueco 12); el índice §2 incorpora **RNF-02, RNF-18, RNF-19 y RT-11**; CU-36 declara RE-01/RE-04 en su trazabilidad. |
| ACU-12 | 🟡 | **Un único actor primario por CU.** CU-17, CU-23, CU-24, CU-25, CU-31 y CU-29 reasignados (dApp, dApp, Usuario, dApp, Service Worker y Service Worker respectivamente) con nota de **deslinde**; el disparador alterno se modela como flujo `A#`; §2 y §7 regeneradas y **CU-05/CU-06 aparecen ya en §7**; §1 coherente con §7. |
| ACU-13 | 🟡 | **Deslinde explícito CU-11 / CU-12 / CU-13** (dApp, popup y ventana de aprobación) y **RF-43 añadido a CU-12** con su `CA-RF-43` y evidencia `eip155.spec.ts`. |
| ACU-14 | 🟡 | **P-18:** CU-07 entra en el MVP con **RF-50 (Must) y `CA-RF-50`**; deja de ser DERIVADO; §5 lo asigna y §9, hueco 1 declara que el requisito está en curso en `requerimientos.md`. |
| ACU-15 | 🟡 | CU-36 gana **tres bloques Gherkin explícitos** de README (4 puntos), INSTRUCCIONES (3 puntos) y JSDoc (3 puntos) = los 10 puntos de «Documentación» de la rúbrica, con evidencia `Inspección:` y `Comando: grep` de JSDoc. |
| ACU-16 | 🟡 | **P-19:** `wallet_switchEthereumChain` **requiere aprobación cuando la red no es la activa**: CU-24 crea la entrada `pending`, abre `notification.html` y **solo tras la aprobación** cambia la red y emite `chainChanged`; caso «ya es la activa» sin aprobación (A2) y rechazo con `4001` (A4). |
| ACU-17 | 🟡 | **D-B:** la **caducidad de sesión de dApp** (24 h **renovables**, `expiresAt = lastUsedAt + 86400000`) se incorpora a **RF-25**; CU-18 añade precondición, postcondición, dos criterios Gherkin y su delta; §9, hueco 6 cerrado. |
| ACU-18 | 🟡 | El foco real de `notification.html` se sustituye por el **contrato de apertura observable**: espía sobre `chrome.windows.create({ focused: true, type: 'popup' })` y `chrome.windows.update(id, { focused: true })`, con evidencia `windowContract.spec.ts`. |
| ACU-19 | 🟡 | Las **seis restricciones de sistema** escritas como Gherkin pasan a **EARS**: CU-01 (arranque del SW), CU-08 (SW dormido), CU-13 (confirmación), CU-24 (Anvil escuchando), CU-33 (inspección de encabezados y estilos) y CU-35 (reducción de movimiento); el `Inspección:` queda como evidencia, no como `Cuando`. |
| ACU-20 | 🟡 | **13 bloques con 2+ `Cuando`/`Entonces` divididos** en escenarios independientes y **25 `Pero` condicionales** convertidos a **segundo escenario** o a **`Ejemplos:` (Scenario Outline)** en CU-01 … CU-17, CU-21, CU-24 … CU-30, CU-32 y CU-33; la conjugación de las aserciones se normaliza a primera persona. |
| ACU-21 | 🟡 | Oráculos tautológicos reescritos: «nunca supera 500» → **con 500 entradas insertadas se conservan exactamente las 500 más recientes por `ts`** (CU-29); «reconciliación < 1 s con 1 pendiente» → **con 50 `pending`, el scrapeo completo < 1000 ms con reloj inyectado** (CU-08). |
| ACU-22 | 🟡 | RNF-02 define **«en caliente»** (SW arrancado, bundle en caché, 10 repeticiones, **mediana**) y la evidencia pasa a `E2E:` con aserción sobre `performance.getEntriesByName(...)` y artefacto JSON; CU-08 corregido. |
| ACU-23 | 🟡 | RNF-19 suma un **test de uso** del oro: `goldUsage.spec.ts` falla si un nodo cuyo color computado resuelve a `--tk-gold-500` contiene texto (excluye SVG con `aria-hidden`); citado en CU-34 y §8.1. |
| ACU-24 | 🟡 | Postcondiciones sin criterio resueltas: CU-23 fija el umbral de **5000 ms** medido con `performance.now()` y CU-33 mide la tagline con `getComputedStyle` (Poppins 600, `letter-spacing: 0.14em`, token `--tk-navy-800`, degradado a 72 px, marca de agua al 18 %). |
| ACU-25 | 🟡 | **Claves canónicas con prefijo** en todo el documento: `truekeate_networks`, `truekeate_settings`, `truekeate_logs`… (`settings.*` y `networks.*` eliminados); convención 8. |
| ACU-26 | 🟡 | **D-C:** el literal de build es **`npm ci && npm run build`** en todo el corpus; los CU dejan de copiar los `CA-RF-xx` y pasan a **referenciarlos + declarar su delta propio** (CU-07, CU-12, CU-18, CU-22, CU-25, CU-36); convención 4. |
| ACU-27 | 🟡 | **D-G:** el alta de red solicita **siempre** el permiso de host en runtime, también desde el popup (CU-25/A1) con criterio propio; se elimina la excepción de la v1.0. |
| ACU-28 | 🟡 | El hueco 10 de §9 se reclasifica: `rmwLock`, `fifoByAccount` y `portsByApprovalId` **ya son criterio de aceptación de CU-16**; solo sus detalles internos quedan para `documento_tecnico.md`. |
| ACU-29 | 🔵 | Convención de evidencia unificada a `Vitest:` / `E2E: <spec> — <flujo>` / `Comando:` / `Inspección:`: **6 `Revisión:` eliminadas** (§8.2 y CU-25, CU-36) y las evidencias `E2E` sin spec/flujo completadas; convención 3. |
| ACU-30 | 🔵 | **CU-17 retirado de la precondición de CU-13**: la conexión vive en `truekeate_connect_request` y se aprueba en `connect.html`, no en `truekeate_pending_requests`/`notification.html`. |

**Estado tras la v1.1:** 36 CU · **sin CU nuevos ni eliminados** · los 50 RF (40 Must + 10 Should) con al menos un CU y **0 huérfanos** · §2, §5 y §7 idénticas entre sí · ningún criterio sin magnitud y sin evidencia de las cuatro formas admitidas.

