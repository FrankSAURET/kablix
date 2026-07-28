// Fabrique testkablix/horloge-uno/horloge-uno.projix : même schéma que
// Horloge.projix (Pico) transposé sur Uno. Segments a..g = D2..D8, chiffres
// DIG1..DIG4 = D10..D13, les 2 points (DP) tirés au 3,3 V par une résistance.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'testkablix', 'horloge-uno');

// Afficheur 4 chiffres : 200x90, broches en x = +70..+120, y = +10 (haut) / +80 (bas).
const SEG = { x: 400, y: 120 };
const UNO = { x: 60, y: 420 };

const parts = [
  { id: 'uno-1', type: 'uno', x: UNO.x, y: UNO.y },
  {
    id: '7seg-2', type: '7seg', x: SEG.x, y: SEG.y,
    attrs: { color: 'red', common: 'cathode', digits: '4', colon: 'true' },
  },
];
// Une résistance de 100 Ω par segment (a..g) + une pour les deux points.
// Les segments du haut (A, B, F) prennent les résistances du haut, ceux du bas
// (C, D, E, G) et le DP celles du bas.
const HAUT = ['A', 'B', 'F'];
const BAS = ['C', 'D', 'E', 'G', 'DP'];
const resOf = {};
let n = 3;
HAUT.forEach((seg, i) => {
  const id = `resistor-${n++}`;
  resOf[seg] = id;
  parts.push({ id, type: 'resistor', x: 260, y: 20 + i * 30, attrs: { value: '100' } });
});
BAS.forEach((seg, i) => {
  const id = `resistor-${n++}`;
  resOf[seg] = id;
  parts.push({ id, type: 'resistor', x: 260, y: 250 + i * 30, attrs: { value: '100' } });
});

// Broche Uno de chaque segment : a..g = D2..D8 (ordre du sketch).
const SEG_PIN = { A: '2', B: '3', C: '4', D: '5', E: '6', F: '7', G: '8' };
const COLORS = ['orange', 'yellow', 'green', 'blue', 'purple', 'gray', 'fuchsia', 'brown'];

const wires = [];
let w = 20;
const wire = (a, ap, b, bp, color) => {
  wires.push({ id: `w-${w++}`, a: { partId: a, pin: ap }, b: { partId: b, pin: bp }, color });
};
[...HAUT, ...BAS].forEach((seg, i) => {
  const r = resOf[seg];
  wire(r, '2', '7seg-2', seg, COLORS[i % COLORS.length]);           // résistance → segment
  if (seg === 'DP') wire(r, '1', 'uno-1', '3.3V', 'red');           // les 2 points : rail 3,3 V
  else wire(r, '1', 'uno-1', SEG_PIN[seg], COLORS[i % COLORS.length]);
});
// Communs des 4 chiffres.
for (let d = 1; d <= 4; d++) wire('7seg-2', `DIG${d}`, 'uno-1', String(9 + d), COLORS[d % COLORS.length]);

const diagram = { parts, wires, camera: { zoom: 1, panX: 0, panY: 0 }, customParts: [] };
const meta = {
  format: 'projix',
  version: 1,
  app: '2026.7.216',
  board: 'uno',
  createdAt: new Date().toISOString(),
  codeFile: 'horloge-uno/horloge-uno.ino',
  codeFileAbs: join(root, 'testkablix', 'horloge-uno', 'horloge-uno.ino'),
};

const zip = new JSZip();
zip.file('kablix.json', JSON.stringify(meta, null, 2));
zip.file('diagram.json', JSON.stringify(diagram));
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(join(dir, 'horloge-uno.projix'), buf);
console.log('écrit :', join(dir, 'horloge-uno.projix'), buf.length, 'octets');
