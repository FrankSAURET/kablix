// PROFIL (outil d'atelier) — où passe le temps du moteur Pico ?
//
// `_mesure-regime-pico.mjs` dit COMBIEN on est lent ; celui-ci dit POURQUOI.
// Il relance la mesure sous le profileur V8 puis agrège le temps propre
// (self time) par fonction : la première ligne est le plafond à attaquer.
//
// Usage : node scripts/_profil-pico.mjs [sketch.py] [secondes]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sketch = process.argv[2] || 'Horloge.py';
const dir = mkdtempSync(join(tmpdir(), 'kablix-profil-'));

const r = spawnSync(process.execPath, [
  '--cpu-prof', `--cpu-prof-dir=${dir}`, 'scripts/_mesure-regime-pico.mjs', sketch,
], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
if (r.status !== 0) process.exit(r.status ?? 1);

const fichier = readdirSync(dir).find((n) => n.endsWith('.cpuprofile'));
const prof = JSON.parse(readFileSync(join(dir, fichier), 'utf8'));

// Temps PROPRE par nœud : chaque échantillon compte pour le nœud où il est
// tombé, pondéré par le délai réel qui le sépare du précédent (V8 n'échantillonne
// pas à intervalle strictement régulier).
const propre = new Map();
const parId = new Map(prof.nodes.map((n) => [n.id, n]));
for (let i = 0; i < prof.samples.length; i++) {
  const n = parId.get(prof.samples[i]);
  if (!n) continue;
  const dt = (prof.timeDeltas[i] || 0) / 1000; // µs -> ms
  const f = n.callFrame;
  const nom = `${f.functionName || '(anonyme)'}  ${(f.url || '').split(/[\\/]/).pop()}:${f.lineNumber + 1}`;
  propre.set(nom, (propre.get(nom) || 0) + dt);
}
const total = [...propre.values()].reduce((a, b) => a + b, 0);
const classe = [...propre.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);

console.log(`\n=== ${sketch} — ${total.toFixed(0)} ms profilés ===`);
console.log('  part   temps  fonction');
for (const [nom, ms] of classe) {
  console.log(`${((ms / total) * 100).toFixed(1).padStart(6)} % ${ms.toFixed(0).padStart(7)} ms  ${nom}`);
}
rmSync(dir, { recursive: true, force: true });
