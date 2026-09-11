/**
 * `e2e/global-setup.ts` — Preparación global de la suite E2E (tarea 1.16, §7.4.1.d).
 *
 * Responsabilidades, en este orden:
 *   1. Crear la carpeta de evidencia del hito (`RepoTecnico/evidencia/<fase>/`, §7.4.1.f).
 *   2. REconstruir `dist/` con los plazos INYECTADOS (`VITE_SIGN_TIMEOUT_MS=3000`,
 *      `VITE_CONNECT_TIMEOUT_MS=2000`) para que el vencimiento se observe en ~3 s (§7.4.1.d).
 *      El build documentado es `npm run build`; si falla, se intenta el empaquetado puro
 *      (`npx vite build`) y el fallo queda registrado en la evidencia (nunca se oculta).
 *   3. Verificar que los valores de PRODUCCIÓN siguen siendo 120 000 / 60 000 / 30 000 ms: los
 *      plazos inyectados son SOLO para pruebas (§7.4.1.d).
 *   4. Verificar que Anvil responde (`cast chain-id` = 31337) y AVISAR si no está; la suite
 *      `01-onboarding` no depende de Anvil (§7.4), de modo que su ausencia no bloquea H1.
 *
 * Regla de honestidad: este fichero NUNCA lanza por un defecto de un archivo ajeno; registra el
 * comando exacto, su salida y su código de salida, y deja que cada prueba decida si se salta con
 * el motivo escrito. Sí lanza si se incumple la aserción de plazos de producción, porque es una
 * invariante del propio arnés.
 *
 * Variables: `TK_E2E_SKIP_BUILD=1` omite la reconstrucción (iteración local);
 * `TK_EVIDENCE_PHASE` cambia de hito.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Rutas y constantes
// ---------------------------------------------------------------------------

const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(AQUI, '..');
const DIST_DIR = resolve(REPO_ROOT, 'dist');
const CONSTANTS_TS = resolve(REPO_ROOT, 'src', 'shared', 'constants.ts');

const EVIDENCE_PHASE = process.env.TK_EVIDENCE_PHASE ?? 'H1';
const EVIDENCE_DIR = resolve(REPO_ROOT, 'RepoTecnico', 'evidencia', EVIDENCE_PHASE);
const RUN_DATE = new Date().toISOString().slice(0, 10);

/** Plazos INYECTADOS para la suite (§7.4.1.d). */
const PLAZOS_INYECTADOS = {
  VITE_SIGN_TIMEOUT_MS: '3000',
  VITE_CONNECT_TIMEOUT_MS: '2000',
} as const;

/** Plazos de PRODUCCIÓN que deben seguir siendo el valor por defecto de `constants.ts`. */
const PLAZOS_PRODUCCION = {
  VITE_SIGN_TIMEOUT_MS: 120_000,
  VITE_CONNECT_TIMEOUT_MS: 60_000,
  VITE_REVEAL_HIDE_MS: 30_000,
} as const;

/** RPC local de Anvil (`entornos_globales.md` §3). */
const ANVIL_RPC_URL = 'http://127.0.0.1:8545';
const ANVIL_CHAIN_ID = '31337';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Resultado de un comando externo, tal y como se archiva en la evidencia. */
interface ResultadoComando {
  comando: string;
  exitCode: number | null;
  ok: boolean;
  salida: string;
}

/** Ejecuta un comando en la raíz del repositorio y devuelve su salida completa. */
function ejecutar(comando: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): ResultadoComando {
  const resultado = spawnSync(comando, args, {
    cwd: REPO_ROOT,
    env,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  const salida = `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`;
  return {
    comando: `${comando} ${args.join(' ')}`,
    exitCode: resultado.status,
    ok: resultado.status === 0,
    salida,
  };
}

/** Bloque legible de un resultado para el log de evidencia. */
const formatear = (resultado: ResultadoComando): string =>
  [
    `$ ${resultado.comando}`,
    `[exit code: ${resultado.exitCode ?? 'null'}]`,
    resultado.salida.trim() === '' ? '(sin salida)' : resultado.salida.trimEnd(),
    '',
  ].join('\n');

/** Comprueba que `constants.ts` conserva los plazos de producción como valor por defecto. */
function verificarPlazosDeProduccion(): string[] {
  const fuente = readFileSync(CONSTANTS_TS, 'utf8');
  const fallos: string[] = [];
  const comprobaciones: Array<[keyof typeof PLAZOS_PRODUCCION, string]> = [
    ['VITE_SIGN_TIMEOUT_MS', 'VITE_SIGN_TIMEOUT_MS, 120_000'],
    ['VITE_CONNECT_TIMEOUT_MS', 'VITE_CONNECT_TIMEOUT_MS, 60_000'],
    ['VITE_REVEAL_HIDE_MS', 'VITE_REVEAL_HIDE_MS, 30_000'],
  ];
  for (const [variable, patron] of comprobaciones) {
    // Se admite el separador de millares con o sin guion bajo (`120_000` / `120000`).
    const alternativo = patron.replace(/_/g, '');
    if (!fuente.includes(patron) && !fuente.includes(alternativo)) {
      fallos.push(
        `src/shared/constants.ts no declara el valor de producción ${PLAZOS_PRODUCCION[variable]} como defecto de ${variable} (§7.4.1.d)`,
      );
    }
  }
  return fallos;
}

// ---------------------------------------------------------------------------
// Preparación global
// ---------------------------------------------------------------------------

export default async function globalSetup(): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const advertencias: string[] = [];
  const log: string[] = [
    `# Evidencia de globalSetup — fase ${EVIDENCE_PHASE} — ${RUN_DATE}`,
    `Repositorio: ${REPO_ROOT}`,
    `dist/: ${DIST_DIR}`,
    '',
  ];

  // --- 1. Plazos de producción (invariante del arnés) --------------------------------------
  const fallosProduccion = verificarPlazosDeProduccion();
  log.push(
    '## Plazos de producción declarados en src/shared/constants.ts',
    fallosProduccion.length === 0
      ? `OK: 120000 / 60000 / 30000 siguen siendo los valores por defecto; la inyección (${PLAZOS_INYECTADOS.VITE_SIGN_TIMEOUT_MS} / ${PLAZOS_INYECTADOS.VITE_CONNECT_TIMEOUT_MS}) es SOLO del arnés.`
      : fallosProduccion.join('\n'),
    '',
  );
  if (fallosProduccion.length > 0) {
    // Invariante del arnés: sin ella, la suite E2E mediría un producto distinto al normativo.
    throw new Error(`[e2e/global-setup] ${fallosProduccion.join(' | ')}`);
  }

  // --- 2. Reconstrucción de dist/ con los plazos inyectados --------------------------------
  const envInyectado: NodeJS.ProcessEnv = {
    ...process.env,
    ...PLAZOS_INYECTADOS,
  };

  let build: ResultadoComando | null = null;
  let buildAlternativo: ResultadoComando | null = null;

  if (process.env.TK_E2E_SKIP_BUILD === '1') {
    log.push('## Build de dist/', 'OMITIDO por TK_E2E_SKIP_BUILD=1 (iteración local).', '');
    advertencias.push('build omitido por TK_E2E_SKIP_BUILD=1');
  } else {
    log.push('## Build de dist/ con plazos inyectados');
    build = ejecutar('npm', ['run', 'build'], envInyectado, 600_000);
    log.push(formatear(build));
    if (!build.ok) {
      advertencias.push(
        `«npm run build» falló (exit ${build.exitCode ?? 'null'}): dist/ puede quedar incompleto. Ver e2e-global-setup en la evidencia y ACTA_H1.md.`,
      );
      buildAlternativo = ejecutar('npx', ['vite', 'build'], envInyectado, 600_000);
      log.push(
        '## Empaquetado alternativo (npx vite build) tras el fallo de «npm run build»',
        formatear(buildAlternativo),
      );
      if (!buildAlternativo.ok) {
        advertencias.push(
          `«npx vite build» también falló (exit ${buildAlternativo.exitCode ?? 'null'}): las pruebas que necesitan dist/ se saltarán con el motivo escrito.`,
        );
      }
    }
  }

  // --- 3. ¿Hay artefacto cargable? ----------------------------------------------------------
  const manifestPath = join(DIST_DIR, 'manifest.json');
  const manifestDisponible = existsSync(manifestPath);
  log.push(
    '## Artefacto',
    manifestDisponible
      ? `OK: ${manifestPath} presente.`
      : `AUSENTE: ${manifestPath}. Las pruebas E2E que cargan la extensión se saltarán con el motivo escrito.`,
    '',
  );
  if (!manifestDisponible) {
    advertencias.push(`no existe ${manifestPath}: la extensión no se puede cargar desde dist/`);
  }

  // --- 4. Anvil (aviso, no bloqueo) ---------------------------------------------------------
  const anvil = ejecutar('cast', ['chain-id', '--rpc-url', ANVIL_RPC_URL], process.env, 30_000);
  const chainId = anvil.salida.trim();
  const anvilOk = anvil.ok && chainId === ANVIL_CHAIN_ID;
  log.push(
    '## Anvil',
    anvilOk
      ? `OK: cast chain-id --rpc-url ${ANVIL_RPC_URL} = ${chainId}`
      : `AVISO: Anvil no responde en ${ANVIL_RPC_URL} (exit ${anvil.exitCode ?? 'null'}, salida «${chainId.slice(0, 200)}»). Arranca «anvil» antes de las pruebas que usan la red (RF-18/RF-27); 01-onboarding no la necesita.`,
    '',
  );
  if (!anvilOk) {
    advertencias.push(`Anvil no disponible en ${ANVIL_RPC_URL}: los flujos con red se saltarán o fallarán en hitos posteriores`);
  }

  // --- 5. Evidencia ------------------------------------------------------------------------
  const registro = {
    fase: EVIDENCE_PHASE,
    fecha: RUN_DATE,
    repositorio: REPO_ROOT,
    dist: DIST_DIR,
    manifestDisponible,
    plazosInyectados: PLAZOS_INYECTADOS,
    plazosProduccion: PLAZOS_PRODUCCION,
    build: build === null ? null : { comando: build.comando, exitCode: build.exitCode, ok: build.ok },
    buildAlternativo:
      buildAlternativo === null ? null : { comando: buildAlternativo.comando, exitCode: buildAlternativo.exitCode, ok: buildAlternativo.ok },
    anvil: { rpcUrl: ANVIL_RPC_URL, disponible: anvilOk, chainId: chainId.slice(0, 40) },
    advertencias,
  };

  writeFileSync(join(EVIDENCE_DIR, `e2e-global-setup-${RUN_DATE}.log`), `${log.join('\n')}`, 'utf8');
  writeFileSync(
    join(EVIDENCE_DIR, `e2e-global-setup-${RUN_DATE}.json`),
    `${JSON.stringify(registro, null, 2)}\n`,
    'utf8',
  );

  // --- 6. Resumen por consola ---------------------------------------------------------------
  console.log(`[e2e/global-setup] fase ${EVIDENCE_PHASE} · evidencia en RepoTecnico/evidencia/${EVIDENCE_PHASE}/`);
  console.log(
    `[e2e/global-setup] plazos inyectados ${PLAZOS_INYECTADOS.VITE_SIGN_TIMEOUT_MS}/${PLAZOS_INYECTADOS.VITE_CONNECT_TIMEOUT_MS} ms · producción 120000/60000/30000 ms (verificados)`,
  );
  console.log(`[e2e/global-setup] dist/ ${manifestDisponible ? 'presente' : 'AUSENTE'}`);
  console.log(
    `[e2e/global-setup] Anvil ${ANVIL_RPC_URL}: ${anvilOk ? `OK (chainId ${chainId})` : 'no disponible (aviso)'}`,
  );
  for (const advertencia of advertencias) console.warn(`[e2e/global-setup] AVISO: ${advertencia}`);
}
