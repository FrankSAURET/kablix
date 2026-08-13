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
  /workerReady\(\)[\s\S]{0,300}\?\?\s*\n?\s*new AvrEngine/.test(sim)
);
// Les périphériques de bus sont des OBJETS à méthodes, lus en direct par la page :
// sans ce refus, un schéma à afficheur I²C simulerait dans le vide, l'écran muet.
ok(
  'sim.mts : le worker est refusé si le schéma a un périphérique I²C ou SPI',
  /usesBusPeripherals\(\)/.test(sim) &&
    /workerReady\(\) && !usesBusPeripherals\(\)/.test(sim)
);
ok(
  'sim.mts : le test couvre LCD I²C, OLED, PCA9685, araignée et le bus SPI',
  /'i2c-lcd' \|\| kind === 'i2c-oled'/.test(sim) &&
    /kind === 'i2c-pwm' \|\| kind === 'araignee'/.test(sim) &&
    /spiDeviceBindings\(editor\.diagram\)\.length > 0/.test(sim)
);
// Le mode parallèle (pins=full) et le câblage SPI sortent l'afficheur du bus I²C :
// le refuser dans ces cas priverait le worker de schémas qu'il sait très bien faire.
ok(
  'sim.mts : un afficheur hors bus I²C (pins=full / spi) ne bloque pas le worker',
  /\(part\.attrs\?\.pins \?\? 'i2c'\) === 'i2c'/.test(sim)
);
ok(
  'sim.mts : les formes d’onde sont publiées après stepCapacitors',
  /refreshVisuals\(\);\s*\n\s*flushAnalogWaves\(\)/.test(sim)
);
ok(
  'sim.mts : pas de double calcul — un moteur à ondes ne reçoit pas la fonction',
  /if \(!engine\.setAnalogWaves\) engine\.setAnalogSampler\?\.\(pin, sampler\)/.test(sim)
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
export * from '../../src/webview/engines/analog-waves.mjs';
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
const { WorkerEngine, preloadWorker, workerReady, emptySnapshot, evalAnalogWave, pulseWaveform } = mod;

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

// Les formes d'onde, elles, sont DÉCRITES : elles traversent.
posted.length = 0;
engine.setAnalogWaves([{ kind: 'rc', pin: 'A0', v0: 0, target: 5, tau: 0.1, t0: 0, vcc: 5 }]);
const wave = posted.find((m) => m.t === 'setAnalogWaves');
ok('setAnalogWaves : la description part au worker', wave?.waves?.[0]?.kind === 'rc' && wave.waves[0].tau === 0.1);

engine.dispose();
ok('dispose() arrête le worker', posted.some((m) => m.t === 'dispose'));

// --- 3. Les formes d'onde, la SEULE physique partagée par les deux fils --------
// Le worker les rejoue à l'instant de la conversion, la page les pose par frame :
// une divergence entre les deux ferait une courbe différente selon un réglage.
const rc = { kind: 'rc', pin: 'A0', v0: 0, target: 5, tau: 0.1, t0: 1000, vcc: 5 };
ok('RC : à t0 la tension vaut v0', Math.abs(evalAnalogWave(rc, 1000, 0) - 0) < 1e-9);
ok(
  'RC : à une constante de temps, 63,2 % de la marche',
  Math.abs(evalAnalogWave(rc, 1100, 0) - (1 - Math.exp(-1))) < 1e-9,
  `${(evalAnalogWave(rc, 1100, 0) * 100).toFixed(1)} %`
);
ok('RC : à 5·RC, la charge est pleine (>99 %)', evalAnalogWave(rc, 1500, 0) > 0.99);
ok(
  'RC : une décharge descend (v0 au-dessus de la cible)',
  evalAnalogWave({ ...rc, v0: 5, target: 0 }, 1100, 0) < 0.4
);
ok('RC sans résistance (tau=0) : le nœud suit sa source', evalAnalogWave({ ...rc, tau: 0 }, 1000, 0) === 1);
ok(
  'RC d’un nœud flottant (tau infini) : la charge est figée',
  evalAnalogWave({ ...rc, tau: Infinity, v0: 2.5 }, 9e9, 0) === 0.5
);
// Le RC suit le temps SIMULÉ : au ralenti, le condensateur se charge à l'heure du
// programme, pas à celle de l'écran. Le pouls, lui, est un phénomène du monde.
ok('RC : le temps réel n’a aucun effet', evalAnalogWave(rc, 1100, 123456) === evalAnalogWave(rc, 1100, 0));

const beat = { kind: 'pulse', pin: 'A1', bpm: 60 };
ok('pouls : sans battement (0 bpm), ligne de base basse', evalAnalogWave({ ...beat, bpm: 0 }, 0, 500) < 0.1);
ok(
  'pouls à 60 bpm : la courbe se répète toutes les secondes',
  Math.abs(evalAnalogWave(beat, 0, 160) - evalAnalogWave(beat, 0, 1160)) < 1e-9
);
ok(
  'pouls : le pic systolique tombe à 16 % du battement',
  evalAnalogWave(beat, 0, 160) > evalAnalogWave(beat, 0, 700) &&
    Math.abs(evalAnalogWave(beat, 0, 160) - pulseWaveform(0.16)) < 1e-9
);
ok(
  'pouls : ligne de base haute (0,6) — les seuils relatifs des tutos KY-039 en dépendent',
  Math.abs(pulseWaveform(0.9) - 0.6) < 0.01
);
ok('pouls : le temps simulé n’a aucun effet', evalAnalogWave(beat, 9e9, 160) === evalAnalogWave(beat, 0, 160));
ok('pouls : bpm écrêté à 200, aucune valeur hors 0..1', [0, 1, 60, 500, -5].every((bpm) => {
  const v = evalAnalogWave({ ...beat, bpm }, 0, 137);
  return v >= 0 && v <= 1;
}));

// --- 4. Le worker lui-même, avec un moteur bouchon ----------------------------
// `avr.mts` est remplacé par un moteur d'essai : ce qui est vérifié ici, c'est le
// TRI DES MESSAGES du worker, pas l'émulation AVR (que verify:sim couvre déjà).
writeFileSync(
  join(CACHE, 'faux-avr.mjs'),
  `export class AvrEngine {
  constructor(program, debugInfo, family) {
    globalThis.__avr = this;
    this.program = program; this.family = family;
    this.samplers = new Map(); this.paused = false; this.syncs = 0;
    this.onUpdate = null; this.onSerial = null; this.onDebugPause = null;
  }
  start() { this.started = true; } stop() {} pause() { this.paused = true; }
  resume() { this.paused = false; } setSpeed() {} setInput() {} setAnalog() {}
  writeSerial() {} dispose() { this.disposed = true; }
  readDigital() { return false; } readPinDrive() { return 'hiz'; }
  readPulseUs() { return 0; } readPwmDuty() { return 0; } pulseActive() { return false; }
  simulatedMs() { return this.now ?? 0; } busyMs() { return 0; } lagMs() { return 0; }
  setAnalogSampler(pin, s) { if (s) this.samplers.set(pin, s); else this.samplers.delete(pin); }
  setKeypads(k) { this.keypads = k; } syncKeypads() { this.syncs++; }
}
`
);
const workerBundle = await esbuild({
  entryPoints: [join(ROOT, 'src', 'webview', 'engines', 'sim-worker.mts')],
  bundle: true,
  format: 'esm',
  write: false,
  absWorkingDir: ROOT,
  // `alias` n'accepte pas de chemin relatif : le détournement se fait à la
  // résolution.
  plugins: [
    {
      name: 'faux-avr',
      setup(b) {
        b.onResolve({ filter: /^\.\/avr\.mjs$/ }, () => ({ path: join(CACHE, 'faux-avr.mjs') }));
      },
    },
  ],
});
writeFileSync(join(CACHE, 'w.mjs'), workerBundle.outputFiles[0].text);
const workerUrl = pathToFileURL(join(CACHE, 'w.mjs')).href;

const fromWorker = [];
globalThis.self = { onmessage: null, postMessage: (m) => fromWorker.push(m) };
await import(workerUrl);
const toWorker = (msg) => globalThis.self.onmessage({ data: msg });

toWorker({ t: 'init', board: 'uno', program: new Uint16Array(4), debugInfo: null, pins: ['13', 'A0'] });
const avr = globalThis.__avr;
ok('worker : init monte le moteur et annonce « prêt »', avr && fromWorker.some((m) => m.t === 'ready'));
ok('worker : la famille suit la carte (uno → avr328)', avr.family === 'avr328');
// Un message par front GPIO coûterait des dizaines de milliers d'envois/s : le
// worker garde `onUpdate` pour lui et publie un instantané à cadence fixe.
ok('worker : aucun message par front GPIO (onUpdate reste local)', avr.onUpdate === null);

toWorker({ t: 'setAnalogWaves', waves: [{ kind: 'rc', pin: 'A0', v0: 0, target: 5, tau: 0.1, t0: 0, vcc: 5 }] });
ok('worker : la forme d’onde pose un échantillonneur sur la broche', avr.samplers.has('A0'));
avr.now = 100; // 100 ms simulées = une constante de temps
ok(
  'worker : l’échantillonneur rend la valeur au temps SIMULÉ du moteur',
  Math.abs(avr.samplers.get('A0')() - (1 - Math.exp(-1))) < 1e-9
);
// La table est relue par nom : une onde qui change ne doit pas reposer un
// échantillonneur (le moteur en garderait un périmé).
const before = avr.samplers.get('A0');
toWorker({ t: 'setAnalogWaves', waves: [{ kind: 'rc', pin: 'A0', v0: 5, target: 0, tau: 0.1, t0: 100, vcc: 5 }] });
ok('worker : mettre à jour une onde ne repose pas l’échantillonneur', avr.samplers.get('A0') === before);
ok('worker : la nouvelle onde fait foi tout de suite', Math.abs(avr.samplers.get('A0')() - 1) < 1e-9);
toWorker({ t: 'setAnalogWaves', waves: [] });
ok('worker : une broche absente de la liste redevient une entrée simple', !avr.samplers.has('A0'));

// Les `Set` de touches sont détenus PAR RÉFÉRENCE par le moteur : les remplacer
// le laisserait lire un ensemble mort, d'où le vidage sur place.
toWorker({ t: 'setKeypads', keypads: [{ rows: ['2', '3'], cols: ['4', '5'] }] });
const set0 = avr.keypads[0].pressed;
toWorker({ t: 'keypadPressed', pressed: ['0:1,2'] });
ok('worker : la touche arrive dans l’ensemble que le moteur détient', set0.has('1,2') && avr.keypads[0].pressed === set0);
ok('worker : le moteur est prévenu du changement de touches', avr.syncs > 0);
toWorker({ t: 'keypadPressed', pressed: [] });
ok('worker : relâcher vide l’ensemble SANS le remplacer', set0.size === 0 && avr.keypads[0].pressed === set0);

toWorker({ t: 'pause' });
const snapMsg = [...fromWorker].reverse().find((m) => m.t === 'snapshot');
ok('worker : la pause publie l’état des broches dans la foulée', snapMsg?.snap?.paused === true);
ok('worker : l’instantané couvre les broches annoncées', snapMsg?.snap?.digital?.length === 2);

// Une exception du moteur ne doit pas laisser la page attendre un instantané qui
// ne viendra plus : elle est annoncée.
avr.setSpeed = () => {
  throw new Error('boum');
};
toWorker({ t: 'setSpeed', fraction: 1 });
ok('worker : une exception du moteur est annoncée à la page', fromWorker.some((m) => m.t === 'error' && m.message === 'boum'));

toWorker({ t: 'dispose' });
ok('worker : dispose libère le moteur', avr.disposed === true);

// --- Rapport ------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} contrôles OK`);
process.exit(failed > 0 ? 1 : 0);
