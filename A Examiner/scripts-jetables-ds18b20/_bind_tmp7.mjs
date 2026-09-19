import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwarePico } from './scripts/_firmware.mjs';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kx-b7-'));
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

const CAS = {
  casse: [...TETE, ...NUE],
  passe: [...TETE, 'x = 0', 'for k in range(20000):', '    x += k', ...NUE],
};

for (const [nom, lignes] of Object.entries(CAS)) {
  const script = [...lignes, "print('KX_DONE')", ''].join('\n');
  const engine = new K.PicoEngine({ kind: 'flash', segments, script }, carte.famille);
  engine.setDs18b20([{ id: 'Capt1', pin: 'GP14', temperatureC: 23.5 }]);
  // Espionner l automate : on enveloppe frontMontant pour relever les durees.
  const d = engine.ds18b20[0];
  const durees = [];
  let derniereDescente = -1;
  const fd = d.auto.frontDescendant.bind(d.auto);
  const fm = d.auto.frontMontant.bind(d.auto);
  d.auto.frontDescendant = (c) => { derniereDescente = c; return fd(c); };
  d.auto.frontMontant = (c) => {
    if (derniereDescente >= 0) durees.push((c - derniereDescente) / 1000);
    return fm(c);
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
  // Repartition des durees de BAS (us), hors resets.
  const bits = durees.filter((u) => u < 200);
  const uns = bits.filter((u) => u < 55).length;
  const zeros = bits.filter((u) => u >= 55).length;
  const zone = bits.filter((u) => u >= 20 && u < 80).sort((a,b)=>a-b);
  console.log(`\n===== ${nom} : ${(serial.match(/T 23\.5/g)??[]).length} bonnes, ${serial.includes('Traceback')?'EXCEPTION':'-'}`);
  console.log(`  creneaux < 200us : ${bits.length} | classes "1" (<55) : ${uns} | classes "0" (>=55) : ${zeros}`);
  console.log(`  max d un "1" suppose : ${Math.max(...bits.filter(u=>u<55), 0).toFixed(1)} us`);
  console.log(`  min d un "0" suppose : ${Math.min(...bits.filter(u=>u>=55), 999).toFixed(1)} us`);
  console.log(`  creneaux dans la zone grise 20-80us : ${zone.length} -> ${zone.slice(0,25).map(u=>u.toFixed(0)).join(' ')}`);
}
process.exit(0);
