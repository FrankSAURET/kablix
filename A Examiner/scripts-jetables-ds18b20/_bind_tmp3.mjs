import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwarePico } from './scripts/_firmware.mjs';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kx-b3-'));
const out = join(tmp, 'all.mjs');
await esbuild.build({ entryPoints: [root + '_bind_src.mts'], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const K = await import(pathToFileURL(out).href);

const carte = CARTES_PICO[0];
const fw = firmwarePico(carte.prefixe);
const segments = K.parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));

// Variantes : on change UNE chose a la fois pour trouver ce qui casse.
const BASE = (corps) => [
  'from machine import Pin', 'import onewire', 'import ds18x20', 'import time', '',
  'fil = onewire.OneWire(Pin(14))',
  'capteurs = ds18x20.DS18X20(fil)',
  'adresses = capteurs.scan()',
  "print('TROUVES', len(adresses))",
  ...corps,
  "print('KX_DONE')", '',
].join('\n');

const VARIANTES = {
  // Le banc officiel : sleep 0.8, pas de pause finale.
  officiel: BASE([
    'for i in range(3):',
    '    capteurs.convert_temp()',
    '    time.sleep(0.8)',
    '    for a in adresses:',
    "        print('T', capteurs.read_temp(a))",
  ]),
  // Frank : sleep 0.75 + pause finale 0.25.
  frank: BASE([
    'for i in range(3):',
    '    capteurs.convert_temp()',
    '    time.sleep(0.75)',
    '    for a in adresses:',
    "        print('T', capteurs.read_temp(a))",
    '    time.sleep(0.25)',
  ]),
  // Frank sans la pause finale : isole le sleep 0.75.
  frank_sans_pause: BASE([
    'for i in range(3):',
    '    capteurs.convert_temp()',
    '    time.sleep(0.75)',
    '    for a in adresses:',
    "        print('T', capteurs.read_temp(a))",
  ]),
  // Officiel + pause finale : isole la pause 0.25.
  officiel_avec_pause: BASE([
    'for i in range(3):',
    '    capteurs.convert_temp()',
    '    time.sleep(0.8)',
    '    for a in adresses:',
    "        print('T', capteurs.read_temp(a))",
    '    time.sleep(0.25)',
  ]),
};

for (const [nom, script] of Object.entries(VARIANTES)) {
  const engine = new K.PicoEngine({ kind: 'flash', segments, script }, carte.famille);
  engine.setDs18b20([{ id: 'Capt1', pin: 'GP14', temperatureC: 23.5 }]);
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
  const ok = (serial.match(/T 23\.5/g) ?? []).length;
  console.log(`\n===== ${nom} : ${ok} lectures bonnes, ${serial.includes('Traceback') ? 'EXCEPTION' : 'pas d exception'}`);
  console.log(serial.split('\n').slice(0, 14).join('\n'));
}
process.exit(0);
