// Banc des fichiers web (HTML, CSS, JS…) d'un programme MicroPython serveur.
//
// Deux moitiés, toutes deux exécutées pour de vrai :
//
//  1. Le PLAN (src/picoWeb.ts via src/picoUploader.ts) : quels fichiers partent
//     sur la carte, sous quel chemin. Dossiers www/ et static/ en entier, plus
//     les fichiers nommés dans le code, arborescence conservée, bruit écarté.
//
//  2. La SIMULATION : le programme tourne dans le Pico simulé (firmware réel) et
//     rouvre ces fichiers par open(), comme un serveur le ferait. Le contenu lu
//     doit être celui du disque — c'est la preuve que simulation et carte voient
//     la même arborescence. Sauté si aucun firmware Pico n'est trouvé.
//
// Utilisation : npm run verify:picoweb
import esbuild from 'esbuild';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, 'node_modules', '.cache-verify-picoweb');

let checks = 0;
let failures = 0;
function ok(label, cond, detail = '') {
  checks++;
  if (cond) console.log(`✅ ${label}`);
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── Un dossier de projet : serveur + pages, plus du bruit ────────────────────
rmSync(WORK, { recursive: true, force: true });
for (const d of ['www/css', 'static/img', 'autre', 'lib']) mkdirSync(join(WORK, d), { recursive: true });

const SERVEUR = [
  'import os',
  'print("INDEX", open("www/index.html").read().strip())',
  'print("CSS", open("/www/css/app.css").read().strip())',
  'print("JS", open("static/app.js").read().strip())',
  'print("NOM", open("hors-dossier.html").read().strip())',
  'print("LS", sorted(os.listdir("www")), sorted(os.listdir("static")))',
  'print("FIN")',
  '',
].join('\n');
writeFileSync(join(WORK, 'serveur.py'), SERVEUR);
writeFileSync(join(WORK, 'www', 'index.html'), '<h1>Bonjour é</h1>\n');
writeFileSync(join(WORK, 'www', 'css', 'app.css'), 'body{color:red}\n');
writeFileSync(join(WORK, 'static', 'app.js'), 'console.log("js")\n');
writeFileSync(join(WORK, 'static', 'img', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 1]));
writeFileSync(join(WORK, 'hors-dossier.html'), '<p>nommé dans le code</p>\n');
// Bruit : jamais nommés dans le code, hors www/ et static/.
writeFileSync(join(WORK, 'autre', 'page.html'), '<p>je ne dois pas partir</p>\n');
writeFileSync(join(WORK, 'notes.txt'), 'pas pour la carte\n');
writeFileSync(join(WORK, 'www', '.DS_Store'), 'bruit');

async function bundle(entry, name, stubVscode = false) {
  const out = join(WORK, name);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    outfile: out, bundle: true, platform: 'node', format: 'esm',
    external: ['vscode'], logLevel: 'silent',
    plugins: stubVscode ? [{
      name: 'stub-vscode',
      setup(b) {
        b.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const commands={executeCommand(){}};export const window={};export const l10n={t:(s)=>s};export const ProgressLocation={Notification:15};',
          loader: 'js',
        }));
      },
    }] : [],
  });
  return import(pathToFileURL(out).href);
}

// ── 1. Le plan d'envoi ───────────────────────────────────────────────────────
const { planUpload } = await bundle('src/picoUploader.ts', 'uploader.mjs', true);
const plan = planUpload(join(WORK, 'serveur.py'));
const remotes = plan.map((p) => p.remotePath).sort();
console.log('Plan :', remotes.join(', '));

ok('le programme devient main.py', plan.find((p) => p.isMain)?.remotePath === 'main.py');
for (const r of ['www/index.html', 'www/css/app.css', 'static/app.js', 'static/img/logo.png']) {
  ok(`dossier dédié : ${r} part, chemin conservé`, remotes.includes(r), remotes.join(', '));
}
ok('fichier nommé dans le code (hors dossier) : hors-dossier.html part',
  remotes.includes('hors-dossier.html'));
ok('les fichiers web sont marqués comme tels', plan.filter((p) => p.isWeb).length === 5,
  `${plan.filter((p) => p.isWeb).length}`);
ok('le bruit reste à terre (autre/page.html, notes.txt, .DS_Store)',
  !remotes.some((r) => /page\.html|notes\.txt|DS_Store/.test(r)), remotes.join(', '));
ok('rien ne sort du dossier du programme',
  plan.every((p) => !p.remotePath.startsWith('..') && !p.remotePath.startsWith('/')));

// ── 2. La simulation ─────────────────────────────────────────────────────────
function findFirmware() {
  const dirs = [
    join(ROOT, 'test-assets'),
    join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
    join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'electropol-fr.kablix', 'micropython'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((n) => /^RPI_PICO-.*\.uf2$/.test(n));
    if (hit) return join(dir, hit);
  }
}
const fw = findFirmware();
if (!fw) {
  console.log('SKIP simulation : firmware Pico introuvable (RPI_PICO-*.uf2).');
} else {
  const { loadPythonProgram } = await bundle('src/compiler.ts', 'compiler.mjs');
  const { PicoEngine } = await bundle('src/webview/engines/pico.mts', 'pico.mjs');
  const { readFileSync } = await import('node:fs');

  async function run(source, maxMs = 120_000) {
    const program = loadPythonProgram(fw, source, false, join(WORK, 'serveur.py'));
    const engine = new PicoEngine({
      kind: 'flash',
      segments: program.payload.segments.map((s) => ({
        addr: s.addr, data: new Uint8Array(Buffer.from(s.b64, 'base64')),
      })),
      script: program.payload.script,
    });
    let serial = '';
    engine.onSerial = (c) => { serial += c; };
    engine.start();
    const t0 = Date.now();
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (/FIN|Traceback/.test(serial) || Date.now() - t0 > maxMs) { clearInterval(timer); resolve(); }
      }, 100);
    });
    engine.stop?.();
    // Le moteur décode déjà l'UTF-8 du CDC (v.262) : plus de rétablissement ici.
    return { serial, log: program.log };
  }

  const r = await run(SERVEUR);
  console.log(`(log : ${r.log})`);
  ok('simulation : open("www/index.html") rend le contenu du disque',
    r.serial.includes('INDEX <h1>Bonjour é</h1>'), JSON.stringify(r.serial.slice(-300)));
  ok('simulation : chemin avec « / » de tête (/www/css/app.css)',
    r.serial.includes('CSS body{color:red}'));
  ok('simulation : dossier static/ (static/app.js)', r.serial.includes('JS console.log("js")'));
  ok('simulation : fichier nommé dans le code (hors-dossier.html)',
    r.serial.includes('NOM <p>nommé dans le code</p>'));
  ok('simulation : os.listdir voit la même arborescence',
    r.serial.includes("LS ['css', 'index.html'] ['app.js', 'img']"), JSON.stringify(r.serial.slice(-300)));
  ok('simulation : le programme va jusqu au bout', r.serial.includes('FIN'));

  // Une grosse page, proche de la limite (24 Ko) : doit rester lisible en entier
  // et laisser de la mémoire au programme.
  writeFileSync(join(WORK, 'www', 'gros.html'), 'x'.repeat(22_000));
  const g = await run([
    'import gc',
    'f = open("www/gros.html")',
    'n = 0',
    'while True:',
    '    b = f.read(1024)',
    '    if not b: break',
    '    n += len(b)',
    'gc.collect()',
    'print("GROS", n, gc.mem_free() > 20000)',
    'print("FIN")',
    '',
  ].join('\n'));
  ok('simulation : page de 22 Ko lue en entier, mémoire libre restante',
    g.serial.includes('GROS 22000 True'), JSON.stringify(g.serial.slice(0, 200)));

  // Au-delà de la limite : le fichier est écarté ET le journal le dit.
  writeFileSync(join(WORK, 'www', 'trop.html'), 'y'.repeat(30_000));
  const t = await run('print("FIN")\n');
  ok('fichier au-delà de la limite : écarté et signalé dans le journal',
    /NON écrits en simulation.*www\/trop\.html/.test(t.log), t.log);
}

console.log(`\npicoweb : ${checks} contrôles, ${failures} échec(s).`);
console.log(failures === 0 ? 'RESULTAT: OK' : 'RESULTAT: ECHEC');
process.exit(failures === 0 ? 0 : 1);
