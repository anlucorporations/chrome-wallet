/**
 * `e2e/12-redes.spec.ts` — Redes: cambio con aprobación y alta sin activación (H5, tareas 5.1 a 5.4).
 *
 * `plan_desarrollo.md` §3.5.7 y §3.5.6:
 *   · `CA-RF-22` — red destino YA activa → respuesta `null` **sin ventana**; hacia otra red → **1**
 *     entrada `pending` y, tras aprobarla, `eth_chainId` con su id y `chainChanged` en todas las
 *     pestañas;
 *   · `CA-RF-23` — el alta exige aprobación; al aprobar, la red aparece con su `chainId` declarado
 *     **sin ser la activa**: solo un `wallet_switchEthereumChain` posterior y aprobado cambia
 *     `eth_chainId`;
 *   · RNF-23 — aviso de red no testnet (tarea 5.3);
 *   · DEC-36/ACU-27 — permiso de host en runtime y su denegación → `4001` y red **no** persistida.
 *
 * SEGUNDA RED: los flujos de cambio y alta necesitan el **Anvil secundario** en `127.0.0.1:8546`
 * con `chainId 31338` (`plan_desarrollo.md` §3.5.7). El `globalSetup` lo arranca si no está; si no
 * responde, los casos marcados con `necesitaSegundaRed` quedan **NO VERIFICADOS** con el motivo
 * escrito —nunca se dan por buenos—.
 *
 * ALCANCE DECLARADO DEL ARNÉS (`E2E_HEADLESS`, documentado en `ACTA_H5.md` §5): Chrome exige un
 * gesto de usuario en el contexto que llama a `chrome.permissions.request` y el aviso nativo de
 * concesión **no es accionable sin interfaz**. Por eso:
 *   · la concesión se verifica con un origen que YA está concedido por `host_permissions`
 *     (`http://127.0.0.1:8545/*`), que es el único camino que no exige responder al aviso;
 *   · la DENEGACIÓN se verifica por el camino real de la dApp (el Service Worker no tiene gesto).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

import {
  EVIDENCE_DIR,
  RUN_DATE,
  RED_SECUNDARIA_EIP3085,
  SECONDARY_ANVIL_CHAIN_ID_HEX,
  SECONDARY_ANVIL_RPC_URL,
  anvilSecundarioResponde,
  aprobarEnLaVentana,
  chainIdPersistido,
  conectarDapp,
  conVentanaDeDecision,
  distDisponible,
  esperarProvider,
  esperarResultadoDeFirma,
  esperarVentanaDeDecision,
  expect,
  iniciarPeticionDeFirma,
  leerEventosDeLaDapp,
  llamarDesdeLaExtension,
  openDapp,
  openPopupReady,
  readChromeStorage,
  redesPersistidas,
  registrarEventosDeLaDapp,
  test,
  ventanasDeDecision,
  type EventoDeLaDapp,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

/**
 * Literal de RNF-23 (`shared/constants.ts` → `NON_TESTNET_WARNING`), TRANSCRITO aquí a propósito:
 * los ficheros de `e2e/**` se ejecutan en Node y NO pueden importar `constants.ts` (lee
 * `import.meta.env`, que solo existe en el empaquetado de Vite). Cualquier cambio del literal en el
 * producto rompe esta aserción, que es justo lo que se quiere.
 */
const NON_TESTNET_WARNING =
  'Atención: no es una red de pruebas. Las operaciones se firman contra una red real y pueden ' +
  'comprometer fondos reales.';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** `chainId` de Anvil (la red activa y predeterminada). */
const ANVIL_CHAIN_ID_HEX = '0x7a69';

/** Motivo del caso no verificado cuando falta el Anvil secundario. */
const MOTIVO_SIN_SEGUNDA_RED = `el Anvil secundario no responde en ${SECONDARY_ANVIL_RPC_URL} (chainId ${SECONDARY_ANVIL_CHAIN_ID_HEX}): caso NO VERIFICADO`;

/** `chainChanged` capturados por una pestaña de la dApp. */
const cambiosDeRed = (page: Parameters<typeof leerEventosDeLaDapp>[0]): Promise<EventoDeLaDapp[]> =>
  leerEventosDeLaDapp(page).then((eventos) =>
    eventos.filter((evento) => evento.eventName === 'chainChanged'),
  );

/** Rellena el formulario de alta de la pestaña «Redes» del popup. */
const rellenarAlta = async (
  popup: Page,
  valores: {
    nombre: string;
    chainId: string;
    rpc: string;
    simbolo?: string;
    testnet?: boolean;
  },
): Promise<void> => {
  await popup.locator('#red-nombre').fill(valores.nombre);
  await popup.locator('#red-chain-id').fill(valores.chainId);
  await popup.locator('#red-rpc').fill(valores.rpc);
  if (valores.simbolo !== undefined) {
    await popup.locator('#red-simbolo').fill(valores.simbolo);
  }
  const casilla = popup.locator('#red-es-testnet');
  const marcada = await casilla.isChecked();
  if (valores.testnet === false && marcada) {
    await casilla.uncheck();
  }
  if (valores.testnet === true && !marcada) {
    await casilla.check();
  }
};

test.describe('12 · Redes: cambio aprobado y alta sin activación', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('la red destino YA activa responde `null` sin abrir la ventana de confirmación (CA-RF-22)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);

    const popup = await openPopupReady(context, extensionId);
    const respuesta = (await llamarDesdeLaExtension(popup, 'wallet_switchEthereumChain', [
      { chainId: ANVIL_CHAIN_ID_HEX },
    ])) as { result?: unknown; error?: { code?: number } };

    expect(respuesta.error, 'el cambio a la red activa no puede fallar').toBeUndefined();
    expect(respuesta.result).toBeNull();
    // SIN ventana de confirmación (P-19/DEC-29) y SIN entrada en la cola.
    expect(ventanasDeDecision(context)).toHaveLength(0);
    const cola = await readChromeStorage(background, ['truekeate_pending_requests']);
    expect(cola.truekeate_pending_requests ?? {}).toEqual({});
    expect(await chainIdPersistido(background)).toBe(ANVIL_CHAIN_ID_HEX);
  });

  test('el alta se aprueba, persiste la red SIN activarla y deja intacto `truekeate_chain_id` (CA-RF-23)', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(120_000);
    await seedWallet(background);

    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Redes' }).click();
    await expect(popup.locator('#redes-alta-aviso')).toContainText('seguirás en la red actual');

    // Origen cuyo permiso de host YA está concedido por `host_permissions` del manifest: es el único
    // camino ejercitable sin poder responder al aviso nativo de Chrome (ver cabecera).
    await rellenarAlta(popup, {
      nombre: 'Anvil Local (re-registro)',
      chainId: ANVIL_CHAIN_ID_HEX,
      rpc: 'http://127.0.0.1:8545',
      simbolo: 'ETH',
      testnet: true,
    });

    const antes = await chainIdPersistido(background);
    // La espera de la ventana única se registra ANTES del clic (evita perder el evento `page`).
    const { ventana } = await conVentanaDeDecision(context, () => popup.locator('#red-alta-enviar').click());
    await aprobarEnLaVentana(ventana);

    await expect(popup.getByText(/añadida a la lista/)).toBeVisible({ timeout: 30_000 });

    const redes = await redesPersistidas(background);
    const anvil = redes[ANVIL_CHAIN_ID_HEX];
    expect(anvil, 'la red no quedó persistida').toBeDefined();
    expect(anvil?.name).toBe('Anvil Local (re-registro)');
    expect(anvil?.isDefault, 'el alta NUNCA marca la red como predeterminada').toBe(false);
    // El alta NO la activa: `truekeate_chain_id` no se toca (ADT-25 / P-22).
    expect(await chainIdPersistido(background)).toBe(antes);
    expect(ventanasDeDecision(context)).toHaveLength(0);

    // El permiso de host quedó concedido y verificado por el Service Worker.
    const concedido = await background.evaluate(
      async () => chrome.permissions.contains({ origins: ['http://127.0.0.1:8545/*'] }),
    );
    expect(concedido, 'el permiso de host del nodo no está concedido').toBe(true);
  });

  test('el aviso de red NO testnet se muestra y la validación inline bloquea el alta (RNF-23)', async ({
    context,
    extensionId,
    background,
  }) => {
    await seedWallet(background);

    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Redes' }).click();

    await rellenarAlta(popup, {
      nombre: 'Ethereum',
      chainId: '0x1',
      rpc: 'https://rpc.example.com',
      simbolo: 'ETH',
      testnet: false,
    });

    // RNF-23: el aviso de red real es visible con su literal exacto.
    const aviso = popup.locator('#red-aviso-testnet');
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveText(NON_TESTNET_WARNING);

    // Validación INLINE: un `rpcUrl` con http fuera del RPC local se rechaza ANTES de enviar nada y
    // no se abre ninguna ventana de confirmación. El texto que se pinta es el literal de §4.3.
    await popup.locator('#red-rpc').fill('http://nodo.example.com');
    await popup.locator('#red-alta-enviar').click();
    await expect(popup.locator('#red-rpc')).toHaveAttribute('aria-invalid', 'true');
    await expect(popup.locator('#red-rpc-error')).toContainText('solo para el RPC local');
    expect(ventanasDeDecision(context)).toHaveLength(0);
    expect(await redesPersistidas(background)).toHaveProperty(ANVIL_CHAIN_ID_HEX);
    expect(Object.keys(await redesPersistidas(background))).not.toContain('0x1');
  });

  test('la denegación del permiso de host responde 4001 y la red NO se persiste (DEC-36)', async ({
    context,
    background,
  }) => {
    test.setTimeout(120_000);
    await seedWallet(background);

    const dapp = await context.newPage();
    await openDapp(dapp);
    await esperarProvider(dapp);
    // El alta desde una página exige una sesión vigente: la cuenta que aprueba es la compartida.
    const conexion = await conectarDapp(context, dapp);
    expect(conexion.ok, `la conexión de la dApp falló: ${conexion.resultado}`).toBe(true);

    // El alta desde la dApp no tiene gesto de usuario: Chrome rechaza `permissions.request` y M25 lo
    // resuelve como denegación → `4001` sin persistir (es el modo de fallo observable de §3.5.8).
    // La espera de la ventana única se registra ANTES de lanzar la petición.
    const { ventana } = await conVentanaDeDecision(context, () =>
      iniciarPeticionDeFirma(dapp, 'wallet_addEthereumChain', [RED_SECUNDARIA_EIP3085]),
    );
    await aprobarEnLaVentana(ventana);
    const desenlace = await esperarResultadoDeFirma(dapp);

    expect(desenlace.estado).toBe('error');
    if (desenlace.estado !== 'error') return;
    expect(desenlace.code).toBe(4001);
    expect(String(desenlace.message)).toContain('No se concedió el permiso de acceso');

    // La red NO se persiste y la red activa no cambia.
    const redes = await redesPersistidas(background);
    expect(redes[SECONDARY_ANVIL_CHAIN_ID_HEX], 'la red denegada se persistió').toBeUndefined();
    expect(await chainIdPersistido(background)).toBe(ANVIL_CHAIN_ID_HEX);
  });

  test('el cambio de red aprobado persiste el chainId y emite `chainChanged` a todas las pestañas (CA-RF-24)', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(120_000);
    const haySegundaRed = await anvilSecundarioResponde();
    test.skip(!haySegundaRed, MOTIVO_SIN_SEGUNDA_RED);
    if (!haySegundaRed) return;

    await seedWallet(background);
    /**
     * La segunda red se siembra ya dada de alta (el alta de una red NUEVA exige responder al aviso
     * nativo de concesión, que el arnés sin interfaz no puede accionar: ver cabecera).
     *
     * El sembrado se **reintenta verificándolo**: escribir `truekeate_networks` despierta al Service
     * Worker y su siembra de arranque (`seedDefaultNetwork`, M23) hace lectura-modificación-escritura
     * del mismo mapa. El producto lo serializa con un cerrojo desde **D-H5-P**, pero una escritura
     * externa (la del arnés, por CDP) no participa de ese cerrojo: si cae en medio, la siembra puede
     * dejar solo Anvil. Reintentar y COMPROBAR es del arnés, no del producto; si no se consigue en
     * 15 s la prueba falla.
     */
    await expect(async () => {
      await background.evaluate(async (red) => {
        await chrome.storage.local.set({
          truekeate_networks: {
            '0x7a69': {
              chainId: '0x7a69',
              chainIdDecimal: 31337,
              name: 'Anvil Local',
              rpcUrl: 'http://127.0.0.1:8545',
              symbol: 'ETH',
              decimals: 18,
              isTestnet: true,
              isDefault: true,
            },
            '0x7a6a': red,
          },
          truekeate_chain_id: '0x7a69',
        });
      }, {
        chainId: SECONDARY_ANVIL_CHAIN_ID_HEX,
        chainIdDecimal: 31338,
        name: 'Anvil Secundario',
        rpcUrl: SECONDARY_ANVIL_RPC_URL,
        symbol: 'ETH',
        decimals: 18,
        isTestnet: true,
        isDefault: false,
      });
      const persistidas = Object.keys(await redesPersistidas(background));
      expect(persistidas.sort()).toEqual([ANVIL_CHAIN_ID_HEX, SECONDARY_ANVIL_CHAIN_ID_HEX].sort());
    }).toPass({ timeout: 15_000, intervals: [250, 500, 1_000] });

    // Dos pestañas de la dApp escuchando los eventos del provider.
    const tabA = await context.newPage();
    await openDapp(tabA);
    const tabB = await context.newPage();
    await openDapp(tabB);
    for (const tab of [tabA, tabB]) {
      await esperarProvider(tab);
      expect(await registrarEventosDeLaDapp(tab)).toBe(5);
    }

    // Guarda de diagnóstico (H5): el catálogo sembrado TIENE que estar persistido antes de abrir el
    // popup; el popup es una proyección pura de `wallet_getState`, así que un fallo aquí acusa al
    // sembrado y no a la vista.
    const sembrado = await redesPersistidas(background);
    expect(
      Object.keys(sembrado).sort(),
      'el catálogo sembrado no tiene las dos redes',
    ).toEqual([ANVIL_CHAIN_ID_HEX, SECONDARY_ANVIL_CHAIN_ID_HEX].sort());

    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Redes' }).click();
    await expect(popup.locator(`li[data-chain-id="${ANVIL_CHAIN_ID_HEX}"]`)).toHaveAttribute(
      'data-active',
      'true',
    );

    // La espera de la ventana única se registra ANTES del clic. El botón se espera explícitamente
    // (visible y habilitado): así un fallo de la lista se reporta como tal y no como un timeout de
    // `click`.
    const botonCambio = popup.locator('#red-cambiar-31338');
    await expect(popup.locator(`li[data-chain-id="${SECONDARY_ANVIL_CHAIN_ID_HEX}"]`)).toBeVisible();
    await expect(botonCambio).toBeVisible({ timeout: 20_000 });
    await expect(botonCambio).toBeEnabled();
    const { ventana } = await conVentanaDeDecision(context, () =>
      botonCambio.click({ timeout: 30_000 }),
    );
    await aprobarEnLaVentana(ventana);

    // La red activa cambia y la vista lo refleja.
    await expect(popup.locator(`li[data-chain-id="${SECONDARY_ANVIL_CHAIN_ID_HEX}"]`)).toHaveAttribute(
      'data-active',
      'true',
      { timeout: 30_000 },
    );
    expect(await chainIdPersistido(background)).toBe(SECONDARY_ANVIL_CHAIN_ID_HEX);

    // `chainChanged` llega a TODAS las pestañas con el `chainId` nuevo (CA-RF-24).
    for (const tab of [tabA, tabB]) {
      await expect
        .poll(async () => (await cambiosDeRed(tab)).length, {
          message: 'la pestaña no recibió chainChanged',
          timeout: 20_000,
        })
        .toBeGreaterThanOrEqual(1);
      const eventos = await cambiosDeRed(tab);
      expect(JSON.stringify(eventos[eventos.length - 1]?.data)).toBe(
        JSON.stringify(SECONDARY_ANVIL_CHAIN_ID_HEX),
      );
    }

    const eventosA = await cambiosDeRed(tabA);
    const eventosB = await cambiosDeRed(tabB);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, `12-redes-${RUN_DATE}.json`),
      `${JSON.stringify(
        {
          flujo: 'cambio de red aprobado con chainChanged en todas las pestañas',
          fecha: RUN_DATE,
          redActivaAnterior: ANVIL_CHAIN_ID_HEX,
          redActivaNueva: SECONDARY_ANVIL_CHAIN_ID_HEX,
          chainIdPersistido: await chainIdPersistido(background),
          redesPersistidas: await redesPersistidas(background),
          chainChangedPestanaA: eventosA,
          chainChangedPestanaB: eventosB,
          cuentaDeLaCartera: ANVIL_ADDRESSES[0],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });
});
