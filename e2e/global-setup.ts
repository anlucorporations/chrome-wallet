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
 *   4. Verificar que Anvil responde (`cast chain-id` = 31337) y **ABORTAR** si no está (H4): la
 *      suite de H3..H6 depende del nodo local y un Anvil ausente hacía fallar los E2E con red más
 *      tarde y de forma confusa (`ERR_CONNECTION_REFUSED`). El mensaje de aborto lleva el comando
 *      exacto que arranca el nodo.
 *
 * Regla de honestidad: este fichero NUNCA lanza por un defecto de un archivo ajeno; registra el
 * comando exacto, su salida y su código de salida, y deja que cada prueba decida si se salta con
 * el motivo escrito. Sí lanza si se incumple la aserción de plazos de producción o si Anvil no
 * responde, porque ambas son invariantes del propio arnés.
 *
 * Variables: `TK_E2E_SKIP_BUILD=1` omite la reconstrucción (iteración local);
 * `TK_EVIDENCE_PHASE` cambia de hito.
 */

import { spawn, spawnSync } from 'node:child_process';
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

/**
 * SEGUNDA red de los flujos de cambio y alta (H5, `plan_desarrollo.md` §3.5.7): Anvil secundario en
 * `127.0.0.1:8546` con `chainId 31338`. Este `globalSetup` lo arranca si no está; si no se puede
 * arrancar, la suite NO se aborta (a diferencia del nodo principal): las pruebas de red que lo
 * necesitan se marcan como NO VERIFICADAS con el motivo escrito (§3.5.8).
 */
const ANVIL_SECUNDARIO_RPC_URL = 'http://127.0.0.1:8546';
const ANVIL_SECUNDARIO_CHAIN_ID = '31338';
const COMANDO_ANVIL_SECUNDARIO =
  'anvil --host 127.0.0.1 --port 8546 --chain-id 31338 --allow-origin "*"';

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

  // --- 4. Anvil (BLOQUEANTE) ----------------------------------------------------------------
  // La suite de H3..H6 depende del nodo local (RF-18/RF-27/RNF-07): si Anvil no responde, los
  // E2E con red fallan más tarde de forma confusa (`ERR_CONNECTION_REFUSED`, `4900` espurios…).
  // Por eso, desde H4, el `globalSetup` ABORTA con el comando exacto que hay que arrancar.
  // Aviso operativo vinculante (`entornos_globales.md` §2.1): `anvil --silent` NO arranca cuando
  // se lanza con redirección de salida; el comando que sí funciona es el de ABAJO, sin `--silent`.
  const anvil = ejecutar('cast', ['chain-id', '--rpc-url', ANVIL_RPC_URL], process.env, 30_000);
  const chainId = anvil.salida.trim();
  const anvilOk = anvil.ok && chainId === ANVIL_CHAIN_ID;
  const comandoAnvil = `anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --http.corsdomain "*"`;
  const abortoAnvil = anvilOk
    ? null
    : [
        `[e2e/global-setup] Anvil NO responde en ${ANVIL_RPC_URL}: la suite E2E se ABORTA (no se ejecuta ninguna prueba).`,
        `  Comando comprobado: cast chain-id --rpc-url ${ANVIL_RPC_URL}`,
        `  Resultado: exit ${anvil.exitCode ?? 'null'} · salida «${chainId.slice(0, 200)}» (se esperaba ${ANVIL_CHAIN_ID})`,
        `  Arranca el nodo con:  ${comandoAnvil}`,
        `  Aviso: NO añadas --silent (con él Anvil no arranca en el arnés); ver entornos_globales.md §2.1.`,
      ].join('\n');
  log.push(
    '## Anvil',
    anvilOk
      ? `OK: cast chain-id --rpc-url ${ANVIL_RPC_URL} = ${chainId}`
      : abortoAnvil ?? '',
    '',
  );
  if (abortoAnvil !== null) {
    advertencias.push(
      `Anvil no disponible en ${ANVIL_RPC_URL}: el globalSetup aborta la suite (comando: ${comandoAnvil})`,
    );
  }

  // --- 5. Anvil SECUNDARIO (8546 / 31338): se arranca si falta, sin abortar la suite -------------
  // Los flujos de cambio y alta de red necesitan una SEGUNDA red dada de alta. Si no está, se
  // intenta arrancar aquí (formato exacto de §3.5.7, SIN `--silent`); si aun así no responde, la
  // suite sigue y las pruebas que la necesitan quedan marcadas como NO VERIFICADAS.
  let anvilSecundario = ejecutar(
    'cast',
    ['chain-id', '--rpc-url', ANVIL_SECUNDARIO_RPC_URL],
    process.env,
    30_000,
  );
  let arrancadoPorElArnes = false;
  if (!(anvilSecundario.ok && anvilSecundario.salida.trim() === ANVIL_SECUNDARIO_CHAIN_ID)) {
    log.push('## Anvil secundario: no responde; se arranca desde el arnés', formatear(anvilSecundario));
    try {
      const hijo = spawn(
        'anvil',
        ['--host', '127.0.0.1', '--port', '8546', '--chain-id', '31338', '--allow-origin', '*'],
        { detached: true, stdio: 'ignore' },
      );
      hijo.unref();
      arrancadoPorElArnes = true;
    } catch (error) {
      log.push(`No se pudo arrancar el Anvil secundario: ${String(error)}`);
    }
    const limite = Date.now() + 20_000;
    while (Date.now() < limite) {
      anvilSecundario = ejecutar(
        'cast',
        ['chain-id', '--rpc-url', ANVIL_SECUNDARIO_RPC_URL],
        process.env,
        15_000,
      );
      if (anvilSecundario.ok && anvilSecundario.salida.trim() === ANVIL_SECUNDARIO_CHAIN_ID) break;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    }
  }
  const anvilSecundarioOk =
    anvilSecundario.ok && anvilSecundario.salida.trim() === ANVIL_SECUNDARIO_CHAIN_ID;
  log.push(
    '## Anvil secundario (segunda red)',
    anvilSecundarioOk
      ? `OK: cast chain-id --rpc-url ${ANVIL_SECUNDARIO_RPC_URL} = ${anvilSecundario.salida.trim()}${arrancadoPorElArnes ? ' (arrancado por el arnés)' : ''}`
      : `NO DISPONIBLE: las pruebas de cambio/alta de red que lo necesitan se marcarán como NO VERIFICADAS.\n  Comando: ${COMANDO_ANVIL_SECUNDARIO}`,
    '',
  );
  if (!anvilSecundarioOk) {
    advertencias.push(
      `Anvil secundario no disponible en ${ANVIL_SECUNDARIO_RPC_URL}: los casos de red que lo necesitan quedan NO VERIFICADOS`,
    );
  }

  // --- 6. Evidencia ------------------------------------------------------------------------
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
    anvilSecundario: {
      rpcUrl: ANVIL_SECUNDARIO_RPC_URL,
      disponible: anvilSecundarioOk,
      chainId: anvilSecundario.salida.trim().slice(0, 40),
      arrancadoPorElArnes,
      comando: COMANDO_ANVIL_SECUNDARIO,
    },
    advertencias,
  };

  writeFileSync(join(EVIDENCE_DIR, `e2e-global-setup-${RUN_DATE}.log`), `${log.join('\n')}`, 'utf8');
  writeFileSync(
    join(EVIDENCE_DIR, `e2e-global-setup-${RUN_DATE}.json`),
    `${JSON.stringify(registro, null, 2)}\n`,
    'utf8',
  );

  // --- 7. Resumen por consola ---------------------------------------------------------------
  console.log(`[e2e/global-setup] fase ${EVIDENCE_PHASE} · evidencia en RepoTecnico/evidencia/${EVIDENCE_PHASE}/`);
  console.log(
    `[e2e/global-setup] plazos inyectados ${PLAZOS_INYECTADOS.VITE_SIGN_TIMEOUT_MS}/${PLAZOS_INYECTADOS.VITE_CONNECT_TIMEOUT_MS} ms · producción 120000/60000/30000 ms (verificados)`,
  );
  console.log(`[e2e/global-setup] dist/ ${manifestDisponible ? 'presente' : 'AUSENTE'}`);
  console.log(
    `[e2e/global-setup] Anvil ${ANVIL_RPC_URL}: ${anvilOk ? `OK (chainId ${chainId})` : 'NO DISPONIBLE → la suite se aborta'}`,
  );
  console.log(
    `[e2e/global-setup] Anvil secundario ${ANVIL_SECUNDARIO_RPC_URL}: ${
      anvilSecundarioOk
        ? `OK (chainId ${anvilSecundario.salida.trim()}${arrancadoPorElArnes ? ', arrancado por el arnés' : ''})`
        : 'NO DISPONIBLE → los casos de red que lo necesitan quedan NO VERIFICADOS'
    }`,
  );
  for (const advertencia of advertencias) console.warn(`[e2e/global-setup] AVISO: ${advertencia}`);

  // --- 8. Aborto por Anvil ausente (siempre DESPUÉS de archivar la evidencia) ----------------
  // El mensaje lleva el comando EXACTO que arranca el nodo: el fallo deja de ser confuso.
  if (abortoAnvil !== null) {
    throw new Error(abortoAnvil);
  }
}
