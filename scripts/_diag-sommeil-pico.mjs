// DIAGNOSTIC (outil d'atelier) — le cœur RP2040 DORT-il vraiment ?
//
// `_mesure-regime-pico.mjs` dit combien de temps simulé sort par temps réel.
// Celui-ci dit d'où vient ce temps simulé : des SAUTS d'horloge (le cœur en
// WFE, gratuit) ou des INSTRUCTIONS émulées (payant, plafond de l'interpréteur).
// Un `time.sleep()` qui n'apparaît pas en sauts = le firmware ne dort pas.
//
// Usage : node scripts/_diag-sommeil-pico.mjs [sketch.py] [secondes]
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);

const sketch = process.argv[2] || 'Horloge.py';
const fenetreMs = Number(process.argv[3] || 5) * 1000;

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

const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-'));
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

const chemin = /[\\/]/.test(sketch) ? sketch : tk(sketch);
const source = readFileSync(chemin, 'utf8');
const program = loadPythonProgram(fw, source, false);
// KABLIX_BRUT=1 : envoie le script ORIGINAL au REPL (sans le préambule de
// pas-à-pas). Sert à chiffrer ce que coûte l'instrumentation `__kx` par ligne.
const brut = process.env.KABLIX_BRUT === '1';
const engine = new PicoEngine({
  kind: 'flash',
  segments: program.payload.segments.map((s) => ({
    addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
  })),
  script: brut ? source : program.payload.script,
});

// Les champs « privés » TypeScript restent de simples propriétés à l'exécution.
const sim = engine.sim;
const { rp2040, clock } = sim;
const core = rp2040.core;

const c = { instr: 0, nsInstr: 0, sauts: 0, nsSauts: 0, reveils: 0 };
let armed = false;

const execOrig = core.executeInstruction.bind(core);
core.executeInstruction = () => { if (armed) c.instr++; return execOrig(); };

// Exceptions prises, par numéro (16 + n = IRQ n : 0-3 TIMER, 5 USBCTRL, 15 SysTick).
const excCount = new Map();
const excInstr = new Map();   // instructions exécutées DANS chaque handler
let excCourante = null;
let instrEntree = 0;
const entryOrig = core.exceptionEntry.bind(core);
core.exceptionEntry = (n) => {
  if (armed) {
    excCount.set(n, (excCount.get(n) || 0) + 1);
    if (excCourante === null) { excCourante = n; instrEntree = c.instr; }
  }
  return entryOrig(n);
};
const retOrig = core.exceptionReturn.bind(core);
core.exceptionReturn = (v) => {
  if (armed && excCourante !== null) {
    excInstr.set(excCourante, (excInstr.get(excCourante) || 0) + (c.instr - instrEntree));
    excCourante = null;
  }
  return retOrig(v);
};

const tickOrig = clock.tick.bind(clock);
clock.tick = (ns) => {
  if (armed) {
    if (core.waiting) { c.sauts++; c.nsSauts += ns; } else { c.nsInstr += ns; }
  }
  return tickOrig(ns);
};

// Un « réveil » = passage de waiting=true à waiting=false (fin d'un WFE).
let dernierWaiting = false;
const surveille = setInterval(() => {}, 1000); // garde le processus en vie
const guet = () => {
  const w = core.waiting;
  if (armed && dernierWaiting && !w) c.reveils++;
  dernierWaiting = w;
};
const guetTimer = setInterval(guet, 0);

// Sortie série horodatée en temps RÉEL et SIMULÉ : c'est ainsi qu'on compare
// ce que le programme croit (son horloge) à ce que l'utilisateur chronomètre.
let ligne = '';
const lignes = [];
engine.onSerial = (chunk) => {
  for (const ch of chunk) {
    if (ch === '\n') {
      if (ligne.trim()) lignes.push({ t: Date.now(), sim: clock.nanos / 1e6, txt: ligne.trim() });
      ligne = '';
    } else if (ch !== '\r') ligne += ch;
  }
};

let base = null;
const t0 = Date.now();
engine.onRunning = () => {
  armed = true;
  base = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs() };
};
engine.start();

await new Promise((resolve) => {
  const timer = setInterval(() => {
    if ((base && Date.now() - base.wall >= fenetreMs) || Date.now() - t0 > 90_000) {
      clearInterval(timer); resolve();
    }
  }, 100);
});
clearInterval(surveille); clearInterval(guetTimer);
const fin = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs() };
engine.stop?.();
if (!base) { dire('le script n\'a jamais démarré (90 s)'); process.exit(1); }

const wall = fin.wall - base.wall;
const nsTotal = c.nsInstr + c.nsSauts;
const pct = (x) => `${((x / (nsTotal || 1)) * 100).toFixed(1)} %`;
dire(`\n=== ${sketch} — ${wall} ms réelles ===`);
dire(`régime                 ${((fin.sim - base.sim) / wall).toFixed(3)}  (ms simulée / ms réelle)`);
dire(`moteur                 ${(((fin.busy - base.busy) / wall) * 100).toFixed(0)} % du temps réel`);
dire(`temps simulé produit   ${(nsTotal / 1e6).toFixed(1)} ms`);
dire(`  par instructions     ${(c.nsInstr / 1e6).toFixed(1)} ms   ${pct(c.nsInstr)}`);
dire(`  par sauts WFE        ${(c.nsSauts / 1e6).toFixed(1)} ms   ${pct(c.nsSauts)}   (${c.sauts} sauts)`);
dire(`instructions émulées   ${c.instr.toLocaleString('fr-FR')}  →  ${(c.instr / wall).toFixed(0)} par ms réelle`);
dire(`saut moyen             ${c.sauts ? (c.nsSauts / c.sauts / 1000).toFixed(1) : 0} µs`);

if (lignes.length) {
  dire('\nsortie série (t réel depuis le départ · t simulé)');
  for (const l of lignes.slice(-12)) {
    dire(`  ${((l.t - base.wall) / 1000).toFixed(2).padStart(7)} s  ${(l.sim / 1000).toFixed(2).padStart(8)} s   ${l.txt}`);
  }
}

const NOMS = { 15: 'SysTick', 16: 'IRQ0 TIMER_0', 17: 'IRQ1 TIMER_1', 18: 'IRQ2 TIMER_2',
  19: 'IRQ3 TIMER_3', 21: 'IRQ5 USBCTRL', 30: 'IRQ14 IO_BANK0' };
dire('\nexceptions prises        nombre   instructions   part des instr.');
for (const [n, nb] of [...excCount.entries()].sort((a, b) => (excInstr.get(b[0]) || 0) - (excInstr.get(a[0]) || 0))) {
  const ins = excInstr.get(n) || 0;
  dire(`  ${(NOMS[n] || `exc ${n}`).padEnd(20)} ${String(nb).padStart(7)} ${ins.toLocaleString('fr-FR').padStart(14)}   ${((ins / (c.instr || 1)) * 100).toFixed(1).padStart(5)} %`);
}
process.exit(0);
