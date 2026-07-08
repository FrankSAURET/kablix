// Vérifie la netlist de l'atelier (model.mts) : résolution des LED et des
// boutons, puis intégration avec avr8js (la LED câblée sur D13 suit la broche).
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CPU, avrInstruction, AVRIOPort, portBConfig, PinState } from 'avr8js';
import { UNO_DEMO } from '../src/webview/programs/uno-demo.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'kablix-dg-')), 'model.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/model.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const {
  ledOn, rgbLedState, buzzerOn, buttonBindings, potBindings,
  sevenSegmentState, ledBarState, slideSwitchBindings, dipSwitchBindings,
  joystickBindings, digitalSourceBindings, analogSourceBindings, aoDoSensorBindings, servoBindings,
} = await import(pathToFileURL(out).href);

const outCat = join(mkdtempSync(join(tmpdir(), 'kablix-cat-')), 'catalog.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/catalog.mts')],
  outfile: outCat,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { registerCustomPart, rolePin, pinElectricalRole } = await import(pathToFileURL(outCat).href);

const outGeo = join(mkdtempSync(join(tmpdir(), 'kablix-geo-')), 'geometry.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/geometry.mts')],
  outfile: outGeo,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { snapPoint, roundedWirePath, DUPONT_COLORS, dupontHex } = await import(pathToFileURL(outGeo).href);

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
};

// Schéma : Uno D13 -> résistance -> LED(A) ; LED(C) -> GND ; bouton D2 <-> GND.
const diagram = {
  parts: [
    { id: 'uno', type: 'uno', x: 0, y: 0 },
    { id: 'r', type: 'resistor', x: 0, y: 0 },
    { id: 'led', type: 'led', x: 0, y: 0 },
    { id: 'btn', type: 'button', x: 0, y: 0 },
  ],
  wires: [
    { id: 'w1', a: { partId: 'uno', pin: '13' }, b: { partId: 'r', pin: '1' } },
    { id: 'w2', a: { partId: 'r', pin: '2' }, b: { partId: 'led', pin: 'A' } },
    { id: 'w3', a: { partId: 'led', pin: 'C' }, b: { partId: 'uno', pin: 'GND.1' } },
    { id: 'w4', a: { partId: 'uno', pin: '2' }, b: { partId: 'btn', pin: '1.l' } },
    { id: 'w5', a: { partId: 'btn', pin: '2.l' }, b: { partId: 'uno', pin: 'GND.2' } },
  ],
};

console.log('Netlist (pur) :');
check('LED allumée quand D13 = HIGH', ledOn(diagram, 'led', (n) => n === '13'));
check('LED éteinte quand D13 = LOW', !ledOn(diagram, 'led', () => false));
const binds = buttonBindings(diagram);
check('bouton lié à la broche D2', binds.length === 1 && binds[0].mcuPin === '2');

// Schéma Pico : GP25 -> résistance -> LED(A) ; LED(C) -> GND ; bouton GP13 <-> GND ;
// potentiomètre SIG -> GP26 ; buzzer entre GP14 et GND ; LED RGB R/G/B + COM -> GND.
const picoDiagram = {
  parts: [
    { id: 'pico', type: 'pico', x: 0, y: 0 },
    { id: 'r', type: 'resistor', x: 0, y: 0 },
    { id: 'led', type: 'led', x: 0, y: 0 },
    { id: 'btn', type: 'button', x: 0, y: 0 },
    { id: 'pot', type: 'pot', x: 0, y: 0 },
    { id: 'bz', type: 'buzzer', x: 0, y: 0 },
    { id: 'rgb', type: 'rgb-led', x: 0, y: 0 },
  ],
  wires: [
    { id: 'w1', a: { partId: 'pico', pin: 'GP25' }, b: { partId: 'r', pin: '1' } },
    { id: 'w2', a: { partId: 'r', pin: '2' }, b: { partId: 'led', pin: 'A' } },
    { id: 'w3', a: { partId: 'led', pin: 'C' }, b: { partId: 'pico', pin: 'GND.1' } },
    { id: 'w4', a: { partId: 'pico', pin: 'GP13' }, b: { partId: 'btn', pin: '1.l' } },
    { id: 'w5', a: { partId: 'btn', pin: '2.l' }, b: { partId: 'pico', pin: 'GND.4' } },
    { id: 'w6', a: { partId: 'pot', pin: 'SIG' }, b: { partId: 'pico', pin: 'GP26' } },
    { id: 'w7', a: { partId: 'pico', pin: 'GP14' }, b: { partId: 'bz', pin: '1' } },
    { id: 'w8', a: { partId: 'bz', pin: '2' }, b: { partId: 'pico', pin: 'GND.5' } },
    { id: 'w9', a: { partId: 'pico', pin: 'GP16' }, b: { partId: 'rgb', pin: 'R' } },
    { id: 'w10', a: { partId: 'pico', pin: 'GP17' }, b: { partId: 'rgb', pin: 'G' } },
    { id: 'w11', a: { partId: 'pico', pin: 'GP18' }, b: { partId: 'rgb', pin: 'B' } },
    { id: 'w12', a: { partId: 'rgb', pin: 'COM' }, b: { partId: 'pico', pin: 'GND.6' } },
  ],
};

console.log('Netlist Pico + nouveaux composants :');
check('LED externe suit GP25', ledOn(picoDiagram, 'led', (n) => n === 'GP25'));
check('LED éteinte quand GP25 = LOW', !ledOn(picoDiagram, 'led', () => false));
{
  const binds = buttonBindings(picoDiagram);
  check('bouton lié à GP13', binds.length === 1 && binds[0].mcuPin === 'GP13');
  const pots = potBindings(picoDiagram);
  check('potentiomètre lié à GP26 (ADC0)', pots.length === 1 && pots[0].mcuPin === 'GP26');
  check('buzzer actif quand GP14 = HIGH', buzzerOn(picoDiagram, 'bz', (n) => n === 'GP14'));
  check('buzzer inactif quand GP14 = LOW', !buzzerOn(picoDiagram, 'bz', () => false));
  const rgb = rgbLedState(picoDiagram, 'rgb', (n) => n === 'GP16' || n === 'GP18');
  check('LED RGB : canaux rouge+bleu allumés, vert éteint', rgb.red && !rgb.green && rgb.blue);
}

// Schéma Uno : nouveaux composants (7 segments, interrupteurs, joystick, sources, servo).
const extDiagram = {
  parts: [
    { id: 'uno', type: 'uno', x: 0, y: 0 },
    { id: 'seg', type: '7seg', x: 0, y: 0 },
    { id: 'bar', type: 'led-bar', x: 0, y: 0 },
    { id: 'sw', type: 'slide-switch', x: 0, y: 0 },
    { id: 'dip', type: 'dip-switch', x: 0, y: 0 },
    { id: 'joy', type: 'joystick', x: 0, y: 0 },
    { id: 'ldr', type: 'photoresistor', x: 0, y: 0, attrs: { sensitivity: '50' } },
    { id: 'pir', type: 'pir', x: 0, y: 0, attrs: { state: '1' } },
    { id: 'srv', type: 'servo', x: 0, y: 0 },
  ],
  wires: [
    { id: 'x1', a: { partId: 'uno', pin: '3' }, b: { partId: 'seg', pin: 'A' } },
    { id: 'x2', a: { partId: 'seg', pin: 'DIG1' }, b: { partId: 'uno', pin: 'GND.1' } },
    { id: 'x3', a: { partId: 'uno', pin: '4' }, b: { partId: 'bar', pin: 'A1' } },
    { id: 'x4', a: { partId: 'bar', pin: 'C1' }, b: { partId: 'uno', pin: 'GND.1' } },
    { id: 'x5', a: { partId: 'uno', pin: '5' }, b: { partId: 'sw', pin: '1' } },
    { id: 'x6', a: { partId: 'sw', pin: '2' }, b: { partId: 'uno', pin: 'GND.2' } },
    { id: 'x7', a: { partId: 'uno', pin: '6' }, b: { partId: 'dip', pin: '3a' } },
    { id: 'x8', a: { partId: 'dip', pin: '3b' }, b: { partId: 'uno', pin: 'GND.2' } },
    { id: 'x9', a: { partId: 'joy', pin: 'VERT' }, b: { partId: 'uno', pin: 'A1' } },
    { id: 'x10', a: { partId: 'joy', pin: 'SEL' }, b: { partId: 'uno', pin: '7' } },
    { id: 'x11', a: { partId: 'ldr', pin: 'AO' }, b: { partId: 'uno', pin: 'A2' } },
    { id: 'x12', a: { partId: 'pir', pin: 'OUT' }, b: { partId: 'uno', pin: '8' } },
    { id: 'x13', a: { partId: 'uno', pin: '9' }, b: { partId: 'srv', pin: 'PWM' } },
  ],
};

console.log('Nouveaux composants (netlist) :');
{
  const seg = sevenSegmentState(extDiagram, 'seg', (n) => n === '3');
  check('7 segments : segment A allumé seul', seg[0] === 1 && seg.slice(1).every((v) => v === 0));
  const bar = ledBarState(extDiagram, 'bar', (n) => n === '4');
  check('barre LED : LED 1 allumée seule', bar[0] === 1 && bar.slice(1).every((v) => v === 0));
  const sw = slideSwitchBindings(extDiagram);
  check('interrupteur : côté 1 lié à D5', sw.length === 1 && sw[0].mcuPin === '5' && sw[0].side === 1);
  const dip = dipSwitchBindings(extDiagram);
  check('DIP : canal 3 lié à D6', dip.length === 1 && dip[0].mcuPin === '6' && dip[0].channel === 3);
  const joy = joystickBindings(extDiagram);
  check('joystick : VERT→A1, SEL→D7', joy.length === 1 && joy[0].vert === 'A1' && joy[0].sel === '7');
  const ldr = aoDoSensorBindings(extDiagram);
  check('capteur de lumière : AO→A2 (double sortie)', ldr.length === 1 && ldr[0].analogPin === 'A2' && ldr[0].digitalPin === null);
  const pir = digitalSourceBindings(extDiagram);
  check('PIR : OUT→D8', pir.length === 1 && pir[0].mcuPin === '8');
  const srv = servoBindings(extDiagram);
  check('servo : PWM→D9', srv.length === 1 && srv[0].mcuPin === '9');
}

// Potentiomètre : détection du câblage inversé (VCC↔GND permutés).
console.log('Potentiomètre (inversion) + 7 segments (cathode/anode commune) :');
{
  const potParts = [
    { id: 'uno', type: 'uno', x: 0, y: 0 },
    { id: 'pot', type: 'pot', x: 0, y: 0 },
  ];
  const normalPot = {
    parts: potParts,
    wires: [
      { id: 'p1', a: { partId: 'pot', pin: 'SIG' }, b: { partId: 'uno', pin: 'A0' } },
      { id: 'p2', a: { partId: 'pot', pin: 'VCC' }, b: { partId: 'uno', pin: '5V' } },
      { id: 'p3', a: { partId: 'pot', pin: 'GND' }, b: { partId: 'uno', pin: 'GND.1' } },
    ],
  };
  const swappedPot = {
    parts: potParts,
    wires: [
      { id: 'p1', a: { partId: 'pot', pin: 'SIG' }, b: { partId: 'uno', pin: 'A0' } },
      { id: 'p2', a: { partId: 'pot', pin: 'VCC' }, b: { partId: 'uno', pin: 'GND.1' } },
      { id: 'p3', a: { partId: 'pot', pin: 'GND' }, b: { partId: 'uno', pin: '5V' } },
    ],
  };
  const bn = potBindings(normalPot);
  check('pot normal : lié à A0, non inversé', bn.length === 1 && bn[0].mcuPin === 'A0' && bn[0].inverted === false);
  const bi = potBindings(swappedPot);
  check('pot VCC/GND permutés : inversé', bi.length === 1 && bi[0].inverted === true);

  const segCathode = {
    parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, { id: 'seg', type: '7seg', x: 0, y: 0, attrs: { common: 'cathode' } }],
    wires: [
      { id: 's1', a: { partId: 'uno', pin: '3' }, b: { partId: 'seg', pin: 'A' } },
      { id: 's2', a: { partId: 'seg', pin: 'COM.1' }, b: { partId: 'uno', pin: 'GND.1' } },
    ],
  };
  const sc = sevenSegmentState(segCathode, 'seg', (n) => n === '3');
  check('7 seg cathode commune (COM.1) : A allumé seul', sc[0] === 1 && sc.slice(1).every((v) => v === 0));

  const segAnode = {
    parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, { id: 'seg', type: '7seg', x: 0, y: 0, attrs: { common: 'anode' } }],
    wires: [
      { id: 's1', a: { partId: 'uno', pin: '3' }, b: { partId: 'seg', pin: 'A' } },
      { id: 's2', a: { partId: 'seg', pin: 'COM.1' }, b: { partId: 'uno', pin: '5V' } },
    ],
  };
  // Anode commune : COM haut + segment A bas (broche 3 LOW) → A allumé.
  const sa = sevenSegmentState(segAnode, 'seg', () => false);
  check('7 seg anode commune : A allumé si broche basse', sa[0] === 1);
}

// Platine d'essai : LED enfichée sur les colonnes 4 et 5 (bande a–e), pilotée
// par D10 via la colonne 4 ; cathode vers GND via la colonne 5. Le rail − du
// bas relie GND au bouton.
const bbDiagram = {
  parts: [
    { id: 'uno', type: 'uno', x: 0, y: 0 },
    { id: 'bb', type: 'breadboard', x: 0, y: 0, attrs: { size: 'half' } },
    { id: 'led', type: 'led', x: 0, y: 0 },
    { id: 'btn', type: 'button', x: 0, y: 0 },
  ],
  wires: [
    { id: 'b1', a: { partId: 'uno', pin: '10' }, b: { partId: 'bb', pin: 'a4' } },
    // LED enfichée (fils implicites « auto ») : A en e4, C en e5.
    { id: 'b2', a: { partId: 'led', pin: 'A' }, b: { partId: 'bb', pin: 'e4' }, auto: true },
    { id: 'b3', a: { partId: 'led', pin: 'C' }, b: { partId: 'bb', pin: 'e5' }, auto: true },
    { id: 'b4', a: { partId: 'bb', pin: 'a5' }, b: { partId: 'uno', pin: 'GND.1' } },
    // Bouton entre D11 (colonne f10) et le rail − du bas relié à GND.
    { id: 'b5', a: { partId: 'uno', pin: '11' }, b: { partId: 'bb', pin: 'f10' } },
    { id: 'b6', a: { partId: 'btn', pin: '1.l' }, b: { partId: 'bb', pin: 'j10' }, auto: true },
    { id: 'b7', a: { partId: 'btn', pin: '2.l' }, b: { partId: 'bb', pin: 'bn.3' }, auto: true },
    { id: 'b8', a: { partId: 'bb', pin: 'bn.10' }, b: { partId: 'uno', pin: 'GND.2' } },
  ],
};

console.log("Platine d'essai (bandes + rails) :");
{
  check('LED via la platine suit D10', ledOn(bbDiagram, 'led', (n) => n === '10'));
  check('LED via la platine éteinte quand D10 = LOW', !ledOn(bbDiagram, 'led', () => false));
  const binds = buttonBindings(bbDiagram);
  check('bouton via bande f–j + rail − lié à D11', binds.length === 1 && binds[0].mcuPin === '11');
}

console.log('Composant personnalisé (rôles de broches) :');
{
  registerCustomPart({
    type: 'custom-test',
    label: 'Ma LED',
    kind: 'led',
    svg: '<svg width="20" height="20"></svg>',
    pins: [{ name: 'plus', x: 5, y: 5 }, { name: 'moins', x: 15, y: 5 }],
    pinRoles: { A: 'plus', C: 'moins' },
  });
  check('rolePin A → plus', rolePin('custom-test', 'A') === 'plus');
  check('rolePin C → moins', rolePin('custom-test', 'C') === 'moins');
  // Le modèle bundlé séparément a son propre registre : on y enregistre aussi.
}

console.log('Rôle électrique des broches (couleur auto des fils) :');
{
  check('Uno GND.1 → gnd', pinElectricalRole('uno', 'GND.1') === 'gnd');
  check('Uno 5V → vcc', pinElectricalRole('uno', '5V') === 'vcc');
  check('Uno D13 → other', pinElectricalRole('uno', '13') === 'other');
  check('Pico 3V3 → vcc', pinElectricalRole('pico', '3V3') === 'vcc');
  check('Pico GP25 → other', pinElectricalRole('pico', 'GP25') === 'other');
  check('potentiomètre GND → gnd', pinElectricalRole('pot', 'GND') === 'gnd');
  check('servo V+ → vcc', pinElectricalRole('servo', 'V+') === 'vcc');
  check('LED A → other', pinElectricalRole('led', 'A') === 'other');
}

console.log('Géométrie des fils :');
{
  const o = { x: 100, y: 100 };
  const h = snapPoint(o, { x: 200, y: 108 });
  check('segment quasi horizontal aimanté (y conservé)', h.x === 200 && h.y === 100);
  const v = snapPoint(o, { x: 95, y: 220 });
  check('segment quasi vertical aimanté (x conservé)', v.x === 100 && v.y === 220);
  const d = snapPoint(o, { x: 200, y: 200 });
  check('diagonale franche non modifiée', d.x === 200 && d.y === 200);

  const path = roundedWirePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }], 8);
  check('tracé commence par M et finit sur le dernier point', path.startsWith('M 0 0') && path.endsWith('L 100 80'));
  check('un congé (Q) au changement de direction', (path.match(/Q/g) ?? []).length === 1);
  check('le congé passe par le sommet (100,0)', path.includes('Q 100 0'));
  const direct = roundedWirePath([{ x: 0, y: 0 }, { x: 50, y: 50 }]);
  check('fil direct sans coude : pas de congé', direct === 'M 0 0 L 50 50');

  check('10 couleurs Dupont', DUPONT_COLORS.length === 10);
  check('dupontHex résout un identifiant', dupontHex('red') === '#e53935');
}

console.log('Intégration avr8js (LED suit la broche 13) :');
{
  const cpu = new CPU(UNO_DEMO.slice());
  const portB = new AVRIOPort(cpu, portBConfig);
  const read = (name) => (name === '13' ? portB.pinState(5) === PinState.High : false);

  let onSeen = false;
  let offSeen = false;
  for (let i = 0; i < 4_000_000 && !(onSeen && offSeen); i++) {
    avrInstruction(cpu);
    cpu.tick();
    if (ledOn(diagram, 'led', read)) onSeen = true;
    else offSeen = true;
  }
  check('la LED passe par les états allumé ET éteint', onSeen && offSeen);
}

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
