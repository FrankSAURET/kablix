// MESURE (outil d'atelier) — débit BRUT de l'interpréteur ARM, en Minstr/s.
//
// C'est le chiffre du niveau 3 de scripts/vitesse-pico.md : tout ce qui optimise
// rp2040js se lit ici, et nulle part ailleurs. Le régime (ms simulées par ms
// réelle) ne convient PAS comme mesure : le cadencement le plafonne à 1,00, donc
// une accélération de 30 % s'y voit comme… 1,00.
//
// Deux précautions qui changent tout :
//   - vitesse ×100 une fois le script parti : le moteur ne dort plus, il tourne
//     à fond, et le débit mesuré est le débit réel de l'interpréteur ;
//   - UN PROCESSUS PAR RÉPÉTITION, et on garde la MÉDIANE : cette machine varie
//     de plusieurs pour cent d'une seconde à l'autre (turbo, OneDrive, antivirus),
//     et un moteur arrêté laisse tourner ses périphériques dans le processus.
//
// Usage : node scripts/_mesure-debit-pico.mjs [sketch.py] [répétitions]
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);
const SKETCH = process.argv[2] || 'Horloge.py';
const REPETITIONS = Number(process.argv[3] || 5);
const FENETRE_MS = 5000;
const ENFANT = process.env.KABLIX_DEBIT_ENFANT;

// ------------------------------------------------- chef d'orchestre ----
if (!ENFANT) {
  dire(`${SKETCH} — ${REPETITIONS} répétitions de ${FENETRE_MS / 1000} s, un processus chacune\n`);
  const mesures = [];
  for (let i = 1; i <= REPETITIONS; i++) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), SKETCH], {
      cwd: root, encoding: 'utf8', env: { ...process.env, KABLIX_DEBIT_ENFANT: '1' },
    });
    const val = Number((r.stdout || '').trim());
    if (Number.isFinite(val) && val > 0) {
      mesures.push(val);
      dire(`  ${String(i).padStart(2)} : ${val.toFixed(2).padStart(6)} Minstr/s`);
    } else {
      dire(`  ${String(i).padStart(2)} : ÉCHEC ${(r.stderr || '').split('\n')[0]}`);
    }
  }
  if (!mesures.length) process.exit(1);
  const tri = [...mesures].sort((a, b) => a - b);
  const mediane = tri.length % 2 ? tri[(tri.length - 1) / 2] : (tri[tri.length / 2 - 1] + tri[tri.length / 2]) / 2;
  const max = tri[tri.length - 1];
  dire('');
  dire(`  MEILLEUR ${max.toFixed(2)} Minstr/s   (médiane ${mediane.toFixed(2)}, min ${tri[0].toFixed(2)})`);
  dire('');
  // Le chiffre à comparer est le MEILLEUR, pas la médiane : le bruit de cette
  // machine (turbo qui retombe, OneDrive, antivirus) ne peut que RALENTIR une
  // répétition, jamais l'accélérer. La médiane mesure donc autant l'humeur de la
  // machine que le code ; le meilleur run est celui qui a été le moins dérangé.
  dire('  Comparer deux versions sur le MEILLEUR run (le bruit ne peut que ralentir).');
  dire(`  Dispersion ici : ${(((max - tri[0]) / max) * 100).toFixed(1)} % — relancer si elle dépasse ~15 %.`);
  process.exit(0);
}

// ----------------------------------------------------- une mesure ----
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
if (!fw) { dire('0'); process.exit(0); }

const tmp = mkdtempSync(join(tmpdir(), 'kablix-debit-'));
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

const program = loadPythonProgram(fw, readFileSync(tk(SKETCH), 'utf8'), false);
const engine = new PicoEngine({
  kind: 'flash',
  segments: program.payload.segments.map((s) => ({
    addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
  })),
  script: program.payload.script,
});

// Compteur d'instructions : on enveloppe executeInstruction, armé seulement
// pendant la fenêtre de mesure (le boot du firmware ne doit pas compter).
const core = engine.sim.rp2040.core;
const origExec = core.executeInstruction.bind(core);
let instr = 0;
let armed = false;
core.executeInstruction = () => { if (armed) instr++; return origExec(); };

let base = null;
const t0 = Date.now();
engine.onRunning = () => {
  engine.setSpeed(100); // plus de sieste : on mesure l'interpréteur, pas le pacing
  armed = true; instr = 0;
  base = { wall: Date.now(), busy: engine.busyMs() };
};
engine.start();
await new Promise((resolve) => {
  const timer = setInterval(() => {
    if ((base && Date.now() - base.wall >= FENETRE_MS) || Date.now() - t0 > 120_000) {
      clearInterval(timer); resolve();
    }
  }, 100);
});
const busy = engine.busyMs() - (base?.busy ?? 0);
engine.stop?.();
dire(base && busy > 0 ? (instr / busy / 1000).toFixed(3) : '0');
process.exit(0);
