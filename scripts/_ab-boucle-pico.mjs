// A/B (outil d'atelier) — ce que coûte la boucle du moteur AUTOUR de
// l'interpréteur ARM.
//
// Le profil dit : `executeInstruction` 40 % du temps, mais `execute` (notre
// boucle) 17 % à elle seule. Par instruction émulée, elle appelle en plus
// `pio[0].advance()`, `pio[1].advance()` et `clock.tick()` — trois appels dont
// aucun ne sert tant qu'aucune machine PIO ne tourne et qu'aucune alarme n'est
// due. Ce banc chiffre le plafond de gain de chaque suppression :
//
//   ref          la boucle telle qu'elle est ;
//   sans-pio     les deux `advance()` neutralisés (aucun PIO actif ici) ;
//   tick-groupé  `clock.tick` accumule et ne se déclenche qu'à l'approche
//                d'une alarme (c'est le regroupement abandonné en v2026.7.86,
//                qui gelait SYST_CVR : mesuré ici, pas proposé tel quel) ;
//   sans-les-deux les deux à la fois.
//
// UNE VARIANTE PAR PROCESSUS : dans un même processus, `engine.stop()` laisse
// vivre les périphériques (timers USB, alarmes) du moteur précédent, qui
// continue de manger le CPU — les variantes suivantes mesurent alors moitié
// moins vite, quelle que soit la variante. Piège vérifié le 7 août 2026.
//
// Usage : node scripts/_ab-boucle-pico.mjs [sketch.py]
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
const VARIANTE = process.env.KABLIX_VARIANTE;
const FENETRE_MS = 6000;
const NOMS = ['ref', 'sans-pio', 'tick-groupé', 'sans-les-deux'];

// ------------------------------------------------- chef d'orchestre ----
if (!VARIANTE) {
  dire(`${SKETCH} — fenêtre ${FENETRE_MS / 1000} s, un processus par variante\n`);
  dire('variante         régime   moteur   Minstr/s');
  dire('-'.repeat(45));
  for (const nom of NOMS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), SKETCH], {
      cwd: root, encoding: 'utf8', env: { ...process.env, KABLIX_VARIANTE: nom },
    });
    dire((r.stdout || '').trim() || `${nom.padEnd(14)} ÉCHEC ${(r.stderr || '').split('\n')[0]}`);
  }
  process.exit(0);
}

// ----------------------------------------------------- une variante ----
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

const tmp = mkdtempSync(join(tmpdir(), 'kablix-abboucle-'));
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

const sim = engine.sim;
const clock = sim.clock;
if (VARIANTE === 'sans-pio' || VARIANTE === 'sans-les-deux') {
  for (const pio of sim.rp2040.pio) pio.advance = () => {};
}
if (VARIANTE === 'tick-groupé' || VARIANTE === 'sans-les-deux') {
  // Accumule le temps simulé et ne le verse à l'horloge qu'au moment où la
  // prochaine alarme le réclame — les échéances restent exactes, mais `nanos`
  // (donc SysTick) reste figé entre deux, ce qui est le défaut connu.
  const origTick = clock.tick.bind(clock);
  let accum = 0;
  clock.tick = (delta) => {
    accum += delta;
    const next = clock.nextAlarm;
    if (!next || clock.nanos + accum >= next.nanos) { const a = accum; accum = 0; origTick(a); }
  };
  const origOnTick = sim.onTick;
  sim.onTick = () => { if (accum) { const a = accum; accum = 0; origTick(a); } origOnTick?.(); };
}

const core = sim.rp2040.core;
const origExec = core.executeInstruction.bind(core);
let instr = 0;
let armed = false;
core.executeInstruction = () => { if (armed) instr++; return origExec(); };

let base = null;
const t0 = Date.now();
engine.onRunning = () => {
  armed = true; instr = 0;
  base = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs() };
};
engine.start();
await new Promise((resolve) => {
  const timer = setInterval(() => {
    if ((base && Date.now() - base.wall >= FENETRE_MS) || Date.now() - t0 > 120_000) {
      clearInterval(timer); resolve();
    }
  }, 100);
});
const fin = { wall: Date.now(), sim: engine.simulatedMs(), busy: engine.busyMs() };
engine.stop?.();
if (!base) { dire(`${VARIANTE.padEnd(14)} jamais démarré`); process.exit(0); }
const wall = fin.wall - base.wall;
dire(
  `${VARIANTE.padEnd(14)} ${((fin.sim - base.sim) / wall).toFixed(2).padStart(7)}  ` +
  `${(((fin.busy - base.busy) / wall) * 100).toFixed(0).padStart(5)} %  ` +
  `${(instr / (fin.busy - base.busy) / 1000).toFixed(1).padStart(9)}`
);
process.exit(0);
