// DIAGNOSTIC (outil d'atelier) — QUI réveille le cœur, et combien de fois ?
//
// Le cœur passe ~91 % du temps simulé endormi : ce temps-là est gratuit, sauté
// d'un bond jusqu'à la prochaine alarme. Tout ce qui plante une alarme rapprochée
// (USB-CDC, timers, PWM, PIO) coupe ces bonds, force à repasser par `tick`,
// `onTick` et la sortie de boucle WFE, et fait donc payer le temps simulé au prix
// fort. Ce script compte les DÉCLENCHEMENTS d'alarme par périphérique (le
// callback est identifié par sa source) et les sauts WFE sur une fenêtre.
//
// UN FIRMWARE PAR PROCESSUS (cf. `_mesure-firmware-pico.mjs`) : les moteurs
// arrêtés continuent de faire tourner leurs périphériques et faussent tout ce
// qui suit dans le même processus.
//
// Usage : node scripts/_diag-alarmes-pico.mjs [sketch.py]
//   (KABLIX_FW_DIR=<dossier> ajoute des firmwares à comparer)
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
const FENETRE_MS = 5000;

const dirs = [
  join(root, 'test-assets'),
  join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ...(process.env.KABLIX_FW_DIR ? [process.env.KABLIX_FW_DIR] : []),
];
const firmwares = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const n of readdirSync(dir)) if (/\.uf2$/i.test(n)) firmwares.push(join(dir, n));
}
if (!firmwares.length) { dire('SKIP : aucun firmware.'); process.exit(0); }

// Chef d'orchestre : une relance par firmware, mesure isolée à chaque fois.
if (!process.env.KABLIX_FW) {
  dire(`sketch : ${SKETCH}   fenêtre : ${FENETRE_MS / 1000} s\n`);
  for (const fw of firmwares) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), SKETCH], {
      cwd: root, encoding: 'utf8', env: { ...process.env, KABLIX_FW: fw },
    });
    dire((r.stdout || '').trim() || `=== ${fw.split(/[\\/]/).pop()} — ÉCHEC ${(r.stderr || '').split('\n')[0]}`);
    dire('');
  }
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'kablix-alarmes-'));
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

const source = readFileSync(tk(SKETCH), 'utf8');

/** Étiquette lisible d'un callback d'alarme (le bundle n'est pas minifié). */
function etiquette(cb) {
  const src = cb.toString().replace(/\s+/g, ' ');
  const m = /this\.(\w+)/.exec(src) || /(\w+)\(/.exec(src);
  return `${cb.name || '(anonyme)'} ${m ? m[0] : ''} ${src.slice(0, 60)}`;
}

{
  const fw = process.env.KABLIX_FW;
  const program = loadPythonProgram(fw, source, false);
  const engine = new PicoEngine({
    kind: 'flash',
    segments: program.payload.segments.map((s) => ({
      addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
    })),
    script: program.payload.script,
  });
  const clock = engine.sim.clock;
  const compte = new Map();
  let armed = false;
  let ticks = 0;
  let sauts = 0; // tick d'un saut WFE : plus long qu'un cycle CPU (8 ns)
  const marque = Symbol('kablix');
  const origTick = clock.tick.bind(clock);
  clock.tick = (delta) => {
    if (armed) { ticks++; if (delta > 100) sauts++; }
    // Les alarmes sont créées avant qu'on puisse s'insérer : on les enveloppe au
    // vol, au fur et à mesure qu'elles apparaissent dans la liste des planifiées.
    for (let a = clock.nextAlarm; a; a = a.next) {
      if (a.callback[marque]) continue;
      const orig = a.callback;
      const nom = etiquette(orig);
      const enveloppe = () => { if (armed) compte.set(nom, (compte.get(nom) || 0) + 1); return orig(); };
      enveloppe[marque] = true;
      a.callback = enveloppe;
    }
    return origTick(delta);
  };
  let base = null;
  const t0 = Date.now();
  engine.onRunning = () => {
    armed = true; compte.clear(); ticks = 0; sauts = 0;
    base = { wall: Date.now(), sim: engine.simulatedMs() };
  };
  engine.start();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if ((base && Date.now() - base.wall >= FENETRE_MS) || Date.now() - t0 > 120_000) {
        clearInterval(timer); resolve();
      }
    }, 100);
  });
  const simMs = engine.simulatedMs() - (base?.sim ?? 0);
  const wall = Date.now() - (base?.wall ?? Date.now());
  engine.stop?.();
  dire(`=== ${fw.split(/[\\/]/).pop()} — régime ${(simMs / wall).toFixed(2)} ===`);
  if (!base) { dire('  jamais démarré'); process.exit(0); }
  dire(`  ${(ticks / simMs).toFixed(0)} ticks/ms simulée · ${(sauts / simMs).toFixed(1)} sauts WFE/ms simulée`);
  const top = [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [nom, n] of top) dire(`  ${(n / simMs).toFixed(1).padStart(8)} /ms sim   ${nom}`);
  dire('');
}
process.exit(0);
