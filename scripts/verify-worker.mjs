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
  'sim.mts : repli sur le moteur du fil principal si le worker n’est pas disponible',
  /workerReady\(\)[\s\S]{0,400}\?\?\s*\n?\s*\(rp2040[\s\S]{0,200}new AvrEngine/.test(sim)
);
// Les périphériques de bus sont des OBJETS à méthodes, appelés au milieu d'une
// trame : ils ne traversent pas. Ils sont donc DÉCRITS, le worker fabrique les
// siens, et la page garde des jumeaux que l'affichage relit.
ok(
  'sim.mts : les périphériques de bus sont décrits, pas refusés',
  /const specs = busDeviceSpecs\(\)/.test(sim) &&
    /createBusDevices\(specs\)/.test(sim) &&
    !/usesBusPeripherals/.test(sim)
);
ok(
  'sim.mts : la description part au worker, les objets restent à la page',
  /engine\.setBusDevices\(specs, built\)/.test(sim) &&
    /engine\?\.setI2cDevices\?\.\(built\.i2c\)/.test(sim)
);
ok(
  'sim.mts : la description couvre LCD I²C, OLED, PCA9685, araignée et le bus SPI',
  /kind === 'i2c-lcd' &&/.test(sim) &&
    /kind === 'i2c-pwm' \|\| kind === 'araignee'/.test(sim) &&
    /kind === 'i2c-oled' &&/.test(sim) &&
    /for \(const b of spiDeviceBindings\(editor\.diagram\)\)/.test(sim)
);
// Le mode parallèle (pins=full) sort l'afficheur du bus I²C : lui poser un
// périphérique I²C le ferait répondre à une adresse que rien ne lui câble.
ok(
  'sim.mts : un afficheur hors bus I²C (pins=full / spi) n’est pas décrit en I²C',
  /\(part\.attrs\?\.pins \?\? 'i2c'\) === 'i2c'/.test(sim)
);
// Une broche non câblée vaut `null` côté liaison et « absente » côté description :
// un `csPin: null` ferait croire à un CS câblé (`selectSpiDevice` teste `!d.csPin`).
ok(
  'sim.mts : une broche SPI non câblée est absente de la description (pas null)',
  /dcPin: b\.dcPin \?\? undefined/.test(sim) && /csPin: b\.csPin \?\? undefined/.test(sim)
);
ok(
  'sim.mts : les formes d’onde sont publiées après stepCapacitors',
  /refreshVisuals\(\);\s*\n\s*flushAnalogWaves\(\)/.test(sim)
);
ok(
  'sim.mts : pas de double calcul — un moteur à ondes ne reçoit pas la fonction',
  /if \(!engine\.setAnalogWaves\) engine\.setAnalogSampler\?\.\(pin, sampler\)/.test(sim)
);
// Le RP2040 passe par le worker depuis le lot 4 : `pico.mts` ne lit ni `document`
// ni `window`. Le repli reste un `new PicoEngine` sur le fil principal.
ok(
  'sim.mts : le Pico passe par le worker, avec son programme et son repli',
  /rp2040 \? 'pico' :/.test(sim) &&
    /rp2040 \? picoProgram : unoProgram/.test(sim) &&
    /rp2040\s*\n?\s*\? new PicoEngine\(picoProgram\)/.test(sim)
);
ok(
  'sim.mts : le bundle est préchargé (startRun est synchrone, il ne peut pas attendre)',
  /void preloadWorker\(url\)/.test(sim)
);

// --- 2. Comportement du proxy, exécuté pour de vrai ---------------------------
const entry = `export * from '../../src/webview/engines/worker-engine.mjs';
export * from '../../src/webview/engines/analog-waves.mjs';
export { createBusDevices } from '../../src/webview/engines/i2c-devices.mjs';
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
const {
  WorkerEngine,
  preloadWorker,
  workerReady,
  emptySnapshot,
  evalAnalogWave,
  pulseWaveform,
  createBusDevices,
} = mod;

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

// Les périphériques de bus sont eux aussi DÉCRITS : l'objet ne traverse pas, mais
// la page en garde un jumeau que l'affichage relit à chaque frame.
const busSpecs = [
  { bus: 'i2c', id: 'lcd1', kind: 'lcd', address: 0x27, cols: 16, rows: 2 },
  { bus: 'i2c', id: 'pca1', kind: 'pca', address: 0x40 },
  { bus: 'i2c', id: 'oled1', kind: 'oled', address: 0x3c },
  { bus: 'spi', id: 'tft1', kind: 'tft', dcPin: '9', csPin: '10' },
  { bus: 'spi', id: 'sd1', kind: 'sd', csPin: '4' },
];
const pageBus = createBusDevices(busSpecs);
ok(
  'fabrique partagée : chaque description donne son périphérique',
  pageBus.i2c.length === 3 && pageBus.spi.length === 2 && pageBus.lcd.get('lcd1')?.cols === 16
);
ok(
  'fabrique : la carte SD n’a pas d’écran à publier (aucune carte de rendu)',
  pageBus.tft.size === 1 && pageBus.oled.size === 1 && pageBus.i2cById.size === 3
);
ok(
  'fabrique : les broches D/C et CS suivent la description',
  pageBus.tft.get('tft1')?.dcPin === '9' && pageBus.tft.get('tft1')?.csPin === '10'
);
posted.length = 0;
engine.setBusDevices(busSpecs, pageBus);
const busMsg = posted.find((m) => m.t === 'setBusDevices');
ok(
  'setBusDevices : la description part au worker (et rien d’autre)',
  busMsg?.specs?.length === 5 && typeof busMsg.specs[0].kind === 'string'
);
ok(
  'setBusDevices : aucun objet à méthodes dans le message',
  busMsg.specs.every((s) => Object.values(s).every((v) => typeof v !== 'function'))
);

engine.dispose();
ok('dispose() arrête le worker', posted.some((m) => m.t === 'dispose'));

// --- 2 ter. Le proxy côté Pico (lot 4) ---------------------------------------
posted.length = 0;
const picoFlash = {
  kind: 'flash',
  segments: [{ addr: 0x10000000, data: new Uint8Array([1, 2, 3, 4]) }],
  script: 'print(1)',
};
const pico = WorkerEngine.create('pico', picoFlash, null);
const picoWorker = workers.at(-1);
const picoInit = posted.find((m) => m.t === 'init');
ok(
  'Pico : les 30 GPIO du RP2040 sont publiées',
  picoInit?.pins?.length === 30 && picoInit.pins[25] === 'GP25'
);
// Le firmware est TRANSFÉRÉ : sans copie préalable, l'original de la page serait
// détaché et le lancement suivant chargerait un flash vide.
ok(
  'Pico : le firmware est cloné avant l’envoi (l’original reste à la page)',
  picoFlash.segments[0].data.length === 4 &&
    picoInit.program.segments[0].data !== picoFlash.segments[0].data &&
    picoInit.program.segments[0].data[3] === 4
);
ok('Pico : le script MicroPython suit le firmware', picoInit.program.script === 'print(1)');
ok('Pico : un script MicroPython a le pas à pas', typeof pico.step === 'function');
const picoRam = WorkerEngine.create('pico', { kind: 'ram', image: new Uint8Array(8) }, null);
ok('Pico : une image bare-metal n’a PAS de pas à pas (bouton grisé)', picoRam.step === undefined);

const psnap = emptySnapshot(30);
psnap.seq = 1;
psnap.digital[25] = 1;
deliver(picoWorker, { t: 'snapshot', snap: psnap });
// Le schéma dit « GP25 », le moteur « 25 » : les deux écritures se croisent dans
// le code (cf. `gpioIndex` de pico.mts), une seule table de broches les couvre.
ok(
  'Pico : GP25 et 25 désignent la même broche',
  pico.readDigital('GP25') === true && pico.readDigital('25') === true
);

let running = 0;
const restarts = [];
let netReq = null;
pico.onRunning = () => running++;
pico.onDebugRestart = (p) => restarts.push(p);
pico.onNetRequest = (r) => (netReq = r);
deliver(picoWorker, { t: 'scriptStarted' });
deliver(picoWorker, { t: 'debugRestart', phase: 'start' });
deliver(picoWorker, { t: 'debugRestart', phase: 'end' });
deliver(picoWorker, { t: 'netRequest', req: { url: 'http://exemple' } });
ok('Pico : « le script démarre » remonte à la page (bandeau « En marche »)', running === 1);
ok('Pico : les deux phases du redémarrage en débogage remontent', restarts.join(',') === 'start,end');
ok('Pico : la requête réseau remonte à la page (elle seule peut sortir)', netReq?.url === 'http://exemple');
posted.length = 0;
pico.sendNetResponse({ status: 200 });
ok(
  'Pico : la réponse de l’hôte repart au worker',
  posted.find((m) => m.t === 'netResponse')?.response?.status === 200
);
pico.dispose();
picoRam.dispose();

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
  setI2cDevices(d) { this.i2c = d; } setSpiDevices(d) { this.spi = d; }
}
`
);
// Même bouchon côté Pico : `pico.mts` embarque rp2040js et un firmware complet,
// ce que `verify:micropython` couvre déjà. Ici on vérifie le TRI DES MESSAGES.
writeFileSync(
  join(CACHE, 'faux-pico.mjs'),
  `export class PicoEngine {
  constructor(program) {
    globalThis.__pico = this;
    this.program = program; this.paused = false;
    this.onUpdate = null; this.onSerial = null; this.onDebugPause = null;
    this.onRunning = null; this.onDebugRestart = null; this.onNetRequest = null;
  }
  start() { this.started = true; } stop() {} pause() { this.paused = true; }
  resume() { this.paused = false; } setSpeed() {} setInput() {} setAnalog() {}
  writeSerial() {} dispose() { this.disposed = true; }
  readDigital() { return false; } readPinDrive() { return 'hiz'; }
  readPulseUs() { return 0; } readPwmDuty() { return 0; } pulseActive() { return false; }
  simulatedMs() { return 0; } busyMs() { return 0; } lagMs() { return 0; }
  sendNetResponse(r) { this.net = r; }
  setI2cDevices(d) { this.i2c = d; } setSpiDevices(d) { this.spi = d; }
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
      name: 'faux-moteurs',
      setup(b) {
        b.onResolve({ filter: /^\.\/avr\.mjs$/ }, () => ({ path: join(CACHE, 'faux-avr.mjs') }));
        b.onResolve({ filter: /^\.\/pico\.mjs$/ }, () => ({ path: join(CACHE, 'faux-pico.mjs') }));
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

// --- 4 bis. Les périphériques de bus, décodés dans le worker ------------------
// C'est le morceau du lot 3 : ces objets sont appelés au milieu d'une trame I²C
// ou SPI, à la cadence du bus. Ils vivent donc DANS le worker, et seul leur état
// visible (texte, rapports cycliques, image) remonte à la page.

/** Un octet HD44780 via le backpack PCF8574 : deux quartets, verrouillés sur E. */
const lcdWrite = (dev, rs, value) => {
  for (const nib of [(value >> 4) & 0x0f, value & 0x0f]) {
    const base = (nib << 4) | (rs ? 1 : 0) | 0x08; // 0x08 = rétroéclairage
    dev.write(base | 0x04); // E haut : le quartet est présenté
    dev.write(base); // front descendant : il est figé
  }
};
/** Écrit ON=0 / OFF=`off` sur un canal du PCA9685 (duty = off/4096). */
const pcaWrite = (dev, ch, off) => {
  dev.onStart();
  dev.setGeneralCall(false);
  dev.write(0x06 + 4 * ch); // pointeur LEDn_ON_L, auto-incrémenté
  dev.write(0);
  dev.write(0);
  dev.write(off & 0xff);
  dev.write((off >> 8) & 0xff);
};
/** Un pixel RGB565 en (x, y) sur l'ILI9341 : CASET, RASET puis RAMWR. */
const tftPixel = (dev, x, y, rgb565) => {
  dev.transfer(0x2a, false);
  for (const b of [x >> 8, x & 0xff, x >> 8, x & 0xff]) dev.transfer(b, true);
  dev.transfer(0x2b, false);
  for (const b of [y >> 8, y & 0xff, y >> 8, y & 0xff]) dev.transfer(b, true);
  dev.transfer(0x2c, false);
  dev.transfer(rgb565 >> 8, true);
  dev.transfer(rgb565 & 0xff, true);
};

toWorker({ t: 'setBusDevices', specs: busSpecs });
ok(
  'worker : les périphériques décrits sont fabriqués et branchés au moteur',
  avr.i2c?.length === 3 && avr.spi?.length === 2
);
ok(
  'worker : la carte SD est branchée au bus (elle répond, sans écran à publier)',
  typeof avr.spi?.[1]?.transfer === 'function'
);

fromWorker.length = 0;
toWorker({ t: 'start' });
lcdWrite(avr.i2c[0], true, 0x48); // 'H'
lcdWrite(avr.i2c[0], true, 0x69); // 'i'
pcaWrite(avr.i2c[1], 0, 2048); // canal 0 à 50 %
avr.i2c[2].onStart();
avr.i2c[2].write(0x40); // octet de contrôle : données GDDRAM
avr.i2c[2].write(0xff);
tftPixel(avr.spi[0], 5, 3, 0xf800); // un pixel rouge
toWorker({ t: 'stop' }); // l'arrêt publie l'état final des écrans

const screens = [...fromWorker].reverse().find((m) => m.t === 'screens')?.screens;
ok('worker : l’état des écrans est publié', Boolean(screens));
ok(
  'worker : le texte décodé du LCD remonte',
  screens?.lcd?.lcd1?.[0]?.startsWith('Hi'),
  JSON.stringify(screens?.lcd?.lcd1?.[0])
);
ok(
  'worker : les 16 rapports cycliques du PCA9685 remontent',
  screens?.pca?.pca1?.length === 16 && Math.abs(screens.pca.pca1[0] - 0.5) < 1e-6
);
ok(
  'worker : le tampon de l’OLED remonte en entier (128×64 → 1 024 octets)',
  screens?.oled?.oled1?.length === 1024 && screens.oled.oled1[0] === 0xff
);
// Une image de TFT pèse 307 200 octets : la publier entière toutes les 16 ms
// saturerait la liaison alors qu'un sketch ne repeint le plus souvent qu'un cadran.
ok(
  'worker : le TFT ne publie que la zone repeinte',
  screens?.tft?.tft1?.x === 5 &&
    screens.tft.tft1.y === 3 &&
    screens.tft.tft1.w === 1 &&
    screens.tft.tft1.h === 1 &&
    screens.tft.tft1.data[0] === 255
);
ok('worker : la carte SD ne publie aucun écran', !('sd1' in (screens?.oled ?? {})));

fromWorker.length = 0;
toWorker({ t: 'start' });
toWorker({ t: 'stop' });
ok(
  'worker : un écran immobile ne coûte aucun message',
  !fromWorker.some((m) => m.t === 'screens')
);

// Bout en bout : le message publié par le worker est recopié dans les jumeaux que
// l'affichage de la page relit — même code de dessin qu'avec un moteur local.
const mirrorBus = createBusDevices(busSpecs);
const proxy = WorkerEngine.create('uno', new Uint16Array(2), null);
const proxyWorker = workers.at(-1);
proxy.setBusDevices(busSpecs, mirrorBus);
ok(
  'jumeau : sans publication, un PCA miroir ne fait bouger aucun servo',
  mirrorBus.pca.get('pca1').channelDuty(0) === 0
);
deliver(proxyWorker, { t: 'screens', screens });
ok(
  'jumeau : le LCD de la page affiche le texte décodé dans le worker',
  mirrorBus.lcd.get('lcd1').text[0].startsWith('Hi') &&
    mirrorBus.lcd.get('lcd1').text[0].length === 16
);
ok(
  'jumeau : le PCA de la page rend le rapport cyclique publié',
  Math.abs(mirrorBus.pca.get('pca1').channelDuty(0) - 0.5) < 1e-6
);
ok('jumeau : l’image de l’OLED est recopiée', mirrorBus.oled.get('oled1').buffer[0] === 0xff);
ok(
  'jumeau : la zone repeinte du TFT est replacée au bon endroit',
  mirrorBus.tft.get('tft1').data[(3 * 240 + 5) * 4] === 255 &&
    mirrorBus.tft.get('tft1').data[0] === 0
);
proxy.dispose();

// Une exception du moteur ne doit pas laisser la page attendre un instantané qui
// ne viendra plus : elle est annoncée.
avr.setSpeed = () => {
  throw new Error('boum');
};
toWorker({ t: 'setSpeed', fraction: 1 });
ok('worker : une exception du moteur est annoncée à la page', fromWorker.some((m) => m.t === 'error' && m.message === 'boum'));

toWorker({ t: 'dispose' });
ok('worker : dispose libère le moteur', avr.disposed === true);

// --- 4 ter. Le Pico dans le worker --------------------------------------------
// `picoMoteur.mts` ne touche ni `document` ni `window` : il tourne tel quel ici. Restent
// ses trois rappels propres au MicroPython, qui n'existent pas côté AVR et qui
// doivent devenir des messages — la page en fait le bandeau et le pont réseau.
fromWorker.length = 0;
toWorker({
  t: 'init',
  board: 'pico',
  program: { kind: 'flash', segments: [], script: 'print(1)' },
  pins: ['GP25'],
});
const picoMoteur = globalThis.__pico;
ok(
  'worker : une carte pico monte le moteur RP2040, pas l’AVR',
  Boolean(picoMoteur) && picoMoteur.program?.script === 'print(1)' && fromWorker.some((m) => m.t === 'ready')
);
ok('worker : aucun message par front GPIO côté Pico non plus', picoMoteur.onUpdate === null);

picoMoteur.onRunning();
ok(
  'worker : « le script démarre » devient un message',
  fromWorker.some((m) => m.t === 'scriptStarted')
);
picoMoteur.onDebugRestart('start');
picoMoteur.onDebugRestart('end');
ok(
  'worker : les deux phases du rejeu instrumenté remontent',
  fromWorker.filter((m) => m.t === 'debugRestart').map((m) => m.phase).join() === 'start,end'
);
// Le worker n'a ni `vscode.postMessage` ni le droit de sortir : la requête part à
// la page, qui la fait faire à l'hôte, et la réponse redescend au script.
picoMoteur.onNetRequest({ url: 'http://exemple' });
ok(
  'worker : une requête réseau du script est déléguée à la page',
  fromWorker.find((m) => m.t === 'netRequest')?.req?.url === 'http://exemple'
);
toWorker({ t: 'netResponse', response: { status: 204 } });
ok('worker : la réponse de l’hôte est réinjectée au script', picoMoteur.net?.status === 204);

toWorker({ t: 'dispose' });
ok('worker : dispose libère aussi le moteur Pico', picoMoteur.disposed === true);

// --- Rapport ------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} contrôles OK`);
process.exit(failed > 0 ? 1 : 0);
