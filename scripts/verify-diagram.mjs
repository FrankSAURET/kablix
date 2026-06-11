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
const { ledOn, rgbLedState, buzzerOn, buttonBindings, potBindings } = await import(pathToFileURL(out).href);

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
