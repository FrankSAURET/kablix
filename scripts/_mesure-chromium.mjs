// Mesure jetable et DÉCISIVE : le moteur AVR est-il aussi rapide dans Chromium
// (le moteur JS de la webview VS Code) que dans Node ? Les deux partagent V8, mais
// le badge de Frank donne un débit de 0,74× là où Node en mesure ~1,2× sur la même
// machine. Si Chromium retrouve 1,2×, la lenteur vient de la CHARGE de la machine
// pendant un F5 (VS Code + hôte d'extension + rendu) et non du navigateur.
//
// Le moteur est bundlé pour le navigateur, chargé dans une page vide, lancé à
// plein régime (ancre maintenue en retard, comme _mesure-plein-regime.mjs) et le
// résultat est écrit dans le DOM — récupéré par --dump-dom. Pas de rAF ici (il
// est mort sous --dump-dom) : la boucle du moteur n'utilise que MessageChannel et
// setTimeout, qui fonctionnent, eux.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-chromium-'));

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!CHROME) {
  console.log('Chrome introuvable, mesure impossible');
  process.exit(0);
}

const buildNode = async (entry, name) => {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)], outfile: out,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
};
const { compile, detectToolchain } = await buildNode('src/compiler.ts', 'compiler.mjs');
const { AvrEngine } = await buildNode('src/webview/engines/avr.mts', 'avr-node.mjs');

let tools = detectToolchain();
if (!tools.arduinoCli && !tools.avrGcc) {
  const gccRoot = process.env.LOCALAPPDATA
    && join(process.env.LOCALAPPDATA, 'Arduino15', 'packages', 'arduino', 'tools', 'avr-gcc');
  if (gccRoot && existsSync(gccRoot)) {
    for (const v of readdirSync(gccRoot)) process.env.PATH = join(gccRoot, v, 'bin') + delimiter + process.env.PATH;
  }
  tools = detectToolchain();
}
if (!tools.arduinoCli && !tools.avrGcc) {
  console.log('toolchain absente, mesure impossible');
  process.exit(0);
}

const res = await compile('uno', join(root, 'testkablix/horloge-uno/horloge-uno.ino'), root);
const program = Array.from(res.payload.bytes);
console.log(`horloge-uno.ino compilé : ${program.length} mots\n`);

const SECONDES = 3;

// Harnais commun aux deux environnements, entièrement SYNCHRONE : la boucle est
// appelée à la main (sa replanification est neutralisée) et l'ancre est maintenue
// en retard pour qu'elle ait toujours du retard à rattraper. Synchrone parce que
// --dump-dom photographie la page dès la fin du chargement : une mesure par
// setTimeout ne serait jamais dans le résultat. Le code est identique des deux
// côtés, c'est la condition pour que la comparaison veuille dire quelque chose.
const HARNAIS = (engine, secondes) => {
  engine.onSerial = () => {};
  engine.onUpdate = () => {};
  engine.schedule = () => {}; // pas de yield : on rappelle la boucle nous-mêmes
  engine.start();
  const fin = performance.now() + secondes * 1000;
  while (performance.now() < fin) {
    if (engine.paceWall) engine.paceWall -= 200;
    engine.loop();
  }
  const debit = engine.simulatedMs() / engine.busyMs();
  engine.dispose();
  return debit;
};

// ------------------------------------------------------------------ Node ----
const mesureNode = () => HARNAIS(new AvrEngine(Uint16Array.from(program), null), SECONDES);

// -------------------------------------------------------------- Chromium ----
// Le moteur, bundlé pour le navigateur, exposé en global pour la page d'essai.
const bundleWeb = join(tmp, 'avr-web.js');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/engines/avr.mts')],
  outfile: bundleWeb,
  bundle: true, platform: 'browser', format: 'iife', globalName: 'KablixAvr',
  target: 'es2020', minify: true, logLevel: 'silent',
});

const page = join(tmp, 'bench.html');
writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><pre id="out">…</pre>
<script src="./avr-web.js"></script>
<script>
const HARNAIS = ${HARNAIS.toString()};
const program = Uint16Array.from(${JSON.stringify(program)});
const debit = HARNAIS(new KablixAvr.AvrEngine(program, null), ${SECONDES});
document.getElementById('out').textContent = 'DEBIT=' + debit.toFixed(3);
</script>`);

const mesureChromium = () => {
  const html = execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--dump-dom', pathToFileURL(page).href],
    { encoding: 'utf8', timeout: 120000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
  );
  const m = /DEBIT=([\d.]+)/.exec(html);
  return m ? Number(m[1]) : null;
};

// Alterné : la machine varie beaucoup d'un instant à l'autre.
let bestNode = 0;
let bestChrome = 0;
for (let tour = 0; tour < 3; tour++) {
  const n = mesureNode();
  const c = mesureChromium();
  console.log(`  tour ${tour + 1} : Node ${n.toFixed(2)}× · Chromium ${c === null ? '—' : c.toFixed(2) + '×'}`);
  bestNode = Math.max(bestNode, n);
  if (c !== null) bestChrome = Math.max(bestChrome, c);
}
console.log(`\nMeilleur : Node ${bestNode.toFixed(2)}× · Chromium ${bestChrome.toFixed(2)}×`);
