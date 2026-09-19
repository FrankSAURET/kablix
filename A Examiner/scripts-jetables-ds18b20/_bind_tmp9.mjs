import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwarePico } from './scripts/_firmware.mjs';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kx-b9-'));
const out = join(tmp, 'all.mjs');
await esbuild.build({ entryPoints: [root + '_bind_src.mts'], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const K = await import(pathToFileURL(out).href);
const carte = CARTES_PICO[0];
const segments = K.parseUf2(new Uint8Array(readFileSync(firmwarePico(carte.prefixe)))).map((s) => ({ addr: s.addr, data: s.data }));

const script = [
  'from machine import Pin', 'import onewire', 'import ds18x20', 'import time', '',
  'fil = onewire.OneWire(Pin(14))',
  'capteurs = ds18x20.DS18X20(fil)',
  'adresses = capteurs.scan()',
  "print('TROUVES', len(adresses))",
  'for i in range(3):',
  '    capteurs.convert_temp()', '    time.sleep(0.8)',
  '    for a in adresses:', "        print('T', capteurs.read_temp(a))",
  "print('KX_DONE')", '',
].join('\n');

const engine = new K.PicoEngine({ kind: 'flash', segments, script }, carte.famille);
engine.setDs18b20([{ id: 'Capt1', pin: 'GP14', temperatureC: 23.5 }]);
const d = engine.ds18b20[0];
const longs = [];
let desc = -1;
const fd = d.auto.frontDescendant.bind(d.auto);
const fm = d.auto.frontMontant.bind(d.auto);
d.auto.frontDescendant = (c) => { desc = c; return fd(c); };
d.auto.frontMontant = (c) => {
  const nanos = desc >= 0 ? c - desc : -1;
  // Phase interne AVANT traitement (champ prive, lisible en JS).
  const phaseAvant = d.auto.phase;
  const descAvant = d.auto.descenteA;
  const imp = fm(c);
  if (nanos >= 400000) longs.push({ t: c/1e6, nanos, us: nanos/1000, phaseAvant, descAvant, presence: !!imp });
  return imp;
};
let serial = '';
engine.onSerial = (c) => { serial += c; };
engine.start();
const t0 = Date.now();
await new Promise((res) => {
  const it = setInterval(() => {
    if (!serial.includes('KX_DONE') && !serial.includes('Traceback') && (Date.now() - t0) < 45000) return;
    clearInterval(it); engine.dispose(); res();
  }, 300);
});
console.log(`bonnes=${(serial.match(/T 23\.5/g)??[]).length} exception=${serial.includes('Traceback')}`);
for (const e of longs) {
  console.log(`t=${e.t.toFixed(1)}ms nanos=${e.nanos} us=${e.us.toFixed(3)} phaseAvant=${e.phaseAvant} descenteA=${e.descAvant} presence=${e.presence}`);
}
process.exit(0);
