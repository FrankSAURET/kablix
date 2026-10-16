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
import { tk } from '../testkablix/_paths.mjs';

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

const { neopixelBindings, spiStripBindings } = await load('src/webview/diagram/model.mts', 'model.mjs');
const { Ws2812Decoder } = await load('src/webview/engines/ws2812.mts', 'ws2812.mjs');
const { SpiLedStripDevice } = await load('src/webview/engines/spi-led-strip.mts', 'spi-led-strip.mjs');

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

// --- 3b. Ruban de LED (led-strip) : compte ses LED, un fil seulement ---------
const rubans = {
  parts: [
    { id: 'pico', type: 'pico', x: 0, y: 0 },
    { id: 'r1', type: 'led-strip', x: 0, y: 0, attrs: { leds: '30', protocol: 'ws2812' } },
    { id: 'r2', type: 'led-strip', x: 0, y: 0 }, // attributs absents : 10 LED, un fil
    { id: 'spi', type: 'led-strip', x: 0, y: 0, attrs: { leds: '20', protocol: 'apa102' } },
    { id: 'w11', type: 'led-strip', x: 0, y: 0, attrs: { leds: '5', protocol: 'ws2811' } },
    { id: 'w01', type: 'led-strip', x: 0, y: 0, attrs: { leds: '8', protocol: 'ws2801', colorOrder: 'grb' } },
    { id: 'demi', type: 'led-strip', x: 0, y: 0, attrs: { leds: '8', protocol: 'ws2801' } }, // CI en l'air
  ],
  wires: [
    wire(1, 'r1', 'DIN', 'pico', 'GP0'),
    wire(2, 'r2', 'DIN', 'pico', 'GP1'),
    wire(3, 'spi', 'DI', 'pico', 'GP3'),
    wire(4, 'spi', 'CI', 'pico', 'GP2'),
    wire(5, 'w11', 'DIN', 'pico', 'GP6'),
    wire(6, 'w01', 'DI', 'pico', 'GP7'),
    wire(7, 'w01', 'CI', 'pico', 'GP8'),
    wire(8, 'demi', 'DI', 'pico', 'GP9'),
  ],
};
const br = neopixelBindings(rubans);
check('ruban un fil : 30 LED sur GP0', at(br, 'r1')?.count === 30 && at(br, 'r1')?.mcuPin === 'GP0', JSON.stringify(br));
check('ruban sans attributs : 10 LED', at(br, 'r2')?.count === 10, JSON.stringify(br));
check('ruban SPI : pas de décodage un fil', !at(br, 'spi') && !at(br, 'w01'), JSON.stringify(br));
check('WS2812(B) : ordre GRB, pause 300 µs', at(br, 'r1')?.order === 'grb' && at(br, 'r1')?.resetUs === 300, JSON.stringify(br));
check('WS2811 : ordre RGB, pause 300 µs', at(br, 'w11')?.order === 'rgb' && at(br, 'w11')?.resetUs === 300, JSON.stringify(br));
check('composant NeoPixel ordinaire : défauts du décodeur (30 µs)', !at(neopixelBindings(chain3), 'n1').resetUs);
const sb = spiStripBindings(rubans);
const sat = (id) => sb.find((s) => s.partId === id);
check('rubans SPI branchés : APA102 et WS2801 reconnus', sb.length === 2 && sat('spi')?.protocol === 'apa102' && sat('w01')?.protocol === 'ws2801', JSON.stringify(sb));
check('WS2801 : ordre des couleurs lu (grb), APA102 en rgb', sat('w01')?.order === 'grb' && sat('spi')?.order === 'rgb', JSON.stringify(sb));
check('ruban SPI dont CI n est pas câblé : ignoré', !sat('demi'), JSON.stringify(sb));

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

// --- 5b. Ordre des couleurs et pause de fin de trame ------------------------
const rgbVers = (c) => ({ r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) });
{
  const envoi = (decodeur, octets, depart) => {
    let tt = depart;
    const bit = (v) => {
      decodeur.edge(tt, true);
      tt += Math.round((v ? 0.8 : 0.4) * CPU_MHZ);
      decodeur.edge(tt, false);
      tt += Math.round((v ? 0.45 : 0.85) * CPU_MHZ);
    };
    for (const o of octets) for (let i = 7; i >= 0; i--) bit((o >> i) & 1);
    return tt;
  };
  const d11 = new Ws2812Decoder(1, CPU_MHZ, 'rgb', 300);
  envoi(d11, [10, 20, 30], 400 * CPU_MHZ);
  d11.flush();
  check('WS2811 : octets lus dans l ordre RGB', JSON.stringify(rgbVers(d11.colors[0])) === '{"r":10,"g":20,"b":30}', JSON.stringify(rgbVers(d11.colors[0])));
  const d12 = new Ws2812Decoder(1, CPU_MHZ, 'grb', 300);
  envoi(d12, [10, 20, 30], 400 * CPU_MHZ);
  d12.flush();
  check('WS2812 : octets lus dans l ordre GRB', JSON.stringify(rgbVers(d12.colors[0])) === '{"r":20,"g":10,"b":30}', JSON.stringify(rgbVers(d12.colors[0])));
  // Deux LED d'une même trame séparées par 100 µs : sous 300 µs, la 2e continue la trame.
  const dp = new Ws2812Decoder(2, CPU_MHZ, 'grb', 300);
  let tp = envoi(dp, [0, 255, 0], 400 * CPU_MHZ);
  tp += 100 * CPU_MHZ;
  envoi(dp, [255, 0, 0], tp);
  dp.flush();
  check('pause 300 µs : un BAS de 100 µs ne coupe pas la trame (2 LED)',
    dp.colors[0].r === 1 && dp.colors[1].g === 1, JSON.stringify(dp.colors));
  // Pause de 400 µs : nouvelle trame, la LED 0 est réécrite.
  const dq = new Ws2812Decoder(2, CPU_MHZ, 'grb', 300);
  let tq = envoi(dq, [0, 255, 0], 400 * CPU_MHZ);
  tq += 400 * CPU_MHZ;
  envoi(dq, [255, 0, 0], tq);
  dq.flush();
  check('pause 300 µs : un BAS de 400 µs ouvre une trame (LED 0 réécrite)',
    dq.colors[0].g === 1 && dq.colors[0].r === 0 && dq.colors[1].r === 0 && dq.colors[1].g === 0, JSON.stringify(dq.colors));
}

// --- 5c. Rubans SPI : APA102 et WS2801 ---------------------------------------
{
  const apa = new SpiLedStripDevice(2, 'apa102');
  for (const o of [0, 0, 0, 0, 0xff, 255, 0, 0, 0xe0 | 16, 0, 0, 255, 0xff, 0xff, 0xff, 0xff]) apa.transfer(o, false);
  check('APA102 : LED 0 bleu plein, luminosité 31/31', rgbVers(apa.colors[0]).b === 255 && apa.colors[0].r === 0, JSON.stringify(apa.colors));
  const lum = apa.colors[1].r * 255;
  check('APA102 : LED 1 rouge à luminosité 16/31 (≈ 132)', Math.abs(lum - (255 * 16) / 31) < 0.01 && apa.colors[1].g === 0, JSON.stringify(apa.colors));
  const apa2 = new SpiLedStripDevice(1, 'apa102');
  for (const o of [0, 0, 0, 0, 0xff, 0, 255, 0]) apa2.transfer(o, false);
  for (const o of [0, 0, 0, 0, 0xe0 | 31, 0, 0, 255]) apa2.transfer(o, false); // 2e trame : début remet à 0
  check('APA102 : la trame de début remet la LED 0 à jour', apa2.colors[0].r === 1 && apa2.colors[0].g === 0, JSON.stringify(apa2.colors));
  const w = new SpiLedStripDevice(2, 'ws2801', 'rgb');
  let us = 1000;
  for (const o of [255, 0, 0, 0, 255, 0]) w.transfer(o, false, (us += 2));
  check('WS2801 RVB : rouge puis vert', w.colors[0].r === 1 && w.colors[1].g === 1, JSON.stringify(w.colors));
  us += 600; // pause > 500 µs : nouvelle trame
  for (const o of [0, 0, 255]) w.transfer(o, false, (us += 2));
  check('WS2801 : pause > 500 µs, la LED 0 est réécrite (bleu)', w.colors[0].b === 1 && w.colors[0].r === 0 && w.colors[1].g === 1, JSON.stringify(w.colors));
  const wb = new SpiLedStripDevice(1, 'ws2801', 'brg');
  [0, 255, 0].forEach((o, i) => wb.transfer(o, false, 5000 + i));
  check('WS2801 BRV : 1er octet = bleu, 2e = rouge', wb.colors[0].r === 1 && wb.colors[0].b === 0, JSON.stringify(wb.colors));
  const wg = new SpiLedStripDevice(1, 'ws2801', 'grb');
  [0, 255, 0].forEach((o, i) => wg.transfer(o, false, 9000 + i));
  check('WS2801 VRB : 1er octet = vert, 2e = rouge', wg.colors[0].r === 1 && wg.colors[0].g === 0, JSON.stringify(wg.colors));
}

// --- 6. Câblage de sim.mts : un décodeur par broche, tranche à l'affichage ---
const sim = readFileSync(join(root, 'src/webview/sim.mts'), 'utf8');
check('sim : UN décodeur par broche, long de toute la chaîne',
  /perPin[\s\S]{0,400}Math\.max\([\s\S]{0,60}offset \+ b\.count\)/.test(sim) &&
  /\.\.\.perPin\.values\(\)/.test(sim) && /setNeopixels\?\.\(strips\)/.test(sim),
  'agrégat par broche introuvable dans setNeopixels');
check('sim : chaque composant affiche SA tranche de la trame',
  /\.slice\(t\.offset, t\.offset \+ t\.count\)/.test(sim), 'découpage introuvable dans refreshVisuals');

// --- 7. Le schéma de test de Frank, tel qu'il est sur le disque --------------
const projix = tk('neopixel-pico.projix');
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

// Même chaîne, côté ARDUINO (repro Frank : « neopixel-uno, si je chaîne 3 LED
// seule la première s'allume »). Le chaînage se résout dans `model.mts`, commun
// aux deux moteurs : le correctif de la v202 vaut donc aussi pour l'Uno, et ce
// contrôle l'atteste sur le vrai fichier au lieu de le supposer.
const unoProjix = tk('neopixel-uno/neopixel-uno.projix');
if (existsSync(unoProjix)) {
  const zip = await JSZip.loadAsync(readFileSync(unoProjix));
  const diagram = JSON.parse(await zip.files['diagram.json'].async('string'));
  const bp = neopixelBindings(diagram);
  const offs = bp.map((b) => b.offset).sort((x, y) => x - y);
  const pin = bp[0]?.mcuPin;
  check('neopixel-uno.projix : les 3 pixels chaînés sont tous reconnus sur la même broche',
    bp.length === 3 && bp.every((b) => b.mcuPin === pin) && JSON.stringify(offs) === '[0,1,2]',
    JSON.stringify(bp));
  check('neopixel-uno.projix : la broche est bien une broche numérique de l’Uno (D6 du sketch)',
    pin === '6', String(pin));
} else {
  console.log('ℹ️ testkablix/neopixel-uno/neopixel-uno.projix absent — contrôle du schéma réel sauté.');
}

console.log(failures ? `npchain : ${failures} échec(s).` : 'npchain : tous les contrôles passent — chaînage DOUT → DIN suivi.');
process.exit(failures ? 1 : 0);
