/**
 * `e2e/33-envio-desde-el-popup.spec.ts` — La pestaña «Enviar» del POPUP: a dirección externa y
 * entre cuentas propias (Fase 4 · RF-08 / `CA-RF-08`, `CA-RF-33`; `documento_tecnico.md` §5.2).
 *
 * HUECO QUE CIERRA (y DEFECTO que reveló): `SendView.tsx` (M42) es la superficie de envío del
 * usuario —el popup declara «enviar (a dirección externa y entre cuentas propias)»— y **ninguna**
 * prueba E2E la recorría: `24-accesibilidad.spec.ts` solo pulsaba su pestaña. Al recorrerla de
 * verdad, el flujo estaba ROTO: el popup recibía
 * `4200 «El método solicitado no está soportado por TrueKeate Wallet»` y **la ventana única no se
 * abría nunca** (ver `src/background/rpc/router.ts`, paso 6, y `approvals/dispatch.ts`
 * `resolveApprovalOrigin`). El oráculo de esta prueba es externo al producto: el RECIBO del nodo.
 *
 * Evidencia: `RepoTecnico/evidencia/Fase4/33-envio-desde-el-popup-<fecha>.json`.
 */

import {
  DAPP_ORIGIN,
  ESPERA_FIRMA_MS,
  ANVIL_RPC_URL,
  aprobarEnLaVentana,
  archivarEvidencia,
  conVentanaDeDecision,
  consultarAlNodo,
  contarPendientes,
  distDisponible,
  expect,
  openPopupReady,
  test,
  ventanasDeDecision,
} from './fixtures/extension';
import { ANVIL_ADDRESSES, seedWallet } from './fixtures/h2';

const MOTIVO_SIN_DIST =
  'no existe dist/manifest.json: ejecuta «npm run build» antes de «npm run test:e2e»';

/** Cuenta #0 de Anvil: la activa del popup y el origen por defecto del formulario. */
const CUENTA_0 = ANVIL_ADDRESSES[0];

/** Cuenta #1 de Anvil: destino EXTERNO (no se elige del selector de cuentas propias). */
const CUENTA_1 = ANVIL_ADDRESSES[1];

/** Cuenta #3 de Anvil (`idx:2`): destino propio en la segunda prueba. */
const CUENTA_3 = ANVIL_ADDRESSES[2];

/**
 * Entrada del registro que demuestra una firma ANTERIOR: evita el aviso bloqueante de «primera
 * firma» (RNF-23), que tiene su propia prueba en `26-avisos.spec.ts`. El plazo de firma inyectado
 * por el arnés es de 3 s (`VITE_SIGN_TIMEOUT_MS`), así que estas pruebas no pueden gastar
 * interacciones en un aviso ajeno a lo que miden.
 */
const FIRMA_PREVIA = {
  event: 'approval_resolved',
  category: 'approval',
  level: 'info',
  message: 'firma previa sembrada por la prueba del envío desde el popup',
  ts: 1,
  origin: 'extension',
  method: 'eth_sendTransaction',
  data: { status: 'approved' },
};

/** Campos de una transacción tal y como los devuelve `eth_getBlockByNumber` con `fullTx`. */
interface TransaccionEnBloque {
  hash: string;
  from?: string;
  to?: string;
  value?: string;
  blockNumber?: string;
}

/** Campos del recibo que se contrastan. */
interface ReciboDeTransaccion {
  status?: string;
  from?: string;
  to?: string;
  blockNumber?: string;
}

/** Convierte una cantidad decimal de ETH a wei, sin coma flotante (RT-02). */
function etherAWei(decimal: string): bigint {
  const [entera = '0', fraccion = ''] = decimal.split('.');
  return BigInt(entera) * 10n ** 18n + BigInt(`${fraccion}000000000000000000`.slice(0, 18));
}

/**
 * Busca en los últimos bloques la transacción `from → to` con ese valor exacto.
 * Es el oráculo externo: lo que el nodo tiene, no lo que la UI dice.
 */
async function buscarTransaccion(
  from: string,
  to: string,
  valueWei: bigint,
): Promise<TransaccionEnBloque | null> {
  const altura = BigInt(String(await consultarAlNodo('eth_blockNumber')));
  for (let salto = 0n; salto <= 4n && altura - salto >= 0n; salto += 1n) {
    const bloque = (await consultarAlNodo('eth_getBlockByNumber', [
      `0x${(altura - salto).toString(16)}`,
      true,
    ])) as { transactions?: TransaccionEnBloque[] } | null;
    const encontrada = (bloque?.transactions ?? []).find(
      (tx) =>
        tx.from?.toLowerCase() === from.toLowerCase() &&
        tx.to?.toLowerCase() === to.toLowerCase() &&
        BigInt(tx.value ?? '0x0') === valueWei,
    );
    if (encontrada !== undefined) return encontrada;
  }
  return null;
}

/** Recibo del nodo para un hash, esperando a que esté minado (`status` presente). */
async function reciboDe(hash: string): Promise<ReciboDeTransaccion> {
  const observado: { recibo: ReciboDeTransaccion | null } = { recibo: null };
  await expect
    .poll(
      async () => {
        const recibo = (await consultarAlNodo('eth_getTransactionReceipt', [
          hash,
        ])) as ReciboDeTransaccion | null;
        observado.recibo = recibo;
        return recibo?.status ?? null;
      },
      { message: 'la transacción enviada desde el popup no llegó a confirmarse', timeout: 30_000 },
    )
    .toBe('0x1');
  if (observado.recibo === null) throw new Error('[e2e] el recibo desapareció tras confirmarse');
  return observado.recibo;
}

/** Espera a que el nodo tenga la transacción `from → to` por ese valor exacto (oráculo externo). */
async function esperarTransaccion(
  from: string,
  to: string,
  valueWei: bigint,
): Promise<TransaccionEnBloque> {
  const hallada: { tx: TransaccionEnBloque | null } = { tx: null };
  await expect
    .poll(
      async () => {
        hallada.tx = await buscarTransaccion(from, to, valueWei);
        return hallada.tx?.hash ?? null;
      },
      { message: `el nodo no tiene la transacción ${from} → ${to}`, timeout: 30_000 },
    )
    .not.toBeNull();
  if (hallada.tx === null) {
    throw new Error(`[e2e] la transacción ${from} → ${to} no apareció en el nodo`);
  }
  return hallada.tx;
}

test.describe('33 · «Enviar» del popup: destino externo y cuentas propias (RF-08 / CA-RF-08)', () => {
  test.skip(!distDisponible(), MOTIVO_SIN_DIST);

  test('el popup envía 1 ETH a una dirección EXTERNA por la ventana única y el recibo es status 1', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background, { logs: [FIRMA_PREVIA] });
    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Enviar' }).click();
    await expect(popup.getByRole('tab', { name: 'Enviar' })).toHaveAttribute('aria-selected', 'true');

    // La cuenta activa se propone como origen y el modo por defecto es la dirección externa.
    await expect(popup.locator('#enviar-origen')).toHaveValue('idx:0');
    await expect(popup.locator('#enviar-modo-external')).toBeChecked();

    await popup.locator('#enviar-destino').fill(CUENTA_1);
    await popup.locator('#enviar-importe').fill('1');
    await popup.getByRole('button', { name: 'Calcular comisión' }).click();

    // La estimación muestra la comisión, el total, el saldo y el límite de gas ANTES de decidir.
    const resumen = popup.locator('.tk-summary');
    await expect(resumen).toBeVisible({ timeout: 30_000 });
    for (const etiqueta of ['Comisión estimada', 'Total', 'Saldo disponible', 'Límite de gas estimado']) {
      await expect(resumen.locator('.tk-summary__label', { hasText: etiqueta })).toBeVisible();
    }
    const enviar = popup.getByRole('button', { name: 'Enviar' });
    await expect(enviar).toBeEnabled();

    // `eth_sendTransaction` es APROBABLE: el popup NO firma, abre la ventana única (M42 §3.1).
    const { ventana } = await conVentanaDeDecision(context, () => enviar.click());
    await expect(ventana.locator('.tk-header__badge')).toHaveText('1 solicitud en espera');
    expect(ventanasDeDecision(context)).toHaveLength(1);
    await expect(ventana.locator('.tk-origin .tk-section__title')).toHaveText('Envío de transacción');
    const origen = (await ventana.locator('.tk-origin__url').textContent())?.trim() ?? '';
    await expect(ventana.locator('.tk-summary__label', { hasText: 'Destino' })).toBeVisible();

    await aprobarEnLaVentana(ventana);

    // El popup anuncia el hash difundido (no se queda en «Procesando…»).
    const aviso = popup.locator('.tk-status__message', { hasText: 'Transacción difundida' });
    await expect(aviso).toBeVisible({ timeout: 45_000 });

    // --- Oráculo EXTERNO: el nodo tiene la transacción y su recibo es status 1 ------------------
    const tx = await esperarTransaccion(CUENTA_0, CUENTA_1, etherAWei('1'));
    const recibo = await reciboDe(tx.hash);
    expect(recibo.from?.toLowerCase()).toBe(CUENTA_0.toLowerCase());
    expect(recibo.to?.toLowerCase()).toBe(CUENTA_1.toLowerCase());

    // La UI y el nodo hablan del MISMO hash (el aviso lo pinta truncado `0x1234…abcd`).
    const textoDelAviso = (await aviso.textContent()) ?? '';
    expect(textoDelAviso).toContain(`${tx.hash.slice(0, 6)}…${tx.hash.slice(-4)}`);

    // La cola persistida queda vacía tras aprobar (CA-RF-41).
    await expect.poll(() => contarPendientes(background), { timeout: 20_000 }).toBe(0);

    archivarEvidencia('33-envio-desde-el-popup', {
      flujo: 'popup → «Enviar» → dirección externa',
      origenMostradoEnLaVentana: origen,
      contadorVentana: '1 solicitud en espera',
      hash: tx.hash,
      reciboStatus: recibo.status,
      desde: recibo.from,
      hasta: recibo.to,
      colaFinal: 0,
      rpc: ANVIL_RPC_URL,
    });
  });

  test('«Cuenta propia de la cartera»: se envía a otra cuenta de la cartera y el selector excluye el origen', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(240_000);
    await seedWallet(background, { logs: [FIRMA_PREVIA] });
    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Enviar' }).click();

    // Modo «Cuenta propia de la cartera»: aparece un selector con las DEMÁS cuentas.
    await popup.locator('#enviar-modo-own').check();
    const selector = popup.locator('#enviar-destino-cuenta');
    await expect(selector).toBeVisible();
    const referencias = await selector.locator('option').evaluateAll((opciones) =>
      opciones.map((opcion) => (opcion as HTMLOptionElement).value),
    );
    expect(referencias, 'el selector de destino propio no puede ofrecer la cuenta de origen').not.toContain(
      'idx:0',
    );
    expect(referencias).toContain('idx:2');

    await selector.selectOption('idx:2');
    await popup.locator('#enviar-importe').fill('0.5');
    await popup.getByRole('button', { name: 'Calcular comisión' }).click();
    await expect(popup.locator('.tk-summary')).toBeVisible({ timeout: 30_000 });
    // El destino propio se resuelve a la dirección de la cuenta elegida.
    await expect(popup.locator('.tk-summary__label', { hasText: 'Total' })).toBeVisible();

    const { ventana } = await conVentanaDeDecision(context, () =>
      popup.getByRole('button', { name: 'Enviar' }).click(),
    );
    await expect(ventana.locator('.tk-header__badge')).toHaveText('1 solicitud en espera');
    await aprobarEnLaVentana(ventana);
    await expect(popup.locator('.tk-status__message', { hasText: 'Transacción difundida' })).toBeVisible({
      timeout: 45_000,
    });

    const valor = etherAWei('0.5');
    const tx = await esperarTransaccion(CUENTA_0, CUENTA_3, valor);
    const recibo = await reciboDe(tx.hash);
    expect(recibo.from?.toLowerCase()).toBe(CUENTA_0.toLowerCase());
    expect(recibo.to?.toLowerCase()).toBe(CUENTA_3.toLowerCase());

    archivarEvidencia('33-envio-desde-el-popup', {
      flujo: 'popup → «Enviar» → cuenta propia de la cartera',
      referenciasOfrecidas: referencias,
      origenExcluido: !referencias.includes('idx:0'),
      hash: tx.hash,
      reciboStatus: recibo.status,
      desde: recibo.from,
      hasta: recibo.to,
    });
  });

  test('la validación inline bloquea el envío sin abrir ventana: dirección inválida y saldo insuficiente (CA-RF-33)', async ({
    context,
    extensionId,
    background,
  }) => {
    test.setTimeout(180_000);
    await seedWallet(background, { logs: [FIRMA_PREVIA] });
    const popup = await openPopupReady(context, extensionId);
    await popup.getByRole('tab', { name: 'Enviar' }).click();
    const enviar = popup.getByRole('button', { name: 'Enviar' });

    // --- Dirección inválida: error inline, SIN estimación y SIN ventana -------------------------
    await popup.locator('#enviar-destino').fill('no-es-una-direccion');
    await popup.locator('#enviar-importe').fill('1');
    await popup.getByRole('button', { name: 'Calcular comisión' }).click();
    await expect(popup.locator('#enviar-destino')).toHaveAttribute('aria-invalid', 'true');
    await expect(popup.locator('#enviar-destino-error')).toBeVisible();
    await expect(popup.locator('.tk-summary')).toHaveCount(0);
    await expect(enviar).toBeDisabled();
    expect(ventanasDeDecision(context)).toHaveLength(0);
    expect(await contarPendientes(background)).toBe(0);

    // --- Valor por encima del saldo: se bloquea con el `code` de la tabla y SIN ventana ---------
    // MEDICIÓN HONESTA: con el nodo local, un valor mayor que el saldo hace que `eth_estimateGas`
    // falle ANTES de la aritmética de saldo (el propio nodo rechaza la transferencia), así que el
    // camino observable es el bloqueo por estimación fallida —`-32000`, RNF-25— y no el literal
    // «Saldo insuficiente…» de `SendView`, que solo se alcanza si el saldo cambia entre la
    // estimación y el envío. Lo que se exige es lo que importa: `-32000`, envío bloqueado, sin
    // ventana y sin entrada en la cola.
    //
    // HALLAZGO ADJUNTO (queda archivado en la evidencia, NO se corrige aquí): el `motivo` que
    // acompaña al `-32000` es «Sin conexión con la red local (Anvil)», que es el literal de `4900` y
    // NO describe lo ocurrido (el nodo respondió `-32003 Insufficient funds for gas * price +
    // value`). Causa: `src/background/rpc/pageMethods.ts:192-194` reenvía el resultado crudo de
    // `rpcSend`, y `src/background/rpc/client.ts:209-219` convierte en `4900` cualquier fallo que
    // agote los 4 intentos, incluido un rechazo determinista del nodo. Corregirlo exige distinguir
    // «el nodo respondió con error» de «no hubo respuesta» —hoy ambiguo en el navegador, porque
    // `fetch` no da `ECONNREFUSED` y `27-rpc-caido.spec.ts` admite `rpc-error` como motivo— y una
    // fila/clase de fallo nueva en el catálogo de §4.3, que es de OTRO frente: inventar el literal
    // está prohibido por las reglas de esta fase.
    await popup.locator('#enviar-destino').fill(CUENTA_1);
    await popup.locator('#enviar-importe').fill('1000000');
    await popup.getByRole('button', { name: 'Calcular comisión' }).click();
    const errorDeEnvio = popup.locator('.tk-status--error').first();
    await expect(errorDeEnvio).toBeVisible({ timeout: 30_000 });
    await expect(errorDeEnvio.locator('.tk-status__code')).toHaveText('-32000');
    const motivoDelBloqueo = ((await errorDeEnvio.locator('.tk-status__message').textContent()) ?? '').trim();
    await expect(enviar).toBeDisabled();
    expect(ventanasDeDecision(context)).toHaveLength(0);
    // Sin ventana no hay plazo que consumir: no se encola nada (RNF-25).
    expect(await contarPendientes(background)).toBe(0);

    archivarEvidencia('33-envio-desde-el-popup', {
      flujo: 'validación inline del formulario de envío del popup',
      direccionInvalida: {
        ariaInvalid: 'true',
        errorVisible: true,
        estimacionBloqueada: true,
        ventanas: 0,
      },
      valorPorEncimaDelSaldo: {
        code: -32000,
        motivo: motivoDelBloqueo,
        bloqueaEnvio: true,
        ventanas: 0,
        colaVacia: true,
      },
      origenDeLaPrueba: DAPP_ORIGIN,
      plazoNoConsumido: 'no se creó ninguna entrada en truekeate_pending_requests',
      esperaFirmaMs: ESPERA_FIRMA_MS,
    });
  });
});
