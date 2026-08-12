// Test de régression : ASSEMBLAGES dessinés (v2026.8.26).
// Un assemblage, ce sont plusieurs pièces plates posées les unes par rapport aux
// autres, EN MILLIMÈTRES : deux flancs de PMMA de 3 mm avec les servos pris en
// sandwich entre eux. Tout ce qui peut casser ici est muet à la compilation et
// invisible sur une image de 360 px :
//   1. l'ÉTIQUETTE de pose est écrite à la main dans Inkscape (« flanc pos=0,-9,0
//      ep=3 miroir=x ») : une virgule mal découpée et la pièce part au centre —
//      c'est arrivé, `pos=0,-9,0` avait été lu comme trois mots ;
//   2. le PLAN décide de l'axe de l'épaisseur : une plaque de 100 mm posée à plat
//      encombre 100 mm en large et 3 mm en haut, jamais 103 ;
//   3. le MIROIR pose la pièce deux fois — un dessin de flanc donne les DEUX
//      flancs, et c'est le second qui donne la largeur du corps ;
//   4. l'ÉCLATÉ doit écarter chaque pièce du bon côté, sinon deux flancs se
//      traversent au lieu de s'ouvrir.
// Ici tout est du calcul pur : le vrai moteur bundlé, et le vrai lecteur importé
// (pas une copie de ses règles).
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { parsePose, place, poses, encombrement, PLANS, MATIERES } from './_extract-assemblage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-assemblage');
mkdirSync(CACHE, { recursive: true });

const bundle = join(CACHE, 'iso3d.mjs');
await esbuild({
  entryPoints: [join(ROOT, 'scripts', '_assemblage-entry.mts')],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'node',
});
const M = await import(pathToFileURL(bundle).href);

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// --- l'étiquette de pose, telle que Frank l'écrit dans Inkscape ---------------
const p1 = parsePose('flanc pos=0,-9,0 ep=3 miroir=x mat=servo');
ok('parsePose : le plan est le premier mot', p1?.plan === 'flanc', p1?.plan);
// Le piège d'origine : découper sur les virgules séparait les trois nombres et
// la pièce se retrouvait au centre, sans que rien ne le signale.
ok('parsePose : une position négative reste entière',
  p1 && p1.pos.x === 0 && p1.pos.y === -9 && p1.pos.z === 0, JSON.stringify(p1?.pos));
ok('parsePose : épaisseur, matière et miroir lus', p1?.ep === 3 && p1?.mat === 'servo' && p1?.miroir === 'x',
  `${p1?.ep} ${p1?.mat} ${p1?.miroir}`);
const p2 = parsePose('  DESSUS   miroir=y   pos=1.5,-2.25,30   ep=4  ');
ok('parsePose : ordre libre, casse et espaces indifférents',
  p2?.plan === 'dessus' && p2?.ep === 4 && p2?.miroir === 'y'
  && p2.pos.x === 1.5 && p2.pos.y === -2.25 && p2.pos.z === 30, JSON.stringify(p2));
ok('parsePose : « miroir » seul vaut miroir=y (le cas courant, gauche/droite)',
  parsePose('flanc miroir')?.miroir === 'y');
ok('parsePose : une matière inconnue retombe sur le PMMA',
  parsePose('dessus mat=titane')?.mat === 'pmma');
ok('parsePose : pose incomplète = valeurs par défaut',
  JSON.stringify(parsePose('face')) === JSON.stringify(
    { plan: 'face', pos: { x: 0, y: 0, z: 0 }, ep: 3, mat: 'pmma', miroir: '' }),
  JSON.stringify(parsePose('face')));
// Un texte quelconque du groupe n'est PAS une étiquette : c'est un nom d'axe.
ok('parsePose : un nom d\'axe n\'est pas une étiquette', parsePose('hanche-g') === null);
ok('parsePose : un texte vide n\'est pas une étiquette', parsePose('   ') === null);
ok('parsePose : une position mal écrite est ignorée (pièce au centre, visible)',
  parsePose('dessus pos=3,4').pos.x === 0, JSON.stringify(parsePose('dessus pos=3,4').pos));
ok('lecteur et moteur parlent des mêmes plans',
  PLANS.every((p) => M.PLANES[p]) && PLANS.length === Object.keys(M.PLANES).length, PLANS.join(', '));
ok('lecteur et moteur parlent des mêmes matières',
  MATIERES.every((m) => M.MATIERES[m]), MATIERES.join(', '));

// --- où se pose un point du dessin --------------------------------------------
// Le y du dessin DESCEND (convention SVG) : vue de dessus il va vers l'arrière,
// vue de flanc ou de face il monte vers le bas du robot.
const P = { x: 10, y: 4 };
const Z = { x: 0, y: 0, z: 0 };
ok('place(dessus) : x à droite, y vers l\'arrière',
  JSON.stringify(place('dessus', P, Z)) === JSON.stringify({ x: 10, y: 4, z: 0 }));
ok('place(flanc) : x vers l\'arrière, y vers le bas',
  JSON.stringify(place('flanc', P, Z)) === JSON.stringify({ x: 0, y: 10, z: -4 }));
ok('place(face) : x à droite, y vers le bas',
  JSON.stringify(place('face', P, Z)) === JSON.stringify({ x: 10, y: 0, z: -4 }));
ok('place : la pose déplace la pièce en bloc',
  JSON.stringify(place('dessus', P, { x: 1, y: 2, z: 3 })) === JSON.stringify({ x: 11, y: 6, z: 3 }));

// --- encombrement : la cote qu'on lit sur un plan de montage -------------------
const carre = (w, h) => [
  { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
];
const plaque = { plan: 'dessus', ep: 3, pos: { x: 0, y: 0, z: 14 }, poly: carre(100, 80), miroir: 'z' };
const boiteSeule = encombrement([{ ...plaque, miroir: '' }]);
ok('encombrement : l\'épaisseur ne compte QUE le long de la normale',
  boiteSeule.x === 100 && boiteSeule.y === 80 && boiteSeule.z === 3,
  `${boiteSeule.x}×${boiteSeule.y}×${boiteSeule.z}`);
const boiteMiroir = encombrement([plaque]);
ok('encombrement : une pièce en miroir compte pour deux',
  boiteMiroir.z === 31, `z = ${boiteMiroir.z} (2 × 14 + 3 attendu)`);
ok('poses : une pièce en miroir a deux poses symétriques',
  poses(plaque).length === 2 && poses(plaque)[1].z === -14, JSON.stringify(poses(plaque)));
ok('poses : sans miroir, une seule pose', poses({ ...plaque, miroir: '' }).length === 1);
// Contre-épreuve : le même dessin posé sur un autre plan ne donne PAS la même
// boîte — un banc qui ne verrait pas ça ne verrait pas non plus une pièce de
// travers.
const debout = encombrement([{ ...plaque, plan: 'flanc', miroir: '' }]);
ok('contre-épreuve : la même pièce posée de flanc n\'a pas la même boîte',
  debout.x === 3 && debout.y === 100 && debout.z === 80, `${debout.x}×${debout.y}×${debout.z}`);

// --- mise en volume : ce que le moteur en fait --------------------------------
/** Les sommets 3D d'une pièce épaissie : `xf` est appelé sur CHAQUE point avant
 *  projection, c'est le seul point d'écoute de la géométrie avant qu'elle ne
 *  devienne des polygones plats. */
function sommets(fn) {
  const vus = [];
  fn((p) => { vus.push(p); return p; });
  const axe = (a) => ({ min: Math.min(...vus.map((p) => p[a])), max: Math.max(...vus.map((p) => p[a])) });
  return { pts: vus, x: axe('x'), y: axe('y'), z: axe('z') };
}

for (const [plan, attendu] of [
  ['dessus', { x: [-50, 50], y: [-40, 40], z: [4, 10] }],
  ['flanc', { x: [4, 10], y: [-50, 50], z: [-40, 40] }],
  ['face', { x: [-50, 50], y: [4, 10], z: [-40, 40] }],
]) {
  const s = sommets((xf) => M.slabFaces(carre(100, 80), plan,
    { x: 0, y: 0, z: 0 }, 6, '#bcdff0', [], (p) => xf({
      // La normale porte l'épaisseur : la pièce est décalée de 7 le long d'elle,
      // pour distinguer « épaisseur » de « position » d'un seul coup d'œil.
      x: p.x + 7 * (plan === 'flanc' ? 1 : 0),
      y: p.y + 7 * (plan === 'face' ? 1 : 0),
      z: p.z + 7 * (plan === 'dessus' ? 1 : 0),
    })));
  const dit = (a) => `${s[a].min.toFixed(1)}…${s[a].max.toFixed(1)}`;
  ok(`slabFaces(${plan}) : la pièce occupe ses cotes en mm`,
    near(s.x.min, attendu.x[0], 0.01) && near(s.x.max, attendu.x[1], 0.01)
    && near(s.y.min, attendu.y[0], 0.01) && near(s.y.max, attendu.y[1], 0.01)
    && near(s.z.min, attendu.z[0], 0.01) && near(s.z.max, attendu.z[1], 0.01),
    `${dit('x')} / ${dit('y')} / ${dit('z')}`);
}
ok('planeNormal : l\'épaisseur d\'une pièce de flanc part en travers du robot',
  Math.abs(M.planeNormal('flanc').x) === 1 && M.planeNormal('dessus').z !== 0,
  JSON.stringify(M.planeNormal('flanc')));

// --- assemblage complet : miroir, échelle, éclaté ------------------------------
const DEMO = {
  source: 'test',
  box: { x: 100, y: 80, z: 31 },
  axes: { hanche: { x: 28, y: 0, z: 14 } },
  pieces: [
    { name: 'flanc', plan: 'flanc', mat: 'pmma', ep: 3, pos: { x: 20, y: 0, z: 0 },
      w: 40, h: 20, poly: carre(40, 20), miroir: 'x' },
    { name: 'pont', plan: 'dessus', mat: 'alu', ep: 3, pos: { x: 0, y: 0, z: 0 },
      w: 40, h: 20, poly: carre(40, 20) },
  ],
};
const sansMiroir = { ...DEMO, pieces: [DEMO.pieces[0]] };
const nb = (a, opts) => M.assemblyFaces(a, opts).length;
ok('assemblyFaces : une pièce en miroir est dessinée deux fois',
  nb(sansMiroir) === 2 * nb({ ...DEMO, pieces: [{ ...DEMO.pieces[0], miroir: '' }] }),
  `${nb(sansMiroir)} faces`);
const s1 = sommets((xf) => M.assemblyFaces(sansMiroir, { xf }));
ok('assemblyFaces : les deux exemplaires sont symétriques',
  near(s1.x.min, -21.5, 0.01) && near(s1.x.max, 21.5, 0.01),
  `x de ${s1.x.min.toFixed(2)} à ${s1.x.max.toFixed(2)}`);
const s2 = sommets((xf) => M.assemblyFaces(sansMiroir, { scale: 2, xf }));
ok('assemblyFaces : `scale` convertit les mm en unités de feuille, épaisseur comprise',
  near(s2.x.max, 2 * s1.x.max, 0.01) && near(s2.y.max, 2 * s1.y.max, 0.01),
  `${s1.x.max.toFixed(2)} → ${s2.x.max.toFixed(2)}`);
const s3 = sommets((xf) => M.assemblyFaces(sansMiroir, { eclate: 10, xf }));
ok('assemblyFaces : l\'éclaté écarte chaque pièce du côté où elle est déjà',
  near(s3.x.max - s1.x.max, 10, 0.01) && near(s3.x.min - s1.x.min, -10, 0.01),
  `${s1.x.max.toFixed(2)} → ${s3.x.max.toFixed(2)}`);
const centre = sommets((xf) => M.assemblyFaces({ ...DEMO, pieces: [DEMO.pieces[1]] }, { eclate: 10, xf }));
const centre0 = sommets((xf) => M.assemblyFaces({ ...DEMO, pieces: [DEMO.pieces[1]] }, { xf }));
ok('assemblyFaces : une pièce pile au milieu ne bouge pas à l\'éclaté',
  near(centre.z.max, centre0.z.max, 0.01), `${centre0.z.max} → ${centre.z.max}`);
/** Les teintes d'une pièce, dans l'ordre des faces : la matière ne change que
 *  ça, et c'est tout ce qu'elle doit changer. */
const teintes = (mat) => M.assemblyFaces({ ...DEMO, pieces: [{ ...DEMO.pieces[1], mat }] })
  .map((f) => f.fill ?? f.color).join('|');
ok('assemblyFaces : la matière donne la couleur', teintes('alu') !== teintes('servo'),
  `${teintes('alu').slice(0, 24)}… contre ${teintes('servo').slice(0, 24)}…`);
ok('assemblyFaces : une matière inconnue est dessinée en PMMA',
  teintes('titane') === teintes('pmma'));

// --- la couleur vient du DESSIN, transparence comprise -------------------------
// Depuis v2026.8.33, une pièce a en volume la couleur qu'elle a sur la planche.
// Le piège est l'alpha : il traverse l'éclairage, les perçages et la mise en
// volume sans jamais être multiplié par la lumière, sinon un flanc translucide
// deviendrait opaque à l'ombre.
const alpha = (c) => (c.startsWith('rgba(') ? Number(c.match(/[\d.]+/g)[3]) : 1);
ok('shade : une couleur opaque sort en rgb(), sans alpha',
  M.shade('#bcdff0', 1) === 'rgb(188,223,240)', M.shade('#bcdff0', 1));
ok('shade : `#rrggbbaa` garde sa transparence',
  alpha(M.shade('#bcdff08c', 1)) > 0.54 && alpha(M.shade('#bcdff08c', 1)) < 0.56,
  M.shade('#bcdff08c', 1));
ok('shade : l\'éclairage ne touche pas l\'alpha',
  alpha(M.shade('#bcdff08c', 0.45)) === alpha(M.shade('#bcdff08c', 1.2)),
  `${M.shade('#bcdff08c', 0.45)} contre ${M.shade('#bcdff08c', 1.2)}`);
ok('shade : assombrir assombrit vraiment les canaux',
  Number(M.shade('#bcdff08c', 0.45).match(/[\d.]+/g)[0]) < 188, M.shade('#bcdff08c', 0.45));
// Le fond d'un perçage est déjà assombri quand sa face l'éclaire à son tour :
// shade doit savoir relire ce qu'il a écrit.
ok('shade : relit son propre rgba() (le fond d\'un perçage repasse par l\'éclairage)',
  alpha(M.shade(M.shade('#bcdff08c', 0.45), 0.8)) === alpha(M.shade('#bcdff08c', 1)),
  M.shade(M.shade('#bcdff08c', 0.45), 0.8));
/** Les teintes d'une pièce à laquelle on greffe ce qu'on veut (couleur lue,
 *  matière écrite), dans l'ordre des faces. */
const teintesDe = (extra) => M.assemblyFaces({ ...DEMO, pieces: [{ ...DEMO.pieces[1], ...extra }] })
  .map((f) => f.fill).join('|');
ok('assemblyFaces : la couleur LUE passe devant `mat=`',
  teintesDe({ mat: 'servo', fill: '#bcdff0ff' }) === teintesDe({ mat: 'pmma' }),
  `${teintesDe({ mat: 'servo', fill: '#bcdff0ff' }).slice(0, 24)}…`);
ok('assemblyFaces : sans couleur lue, `mat=` répond encore',
  teintesDe({ mat: 'alu' }) === teintes('alu'));
ok('assemblyFaces : une pièce translucide l\'est sur TOUTES ses faces',
  teintesDe({ fill: '#bcdff08c' }).split('|').every((c) => alpha(c) < 0.6),
  teintesDe({ fill: '#bcdff08c' }).slice(0, 40));
// Le liseré bouche les coutures d'anticrénelage entre triangles voisins. Sur une
// face translucide il se recouvre lui-même — quatre couches de couleur sur chaque
// arête intérieure, soit une toile d'araignée sur toute la pièce.
const attributs = (fill) => JSON.stringify(
  M.renderFaces([{ pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], z: 0, fill }], 0, 0)[0].values);
ok('renderFaces : une face opaque garde son liseré de même couleur',
  attributs('rgb(188,223,240)').split('rgb(188,223,240)').length === 3,
  attributs('rgb(188,223,240)'));
ok('renderFaces : une face translucide n\'a PAS de liseré',
  attributs('rgba(188,223,240,0.55)').includes('"none"'), attributs('rgba(188,223,240,0.55)'));

// --- les pastilles rouges font les AXES DE ROTATION ---------------------------
// Règle du dessin (v2026.8.34) : deux pastilles de même PRÉFIXE (« hanche-g-h »
// et « hanche-g-b ») sont les deux bouts d'un même axe. C'est par ces axes que
// deux sous-ensembles s'assemblent — le fémur tourne autour de la hanche du
// corps — et rien de tout ça ne se voit sur une image.
ok('axisPrefix : le dernier segment distingue les deux bouts',
  M.axisPrefix('hanche-g-h') === 'hanche-g' && M.axisPrefix('hanche-g-b') === 'hanche-g',
  M.axisPrefix('hanche-g-h'));
ok('axisPrefix : un nom d\'un seul segment est son propre préfixe (un point, pas un axe)',
  M.axisPrefix('genou') === 'genou');
const AX = {
  'hanche-g-h': { x: 20, y: -10, z: 8 },
  'hanche-g-b': { x: 20, y: -10, z: -8 },
  'genou': { x: 0, y: 0, z: 0 },
};
const rots = M.rotationAxes(AX);
ok('rotationAxes : deux pastilles de même préfixe font UN axe', rots.length === 1,
  rots.map((r) => r.name).join(', '));
ok('rotationAxes : l\'axe porte le préfixe, pas le nom d\'une pastille',
  rots[0]?.name === 'hanche-g', rots[0]?.name);
ok('rotationAxes : `at` est au milieu des deux pastilles',
  near(rots[0].at.x, 20, 1e-6) && near(rots[0].at.y, -10, 1e-6) && near(rots[0].at.z, 0, 1e-6),
  JSON.stringify(rots[0].at));
ok('rotationAxes : `dir` est unitaire et `len` est l\'écart réel',
  near(Math.hypot(rots[0].dir.x, rots[0].dir.y, rots[0].dir.z), 1, 1e-9) && near(rots[0].len, 16, 1e-6),
  `${rots[0].len} mm`);
// Une pastille seule reste un POINT d'accostage (assemblyAxis la rend), mais elle
// ne dit pas autour de quoi on tourne.
ok('rotationAxes : une pastille seule n\'est pas un axe',
  !rots.some((r) => r.name === 'genou'));
ok('rotationAxes : `scale` s\'applique aux deux bouts',
  near(M.rotationAxes(AX, 2)[0].len, 32, 1e-6), `${M.rotationAxes(AX, 2)[0].len}`);
// Trois pastilles alignées : ce sont les deux plus ÉLOIGNÉES qui portent l'axe,
// les autres sont dessus et ne le définissent pas mieux.
const trois = M.rotationAxes({
  'a-1': { x: 0, y: 0, z: 0 }, 'a-2': { x: 0, y: 0, z: 5 }, 'a-3': { x: 0, y: 0, z: 20 },
});
ok('rotationAxes : à trois pastilles, les deux plus éloignées portent l\'axe',
  trois.length === 1 && near(trois[0].len, 20, 1e-6), `${trois[0]?.len}`);
ok('rotationAxes : deux pastilles superposées ne font pas une droite',
  M.rotationAxes({ 'b-1': { x: 1, y: 2, z: 3 }, 'b-2': { x: 1, y: 2, z: 3 } }).length === 0);
ok('rotationAxes : un ASSEMBLAGE se lit directement (ses pastilles sont dans .axes)',
  M.rotationAxes({ ...DEMO, axes: AX }).length === 1);
ok('assemblyAxis : une pastille absente ne fabrique pas de point',
  M.assemblyAxis(DEMO, 'jamais-dessine') === null
  && M.assemblyAxis(DEMO, 'hanche')?.x === 28);

// --- les ARTICULATIONS et le MONTAGE du robot entier ---------------------------
// Règle du dessin (v2026.8.36) : le PRÉFIXE fait l'articulation (« hanche-ag-h »
// + « hanche-ag-b » → l'articulation « hanche-ag »), le PREMIER SEGMENT fait la
// famille (« hanche »). Deux ensembles qui portent la même famille s'emboîtent, et
// celui qui en offre le plus porte l'autre : quatre hanches, quatre pattes.
// Rien de tout ça ne se voit sur une image — quatre pattes empilées au même
// endroit ressemblent à une patte.
ok('axisFamily : la famille est le PREMIER segment',
  M.axisFamily('hanche-ag') === 'hanche' && M.axisFamily('hanche-ag-h') === 'hanche',
  M.axisFamily('hanche-ag-h'));
ok('axisFamily : un nom d\'un seul segment est sa propre famille',
  M.axisFamily('genou') === 'genou');
const arts = M.articulations(AX);
ok('articulations : une pastille SEULE est une articulation (un point de pivot)',
  arts.length === 2 && arts.some((j) => j.name === 'genou' && j.dir === null),
  arts.map((j) => j.name).join(', '));
ok('articulations : deux pastilles de même préfixe n\'en font qu\'UNE, avec sa direction',
  arts.find((j) => j.name === 'hanche-g')?.dir !== null
  && near(arts.find((j) => j.name === 'hanche-g').len, 16, 1e-6));
ok('articulations : la famille accompagne l\'articulation',
  arts.find((j) => j.name === 'hanche-g')?.famille === 'hanche');

/** Un ensemble d'essai : ses pastilles et le centre de ses pièces suffisent au
 *  monteur — c'est tout ce qu'il regarde. */
const ens = (nom, axes, pos) => ({
  nom,
  A: { source: 't', box: { x: 1, y: 1, z: 1 }, axes, pieces: [{ name: 'p', plan: 'dessus', mat: 'pmma', ep: 3, pos, w: 1, h: 1, poly: carre(1, 1) }] },
});
// Quatre hanches = quatre PRÉFIXES distincts, donc quatre paires de pastilles.
// C'est le piège du dessin : `hanche-ag` et `hanche-ad` en pastilles seules
// partagent le préfixe « hanche » et ne feraient qu'UNE articulation, au milieu
// du corps.
const ROBOT = [
  ens('corps', {
    'hanche-ag-h': { x: -20, y: -20, z: 10 }, 'hanche-ag-b': { x: -20, y: -20, z: -10 },
    'hanche-ad-h': { x: 20, y: -20, z: 10 }, 'hanche-ad-b': { x: 20, y: -20, z: -10 },
    'hanche-rg-h': { x: -20, y: 20, z: 10 }, 'hanche-rg-b': { x: -20, y: 20, z: -10 },
    'hanche-rd-h': { x: 20, y: 20, z: 10 }, 'hanche-rd-b': { x: 20, y: 20, z: -10 },
  }, { x: 0, y: 0, z: 0 }),
  ens('femur', {
    'hanche-h': { x: 0, y: 0, z: 10 }, 'hanche-b': { x: 0, y: 0, z: -10 },
    'genou-g': { x: -10, y: 30, z: 0 }, 'genou-d': { x: 10, y: 30, z: 0 },
  }, { x: 0, y: 15, z: 0 }),
  ens('tibia', {
    'genou-g': { x: -10, y: 0, z: 0 }, 'genou-d': { x: 10, y: 0, z: 0 },
    pied: { x: 0, y: 25, z: -30 },
  }, { x: 0, y: 12, z: -15 }),
];
/** Le point d'une articulation dans le repère de son ensemble. */
const artAt = (A, nom) => M.articulations(A).find((j) => j.name === nom).at;
const MO = M.montage(ROBOT);
const combien = (n) => MO.filter((i) => i.nom === n).length;
ok('montage : la BASE est celle qui offre le plus d\'articulations',
  MO[0]?.nom === 'corps' && !MO[0].parent, `${MO[0]?.nom}`);
ok('montage : quatre hanches donnent quatre fémurs', combien('femur') === 4, `${combien('femur')}`);
ok('montage : chaque fémur porte son tibia — quatre aussi', combien('tibia') === 4, `${combien('tibia')}`);
ok('montage : chaque exemplaire dit sur QUELLE articulation il s\'est posé',
  new Set(MO.filter((i) => i.nom === 'femur').map((i) => i.via)).size === 4,
  MO.filter((i) => i.nom === 'femur').map((i) => i.via).join(', '));
/** Un point d'un ensemble, placé dans le monde par son exemplaire. */
const monde = (inst, p) => M.add(M.rotZ(p, inst.lacet), inst.pos);
const corpsI = MO.find((i) => i.nom === 'corps');
let ecartMax = 0;
for (const f of MO.filter((i) => i.nom === 'femur')) {
  const surLeCorps = monde(corpsI, artAt(ROBOT[0].A, f.via));
  ecartMax = Math.max(ecartMax, M.len(M.sub(monde(f, artAt(ROBOT[1].A, 'hanche')), surLeCorps)));
}
ok('montage : les articulations sont SUPERPOSÉES — la hanche du fémur tombe sur celle du corps',
  ecartMax < 1e-9, `${ecartMax.toFixed(9)} mm`);
let ecartGenou = 0;
const fems = MO.filter((i) => i.nom === 'femur');
for (const [n, t] of MO.filter((i) => i.nom === 'tibia').entries()) {
  ecartGenou = Math.max(ecartGenou,
    M.len(M.sub(monde(t, artAt(ROBOT[2].A, 'genou')), monde(fems[n], artAt(ROBOT[1].A, 'genou')))));
}
ok('montage : le tibia se pose sur le genou de SON fémur', ecartGenou < 1e-9,
  `${ecartGenou.toFixed(9)} mm`);
// Quatre pattes empilées au même endroit, c'est le défaut qu'on ne voit pas sur
// une image : chacune doit partir du côté où sa hanche se trouve déjà.
ok('montage : les quatre pattes sont ÉCARTÉES, pas empilées',
  new Set(fems.map((i) => Math.round(i.lacet))).size === 4,
  fems.map((i) => Math.round(i.lacet)).join('°, ') + '°');
ok('montage : un tibia suit le lacet de son fémur (une famille à une articulation ne tourne rien)',
  MO.filter((i) => i.nom === 'tibia').every((t, n) => near(t.lacet, fems[n].lacet, 1e-9)));
const SEUL = M.montage([...ROBOT, ens('carte', { trou: { x: 0, y: 0, z: 0 } }, { x: 0, y: 0, z: 0 })]);
ok('montage : un ensemble sans famille commune reste à sa place, sans parent',
  SEUL.filter((i) => i.nom === 'carte').length === 1
  && !SEUL.find((i) => i.nom === 'carte').parent);
ok('montage : sans aucune articulation partagée, rien n\'est monté (la rangée reprend la main)',
  M.montage([ens('a', {}, { x: 0, y: 0, z: 0 }), ens('b', {}, { x: 0, y: 0, z: 0 })])
    .every((i) => !i.parent));

// --- les pastilles d'un PROFIL : même règle, pièce isolée ----------------------
// Un profil est dessiné SEUL puis posé entre deux articulations, à l'échelle. Ses
// pastilles doivent suivre la pièce : sinon le tibia s'accoste sur un genou resté
// aux cotes du dessin, et la patte se disloque à la première mise à l'échelle.
const OS = { poly: carre(80, 10), w: 80, h: 10, axes: { hanche: { x: -30, y: 0 }, genou: { x: 30, y: 0 } } };
const posA = M.profileAxes(OS, { x: 0, y: 0, z: 0 }, { x: 80, y: 0, z: 0 });
ok('profileAxes : la pastille est posée dans le monde, bord gauche sur `from`',
  near(posA.hanche.x, 10, 1e-6) && near(posA.genou.x, 70, 1e-6),
  `${posA.hanche.x} → ${posA.genou.x}`);
const posB = M.profileAxes(OS, { x: 0, y: 0, z: 0 }, { x: 160, y: 0, z: 0 });
ok('profileAxes : les pastilles suivent la MISE À L\'ÉCHELLE de la pièce',
  near(posB.genou.x - posB.hanche.x, 2 * (posA.genou.x - posA.hanche.x), 1e-6),
  `${(posA.genou.x - posA.hanche.x).toFixed(1)} → ${(posB.genou.x - posB.hanche.x).toFixed(1)}`);
const posC = M.profileAxes(OS, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -80 });
ok('profileAxes : une pièce posée debout emporte ses pastilles',
  near(posC.hanche.z, -10, 1e-6) && near(posC.genou.z, -70, 1e-6),
  `${posC.hanche.z} → ${posC.genou.z}`);
ok('profileAxes : un profil sans pastille ne rend rien (et ne casse pas)',
  Object.keys(M.profileAxes({ poly: carre(10, 10), w: 10, h: 10 },
    { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).length === 0);
// Un point du dessin doit tomber sur la pièce : la pastille du genou est dans la
// matière, pas à côté. C'est le contrôle qui attrape un repère de dessin oublié.
const osFaces = M.extrudeProfile(OS, { x: 0, y: 0, z: 0 }, { x: 80, y: 0, z: 0 }, 4, '#888888');
const xsOs = osFaces.flatMap((f) => f.pts.map((q) => q.x));
ok('profileAxes : les pastilles tombent DANS la pièce mise en volume',
  Object.values(posA).every((v) => v.x >= -1e-6 && v.x <= 80 + 1e-6) && xsOs.length > 0);
// Les profils rangés : les pastilles de Frank, telles que l'extracteur les a lues.
for (const nom of M.PROFILS) {
  const p = M.profile(nom);
  for (const [axe, v] of Object.entries(p.axes)) {
    ok(`profil ${nom} : pastille « ${axe} » lisible et dans la boîte`,
      Number.isFinite(v.x) && Number.isFinite(v.y)
      && Math.abs(v.x) <= p.w / 2 + 1 && Math.abs(v.y) <= p.h / 2 + 1,
      `(${v.x}, ${v.y}) dans ${p.w}×${p.h}`);
  }
}

// --- ce que le lecteur a rangé ------------------------------------------------
const noms = M.ASSEMBLAGES;
ok('assemblages.mts : au moins un assemblage rangé', noms.length > 0, noms.join(', '));
for (const nom of noms) {
  const a = M.assemblage(nom);
  ok(`${nom} : des pièces`, a.pieces.length > 0, `${a.pieces.length}`);
  ok(`${nom} : lu depuis un dessin nommé`, typeof a.source === 'string' && a.source.length > 0, a.source);
  for (const p of a.pieces) {
    ok(`${nom}/${p.name} : plan connu`, PLANS.includes(p.plan), p.plan);
    ok(`${nom}/${p.name} : matière connue`, !!M.MATIERES[p.mat], p.mat);
    // La couleur lue est rangée telle quelle, en `#rrggbbaa` : une pièce sans
    // remplissage n'en a pas, et retombe sur sa matière.
    if (p.fill !== undefined) {
      ok(`${nom}/${p.name} : couleur lue bien formée`, /^#[0-9a-f]{8}$/i.test(p.fill), p.fill);
    }
    ok(`${nom}/${p.name} : épaisseur réelle`, p.ep > 0 && p.ep < 200, `${p.ep} mm`);
    ok(`${nom}/${p.name} : contour fermé exploitable`, p.poly.length >= 3, `${p.poly.length} points`);
    ok(`${nom}/${p.name} : aucune coordonnée aberrante`,
      p.poly.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
      && [p.pos.x, p.pos.y, p.pos.z].every(Number.isFinite));
    // Centré sur sa boîte : c'est la POSE qui place la pièce, pas sa place sur
    // la planche à découper.
    const xs = p.poly.map((q) => q.x);
    const ys = p.poly.map((q) => q.y);
    ok(`${nom}/${p.name} : centré sur sa boîte englobante`,
      near(Math.min(...xs) + Math.max(...xs), 0, 0.05) && near(Math.min(...ys) + Math.max(...ys), 0, 0.05),
      `${(Math.min(...xs) + Math.max(...xs)).toFixed(2)}`);
    ok(`${nom}/${p.name} : cotes annoncées conformes au contour`,
      near(Math.max(...xs) - Math.min(...xs), p.w, 0.05)
      && near(Math.max(...ys) - Math.min(...ys), p.h, 0.05), `${p.w}×${p.h}`);
    if (p.miroir) ok(`${nom}/${p.name} : axe de miroir valide`, 'xyz'.includes(p.miroir), p.miroir);
  }
  // L'encombrement rangé doit être celui que le calcul redonne : c'est la cote
  // affichée par `montre`, et le premier signe qu'une pièce est posée de travers.
  const box = encombrement(a.pieces);
  ok(`${nom} : encombrement conforme au calcul`,
    near(box.x, a.box.x, 0.05) && near(box.y, a.box.y, 0.05) && near(box.z, a.box.z, 0.05),
    `${a.box.x}×${a.box.y}×${a.box.z} contre ${box.x}×${box.y}×${box.z}`);
  for (const [axe, v] of Object.entries(a.axes)) {
    ok(`${nom} : axe « ${axe} » lisible`,
      [v.x, v.y, v.z].every(Number.isFinite)
      && Math.abs(v.x) <= a.box.x && Math.abs(v.y) <= a.box.y && Math.abs(v.z) <= a.box.z,
      `(${v.x}, ${v.y}, ${v.z})`);
  }
  // Les axes de rotation lus sur le dessin de Frank : une droite qui sort de
  // l'encombrement, c'est une pastille mal nommée — deux articulations qui se
  // sont retrouvées sous le même préfixe.
  for (const r of M.rotationAxes(a)) {
    const diag = Math.hypot(a.box.x, a.box.y, a.box.z);
    ok(`${nom} : axe de rotation « ${r.name} » plausible`,
      r.len > 0.5 && r.len <= diag + 0.05 && near(Math.hypot(r.dir.x, r.dir.y, r.dir.z), 1, 1e-9),
      `${r.len.toFixed(1)} mm sur ${diag.toFixed(1)} de diagonale`);
  }
  ok(`${nom} : mis en volume sans faute`, M.assemblyFaces(a, { scale: 1 }).length > 0);
  ok(`${nom} : aucun point projeté aberrant`,
    M.assemblyFaces(a, { scale: 1 }).every((f) =>
      f.pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))));
}
ok('hasAssemblage : un assemblage jamais dessiné est reconnu absent',
  !M.hasAssemblage('rien-du-tout') && (!noms.length || M.hasAssemblage(noms[0])));

const fail = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - fail.length}/${checks.length} contrôles`);
process.exit(fail.length ? 1 : 0);
