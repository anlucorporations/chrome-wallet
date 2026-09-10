# 📌 Estado del Proyecto — CodeCrypto Wallet

> Memoria de trabajo del proyecto. Se lee al inicio de cada turno y se actualiza de forma incremental.

**Última actualización:** Fase 1 — Concepto (Bloque 1 resuelto; pendiente P-10 y Bloques 2-3)
**Fase actual:** **1 de 5 — Concepto** (extracción de requerimientos ✔ · entrevista ⏳)
**Comando para continuar:** `/entrevista` (Bloques 2 y 3) · `/auditar` (Fase 2)
**Rama de trabajo activa:** `chrome-wallet-DSH`

---

## 1. Resumen del proyecto

Extensión de navegador Chrome/Edge (Manifest V3) que funciona como **wallet Ethereum estilo MetaMask**, con provider EIP-1193 inyectado (`window.codecrypto`), gestión de cuentas HD/importadas, envío y recepción de transferencias, firma de transacciones y de datos EIP-712, y una **dApp de pruebas** que consume la wallet contra una **red local de Foundry (Anvil)**.

**Stack:** React 19 · TypeScript 5.9 · Vite 7 · ethers.js v6 · Chrome Extension APIs (MV3).

---

## 2. Artefactos de `RepoTecnico/`

| Archivo | Estado | Contenido |
|---|---|---|
| `requisitos.md` | ✅ Fuente (no se modifica) | Enunciado original de la tarea (36 especificaciones). |
| `TAREA_PARA_ESTUDIANTE.md` | ✅ Fuente (no se modifica) | Enunciado extendido con arquitectura y ejemplos de código. |
| `GUIA_RAPIDA_TESTING.md` | ✅ Fuente (no se modifica) | Guía de pruebas rápidas y depuración. |
| `requerimientos.md` | ✅ v1.1 | 47 RF, 17 RNF, 8 RT y 4 RE, actores, desviaciones D-01..D-09, riesgos, entrevista. |
| `diccionario_datos.md` | ✅ v1.1 | Claves de storage, entidades, protocolo de mensajes y catálogo RPC/errores. Red única Anvil (P-02). |
| `entornos_globales.md` | ✅ v1.1 | Entorno verificado, comandos, constantes, permisos, 3 remotos y GCP. |
| `estado_proyecto.md` | ✅ v1.1 (este archivo) | Memoria de trabajo. |
| `casos_uso/` | ⏳ Fase 2 | Casos de uso (Gherkin/EARS) + diagramas Mermaid/SVG. |
| `documento_tecnico.md` | ⏳ Fase 2 | Arquitectura y especificación técnica. |
| `plan_desarrollo.md` | ⏳ Fase 3 | Plan de desarrollo vertical por hitos. |

---

## 3. Entorno verificado (resumen)

- Windows · Node `v24.16.0` · npm `11.13.0`.
- Foundry `anvil`/`forge`/`cast` **1.7.2-dev** instalados (`C:\Users\lucci\.cargo\bin`).
- Repositorio git **inicializado**: commit raíz `3522057` en `main` con la documentación de Fase 1; rama de trabajo `chrome-wallet-DSH`.
- Remotos configurados: `origin` (GitHub, **no existe**), `gitlab` (GitLab.com, **no existe**), `codecrypto` (GitLab ANLU, **existe con código**).
- RPC local en `127.0.0.1:8545` **detenido** (se levanta con `anvil` al probar).
- Sin `gh`/`glab` ni tokens; sin credenciales GCP.

---

## 4. Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| DEC-01 | Renumerar los requerimientos como `RF-01..RF-47` usando `requerimientos.md` como **fuente única**. | El enunciado repite los números 20, 26 y 29 (D-01). |
| DEC-02 | Adoptar **Foundry Anvil** como red por defecto y **única**. | Petición explícita del usuario (D-02). |
| DEC-03 | Añadir la **importación por clave privada** (RF-05/RF-06) y la **recepción de fondos con QR/copiar dirección** (RF-07). | Petición explícita del usuario, ausente del enunciado (D-03/D-04). |
| DEC-04 | Mantener la arquitectura del enunciado: **React = solo UI**, **Service Worker = criptografía y RPC**. | Ya está validada y refuerza RNF-09/RNF-14. |
| DEC-05 | Incluir desde el diseño la **cola de aprobaciones persistida** y los **timeouts** (RF-37/RF-40/RNF-08). | El Service Worker MV3 se duerme y pierde el estado en memoria. |
| DEC-06 | Documentar `personal_sign` y `wallet_revokePermissions` como propuestos (Should). | Completitud frente a MetaMask; pendiente de confirmar (P-05/P-06). |
| DEC-07 | **Retirar Sepolia** del alcance y de `host_permissions`; el cambio de red se prueba entre redes locales. | Decisión P-02 del usuario. |
| DEC-08 | Mantener la **carga sin contraseña** del mnemonic, documentándolo como modo desarrollo. | Decisión P-03 del usuario (cumple el requisito E-02 del enunciado). |
| DEC-09 | Excluir del versionado `exportchatia.txt` (8,2 MB) y `user_messages.txt` si se adopta la línea base. | Son exportaciones de conversación, no artefactos del proyecto. |
| DEC-10 | Registrar **3 remotos** (`origin`, `gitlab`, `codecrypto`) pero **no hacer push** hasta orden explícita (`/push`, RE-03). | Regla del proceso + remotos de GitHub/GitLab.com aún inexistentes. |

---

## 5. Entrevista de la Fase 1

### Bloque 1 — Entorno, repositorios y seguridad ✅ RESUELTO

| ID | Pregunta | Respuesta |
|---|---|---|
| P-01 | Repositorios remotos | Crear en GitHub `chrome-wallet` (`main` + `chrome-wallet-DSH`), crear en GitLab `chrome-wallet` (mismas ramas), agregar `gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git`. |
| P-02 | Red por defecto | **Solo Anvil local** (`127.0.0.1:8545`, chainId 31337), **sin Sepolia**. |
| P-03 | Seguridad del mnemonic | **Sin contraseña** (modo desarrollo); riesgo aceptado. |

### Bloque 1-bis — Línea base existente ⏳ PENDIENTE (bloqueante)

| ID | Pregunta | Estado |
|---|---|---|
| P-10 | El remoto `codecrypto` **ya contiene la implementación completa** (`src/App.tsx` 23 KB, `background.ts` 27 KB, `test.html` 36 KB, `manifest.ts`, etc.) en `main` y `chrome-wallet-DSH`. ¿Se **adopta como línea base** (auditar + completar lo pedido), se **reconstruye desde cero**, o se adopta parcialmente? | ⏳ Pendiente |

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

## 6. Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mnemonic en claro en `chrome.storage.local` (modo sin contraseña) | Alta | Alto | **Riesgo aceptado por el usuario (P-03)**; documentado como modo desarrollo. |
| Service Worker dormido pierde la cola de aprobaciones | Alta | Alto | Persistir en storage + reconstruir al arrancar (RNF-08). |
| Bloqueo CORS hacia el RPC local | Media | Medio | `host_permissions` + `--http.corsdomain` en Anvil (RE-04). |
| Fuga de clave privada hacia la página | Baja | Crítico | Nunca se envían claves por `postMessage` (RNF-09/RNF-10). |
| Numeración inconsistente del enunciado | Alta | Bajo | Renumeración `RF-XX` (DEC-01). |
| La línea base previa no compila en Node 24 o está desactualizada | Media | Medio | Verificar `npm install && npm run build` antes de adoptarla (Fase 2/3). |
| Historia local y remota sin ancestro común en `codecrypto` | Alta | Medio | Definir estrategia al resolver P-10 antes de cualquier push. |

---

## 7. Próximos pasos

1. **Resolver P-10** (adoptar / reconstruir la línea base) — bloqueante para todo lo demás.
2. Lanzar y responder el **Bloque 2** y el **Bloque 3** de la entrevista.
3. Crear los repositorios de GitHub y GitLab.com (acción del usuario, ver `entornos_globales.md` §5).
4. Registrar la decisión sobre GCP en `entornos_globales.md`.
5. Cerrar Fase 1 y pasar a **Fase 2 – Auditoría** (`/auditar`, `/casos_uso`, `/graficos`, `/documento_tecnico`).

---

## 8. Criterios de aceptación de la Fase 1

- [x] Extracción de requerimientos completada (`requerimientos.md` v1.1).
- [x] `diccionario_datos.md` y `entornos_globales.md` creados y ajustados a P-02/P-03.
- [x] `estado_proyecto.md` con el resumen de la fase.
- [x] Bloque 1 respondido (P-01, P-02, P-03).
- [x] Repositorio local inicializado con `main` y `chrome-wallet-DSH` y 3 remotos.
- [ ] Decisión sobre la línea base existente (**P-10**).
- [ ] Bloques 2 y 3 respondidos.
- [ ] Repositorios de GitHub y GitLab.com creados por el usuario.
