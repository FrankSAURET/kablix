// MESURE (outil d'atelier) — le rattrapage borné tient-il l'horloge ?
//
// Piste #5 de scripts/vitesse-pico.md : le moteur repart de l'instant courant dès
// 50 ms de retard. Sans dette, ce temps est perdu et une horloge Pico retarde
// d'autant — c'est le symptôme « 1 min ≠ 1 min ». Avec la dette, il est remboursé
// pendant les accalmies, à CATCHUP au plus.
//
// Le banc reproduit une machine chargée : il BLOQUE le thread périodiquement
// (busy-wait synchrone, comme un layout ou un scan d'antivirus) et regarde si le
// temps simulé revient à niveau. Attendu : régime ≈ 1,00 et dérive ≈ 0 avec le
// rattrapage, régime ≈ 1 − (blocage / période) sans lui.
//
// Comparer avant/après : `git stash` du patch, relancer, `git stash pop` — jamais
// deux variantes dans le même processus (les périphériques d'un moteur arrêté
// continuent de tourner et faussent tout ce qui suit).
//
// Usage : node scripts/_ab-rattrapage-pico.mjs [sketch.py] [blocage_ms] [période_ms]
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);

const [nom = 'Horloge.py', blocageArg, periodeArg, fenetreArg] = process.argv.slice(2);
const BLOCAGE_MS = Number(blocageArg ?? 150); // durée d'un gel du thread (0 = aucun)
const PERIODE_MS = Number(periodeArg ?? 1000); // intervalle entre deux gels
const FENETRE_MS = Number(fenetreArg ?? 20_000); // durée de mesure une fois le script parti

function findFirmware() {
  if (process.env.KABLIX_FW && existsSync(process.env.KABLIX_FW)) return process.env.KABLIX_FW;
  const dirs = [
    join(root, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => /^RPI_PICO.*\.uf2$/.test(n));
    if (hit) return join(dir, hit);
  }
  return undefined;
}
const fw = findFirmware();
if (!fw) { dire('SKIP : firmware Pico introuvable.'); process.exit(0); }

const tmp = mkdtempSync(join(tmpdir(), 'kablix-rattrapage-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out, bundle: true,
    platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}
const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const chemin = tk(nom);
if (!existsSync(chemin)) { dire(`${nom} : introuvable dans testkablix.`); process.exit(1); }
const program = loadPythonProgram(fw, readFileSync(chemin, 'utf8'), false);
const engine = new PicoEngine({
  kind: 'flash',
  segments: program.payload.segments.map((s) => ({
    addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
  })),
  script: program.payload.script,
  scriptDebug: program.payload.scriptDebug,
});

dire(`Firmware : ${fw.split(/[\\/]/).pop()}`);
dire(`Sketch   : ${nom}`);
dire(`Charge   : ${BLOCAGE_MS} ms de thread gelé toutes les ${PERIODE_MS} ms ` +
     `(${((BLOCAGE_MS / PERIODE_MS) * 100).toFixed(0)} % du temps)\n`);

let base = null;
engine.onRunning = () => {
  base = { wall: Date.now(), sim: engine.simulatedMs() };
};
const t0 = Date.now();
engine.start();

// Le gel du thread : busy-wait SYNCHRONE, seule façon de voler du temps à la
// boucle du moteur comme le ferait un layout ou une autre fenêtre.
let gels = 0;
const charge = BLOCAGE_MS > 0 ? setInterval(() => {
  if (!base) return;
  const fin = Date.now() + BLOCAGE_MS;
  while (Date.now() < fin) { /* on tient le thread */ }
  gels++;
}, PERIODE_MS) : null;

// Relevés intermédiaires : la dérive se lit mieux en la voyant se résorber (ou pas).
const releves = [];
await new Promise((resolve) => {
  const timer = setInterval(() => {
    if (base) {
      const wall = Date.now() - base.wall;
      releves.push({ wall, drift: engine.simulatedMs() - base.sim - wall, lag: engine.lagMs?.() ?? 0 });
      if (wall >= FENETRE_MS) { clearInterval(timer); resolve(); }
    } else if (Date.now() - t0 > 90_000) { clearInterval(timer); resolve(); }
  }, 2000);
});
if (charge) clearInterval(charge);

if (!base) { dire("le script n'a jamais démarré (90 s)"); process.exit(1); }
const wall = Date.now() - base.wall;
const drift = engine.simulatedMs() - base.sim - wall;

dire('  temps réel   dérive de l’horloge   dette en cours');
dire('  ' + '-'.repeat(52));
for (const r of releves) {
  dire(`  ${(r.wall / 1000).toFixed(0).padStart(7)} s   ${r.drift.toFixed(0).padStart(15)} ms   ` +
       `${r.lag.toFixed(0).padStart(11)} ms`);
}
dire('');
dire(`Gels subis  : ${gels} × ${BLOCAGE_MS} ms = ${gels * BLOCAGE_MS} ms volés`);
dire(`Régime      : ${((wall + drift) / wall).toFixed(3)}`);
dire(`Dérive      : ${drift.toFixed(0)} ms sur ${(wall / 1000).toFixed(0)} s ` +
     `(${((drift / wall) * 100).toFixed(1)} %)`);
dire(`Dette finale: ${(engine.lagMs?.() ?? 0).toFixed(0)} ms`);
engine.stop?.();
process.exit(0);
