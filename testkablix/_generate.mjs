// Génère tous les fichiers de test de testkablix/ à partir de _spec.mjs :
//   - tests .ino  → un dossier par sketch (convention Arduino) contenant
//                   <nom>/<nom>.ino ET <nom>/<nom>.projix ;
//   - tests .py   → <nom>.py et <nom>.projix côte à côte à la racine.
// Les .projix sont des archives ZIP (kablix.json + diagram.json), comme
// celles produites par « Enregistrer le projet » de l'extension.
//   node testkablix/_generate.mjs      (depuis la racine du dépôt)
import JSZip from 'jszip';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TESTS } from './_spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const APP_VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/** Construit l'archive .projix d'un test (schéma seul, comme l'extension). */
async function buildProjix(test, codeFileRef) {
  const manifest = {
    format: 'projix',
    version: 1,
    app: APP_VERSION,
    board: test.board,
    createdAt: new Date().toISOString(),
    codeFile: codeFileRef,
  };
  const diagram = { parts: test.parts, wires: test.wires, customParts: [] };
  const zip = new JSZip();
  zip.file('kablix.json', JSON.stringify(manifest, null, 2));
  zip.file('diagram.json', JSON.stringify(diagram, null, 2));
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

let nIno = 0;
let nPy = 0;
for (const test of TESTS) {
  if (test.ext === 'ino') {
    // Sketch Arduino : dossier du même nom que le .ino (exigence arduino-cli).
    const dir = join(HERE, test.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${test.name}.ino`), test.code, 'utf8');
    const projix = await buildProjix(test, `testkablix/${test.name}/${test.name}.ino`);
    writeFileSync(join(dir, `${test.name}.projix`), projix);
    nIno++;
  } else {
    writeFileSync(join(HERE, `${test.name}.py`), test.code, 'utf8');
    const projix = await buildProjix(test, `testkablix/${test.name}.py`);
    writeFileSync(join(HERE, `${test.name}.projix`), projix);
    nPy++;
  }
}

console.log(`OK : ${nIno} sketchs .ino (dossiers) + ${nPy} scripts .py générés, ${TESTS.length} .projix.`);
