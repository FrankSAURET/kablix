// Chaînage NeoPixel (WS2812) : plusieurs composants câblés en série DOUT → DIN
// se partagent UNE trame. Avant la v2026.7.202, seul le composant dont le DIN
// touchait la broche MCU était reconnu : les suivants restaient éteints, et
// celui de tête affichait la couleur destinée à ses voisins — d'où la LED qui
// « clignote » quand le programme fait tourner un point lumineux sur la chaîne
// (repro Frank : testkablix/neopixel-pico.projix, 3 pixels sur GP0).
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-npc-'));
async function load(entry, name) {
  const out = join(tmp, name);
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

const { neopixelBindings } = await load('src/webview/diagram/model.mts', 'model.mjs');
const { Ws2812Decoder } = await load('src/webview/engines/ws2812.mts', 'ws2812.mjs');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

const wire = (i, a, ap, b, bp) => ({ id: `w${i}`, a: { partId: a, pin: ap }, b: { partId: b, pin: bp } });

// --- 1. Trois pixels en série sur GP0 ---------------------------------------
const chain3 = {
  parts: [
    { id: 'pico', type: 'pico', x: 0, y: 0 },
    { id: 'n1', type: 'neopixel', x: 0, y: 0 },
    { id: 'n2', type: 'neopixel', x: 0, y: 0 },
    { id: 'n3', type: 'neopixel', x: 0, y: 0 },
  ],
  wires: [
    wire(1, 'n1', 'DIN', 'pico', 'GP0'),
    wire(2, 'n1', 'DOUT', 'n2', 'DIN'),
    wire(3, 'n2', 'DOUT', 'n3', 'DIN'),
  ],
};
const b3 = neopixelBindings(chain3);
const at = (bs, id) => bs.find((b) => b.partId === id);
check('chaîne de 3 pixels : les 3 composants sont reconnus', b3.length === 3, JSON.stringify(b3));
check('chaîne de 3 pixels : tous sur la même broche GP0',
  b3.every((b) => b.mcuPin === 'GP0'), JSON.stringify(b3.map((b) => b.mcuPin)));
check('chaîne de 3 pixels : rangs 0, 1, 2 dans l ordre du câblage',
  at(b3, 'n1')?.offset === 0 && at(b3, 'n2')?.offset === 1 && at(b3, 'n3')?.offset === 2,
  JSON.stringify(b3.map((b) => [b.partId, b.offset])));

// --- 2. Chaîne mixte : pixel → anneau 16 → matrice 8×8 ----------------------
const mixed = {
  parts: [
    { id: 'pico', type: 'pico', x: 0, y: 0 },
    { id: 'px', type: 'neopixel', x: 0, y: 0 },
    { id: 'ring', type: 'led-ring', x: 0, y: 0, attrs: { pixels: '16' } },
    { id: 'mat', type: 'neopixel-matrix', x: 0, y: 0, attrs: { rows: '8', cols: '8' } },
  ],
  wires: [
    wire(1, 'px', 'DIN', 'pico', 'GP2'),
    wire(2, 'px', 'DOUT', 'ring', 'DIN'),
    wire(3, 'ring', 'DOUT', 'mat', 'DIN'),
  ],
};
const bm = neopixelBindings(mixed);
check('chaîne mixte : le rang tient compte de la TAILLE de chaque maillon',
  at(bm, 'px')?.offset === 0 && at(bm, 'ring')?.offset === 1 && at(bm, 'mat')?.offset === 17,
  JSON.stringify(bm.map((b) => [b.partId, b.offset, b.count])));
const total = Math.max(...bm.map((b) => b.offset + b.count));
check('chaîne mixte : longueur totale de la trame = 1 + 16 + 64', total === 81, String(total));

// --- 3. Deux chaînes distinctes : chacune repart à 0 -------------------------
const twoStrips = {
  parts: [
    { id: 'pico', type: 'pico', x: 0, y: 0 },
    { id: 'a1', type: 'neopixel', x: 0, y: 0 },
    { id: 'a2', type: 'neopixel', x: 0, y: 0 },
    { id: 'b1', type: 'neopixel', x: 0, y: 0 },
    { id: 'solo', type: 'neopixel', x: 0, y: 0 }, // DIN en l'air : ignoré
  ],
  wires: [
    wire(1, 'a1', 'DIN', 'pico', 'GP0'),
    wire(2, 'a1', 'DOUT', 'a2', 'DIN'),
    wire(3, 'b1', 'DIN', 'pico', 'GP5'),
  ],
};
const bt = neopixelBindings(twoStrips);
check('deux chaînes : les rangs sont propres à chaque broche',
  at(bt, 'a1')?.offset === 0 && at(bt, 'a2')?.offset === 1 &&
  at(bt, 'b1')?.offset === 0 && at(bt, 'b1')?.mcuPin === 'GP5',
  JSON.stringify(bt.map((b) => [b.partId, b.mcuPin, b.offset])));
check('composant dont le DIN n est relié à rien : aucun binding', !at(bt, 'solo'), JSON.stringify(bt));

// --- 4. Câblage en boucle : pas de parcours infini ---------------------------
const loop = {
  parts: [
    { id: 'pico', type: 'pico', x: 0, y: 0 },
    { id: 'l1', type: 'neopixel', x: 0, y: 0 },
    { id: 'l2', type: 'neopixel', x: 0, y: 0 },
  ],
  wires: [
    wire(1, 'l1', 'DIN', 'pico', 'GP0'),
    wire(2, 'l1', 'DOUT', 'l2', 'DIN'),
    wire(3, 'l2', 'DOUT', 'l1', 'DIN'), // boucle refermée sur la tête
  ],
};
const bl = neopixelBindings(loop);
check('câblage en boucle : chaque composant compté une seule fois',
  bl.length === 2 && new Set(bl.map((b) => b.partId)).size === 2, JSON.stringify(bl));

// --- 5. Bout en bout : une trame de 3 LED, découpée par les rangs ------------
// Fronts WS2812 synthétiques (800 kHz, 125 MHz de cœur) : T1H = 0,8 µs,
// T0H = 0,4 µs, période 1,25 µs. Le décodeur classe par HAUT > BAS.
const CPU_MHZ = 125;
const dec = new Ws2812Decoder(3, CPU_MHZ);
let t = 40 * CPU_MHZ; // long BAS initial = reset de trame
const sendBit = (bit) => {
  dec.edge(t, true);
  t += Math.round((bit ? 0.8 : 0.4) * CPU_MHZ);
  dec.edge(t, false);
  t += Math.round((bit ? 0.45 : 0.85) * CPU_MHZ);
};
const sendColor = ({ r, g, b }) => {
  const bits = (g << 16) | (r << 8) | b;
  for (let i = 23; i >= 0; i--) sendBit((bits >> i) & 1);
};
const frame = [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }];
frame.forEach(sendColor);
dec.flush();
const colors = dec.colors.map((c) => ({ r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) }));
check('décodeur : les 3 couleurs de la trame sortent dans l ordre',
  JSON.stringify(colors) === JSON.stringify(frame), JSON.stringify(colors));
// Découpage tel que le fait sim.mts : chaque composant lit sa tranche.
// Binding absent ou sans rang (code d'avant le correctif) : tranche vide, le
// contrôle échoue au lieu de faire planter le banc.
const slice = (id) => {
  const b = at(b3, id);
  if (!b || typeof b.offset !== 'number') return [];
  return colors.slice(b.offset, b.offset + b.count);
};
check('tranches : chaque pixel de la chaîne reçoit SA couleur (plus de clignotement)',
  JSON.stringify(slice('n1')) === JSON.stringify([frame[0]]) &&
  JSON.stringify(slice('n2')) === JSON.stringify([frame[1]]) &&
  JSON.stringify(slice('n3')) === JSON.stringify([frame[2]]),
  JSON.stringify([slice('n1'), slice('n2'), slice('n3')]));

// --- 6. Câblage de sim.mts : un décodeur par broche, tranche à l'affichage ---
const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
check('sim : UN décodeur par broche, long de toute la chaîne',
  /perPin[\s\S]{0,200}Math\.max\([\s\S]{0,60}offset \+ b\.count\)/.test(sim) &&
  /setNeopixels\?\.\(\[\.\.\.perPin\]/.test(sim),
  'agrégat par broche introuvable dans setNeopixels');
check('sim : chaque composant affiche SA tranche de la trame',
  /\.slice\(t\.offset, t\.offset \+ t\.count\)/.test(sim), 'découpage introuvable dans refreshVisuals');

// --- 7. Le schéma de test de Frank, tel qu'il est sur le disque --------------
const projix = join(root, 'testkablix', 'neopixel-pico.projix');
if (existsSync(projix)) {
  const zip = await JSZip.loadAsync(readFileSync(projix));
  const diagram = JSON.parse(await zip.files['diagram.json'].async('string'));
  const bp = neopixelBindings(diagram);
  const offs = bp.map((b) => b.offset).sort((x, y) => x - y);
  check('neopixel-pico.projix : les 3 pixels chaînés sont tous reconnus sur GP0',
    bp.length === 3 && bp.every((b) => b.mcuPin === 'GP0') && JSON.stringify(offs) === '[0,1,2]',
    JSON.stringify(bp));
} else {
  console.log('ℹ️ testkablix/neopixel-pico.projix absent — contrôle du schéma réel sauté.');
}

console.log(failures ? `npchain : ${failures} échec(s).` : 'npchain : tous les contrôles passent — chaînage DOUT → DIN suivi.');
process.exit(failures ? 1 : 0);
