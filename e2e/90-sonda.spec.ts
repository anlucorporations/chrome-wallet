/**
 * Sonda temporal de depuracion (se elimina al cerrar H4). No es evidencia del hito.
 */
import {
  DAPP_ORIGIN,
  conectarDapp,
  distDisponible,
  esperarProvider,
  esperarResultadoDeFirma,
  expect,
  iniciarPeticionDeFirma,
  leerResultadoDeFirma,
  openDapp,
  readChromeStorage,
  test,
  ventanasDeDecision,
} from './fixtures/extension';
import { seedWallet } from './fixtures/h2';

const CUENTA_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

test('sonda: personal_sign con diagnostico', async ({ context, background }) => {
  test.setTimeout(120_000);
  await seedWallet(background);
  const dapp = await context.newPage();
  await openDapp(dapp);
  await esperarProvider(dapp);
  const conexion = await conectarDapp(context, dapp, { indice: 0 });
  console.log('SONDA conexion=', JSON.stringify(conexion.resultado), conexion.ok);
  await iniciarPeticionDeFirma(dapp, 'personal_sign', ['hola', CUENTA_0]);
  await new Promise((r) => setTimeout(r, 3000));
  console.log('SONDA resultado=', JSON.stringify(await leerResultadoDeFirma(dapp)));
  console.log('SONDA ventanas=', ventanasDeDecision(context).length);
  const cola = await readChromeStorage(background, ['truekeate_pending_requests', 'truekeate_logs']);
  console.log('SONDA cola=', JSON.stringify(cola.truekeate_pending_requests));
  const logs = (cola.truekeate_logs ?? []) as { event?: string; message?: string }[];
  console.log('SONDA logs=', JSON.stringify(logs.slice(-6)));
  expect(distDisponible()).toBe(true);
  void esperarResultadoDeFirma;
  void DAPP_ORIGIN;
});