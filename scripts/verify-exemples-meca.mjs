// Projets démonstrateurs de la vue 3D (piste 11, lot D6e) :
// docs/exemples/mecanique/{bras-servo-aimant,robot-deux-roues,robot-step}.
//
// Trois étages :
//   A. chaque .projix lu par le vrai `unpackProject` : schéma, document système
//      sans problème (lecture, contrôle contre le schéma, rôles, fichiers),
//      fils sur des composants du schéma, programme à côté du projet ;
//   B. avec les paquets mécaniques de Kompix Editor (étage sauté, avec un avis,
//      si son dépôt n'est pas sur le poste) : toutes les pièces ont un volume,
//      arbre cinématique sans problème, commandes attendues, mouvement simulé
//      (servo à 90° : aimant à 90° ; deux moteurs : ligne droite ; un moteur :
//      virage) ;
//   C. compilation des deux programmes (sautée sans arduino-cli).
//
// Usage : node scripts/verify-exemples-meca.mjs
import esbuild from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-exmeca-'));
const DOSSIER = join(ROOT, 'docs/exemples/mecanique');

let ok = 0;
const fails = [];
const check = (cond, label, detail = '') => {
  if (cond) ok++;
  else {
    fails.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ------------------------------------------------ modules testés, regroupés
// `vscode` remplacé par un module vide : projix.ts ne s'en sert que pour
// l'écriture du code (packProject), pas pour la lecture.
const sortie = join(tmp, 'exmeca.mjs');
const p = (f) => JSON.stringify(join(ROOT, f).replace(/\\/g, '/'));
await esbuild.build({
  stdin: {
    contents: [
      `export { unpackProject } from ${p('src/projix.ts')};`,
      `export { lireSysteme, controlerSysteme, reperesDuSchema, typesDuSchema } from ${p('src/systeme.ts')};`,
      `export { volumesDuSysteme } from ${p('src/systemeVolumes.ts')};`,
      `export { montageCinematique, problemesVolumes } from ${p('src/webview/mecanique/volumes.mts')};`,
      `export { vue3D } from ${p('src/webview/mecanique/vue3d-donnees.mts')};`,
      `export { Pilotage } from ${p('src/webview/mecanique/pilotage.mts')};`,
    ].join('\n'),
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: sortie, logLevel: 'error',
  external: ['lit', 'lit/*'],
  plugins: [{
    name: 'vscode-vide',
    setup(b) {
      b.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'vide' }));
      b.onLoad({ filter: /.*/, namespace: 'vide' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
    },
  }],
});
const M = await import(pathToFileURL(sortie).href);

// ------------------------------------------------ A. lecture des projets
const ATTENDUS = {
  'bras-servo-aimant': { pieces: 2, commandes: 'Palonnier<Act1' },
  'robot-deux-roues': { pieces: 6, commandes: 'Pd<Act2,Pg<Act1' },
  // Montage importé d'un STEP (lot D8c, _exemple-step.mjs) : aucune liaison,
  // donc aucune commande ; ses pièces `fichier` n'ont besoin d'aucun paquet.
  'robot-step': { pieces: 5, commandes: '' },
};
const projets = {};
console.log('A. projets lus');
for (const [nom, att] of Object.entries(ATTENDUS)) {
  const fichier = join(DOSSIER, nom, `${nom}.projix`);
  check(existsSync(fichier), `${nom} : .projix présent`);
  if (!existsSync(fichier)) continue;
  const u = await M.unpackProject(new Uint8Array(readFileSync(fichier)));
  check(u.manifest?.board === 'uno' && existsSync(join(DOSSIER, nom, u.manifest.codeFile ?? '?')), `${nom} : programme à côté du projet`, u.manifest?.codeFile);
  const diagram = typeof u.diagram === 'string' ? JSON.parse(u.diagram) : u.diagram;
  const ids = new Set(diagram.parts.map((q) => q.id));
  const orphelins = diagram.wires.filter((w) => !ids.has(w.a.partId) || !ids.has(w.b.partId)).map((w) => w.id);
  check(orphelins.length === 0, `${nom} : fils sur des composants du schéma`, orphelins.join());
  const { systeme, problemes } = M.lireSysteme(u.system);
  check(systeme && problemes.length === 0, `${nom} : document système lu sans problème`, JSON.stringify(problemes));
  if (!systeme) continue;
  check(systeme.pieces.length === att.pieces, `${nom} : ${att.pieces} pièces`, String(systeme.pieces.length));
  const controle = M.controlerSysteme(systeme, M.reperesDuSchema(diagram), u.systemFiles.map((f) => f.path), M.typesDuSchema(diagram));
  check(controle.length === 0, `${nom} : contrôle contre le schéma (repères, rôles, fichiers) sans problème`, JSON.stringify(controle));
  projets[nom] = { systeme, fichiers: u.systemFiles, att };
}

// ------------------------------------------------ B. volumes et mouvement
const editeur = [process.env.KOMPIX_EDITOR, join(ROOT, '../Kablix/kompix_editor'), join(ROOT, 'kompix_editor')]
  .filter(Boolean).find((d) => existsSync(join(d, 'components/meca')));
if (editeur) {
  console.log(`B. paquets de ${join(editeur, 'components/meca')}`);
  const meca = join(editeur, 'components/meca');
  const paquets = new Map();
  for (const f of readdirSync(meca)) if (f.endsWith('.kompix')) paquets.set(f.replace(/\.kompix$/, ''), readFileSync(join(meca, f)));
  const piloter = {};
  for (const [nom, { systeme, fichiers, att }] of Object.entries(projets)) {
    const volumes = await M.volumesDuSysteme(systeme, (t) => paquets.get(t), fichiers);
    const pv = M.problemesVolumes(systeme, volumes);
    check(pv.length === 0, `${nom} : toutes les pièces ont un volume`, JSON.stringify(pv));
    const { tree, problems } = M.montageCinematique(systeme, volumes);
    check(problems.length === 0, `${nom} : arbre cinématique sans problème`, JSON.stringify(problems));
    const v = M.vue3D({ doc: systeme, volumes, problemes: [] });
    check(v.pieces.every((q) => q.defauts.length === 0), `${nom} : aucune pièce en défaut dans la vue`, JSON.stringify(v.pieces.filter((q) => q.defauts.length).map((q) => [q.id, q.defauts])));
    const pil = new M.Pilotage(tree, v.pieces.map((q) => ({ id: q.id, role: q.role, repere: q.repere, inerte: false })));
    const cmds = pil.commandes.map((c) => `${c.liaison}<${c.repere}`).sort().join(',');
    check(cmds === att.commandes, `${nom} : commandes ${att.commandes}`, cmds);
    piloter[nom] = pil;
  }
  const bras = piloter['bras-servo-aimant'];
  if (bras) {
    const im = bras.pas({ servos: { Act1: 90 }, moteurs: {} }, 0.02);
    const a = im.solution.poses.aimant.pos;
    check(near(a.x, 0) && near(a.y, 20) && near(a.z, 30.7), 'bras : servo à 90°, l\'aimant a tourné d\'un quart de tour', JSON.stringify(a));
    check(Object.keys(im.saturees).length === 0 && im.sansSource.length === 0, 'bras : ni butée ni commande sans source', JSON.stringify(im));
  }
  const robot = piloter['robot-deux-roues'];
  if (robot) {
    let im;
    for (let k = 0; k < 4; k++) im = robot.pas({ servos: {}, moteurs: { Act1: 1, Act2: 1 } }, 0.25);
    const c = im.solution.poses.chassis;
    const att = 32.5 * 2 * Math.PI * (200 / 60);
    check(near(Math.hypot(c.pos.x, c.pos.y), att) && near(c.rot.z, 0, 1e-9) && near(c.pos.z, 43.75), 'robot : deux moteurs, ligne droite de 680,7 mm', JSON.stringify(c.pos));
    robot.remettre();
    im = robot.pas({ servos: {}, moteurs: { Act1: 1, Act2: 0 } }, 0.25);
    check(Math.abs(im.solution.poses.chassis.rot.z) > 1, 'robot : moteur gauche seul, le robot tourne', String(im.solution.poses.chassis.rot.z));
  }
} else {
  console.log('B. ⚠ dépôt de Kompix Editor absent : volumes et mouvement sautés (KOMPIX_EDITOR pour l\'indiquer)');
}

// ------------------------------------------------ C. compilation
const out = join(tmp, 'compiler.mjs');
await esbuild.build({ entryPoints: [join(ROOT, 'src/compiler.ts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { compile, detectToolchain } = await import(pathToFileURL(out).href);
if (detectToolchain().arduinoCli) {
  console.log('C. compilation (arduino-cli)');
  for (const nom of Object.keys(ATTENDUS)) {
    let err;
    try { await compile('uno', join(DOSSIER, nom, `${nom}.ino`), ROOT); } catch (e) { err = e; }
    check(!err, `${nom}.ino compilé pour l'Uno`, err?.message);
  }
} else {
  console.log('C. ⚠ arduino-cli absent : compilation sautée');
}

console.log(fails.length ? `\n❌ ${fails.length} échec(s), ${ok} réussite(s)` : `\n✅ ${ok}/${ok} démonstrateurs mécaniques`);
process.exit(fails.length ? 1 : 0);
