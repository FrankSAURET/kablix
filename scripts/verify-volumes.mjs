// Volumes et axes des pièces d'un montage (piste 11, lot D6b).
//
// Deux étages :
//   A. le robot à deux roues de `docs/bibliotheque.md` de Kompix Editor, avec
//      les VRAIS paquets de `components/meca/` : volumes lus (`model3d.json`),
//      roue calculée par son `shape.mjs`, arbre cinématique sans problème,
//      roulage droit et rotation sur place (étage sauté, avec un avis, si le
//      dépôt de Kompix Editor n'est pas sur le poste) ;
//   B. cas propres à Kablix, paquets fabriqués ici : priorité paquet > élément
//      intégré, élément intégré seul (araignée), miroir, forme en boucle sans
//      fin arrêtée au délai, import refusé, paquet sans volume, fichier
//      maillé présent ou absent.
//
// Usage : node scripts/verify-volumes.mjs
import esbuild from 'esbuild';
import JSZip from 'jszip';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-volumes-'));

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
const sortie = join(tmp, 'volumes.mjs');
const p = (f) => JSON.stringify(join(ROOT, f).replace(/\\/g, '/'));
await esbuild.build({
  stdin: {
    contents: [
      `export * from ${p('src/webview/mecanique/volumes.mts')};`,
      `export { solve, rollStart, rollStep } from ${p('src/webview/mecanique/cinematique.mts')};`,
      `export { lireSysteme } from ${p('src/systeme.ts')};`,
      `export { volumeDePaquet, volumesDuSysteme, lancerForme } from ${p('src/systemeVolumes.ts')};`,
    ].join('\n'),
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: sortie, logLevel: 'error',
  external: ['lit', 'lit/*'],
});
const M = await import(pathToFileURL(sortie).href);

// ------------------------------------------------ dépôt de Kompix Editor
const editeur = [process.env.KOMPIX_EDITOR, join(ROOT, '../Kablix/kompix_editor'), join(ROOT, 'kompix_editor')]
  .filter(Boolean).find((d) => existsSync(join(d, 'components/meca')) && existsSync(join(d, 'docs/bibliotheque.md')));

// ------------------------------------------------ A. robot à deux roues
if (editeur) {
  console.log(`A. robot à deux roues, paquets de ${join(editeur, 'components/meca')}`);
  const meca = join(editeur, 'components/meca');
  const paquets = new Map();
  for (const f of readdirSync(meca)) if (f.endsWith('.kompix')) paquets.set(f.replace(/\.kompix$/, ''), readFileSync(join(meca, f)));
  const md = readFileSync(join(editeur, 'docs/bibliotheque.md'), 'utf8').replace(/\r\n/g, '\n');
  const bloc = /## Exemple de `system\.json`[^\n]*\n[\s\S]*?```json\n([\s\S]*?)\n```/.exec(md);
  check(!!bloc, 'exemple du robot trouvé dans bibliotheque.md');
  const { systeme: doc, problemes } = M.lireSysteme(JSON.parse(bloc[1]));
  check(doc && problemes.length === 0, 'exemple lu sans problème', JSON.stringify(problemes));
  const sol = [{ path: 'sol.glb', data: new Uint8Array([0x67, 0x6c, 0x54, 0x46]) }];
  const v = await M.volumesDuSysteme(doc, (t) => paquets.get(t), sol);
  check(v.paquets.roue?.origine === 'shape', 'roue : volume rendu par shape.mjs', JSON.stringify(v.paquets.roue?.erreur ?? v.paquets.roue?.origine));
  check(v.paquets['moteur-dc']?.origine === 'model3d' && v.paquets['chassis-2-roues']?.origine === 'model3d', 'moteur et châssis : model3d.json');
  check(v.fichiers['sol.glb']?.format === 'glb', 'sol : maillage glb envoyé');
  check(M.problemesVolumes(doc, v).length === 0, 'toutes les pièces ont un volume', JSON.stringify(M.problemesVolumes(doc, v)));
  const axesRoue = M.axesDePiece(doc.pieces.find((x) => x.id === 'rg'), v);
  check(axesRoue?.moyeu?.dir === 'x', 'roue : axe moyeu selon X', JSON.stringify(axesRoue));
  const { tree, problems } = M.montageCinematique(doc, v);
  check(problems.length === 0, 'arbre cinématique sans problème', JSON.stringify(problems));
  check(tree.wheels.length === 2 && tree.wheels.every((w) => w.chassis === 'chassis'), 'deux roues sur le châssis');
  const s0 = M.rollStart(tree);
  const avant = M.rollStep(s0, tree, { Pg: 90, Pd: 90 });
  const d = 32.5 * Math.PI / 2;
  check(near(Math.hypot(avant.x - s0.x, avant.y - s0.y), d, 1e-6) && near(avant.lacet, s0.lacet), 'roulage droit : 32,5 × π/2 mm, sans virage',
    JSON.stringify(avant));
  // Roues opposées : le châssis tourne autour du milieu de l'essieu (0, −45),
  // son origine reste à 45 mm de ce point. (La voie prise par le solveur est
  // l'écart des axes du châssis, 90 mm, pas celui des roues : défaut noté dans
  // todo.md, à corriger dans kompix-core.)
  const tour = M.rollStep(s0, tree, { Pg: 90, Pd: -90 });
  check(near(Math.hypot(tour.x - 0, tour.y + 45), 45, 1e-6) && !near(tour.lacet, s0.lacet), 'roues opposées : rotation autour du milieu de l\'essieu', JSON.stringify(tour));
  const pose = M.solve(tree, { Pg: 45 }).poses.rg;
  check(pose && near(pose.pos.x, -73.5, 1e-6) && near(pose.rot.x, 45, 1e-6), 'roue gauche tournée de 45° autour de son moyeu', JSON.stringify(pose?.pos) + JSON.stringify(pose?.rot));
  // Engrenage : forme calculée, propriété par défaut.
  const eng = await M.volumeDePaquet(paquets.get('engrenage'));
  check(eng.origine === 'shape' && M.axesDuModele(eng.model).moyeu?.dir === 'z', 'engrenage : volume calculé, axe moyeu selon Z', JSON.stringify(eng.erreur));
  // Sans le sol : la pièce est signalée, le montage tient.
  const v2 = await M.volumesDuSysteme(doc, (t) => paquets.get(t), []);
  const pb = M.problemesVolumes(doc, v2);
  check(pb.length === 1 && pb[0].code === 'fichier-absent' && pb[0].target === 'sol', 'sol absent : fichier-absent', JSON.stringify(pb));
} else {
  console.log('A. ⚠ dépôt de Kompix Editor absent : robot sauté (KOMPIX_EDITOR pour l\'indiquer)');
}

// ------------------------------------------------ B. cas propres à Kablix
console.log('B. paquets fabriqués');
const kompix = async (manifeste, fichiers = {}) => {
  const z = new JSZip();
  z.file('manifest.json', JSON.stringify(manifeste));
  for (const [n, c] of Object.entries(fichiers)) z.file(n, c);
  return z.generateAsync({ type: 'uint8array' });
};
const ensemble = (axes, pieces = []) => ({ source: 'test', box: { x: 10, y: 10, z: 10 }, axes, pieces });
const servo = await kompix({ type: 'servo', model3d: 'model3d.json' }, {
  'model3d.json': JSON.stringify({ assemblies: { servo: ensemble({ horn: { x: 5, y: 2, z: 20, dir: 'z' } },
    [{ name: 'corps', plan: 'dessus', mat: 'pla', ep: 20, pos: { x: 0, y: 0, z: 0 }, w: 10, h: 10, poly: [], mesh: 'meshes/servo.stl' }]) } }),
  'meshes/servo.stl': 'solid s\nendsolid s\n',
});
const vs = await M.volumeDePaquet(servo);
check(vs.type === 'servo' && vs.origine === 'model3d', 'paquet model3d lu');
check(typeof vs.maillages?.['meshes/servo.stl'] === 'string', 'maillage du paquet joint en base64');

const forme = await kompix({ type: 'came', shape: 'shape.mjs', params: [{ name: 'r', value: 7 }] }, {
  'shape.mjs': 'export default function shape(p) { return { width: 10, height: 10, svg: "", pins: [], model3d: { assemblies: { came: { source: "s", box: { x: 1, y: 1, z: 1 }, axes: { arbre: { x: p.r, y: 0, z: 0, dir: "z" } }, pieces: [] } } } }; }',
});
const vf = await M.volumeDePaquet(forme);
check(vf.origine === 'shape' && M.axesDuModele(vf.model).arbre?.x === 7, 'shape.mjs lancé avec la valeur par défaut des propriétés', JSON.stringify(vf));

const boucle = await kompix({ type: 'boucle', shape: 'shape.mjs' }, { 'shape.mjs': 'export default function shape() { for (;;) {} }' });
const t0 = Date.now();
const vb = await M.volumeDePaquet(boucle, 200);
check(!vb.model && /timed out/i.test(vb.erreur ?? '') && Date.now() - t0 < 3000, 'boucle sans fin : arrêtée au délai, sans lever', vb.erreur);

const imp = await kompix({ type: 'imp', shape: 'shape.mjs' }, { 'shape.mjs': 'import fs from "node:fs";\nexport default () => ({})' });
check(/imports are not allowed/.test((await M.volumeDePaquet(imp)).erreur ?? ''), 'import dans shape.mjs refusé');

const plat = await kompix({ type: 'plat' });
const vp = await M.volumeDePaquet(plat);
check(vp.type === 'plat' && !vp.model && !vp.erreur, 'paquet à plat : ni volume ni erreur');
check(!!(await M.volumeDePaquet(new Uint8Array([1, 2, 3]))).erreur, 'paquet illisible : erreur, sans lever');

// Document fabriqué : servo (paquet), araignée (élément intégré), plat, fichier.
const brut = {
  format: 'kablix-system', version: 1,
  pieces: [
    { id: 'base', source: { kind: 'fichier', path: 'meshes/base.stl' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
    { id: 's', source: { kind: 'kompix', type: 'servo' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
    { id: 'sm', source: { kind: 'kompix', type: 'servo' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, miroir: true } },
    { id: 'robot', source: { kind: 'kompix', type: 'araignee' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
    { id: 'p', source: { kind: 'kompix', type: 'plat' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
    { id: 'x', source: { kind: 'kompix', type: 'inconnu' }, pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } } },
  ],
  liaisons: [
    { id: 'E', type: 'encastrement', a: { piece: 's' }, b: { piece: 'base' } },
    { id: 'P', type: 'pivot', a: { piece: 'p' }, b: { piece: 's', axe: 'horn' } },
  ],
};
const { systeme: doc } = M.lireSysteme(brut);
const lib = new Map([['servo', servo], ['plat', plat]]);
const v = await M.volumesDuSysteme(doc, (t) => lib.get(t), [{ path: 'meshes/base.stl', data: new Uint8Array([1]) }]);
check(Object.keys(v.paquets).sort().join() === 'plat,servo', 'un paquet par type, types absents de la bibliothèque non lus');
const piece = (id) => doc.pieces.find((q) => q.id === id);
check(M.volumeDePiece(piece('s'), v).de === 'paquet', 'servo : le paquet passe avant tout');
check(M.volumeDePiece(piece('robot'), v).de === 'integre', 'araignée : élément intégré de Kablix');
check(M.axesDePiece(piece('robot'), v)?.['coxa-gh']?.dir === 'z', 'araignée : axes de ses assemblages');
check(M.volumeDePiece(piece('base'), v).de === 'fichier' && v.fichiers['meshes/base.stl'].format === 'stl', 'pièce fichier : maillage stl');
check(M.axesDePiece(piece('base'), v) === undefined, 'pièce fichier : pas d\'axe nommé');
const ax = M.axesDePiece(piece('s'), v).horn;
const axm = M.axesDePiece(piece('sm'), v).horn;
check(ax.x === 5 && axm.x === -5 && axm.y === 2 && axm.z === 20 && axm.dir === 'z', 'miroir : X du point retourné, direction gardée', JSON.stringify(axm));
const pbs = M.problemesVolumes(doc, v).map((q) => `${q.target}:${q.code}`).sort().join();
check(pbs === 'p:paquet-sans-volume,x:paquet-absent', 'pièces sans volume signalées', pbs);
const kin = M.montageCinematique(doc, v);
check(kin.problems.length === 0 && kin.tree.joints.P?.type === 'pivot', 'pivot sur l\'axe horn du paquet accepté', JSON.stringify(kin.problems));
// Paquet du même type qu'un élément intégré à volume : le paquet l'emporte.
const araigneePaquet = await kompix({ type: 'araignee' }, { 'model3d.json': JSON.stringify({ assemblies: { a: ensemble({ seul: { x: 1, y: 1, z: 1 } }) } }) });
const va = await M.volumesDuSysteme(doc, (t) => (t === 'araignee' ? araigneePaquet : lib.get(t)), []);
check(M.volumeDePiece(piece('robot'), va).de === 'paquet' && 'seul' in M.axesDePiece(piece('robot'), va), 'type intégré à volume : le paquet de bibliothèque passe devant');
const sansPaquet = M.montageCinematique(doc, { paquets: {}, fichiers: {} });
check(sansPaquet.problems.some((q) => q.code === 'axe-absent' && q.target === 'P'), 'paquet du servo absent : axe-absent', JSON.stringify(sansPaquet.problems));

console.log(`\n${ok}/${ok + fails.length} vérifications passées.`);
if (fails.length) {
  console.log(`ÉCHECS : ${fails.join(' ; ')}`);
  process.exit(1);
}
