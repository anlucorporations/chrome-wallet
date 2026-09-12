// Auditoria mecanica de la matriz RF -> evidencia (tarea 6 de la orden de H6).
// Lee requerimientos.md §9.2 y comprueba, para cada RF Must, que los artefactos citados en su
// linea «Evidencia:» existen de verdad en el repositorio.
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const md = readFileSync('RepoTecnico/requerimientos.md', 'utf8');
const MUST = new Set([
  'RF-01','RF-02','RF-03','RF-04','RF-05','RF-07','RF-08','RF-09','RF-10','RF-11',
  'RF-13','RF-14','RF-15','RF-16','RF-17','RF-18','RF-19','RF-20','RF-21','RF-22',
  'RF-23','RF-24','RF-25','RF-26','RF-27','RF-28','RF-29','RF-30','RF-31','RF-33',
  'RF-35','RF-36','RF-37','RF-41','RF-42','RF-43','RF-45','RF-46','RF-49','RF-50',
]);

// Bloques "#### CA-RF-xx · titulo" ... hasta el siguiente "#### "
const blocks = [...md.matchAll(/^#### (CA-RF-\d\d) · [^\n]*\n([\s\S]*?)(?=^#### |^### |\Z)/gm)];

const specFiles = new Set();
(function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(spec\.ts|mjs|ps1)$/.test(e.name) || /\.md$/.test(e.name)) out.add(p);
  }
  return out;
})('src', specFiles);
for (const dir of ['e2e', 'scripts', 'contracts/test', 'test', 'RepoTecnico/evidencia', 'RepoTecnico']) {
  (function walk(d) {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else specFiles.add(p);
    }
  })(dir);
}
const allFiles = [...specFiles];

const rf = [...blocks].map(([, ca, body]) => {
  const id = ca.replace('CA-', '');
  const ev = body.match(/\*\*Evidencia:\*\*([\s\S]*?)(?:\n\n|\n>|$)/);
  return { id, ca, evidence: (ev ? ev[1] : '').replace(/\s+/g, ' ').trim() };
});

const pending = [];
console.log('RF   | Must | artefactos citados y su estado');
console.log('-----|------|------------------------------');
for (const row of rf) {
  if (!MUST.has(row.id)) continue;
  // Extrae nombres de fichero plausibles del texto de evidencia.
  const names = [...row.evidence.matchAll(/`?([A-Za-z0-9_./-]+\.(?:spec\.ts|ts|mjs|json|log|md|png|ps1))`?/g)].map((m) => m[1]);
  const unique = [...new Set(names)];
  const found = [];
  const missing = [];
  for (const n of unique) {
    const base = n.split('/').pop();
    const hit = allFiles.some((p) => p.endsWith('/' + n) || p.endsWith('/' + base) || p === n);
    (hit ? found : missing).push(n);
  }
  const mark = unique.length === 0 ? '?' : missing.length === 0 ? 'OK' : 'FALTA';
  if (missing.length > 0 || unique.length === 0) {
    pending.push({ id: row.id, missing, evidence: row.evidence });
  }
  console.log(`${row.id} |  ${mark}  | ${unique.join(', ') || '(sin fichero citado)'}`);
}

console.log('\n=== RF Must con artefacto citado NO localizado ===');
for (const p of pending) {
  console.log(`\n${p.id}  faltan: ${p.missing.join(', ') || '(ninguno; evidencia por inspeccion/comando)'}`);
  console.log(`   evidencia: ${p.evidence}`);
}
console.log(`\ntotal CA-RF en el anexo: ${rf.length} · Must auditados: ${rf.filter((r) => MUST.has(r.id)).length} · con hueco: ${pending.length}`);
