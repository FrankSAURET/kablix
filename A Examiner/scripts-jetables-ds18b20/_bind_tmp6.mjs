import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwarePico } from './scripts/_firmware.mjs';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kx-b6-'));
const out = join(tmp, 'all.mjs');
await esbuild.build({ entryPoints: [root + '_bind_src.mts'], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const K = await import(pathToFileURL(out).href);
const carte = CARTES_PICO[0];
const segments = K.parseUf2(new Uint8Array(readFileSync(firmwarePico(carte.prefixe)))).map((s) => ({ addr: s.addr, data: s.data }));

const TETE = [
  'from machine import Pin', 'import onewire', 'import ds18x20', 'import time', '',
  'fil = onewire.OneWire(Pin(14))',
  'capteurs = ds18x20.DS18X20(fil)',
  'adresses = capteurs.scan()',
  "print('TROUVES', len(adresses))",
];
const NUE = [
  'for i in range(3):',
  '    capteurs.convert_temp()', '    time.sleep(0.8)',
  '    for a in adresses:', "        print('T', capteurs.read_temp(a))",
];

const VARIANTES = {
  // Reference : casse (run5).
  nue: [...TETE, ...NUE],
  // Un print quelconque, sans toucher au bus : si ca repare, c est le port serie.
  nue_print_bidon: [...TETE, "print('XXXXXXXX 282461f58c7eace7')", ...NUE],
  // Le print d adresse, qui lit les octets du scan : passe (run4).
  nue_print_adresse: [...TETE, 'for a in adresses:', "    print('ADRESSE', ''.join('%02x' % o for o in a))", ...NUE],
  // Du calcul pur, sans port serie : si ca repare, c est le TEMPS, pas le serie.
  nue_calcul: [...TETE, 'x = 0', 'for k in range(20000):', '    x += k', ...NUE],
};

for (const [nom, lignes] of Object.entries(VARIANTES)) {
  const script = [...lignes, "print('KX_DONE')", ''].join('\n');
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
  console.log(`===== ${nom} : ${ok} bonnes, ${serial.includes('Traceback') ? 'EXCEPTION' : '-'}`);
}
process.exit(0);
