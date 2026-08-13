/**
 * Banc du fil de simulation (Web Worker).
 *
 * Deux moitiés :
 *  - le CÂBLAGE, lu dans les sources : bundle déclaré, CSP ouverte au blob, réglage
 *    présent, repli sur le moteur du fil principal ;
 *  - le COMPORTEMENT du proxy `WorkerEngine`, exécuté pour de vrai dans Node avec
 *    un faux `Worker` : c'est la moitié qui compte, puisque toute la simulation lit
 *    ses broches à travers lui.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-worker');

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: Boolean(cond), detail });

// --- 1. Câblage, lu dans les sources -----------------------------------------
const html = readFileSync(join(ROOT, 'src', 'webview-html.ts'), 'utf8');
const build = readFileSync(join(ROOT, 'esbuild.js'), 'utf8');
const sim = readFileSync(join(ROOT, 'src', 'webview', 'sim.mts'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const nls = JSON.parse(readFileSync(join(ROOT, 'package.nls.json'), 'utf8'));

ok(
  'esbuild : le worker a son propre bundle (dist/webview-worker.js)',
  /sim-worker\.mts/.test(build) && /dist\/webview-worker\.js/.test(build)
);
ok(
  'esbuild : le bundle du worker est construit avec les autres',
  /esbuild\.build\(workerConfig\)/.test(build) && /ctxWorker\.watch\(\)/.test(build)
);
// Un `new Worker(uri)` sur l'URI de webview est refusé (origine différente) : le
// bundle est récupéré par fetch puis instancié depuis un blob.
ok('CSP : worker-src autorise le blob', /worker-src blob:/.test(html));
ok('CSP : connect-src autorise le fetch du bundle', /connect-src \$\{webview\.cspSource\}/.test(html));
ok(
  'webview-html : l’URL du bundle et le réglage sont injectés dans la page',
  /KABLIX_WORKER_URL/.test(html) && /KABLIX_SIM_WORKER/.test(html)
);
ok(
  'package.json : le réglage kablix.simulationWorker existe, désactivé par défaut',
  manifest.contributes?.configuration?.properties?.['kablix.simulationWorker']?.default === false
);
ok(
  'package.nls.json : le réglage est décrit (langue de base)',
  typeof nls['kablix.config.simulationWorker'] === 'string' &&
    nls['kablix.config.simulationWorker'].length > 40
);
// Le repli est le garde-fou principal : bundle absent, CSP fermée ou réglage
// éteint, la simulation doit démarrer exactement comme avant.
ok(
  'sim.mts : repli sur AvrEngine si le worker n’est pas disponible',
  /workerReady\(\)[\s\S]{0,200}\?\?\s*\n?\s*new AvrEngine/.test(sim)
);
ok(
  'sim.mts : le Pico ne passe pas encore par le worker',
  /boardFamily\(board\) === 'rp2040'\s*\n?\s*\? new PicoEngine/.test(sim)
);
ok(
  'sim.mts : le bundle est préchargé (startRun est synchrone, il ne peut pas attendre)',
  /void preloadWorker\(url\)/.test(sim)
);

// --- 2. Comportement du proxy, exécuté pour de vrai ---------------------------
const entry = `export * from '../../src/webview/engines/worker-engine.mjs';
export { emptySnapshot } from '../../src/webview/engines/worker-protocol.mjs';
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mts'), entry);
const bundled = await esbuild({
  entryPoints: [join(CACHE, 'e.mts')],
  bundle: true,
  format: 'esm',
  write: false,
  absWorkingDir: ROOT,
});
writeFileSync(join(CACHE, 'e.mjs'), bundled.outputFiles[0].text);

// Faux worker : il retient ce qu'on lui poste et rend la main pour lui répondre.
// Chaque instance garde SON gestionnaire — le banc monte plusieurs moteurs, un
// gestionnaire partagé répondrait au dernier créé.
const posted = [];
const workers = [];
class FakeWorker {
  constructor() {
    this.terminated = false;
    this.handler = null;
    workers.push(this);
  }
  postMessage(msg) {
    posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  set onmessage(fn) {
    this.handler = fn;
  }
}
/** Fait remonter un message du worker `w` vers la page. */
const deliver = (w, msg) => w.handler({ data: msg });
// L'URL du module est calculée AVANT d'installer le faux `URL` : l'import
// dynamique a besoin du vrai constructeur.
const moduleUrl = pathToFileURL(join(CACHE, 'e.mjs')).href;
globalThis.Worker = FakeWorker;
globalThis.Blob = class {};
globalThis.URL = { createObjectURL: () => 'blob:faux', revokeObjectURL: () => {} };
globalThis.fetch = async () => ({ text: async () => '/* faux bundle */' });

const mod = await import(moduleUrl);
const { WorkerEngine, preloadWorker, workerReady, emptySnapshot } = mod;

// Sans préchargement, aucun moteur : l'appelant doit pouvoir retomber sur l'AvrEngine.
ok('sans préchargement, create() rend null (repli possible)', WorkerEngine.create('uno', new Uint16Array(4), null) === null);
ok('workerReady() est faux tant que le bundle n’est pas là', workerReady() === false);

await preloadWorker('http://faux/webview-worker.js');
ok('après préchargement, workerReady() est vrai', workerReady() === true);

const engine = WorkerEngine.create('uno', new Uint16Array([1, 2, 3, 4]), null);
const engineWorker = workers.at(-1);
ok('après préchargement, create() rend un moteur', engine !== null);

const init = posted.find((m) => m.t === 'init');
ok('init : la carte et le programme sont transmis', init?.board === 'uno' && init?.program?.length === 4);
// `readDigital` peut porter sur n'importe quelle broche : elles sont toutes publiées.
ok(
  'init : les 20 broches d’une Uno sont publiées (14 numériques + 6 analogiques)',
  init?.pins?.length === 20 && init.pins[0] === '0' && init.pins.at(-1) === 'A5',
  `${init?.pins?.length} broches`
);
const initMega = (() => {
  posted.length = 0;
  WorkerEngine.create('mega', new Uint16Array(2), null);
  return posted.find((m) => m.t === 'init');
})();
ok(
  'init : 70 broches pour une Mega (54 numériques + 16 analogiques)',
  initMega?.pins?.length === 70,
  `${initMega?.pins?.length} broches`
);

// Lectures : elles répondent depuis le dernier instantané, sans attendre le worker.
const snap = emptySnapshot(20);
snap.seq = 1;
snap.digital[13] = 1;
snap.pulseUs[9] = 1500;
snap.pwmDuty[6] = 0.25;
snap.pulseActive[8] = 1;
snap.drive[2] = 3; // pullup
snap.neopixel['7'] = [0xff8800];
snap.lcd['lcd1'] = ['Bonjour', ''];
snap.simulatedMs = 1234;
deliver(engineWorker, { t: 'snapshot', snap });

ok('readDigital lit l’instantané', engine.readDigital('13') === true && engine.readDigital('12') === false);
ok('readPulseUs lit l’instantané (servo à 1500 µs)', engine.readPulseUs('9') === 1500);
ok('readPwmDuty lit l’instantané', Math.abs(engine.readPwmDuty('6') - 0.25) < 1e-6);
ok('pulseActive lit l’instantané', engine.pulseActive('8') === true);
ok('readPinDrive décode le code d’instantané', engine.readPinDrive('2') === 'pullup');
ok('readPinDrive : broche inconnue → haute impédance', engine.readPinDrive('GP25') === 'hiz');
ok(
  'readNeopixel dépaquette 0xRRGGBB',
  JSON.stringify(engine.readNeopixel('7')) === JSON.stringify([{ r: 0xff, g: 0x88, b: 0x00 }])
);
ok('readLcdParallel lit l’instantané', engine.readLcdParallel('lcd1')[0] === 'Bonjour');
ok('simulatedMs vient de l’instantané', engine.simulatedMs() === 1234);
ok('readDigital d’une broche hors carte ne jette pas', engine.readDigital('A99') === false);

// Sous charge, les messages peuvent arriver dans le désordre : un instantané plus
// vieux que celui en main ferait RECULER l'affichage.
const stale = emptySnapshot(20);
stale.seq = 0;
deliver(engineWorker, { t: 'snapshot', snap: stale });
ok('un instantané en retard est ignoré (l’affichage ne recule pas)', engine.readDigital('13') === true);

// L'UI grise ses boutons en lisant `paused` DANS LA FOULÉE de pause().
engine.pause();
ok('paused est vrai tout de suite après pause()', engine.paused === true);
engine.resume();
ok('paused est faux tout de suite après resume()', engine.paused === false);

// Les `Set` de touches ne se sérialisent pas : ils partaient jusqu'ici par
// référence, le proxy doit les envoyer à plat.
posted.length = 0;
const pressed = new Set();
engine.setKeypads([{ rows: ['2', '3'], cols: ['4', '5'], pressed }]);
const sent = posted.find((m) => m.t === 'setKeypads');
ok('setKeypads : les Set ne sont pas postés (ils ne se sérialisent pas)', sent && !('pressed' in sent.keypads[0]));
posted.length = 0;
pressed.add('0,1');
engine.syncKeypads();
const keys = posted.find((m) => m.t === 'keypadPressed');
ok('une touche enfoncée part à plat au worker', keys?.pressed?.[0] === '0:0,1');
posted.length = 0;
engine.syncKeypads();
ok('sans changement, aucun message de touches n’est renvoyé', posted.every((m) => m.t !== 'keypadPressed'));

// L'échantillonneur analogique est une FONCTION de la page : elle ne traverse pas.
posted.length = 0;
engine.setAnalogSampler('A0', () => 0.5);
engine.syncKeypads(); // déclenche le relevé
const analog = posted.find((m) => m.t === 'setAnalog' && m.pin === 'A0');
ok('l’échantillonneur analogique est relevé côté page et poussé en setAnalog', Math.abs(analog?.fraction - 0.5) < 1e-6);
posted.length = 0;
engine.setAnalogSampler('A0', null);
engine.syncKeypads();
ok('retirer l’échantillonneur arrête les envois', !posted.some((m) => m.t === 'setAnalog'));

// Le flux série et l'arrêt sur point d'arrêt remontent à la page.
let serial = '';
engine.onSerial = (c) => (serial += c);
deliver(engineWorker, { t: 'serial', chunk: 'Bonjour' });
ok('le flux série remonte à la page', serial === 'Bonjour');
let paused = null;
engine.onDebugPause = (s) => (paused = s);
deliver(engineWorker, { t: 'debugPause', state: { line: 42 } });
ok('l’arrêt sur point d’arrêt remonte à la page', paused?.line === 42 && engine.paused === true);

engine.dispose();
ok('dispose() arrête le worker', posted.some((m) => m.t === 'dispose'));

// --- Rapport ------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} contrôles OK`);
process.exit(failed > 0 ? 1 : 0);
