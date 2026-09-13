#!/usr/bin/env node
/**
 * `contracts/scripts/generar-fixture-wallet.mjs`
 *
 * Genera y **comprueba** el fixture `contracts/test/fixtures/eip712-wallet-signature.json`, el que
 * produce la propia cartera (M11 `src/background/crypto/sign.ts`, vía `eth_signTypedData_v4`).
 *
 * Por qué es un script y no un test de Vitest: este fixture pertenece al frente del **contrato**
 * (ámbito de la Fase 4) y su comprobación es reproducible desde la raíz del repositorio con
 * `npm run`/`node` sin tocar la suite de Vitest ni el arnés E2E.
 *
 * Uso:
 *   node contracts/scripts/generar-fixture-wallet.mjs            # comprueba el fixture versionado
 *   node contracts/scripts/generar-fixture-wallet.mjs --write    # regenera y sobrescribe el fixture
 *   node contracts/scripts/generar-fixture-wallet.mjs --comprobar # solo comprueba (por defecto)
 *
 * El mensaje firmado es EXACTAMENTE el del fixture versionado (`FIXTURE.message`); lo único que se
 * recalcula es el `digest` y la firma, con la misma clave de prueba (cuenta #1 de Anvil). Así el
 * fixture no se puede "colar" alterado: si alguien cambia el mensaje o el dominio sin refirmar, el
 * script falla con exit 1.
 *
 * Nota (límite honesto): este script NO importa `sign.ts` (módulo del Service Worker con dependencias
 * de `chrome`). Reproduce su MISMA operación de firma —`TypedDataEncoder.hash` para el `digest` y
 * `Wallet.signTypedData` para la firma, ambos de `ethers` v6—, que es la correspondencia que el test
 * de Foundry verifica on-chain. El módulo real está cubierto por `src/background/crypto/typedData.spec.ts`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Signature, TypedDataEncoder, Wallet, recoverAddress } from 'ethers';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(AQUI, '..', 'test', 'fixtures', 'eip712-wallet-signature.json');

/** Cuenta #1 de Anvil: SOLO PRUEBAS (documentada en `contracts/README.md`). */
const CLAVE_DE_PRUEBA =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const escribir = process.argv.includes('--write');

/** Serializa el fixture con el mismo estilo (2 espacios) del versionado. */
const serializar = (objeto) => `${JSON.stringify(objeto, null, 2)}\n`;

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const { domain, types, primaryType, message } = fixture;

// `sign.ts` elimina `EIP712Domain` de `types` antes de firmar (el dominio no es un tipo firmable).
const tiposFirmables = Object.fromEntries(
  Object.entries(types).filter(([nombre]) => nombre !== 'EIP712Domain'),
);

const wallet = new Wallet(CLAVE_DE_PRUEBA);
const digest = TypedDataEncoder.hash(domain, tiposFirmables, message);
const signature = await wallet.signTypedData(domain, tiposFirmables, message);

// `ethers` v6 no expone `TypedDataEncoder.recover`: se recupera con `recoverAddress` sobre el
// `digest` canónico, que es exactamente lo que hace el contrato con `ecrecover` (igual que
// `recoverTypedDataSigner` de `src/background/crypto/sign.ts`).
const firma = Signature.from(signature);
const recuperadoReal = recoverAddress(digest, signature);

const fallos = [];
const comprobar = (condicion, mensaje) => {
  if (!condicion) {
    fallos.push(mensaje);
  }
};

comprobar(
  wallet.address === fixture.signer,
  `el firmante derivado (${wallet.address}) no es el del fixture (${fixture.signer})`,
);
comprobar(recuperadoReal === fixture.signer, `la firma recupera ${recuperadoReal}, no ${fixture.signer}`);
comprobar(digest === fixture.digest, `el digest recalculado (${digest}) no es el del fixture (${fixture.digest})`);
comprobar(
  digest === fixture.expectedDigest,
  `expectedDigest (${fixture.expectedDigest}) no coincide con el digest recalculado (${digest})`,
);
comprobar(firma.yParity === 0 || firma.yParity === 1, 'la firma debe tener paridad 0/1');
comprobar(
  BigInt(firma.s) <=
    0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n,
  'la firma debe estar en la mitad baja del orden (EIP-2, anti maleabilidad)',
);
comprobar(signature.length === 132, `la firma debe ser 0x + 130 hex (es ${signature.length})`);

console.log(`fichero            : ${FIXTURE}`);
console.log(`firmante (M11)     : ${wallet.address}`);
console.log(`domainSeparator    : ${TypedDataEncoder.hashDomain(domain)}`);
console.log(`digest             : ${digest}`);
console.log(`firma              : ${signature}`);
console.log(`recuperado         : ${recuperadoReal}`);
console.log(`s (mitad baja EIP-2): ${BigInt(firma.s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n}`);

if (escribir) {
  fixture.digest = digest;
  fixture.expectedDigest = digest;
  fixture.signature = signature;
  fixture.signer = wallet.address;
  writeFileSync(FIXTURE, serializar(fixture), 'utf8');
  console.log('fixture regenerado (--write).');
}

if (fallos.length > 0) {
  console.error('\nFALLOS:');
  for (const fallo of fallos) {
    console.error(` - ${fallo}`);
  }
  process.exit(1);
}
console.log('\nOK: el fixture de la wallet es coherente con M11 (digest, firma y firmante).');
