# 📌 Estado del Proyecto — CodeCrypto Wallet

> Memoria de trabajo del proyecto. Se lee al inicio de cada turno y se actualiza de forma incremental.

**Última actualización:** Fase 1 — Concepto ✅ **COMPLETADA**
**Fase actual:** **1 de 5 — Concepto** (cerrada, esperando confirmación para avanzar)
**Comando para continuar:** `/auditar` (Fase 2 – Auditoría) · `/estado` · `/push`
**Rama de trabajo activa:** `chrome-wallet-DSH`

---

## 1. Resumen del proyecto

Extensión de navegador Chrome/Edge (Manifest V3) que funciona como **wallet Ethereum estilo MetaMask**, con provider EIP-1193 inyectado (`window.codecrypto`), gestión de cuentas HD e importadas por clave privada, envío y recepción de transferencias (con QR), firma de transacciones y de datos EIP-712, firma de mensajes (`personal_sign`), y una **dApp de pruebas** que consume la wallet contra una **red local de Foundry (Anvil)**.

**Stack:** React 19 · TypeScript 5.9 · Vite 7 · ethers.js v6 · Chrome Extension APIs (MV3).
**Pruebas:** Vitest + Playwright + Forge (contrato verificador EIP-712).
**Alcance de despliegue:** 100 % local (sin GCP).

---

## 2. Artefactos de `RepoTecnico/`

| Archivo | Estado | Contenido |
|---|---|---|
| `requisitos.md` | ✅ Fuente (no se modifica) | Enunciado original de la tarea (36 especificaciones). |
| `TAREA_PARA_ESTUDIANTE.md` | ✅ Fuente (no se modifica) | Enunciado extendido con arquitectura y ejemplos de código. |
| `GUIA_RAPIDA_TESTING.md` | ✅ Fuente (no se modifica) | Guía de pruebas rápidas y depuración. |
| `requerimientos.md` | ✅ v1.2 | 47 RF, 17 RNF, 11 RT y 4 RE, actores, desviaciones D-01..D-09, riesgos, entrevista cerrada. |
| `diccionario_datos.md` | ✅ v1.2 | Claves de storage, entidades, protocolo de mensajes y catálogo RPC/errores. Red única Anvil. Decisiones P-03..P-08 aplicadas. |
| `entornos_globales.md` | ✅ v1.2 | Entorno verificado, comandos, constantes, permisos, 3 remotos, herramientas de prueba y GCP cerrado. |
| `estado_proyecto.md` | ✅ v1.2 (este archivo) | Memoria de trabajo. |
| `casos_uso/` | ⏳ Fase 2 | Casos de uso (Gherkin/EARS) + diagramas Mermaid/SVG. |
| `documento_tecnico.md` | ⏳ Fase 2 | Arquitectura y especificación técnica. |
| `plan_desarrollo.md` | ⏳ Fase 3 | Plan de desarrollo vertical por hitos. |

---

## 3. Entorno verificado (resumen)

- Windows · Node `v24.16.0` · npm `11.13.0`.
- Foundry `anvil`/`forge`/`cast` **1.7.2-dev** instalados (`C:\Users\lucci\.cargo\bin`).
- Repositorio git **inicializado**: `main` (commit raíz con la documentación) y rama de trabajo `chrome-wallet-DSH`.
- Remotos configurados: `origin` (GitHub, **no existe**), `gitlab` (GitLab.com, **no existe**), `codecrypto` (GitLab ANLU, **existe con el código previo**).
- RPC local en `127.0.0.1:8545` **detenido** (se levanta con `anvil` al probar).
- Sin `gh`/`glab` ni tokens; GCP fuera de alcance.

---

## 4. Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| DEC-01 | Renumerar los requerimientos como `RF-01..RF-47` usando `requerimientos.md` como **fuente única**. | El enunciado repite los números 20, 26 y 29 (D-01). |
| DEC-02 | Adoptar **Foundry Anvil** como red por defecto y **única**. | Petición explícita del usuario (D-02). |
| DEC-03 | Añadir la **importación por clave privada** (RF-05/RF-06) y la **recepción de fondos con QR/copiar dirección** (RF-07). | Petición explícita del usuario (D-03/D-04). |
| DEC-04 | Mantener la arquitectura del enunciado: **React = solo UI**, **Service Worker = criptografía y RPC**. | Ya está validada y refuerza RNF-09/RNF-14. |
| DEC-05 | Incluir desde el diseño la **cola de aprobaciones persistida** y los **timeouts** (RF-37/RF-40/RNF-08). | El Service Worker MV3 se duerme y pierde el estado en memoria. |
| DEC-06 | Confirmar `personal_sign` (RF-21) y `wallet_revokePermissions` (RF-26) dentro del alcance. | Respuestas **P-05** y **P-06** del usuario. |
| DEC-07 | **Retirar Sepolia** del alcance y de `host_permissions`. | Decisión **P-02**. |
| DEC-08 | Mantener la **carga sin contraseña** del mnemonic, documentándolo como modo desarrollo. | Decisión **P-03**. |
| DEC-09 | **Reconstruir el proyecto desde cero**: el código del remoto `codecrypto` es solo **referencia** y no se reutiliza ni se versiona en el nuevo proyecto. | Decisión **P-10** (bloqueante, resuelta). |
| DEC-10 | Registrar **3 remotos** (`origin`, `gitlab`, `codecrypto`) pero **no hacer push** hasta orden explícita (`/push`, RE-03). | Regla del proceso + remotos de GitHub/GitLab.com aún inexistentes. |
| DEC-11 | **5 cuentas HD por defecto + botón "Añadir cuenta"** para derivar la siguiente. | Decisión **P-04**. |
| DEC-12 | **Vitest + Playwright + contrato verificador EIP-712 con Forge** como stack de pruebas. | Decisión **P-07**. |
| DEC-13 | **100 % local, sin GCP.** | Decisión **P-08**. |
| DEC-14 | **UI y documentación en español; identificadores de código en inglés.** | Decisión **P-09**. |

---

## 5. Entrevista de la Fase 1 ✅ CERRADA

### Bloque 1 — Entorno, repositorios y seguridad

| ID | Pregunta | Respuesta |
|---|---|---|
| P-01 | Repositorios remotos | Crear en GitHub `chrome-wallet` (`main` + `chrome-wallet-DSH`), crear en GitLab `chrome-wallet` (mismas ramas), agregar `gitlab.codecrypto.academy/anlucorporations/chrome-wallet.git`. |
| P-02 | Red por defecto | **Solo Anvil local** (`127.0.0.1:8545`, chainId 31337), **sin Sepolia**. |
| P-03 | Seguridad del mnemonic | **Sin contraseña** (modo desarrollo); riesgo aceptado. |

### Bloque 1-bis — Línea base existente

| ID | Pregunta | Respuesta |
|---|---|---|
| P-10 | ¿Adoptar la implementación previa del remoto `codecrypto`? | **Reconstruir desde cero.** El remoto queda solo como referencia. |

### Bloque 2 — Alcance funcional

| ID | Pregunta | Respuesta |
|---|---|---|
| P-04 | Nº de cuentas derivadas | **5 por defecto + botón "Añadir cuenta"**. |
| P-05 | `personal_sign` y QR de recepción | **Sí a ambos.** |
| P-06 | Revocar permisos y renombrar cuentas | **Sí a ambos.** |

### Bloque 3 — Calidad, pruebas y entrega

| ID | Pregunta | Respuesta |
|---|---|---|
| P-07 | Frameworks de prueba | **Vitest + Playwright + contrato verificador EIP-712 con Forge.** |
| P-08 | Despliegue | **100 % local, sin GCP.** |
| P-09 | Idioma | **UI y documentación en español; identificadores de código en inglés.** |

### Pendiente administrativo (no bloqueante)

| ID | Acción | Responsable |
|---|---|---|
| P-11 | Crear los repositorios `chrome-wallet` en **GitHub** y **GitLab.com** (organización `anlucorporations`, ramas `main` y `chrome-wallet-DSH`) y avisar para ejecutar `/push`. | Usuario |
| P-12 | Definir la estrategia de publicación frente a la historia divergente del remoto `codecrypto` (su `main`/`chrome-wallet-DSH` apuntan al commit `632d890`, sin ancestro común con la nueva historia). | Usuario (al llegar `/push`) |

---

## 6. Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mnemonic en claro en `chrome.storage.local` (modo sin contraseña) | Alta | Alto | **Riesgo aceptado (P-03)**; documentado como modo desarrollo. |
| Service Worker dormido pierde la cola de aprobaciones | Alta | Alto | Persistir en storage + reconstruir al arrancar (RNF-08). |
| Bloqueo CORS hacia el RPC local | Media | Medio | `host_permissions` + `--http.corsdomain` en Anvil (RE-04). |
| Fuga de clave privada hacia la página | Baja | Crítico | Nunca se envían claves por `postMessage` (RNF-09/RNF-10). |
| Numeración inconsistente del enunciado | Alta | Bajo | Renumeración `RF-XX` (DEC-01). |
| Reconstruir desde cero consume el presupuesto de ~40 h | Media | Medio | Plan de desarrollo vertical con hitos funcionales y pruebas por ciclo (Fase 3). |
| Combinar Playwright + Forge + Vitest en solitario | Media | Medio | Los tests se construyen en cada ciclo, no al final; el contrato EIP-712 es mínimo. |
| Historia local y remota sin ancestro común en `codecrypto` | Alta | Medio | Definir estrategia antes del primer `/push` (**P-12**). |

---

## 7. Próximos pasos

1. **Confirmar el cierre de la Fase 1** y autorizar el paso a la **Fase 2 – Auditoría**.
2. Ejecutar `/auditar` sobre `requerimientos.md`, `diccionario_datos.md` y `entornos_globales.md`.
3. Ejecutar `/casos_uso` (Gherkin/EARS + trazabilidad a RF), auditarlos y resolver las dudas.
4. Ejecutar `/graficos` (Mermaid/SVG de los casos de uso auditados).
5. Ejecutar `/documento_tecnico` y `/auditar_documento`.
6. Crear los repositorios de GitHub y GitLab.com (P-11).
7. Pasar a la **Fase 3 – Desarrollo** con `/plan_desarrollo`.

---

## 8. Criterios de aceptación de la Fase 1 ✅ CUMPLIDOS

- [x] Extracción de RF / RNF / RT / RE del enunciado fuente (`requerimientos.md` v1.2).
- [x] `requerimientos.md`, `diccionario_datos.md` y `entornos_globales.md` creados y consolidados.
- [x] `estado_proyecto.md` con el resumen de la fase.
- [x] Bloque 1, Bloque 1-bis, Bloque 2 y Bloque 3 de la entrevista respondidos (P-01..P-10).
- [x] Repositorio local inicializado con `main` y `chrome-wallet-DSH` y los 3 remotos configurados.
- [x] Decisión de alcance cerrada: red única Anvil, sin GCP, reconstrucción desde cero.
- [ ] Repositorios de GitHub y GitLab.com creados por el usuario (P-11, no bloquea la Fase 2).
- [ ] Confirmación explícita del usuario para pasar a la Fase 2.
