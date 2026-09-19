import esbuild from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARTES_PICO, firmwarePico } from './scripts/_firmware.mjs';

const root = 'c:/- VS Code/Extensions/Kablix/';
const tmp = mkdtempSync(join(tmpdir(), 'kx-b2-'));
const out = join(tmp, 'all.mjs');
await esbuild.build({ entryPoints: [root + '_bind_src.mts'], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const K = await import(pathToFileURL(out).href);

// Script de Frank, boucle bornee, SANS projix : capteur pose a la main sur GP14.
const SCRIPT = readFileSync(root + 'testkablix/ds18b20-pico.py', 'utf8')
  .replace('while True:', 'for _kx in range(3):') + "\nprint('KX_DONE')\n";

const carte = CARTES_PICO[0];
const fw = firmwarePico(carte.prefixe);
const segments = K.parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
const engine = new K.PicoEngine({ kind: 'flash', segments, script: SCRIPT }, carte.famille);
engine.setDs18b20([{ id: 'Capt1', pin: 'GP14', temperatureC: 23.5 }]);
let serial = '';
engine.onSerial = (c) => { serial += c; };
engine.start();
const t0 = Date.now();
await new Promise((res) => {
  const it = setInterval(() => {
    if (!serial.includes('KX_DONE') && (Date.now() - t0) < 60000) return;
    clearInterval(it); engine.dispose(); res();
  }, 500);
});
console.log(serial);
