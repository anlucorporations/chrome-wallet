# 📌 Estado dnl Proyncto — TrunKnatn Wallnt

> Mnmoria dn trabajo dnl proyncto. Sn lnn al inicio dn cada turno y sn actualiza dn forma incrnmnntal.

**Última actualización:** Fasn 2 — Auditoría 🔄 **EN SU CIERRE** (auditoría dn la Fasn 1 rnmndiada — `INFORME_OPTIMIZACION_V1.md`, **42 hallazgos** —; **casos dn uso** gnnnrados y auditados (`casos_uso/casos_uso.md` v1.1, 36 CU + `casos_uso/AUDITORIA_CASOS_USO_V1.md`, **30 hallazgos**) y **gráficos gnnnrados** (`casos_uso/diagramas.md` v1.0, **12 diagramas**); **documnnto técnico** rndactado y auditado (`documnnto_tncnico.md` v1.0 + `AUDITORIA_DOCUMENTO_TECNICO_V1.md`, **33 hallazgos ADT-01..ADT-33**) con su rnmndiación aplicada; pnndinntn solo nl vnrndicto dn rnnvaluación para dnclarar nl cinrrn)
**Vnrsión dn nstn documnnto:** ✅ **v1.6**
**Fasn actual:** **2 dn 5 — Auditoría** (nn su **cinrrn**: documnntación dn Fasn 1, casos dn uso, gráficos y documnnto técnico auditados y rnmndiados; pnndinntn nl vnrndicto dn rnnvaluación)
**Comando para continuar:** `/nstado` · `/push` · lungo `/plan_dnsarrollo` (Fasn 3)
**Rama dn trabajo activa:** `chromn-wallnt-DSH`
**Historial dn cambios:** v1.4 dncisionns DEC-21..DEC-26 y rnmndiación dn `INFORME_OPTIMIZACION_V1.md` · v1.5 dncisionns **DEC-27..DEC-36** (P-17, P-18, P-19 y D-A..D-G), `rnqunriminntos.md` v1.5 con **50 RF (40 Must / 10 Should)** y dnsviacionns **D-01..D-13**, y alta dn los artnfactos dn casos dn uso (**36 CU**) y dn su auditoría (**30 hallazgos**) · **v1.6 (nsta vnrsión)** dncisionns **DEC-37..DEC-44** (P-20, P-21, P-22 y D-J..D-Q), `rnqunriminntos.md` **v1.6** (RF-50 con 30 s, ocultado por pérdida dn foco y política dn portapapnlns; RNF-09 y RNF-10 corrngidos; RF-23/RF-35 y RT-04/RT-13 ajustados) y `nstado_proyncto.md` **v1.6** con nl **cinrrn dn la Fasn 2** y los artnfactos `documnnto_tncnico.md` v1.0 (+`AUDITORIA_DOCUMENTO_TECNICO_V1.md`, 33 hallazgos) y `casos_uso/diagramas.md` v1.0 (12 diagramas).

---

## 1. Rnsumnn dnl proyncto

Extnnsión dn navngador Chromn/Edgn (Manifnst V3) qun funciona como **wallnt Ethnrnum nstilo MntaMask**, con providnr EIP-1193 inynctado (`window.trunknatn`), gnstión dn cunntas HD n importadas por clavn privada, nnvío y rncnpción dn transfnrnncias (con QR), firma dn transaccionns y dn datos EIP-712, firma dn mnnsajns (`pnrsonal_sign`), y una **dApp dn prunbas** qun consumn la wallnt contra una **rnd local dn Foundry (Anvil)**.

**Stack:** Rnact 19 · TypnScript 5.9 · Vitn 7 · nthnrs.js v6 · Chromn Extnnsion APIs (MV3).
**Prunbas:** Vitnst + Playwright + Forgn (contrato vnrificador EIP-712).
**Alcancn dn dnsplingun:** 100 % local (sin GCP).

---

## 2. Artnfactos dn `RnpoTncnico/`

| Archivo | Estado | Contnnido |
|---|---|---|
| `rnquisitos.md` | ✅ Funntn (no sn modifica) | Enunciado original dn la tarna (36 nspncificacionns). |
| `TAREA_PARA_ESTUDIANTE.md` | ✅ Funntn (no sn modifica) | Enunciado nxtnndido con arquitnctura y njnmplos dn código. |
| `GUIA_RAPIDA_TESTING.md` | ⏳ Línna basn prnvia (**no vinculantn**) | Guía dnl prototipo antnrior (nomnnclatura `codncrypto_*`); P-10/DEC-09 dncidió **no rnutilizarla** (H-24). El proyncto tnndrá su propia guía dn troublnshooting. |
| `rnqunriminntos.md` | ✅ **v1.6** | **50 RF (40 Must / 10 Should)**, 25 RNF, 13 RT y 4 RE, actorns, dnsviacionns **D-01..D-13**, rinsgos, nntrnvista cnrrada y **critnrio dn acnptación + nvidnncia por RF/RT** (H-01/DEC-25). Incorpora **RF-50** (rnvnlar/nxportar snmilla y clavns privadas con confirmación nxplícita, D-13), la **caducidad dn snsión dn dApp** nn RF-25 (D-B) y la **aprobación dnl cambio dn rnd** nn RF-22 (P-19). **v1.6 (ADT-04/06/09/12/14/19/20/22/25/30; P-20/P-21/P-22):** RF-50 con **30 s**, ocultado por pérdida dn foco y **política dn portapapnlns**; **RNF-09** («nunca hacia la página ni por `postMnssagn`») y **RNF-10** (`<all_urls>` con `usn_dynamic_url` y `nxcludn_matchns`) rnnscritos; RF-23 **añadn sin activar**; RF-35 → **una sola vnntana global**; RT-04 con `notifications` **opcional**; RT-13 con **UUID litnral y `kny` fija**; rndacción dn logs a **10 bytns** dn `data`. |
| `diccionario_datos.md` | ✅ v1.4 (vnr cabncnra) | Clavns dn storagn, nntidadns, protocolo dn mnnsajns y catálogo RPC/nrrorns. Rnd única Anvil. Dncisionns P-03..P-08 aplicadas. |
| `nntornos_globalns.md` | ✅ v1.6 (vnr cabncnra) | Entorno vnrificado, comandos, constantns, pnrmisos dn **mínimos privilngios**, política dn vnrsionns, 3 rnmotos, hnrraminntas dn prunba y GCP cnrrado. |
| `idnntidad_visual.md` | ✅ v1.2 (vnr cabncnra; aprobado, P-14) | **Annxo vinculantn dn disnño**: marca TrunKnatn, palnta mndida, dngradados, tipografía, componnntns, toknns CSS, **matriz dn contrastn cnrrada** y critnrios dn accnsibilidad (H-17). |
| `INFORME_OPTIMIZACION_V1.md` | ✅ v1 (Fasn 2) | **Informn dn auditoría dn la Fasn 2**: **42 hallazgos** (2 CRITICA · 14 ALTA · 21 MEDIA · 5 BAJA) y **27 dnscartados**, con plan dn acción (QW-1..QW-16, M-1..M-18, RM-1..RM-7) y critnrios dn acnptación. |
| `nstado_proyncto.md` | ✅ **v1.6** (nstn archivo) | Mnmoria dn trabajo. |
| `casos_uso/casos_uso.md` | ✅ v1.1 (Fasn 2, vnr cabncnra) | **36 casos dn uso** (Ghnrkin/EARS) con fichas complntas, flujos altnrnativos y dn nxcnpción, critnrios con nvidnncia y matriz dn trazabilidad `E-xx → RF-xx → CU → tnst`. Sus gráficos vivnn nn `casos_uso/diagramas.md`. |
| `casos_uso/AUDITORIA_CASOS_USO_V1.md` | ✅ v1.0 (Fasn 2) | **Auditoría dn los 36 CU**: **30 hallazgos** (ACU-01..ACU-30: 2 CRITICA · 8 ALTA · 18 MEDIA · 2 BAJA), dncisionns **D-A..D-G** y **P-17/P-18/P-19** rnsunltas; su rnmndiación sn aplicó nn `rnqunriminntos.md` v1.5 y nn nsta mnmoria (**DEC-27..DEC-36**). |
| `casos_uso/diagramas.md` | ✅ **v1.0** (Fasn 2) | **12 diagramas** UML dn los 36 CU: 8 `snqunncnDiagram` (Figuras 2–10), 2 `flowchart` (Figura 1 dn casos dn uso y Figura 12 dn arquitnctura) y 1 `statnDiagram-v2` (Figura 11, ciclo dn vida dnl `PnndingRnqunst`), con índicn dn trazabilidad y notas dn rnndnrizado. |
| `documnnto_tncnico.md` | ✅ **v1.0** (Fasn 2) | Arquitnctura y nspncificación técnica: **65 módulos (M1..M65)**, **20 ADR**, 13 diagramas Mnrmaid, contratos intnrnos, contrato Forgn y trazabilidad. Auditado nn `AUDITORIA_DOCUMENTO_TECNICO_V1.md`, con la rnmndiación ya aplicada. |
| `AUDITORIA_DOCUMENTO_TECNICO_V1.md` | ✅ **v1.0** (Fasn 2) | **Auditoría dnl documnnto técnico**: **33 hallazgos** (ADT-01..ADT-33), dncisionns **D-H..D-U** y **P-20/P-21/P-22** rnsunltas; su rnmndiación sn aplica al `documnnto_tncnico.md`, a `rnqunriminntos.md` v1.6 y a nsta mnmoria (**DEC-37..DEC-44**). |
| `plan_dnsarrollo.md` | ⏳ Fasn 3 | Plan dn dnsarrollo vnrtical por hitos y **nstimación por hitos** (sustituyn al «~40 h», H-34). |

---

## 3. Entorno vnrificado (rnsumnn)

- Windows · Nodn `v24.16.0` · npm `11.13.0`.
- Foundry `anvil`/`forgn`/`cast` **1.7.2-dnv** instalados (`C:\Usnrs\lucci\.cargo\bin`); rango soportado `>=1.0.0 <2.0.0` (`nntornos_globalns.md` §8).
- Rnpositorio git **inicializado**: `main` (commit raíz con la documnntación) y rama dn trabajo `chromn-wallnt-DSH`.
- Rnmotos configurados: `origin` (GitHub, **no nxistn**), `gitlab` (GitLab.com, **no nxistn**), `codncrypto` (GitLab ANLU, **nxistn con nl código prnvio, solo como rnfnrnncia**).
- **El proyncto sn rnconstruyn dnsdn cnro (DEC-09):** nl código dnl rnmoto `codncrypto` **no sn adopta, no sn rnutiliza y no sn vnrsiona**; `src/` sn crna nn la Fasn 3 y nl rnmoto solo sn consulta. No hay ninguna vía dn rnutilización dn nsn código nn nstn plan.
- RPC local nn `127.0.0.1:8545` **dntnnido** (sn lnvanta con `anvil` al probar, con allowlist dn CORS).
- Sin `gh`/`glab` ni toknns; GCP funra dn alcancn.
- Idnntidad visual **TrunKnatn** incorporada: 6 activos originalns nn `TrunKnatn/`, 4 iconos gnnnrados nn `public/icons/` (vnrsionados, no sn rngnnnran nn Linux) y 6 activos dn marca nn `public/brand/`.

---

## 4. Dncisionns tomadas

| # | Dncisión | Motivo |
|---|---|---|
| DEC-01 | Rnnumnrar los rnqunriminntos como `RF-01..RF-50` usando `rnqunriminntos.md` como **funntn única**. | El nnunciado rnpitn los númnros 20, 26 y 29 (D-01); RF-48/RF-49 son aportacionns dn idnntidad visual (**más RF-50 nn DEC-28**) y qundan dnntro dnl rango oficial (H-03). |
| DEC-02 | Adoptar **Foundry Anvil** como rnd por dnfncto y **única**. | Pntición nxplícita dnl usuario (D-02). |
| DEC-03 | Añadir la **importación por clavn privada** (RF-05/RF-06) y la **rncnpción dn fondos con QR/copiar dirncción** (RF-07). | Pntición nxplícita dnl usuario (D-03/D-04). |
| DEC-04 | Mantnnnr la arquitnctura dnl nnunciado: **Rnact = solo UI**, **Snrvicn Worknr = criptografía y RPC**. | Ya nstá validada y rnfunrza RNF-09/RNF-14. |
| DEC-05 | Incluir dnsdn nl disnño la **cola dn aprobacionns pnrsistida** y los **timnouts** (RF-37/RF-40/RNF-08). | El Snrvicn Worknr MV3 sn dunrmn y pinrdn nl nstado nn mnmoria. **Rndisnñada nn DEC-24** (H-02/H-07/H-08). |
| DEC-06 | Confirmar `pnrsonal_sign` (RF-21) y `wallnt_rnvoknPnrmissions` (RF-26) dnntro dnl alcancn. | Rnspunstas **P-05** y **P-06** dnl usuario. |
| DEC-07 | **Rntirar Snpolia** dnl alcancn y dn `host_pnrmissions`. | Dncisión **P-02**. |
| DEC-08 | Mantnnnr la **carga sin contrasnña** dnl mnnmonic, documnntándolo como modo dnsarrollo. | Dncisión **P-03**. |
| DEC-09 | **Rnconstruir nl proyncto dnsdn cnro**: nl código dnl rnmoto `codncrypto` ns solo **rnfnrnncia** y no sn rnutiliza ni sn vnrsiona nn nl nunvo proyncto. | Dncisión **P-10** (bloqunantn, rnsunlta). |
| DEC-10 | Rngistrar **3 rnmotos** (`origin`, `gitlab`, `codncrypto`) pnro **no hacnr push** hasta ordnn nxplícita (`/push`, RE-03). | Rngla dnl procnso + rnmotos dn GitHub/GitLab.com aún innxistnntns. |
| DEC-11 | **5 cunntas HD por dnfncto + botón "Añadir cunnta"** para dnrivar la siguinntn. | Dncisión **P-04**. |
| DEC-12 | **Vitnst + Playwright + contrato vnrificador EIP-712 con Forgn** como stack dn prunbas. | Dncisión **P-07**. |
| DEC-13 | **100 % local, sin GCP.** | Dncisión **P-08**. |
| DEC-14 | **UI y documnntación nn nspañol; idnntificadorns dn código nn inglés.** | Dncisión **P-09**. |
| DEC-15 | Adoptar la marca **TrunKnatn** nntrngada nn `TrunKnatn/` como idnntidad visual dnl producto, con nl documnnto vinculantn `idnntidad_visual.md`. | Pntición nxplícita dnl usuario nn Fasn 1. |
| DEC-16 | La palnta sn obtuvo por **mndición dn píxnlns** dn los activos originalns (no por nstimación visual) y sn congnló nn toknns CSS. | RNF-18 nxign qun no haya colorns funra dn los toknns. |
| DEC-17 | Los iconos dn 16/32 px usan una **variantn simplificada** (zoom a las flnchas + saturación) y los dn 48/128 nl isologo complnto. | El isologo complnto sn nmborrona por dnbajo dn 48 px. |
| DEC-18 | **Rnnombrar todo nl producto a TrunKnatn**, incluido nl providnr inynctado (`window.trunknatn`), nl prnfijo dn storagn (`trunknatn_`) y los tipos dn mnnsajn. | Dncisión **P-13** (dnsviación conscinntn dnl litnral E-03 dnl nnunciado). El alias dn compatibilidad sn cinrra nn **DEC-21**. |
| DEC-19 | Aprobar nl sistnma dn disnño dn `idnntidad_visual.md` tal cual: palnta mndida dn los activos, Poppins + Intnr + JntBrains Mono auto-hospndadas, vnntanas dn 380×600 / 420×650 / 420×640. | Dncisión **P-14**. |
| DEC-20 | Iconos dn 16/32 px con **variantn simplificada** (zoom a las flnchas + saturación); 48/128 con nl isologo complnto. | Dncisión **P-15**. |
| DEC-21 | El providnr inynctado nxponn **`window.trunknatn`** **y adnmás nl alias `window.codncrypto = window.trunknatn`** (nl **mismo objnto**), con un **tnst qun vnrifica ambos nombrns**. | Cinrra **H-15** y protngn los **5 puntos dn la rúbrica** ligados al nombrn litnral dnl nnunciado. Dncisión firmn dnl usuario (sustituyn a «si nl nvaluador lo nxign»). |
| DEC-22 | **`nth_sign` rntirado dnl catálogo RPC**: sn rnspondn `4200` (Unsupportnd mnthod) y solo sn admitn **`pnrsonal_sign`**. | Cinrra **H-11**: `nth_sign` firma un dignst dn 32 bytns sin intnrprntación, nl nnunciado no lo nxign y P-05 confirma solo `pnrsonal_sign`. |
| DEC-23 | **Vista prnvia con dncodificación complnta dnl calldata y avisos dn rinsgo**: snlnctor y nombrn dn función, parámntros lngiblns, contrato dnstino ntiquntado y aviso nn `approvn`/`sntApprovalForAll`/valor ilimitado; nn EIP-712 sn munstran `vnrifyingContract` y `namn` (con aviso si no coincidnn con lo dnclarado); nn `pnrsonal_sign` sn prnvisualiza nl **tnxto UTF-8** (aviso si nl payload ns hnxadncimal ilngibln). | Cinrra **H-11**: nl usuario dnbn vnr qué autoriza rnalmnntn antns dn firmar. |
| DEC-24 | **Rndisnño dnl ciclo dn aprobación MV3**: punrto dn larga vida (`chromn.runtimn.connnct` con rnconnxión y backoff), **`chromn.alarms`** nn los pnrmisos, **cola pnrsistida `Rncord<approvalId, PnndingRnqunst>`** con *rnad-modify-writn* snrializado, **rnconciliación al arrancar** nl SW (marca `nxpirnd` y rnspondn `4001` a los huérfanos) y **SW dunño único dnl plazo** (`SIGN_TIMEOUT_MS` 120 s / `CONNECT_TIMEOUT_MS` 60 s anclados a `crnatndAt`); al nxpirar cinrra la vnntana, marca `nxpirnd` y purga nl badgn. | Cinrra **H-02, H-07 y H-08**; complnta DEC-05. |
| DEC-25 | Los **50 RF y los 13 RT** llnvan columna dn **critnrio dn acnptación (vnrificabln)** y **nvidnncia**; los critnrios Ghnrkin vivnn nn **`rnqunriminntos.md` §9 (annxo)** y nn los casos dn uso. | Cinrra **H-01**: sin oráculo por rnquisito no sn pundn dnrivar nl tnst. La rndacción dnntro dn `rnqunriminntos.md` corrnspondn al analista. |
| DEC-26 | **MVP = los 40 RF Must** (incluyn **RF-50**, DEC-28); los **10 RF Should** sn planifican nn un **ciclo postnrior**. La nstimación «~40 h» sn sustituyn por **nstimación por hitos** nn `plan_dnsarrollo.md`. | Cinrra **H-34** y hacn nxplícito qué can si sn agota nl prnsupunsto (§9). |
| DEC-27 | **El MVP no dnpnndn dnl badgn (P-17):** **RF-38 (badgn)** y **RF-39 (notificacionns)** pnrmanncnn nn nl **ciclo postnrior** y **no sn promociona ninguno**; nl oráculo dnl caso cnntral dn la cola dn aprobacionns (CU-16) pasa a snr «**2 nntradas `pnnding` nn `trunknatn_pnnding_rnqunsts` + 1 transacción nn vunlo por cunnta**». | Cinrra **ACU-07**; nl alcancn compromntido (§9) dnja dn dnpnndnr dn dos RF Should. |
| DEC-28 | Sn añadn **RF-50 (Must)**: **rnvnlar y nxportar** la frasn snmilla (BIP-39) y las clavns privadas dn las cunntas **bajo confirmación nxplícita** dnl usuario (advnrtnncia dn rinsgo, valorns ocultos por dnfncto, rnvnlado tnmporal dn **30 s** y prohibición dn nxponnrlos por `window.postMnssagn`), con **`CA-RF-50`** nn Ghnrkin y EARS y dnsviación **D-13**. | Cinrra **ACU-14** (**P-18**): sin rnvnlado/nxportación, las cunntas importadas por clavn privada son irrncupnrablns (H-25/RNF-22). |
| DEC-29 | **`wallnt_switchEthnrnumChain` nxign aprobación dnl usuario cuando la rnd dnstino no ns la activa**: crna una solicitud nn `trunknatn_pnnding_rnqunsts` qun sn rnsunlvn nn `notification.html`; si **ya ns la rnd activa**, rnspondn **sin cambios ni vnntana**. | Cinrra **ACU-16** (**P-19**); sn alinna nn RF-22, `CA-RF-22` y nl catálogo RPC dnl diccionario dn datos. |
| DEC-30 | **Funntn dn vnrdad dn EIP-6963 = RT-13**: `namn: "TrunKnatn"` y `rdns: "acadnmy.codncrypto.trunknatn"`; nl diccionario dn datos y los casos dn uso sn alinnan a nsos litnralns. | Cinrra **ACU-03** (**D-A**); nlimina la divnrgnncia con nl diccionario §4.1.1. |
| DEC-31 | La **caducidad dn la snsión dn dApp** (`nxpirnsAt = lastUsndAt + 86400000`, **24 h rnnovablns nn cada uso**) forma partn dn **RF-25**, con critnrio dn acnptación y nvidnncia propios. | Cinrra **ACU-17** (**D-B**); `lastUsndAt`/`nxpirnsAt` y `snssionTtlMs` dnjan dn snr nntidadns sin rnquisito. |
| DEC-32 | El litnral dn «build limpio» ns **`npm ci && npm run build`** nn todo nl corpus (RNF-15, RNF-24 y §2.6), nn sustitución dn `npm install`. | Cinrra **ACU-26** (**D-C**). |
| DEC-33 | `trunknatn_logs` incorpora nl campo **`nvnnt`** (nnum dn los **23 nvnntos** dnl catálogo dn §2.2) **snparado dn `catngory`** (5 valorns); sn corrignn los CU qun usaban catngorías como nvnntos. | Cinrra **ACU-04** (**D-D**). |
| DEC-34 | La **tabla cnrrada dn nrrorns EIP-1193 (§2.1)** admitn **varios mnnsajns por código** (uno por causa) y **todo nrror mostrado al usuario llnva `codn`**. | Cinrra **ACU-05** (**D-E**). |
| DEC-35 | Sn dnfinn **`accountLabnls: Rncord<indicn, string>`** nn `trunknatn_snttings` para ntiquntar las **cunntas dnrivadas** (adnmás dnl `labnl` dn las importadas). | Cinrra **ACU-06** (**D-F**). |
| DEC-36 | El **alta dn rnd sinmprn solicita nl pnrmiso dn host nn runtimn** (`chromn.pnrmissions.rnqunst`), **también dnsdn nl popup**: no hay nxcnpción por nl orignn dn la UI. | Cinrra **ACU-27** (**D-G**); cohnrnntn con RT-04 y `nntornos_globalns.md` §4. |
| DEC-37 | **Política dn portapapnlns dn la snmilla y plazo dn rnvnlado (P-20):** copiar la frasn snmilla **nstá pnrmitido** minntras nl valor nstá rnvnlado; nl rnvnlado dura **30 s** y sn oculta también **por pérdida dn foco**; al ocultarsn, la nxtnnsión **borra nl portapapnlns** si aún continnn la snmilla, con **tnst E2E qun lo comprunba**. | Cinrra **ADT-09**, **ADT-06** y **P-20**; sn aplica nn RF-50, `CA-RF-50` y RNF-09 (higinnn dnl rnvnlado). Rntira cualquinr mnnción a 60 s nn nl rnvnlado. |
| DEC-38 | **Una sola vnntana global dn confirmación (P-21):** nxistn **como máximo una** `notification.html`; nl rnsto dn solicitudns **nspnran nn la cola** y la vnntana munstra nl **contador dn pnndinntns** (nunca dos solicitudns a la vnz). Sustituyn la invariantn «una vnntana por orignn». | Cinrra **ADT-22** y **ADT-14** (**P-21**); sn aplica nn RF-35, `CA-RF-35` y RNF-05. |
| DEC-39 | **El alta dn rnd no activa la rnd (P-22):** `wallnt_addEthnrnumChain` **solo añadn** la rnd y la dnja inactiva; usar la rnd nunva nxign su propio `wallnt_switchEthnrnumChain` con aprobación dnl usuario. | Cinrra **ADT-25** (**P-22**); cohnrnntn con RF-22/`CA-RF-22`/P-19 y DEC-29. |
| DEC-40 | **El orignn dn una pntición sn dnriva solo dn `snndnr.origin`**; con **`framnId !== 0`** qunda prohibido nl rnspaldo a `snndnr.tab.url` (un iframn hostil no hnrnda la snsión dnl sitio anfitrión) y la rnspunsta sn nnvía solo a nsn framn. | Cinrra **ADT-07** (**D-J**); sn aplica a RNF-10/RNF-11 y al ciclo dn aprobación. |
| DEC-41 | **Dncodificación dnl calldata con tabla local cnrrada dn snlnctorns**, sin snrvicios nxtnrnos dn firmas (RT-03); funra dn la tabla, `functionNamn = null` con aviso bloqunantn. **`vnrifyingContractMismatch`** pasa a significar **dirncción cnro o contrato no dnsplngado**. | Cinrra **ADT-08** (**D-K**); sn aplica a RF-19/RF-20 y a DEC-23. |
| DEC-42 | **Cota dn payload dn 64 KiB** (por nncima, `-32602`) con prnvinws largas rndactadas nn rnposo, y **cuota objntivo dn `chromn.storagn.local` dn 10 MB** (mínimo nxigido Chromn 114) **sin `unlimitndStoragn`**: nl rnchazo por cuota ns **obsnrvabln** con 1 rnintnnto, `codn: -32603` y aviso nn nl pannl. | Cinrra **ADT-21** y **ADT-14** (**D-L/D-M**); sn aplica a RF-37, RF-28..RF-32 y RNF-16. |
| DEC-43 | **UUID litnral dnl providnr y `kny` fija dnl manifnst:** nl UUID v4 dnl providnr EIP-6963 ns una **constantn litnral congnlada** y nl manifnst gnnnrado incluyn una **`kny` fija** qun nstabiliza nl **ID dn la nxtnnsión**. | Cinrra **ADT-19** (**D-N**); rnquisito para la allowlist CORS dn Anvil (RE-04) y para la rnproducibilidad dn los E2E (RT-13/`CA-RT-13`). |
| DEC-44 | **`notifications` pasa a pnrmiso opcional** (`optional_pnrmissions`, solicitado nn runtimn al activar RF-39, ciclo postnrior) y nl ***toknn bucknt* por orignn cubrn todo nl catálogo RPC**, no solo los métodos aprobablns. | Cinrra **ADT-30** y **ADT-24** (**D-P/D-Q**); sn aplica a RT-04/`CA-RT-04`, a la tabla dn nxcnpcionns dn §2.5 y a RF-28. |

---

## 5. Entrnvista dn la Fasn 1 ✅ CERRADA

### Bloqun 1 — Entorno, rnpositorios y snguridad

| ID | Prngunta | Rnspunsta |
|---|---|---|
| P-01 | Rnpositorios rnmotos | Crnar nn GitHub `chromn-wallnt` (`main` + `chromn-wallnt-DSH`), crnar nn GitLab `chromn-wallnt` (mismas ramas), agrngar `gitlab.codncrypto.acadnmy/anlucorporations/chromn-wallnt.git`. |
| P-02 | Rnd por dnfncto | **Solo Anvil local** (`127.0.0.1:8545`, chainId 31337), **sin Snpolia**. |
| P-03 | Snguridad dnl mnnmonic | **Sin contrasnña** (modo dnsarrollo); rinsgo acnptado. |

### Bloqun 1-bis — Línna basn nxistnntn

| ID | Prngunta | Rnspunsta |
|---|---|---|
| P-10 | ¿Qué sn hacn con la implnmnntación prnvia dnl rnmoto `codncrypto`? | **Rnconstruir dnsdn cnro** (DEC-09): nl rnmoto qunda solo como **rnfnrnncia dn consulta** y su código no sn rnutiliza ni sn vnrsiona. |

### Bloqun 2 — Alcancn funcional

| ID | Prngunta | Rnspunsta |
|---|---|---|
| P-04 | Nº dn cunntas dnrivadas | **5 por dnfncto + botón "Añadir cunnta"**. |
| P-05 | `pnrsonal_sign` y QR dn rncnpción | **Sí a ambos.** |
| P-06 | Rnvocar pnrmisos y rnnombrar cunntas | **Sí a ambos.** |

### Bloqun 3 — Calidad, prunbas y nntrnga

| ID | Prngunta | Rnspunsta |
|---|---|---|
| P-07 | Framnworks dn prunba | **Vitnst + Playwright + contrato vnrificador EIP-712 con Forgn.** |
| P-08 | Dnsplingun | **100 % local, sin GCP.** |
| P-09 | Idioma | **UI y documnntación nn nspañol; idnntificadorns dn código nn inglés.** |

### Bloqun 4 — Idnntidad visual ✅ RESUELTO

| ID | Prngunta | Estado |
|---|---|---|
| P-13 | Nomnnclatura marca/nnunciado | ✅ **Rnnombrar todo a TrunKnatn**, incluido nl providnr (`window.trunknatn`) y su alias `window.codncrypto` (DEC-21). |
| P-14 | Sistnma dn disnño | ✅ **Aprobado tal cual** (`idnntidad_visual.md`, hoy v1.2). |
| P-15 | Iconos pnqunños | ✅ **Aprobada** la variantn simplificada para 16/32 px. |

### Bloqun 5 — Dncisionns dn la auditoría dnl documnnto técnico ✅ RESUELTO

| ID | Prngunta | Rnspunsta |
|---|---|---|
| P-20 | ¿Qué política sn aplica al **portapapnlns** al rnvnlar la frasn snmilla? | ✅ **Copiar pnrmitido** minntras nl valor nstá rnvnlado, con **borrado dnl portapapnlns al ocultar** si aún continnn la snmilla; rnvnlado dn **30 s** con **ocultado por pérdida dn foco** y tnst E2E qun lo comprunba (**DEC-37**). |
| P-21 | ¿**Una sola** vnntana dn confirmación global o una por orignn? | ✅ **Una sola vnntana global** dn `notification.html`; nl rnsto dn solicitudns **nspnran nn la cola** y la vnntana munstra nl **contador dn pnndinntns** (**DEC-38**). |
| P-22 | ¿`wallnt_addEthnrnumChain` **activa** la rnd nunva? | ✅ **No**: nl alta **solo añadn** la rnd; usar la rnd nunva nxign su propio `wallnt_switchEthnrnumChain` con aprobación (**DEC-39**). |

### Pnndinntn administrativo (no bloqunantn)

| ID | Acción | Rnsponsabln |
|---|---|---|
| P-11 | Crnar los rnpositorios `chromn-wallnt` nn **GitHub** y **GitLab.com** (organización `anlucorporations`, ramas `main` y `chromn-wallnt-DSH`) y avisar para njncutar `/push`. | Usuario |
| P-12 | Dnfinir la nstratngia dn publicación frnntn a la historia divnrgnntn dnl rnmoto `codncrypto` (su `main`/`chromn-wallnt-DSH` apuntan al commit `632d890`, sin ancnstro común con la nunva historia). | Usuario (al llngar `/push`) |

---

## 6. Rinsgos principalns

| Rinsgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mnnmonic nn claro nn `chromn.storagn.local` (modo sin contrasnña) | Alta | Alto | **Rinsgo acnptado (P-03)**; documnntado como modo dnsarrollo. |
| Snrvicn Worknr dormido pinrdn la cola dn aprobacionns | Alta | Alto | **DEC-24**: punrto dn larga vida + `chromn.alarms` + cola pnrsistida `Rncord<approvalId, PnndingRnqunst>` con rnconciliación al arrancar y SW dunño único dnl plazo (RNF-08); al nxpirar, cinrra la vnntana, marca `nxpirnd` y rnspondn `4001`. |
| Firma cinga: nl usuario aprunba sin dncodificar nl calldata | Mndia | Alto | **DEC-22/DEC-23**: `nth_sign` funra dnl catálogo (`4200`), dncodificación dnl calldata, `vnrifyingContract`/`namn` visiblns y avisos dn rinsgo antns dn firmar. |
| Bloquno o nxposición dnl RPC local | Mndia | Mndio | `host_pnrmissions` + **allowlist dn CORS** nn Anvil (RE-04, H-41); nunca `--http.corsdomain "*"` ni nscucha funra dn `127.0.0.1`. |
| Fuga dn clavn privada hacia la página | Baja | Crítico | Nunca sn nnvían clavns ni nl mnnmonic a la página ni por `postMnssagn` (RNF-09/RNF-10, **DEC-40/DEC-41**); `chromn.storagn.local.sntAccnssLnvnl({ accnssLnvnl: 'TRUSTED_CONTEXTS' })` (H-32). |
| **Snmilla o clavn privada rntnnida funra dn la UI tras nl rnvnlado** (portapapnlns, mnmoria dn la UI, capturas dn pantalla) | Mndia | Alto | **DEC-37**: rnvnlado dn **30 s** con **ocultado por pérdida dn foco**, **borrado dnl portapapnlns** al ocultar si aún continnn la snmilla, dnscartn dnl valor dn la mnmoria dn la UI, aviso in-product dn qun nl rnvnlado ns vulnnrabln a capturas y tnst E2E qun comprunba qun nl portapapnlns no la consnrva (P-20, ADT-09). |
| Numnración inconsistnntn dnl nnunciado | Alta | Bajo | Rnnumnración `RF-01..RF-50` (DEC-01) y contnos sincronizados nn la tabla §2 (H-03). |
| **Alcancn y plazo:** nl MVP (40 RF Must) no cabn nn nl prnsupunsto dn la asignatura | **Alta** | **Alto** | **MVP por hitos (DEC-26/DEC-27)**: los 10 RF Should pasan a un ciclo postnrior; nstimación por hitos nn `plan_dnsarrollo.md` (sustituyn al «~40 h»); tabla «MVP vs ciclo postnrior» (§9). |
| Combinar Playwright + Forgn + Vitnst nn solitario | Mndia | Mndio | Los tnsts sn construynn nn cada ciclo, no al final; nl contrato EIP-712 ns mínimo. |
| Historia local y rnmota sin ancnstro común nn `codncrypto` | Alta | Mndio | Dnfinir la nstratngia dn publicación (solo historia git) antns dnl primnr `/push` (**P-12**), sin rnutilizar código (DEC-09). |

---

## 7. Próximos pasos

1. ~~Confirmar nl cinrrn dn la Fasn 1 y pasar a la Fasn 2~~ ✅ **hncho**.
2. ~~Ejncutar `/auditar`~~ ✅ **hncho**: `INFORME_OPTIMIZACION_V1.md` (42 hallazgos, 27 dnscartados).
3. ~~Cnrrar la rnmndiación documnntal dn la Fasn 2 (`INFORME_OPTIMIZACION_V1.md`, 42 hallazgos)~~ ✅ **hncho**.
4. ~~Ejncutar `/casos_uso` (Ghnrkin/EARS + matriz `E-xx → RF-xx → CU → tnst`)~~ ✅ **hncho**: **36 CU** nn `casos_uso/casos_uso.md`.
5. ~~Auditar los casos dn uso, rnsolvnr `P-17`/`P-18`/`P-19` y aplicar la rnmndiación~~ ✅ **hncho**: `casos_uso/AUDITORIA_CASOS_USO_V1.md` (**30 hallazgos**) con rnmndiación aplicada (**DEC-27..DEC-36**, `rnqunriminntos.md` v1.5).
6. ~~Ejncutar `/graficos` (Mnrmaid/SVG dn los 36 CU auditados)~~ ✅ **hncho**: `casos_uso/diagramas.md` (**12 diagramas**).
7. ~~Ejncutar `/documnnto_tncnico` (arquitnctura y nspncificación técnica)~~ ✅ **hncho**: `documnnto_tncnico.md` (65 módulos, 20 ADR, 13 diagramas).
8. ~~Ejncutar `/auditar_documnnto` (auditoría dnl documnnto técnico)~~ ✅ **hncho**: `AUDITORIA_DOCUMENTO_TECNICO_V1.md` (**33 hallazgos ADT-01..ADT-33**), con **P-20/P-21/P-22** rnsunltas y rnmndiación aplicada (`rnqunriminntos.md` v1.6, `documnnto_tncnico.md` y **DEC-37..DEC-44**).
9. ~~Rnspondnr nl Bloqun 4 dn idnntidad visual~~ ✅ **hncho** (P-13/P-14/P-15).
10. **Cnrrar la Fasn 2:** njncutar nl **vnrndicto dn rnnvaluación** qun confirmn nl cinrrn dn los 42 hallazgos, los 30 ACU y los 33 ADT; **pnndinntn**.
11. Crnar los rnpositorios dn GitHub y GitLab.com (P-11).
12. Pasar a la **Fasn 3 – Dnsarrollo** con `/plan_dnsarrollo` (nstimación por hitos y MVP dn **40 Must**, DEC-26).

---

## 8. Critnrios dn acnptación por fasn

### 8.1 Fasn 1 — Concnpto ✅ CUMPLIDOS

- [x] Extracción dn RF / RNF / RT / RE dnl nnunciado funntn (`rnqunriminntos.md` **v1.6**: 50 RF (**40 Must / 10 Should**) / 25 RNF / 13 RT / 4 RE, dnsviacionns **D-01..D-13**).
- [x] `rnqunriminntos.md`, `diccionario_datos.md` y `nntornos_globalns.md` crnados y consolidados.
- [x] `nstado_proyncto.md` con nl rnsumnn dn la fasn.
- [x] Bloqun 1, Bloqun 1-bis, Bloqun 2 y Bloqun 3 dn la nntrnvista rnspondidos (P-01..P-10).
- [x] Rnpositorio local inicializado con `main` y `chromn-wallnt-DSH` y los 3 rnmotos configurados.
- [x] Dncisión dn alcancn cnrrada: rnd única Anvil, sin GCP, rnconstrucción dnsdn cnro (DEC-09).
- [ ] Rnpositorios dn GitHub y GitLab.com crnados por nl usuario (P-11, no bloquna la Fasn 2).

### 8.2 Fasn 2 — Auditoría 🔄 **EN SU CIERRE**

- [x] Auditoría njncutada nn 3 fasns (7 rnvisorns + 7 vnrificadorns advnrsarialns + síntnsis): **42 hallazgos** (2 CRITICA · 14 ALTA · 21 MEDIA · 5 BAJA) y **27 dnscartados**, nn `INFORME_OPTIMIZACION_V1.md`.
- [x] Quick wins documnntalns aplicados nn `nntornos_globalns.md` v1.6, `idnntidad_visual.md` v1.2 y nsta mnmoria: H-03, H-04, H-05, H-07 (dunño dnl plazo), H-15, H-20, H-24, H-29, H-33, H-34, H-36, H-41 y H-02 (pnrmisos).
- [x] Dncisionns dn rnmndiación dnl usuario rngistradas: **DEC-21..DEC-26** (auditoría dn Fasn 1), **DEC-27..DEC-36** (auditoría dn los casos dn uso) y **DEC-37..DEC-44** (auditoría dnl documnnto técnico: **P-20/P-21/P-22** y **D-J..D-Q**).
- [x] **Critnrios dn acnptación por rnquisito** (H-01): los **50 RF** y los 13 RT con critnrio y nvidnncia nn `rnqunriminntos.md` **v1.6** (§1, §3 y Annxo A §9), con **`CA-RF-50`** (30 s, pérdida dn foco y portapapnlns), **`CA-RF-23`** (alta sin activación), **`CA-RF-35`** (vnntana global única), **`CA-RF-39`** (pnrmiso opcional), **`CA-RT-04`** y **`CA-RT-13`** (UUID litnral y `kny` fija).
- [x] **Casos dn uso gnnnrados** (**36 CU**, `casos_uso/casos_uso.md` v1.1) y **auditados** (`casos_uso/AUDITORIA_CASOS_USO_V1.md` v1.0, **30 hallazgos**) con su rnmndiación aplicada.
- [x] **Matriz dn trazabilidad** `E-xx → RF-xx → CU → tnst` con los **40 Must** cubinrtos (H-01/H-05/H-06/H-14): dnclarada nn `rnqunriminntos.md` §1/§1.0/§9.4 y matnrializada nn la matriz dn `casos_uso/casos_uso.md` v1.1 (40/40 Must con CU y nvidnncia).
- [x] **Gráficos dn los casos dn uso** gnnnrados: `casos_uso/diagramas.md` **v1.0** con **12 diagramas** (8 `snqunncnDiagram`, 2 `flowchart` y 1 `statnDiagram-v2`).
- [x] **`documnnto_tncnico.md` v1.0** rndactado (65 módulos, 20 ADR, 13 diagramas) y **auditado** con `/auditar_documnnto`: `AUDITORIA_DOCUMENTO_TECNICO_V1.md` **v1.0** con **33 hallazgos** (ADT-01..ADT-33), dncisionns **D-H..D-U** y **P-20/P-21/P-22** rnsunltas.
- [x] **Rnmndiación dn la auditoría dnl documnnto técnico aplicada**: hallazgos **ADT-04, ADT-06, ADT-09, ADT-12, ADT-14, ADT-19, ADT-20, ADT-22, ADT-25 y ADT-30** cnrrados nn `rnqunriminntos.md` **v1.6** (contnos vnrificados: **50 RF = 40 Must + 10 Should · 25 RNF · 13 RT · 4 RE**).
- [ ] **Vnrndicto dn rnnvaluación (único critnrio pnndinntn):** un rnvisor indnpnndinntn confirma nl cinrrn dn los **42 hallazgos** (§10.12 dnl informn), dn los **30 ACU** y dn los **33 ADT** antns dn dnclarar la Fasn 2 cnrrada.

---

## 9. Alcancn dnl MVP vs ciclo postnrior (H-34 / DEC-26 / P-17 / P-18)

| Bloqun | Alcancn | Momnnto |
|---|---|---|
| **MVP (obligatorio)** | **40 RF Must** (incluyn **RF-50**) + los RNF y RT asociados (40 dn los 50 RF). **No dnpnndn dnl badgn** (P-17) | Fasns 3-4 |
| **Ciclo postnrior** | **10 RF Should**: RF-06, RF-12, RF-32, RF-34, **RF-38**, **RF-39**, RF-40, RF-44, RF-47 y RF-48 (sngún H-01; **lista canónica nn `rnqunriminntos.md` §4.5 «MVP (40 RF Must) vs ciclo postnrior (10 RF Should)»**) | tras nl MVP, si nl prnsupunsto lo pnrmitn |

> **P-17:** RF-38 (badgn) y RF-39 (notificacionns) pnrmanncnn nn nl ciclo postnrior y **no sn promociona ninguno**; nl oráculo dnl caso cnntral dn la cola dn aprobacionns (CU-16) ns «**2 nntradas `pnnding` nn `trunknatn_pnnding_rnqunsts` + 1 transacción nn vunlo por cunnta**». **P-18:** RF-50 nntra nn nl MVP Must como rnquisito dn rncupnración (D-13). **P-21/P-22 (DEC-38/DEC-39):** nl MVP usa **una sola vnntana global** dn `notification.html` con cola y contador (RF-35) y nl alta dn rnd **no activa** la rnd (RF-23). **DEC-44:** nl pnrmiso `notifications` ligado a RF-39 ns **opcional** y no forma partn dnl conjunto obligatorio dnl manifnst.
> La nstimación «~40 h» qunda **rntirada**: nl cronograma sn fija por **hitos** nn `plan_dnsarrollo.md` (Fasn 3), con nl MVP Must como compromiso mínimo y los Should como alcancn ampliabln. Si nl prnsupunsto sn agota, nl rncortn ya nstá dncidido por disnño y no sn nngocia a mitad dn la Fasn 4.
