# 📑 Requerimientos — CodeCrypto Wallet (Extensión Chrome estilo MetaMask)

> **Fase:** 1 — Concepto · **Versión:** 1.1 · **Estado:** En entrevista (Bloque 1 resuelto; pendiente P-10 y Bloques 2-3)
> **Documento fuente:** `RepoTecnico/requisitos.md` (enunciado original) y `RepoTecnico/TAREA_PARA_ESTUDIANTE.md`.
> **Guía principal de desarrollo:** este archivo. Se actualiza de forma incremental durante todo el proyecto.

---

## 0. Resumen ejecutivo

Construir una **extensión de navegador Chrome/Edge (Manifest V3)** que funcione como **wallet Ethereum no custodial**, con las mismas capacidades básicas que MetaMask: creación/importación de cartera, gestión de múltiples cuentas, firma y envío de transacciones, firma de datos tipados (EIP-712) y un **provider inyectado (`window.codecrypto`)** que permita conectarse a una **dApp de pruebas** y operar contra una **red local de Foundry (Anvil)**, con posibilidad de añadir/cambiar redes.

| Aspecto | Definición |
|---|---|
| Tipo de sistema | Extensión de navegador (MV3) + dApp de pruebas (HTML/JS) |
| Blockchain objetivo | Ethereum (EVM), red local de pruebas |
| Red por defecto | `http://127.0.0.1:8545`, chainId `31337` (`0x7a69`) — **Anvil, sin Sepolia** (P-02) |
| Moneda nativa mostrada | ETH |
| Custodia | No custodial — las claves se derivan en el Service Worker |
| Cifrado de la semilla | **No** (modo desarrollo, sin contraseña) — P-03 |
| Usuarios | Usuario final (dueño de la wallet) y dApps de terceros |
| Duración estimada | ~40 h |

### 0.1 Antecedente: línea base existente (hallazgo de Fase 1)

El remoto `https://gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git` **ya contiene una implementación previa completa** en las ramas `main` y `chrome-wallet-DSH` (mismo commit `632d890`, "Initial commit"):

| Artefacto en el remoto | Tamaño | Observación |
|---|---|---|
| `src/App.tsx` | 23 KB | Popup de gestión de la wallet. |
| `src/background.ts` | 27 KB | Service Worker con derivación, firma y RPC. |
| `src/inject.ts` | 5 KB | Provider EIP-1193 + EIP-6963. |
| `src/content-script.ts` | 3 KB | Relay página ↔ extensión. |
| `src/Connect.tsx` / `src/Notification.tsx` | 9 KB / 7 KB | Páginas de conexión y confirmación. |
| `src/manifest.ts` | 2 KB | Manifest generado desde TypeScript. |
| `test.html` | 36 KB | dApp de pruebas. |
| `package.json`, `vite.config.ts`, `tsconfig*.json` | — | Build Vite 7 + React 19 + ethers 6.15. |
| `README.md`, `CHANGELOG.md`, `EIP1559_IMPLEMENTACION.md`, `FIX_DESCONEXION_SITIOS.md`, `RESUMEN_*.md` | — | Documentación del intento anterior. |
| `exportchatia.txt` (8,2 MB) y `user_messages.txt` | — | Exportaciones de conversación; **no deben versionarse** (ver DEC-07). |

**Implicación:** el proyecto **no es greenfield**. La Fase 1 debe decidir si esta línea base se adopta, se audita y se completa (opción recomendada), o si se reconstruye desde cero. Decisión registrada como **P-10**.

---

## 1. Requerimientos funcionales (RF)

Convención de identificadores: `RF-XX`. La columna **Fuente** indica el número del enunciado original (`E-n`) o `NUEVO` si proviene de la petición explícita del usuario en la entrevista. **Total: 47 RF.**

### 1.1 Core Wallet

| ID | Requerimiento | Fuente | Prioridad |
|---|---|---|---|
| RF-01 | **Generar** una frase semilla BIP-39 de 12 palabras usando exclusivamente `ethers.js v6`. | E-01 | Must |
| RF-02 | **Importar** una wallet a partir de una frase de recuperación de 12 palabras, validando checksum BIP-39 y normalizando espacios/mayúsculas. | E-01 | Must |
| RF-03 | **Carga sin contraseña**: al cargar/importar la frase, la wallet queda operativa de inmediato (modo desarrollo). | E-02 | Must |
| RF-04 | **Derivar cuentas HD** BIP-32/BIP-44 con ruta `m/44'/60'/0'/0/i` (5 cuentas por defecto, configurable). | E-01 | Must |
| RF-05 | **Importar cuenta por clave privada** (0x + 64 hex). La cuenta se añade a la lista, marcada como "importada" y con etiqueta editable. | **NUEVO** (usuario) | Must |
| RF-06 | **Eliminar cuenta importada** (las derivadas del mnemonic no se eliminan, solo se ocultan). | **NUEVO** (propuesto) | Should |
| RF-07 | **Recibir transferencias**: mostrar la dirección en formato completo + copiada al portapapeles + QR, y el saldo actualizado. | **NUEVO** (usuario) | Must |
| RF-08 | **Enviar transferencias** desde cualquiera de las cuentas de la wallet (interna o a direcciones externas) con estimación de gas y confirmación del usuario. | E-24 | Must |
| RF-09 | **Auto-carga**: al abrir el popup, si existe wallet en storage se restaura sin pedir la frase. | E-27 | Must |
| RF-10 | **Restaurar estado**: al reabrir, se restaura cuenta activa, red, cuentas importadas y sesiones de dApp. | E-28 | Must |
| RF-11 | **Reset wallet**: botón que limpia la cartera (mnemonic, cuentas, sesiones) y vuelve al formulario inicial. | E-21 | Must |
| RF-12 | **Hint interactivo**: la frase semilla de prueba de Anvil es clickeable y rellena el formulario. | E-22 | Should |

### 1.2 Provider inyectado y operaciones blockchain

| ID | Requerimiento | Fuente | Prioridad |
|---|---|---|---|
| RF-13 | Inyectar el provider EIP-1193 en `window.codecrypto` en **todas las páginas y frames** (`all_frames: true`, `document_start`). | E-03, E-09, E-33 | Must |
| RF-14 | Implementar `request({ method, params })` con manejo de errores estilo EIP-1193 (`code`, `message`). | E-03 | Must |
| RF-15 | Implementar `on()`, `removeListener()` y `emit` para `accountsChanged`, `chainChanged`, `connect`, `disconnect`, `message`. | E-03, E-10 | Must |
| RF-16 | `eth_requestAccounts`: abre la **página de conexión** para que el usuario elija qué cuenta compartir con esa dApp. | E-30, E-36 | Must |
| RF-17 | `eth_accounts`: devuelve la cuenta autorizada **sin volver a pedir permiso** si el origen ya está conectado; `[]` si no. | E-30 | Must |
| RF-18 | `eth_chainId`, `eth_getBalance`, `eth_blockNumber` como métodos de lectura soportados. | E-06, E-11 | Must |
| RF-19 | `eth_sendTransaction`: solicitar aprobación al usuario y luego **firmar y enviar** la transacción. | E-07 | Must |
| RF-20 | `eth_signTypedData_v4`: firmar datos estructurados EIP-712 mostrando `domain`, `types` y `message` en la confirmación. | E-08 | Must |
| RF-21 | `personal_sign` / `eth_sign`: firma de mensajes de texto plano (con prefijo `\x19Ethereum Signed Message`). | **NUEVO** (propuesto) | Should |
| RF-22 | `wallet_switchEthereumChain`: cambiar de red y notificar `chainChanged` a todas las pestañas. | E-19 | Must |
| RF-23 | `wallet_addEthereumChain`: dar de alta redes nuevas (nombre, chainId, RPC, símbolo, explorer) desde la dApp o desde la UI. | E-20 | Must |
| RF-24 | **Propagación de eventos**: `accountsChanged` y `chainChanged` se envían a **todas las pestañas** cuando cambian desde el popup o desde la dApp. | E-10, E-34, E-35 | Must |
| RF-25 | **Persistencia de conexión por origen**: cada dApp recuerda la cuenta autorizada entre recargas y reinicios del Service Worker. | **NUEVO** (guía de testing) | Must |
| RF-26 | **Revocar permiso** de un origen (desconectar dApp) desde el popup. | **NUEVO** (propuesto) | Should |

### 1.3 UX, logging y observabilidad

| ID | Requerimiento | Fuente | Prioridad |
|---|---|---|---|
| RF-27 | **Polling de saldos** cada 5 s de la cuenta activa (y de la lista de cuentas en la página de conexión). | E-11 | Must |
| RF-28 | **Log de llamadas**: registrar cada llamada al provider (método, params, origen, timestamp). | E-13 | Must |
| RF-29 | **Log de eventos**: registrar cada evento emitido (`accountsChanged`, `chainChanged`, …). | E-14 | Must |
| RF-30 | **Log de errores** resaltados en rojo con código y mensaje. | E-15 | Must |
| RF-31 | **Log de operaciones**: transacciones y firmas en tiempo real, con hash/firma resultante. | E-16 | Must |
| RF-32 | **Historial de logs persistente** que sobrevive a `resetWallet` (se guarda en `localStorage`). | E-23 | Should |
| RF-33 | **Validación de formularios** con feedback inline (frase inválida, dirección inválida, saldo insuficiente, clave privada inválida). | E-25 | Must |
| RF-34 | UI en **español**, con formato de ETH a 4 decimales y direcciones abreviadas `0x1234…abcd`. | **NUEVO** (propuesto) | Should |

### 1.4 Páginas independientes y ciclo de aprobación

| ID | Requerimiento | Fuente | Prioridad |
|---|---|---|---|
| RF-35 | `notification.html`: ventana independiente de **aprobación/rechazo** de transacciones y firmas (solo decide, no firma). | E-20, E-29 | Must |
| RF-36 | `connect.html`: ventana independiente de **conexión** con lista de cuentas y saldos, selección de cuenta a compartir. | E-30, E-36 | Must |
| RF-37 | **Cola de solicitudes pendientes** con `approvalId`/`requestId` únicos; varias solicitudes simultáneas. | E-29 | Must |
| RF-38 | **Badge contador** en el ícono de la extensión con el número de solicitudes pendientes. | E-31 | Should |
| RF-39 | **Notificaciones de Chrome** al llegar una nueva solicitud de firma/conexión. | E-32 | Should |
| RF-40 | **Timeout** de solicitudes: 120 s para firmas, 60 s para conexión; al expirar se resuelve con error `4001` (User rejected). | **NUEVO** (propuesto) | Should |
| RF-41 | Cerrar automáticamente la ventana de confirmación tras aprobar/rechazar y limpiar el estado pendiente. | E-29 | Must |

### 1.5 Estándares EIP

| ID | Requerimiento | Fuente | Prioridad |
|---|---|---|---|
| RF-42 | **EIP-1559**: construir transacciones tipo 2 con `maxFeePerGas`/`maxPriorityFeePerGas` obtenidos de `getFeeData()`. | E-17 | Must |
| RF-43 | **EIP-155**: incluir `chainId` en la firma (protección de replay) y verificar el `chainId` de la red activa. | Aprendizaje | Must |
| RF-44 | **EIP-6963**: anunciar el provider (`uuid`, `name`, `icon`, `rdns`) y responder a `eip6963:requestProvider`. | E-18 | Should |
| RF-45 | **EIP-1193**: cumplir la interfaz `request/on/removeListener` y el catálogo de errores estándar. | E-03 | Must |

### 1.6 dApp de pruebas

| ID | Requerimiento | Fuente | Prioridad |
|---|---|---|---|
| RF-46 | `test.html`: dApp standalone que permita detectar, conectar, consultar saldo, enviar transacción, firmar EIP-712, cambiar de red y escuchar eventos. | E-07..E-11 | Must |
| RF-47 | La dApp muestra un historial de operaciones y el detalle de la última respuesta. | E-16 | Should |

---

## 2. Requerimientos no funcionales (RNF) — ISO/IEC 25010

| ID | Categoría | Requerimiento (verificable) | Criterio de verificación |
|---|---|---|---|
| RNF-01 | Adecuación funcional | El 100 % de los RF marcados **Must** deben estar implementados y cubiertos por al menos un caso de uso con criterio Gherkin. | Matriz de trazabilidad RF ↔ CU ↔ test |
| RNF-02 | Eficiencia de desempeño | El popup debe renderizar en < 800 ms en frío y las lecturas de saldo (`eth_getBalance`) deben responder en < 1,5 s contra la red local. | Medición con `performance.now()` en 5 ejecuciones |
| RNF-03 | Eficiencia de desempeño | El polling de saldos (cada 5 s) no debe superar 1 llamada RPC por cuenta visible por ciclo. | Inspección de logs del Service Worker |
| RNF-04 | Compatibilidad | Debe cargar y funcionar en Chrome ≥ 114 y Edge ≥ 114 sin `manifest_version: 2`. | Carga en `chrome://extensions` y `edge://extensions` |
| RNF-05 | Usabilidad | Toda solicitud de firma/conexión debe ser aprobable o rechazable en ≤ 2 clics y mostrar destino, valor, red y comisión estimada. | Prueba manual E2E |
| RNF-06 | Usabilidad | Los mensajes de error se muestran en español, indican la causa y la acción sugerida. | Revisión de UI |
| RNF-07 | Fiabilidad | Si el RPC no responde, la UI debe mostrar el estado "desconectado" y reintentar sin bloquearse ni perder el estado persistido. | Test con Anvil detenido |
| RNF-08 | Fiabilidad | El Service Worker puede reiniciarse en cualquier momento: el estado pendiente necesario se reconstruye desde `chrome.storage.local`. | Test de "stop service worker" en medio de un flujo |
| RNF-09 | Seguridad | La clave privada y la frase semilla **nunca** salen del Service Worker ni se exponen a la página (no viajan por `window.postMessage`). | Inspección de mensajes en content-script + test |
| RNF-10 | Seguridad | Los mensajes entre página y extensión se validan por `origin`/`source`; `inject.js` solo se expone a páginas autorizadas por `web_accessible_resources`. | Revisión de código + intento de inyección desde iframe hostil |
| RNF-11 | Seguridad | Una dApp no autorizada recibe `[]` en `eth_accounts` y debe pasar por `eth_requestAccounts`. | Test negativo en `test.html` |
| RNF-12 | Seguridad | Toda transacción/firma requiere aprobación explícita del usuario; ningún método sensible firma en silencio. | Revisión de `handleRPCRequest` |
| RNF-13 | Mantenibilidad | Código 100 % TypeScript con `strict: true`; el build falla ante errores de tipos. | `tsc -b` sin `any` implícitos |
| RNF-14 | Mantenibilidad | Separación estricta: React = UI sin criptografía; el Service Worker = criptografía y RPC. | Revisión de imports (ethers solo en background) |
| RNF-15 | Portabilidad | El proyecto se compila en Windows y Linux con `npm install && npm run build`. | Build limpio en ambas plataformas |
| RNF-16 | Observabilidad | Los logs cubren el 100 % de llamadas, eventos y errores, con timestamp, nivel y origen. | Revisión del panel de logs |
| RNF-17 | Testabilidad | La lógica pura (derivación, validación, formateo, cola de aprobaciones) está aislada en módulos testeables sin navegador. | Cobertura de tests unitarios ≥ 70 % en esos módulos |

---

## 3. Requerimientos técnicos (RT) y restricciones (RE)

| ID | Tipo | Definición |
|---|---|---|
| RT-01 | Stack UI | React 19 + TypeScript 5.9 + Vite 7. |
| RT-02 | Librería criptográfica | **Únicamente** `ethers.js v6` para mnemonic, HD, firma, provider y serialización. |
| RT-03 | Prohibiciones | No usar `viem`, `@scure/bip39`, `@metamask/*`, `axios` ni `fetch` directo en el código propio (lo usa ethers internamente). |
| RT-04 | Plataforma | Chrome Extension Manifest V3: Service Worker (`type: module`), Content Script, Inject Script, `chrome.storage.local`, `chrome.windows`, `chrome.tabs`, `chrome.notifications`. |
| RT-05 | Build | El `manifest.json` se **genera** desde `src/manifest.ts` y el bundle de ethers se incluye localmente (sin CDN). |
| RT-06 | Red de pruebas | **Foundry Anvil** en `127.0.0.1:8545`, chainId `31337` (sin Sepolia — P-02). |
| RT-07 | Pruebas | Unitarias/integración: **Vitest** (jsdom) sobre módulos del Service Worker. E2E: **Playwright** con Chrome persistente y la extensión cargada. Contratos auxiliares (si aplica): **Forge**. |
| RT-08 | Tipos | `@types/chrome` para las APIs del navegador y `@types/node` para el script de build. |
| RE-01 | Restricción | No existe backend propio: toda la comunicación es directa dApp ↔ extensión ↔ nodo RPC. |
| RE-02 | Restricción | El modo "sin contraseña" (RF-03) implica que el mnemonic queda en claro en `chrome.storage.local` → riesgo aceptado solo para entorno de desarrollo (P-03). |
| RE-03 | Restricción | No se hace `push` a repositorios remotos sin orden explícita del usuario (`/push`). |
| RE-04 | Restricción | El RPC debe permitir CORS desde el origen de la extensión (`--http.corsdomain` en Anvil). |

---

## 4. Actores y stakeholders

| Actor | Descripción | Objetivos principales |
|---|---|---|
| **Usuario (dueño de la wallet)** | Persona que instala la extensión. | Crear/importar cartera, gestionar cuentas, enviar/recibir ETH, aprobar o rechazar solicitudes. |
| **dApp** (ej. `test.html`) | Aplicación web de terceros que consume `window.codecrypto`. | Conectar, leer saldo, enviar transacciones, firmar datos, escuchar eventos. |
| **Service Worker (background)** | Actor de sistema. | Custodiar material criptográfico, ejecutar RPC, orquestar aprobaciones y eventos. |
| **Nodo RPC local (Anvil)** | Actor de sistema externo. | Ejecutar y validar transacciones, entregar feeData y saldos. |
| **Navegador (Chrome/Edge)** | Plataforma. | Ciclo de vida del Service Worker, permisos, ventanas, notificaciones. |
| **Docente/evaluador** | Stakeholder de negocio. | Verificar el cumplimiento de los 36 puntos del enunciado y los EIP. |

---

## 5. Desviaciones y ambigüedades detectadas en el enunciado fuente

| # | Hallazgo | Impacto | Propuesta |
|---|---|---|---|
| D-01 | El enunciado dice 36 RF pero la numeración se **repite**: el 20 aparece como "Gestion de Redes" y como "Modal de Confirmación"; el 26 y el 29 también colisionan. El conteo real de viñetas es 37. | Trazabilidad confusa | Renumerado a `RF-01..RF-47` con este documento como fuente única. |
| D-02 | El enunciado indica **Hardhat** (`npx hardhat node`) pero el usuario pidió una **red de Foundry en local**. Ambos usan puerto 8545, chainId 31337 y la misma frase `test … junk`. | Bajo | **Resuelto (P-02):** Anvil como única red y **se retira Sepolia**. El cambio de red (RF-22/RF-23) se prueba entre redes locales vía `wallet_addEthereumChain`. |
| D-03 | No está en el enunciado la **importación por clave privada**, que el usuario sí pidió. | Medio | Añadido como RF-05/RF-06. |
| D-04 | "Enviar y recibir transferencias entre cuentas" puede leerse como transferencias internas (RF-08) o como mostrar la dirección para recibir (RF-07). | Bajo | Se cubren ambos explícitamente. |
| D-05 | E-04 prohíbe `fetch`/`axios`, pero `ethers.JsonRpcProvider` usa `fetch` internamente. | Bajo | La restricción aplica al código propio; se documenta la excepción. |
| D-06 | El enunciado no define el comportamiento ante **varias solicitudes simultáneas** ni el **timeout**. | Medio | Se añaden RF-37 y RF-40. |
| D-07 | El enunciado no menciona cifrado del mnemonic ni bloqueo por contraseña (E-02 lo excluye). | Alto (seguridad) | **Resuelto (P-03):** se mantiene la **carga sin contraseña**; el riesgo se acepta y se documenta como modo desarrollo. |
| D-08 | La ruta del proyecto en el enunciado es `71_wallet_chrome_extension/`, pero el workspace es la raíz `chrome-wallet/`. | Bajo | El proyecto se desarrolla en la raíz del workspace. |
| D-09 | Existe una **implementación previa completa** en el remoto `codecrypto` (§0.1) que no está en el workspace local. | Alto (alcance) | Decisión de adopción pendiente (**P-10**). |

---

## 6. Entrevista de la Fase 1

### Bloque 1 — Entorno, repositorios y seguridad ✅ RESUELTO

| ID | Pregunta | Respuesta | Acción tomada |
|---|---|---|---|
| P-01 | Repositorios remotos | Crear en **GitHub** `chrome-wallet` con ramas `main` y `chrome-wallet-DSH`; crear en **GitLab** `chrome-wallet` con las mismas ramas; agregar `https://gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git`. | Repo local inicializado con `main` + `chrome-wallet-DSH` y los 3 remotos configurados. El repo de `codecrypto` **ya existía y trae la implementación previa**; GitHub y GitLab.com **aún no existen** y no hay `gh`/`glab` ni tokens → creación pendiente por el usuario (`entornos_globales.md` §5). |
| P-02 | Red por defecto | **Solo Anvil local, sin Sepolia.** | `DEFAULT_RPC_URL=http://127.0.0.1:8545`, chainId `0x7a69`; se elimina `0xaa36a7` del diccionario y de `host_permissions`. |
| P-03 | Seguridad del mnemonic | **Sin contraseña** (modo desarrollo). | RF-03 confirmado; `settings.encryptionEnabled=false`, `requirePasswordOnOpen=false`. Riesgo aceptado (§8). |

### Bloque 1-bis — Línea base existente ⏳ PENDIENTE (bloqueante)

| ID | Pregunta | Estado |
|---|---|---|
| P-10 | El remoto `codecrypto` ya contiene la implementación completa (§0.1). ¿Se **adopta como línea base** (auditar, completar y corregir), se **reconstruye desde cero**, o se adopta parcialmente? | ⏳ Pendiente |

### Bloque 2 — Alcance funcional ⏳ Pendiente de lanzar

| ID | Pregunta | Estado |
|---|---|---|
| P-04 | ¿Número de cuentas derivadas por defecto (5) y posibilidad de añadir más desde la UI? | ⏳ Pendiente |
| P-05 | ¿Se incluye `personal_sign` (RF-21) y la vista QR de recepción (RF-07)? | ⏳ Pendiente |
| P-06 | ¿Se incluye revocación de permisos por origen (RF-26) y etiquetado/renombrado de cuentas? | ⏳ Pendiente |

### Bloque 3 — Calidad, pruebas y entrega ⏳ Pendiente de lanzar

| ID | Pregunta | Estado |
|---|---|---|
| P-07 | ¿Se aprueba **Vitest + Playwright** (con `forge` solo si se añade un contrato verificador EIP-712)? | ⏳ Pendiente |
| P-08 | ¿Se desplegará algo en **GCP** o el alcance es 100 % local? | ⏳ Pendiente |
| P-09 | ¿Idioma de la UI (español) y de código/documentación (español técnico + identificadores en inglés)? | ⏳ Pendiente |

---

## 7. Criterios de aceptación de la Fase 1

- [x] Extracción de RF / RNF / RT / RE del enunciado fuente.
- [x] `requerimientos.md`, `diccionario_datos.md` y `entornos_globales.md` creados en `RepoTecnico/`.
- [x] `estado_proyecto.md` con el resumen de fase.
- [x] Bloque 1 de la entrevista respondido (P-01, P-02, P-03).
- [ ] Decisión sobre la línea base existente (P-10).
- [ ] Bloques 2 y 3 respondidos.
- [ ] URLs de repositorios registradas y repos de GitHub/GitLab.com creados por el usuario.

---

## 8. Riesgos identificados (preliminar)

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mnemonic en claro en `chrome.storage.local` (RF-03) | Alta | Alto | **Riesgo aceptado (P-03)**; documentado como modo desarrollo exclusivo. |
| Ciclo de vida del Service Worker MV3 (se duerme y pierde estado en memoria) | Alta | Alto | Persistir toda la cola de aprobaciones en `chrome.storage.local` y reconstruir al arrancar (RNF-08). |
| CORS/`host_permissions` bloquean el RPC local | Media | Medio | `host_permissions` para `http://127.0.0.1:8545/*` y `--http.corsdomain` en Anvil (RE-04). |
| Inyección en `document_start` compite con la carga de la dApp | Media | Medio | Inyectar `inject.js` de forma síncrona y anunciar EIP-6963 al `DOMContentLoaded`. |
| Colisión de numeración del enunciado (D-01) | Alta | Bajo | Renumeración `RF-XX` como fuente única en este documento. |
| Fuga de la clave privada hacia la página vía `postMessage` | Baja | Crítico | RNF-09/RNF-10: nunca se envían claves; solo firmas y hashes. |
| **La línea base previa está desactualizada o no compila en Node 24** | Media | Medio | Verificar `npm install && npm run build` antes de adoptarla (paso de Fase 2/3). |
