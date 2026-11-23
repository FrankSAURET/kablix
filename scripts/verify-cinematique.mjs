// Solveur cinématique porté dans Kablix (piste 11, lot D6a).
//
// `src/webview/mecanique/cinematique.mts` est une COPIE de `kinematics.ts` de
// kompix-core (Kompix Editor), imports mis à part. Trois étages :
//   A. la copie n'a pas dérivé : même texte que l'original, lignes d'import et
//      commentaires `// Kablix :` exceptés (étage sauté, avec un avis, si le
//      dépôt de Kompix Editor n'est pas sur le poste) ;
//   B. les tests du solveur de kompix-core (`test/kinematics.test.ts`) rejoués
//      tels quels contre la copie de Kablix (même condition) ;
//   C. cas propres à Kablix : l'exemple du format, lu par `lireSysteme` de
//      `src/systeme.ts`, passe dans le solveur (servo qui tourne l'aimant,
//      borne, liaison refusée).
//
// Dépôt de Kompix Editor : variable KOMPIX_EDITOR, sinon les emplacements
// connus du poste de Frank.
//
// Usage : node scripts/verify-cinematique.mjs
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPIE = join(ROOT, 'src/webview/mecanique/cinematique.mts');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-cinematique-'));

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

// ------------------------------------------------ dépôt de Kompix Editor
const candidats = [
  process.env.KOMPIX_EDITOR,
  join(ROOT, '../Kablix/kompix_editor'),
  join(ROOT, 'kompix_editor'),
].filter(Boolean);
const editeur = candidats.find((d) => existsSync(join(d, 'packages/kompix-core/src/kinematics.ts')));
const core = editeur && join(editeur, 'packages/kompix-core');

// ------------------------------------------------ A. pas de dérive
const corps = (txt) => txt.replace(/\r\n/g, '\n').split('\n')
  .filter((l) => !/^import\s/.test(l) && !/^\/\/ Kablix :/.test(l));
if (core) {
  console.log(`A. copie comparée à ${join(core, 'src/kinematics.ts')}`);
  const a = corps(readFileSync(join(core, 'src/kinematics.ts'), 'utf8'));
  const b = corps(readFileSync(COPIE, 'utf8'));
  const i = a.findIndex((l, k) => l !== b[k]);
  check(i < 0 && a.length === b.length, 'copie identique à kompix-core',
    i < 0 ? `longueurs ${a.length} / ${b.length}` : `ligne ${i + 1} : « ${a[i]} » / « ${b[i] ?? ''} »`);
} else {
  console.log('A. ⚠ dépôt de Kompix Editor absent : comparaison sautée (KOMPIX_EDITOR pour l\'indiquer)');
}

// ------------------------------------------------ B. tests de kompix-core rejoués
if (core && existsSync(join(core, 'test/kinematics.test.ts'))) {
  console.log('B. tests du solveur de kompix-core rejoués contre la copie');
  // L'index de kompix-core est remplacé par la copie de Kablix + son socle.
  const shim = join(tmp, 'index.mts');
  writeFileSync(shim, [
    `export * from ${JSON.stringify(COPIE.replace(/\\/g, '/'))};`,
    `export { rotXYZ } from ${JSON.stringify(join(ROOT, 'src/webview/mecanique/socle.mts').replace(/\\/g, '/'))};`,
  ].join('\n'));
  const sortie = join(tmp, 'kinematics.test.mjs');
  await esbuild.build({
    entryPoints: [join(core, 'test/kinematics.test.ts')],
    bundle: true, platform: 'node', format: 'esm', outfile: sortie, logLevel: 'error',
    plugins: [{
      name: 'index-kablix',
      setup(b) { b.onResolve({ filter: /\/src\/index\.ts$/ }, () => ({ path: shim })); },
    }],
  });
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', sortie], { encoding: 'utf8' });
  const pass = Number(/^# pass (\d+)/m.exec(r.stdout)?.[1] ?? 0);
  const fail = Number(/^# fail (\d+)/m.exec(r.stdout)?.[1] ?? -1);
  console.log(`   ${pass} réussis, ${fail} échoués`);
  check(r.status === 0 && fail === 0 && pass > 0, 'tests de kompix-core verts sur la copie',
    (r.stdout.match(/^not ok .*$/gm) ?? []).join(' | ') || r.stderr.slice(0, 400));
} else {
  console.log('B. ⚠ tests de kompix-core absents : étage sauté');
}

// ------------------------------------------------ C. cas propres à Kablix
console.log('C. document lu par Kablix → solveur');
const entree = join(tmp, 'entree.mts');
writeFileSync(entree, [
  `export * from ${JSON.stringify(COPIE.replace(/\\/g, '/'))};`,
  `export { lireSysteme } from ${JSON.stringify(join(ROOT, 'src/systeme.ts').replace(/\\/g, '/'))};`,
].join('\n'));
const lib = join(tmp, 'lib.mjs');
await esbuild.build({ entryPoints: [entree], bundle: true, platform: 'node', format: 'esm', outfile: lib, logLevel: 'error' });
const { lireSysteme, buildKinematics, solve } = await import(pathToFileURL(lib).href);

// Exemple de la spécification (docs/systeme_specification.md, « Format »).
const exemple = {
  format: 'kablix-system',
  version: 1,
  pieces: [
    { id: 'chassis', source: { kind: 'fichier', path: 'meshes/chassis.stl' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
    { id: 'servo', nom: 'servo:Act1', ref: 'Act1', source: { kind: 'kompix', type: 'servo' }, pose: { pos: { x: 10, y: 5, z: 12 }, rot: { x: 0, y: 0, z: 90 } } },
    { id: 'aimant', nom: 'aimant:A1', ref: 'A1', source: { kind: 'kompix', type: 'aimant' }, pose: { pos: { x: 30, y: 5, z: 25 }, rot: { x: 0, y: 0, z: 0 }, miroir: true } },
  ],
  liaisons: [
    { id: 'L1', type: 'encastrement', a: { piece: 'servo' }, b: { piece: 'chassis' } },
    { id: 'L2', type: 'pivot', a: { piece: 'aimant', axe: 'pose' }, b: { piece: 'servo', axe: 'horn' }, params: { min: 0, max: 180 } },
  ],
};
// Axes nommés, repère local : palonnier à 13 mm au-dessus de l'origine du servo.
const AXES = { servo: { horn: { x: 0, y: 0, z: 13 } }, aimant: { pose: { x: 0, y: 0, z: 0, dir: 'z' } } };
const axesOf = (p) => AXES[p.id];

const { systeme, problemes } = lireSysteme(exemple);
check(!!systeme && problemes.length === 0, 'exemple de la spécification lu sans problème', JSON.stringify(problemes));
const { tree, problems } = buildKinematics(systeme, axesOf);
check(problems.length === 0, 'arbre construit sans problème', JSON.stringify(problems));
check(tree.joints.L2?.type === 'pivot' && tree.nodes.aimant?.joint === 'L2', 'L2 = pivot qui tient l\'aimant');

const pres = (a, b, eps = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < eps;
// Au zéro : poses du document.
const s0 = solve(tree, {});
check(pres(s0.poses.aimant.pos, { x: 30, y: 5, z: 25 }), 'au zéro, l\'aimant reste à sa pose du document', JSON.stringify(s0.poses.aimant.pos));
// 90° : le palonnier (monde (10, 5, 25)) fait tourner l'aimant d'un quart de tour autour de Z.
const s90 = solve(tree, { L2: 90 });
check(pres(s90.poses.aimant.pos, { x: 10, y: 25, z: 25 }), 'servo à 90° : aimant en (10, 25, 25)', JSON.stringify(s90.poses.aimant.pos));
check(pres(s90.poses.servo.pos, { x: 10, y: 5, z: 12 }), 'le servo, encastré, ne bouge pas');
// Au-delà de la borne : arrêt à 180°, signalé.
const s200 = solve(tree, { L2: 200 });
check(s200.values.L2 === 180 && s200.saturated.L2 === 'max', 'servo demandé à 200° : arrêté à 180°, saturation signalée');
check(pres(s200.poses.aimant.pos, { x: -10, y: 5, z: 25 }), 'à 180° : aimant en (-10, 5, 25)', JSON.stringify(s200.poses.aimant.pos));
// Axe du palonnier absent : liaison refusée, l'aimant reste à sa pose.
const { tree: t2, problems: p2 } = buildKinematics(systeme, (p) => (p.id === 'servo' ? {} : AXES[p.id]));
check(p2.some((p) => p.code === 'axe-absent' && p.target === 'L2'), 'axe du palonnier absent : axe-absent sur L2', JSON.stringify(p2));
check(pres(solve(t2, { L2: 90 }).poses.aimant.pos, { x: 30, y: 5, z: 25 }), 'liaison refusée : aimant laissé à sa pose');

console.log(`\n${ok} vérifications réussies, ${fails.length} échouées`);
if (fails.length) process.exit(1);
