// Projets démonstrateurs de la vue 3D (piste 11, lot D6e).
//
// Fabrique, dans docs/exemples/mecanique/, deux projets .projix avec leur
// document système (`system.json`) et leur programme Arduino :
//   • bras-servo-aimant : le schéma du test aimant-uno (servo Act1, aimant A1
//     fixé au palonnier, capteur à effet Hall Capt1), en 3D le servo et
//     l'aimant qui tourne avec le palonnier ;
//   • robot-deux-roues : deux moteurs commandés chacun par un PN2222A avec
//     diode de roue libre, en 3D le robot de `docs/bibliotheque.md` de
//     Kompix Editor (châssis, deux motoréducteurs, deux roues, sol).
//
// Les pièces 3D sont les paquets mécaniques de Kompix Editor (`servo`,
// `aimant`, `moteur-dc`, `roue`, `chassis-2-roues`) : ils doivent être dans la
// bibliothèque de composants pour que la vue montre leur volume.
//
// Usage : node scripts/_exemples-meca.mjs   (réécrit les deux dossiers)
import JSZip from 'jszip';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(ROOT, 'docs/exemples/mecanique');
const app = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const pose = (x, y, z, rz = 0) => ({ pos: { x, y, z }, rot: { x: 0, y: 0, z: rz } });

/** Pavé en STL ASCII (12 facettes), de (x0, y0, z0) à (x1, y1, z1). */
function pave(nom, [x0, y0, z0], [x1, y1, z1]) {
  const v = (x, y, z) => `vertex ${x} ${y} ${z}`;
  const f = (n, a, b, c) => `facet normal ${n}\nouter loop\n${v(...a)}\n${v(...b)}\n${v(...c)}\nendloop\nendfacet`;
  const P = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const quad = (n, a, b, c, d) => [f(n, P(a), P(b), P(c)), f(n, P(a), P(c), P(d))];
  return [`solid ${nom}`,
    ...quad('0 0 -1', 0, 2, 3, 1), ...quad('0 0 1', 4, 5, 7, 6),
    ...quad('0 -1 0', 0, 1, 5, 4), ...quad('0 1 0', 2, 6, 7, 3),
    ...quad('-1 0 0', 0, 4, 6, 2), ...quad('1 0 0', 1, 3, 7, 5),
    `endsolid ${nom}`, ''].join('\n');
}

async function ecrire(nom, { diagram, system, systemFiles = [], code }) {
  const dossier = join(SORTIE, nom);
  mkdirSync(dossier, { recursive: true });
  const zip = new JSZip();
  // Même disposition que packProject (src/projix.ts) ; le programme est
  // retrouvé à côté du projet (référence relative au dossier du .projix).
  zip.file('kablix.json', JSON.stringify({
    format: 'projix', version: 1, app, board: 'uno', createdAt: '2026-11-24T00:00:00.000Z', codeFile: `${nom}.ino`,
  }, null, 2));
  zip.file('diagram.json', JSON.stringify(diagram, null, 2));
  zip.file('system.json', JSON.stringify(system, null, 2));
  for (const f of systemFiles) zip.file('system/' + f.path, f.data);
  // Date fixe : le .projix ne change pas d'octets d'une génération à l'autre.
  for (const f of Object.values(zip.files)) f.date = new Date('2026-11-24T00:00:00Z');
  writeFileSync(join(dossier, `${nom}.projix`), await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
  writeFileSync(join(dossier, `${nom}.ino`), code);
  console.log(`✓ ${nom}`);
}

const fil = (id, a, pa, b, pb, color, points) => ({ id, a: { partId: a, pin: pa }, b: { partId: b, pin: pb }, color, ...(points ? { points } : {}) });

// ------------------------------------------------ bras servo + aimant
await ecrire('bras-servo-aimant', {
  diagram: {
    parts: [
      { id: 'U1', type: 'uno', x: 40, y: 60 },
      { id: 'Act1', type: 'servo', x: 620, y: 80, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } },
      { id: 'A1', type: 'aimant', x: 685, y: 80, attrs: { mount: 'Act1' } },
      { id: 'Capt1', type: 'hall', x: 740, y: 135, attrs: { text: 'A3144', vplus: '1', gnd: '2', s: '3' } },
      { id: 'R1', type: 'resistor', x: 500, y: 60, attrs: { value: '10000' } },
    ],
    wires: [
      fil('w1', 'Act1', 'V+', 'U1', '5V', 'red'),
      fil('w2', 'Act1', 'GND', 'U1', 'GND.1', 'black'),
      fil('w3', 'Act1', 'PWM', 'U1', '9', 'orange'),
      fil('w4', 'Capt1', 'V+', 'U1', '5V', 'red'),
      fil('w5', 'Capt1', 'GND', 'U1', 'GND.1', 'black'),
      fil('w6', 'Capt1', 'S', 'U1', '2', 'yellow'),
      fil('w7', 'R1', '1', 'Capt1', 'S', 'orange'),
      fil('w8', 'R1', '2', 'U1', '5V', 'red'),
    ],
    customParts: [],
  },
  system: {
    format: 'kablix-system',
    version: 1,
    pieces: [
      { id: 'servo', nom: 'servo:Act1', source: { kind: 'kompix', type: 'servo' }, pose: pose(0, 0, 0) },
      // Aimant à 20 mm de l'axe, sur le palonnier : tourne avec lui.
      { id: 'aimant', nom: 'aimant:A1', source: { kind: 'kompix', type: 'aimant' }, pose: pose(20, 0, 30.7) },
    ],
    liaisons: [
      { id: 'Palonnier', type: 'pivot', a: { piece: 'aimant', axe: 'pose' }, b: { piece: 'servo', axe: 'horn' }, params: { min: 0, max: 180 } },
    ],
  },
  code: `// Démonstrateur de la vue 3D : bras servo + aimant.
// Ouvrir la vue 3D (bouton « 3D ») puis lancer la simulation : le palonnier
// tourne avec le servo et emporte l'aimant. Le capteur à effet Hall, posé en
// face de la position 90 degrés, ne voit l'aimant qu'à 90 degrés.
#include <Servo.h>

const int HALL = 2;
Servo servo;

void mesure(int angle) {
  servo.write(angle);
  delay(1000);
  bool aimant = digitalRead(HALL) == LOW;  // sortie active basse
  digitalWrite(LED_BUILTIN, aimant ? HIGH : LOW);
  Serial.print(angle);
  Serial.println(aimant ? " degres : AIMANT" : " degres : rien");
}

void setup() {
  pinMode(HALL, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  servo.attach(9);
  Serial.begin(115200);
}

void loop() {
  mesure(0);
  mesure(90);
  mesure(180);
}
`,
});

// ------------------------------------------------ robot à deux roues
// Branche gauche reprise du test moteur-dc-uno (broche 9, PN2222A, diode de
// roue libre) ; branche droite identique, décalée de 300 px (broche 10).
const DX = 300;
const decale = (pts) => pts.map((p) => ({ x: p.x + DX, y: p.y }));
const pG = {
  b: [{ x: 470, y: 270 }],
  c: [{ x: 535, y: 240 }, { x: 535, y: 220 }, { x: 570, y: 220 }],
  a: [{ x: 580, y: 220 }, { x: 570, y: 220 }],
};
await ecrire('robot-deux-roues', {
  diagram: {
    parts: [
      { id: 'U1', type: 'uno', x: 200, y: 290 },
      { id: 'Alim1', type: 'alim', x: 520, y: 390, attrs: { voltage: '5', maxcurrent: '1' } },
      { id: 'R1', type: 'resistor', x: 370, y: 260, attrs: { value: '1000' } },
      { id: 'T1', type: 'pn2222a', x: 450, y: 200 },
      { id: 'D1', type: 'diode', x: 530, y: 230, attrs: { vf: '0.6' } },
      { id: 'Act1', type: 'moteur-dc', x: 510, y: 120, attrs: { voltage: '5', current: '0.1' } },
      { id: 'R2', type: 'resistor', x: 370 + DX, y: 260, attrs: { value: '1000' } },
      { id: 'T2', type: 'pn2222a', x: 450 + DX, y: 200 },
      { id: 'D2', type: 'diode', x: 530 + DX, y: 230, attrs: { vf: '0.6' } },
      { id: 'Act2', type: 'moteur-dc', x: 510 + DX, y: 120, attrs: { voltage: '5', current: '0.1' } },
    ],
    wires: [
      fil('w1', 'R1', '1', 'U1', '9', 'green'),
      fil('w2', 'R1', '2', 'T1', 'B', 'green', pG.b),
      fil('w3', 'T1', 'E', 'Alim1', 'GND', 'black'),
      fil('w4', 'T1', 'C', 'Act1', '2', 'blue', pG.c),
      fil('w5', 'Act1', '1', 'Alim1', 'V+', 'red'),
      fil('w6', 'D1', 'K', 'Act1', '1', 'red'),
      fil('w7', 'D1', 'A', 'Act1', '2', 'purple', pG.a),
      fil('w8', 'R2', '1', 'U1', '10', 'orange'),
      fil('w9', 'R2', '2', 'T2', 'B', 'orange', decale(pG.b)),
      fil('w10', 'T2', 'E', 'Alim1', 'GND', 'black'),
      fil('w11', 'T2', 'C', 'Act2', '2', 'blue', decale(pG.c)),
      fil('w12', 'Act2', '1', 'Alim1', 'V+', 'red'),
      fil('w13', 'D2', 'K', 'Act2', '1', 'red'),
      fil('w14', 'D2', 'A', 'Act2', '2', 'purple', decale(pG.a)),
      fil('w15', 'Alim1', 'GND', 'U1', 'GND.2', 'black'),
    ],
    customParts: [],
  },
  system: {
    format: 'kablix-system',
    version: 1,
    pieces: [
      { id: 'sol', nom: 'sol', source: { kind: 'fichier', path: 'sol.stl' }, pose: pose(0, 0, 0) },
      { id: 'chassis', source: { kind: 'kompix', type: 'chassis-2-roues' }, pose: pose(0, 0, 43.75) },
      { id: 'mg', nom: 'moteur:Act1', source: { kind: 'kompix', type: 'moteur-dc' }, pose: pose(-45, -45, 32.5) },
      { id: 'md', nom: 'moteur:Act2', source: { kind: 'kompix', type: 'moteur-dc' }, pose: pose(45, -45, 32.5) },
      { id: 'rg', nom: 'roue:Act1', source: { kind: 'kompix', type: 'roue' }, pose: pose(-73.5, -45, 32.5) },
      { id: 'rd', nom: 'roue:Act2', source: { kind: 'kompix', type: 'roue' }, pose: pose(73.5, -45, 32.5) },
    ],
    liaisons: [
      { id: 'Emg', type: 'encastrement', a: { piece: 'mg', axe: 'fixation-1' }, b: { piece: 'chassis', axe: 'moteur-gauche' } },
      { id: 'Emd', type: 'encastrement', a: { piece: 'md', axe: 'fixation-1' }, b: { piece: 'chassis', axe: 'moteur-droit' } },
      { id: 'Pg', type: 'pivot', a: { piece: 'rg', axe: 'moyeu' }, b: { piece: 'chassis', axe: 'moteur-gauche' } },
      { id: 'Pd', type: 'pivot', a: { piece: 'rd', axe: 'moyeu' }, b: { piece: 'chassis', axe: 'moteur-droit' } },
      { id: 'Sg', type: 'roue-sol', a: { piece: 'rg' }, b: { piece: 'sol' }, params: { rayon: 32.5 } },
      { id: 'Sd', type: 'roue-sol', a: { piece: 'rd' }, b: { piece: 'sol' }, params: { rayon: 32.5 } },
    ],
  },
  // Sol : plaque de 2000 × 2000 mm, dessus à Z = 0.
  systemFiles: [{ path: 'sol.stl', data: new TextEncoder().encode(pave('sol', [-1000, -1000, -2], [1000, 1000, 0])) }],
  code: `// Démonstrateur de la vue 3D : robot à deux roues.
// Ouvrir la vue 3D (bouton « 3D ») puis lancer la simulation : chaque moteur
// fait tourner sa roue et le châssis roule sur le sol.
// Moteur gauche (Act1) : broche 9 ; moteur droit (Act2) : broche 10. Chacun
// est commandé par un PN2222A, avec une diode de roue libre.
const GAUCHE = 9;
const DROITE = 10;

void roule(int g, int d, int ms) {
  analogWrite(GAUCHE, g);
  analogWrite(DROITE, d);
  delay(ms);
}

void setup() {
  pinMode(GAUCHE, OUTPUT);
  pinMode(DROITE, OUTPUT);
}

void loop() {
  roule(255, 255, 2000);  // tout droit
  roule(255, 0, 1000);    // virage : seule la roue gauche tourne
  roule(0, 0, 1000);      // arrêt
}
`,
});
