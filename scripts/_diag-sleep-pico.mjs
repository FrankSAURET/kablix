// Diagnostic : sur un sketch donné, où part le TEMPS SIMULÉ ?
//   - nanos avancés par des instructions ARM réellement exécutées
//   - nanos avalés d'un coup par les sauts WFE (le cœur dort)
// Et quel débit d'instructions le moteur tient (MIPS réels).
//
// KABLIX_ROOT = racine du dépôt à mesurer (worktree ancien possible).
// Usage : node diag-sleep.mjs [sketch.py]
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAIN = 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const ROOT = process.env.KABLIX_ROOT ?? MAIN;
const NOM = process.argv[2] ?? 'Horloge.py';
const CHAUFFE_MS = 12_000;
const FENETRE_MS = 5000;
const dire = (...a) => writeSync(1, `${a.join(' ')}\n`);

const tmp = mkdtempSync(join(tmpdir(), 'kablix-diag-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)], outfile: out, bundle: true,
    platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
    nodePaths: [join(MAIN, 'node_modules')],
  });
  return import(pathToFileURL(out).href);
}
const { loadPythonProgram } = await load('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const fw = join(MAIN, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
const source = readFileSync(join(MAIN, 'testkablix', NOM), 'utf8');
const program = loadPythonProgram(fw, source, false);
const engine = new PicoEngine({
  kind: 'flash',
  segments: program.payload.segments.map((s) => ({
    addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
  })),
  script: program.payload.script,
});

const mcu = engine.mcu;          // privé côté TS, bien là à l'exécution
const core = mcu.core;

// A/B : cadence de la réponse « rien à lire » sur le endpoint OUT du CDC.
// 1000 µs = ce que fait pico.mts (trame USB full-speed). Plus long = moins
// d'IRQ USB qui hachent les WFE.
if (process.env.KX_NAK_US) {
  const us = Number(process.env.KX_NAK_US);
  const usb = mcu.usbCtrl;
  const cdc = engine.cdc;
  const prev = usb.onEndpointRead;
  const vide = new Uint8Array(0);
  usb.onEndpointRead = (ep, n) => {
    if (ep === cdc.outEndpoint && cdc.txFIFO.itemCount === 0) usb.endpointReadDone(ep, vide, us);
    else prev?.(ep, n);
  };
}

// Sauts WFE : combien, et de quelle durée simulée ? L'accesseur est lu à CHAQUE
// tour de boucle du moteur : il divise le régime par 4 (mesuré). Réservé au
// comptage relatif (KX_SAUTS=1), jamais pour un chiffre de régime.
let sauts = 0;
if (process.env.KX_SAUTS) {
  let waiting = false;
  Object.defineProperty(core, 'waiting', {
    get() { return waiting; },
    set(v) { if (v && !waiting) sauts++; waiting = v; },
    configurable: true,
  });
}
const clock = engine.sim?.clock ?? mcu.clock;
let instr = 0;
let cyclesInstr = 0;
const orig = core.executeInstruction.bind(core);
core.executeInstruction = () => {
  const c = orig();
  instr++; cyclesInstr += c;
  return c;
};

const nanos = () => (clock ? clock.nanos : core.cycles * 8);
engine.start();
setTimeout(() => {
  const base = { wall: Date.now(), sim: nanos(), instr, cyc: cyclesInstr, sauts };
  setTimeout(() => {
    const wall = Date.now() - base.wall;
    const dSim = nanos() - base.sim;
    const dInstr = instr - base.instr;
    const dCyc = cyclesInstr - base.cyc;
    const dSauts = sauts - base.sauts;
    const nsInstr = dCyc * 8;
    dire(`${NOM}  (${ROOT.split(/[\\/]/).pop()})`);
    dire(`  régime            : ${(dSim / 1e6 / wall).toFixed(3)} × temps réel`);
    dire(`  instructions      : ${(dInstr / (wall / 1000) / 1e6).toFixed(2)} M/s réelles`);
    dire(`  temps simulé exécuté : ${(nsInstr / dSim * 100).toFixed(1)} %`);
    dire(`  temps simulé sauté (WFE) : ${((dSim - nsInstr) / dSim * 100).toFixed(1)} %`);
    dire(`  sauts WFE         : ${(dSauts / (dSim / 1e9)).toFixed(0)} /s simulée, ` +
      `${((dSim - nsInstr) / 1000 / Math.max(1, dSauts)).toFixed(0)} µs en moyenne`);
    process.exit(0);
  }, FENETRE_MS);
}, CHAUFFE_MS);
