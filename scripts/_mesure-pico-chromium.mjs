// MESURE (outil d'atelier) — le moteur Pico est-il aussi rapide dans le moteur JS
// de la webview (Chromium) que dans Node ?
//
// `_mesure-regime-pico.mjs` mesure en Node : il dit 1,00 alors que le chronomètre
// de Frank voit l'horloge retarder. La webview ne tourne PAS dans Node : elle
// tourne dans le Chromium d'Electron. Ce script fait tourner LE MÊME moteur, avec
// LE MÊME programme, des deux côtés, et compare.
//
// Le harnais est SYNCHRONE des deux côtés (--dump-dom photographie la page dès la
// fin du chargement : une mesure par setTimeout n'y serait jamais). `setTimeout`
// et `MessageChannel` sont remplacés par une file pompée à la main ; le temps,
// lui, reste le temps RÉEL (Date.now/performance.now), donc le cadencement du
// moteur et le régime mesuré gardent exactement leur sens.
//
// Usage : node scripts/_mesure-pico-chromium.mjs [sketch.py] [--latch]
//   --latch : ajoute la charge que l'UI met sur CHAQUE front GPIO (le latch des
//             7 segments multiplexés, cf. sampleSevenSegLatches dans sim.mts).
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tk } from '../testkablix/_paths.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-picochrome-'));

const args = process.argv.slice(2);
const LATCH = args.includes('--latch');
const SKETCH = args.find((a) => !a.startsWith('--')) || 'Horloge.py';
const CHAUFFE_MS = 6000;
const FENETRE_MS = 6000;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!CHROME) { console.log('Chrome introuvable, mesure impossible'); process.exit(0); }

function findFirmware() {
  const dirs = [
    join(root, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => /^RPI_PICO-.*\.uf2$/.test(n));
    if (hit) return join(dir, hit);
  }
  return undefined;
}
const fw = findFirmware();
if (!fw) { console.log('SKIP : firmware Pico introuvable.'); process.exit(0); }

const buildNode = async (entry, name) => {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out, bundle: true,
    platform: 'node', format: 'esm', external: ['vscode'], logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
};
const { loadPythonProgram } = await buildNode('src/compiler.ts', 'compiler.mjs');
const { PicoEngine } = await buildNode('src/webview/engines/pico.mts', 'pico-node.mjs');

const source = readFileSync(tk(SKETCH), 'utf8');
const program = loadPythonProgram(fw, source, false);
const charge = { segments: program.payload.segments, script: program.payload.script };

// --------------------------------------------------------------- harnais ----
// Identique des deux côtés — c'est la condition pour que la comparaison veuille
// dire quelque chose. Rendu en source par toString() pour la page Chromium.
const HARNAIS = (Engine, charge, opts) => {
  // File de tâches : setTimeout et MessageChannel deviennent des dépôts, la
  // boucle ci-dessous les rejoue elle-même. Sans ça, rien n'avance en synchrone.
  const q = [];
  let seq = 0;
  globalThis.setTimeout = (fn, ms) => {
    const id = ++seq;
    q.push({ id, fn, at: Date.now() + (ms || 0) });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    const i = q.findIndex((t) => t.id === id);
    if (i >= 0) q.splice(i, 1);
  };
  globalThis.MessageChannel = class {
    constructor() {
      const self = this;
      this.port2 = { onmessage: null };
      this.port1 = {
        postMessage(data) {
          q.push({ id: ++seq, at: Date.now(), fn: () => self.port2.onmessage?.({ data }) });
        },
      };
    }
  };
  const pomper = (finMs) => {
    while (Date.now() < finMs) {
      const now = Date.now();
      let i = -1;
      for (let k = 0; k < q.length; k++) if (q[k].at <= now) { i = k; break; }
      if (i < 0) continue; // rien de dû : on attend en tournant (le pacing est réel)
      q.splice(i, 1)[0].fn();
    }
  };

  const engine = new Engine({
    kind: 'flash',
    segments: charge.segments.map((s) => ({
      addr: s.addr,
      data: (() => {
        const bin = atob(s.b64);
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return u;
      })(),
    })),
    script: charge.script,
  });

  let fronts = 0;
  // Charge de l'UI par front GPIO : le latch 7 segments (4 chiffres × 8 segments),
  // copie fidèle de sampleSevenSegLatches côté produit.
  const SEG = [2, 3, 4, 5, 6, 7, 8, null];
  const DIG = [10, 11, 12, 13];
  const latch = new Array(32).fill(0);
  engine.onUpdate = () => {
    fronts++;
    if (!opts.latch) return;
    for (let d = 0; d < 4; d++) {
      if (engine.readDigital(DIG[d])) continue; // cathode commune : actif à 0
      for (let s = 0; s < 8; s++) {
        const p = SEG[s];
        latch[d * 8 + s] = p !== null && engine.readDigital(p) ? 1 : 0;
      }
    }
  };
  let parti = false;
  engine.onRunning = () => { parti = true; };
  engine.start();
  pomper(Date.now() + opts.chauffe);
  // Base prise APRÈS la chauffe : la prendre à onRunning compterait le temps
  // simulé de toute la chauffe dans une fenêtre qui ne l'est pas (régime > 1).
  const base = { sim: engine.simulatedMs(), busy: engine.busyMs(), fronts };
  const t0 = Date.now();
  pomper(t0 + opts.fenetre);
  const wall = Date.now() - t0;
  const r = {
    regime: (engine.simulatedMs() - base.sim) / wall,
    moteur: (engine.busyMs() - base.busy) / wall,
    fronts: Math.round((fronts - base.fronts) / (wall / 1000)),
    demarre: parti,
  };
  engine.stop?.();
  return r;
};

// ------------------------------------------------------------------ Node ----
// `atob` existe en Node ≥ 16 : le code de la page marche tel quel.
const mesureNode = () => HARNAIS(PicoEngine, charge, { chauffe: CHAUFFE_MS, fenetre: FENETRE_MS, latch: LATCH });

// -------------------------------------------------------------- Chromium ----
const bundleWeb = join(tmp, 'pico-web.js');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/engines/pico.mts')],
  outfile: bundleWeb, bundle: true, platform: 'browser', format: 'iife',
  globalName: 'KablixPico', target: 'es2022', minify: true, logLevel: 'silent',
});
const page = join(tmp, 'bench.html');
writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><pre id="out">…</pre>
<script src="./pico-web.js"></script>
<script id="charge" type="application/json">${JSON.stringify(charge)}</script>
<script>
const HARNAIS = ${HARNAIS.toString()};
try {
  const charge = JSON.parse(document.getElementById('charge').textContent);
  const r = HARNAIS(KablixPico.PicoEngine, charge, { chauffe: ${CHAUFFE_MS}, fenetre: ${FENETRE_MS}, latch: ${LATCH} });
  document.getElementById('out').textContent = 'RES=' + JSON.stringify(r);
} catch (e) {
  // Sans ça, une erreur dans la page ne laisse aucune trace : --dump-dom rend
  // une page muette et la mesure semble « impossible » sans raison.
  document.getElementById('out').textContent = 'ERR=' + (e && e.stack || e);
}
</script>`);
console.log(`page : ${page}\n`);

const mesureChromium = () => {
  const html = execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--dump-dom', pathToFileURL(page).href],
    { encoding: 'utf8', timeout: 180000, windowsHide: true, maxBuffer: 128 * 1024 * 1024 },
  );
  const m = /RES=(\{[^<]*\})/.exec(html);
  if (m) return JSON.parse(m[1]);
  const err = /ERR=([^<]*)/.exec(html);
  console.log(`Chromium : ${err ? err[1].slice(0, 500) : 'aucun résultat dans la page'}`);
  return null;
};

console.log(`sketch : ${SKETCH}   firmware : ${fw.split(/[\\/]/).pop()}   latch UI : ${LATCH ? 'oui' : 'non'}\n`);
console.log('environnement   régime   moteur   fronts GPIO/s');
console.log('-'.repeat(50));
const c = mesureChromium();
const n = mesureNode();
const ligne = (nom, r) => console.log(
  `${nom.padEnd(14)} ${r ? r.regime.toFixed(2).padStart(6) : '     —'}  ${r ? (r.moteur * 100).toFixed(0).padStart(5) + ' %' : '     —'}  ${r ? String(r.fronts).padStart(13) : '     —'}`
);
ligne('Chromium', c);
ligne('Node', n);
process.exit(0);
