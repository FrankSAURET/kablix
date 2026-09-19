import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwarePico } from './scripts/_firmware.mjs';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kx-b4-'));
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
const ADRESSE = ['for a in adresses:', "    print('ADRESSE', ''.join('%02x' % o for o in a))"];
const BOUCLE_TRY = [
  'for i in range(3):', '    try:',
  '        capteurs.convert_temp()', '        time.sleep(0.8)',
  '        for a in adresses:', "            print('T', capteurs.read_temp(a))",
  '    except Exception as e:', "        print('RATEE', e)",
];
const BOUCLE_NUE = [
  'for i in range(3):',
  '    capteurs.convert_temp()', '    time.sleep(0.8)',
  '    for a in adresses:', "        print('T', capteurs.read_temp(a))",
];

const VARIANTES = {
  // Le banc officiel, a la lettre.
  banc_exact: [...TETE, ...ADRESSE, ...BOUCLE_TRY],
  // Le banc SANS le print d adresse : isole l effet du trafic serie.
  banc_sans_adresse: [...TETE, ...BOUCLE_TRY],
  // Le banc SANS le try/except : isole l effet du filet.
  banc_sans_try: [...TETE, ...ADRESSE, ...BOUCLE_NUE],
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
  const rate = (serial.match(/RATEE/g) ?? []).length;
  console.log(`\n===== ${nom} : ${ok} bonnes, ${rate} ratees, ${serial.includes('Traceback') ? 'EXCEPTION' : '-'} (${((Date.now()-t0)/1000).toFixed(1)} s)`);
  console.log(serial.split('\n').slice(0, 12).join('\n'));
}
process.exit(0);
