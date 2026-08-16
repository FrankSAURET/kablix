// Une LED pilotée en PWM doit BRILLER À MI-PUISSANCE, pas clignoter.
//
// Régression relevée par Frank : `pinMode(3, OUTPUT); analogWrite(3, 128);` sur
// une LED branchée en D3 faisait CLIGNOTER la LED. Le rendu savait pourtant
// afficher un rapport cyclique (`case 'led'` de sim.mts) — mais il ne
// s'appliquait que si la broche était SURVEILLÉE par le moteur
// (`setPulseMonitors`), et la liste des broches surveillées contenait tout
// (servo, buzzer, ventilateur, moteur, LED RGB, 7 segments) SAUF la LED simple.
// Faute de mesure, le rendu retombait sur le niveau instantané : 0 ou 1 selon la
// phase du PWM au moment du rafraîchissement — un clignotement aléatoire.
//
// Le banc contrôle les deux bouts de la chaîne :
//   1. le MODÈLE (`pulseMonitorPins`) réclame bien la broche de la LED, dans les
//      trois montages courants, et n'a rien perdu des autres composants ;
//   2. le MOTEUR AVR mesure le bon rapport cyclique sur cette broche (vrai
//      Timer2 avr8js en PWM à correction de phase, comme `analogWrite`), et le
//      niveau instantané — celui d'avant le correctif — alterne bel et bien
//      d'une image à l'autre : la panne est rejouée, pas supposée.
//
// Usage : node scripts/verify-pwmled.mjs
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { avrInstruction } from 'avr8js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-pwmled-'));

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

const { pulseMonitorPins } = await load('src/webview/diagram/model.mts', 'model.mjs');
const { AvrEngine } = await load('src/webview/engines/avr.mts', 'avr.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// --- Schémas ----------------------------------------------------------------
const uno = { id: 'uno', type: 'uno', x: 0, y: 0 };
const pico = { id: 'pico', type: 'pico', x: 0, y: 0 };
const led = (id = 'led') => ({ id, type: 'led', x: 0, y: 0, attrs: { color: 'red' } });
const R = (id, value) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(value) } });
const W = (id, a, b) => ({ id, a, b });
const P = (partId, pin) => ({ partId, pin });

console.log('Modèle — la broche d’une LED est réclamée à la mesure (pulseMonitorPins) :');
{
  // 1. Le montage de Frank : LED en D3 avec sa résistance côté anode.
  const rAnode = {
    parts: [uno, led(), R('r1', 220)],
    wires: [
      W('w1', P('uno', '3'), P('r1', '1')),
      W('w2', P('r1', '2'), P('led', 'A')),
      W('w3', P('led', 'C'), P('uno', 'GND.1')),
    ],
  };
  check('R côté anode : D3 surveillée', pulseMonitorPins(rAnode, 5).includes('3'),
    JSON.stringify(pulseMonitorPins(rAnode, 5)));

  // 2. Résistance côté cathode (l'autre moitié des schémas d'élèves).
  const rCathode = {
    parts: [uno, led(), R('r1', 220)],
    wires: [
      W('w1', P('uno', '3'), P('led', 'A')),
      W('w2', P('led', 'C'), P('r1', '1')),
      W('w3', P('r1', '2'), P('uno', 'GND.1')),
    ],
  };
  check('R côté cathode : D3 surveillée', pulseMonitorPins(rCathode, 5).includes('3'));

  // 3. Branchement direct (sans résistance — la LED grille, mais elle doit
  //    quand même être mesurée : c'est le rendu qui décide de l'afficher).
  const direct = {
    parts: [uno, led()],
    wires: [W('w1', P('uno', '3'), P('led', 'A')), W('w2', P('led', 'C'), P('uno', 'GND.1'))],
  };
  check('LED en direct : D3 surveillée', pulseMonitorPins(direct, 5).includes('3'));

  // 4. Pico : même chaîne, broches GPxx.
  const surPico = {
    parts: [pico, led(), R('r1', 220)],
    wires: [
      W('w1', P('pico', 'GP15'), P('r1', '1')),
      W('w2', P('r1', '2'), P('led', 'A')),
      W('w3', P('led', 'C'), P('pico', 'GND.3')),
    ],
  };
  check('Pico : GP15 surveillée', pulseMonitorPins(surPico, 3.3).includes('GP15'),
    JSON.stringify(pulseMonitorPins(surPico, 3.3)));

  // 5. Plusieurs LED : chaque broche est demandée une seule fois.
  const troisLeds = {
    parts: [uno, led('l1'), led('l2'), led('l3')],
    wires: [
      W('w1', P('uno', '3'), P('l1', 'A')), W('w2', P('l1', 'C'), P('uno', 'GND.1')),
      W('w3', P('uno', '5'), P('l2', 'A')), W('w4', P('l2', 'C'), P('uno', 'GND.1')),
      // La 3e est sur la même broche que la 1re : doublon à éliminer.
      W('w5', P('uno', '3'), P('l3', 'A')), W('w6', P('l3', 'C'), P('uno', 'GND.1')),
    ],
  };
  const pins = pulseMonitorPins(troisLeds, 5);
  check('3 LED sur 2 broches → 2 entrées, sans doublon',
    pins.length === 2 && pins.includes('3') && pins.includes('5'), JSON.stringify(pins));

  // 6. LED non pilotée (anode au 5 V) : rien à mesurer, pas d'entrée fantôme.
  const surVcc = {
    parts: [uno, led(), R('r1', 220)],
    wires: [
      W('w1', P('uno', '5V'), P('r1', '1')),
      W('w2', P('r1', '2'), P('led', 'A')),
      W('w3', P('led', 'C'), P('uno', 'GND.1')),
    ],
  };
  check('LED câblée au 5 V : aucune broche demandée', pulseMonitorPins(surVcc, 5).length === 0,
    JSON.stringify(pulseMonitorPins(surVcc, 5)));

  // 7. Schéma vide : liste vide (et pas un plantage).
  check('schéma sans composant : liste vide', pulseMonitorPins({ parts: [uno], wires: [] }, 5).length === 0);
}

console.log('Modèle — les composants déjà mesurés le restent (non-régression) :');
{
  const servo = { id: 'sv', type: 'servo', x: 0, y: 0 };
  const buzzer = { id: 'bz', type: 'buzzer', x: 0, y: 0 };
  const rgb = { id: 'rgb', type: 'rgb-led', x: 0, y: 0 };
  const seg = { id: 'sg', type: '7seg', x: 0, y: 0 };
  const moteur = { id: 'mt', type: 'moteur-dc', x: 0, y: 0 };
  const schema = {
    parts: [uno, servo, buzzer, rgb, seg, moteur],
    wires: [
      W('w1', P('uno', '9'), P('sv', 'PWM')),
      W('w2', P('uno', '8'), P('bz', '1')),
      W('w3', P('uno', '10'), P('rgb', 'R')),
      W('w4', P('uno', '11'), P('rgb', 'G')),
      W('w5', P('uno', '12'), P('rgb', 'B')),
      W('w6', P('uno', '2'), P('sg', 'A')),
      W('w7', P('uno', '4'), P('mt', '1')),
      W('w8', P('mt', '2'), P('uno', 'GND.1')),
    ],
  };
  const pins = pulseMonitorPins(schema, 5);
  for (const [nom, pin] of [
    ['servo', '9'], ['buzzer', '8'], ['LED RGB (R)', '10'], ['LED RGB (G)', '11'],
    ['LED RGB (B)', '12'], ['7 segments (A)', '2'], ['moteur', '4'],
  ]) {
    check(`${nom} : ${pin} toujours surveillée`, pins.includes(pin), JSON.stringify(pins));
  }
}

// --- Moteur AVR : le rapport cyclique mesuré est le bon ----------------------
// Registres ATmega328P (datasheet) — c'est exactement ce que pose analogWrite(3, x)
// sur une Uno : Timer2 en PWM à correction de phase, prescaler 64 (≈ 490 Hz),
// sortie OC2B = PD3 = D3.
const DDRD = 0x2a, PORTD = 0x2b, TCCR2A = 0xb0, TCCR2B = 0xb1, OCR2B = 0xb4;
const CYCLES_PAR_MS = 16_000;

/**
 * Pose sur D3 ce que pose `analogWrite(3, valeur)` du core Arduino : le PWM du
 * Timer2 pour 1-254, et un simple `digitalWrite` aux deux extrêmes — le core
 * COUPE la sortie du timer pour 0 et 255 (wiring_analog.c), c'est donc une
 * broche figée que le rendu doit savoir lire.
 */
function analogWrite3(cpu, valeur) {
  if (valeur === 0 || valeur === 255) {
    cpu.writeData(TCCR2A, 0x01); // COM2B1 retiré : la broche redevient un GPIO
    cpu.writeData(PORTD, valeur === 0 ? 0x00 : 0x08);
    return;
  }
  cpu.writeData(TCCR2A, 0x21); // COM2B1 + WGM20 : PWM à correction de phase sur OC2B
  cpu.writeData(OCR2B, valeur);
}

/** Moteur AVR prêt : D3 en sortie PWM à `valeur` (0-255), broches surveillées ou non. */
function moteurPwmD3(valeur, { surveille = true } = {}) {
  // Programme minimal : `rjmp .-2` (boucle sur place). Le PWM est matériel — le
  // cœur n'a rien à exécuter, c'est le timer qui bascule la broche.
  const eng = new AvrEngine(Uint16Array.from([0xcfff]), null, 'avr328');
  if (surveille) eng.setPulseMonitors(['3']);
  const cpu = eng.cpu;
  cpu.writeData(DDRD, 0x08); // D3 en sortie (pinMode OUTPUT)
  cpu.writeData(TCCR2B, 0x04); // prescaler 64 → ≈ 490 Hz, comme une Uno
  analogWrite3(cpu, valeur);
  return eng;
}

/** Fait tourner le moteur `ms` millisecondes SIMULÉES. */
function avance(eng, ms) {
  const fin = eng.cpu.cycles + ms * CYCLES_PAR_MS;
  while (eng.cpu.cycles < fin) {
    avrInstruction(eng.cpu);
    eng.cpu.tick();
  }
}

/**
 * Luminosité RÉELLEMENT affichée par le rendu (règle du `case 'led'` de
 * sim.mts) : le rapport cyclique quand la broche pulse, sinon son niveau.
 */
const luminosite = (eng) =>
  eng.pulseActive('3') ? eng.readPwmDuty('3') : (eng.readDigital('3') ? 1 : 0);

console.log('Moteur AVR — analogWrite(3, x) mesuré en rapport cyclique :');
{
  for (const [valeur, attendu] of [[0, 0], [64, 0.25], [128, 0.5], [192, 0.75], [255, 1]]) {
    const eng = moteurPwmD3(valeur);
    avance(eng, 50); // ~24 périodes PWM
    const lum = luminosite(eng);
    eng.dispose?.();
    check(
      `analogWrite(3, ${valeur}) → ${(attendu * 100).toFixed(0)} % (affiché ${(lum * 100).toFixed(1)} %)`,
      Math.abs(lum - attendu) <= 0.03,
      `attendu ${attendu}`
    );
  }

  const eng = moteurPwmD3(128);
  avance(eng, 50);
  check('la broche est vue comme active (pulseActive)', eng.pulseActive('3') === true);
  eng.dispose?.();

  // Sortie FIGÉE après avoir pulsé (analogWrite 128 puis 255) : plus aucun front
  // n'arrive. La mesure ne doit pas rester bloquée sur les 50 % d'avant — sinon
  // la LED resterait à mi-luminosité alors qu'elle est à fond.
  for (const [valeur, attendu] of [[255, 1], [0, 0]]) {
    const eng = moteurPwmD3(128);
    avance(eng, 50);
    eng.readPwmDuty('3'); // 50 % mémorisés
    analogWrite3(eng.cpu, valeur);
    avance(eng, 20); // moins d'une dizaine de périodes : la bascule doit être vue
    const lum = luminosite(eng);
    eng.dispose?.();
    check(`analogWrite(3, ${valeur}) après un 128 : affichage à ${attendu * 100} % en 20 ms`,
      Math.abs(lum - attendu) < 1e-9, String(lum));
  }
}

console.log('Moteur AVR — la panne d’origine, rejouée :');
{
  // Le rendu tombe toutes les ~16 ms (une image). Sans mesure, il lit le niveau
  // instantané : à 490 Hz la broche a basculé ~8 fois entre deux images, la
  // valeur lue est celle de la phase du moment — d'où le clignotement.
  const sans = moteurPwmD3(128, { surveille: false });
  const niveaux = [];
  for (let i = 0; i < 30; i++) {
    avance(sans, 16);
    niveaux.push(sans.readDigital('3'));
  }
  sans.dispose?.();
  const clignote = niveaux.includes(true) && niveaux.includes(false);
  check('broche NON surveillée : le niveau instantané alterne d’une image à l’autre (= clignotement)',
    clignote, JSON.stringify(niveaux.map((v) => (v ? 1 : 0)).join('')));

  // Avec la mesure, la luminosité affichée est stable d'une image à l'autre.
  const avec = moteurPwmD3(128);
  const duties = [];
  for (let i = 0; i < 30; i++) {
    avance(avec, 16);
    duties.push(luminosite(avec));
  }
  avec.dispose?.();
  const min = Math.min(...duties);
  const max = Math.max(...duties);
  check('broche surveillée : la luminosité reste stable image après image',
    max - min <= 0.005 && Math.abs(min - 0.5) <= 0.03, `min ${min.toFixed(4)} max ${max.toFixed(4)}`);
  // Le même relevé, mais à une cadence QUI NE TOMBE PAS JUSTE sur la période PWM
  // (2,04 ms) : c'est là que l'ancienne fenêtre libre faisait osciller la mesure.
  const irregulier = moteurPwmD3(128);
  avance(irregulier, 20); // le temps que la 1re période PWM soit complète
  irregulier.readPwmDuty('3');
  const vals = [];
  for (let i = 0; i < 40; i++) {
    avance(irregulier, 3 + (i % 7)); // 3 à 9 ms, jamais un multiple de la période
    vals.push(luminosite(irregulier));
  }
  irregulier.dispose?.();
  const ecart = Math.max(...vals) - Math.min(...vals);
  check('rafraîchissement irrégulier : la mesure ne bouge toujours pas',
    ecart <= 0.005, `écart ${(ecart * 100).toFixed(2)} %`);
}

// --- Le rendu demande bien cette liste au moteur -----------------------------
console.log('Rendu (sim.mts) :');
{
  const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
  check('sim.mts confie la liste des broches mesurées au modèle',
    /setPulseMonitors\?\.\(\s*\n?\s*pulseMonitorPins\(/.test(sim));
  // Le rendu d'une LED doit utiliser le rapport cyclique comme LUMINOSITÉ.
  check('sim.mts affiche le rapport cyclique en luminosité de la LED',
    /el\.brightness = duty \* lum;/.test(sim));
}

console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
