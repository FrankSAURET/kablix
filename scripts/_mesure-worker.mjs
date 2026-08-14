// Mesure jetable : combien de fil PRINCIPAL la simulation rend-elle quand le
// moteur part dans un Web Worker ? La question du lot 5 — faut-il activer
// `kablix.simulationWorker` par défaut ?
//
// Protocole : dans Chromium (le moteur JS de la webview), on lance le même sketch
// deux fois — moteur sur le fil principal, puis moteur dans un vrai Worker — et on
// mesure le RETARD d'un battement de 16 ms tenu par le fil principal. C'est
// exactement ce que subit le rendu : un rAF qui devait tomber à 16 ms et qui
// arrive à 60 ms, c'est une image sautée et un clic qui traîne.
//
// Pas de rAF ici (mort sous --dump-dom) : setInterval et MessageChannel, eux,
// fonctionnent. Résultat écrit dans le DOM et récupéré par --dump-dom.
//
// Usage : node scripts/_mesure-worker.mjs [--pico]
//   sans rien : Uno (avr8js, plus rapide que la puce, le fil respire)
//   --pico    : RP2040 (rp2040js, ~11× plus lent que la puce) — le cas décisif.
import esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-worker-'));
const PICO = process.argv.includes('--pico');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!CHROME) {
  console.log('Chrome introuvable, mesure impossible');
  process.exit(0);
}

const workerBundle = join(root, 'dist', 'webview-worker.js');
if (!existsSync(workerBundle)) {
  console.log('dist/webview-worker.js absent : lancer `npm run build` avant.');
  process.exit(0);
}

// --- Sketch de test, compilé pour de vrai -------------------------------------
const buildMod = async (entry, name) => {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
};
// Charge Pico : Horloge.py, l'afficheur 4 chiffres multiplexé de testkablix.
// Même cas de figure que le sketch Uno écrit plus bas, mais sur rp2040js.
let picoProgram = null;
if (PICO) {
  const firmware = [
    join(root, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ]
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).filter((n) => /^RPI_PICO-.*\.uf2$/.test(n)).map((n) => join(d, n)))[0];
  if (!firmware) {
    console.log('SKIP : firmware Pico introuvable.');
    process.exit(0);
  }
  const { loadPythonProgram } = await buildMod('src/compiler.ts', 'compiler-py.mjs');
  const src = readFileSync(join(root, 'testkablix', 'Horloge.py'), 'utf8');
  const p = loadPythonProgram(firmware, src, false);
  picoProgram = { segments: p.payload.segments, script: p.payload.script };
  console.log(`Horloge.py chargée : ${picoProgram.segments.length} segments de flash`);
}

const { compile, detectToolchain } = PICO ? {} : await buildMod('src/compiler.ts', 'compiler.mjs');
let tools = PICO ? { arduinoCli: true } : detectToolchain();
if (!tools.arduinoCli && !tools.avrGcc) {
  const gccRoot =
    process.env.LOCALAPPDATA &&
    join(process.env.LOCALAPPDATA, 'Arduino15', 'packages', 'arduino', 'tools', 'avr-gcc');
  if (gccRoot && existsSync(gccRoot)) {
    for (const v of readdirSync(gccRoot)) {
      process.env.PATH = join(gccRoot, v, 'bin') + delimiter + process.env.PATH;
    }
  }
  tools = detectToolchain();
}
if (!tools.arduinoCli && !tools.avrGcc) {
  console.log('toolchain absente, mesure impossible');
  process.exit(0);
}
// Sketch de mesure : un afficheur 7 segments MULTIPLEXÉ balayé à 500 Hz, le cas
// le plus exigeant — c'est lui qui obligeait la page à échantillonner le latch à
// chaque front GPIO. Écrit ici (mesure jetable), pas versionné dans testkablix.
const sketchDir = join(tmp, 'mux-uno');
mkdirSync(sketchDir, { recursive: true });
const ino = join(sketchDir, 'mux-uno.ino');
if (!PICO)
  writeFileSync(
    ino,
    `const int SEGS[8] = {2,3,4,5,6,7,8,9};
const int DIGS[4] = {10,11,12,13};
const byte CH[10] = {0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f};
int valeur = 0;
void setup() {
  for (int i = 0; i < 8; i++) pinMode(SEGS[i], OUTPUT);
  for (int i = 0; i < 4; i++) { pinMode(DIGS[i], OUTPUT); digitalWrite(DIGS[i], HIGH); }
}
void loop() {
  for (int d = 0; d < 4; d++) {
    for (int i = 0; i < 4; i++) digitalWrite(DIGS[i], HIGH);
    int chiffre = (valeur / (d == 0 ? 1 : d == 1 ? 10 : d == 2 ? 100 : 1000)) % 10;
    for (int s = 0; s < 8; s++) digitalWrite(SEGS[s], (CH[chiffre] >> s) & 1);
    digitalWrite(DIGS[d], LOW);   // chiffre actif (cathode commune)
    delay(2);                     // ~2 ms par chiffre : balayage à 125 Hz
  }
  valeur = (valeur + 1) % 10000;
}
`
  );
const program = PICO ? picoProgram : Array.from((await compile('uno', ino, root)).payload.bytes);
if (!PICO) console.log(`mux-uno.ino compilé : ${program.length} mots`);

// --- Bundle du moteur pour le navigateur --------------------------------------
const chemin = (p) => join(root, p).replace(/\\/g, '/');
writeFileSync(
  join(tmp, 'e.mts'),
  PICO
    ? `export { PicoEngine } from '${chemin('src/webview/engines/pico.mts')}';
export { sampleSevenSeg } from '${chemin('src/webview/engines/sevenseg.mts')}';\n`
    : `export { AvrEngine } from '${chemin('src/webview/engines/avr.mts')}';
export { sampleSevenSeg } from '${chemin('src/webview/engines/sevenseg.mts')}';\n`
);
const page = await esbuild.build({
  entryPoints: [join(tmp, 'e.mts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'browser',
  logLevel: 'silent',
});
const engineJs = page.outputFiles[0].text;
const workerJs = readFileSync(workerBundle, 'utf8');

const SECONDS = 6;
const BEAT_MS = 16;

const html = `<!doctype html><meta charset="utf-8"><body><pre id="out">…</pre>
<script type="module">
${engineJs}
const PICO = ${PICO};
const PROGRAM = ${JSON.stringify(program)};
const WORKER_SRC = ${JSON.stringify(workerJs)};
const BEAT = ${BEAT_MS}, DUREE = ${SECONDS * 1000};
// L'afficheur du sketch : 4 chiffres, cathode commune, chiffre actif à 0.
const GP = (n) => PICO ? 'GP' + n : String(n);
const SPEC = {
  partId: 'sevenseg1', digits: 4, commonAnode: false,
  segPins: PICO
    ? ['GP2', 'GP3', 'GP4', 'GP5', 'GP6', 'GP7', 'GP8', null]
    : ['2', '3', '4', '5', '6', '7', '8', '9'],
  digitPins: [GP(10), GP(11), GP(12), GP(13)],
  segFixed: [null, null, null, null, null, null, null, null],
  digitFixed: [null, null, null, null],
};
const PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(GP);
let FRAME_MS = 6; // coût d'une frame d'interface, fixé par la boucle de mesure

/**
 * Reproduit la charge d'INTERFACE : une frame de Kablix coûte quelques ms de
 * calcul (refreshVisuals, netlists, styles) et voudrait tomber toutes les 16 ms.
 * On enchaîne ces frames aussi vite que le fil le permet et on compte celles qui
 * passent : c'est la fluidité, mesurée là où l'élève la ressent.
 */
function battement() {
  const attentes = [];
  let frames = 0, arrete = false, last = performance.now();
  const tick = () => {
    if (arrete) return;
    const t0 = performance.now();
    attentes.push(t0 - last); // temps volé au rendu par le reste du fil
    while (performance.now() - t0 < FRAME_MS) { /* le travail d'une frame */ }
    frames++;
    last = performance.now();
    setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
  return {
    fin() {
      arrete = true;
      const a = attentes.slice().sort((x, y) => x - y);
      const n = a.length;
      return {
        battements: frames,
        attendus: Math.round(DUREE / BEAT),
        moyen: a.reduce((s, v) => s + v, 0) / Math.max(1, n),
        median: a[Math.floor(n / 2)] ?? 0,
        p95: a[Math.floor(n * 0.95)] ?? 0,
        pire: a[n - 1] ?? 0,
      };
    },
  };
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Programme Pico : les segments de flash arrivent en base64, à décoder ici. */
function programmePico() {
  return {
    kind: 'flash',
    script: PROGRAM.script,
    segments: PROGRAM.segments.map((s) => {
      const bin = atob(s.b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return { addr: s.addr, data: u };
    }),
  };
}

/**
 * Le Pico démarre MicroPython avant d'exécuter le script : mesurer pendant le
 * boot compterait un régime qui n'a rien à voir. On attend le départ du script.
 */
async function chauffer(estParti) {
  if (!PICO) return;
  for (let i = 0; i < 600 && !estParti(); i++) await attendre(50);
  await attendre(500);
}

/** Variante A : le moteur tourne ICI, comme depuis toujours. */
async function surLeFilPrincipal() {
  const engine = PICO
    ? new PicoEngine(programmePico())
    : new AvrEngine(Uint16Array.from(PROGRAM), null, 'avr328');
  // Le rendu lit les broches à chaque frame ; le latch 7 segments, lui, est
  // échantillonné à CHAQUE front GPIO — la vraie fonction du produit, pas une
  // imitation : c'est la charge exacte que le worker doit reprendre.
  const latches = new Map();
  let fronts = 0;
  engine.onUpdate = () => {
    fronts++;
    sampleSevenSeg([SPEC], latches, (p) => engine.readDigital(p));
  };
  let parti = false;
  engine.onRunning = () => { parti = true; };
  engine.setSpeed(1);
  engine.start();
  await chauffer(() => parti);
  const base = engine.simulatedMs();
  const b = battement();
  await attendre(DUREE);
  const r = b.fin();
  r.fronts = fronts;
  r.simule = engine.simulatedMs() - base;
  engine.stop();
  engine.dispose();
  return r;
}

/** Variante B : le moteur tourne dans un vrai Worker (même bundle que Kablix). */
async function dansUnWorker() {
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  const w = new Worker(url, { type: 'module' });
  let snapshots = 0, simule = 0, parti = false;
  w.onmessage = (e) => {
    if (e.data.t === 'snapshot') { snapshots++; simule = e.data.snap.simulatedMs; }
    else if (e.data.t === 'scriptStarted') parti = true;
  };
  w.postMessage({
    t: 'init',
    board: PICO ? 'pico' : 'uno',
    program: PICO ? programmePico() : Uint16Array.from(PROGRAM),
    debugInfo: null,
    pins: PINS,
  });
  w.postMessage({ t: 'setSevenSeg', displays: [SPEC] });
  w.postMessage({ t: 'start' });
  await chauffer(() => parti);
  const base = simule;
  const b = battement();
  await attendre(DUREE);
  const r = b.fin();
  r.snapshots = snapshots;
  r.simule = simule - base;
  w.postMessage({ t: 'dispose' });
  w.terminate();
  return r;
}

// Trois charges d'interface : un schéma léger, un schéma moyen, un gros schéma.
// C'est là que tout se joue — un fil principal chargé vole son temps au moteur,
// et la simulation prend du retard sur l'heure au lieu de sauter des images.
const mesures = [];
for (const charge of [4, 8, 14]) {
  FRAME_MS = charge;
  const a = await surLeFilPrincipal();
  await attendre(300);
  const b = await dansUnWorker();
  await attendre(300);
  mesures.push({ charge, a, b });
}
document.getElementById('out').textContent = 'fini';
await fetch('/resultat', { method: 'POST', body: JSON.stringify(mesures) });
</script></body>`;

// Chrome sert de banc, mais `--dump-dom` rend le DOM AU CHARGEMENT : il faut
// attendre 12 s de mesure. Un `--virtual-time-budget` fausserait tout (le temps
// virtuel saute, le retard mesuré n'aurait plus de sens). D'où un petit serveur
// local : la page renvoie son résultat par fetch, et on ferme Chrome derrière.
const attendu = new Promise((resolve) => {
  const srv = createServer((req, rep) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        rep.end('ok');
        srv.close();
        resolve(JSON.parse(body));
      });
      return;
    }
    rep.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    rep.end(html);
  });
  srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port;
    const chrome = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--user-data-dir=' + join(tmp, 'profil'),
        `http://127.0.0.1:${port}/`,
      ],
      { stdio: 'ignore', windowsHide: true }
    );
    srv.on('close', () => chrome.kill());
  });
});
const mesures = await attendu;
const ligne = (nom, r) =>
  `  ${nom.padEnd(16)} frames ${String(r.battements).padStart(4)}` +
  ` · attente médiane ${r.median.toFixed(1)} ms · pire ${r.pire.toFixed(1)} ms` +
  ` · simulé ${(r.simule / 1000).toFixed(2)} s / ${SECONDS} s` +
  ` (${((r.simule / (SECONDS * 1000)) * 100).toFixed(0)} % de l'heure)`;
console.log('');
console.log(PICO ? '=== RP2040 (rp2040js, Horloge.py) ===' : '=== Uno (avr8js, mux-uno.ino) ===');
for (const { charge, a, b } of mesures) {
  console.log(`frame d'interface de ${charge} ms :`);
  console.log(ligne('fil principal', a) + ` · fronts ${a.fronts}`);
  console.log(ligne('worker', b) + ` · instantanés ${b.snapshots}`);
  const gainFrames = ((b.battements / Math.max(1, a.battements) - 1) * 100).toFixed(0);
  const gainHeure = ((b.simule / Math.max(1, a.simule) - 1) * 100).toFixed(0);
  console.log(`  → frames ${gainFrames} % · temps simulé tenu ${gainHeure} %`);
  console.log('');
}
