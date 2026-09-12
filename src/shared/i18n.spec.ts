// @vitest-environment node
/**
 * `src/shared/i18n.spec.ts` — Corpus de textos de la UI (M66; `CA-RT-10` / RF-34) y los avisos
 * in-product de **RNF-23** (tarea 6.3 del plan §3.6.5).
 *
 * QUÉ FIJA
 * --------
 * 1. El **descriptor de marca es exactamente** `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`
 *    (barras ASCII, ni `¦` ni guiones), tal y como exigen §8 de la identidad visual y RNF-23.
 * 2. Los **formatos canónicos** que el corpus cita literalmente: `1,0000 ETH` y `0x1234…abcd`.
 * 3. Los tres avisos de RNF-23 tienen texto: el del **primer arranque** (en `popup/App.tsx`), el de
 *    **«Acerca de»** y el de **antes de la primera firma**; y el de «Acerca de» nombra las licencias
 *    empaquetadas y el fichero `NOTICE`.
 * 4. El oráculo de la primera firma ({@link yaFirmoAntes}) reconoce los tres eventos de firma del
 *    catálogo cerrado y **no** se dispara con eventos que no son firmas.
 *
 * El idioma de los textos VISIBLES lo comprueba `src/popup/i18n.spec.ts` con el AST de TypeScript
 * (regla reformulada en H2 por `D-H2-A`): aquí se comprueba el CONTENIDO de los avisos y su
 * trazabilidad, que es lo que ningún `grep` puede verificar.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ACERCA_DE_AVISO,
  ACERCA_DE_BOTON,
  ACERCA_DE_RESUMEN,
  ACERCA_DE_TITULO,
  ACERCA_DE_VERSION,
  AVISO_PRIMERA_FIRMA_ACUSE,
  AVISO_PRIMERA_FIRMA_ACUSE_ID,
  AVISO_PRIMERA_FIRMA_CUERPO,
  AVISO_PRIMERA_FIRMA_ENTORNO,
  AVISO_PRIMERA_FIRMA_TITULO,
  DIRECCION_EJEMPLO,
  EVENTOS_DE_FIRMA,
  IMPORTE_EJEMPLO,
  LICENCIAS_EMPAQUETADAS,
  LICENCIAS_NOTAS,
  LICENCIAS_TITULO,
  METODOS_QUE_FIRMAN,
  NOMBRE_PRODUCTO,
  TAGLINE_MARCA,
  VERSION_PRODUCTO,
  yaFirmoAntes,
} from './i18n';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');

/** Textos de un módulo, leído como cadena (para comprobar que el aviso está EN la superficie). */
const fuente = (relativa: string): string => readFileSync(resolve(RAIZ, relativa), 'utf8');

describe('CA-RT-10 · identidad de marca y formatos canónicos', () => {
  it('la tagline es EXACTAMENTE la del corpus, con barras verticales ASCII', () => {
    expect(TAGLINE_MARCA).toBe('PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS');
    expect(TAGLINE_MARCA).not.toContain('¦');
    expect(TAGLINE_MARCA).not.toContain('-');
    expect(TAGLINE_MARCA.split('|')).toHaveLength(3);
    expect(TAGLINE_MARCA).toBe(TAGLINE_MARCA.toUpperCase());
  });

  it('el nombre del producto usa las mayúsculas de la marca', () => {
    expect(NOMBRE_PRODUCTO).toBe('TrueKeate Wallet');
    expect(VERSION_PRODUCTO).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('los ejemplos canónicos son `1,0000 ETH` y `0x1234…abcd`', () => {
    expect(IMPORTE_EJEMPLO).toBe('1,0000 ETH');
    expect(DIRECCION_EJEMPLO).toBe('0x1234…abcd');
    expect(DIRECCION_EJEMPLO.charCodeAt(6)).toBe(0x2026);
  });
});

describe('RNF-23 · «Acerca de» tiene logotipo, tagline, aviso, licencias y NOTICE', () => {
  it('el título y el botón están en español y son accionables por teclado', () => {
    expect(ACERCA_DE_TITULO).toContain('TrueKeate Wallet');
    expect(ACERCA_DE_BOTON).toBe('Acerca de');
  });

  it('el resumen y el aviso de entorno describen el producto y su límite', () => {
    expect(ACERCA_DE_RESUMEN).toContain('Anvil');
    expect(ACERCA_DE_RESUMEN).toContain('fondos reales');
    expect(ACERCA_DE_AVISO).toContain('Entorno de desarrollo');
    // El aviso de «Acerca de» y el del primer arranque dicen lo mismo (RNF-23): sin contraseña.
    expect(ACERCA_DE_AVISO).toContain('sin contraseña');
  });

  it('nombra las TRES licencias empaquetadas de las tipografías y el fichero NOTICE', () => {
    expect(LICENCIAS_TITULO.toLowerCase()).toContain('licencias');
    expect(LICENCIAS_EMPAQUETADAS.map((licencia) => licencia.nombre)).toEqual([
      'Poppins',
      'Inter',
      'JetBrains Mono',
    ]);
    for (const licencia of LICENCIAS_EMPAQUETADAS) {
      expect(licencia.fichero).toMatch(/^fonts\/LICENSE-[a-z-]+\.txt$/);
    }
    const texto = LICENCIAS_NOTAS.join(' ');
    expect(texto).toContain('OFL-1.1');
    expect(texto).toContain('NOTICE');
    expect(texto).toContain('LICENSE');
    expect(texto).toContain('repositorio');
  });

  it('muestra la versión del producto (la misma que declara el manifest)', () => {
    expect(ACERCA_DE_VERSION).toBe(`Versión ${VERSION_PRODUCTO}`);
    expect(VERSION_PRODUCTO).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('RNF-23 · aviso antes de la primera firma', () => {
  it('explica qué se firma, insiste en el entorno y exige un acuse explícito', () => {
    expect(AVISO_PRIMERA_FIRMA_TITULO).toBe('Antes de tu primera firma');
    expect(AVISO_PRIMERA_FIRMA_CUERPO).toContain('firmar');
    expect(AVISO_PRIMERA_FIRMA_CUERPO).toContain('no mueve fondos');
    expect(AVISO_PRIMERA_FIRMA_CUERPO).toContain('frase de recuperación');
    expect(AVISO_PRIMERA_FIRMA_ENTORNO).toContain('desarrollo');
    expect(AVISO_PRIMERA_FIRMA_ACUSE).toContain('He leído');
    expect(AVISO_PRIMERA_FIRMA_ACUSE_ID).toBe('tk-primera-firma-ack');
  });

  it('`yaFirmoAntes` reconoce los TRES eventos de firma directa del catálogo cerrado', () => {
    expect([...EVENTOS_DE_FIRMA]).toEqual(['sign_personal', 'sign_typed_data', 'tx_sent']);
    expect(yaFirmoAntes([{ evento: 'sign_personal' }])).toBe(true);
    expect(yaFirmoAntes([{ evento: 'sign_typed_data' }])).toBe(true);
    expect(yaFirmoAntes([{ evento: 'tx_sent' }])).toBe(true);
    expect(yaFirmoAntes([{ evento: 'rpc_call' }, { evento: 'tx_sent' }])).toBe(true);
  });

  it('reconoce la aprobación humana de una firma (`approval_resolved` + `approved`)', () => {
    expect([...METODOS_QUE_FIRMAN]).toEqual([
      'personal_sign',
      'eth_signTypedData_v4',
      'eth_sendTransaction',
    ]);
    // Estructura REAL de `truekeate_logs`: `method` en la entrada y `status` dentro de `data`.
    const aprobadaDeFirma = {
      evento: 'approval_resolved',
      metodo: 'personal_sign',
      datos: { approvalId: 'x', entrega: 'none', errorCode: null, status: 'approved' },
    };
    expect(yaFirmoAntes([aprobadaDeFirma])).toBe(true);
    expect(
      yaFirmoAntes([
        { evento: 'approval_resolved', metodo: 'eth_sendTransaction', datos: { status: 'approved' } },
      ]),
    ).toBe(true);
    expect(
      yaFirmoAntes([
        { evento: 'approval_resolved', metodo: 'eth_signTypedData_v4', datos: { status: 'approved' } },
      ]),
    ).toBe(true);
  });

  it('NO se dispara con un rechazo, con un cambio de red aprobado ni con el registro vacío', () => {
    expect(yaFirmoAntes([])).toBe(false);
    // Rechazo: la solicitud se resolvió, pero NO se firmó nada.
    expect(
      yaFirmoAntes([{ evento: 'approval_resolved', metodo: 'personal_sign', datos: { status: 'rejected' } }]),
    ).toBe(false);
    // Los métodos de RED se aprueban sin firmar: no cuentan como firma.
    expect(
      yaFirmoAntes([
        { evento: 'approval_resolved', metodo: 'wallet_switchEthereumChain', datos: { status: 'approved' } },
      ]),
    ).toBe(false);
    expect(
      yaFirmoAntes([
        { evento: 'approval_resolved', metodo: 'wallet_addEthereumChain', datos: { status: 'approved' } },
      ]),
    ).toBe(false);
    // Eventos sin relación con firmar.
    expect(yaFirmoAntes([{ evento: 'wallet_created' }, { evento: 'approval_created' }])).toBe(false);
    // Una entrada malformada no puede contar como firma.
    expect(yaFirmoAntes([{ evento: 'approval_resolved' }])).toBe(false);
    expect(yaFirmoAntes([{ evento: 'approval_resolved', metodo: 'personal_sign' }])).toBe(false);
    expect(yaFirmoAntes([{ evento: 'approval_resolved', datos: 'aprobado' }])).toBe(false);
    expect(yaFirmoAntes([{ evento: 'sign_personal_extra' }])).toBe(false);
  });
});

describe('RNF-23 · los tres avisos están EN las superficies que los muestran', () => {
  it('el aviso del primer arranque vive en el popup y bloquea la interfaz', () => {
    const app = fuente('src/popup/App.tsx');
    expect(app).toContain('tk-dialog--notice');
    expect(app).toContain('Entorno de desarrollo — no usar con fondos reales');
    expect(app).toContain('He entendido, continuar');
  });

  it('el «Acerca de» está en las TRES ventanas de la extensión', () => {
    for (const relativa of ['src/popup/App.tsx', 'src/connect/App.tsx', 'src/notification/App.tsx']) {
      const texto = fuente(relativa);
      expect(texto, `${relativa} no monta el diálogo «Acerca de»`).toContain('AboutDialog');
      expect(texto, `${relativa} no ofrece el botón de «Acerca de»`).toContain('ACERCA_DE_BOTON');
    }
  });

  it('el aviso de la primera firma vive en la ventana única y condiciona «Aprobar»', () => {
    const app = fuente('src/notification/App.tsx');
    expect(app).toContain('FirstSignatureNotice');
    expect(app).toContain('firstSignatureBlocked');
    expect(app).toContain('readLogSignatures');
  });

  it('la dApp de pruebas muestra la tagline y el logotipo horizontal', () => {
    const dapp = fuente('test.html');
    expect(dapp).toContain(TAGLINE_MARCA);
    expect(dapp).toContain('brand/truekeate-titulo.png');
    expect(dapp).toContain('--tk-grad-brand');
  });
});
