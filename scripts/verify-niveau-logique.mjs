// Banc du badge « Niveau logique » : `pontsNiveauLogique` reconnaît un signal
// 5 V (sortie de capteur alimenté en 5 V, alimentation de laboratoire) lu par
// une carte 3,3 V à travers un pont diviseur — et rien d'autre.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-niveau-logique');
mkdirSync(CACHE, { recursive: true });

let ok = 0;
const fails = [];
const check = (cond, label) => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}`);
  }
};

const out = join(CACHE, 'model.mjs');
await esbuild({ entryPoints: [join(ROOT, 'src/webview/diagram/model.mts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const m = await import(pathToFileURL(out).href + `?t=${Date.now()}`);

let k = 0;
const w = (a, pa, b, pb) => ({ id: `w${k++}`, a: { partId: a, pin: pa }, b: { partId: b, pin: pb } });
/**
 * Capteur PIR alimenté en `vcc` (broche de la carte), sortie → R1 → nœud → R2 → masse,
 * nœud → GP15. `direct` : sortie câblée sans pont ; `sansAlim` : VCC en l'air.
 */
const montage = ({ carte = 'pico', vcc = 'VBUS', r1 = '1000', r2 = '2000', direct = false, sansAlim = false } = {}) => {
  k = 0;
  const parts = [
    { id: 'B', type: carte, x: 0, y: 0 },
    { id: 'S', type: 'pir', x: 0, y: 0 },
    { id: 'R1', type: 'resistor', x: 0, y: 0, attrs: { value: r1 } },
    { id: 'R2', type: 'resistor', x: 0, y: 0, attrs: { value: r2 } },
  ];
  const pin = carte === 'pico' ? 'GP15' : '7';
  const gnd = carte === 'pico' ? 'GND.1' : 'GND.1';
  const wires = [w('S', 'GND', 'B', gnd)];
  if (!sansAlim) wires.push(w('S', 'VCC', 'B', vcc));
  if (direct) wires.push(w('S', 'OUT', 'B', pin));
  else wires.push(w('S', 'OUT', 'R1', '1'), w('R1', '2', 'R2', '1'), w('R1', '2', 'B', pin), w('R2', '2', 'B', gnd));
  return { parts, wires };
};

const ponts = (d) => m.pontsNiveauLogique(d);

{
  const p = ponts(montage());
  check(p.length === 1, `PIR 5 V + pont 1k/2k sur un Pico : un pont reconnu (${p.length})`);
  check(p[0]?.mcuPin === 'GP15' && p[0]?.amont === 5, `broche GP15, 5 V en amont (${JSON.stringify(p[0])})`);
  check(Math.abs((p[0]?.aval ?? 0) - 10 / 3) < 0.01, `3,33 V reçus (${p[0]?.aval})`);
}
check(ponts(montage({ direct: true })).length === 0, 'sortie 5 V câblée en direct : pas un pont');
check(ponts(montage({ r1: '1000', r2: '10000' })).length === 0, 'pont trop faible (4,5 V reçus) : rien');
check(ponts(montage({ r1: '10000', r2: '1000' })).length === 0, 'pont trop fort (0,45 V : jamais haut) : rien');
check(ponts(montage({ sansAlim: true })).length === 0, 'capteur non alimenté : rien');
check(ponts(montage({ vcc: '3V3' })).length === 0, 'capteur en 3,3 V : rien à abaisser');
check(ponts(montage({ carte: 'uno', vcc: '5V' })).length === 0, 'Arduino Uno (5 V tolérés) : rien');

console.log(`verify:niveau-logique — ${ok} contrôles OK, ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
