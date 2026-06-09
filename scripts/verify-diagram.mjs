// Vérifie la netlist de l'atelier (model.mts) : résolution des LED et des
// boutons, puis intégration avec avr8js (la LED câblée sur D13 suit la broche).
import esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CPU, avrInstruction, AVRIOPort, portBConfig, PinState } from 'avr8js';
import { UNO_DEMO } from '../src/webview/programs/uno-demo.mjs';

const root = new URL('..', import.meta.url).pathname;
const out = join(mkdtempSync(join(tmpdir(), 'microsim-dg-')), 'model.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/model.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { ledOn, buttonBindings } = await import(pathToFileURL(out).href);

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
