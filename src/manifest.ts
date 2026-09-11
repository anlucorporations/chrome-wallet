// M1 — Fuente unica del manifest MV3 (RT-05 / ADT-01).
// El manifest NO se escribe a mano en JSON: lo genera el plugin `closeBundle` de vite.config.ts
// a partir de este modulo, de modo que `dist/manifest.json` y la suite `manifest.spec.ts`
// consumen exactamente los mismos valores congelados.
//
// Referencias: documento_tecnico.md §2.4 (M1), §7.3 (permisos y su justificacion) y §7.5.4.

import pkg from '../package.json';

/**
 * Clave publica del par de firma del desarrollador, codificada en base64 (DER/SPKI, RSA-2048).
 * Congelada a proposito (D-N / ADT-19 / CA-RT-13): fija el ID de la extension en cualquier
 * equipo e instalacion, lo que hace reproducible la allowlist CORS de Anvil (RE-04) y la suite E2E.
 * El ID derivado de esta clave es `EXTENSION_ID` (abajo); si la clave cambiara, cambiaria el ID.
 * Solo se conserva la clave PUBLICA: la privada no forma parte del repositorio ni del paquete.
 */
export const MANIFEST_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApjOjpSaILyR/me+NWImCa5NdRLa0g8dnxBya/1Tcesx5Qur1jdHlifhi9TvB32i5ZxK6q3uXrxinTUPCGuPEZMX1Edl4gcXkN/gRyAiiuBI5SryXEPgd7dOiJDDpl9M9vCxGvj0O39NAPf8iWdwh4Ciy2ijqZuZuBljXZu3L3PPbuf1u6IWCMn+G099e9y/mWX4rfIYKfVIGCBmBqNacV8dZPToSzpzfKjzNjTPzYy68dAWOTtZWQX6QrdOW5N2OEfCRGxICcXQfeXOvZKGmtbE1Eia67ubd4hR3B77QuyM/lIdyC4fXjrBFjD7MBvLpfMf2bGt1QUwJOoM5eGs5BQIDAQAB';

/**
 * ID estable de la extension, derivado de {@link MANIFEST_KEY}
 * (primeros 16 bytes del SHA-256 de la clave DER, con cada nibble mapeado a `a`-`p`).
 * Es el `<ID>` / `<EXTENSION_ID>` que consumen la allowlist CORS de Anvil (§2.1 de
 * `entornos_globales.md`), `chrome-extension://<ID>/_favicon/` (ADT-22) y la suite E2E.
 * Nunca se escribe a mano en las pruebas: se importa desde aqui (ADT-19 / D-N).
 */
export const EXTENSION_ID = 'oiahebaliobknoeeonhgaacapjcpgblo';

/**
 * Manifest MV3 completo. `version` se toma de `package.json` (§4.2.1) para que exista una sola
 * fuente de version. Sin `tabs`, sin `activeTab` y sin `scripting` (permisos retirados, H-36/D-P);
 * `notifications` vive SOLO en `optional_permissions` porque RF-39 pertenece al ciclo posterior.
 */
export const manifest = {
  manifest_version: 3,
  name: 'TrueKeate Wallet',
  version: pkg.version,
  description:
    'Monedero Ethereum no custodial para red local Anvil (entorno de desarrollo, sin fondos reales).',
  key: MANIFEST_KEY,
  minimum_chrome_version: '114',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'index.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['storage', 'alarms', 'favicon', 'clipboardRead', 'clipboardWrite'],
  optional_permissions: ['notifications'],
  host_permissions: ['http://127.0.0.1:8545/*', 'http://localhost:8545/*'],
  optional_host_permissions: ['http://127.0.0.1/*', 'http://localhost/*', 'https://*/*'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      exclude_matches: [
        // NOTA (corregido en H1): `chrome-extension://*/*` NO es un patrón de coincidencia válido
        // para `content_scripts`. Chrome rechaza el manifest completo con
        // «Invalid value for 'content_scripts[0].exclude_matches[0]'» y la extensión no carga.
        // Es innecesario además: `<all_urls>` no incluye el esquema `chrome-extension://`.
        // Se conservan las exclusiones de MetaMask para no inyectar donde ya hay otro provider.
        'https://metamask.io/*',
        'https://*.metamask.io/*',
      ],
      js: ['content-script.js'],
      run_at: 'document_start',
      all_frames: true,
    },
  ],
  web_accessible_resources: [
    {
      resources: ['inject.js'],
      matches: ['<all_urls>'],
      use_dynamic_url: true,
    },
  ],
} as const;

export default manifest;
