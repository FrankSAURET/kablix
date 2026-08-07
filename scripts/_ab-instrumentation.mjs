// DIAGNOSTIC (outil d'atelier) — ce que coûte l'instrumentation de pas à pas.
//
// Le script MicroPython envoyé au REPL est instrumenté : un appel `__kx(N)`
// précède chaque ligne pas-à-pasable (cf. src/shared/pydebug.ts). Cet outil
// mesure le régime de simulation avec, sans, et avec des variantes allégées,
// pour savoir QUELLE partie du dispositif coûte cher :
//   brut         script original, aucune instrumentation (plafond atteignable) ;
//   kx-vide      appels `__kx(N)` présents mais la fonction ne fait rien
//                (coût de l'APPEL et de la construction des lambdas de locales) ;
//   kx-sans-loc  instrumentation sans le paramètre `lambda: [(nom, thunk)…]`
//                (isole le coût de la closure allouée à chaque ligne) ;
//   kx           l'instrumentation réelle.
//
// Usage : node scripts/_ab-instrumentation.mjs [sketch.py] [secondes] [variantes…]
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);

function findFirmware() {
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

const tmp = mkdtempSync(join(tmpdir(), 'kablix-ab-'));
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

const sketch = process.argv[2] || 'Horloge.py';
const fenetreMs = Number(process.argv[3] || 6) * 1000;
const choix = process.argv.slice(4);
const chemin = /[\\/]/.test(sketch) ? sketch : tk(sketch);
const source = readFileSync(chemin, 'utf8');
const program = loadPythonProgram(fw, source, false);
const instrumente = program.payload.script;

const FIN_PREAMBULE = '# --- fin du preambule Kablix ---';
const VARIANTES = {
  brut: () => source,
  'kx-vide': () => instrumente.replace(
    FIN_PREAMBULE,
    `def __kx(__n, __loc=None):\n    return\n${FIN_PREAMBULE}`
  ),
  'kx-sans-loc': () => instrumente.replace(
    /^(\s*)(__kx_on and )?__kx\((\d+), lambda: \[.*\]\)$/gm, '$1$2__kx($3)'
  ),
  kx: () => instrumente,
};

async function mesure(script) {
  const engine = new PicoEngine({
    kind: 'flash',
    segments: program.payload.segments.map((s) => ({
      addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
    })),
    script,
  });
  const core = engine.sim.rp2040.core;
  let instr = 0;
  let armed = false;
  const orig = core.executeInstruction.bind(core);
  core.executeInstruction = () => { if (armed) instr++; return orig(); };
  let base = null;
  const t0 = Date.now();
  engine.onRunning = () => { armed = true; base = { wall: Date.now(), sim: engine.simulatedMs() }; };
  engine.start();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if ((base && Date.now() - base.wall >= fenetreMs) || Date.now() - t0 > 120_000) {
        clearInterval(timer); resolve();
      }
    }, 100);
  });
  const fin = { wall: Date.now(), sim: engine.simulatedMs() };
  engine.stop?.();
  if (!base) return null;
  const wall = fin.wall - base.wall;
  return { ratio: (fin.sim - base.sim) / wall, instr, wall };
}

dire(`${sketch} — fenêtre ${fenetreMs / 1000} s par variante\n`);
dire('variante        régime   instructions émulées   par ms simulée');
dire('-'.repeat(64));
for (const nom of choix.length ? choix : Object.keys(VARIANTES)) {
  const faire = VARIANTES[nom];
  if (!faire) { dire(`${nom.padEnd(14)} variante inconnue`); continue; }
  const r = await mesure(faire());
  if (!r) { dire(`${nom.padEnd(14)} jamais démarré`); continue; }
  const parMsSim = r.instr / (r.ratio * r.wall || 1);
  dire(`${nom.padEnd(14)} ${r.ratio.toFixed(3).padStart(7)}   ${r.instr.toLocaleString('fr-FR').padStart(18)}   ${parMsSim.toFixed(0).padStart(12)}`);
}
process.exit(0);
