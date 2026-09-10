# 📌 Estado del Proyecto — CodeCrypto Wallet

> Memoria de trabajo del proyecto. Se lee al inicio de cada turno y se actualiza de forma incremental.

**Última actualización:** Fase 1 — Concepto (en curso)
**Fase actual:** **1 de 5 — Concepto** (extracción de requerimientos ✔ · entrevista ⏳)
**Comando para continuar:** `/entrevista` (siguiente bloque de preguntas) · `/auditar` (Fase 2)

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
| `requerimientos.md` | ✅ Creado v1.0 | 47 RF, 17 RNF, 8 RT y 4 RE, actores, desviaciones (D-01..D-08), riesgos. |
| `diccionario_datos.md` | ✅ Creado v1.0 | Claves de storage, entidades, protocolo de mensajes y catálogo RPC/errores. |
| `entornos_globales.md` | ✅ Creado v1.0 | Entorno verificado, comandos, constantes, permisos, remotos y GCP. |
| `estado_proyecto.md` | ✅ Creado (este archivo) | Memoria de trabajo. |
| `casos_uso/` | ⏳ Fase 2 | Casos de uso (Gherkin/EARS) + diagramas Mermaid/SVG. |
| `documento_tecnico.md` | ⏳ Fase 2 | Arquitectura y especificación técnica. |
| `plan_desarrollo.md` | ⏳ Fase 3 | Plan de desarrollo vertical por hitos. |

---

## 3. Entorno verificado (resumen)

- Windows · Node `v24.16.0` · npm `11.13.0`.
- Foundry `anvil`/`forge`/`cast` **1.7.2-dev** instalados (`C:\Users\lucci\.cargo\bin`).
- Repositorio git **no inicializado**; remotos pendientes (P-01).
- RPC local en `127.0.0.1:8545` **detenido** (se levanta con `anvil` al probar).
- Sin credenciales GCP.

---

## 4. Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| DEC-01 | Renumerar los requerimientos como `RF-XX` (47 RF) usando `requerimientos.md` como **fuente única**. | El enunciado repite los números 20, 26 y 29 (D-01). |
| DEC-02 | Adoptar **Foundry Anvil** como red por defecto, manteniendo compatibilidad con Hardhat (mismo puerto, chainId y mnemonic). | Petición explícita del usuario; ambos entornos son intercambiables (D-02). |
| DEC-03 | Añadir la **importación por clave privada** (RF-05/RF-06) y la **recepción de fondos con QR/copiar dirección** (RF-07). | Petición explícita del usuario, ausente del enunciado (D-03/D-04). |
| DEC-04 | Mantener la arquitectura del enunciado: **React = solo UI**, **Service Worker = criptografía y RPC**. | Ya está validada y refuerza RNF-09/RNF-14. |
| DEC-05 | Incluir desde el diseño la **cola de aprobaciones persistida** y los **timeouts** (RF-37/RF-40/RNF-08). | El Service Worker MV3 se duerme y pierde el estado en memoria. |
| DEC-06 | Documentar `personal_sign` y `wallet_revokePermissions` como propuestos (Should). | Completitud frente a MetaMask; pendiente de confirmar (P-05/P-06). |

---

## 5. Preguntas abiertas (entrevista Fase 1)

### Bloque 1 — Entorno, repositorios y seguridad ⏳ **PENDIENTE DE RESPUESTA**

| ID | Pregunta | Respuesta |
|---|---|---|
| P-01 | URLs de repositorios GitLab/GitHub (¿crear nuevos o usar existentes?) y rama de trabajo. | — |
| P-02 | ¿Se confirma **Anvil** como red por defecto en `127.0.0.1:8545`/chainId 31337 y se mantiene Sepolia como red secundaria? | — |
| P-03 | ¿Se mantiene la carga **sin contraseña** o se añade contraseña opcional con cifrado del mnemonic (AES-GCM/WebCrypto)? | — |

### Bloque 2 — Alcance funcional ⏳ Pendiente de lanzar

| ID | Pregunta | Respuesta |
|---|---|---|
| P-04 | Nº de cuentas derivadas por defecto (5) y opción de añadir más desde la UI. | — |
| P-05 | ¿Se incluye `personal_sign` (RF-21) y la vista QR de recepción (RF-07)? | — |
| P-06 | ¿Se incluye revocación de permisos por origen (RF-26) y etiquetado/renombrado de cuentas? | — |

### Bloque 3 — Calidad, pruebas y entrega ⏳ Pendiente de lanzar

| ID | Pregunta | Respuesta |
|---|---|---|
| P-07 | ¿Se aprueba **Vitest + Playwright** (con `forge` solo si se añade un contrato verificador EIP-712)? | — |
| P-08 | ¿Se desplegará algo en **GCP** o el alcance es 100 % local? | — |
| P-09 | ¿Idioma de UI (español) y de código/documentación (español técnico + identificadores en inglés)? | — |

---

## 6. Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mnemonic en claro en `chrome.storage.local` (modo sin contraseña) | Alta | Alto | Modo desarrollo documentado; cifrado opcional según P-03. |
| Service Worker dormido pierde la cola de aprobaciones | Alta | Alto | Persistir en storage + reconstruir al arrancar (RNF-08). |
| Bloqueo CORS hacia el RPC local | Media | Medio | `host_permissions` + `--http.corsdomain` en Anvil (RE-04). |
| Fuga de clave privada hacia la página | Baja | Crítico | Nunca se envían claves por `postMessage` (RNF-09/RNF-10). |
| Numeración inconsistente del enunciado | Alta | Bajo | Renumeración `RF-XX` (DEC-01). |

---

## 7. Próximos pasos

1. **Responder el Bloque 1** de la entrevista (P-01, P-02, P-03).
2. Lanzar y responder los Bloques 2 y 3.
3. Registrar remotos y decisión GCP en `entornos_globales.md`.
4. Cerrar Fase 1 y pasar a **Fase 2 – Auditoría** (`/auditar`, luego `/casos_uso`, `/graficos`, `/documento_tecnico`).

---

## 8. Criterios de aceptación de la Fase 1

- [x] Extracción de requerimientos completada (`requerimientos.md`).
- [x] `diccionario_datos.md` y `entornos_globales.md` creados.
- [x] `estado_proyecto.md` con el resumen de la fase.
- [ ] Bloque 1 respondido.
- [ ] Bloques 2 y 3 respondidos.
- [ ] URLs de repositorios y decisión sobre GCP registradas.
