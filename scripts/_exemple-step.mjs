// Démonstrateur d'un montage importé d'un STEP (piste 11, lot D8c).
//
// Fabrique docs/exemples/mecanique/robot-step/ : le STEP `robot-mini.step` de
// Kompix Editor (assemblage FreeCAD : châssis, servo:S1 avec palonnier,
// aimant:A1, hall:U3) converti EXACTEMENT comme le fait sa commande
// « Importer un assemblage STEP… » (lot D8b) : lecture par `occt-import-js`,
// `stepToSystem` de kompix-core sans `recentrer` (pose nulle, coordonnées
// globales du STEP), STL binaires sous `system/meshes/`. Le schéma porte les
// repères des rôles (servo S1, aimant A1 fixé au palonnier, capteur U3).
//
// Le code de conversion n'est pas recopié dans Kablix : ce script le prend dans
// le dépôt de Kompix Editor (KOMPIX_EDITOR, sinon ../Kablix/kompix_editor).
// Le résultat est enregistré : le banc verify:exemples-meca n'a pas besoin de
// Kompix Editor pour le lire.
//
// Usage : node scripts/_exemple-step.mjs   (réécrit le dossier robot-step)
import JSZip from 'jszip';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOM = 'robot-step';
const DOSSIER = join(ROOT, 'docs/exemples/mecanique', NOM);
const app = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const editeur = [process.env.KOMPIX_EDITOR, join(ROOT, '../Kablix/kompix_editor')]
  .filter(Boolean).find((d) => existsSync(join(d, 'packages/kompix-core/src/step.ts')));
if (!editeur) {
  console.error('Dépôt de Kompix Editor introuvable (KOMPIX_EDITOR pour l\'indiquer).');
  process.exit(1);
}
const core = join(editeur, 'packages/kompix-core');
const STEP = join(core, 'test/fixtures/robot-mini.step');
// kompix-core est en TypeScript : Node 24 retire les types à l'import.
const { stepToSystem } = await import(pathToFileURL(join(core, 'src/step.ts')).href);
const occtimportjs = createRequire(join(core, 'package.json'))('occt-import-js');
const occt = await occtimportjs();

// Même appel que `importStepIntoProjix` (step-import.ts de Kompix Editor).
const lu = occt.ReadStepFile(new Uint8Array(readFileSync(STEP)), { linearUnit: 'millimeter' });
const { doc, files, problems } = stepToSystem(lu);
if (problems.length) {
  console.error('Conversion avec problèmes :', JSON.stringify(problems));
  process.exit(1);
}

const fil = (id, a, pa, b, pb, color) => ({ id, a: { partId: a, pin: pa }, b: { partId: b, pin: pb }, color });
const diagram = {
  parts: [
    { id: 'U1', type: 'uno', x: 40, y: 60 },
    { id: 'S1', type: 'servo', x: 620, y: 80, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } },
    { id: 'A1', type: 'aimant', x: 685, y: 80, attrs: { mount: 'S1' } },
    { id: 'U3', type: 'hall', x: 740, y: 135, attrs: { text: 'A3144', vplus: '1', gnd: '2', s: '3' } },
    { id: 'R1', type: 'resistor', x: 500, y: 60, attrs: { value: '10000' } },
  ],
  wires: [
    fil('w1', 'S1', 'V+', 'U1', '5V', 'red'),
    fil('w2', 'S1', 'GND', 'U1', 'GND.1', 'black'),
    fil('w3', 'S1', 'PWM', 'U1', '9', 'orange'),
    fil('w4', 'U3', 'V+', 'U1', '5V', 'red'),
    fil('w5', 'U3', 'GND', 'U1', 'GND.1', 'black'),
    fil('w6', 'U3', 'S', 'U1', '2', 'yellow'),
    fil('w7', 'R1', '1', 'U3', 'S', 'orange'),
    fil('w8', 'R1', '2', 'U1', '5V', 'red'),
  ],
  customParts: [],
};

const code = `// Démonstrateur de la vue 3D : montage importé d'un STEP.
// Le montage 3D vient de robot-mini.step (assemblage FreeCAD), importé par la
// commande « Importer un assemblage STEP… » de Kompix Editor. Les noms des
// pièces dans le STEP (servo:S1, aimant:A1, hall:U3) leur donnent leur rôle.
// Un STEP ne porte aucune liaison : le montage reste fixe dans la vue 3D. Le
// capteur U3 lit la distance de l'aimant A1 dans la scène.
#include <Servo.h>

const int HALL = 2;
Servo servo;

void setup() {
  pinMode(HALL, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  servo.attach(9);
  Serial.begin(115200);
}

void loop() {
  bool aimant = digitalRead(HALL) == LOW;  // sortie active basse
  digitalWrite(LED_BUILTIN, aimant ? HIGH : LOW);
  Serial.println(aimant ? "AIMANT" : "rien");
  servo.write(aimant ? 0 : 180);
  delay(1000);
}
`;

mkdirSync(DOSSIER, { recursive: true });
const zip = new JSZip();
// Même disposition que packProject (src/projix.ts), comme _exemples-meca.mjs.
zip.file('kablix.json', JSON.stringify({
  format: 'projix', version: 1, app, board: 'uno', createdAt: '2026-11-24T00:00:00.000Z', codeFile: `${NOM}.ino`,
}, null, 2));
zip.file('diagram.json', JSON.stringify(diagram, null, 2));
zip.file('system.json', JSON.stringify(doc, null, 2));
for (const [path, data] of files) zip.file('system/' + path, data);
for (const f of Object.values(zip.files)) f.date = new Date('2026-11-24T00:00:00Z');
writeFileSync(join(DOSSIER, `${NOM}.projix`), await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
writeFileSync(join(DOSSIER, `${NOM}.ino`), code);
// Le STEP d'origine, pour refaire l'import à la main dans Kompix Editor.
copyFileSync(STEP, join(DOSSIER, 'robot-mini.step'));
console.log(`✓ ${NOM} : ${doc.pieces.length} pièces (${doc.pieces.map((p) => p.nom).join(', ')})`);
