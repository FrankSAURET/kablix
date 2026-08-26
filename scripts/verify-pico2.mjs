// Banc de bout en bout du moteur Pico, sur les DEUX familles de puce :
//   node scripts/verify-pico2.mjs [--target=rp2350|rp2040]
// Charge un vrai firmware MicroPython dans PicoEngine, injecte un script par le
// raw REPL et vérifie à la fois ce que dit le programme (sortie série) et ce que
// voit Kablix côté JS (fronts GPIO, PIO du NeoPixel) — c'est ce second point qui
// casse en premier quand une couche de la puce est mal branchée.
//
// Miroir du banc d'évaluation `scripts/rp2350js-eval/kablix-eval.ts`, mais passé
// par le moteur Kablix complet au lieu de la bibliothèque nue.
//
// Firmwares attendus dans test-assets/ (dossier ignoré par git, test sauté sinon) :
//   RPI_PICO2-*.uf2  (Pico 2, RP2350 Cortex-M33)
//   RPI_PICO-*.uf2   (Pico, RP2040)
// Ils se téléchargent sur https://micropython.org/download/RPI_PICO2/ et /RPI_PICO/.
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cible = (process.argv.find((a) => a.startsWith('--target=')) ?? '--target=rp2350').slice(9);
if (cible !== 'rp2040' && cible !== 'rp2350') {
  console.error('cible inconnue : ' + cible + ' (rp2040 ou rp2350)');
  process.exit(2);
}

// Le Pico 2 tourne à 150 MHz, le Pico à 125 : la fréquence annoncée par le
// firmware est le premier signe qu'on parle bien à la puce qu'on croit.
const ATTENDU = {
  rp2350: { motif: /^RPI_PICO2-(?!RISCV).*\.uf2$/, carte: 'Pico2', freq: 150000000 },
  rp2040: { motif: /^RPI_PICO-.*\.uf2$/, carte: 'Pico', freq: 125000000 },
}[cible];

const dossier = join(root, 'test-assets');
const fichier = existsSync(dossier) ? readdirSync(dossier).find((f) => ATTENDU.motif.test(f)) : null;
if (!fichier) {
  console.log(`SKIP : firmware MicroPython absent (test-assets/${ATTENDU.motif.source}).`);
  process.exit(0);
}

// Délai de garde : ce banc exécute un firmware ENTIER (~90 s seul). Il tourne
// dans le pool parallèle de `verify:all` où la machine est saturée — d'où une
// marge large. Ce n'est pas une mesure de temps mur : les durées contrôlées
// sont celles que le programme simulé croit vivre.
const GARDE = 420;

const tmp = mkdtempSync(join(tmpdir(), 'kablix-pico2-'));
async function load(entry, name) {
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
}

const { parseUf2 } = await load('src/shared/uf2.ts', 'uf2.mjs');
const { PicoEngine } = await load('src/webview/engines/pico.mts', 'pico.mjs');

const segments = parseUf2(new Uint8Array(readFileSync(join(dossier, fichier)))).map((s) => ({
  addr: s.addr,
  data: s.data,
}));

// Un seul script : le REPL n'en injecte qu'un, chaque bloc imprime son marqueur.
// Les durées sont courtes — c'est le simulateur qui les paie, pas la vraie puce.
const script = [
  'import sys, time, machine, neopixel',
  'from machine import Pin, PWM, ADC, Timer',
  "print('ID', sys.implementation._machine, machine.freq())",
  // GPIO : la LED du Pico est sur GP25 dans les deux cas (le Pico 2 aussi).
  'led = Pin(25, Pin.OUT)',
  'for i in range(6):',
  '    led.toggle()',
  '    time.sleep_ms(20)',
  // Sommeil : le saut d'alarme doit rendre une durée simulée juste, pas 0.
  't0 = time.ticks_ms()',
  'time.sleep_ms(300)',
  "print('SLEEP', time.ticks_diff(time.ticks_ms(), t0))",
  // Attentes COURTES : c'est là que le saut d'attente active peut mentir. Le
  // firmware ne dort pas pour vingt microsecondes, il compte les yeux ouverts ;
  // un saut trop généreux les changeait en une milliseconde pleine (×50), et
  // tout ce qui parle par impulsions — DHT, télémètre à ultrasons, DMX — en
  // sortait faux. On mesure la moyenne ET le pire cas.
  // Ni liste ni lambda : le tas du firmware est petit, et la première version
  // gardait assez d'objets pour faire échouer le `Timer()` d'après (ENOMEM).
  'def mesure(n, us):',
  '    somme = 0',
  '    pire = 0',
  '    for _ in range(n):',
  '        t = time.ticks_us()',
  '        time.sleep_us(us)',
  '        d = time.ticks_diff(time.ticks_us(), t)',
  '        somme += d',
  '        if d > pire:',
  '            pire = d',
  '    return somme // n, pire',
  "print('US20', *mesure(50, 20))",
  "print('US500', *mesure(20, 500))",
  "print('MS1', *mesure(10, 1000))",
  // Relecture d'une sortie par le pad (correction Kablix).
  'led.value(1)',
  "print('READBACK', led.value())",
  // PWM : fronts produits par le matériel, pas par le programme.
  'p = PWM(Pin(16))',
  'p.freq(1000)',
  'p.duty_u16(32768)',
  'time.sleep_ms(60)',
  'p.deinit()',
  "print('PWM_OK')",
  "print('ADC', ADC(26).read_u16())",
  // Timer périodique : alarmes + interruptions.
  'c = 0',
  'def cb(t):',
  '    global c',
  '    c += 1',
  'tm = Timer()',
  'tm.init(period=20, mode=Timer.PERIODIC, callback=cb)',
  'time.sleep_ms(250)',
  'tm.deinit()',
  "print('TICKS', c)",
  // NeoPixel : le PIO doit avancer, y compris pendant les sommeils.
  'np = neopixel.NeoPixel(Pin(2), 1)',
  'np[0] = (10, 20, 30)',
  'np.write()',
  "print('NEO_OK')",
  // I²C : un scan sans esclave doit RENDRE LA MAIN (il figeait sans nos NAK).
  'i2c = machine.I2C(0, sda=Pin(4), scl=Pin(5))',
  "print('I2C', i2c.scan())",
  "print('KABLIX_PICO_OK')",
  '',
].join('\n');

const engine = new PicoEngine({ kind: 'flash', segments, script }, cible);
// Mi-échelle sur le canal 0 (GP26) : sans tension posée, l'ADC rend 0 et le
// contrôle ne prouverait rien (0 est aussi ce que rend un ADC débranché).
engine.setAnalog('GP26', 0.5);

let serial = '';
engine.onSerial = (chunk) => {
  serial += chunk;
  process.stdout.write(chunk);
};

// Fronts vus côté JS : c'est le chemin qu'empruntent les composants de l'éditeur.
const fronts = { GP25: 0, GP16: 0, GP2: 0 };
const dernier = { GP25: null, GP16: null, GP2: null };
engine.onUpdate = () => {
  for (const pin of Object.keys(fronts)) {
    const v = engine.readDigital(pin);
    if (dernier[pin] !== null && v !== dernier[pin]) fronts[pin]++;
    dernier[pin] = v;
  }
};

console.log(`Firmware ${fichier} sur ${cible} (max ${GARDE} s)…`);
const debut = Date.now();
engine.start();

const fin = (bon, note) => {
  engine.dispose();
  if (note) console.log(note);
  console.log(bon ? '\nRESULTAT: OK' : '\nRESULTAT: ECHEC');
  process.exit(bon ? 0 : 1);
};

const timer = setInterval(() => {
  const ecoule = (Date.now() - debut) / 1000;
  if (serial.includes('KABLIX_PICO_OK')) {
    clearInterval(timer);
    const lire = (re) => (serial.match(re) ?? [])[1];
    const sleepMs = Number(lire(/SLEEP (\d+)/));
    const ticks = Number(lire(/TICKS (\d+)/));
    const adc = Number(lire(/ADC (\d+)/));
    const court = (nom) => {
      const m = serial.match(new RegExp(`${nom} (\\d+) (\\d+)`));
      return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
    };
    const [us20, us20Max] = court('US20');
    const [us500, us500Max] = court('US500');
    const [ms1, ms1Max] = court('MS1');
    const controles = [
      [`carte ${ATTENDU.carte} annoncée`, new RegExp(`ID .*${ATTENDU.carte}`).test(serial)],
      [`fréquence ${ATTENDU.freq}`, serial.includes(`${ATTENDU.freq}`)],
      [`sleep_ms(300) mesuré à ${sleepMs} ms`, sleepMs >= 295 && sleepMs <= 340],
      [`sleep_us(20) mesuré à ${us20} µs (pire ${us20Max})`, us20 >= 18 && us20 <= 80 && us20Max <= 400],
      [`sleep_us(500) mesuré à ${us500} µs (pire ${us500Max})`, us500 >= 480 && us500 <= 700 && us500Max <= 1200],
      [`sleep_ms(1) mesuré à ${ms1} µs (pire ${ms1Max})`, ms1 >= 950 && ms1 <= 1400 && ms1Max <= 2500],
      ['relecture d’une sortie (pad)', /READBACK 1/.test(serial)],
      [`LED GP25 vue côté JS (${fronts.GP25} fronts)`, fronts.GP25 >= 4],
      [`PWM GP16 vu côté JS (${fronts.GP16} fronts)`, fronts.GP16 >= 10],
      [`Timer périodique (${ticks} rappels)`, ticks >= 8 && ticks <= 14],
      [`ADC à mi-échelle (${adc})`, adc > 30000 && adc < 35000],
      [`NeoPixel : PIO sorti sur GP2 (${fronts.GP2} fronts)`, fronts.GP2 >= 10],
      ['scan I²C rendu (pas de gel)', /I2C \[/.test(serial)],
    ];
    for (const [nom, bon] of controles) console.log(`  ${bon ? '✓' : '✗'} ${nom}`);
    fin(
      controles.every(([, c]) => c),
      `\n  script exécuté en ${ecoule.toFixed(1)} s`
    );
  }
  if (ecoule > GARDE) {
    clearInterval(timer);
    console.error(`\n  ✗ délai dépassé. Fin de la sortie série : ${JSON.stringify(serial.slice(-400))}`);
    fin(false);
  }
}, 500);
