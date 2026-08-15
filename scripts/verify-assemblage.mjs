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
import {
  parsePose, place, poses, encombrement, axeDePastille, NORMALE, PLANS, MATIERES,
} from './_extract-assemblage.mjs';
import { parseSysteme } from './_lire-contours.mjs';

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
ok('parsePose : un nom d\'axe n\'est pas une étiquette', parsePose('coxa-g') === null);
ok('parsePose : un texte vide n\'est pas une étiquette', parsePose('   ') === null);
ok('parsePose : une position mal écrite est ignorée (pièce au centre, visible)',
  parsePose('dessus pos=3,4').pos.x === 0, JSON.stringify(parsePose('dessus pos=3,4').pos));
// --- l'étiquette de TAILLE du système (v2026.8.65) ----------------------------
// « système : araignee largeur : 800 », posée à côté des pièces (hors groupe) :
// c'est Frank qui décide dans Inkscape de la taille du dessin fini, en pixels de
// la grille, au lieu d'un nombre écrit dans le code.
const sys1 = parseSysteme('système : araignee largeur : 800');
ok('parseSysteme : nom et largeur lus', sys1?.nom === 'araignee' && sys1?.largeur === 800, JSON.stringify(sys1));
ok('parseSysteme : accents, casse, « = » et ordre libre',
  JSON.stringify(parseSysteme('Largeur=456 Systeme=patte')) === JSON.stringify({ nom: 'patte', largeur: 456 }),
  JSON.stringify(parseSysteme('Largeur=456 Systeme=patte')));
ok('parseSysteme : une largeur à virgule est arrondie au pixel',
  parseSysteme('système: araignee largeur: 799,6')?.largeur === 800);
ok('parseSysteme : sans largeur, le nom sort quand même (le lecteur préviendra)',
  parseSysteme('système : araignee')?.largeur === null);
ok('parseSysteme : un texte quelconque n\'est pas une étiquette de système',
  parseSysteme('dessus pos=0,0,15.75 ep=1') === null && parseSysteme('coxa-g') === null);
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
  axes: { coxa: { x: 28, y: 0, z: 14 } },
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
// face translucide il se recouvrirait lui-même — quatre couches de couleur sur
// chaque arête intérieure, soit une toile d'araignée sur toute la pièce. D'où la
// règle de la v2026.8.56 : la TRANSPARENCE est portée par la pièce (un
// `<g opacity>`), ses faces s'y peignent pleines, liseré compris.
const tri = (fill, g) => ({ pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], z: 0, fill, g });
const attributs = (fill, g) => JSON.stringify(M.renderFaces([tri(fill, g)], 0, 0)[0].values);
ok('renderFaces : une face opaque garde son liseré de même couleur',
  attributs('rgb(188,223,240)').split('rgb(188,223,240)').length === 3,
  attributs('rgb(188,223,240)'));
ok('renderFaces : une face translucide sort dans un groupe qui porte son alpha',
  attributs('rgba(188,223,240,0.55)').startsWith('[0.55,'), attributs('rgba(188,223,240,0.55)'));
ok('renderFaces : dans ce groupe, la face est PLEINE et garde son liseré',
  attributs('rgba(188,223,240,0.55)').split('rgb(188,223,240)').length === 3
  && !attributs('rgba(188,223,240,0.55)').includes('rgba('),
  attributs('rgba(188,223,240,0.55)'));
// Deux triangles de la MÊME pièce ne font qu'un groupe : c'est ce qui supprime la
// double couche sur leur arête commune.
const groupes = M.renderFaces([tri('rgba(188,223,240,0.55)', 7), tri('rgba(188,223,240,0.55)', 7)], 0, 0);
ok('renderFaces : les faces d\'une même pièce translucide tiennent dans UN groupe',
  groupes.length === 1 && groupes[0].values[1].length === 2, `${groupes.length} groupe(s)`);
ok('renderFaces : deux pièces translucides restent deux groupes',
  M.renderFaces([tri('rgba(188,223,240,0.55)', 7), tri('rgba(188,223,240,0.55)', 8)], 0, 0).length === 2);

// --- IMAGE PLAQUÉE sur une pièce (v2026.8.59) ---------------------------------
// Frank pose la photo d'une carte sur son contour dans Inkscape : elle doit se
// retrouver plaquée sur la pièce en volume, découpée à son contour et avec la
// transparence qu'il lui a donnée. Trois pièges, tous muets :
//   1. l'image est en MILLIMÈTRES comme le contour : oublier l'échelle la
//      laisserait grande comme un timbre au milieu de la plaque ;
//   2. elle va sur le côté VU de la pièce, qui dépend du lacet de présentation
//      et pas seulement du plan (un flanc gauche devient un flanc droit) ;
//   3. elle doit être rangée DEVANT la pièce, sinon elle disparaît sous les
//      triangles de sa propre plaque (le piège des perçages, v2026.8.31).
const PIXEL = 'data:image/webp;base64,AAAA';
const avecImage = (extra = {}) => ({
  ...DEMO,
  pieces: [{ ...DEMO.pieces[1], fill: '#bcdff0ff',
    img: { href: PIXEL, o: { x: -20, y: -10 }, u: { x: 40, y: 0 }, v: { x: 0, y: 20 }, alpha: 0.8, ...extra } }],
});
const faceImage = (a, opts = {}) => M.assemblyFaces(a, opts).find((f) => f.img);
const fi = faceImage(avecImage());
ok('image : une pièce qui en porte une sort UNE face d\'image en plus',
  !!fi && M.assemblyFaces(avecImage()).filter((f) => f.img).length === 1);
ok('image : le bitmap est repris tel quel (data: embarqué)', fi?.img?.href === PIXEL);
ok('image : son opacité est celle du dessin', fi?.img?.alpha === 0.8, String(fi?.img?.alpha));
// Le calage : le bitmap couvre ici EXACTEMENT le contour (40×20 mm centrés), donc
// ses trois points projetés doivent tomber pile sur trois coins de la pièce. Une
// échelle oubliée le laisserait grand comme un timbre au milieu de la plaque.
const lg = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const meme = (a, b) => a && b && near(a.x, b.x, 0.01) && near(a.y, b.y, 0.01);
ok('image : ses trois points tombent sur les coins de la pièce (mêmes millimètres)',
  fi && meme(fi.img.o, fi.pts[0]) && meme(fi.img.u, fi.pts[1]) && meme(fi.img.v, fi.pts[3]),
  fi && `${JSON.stringify(fi.img.o)} contre ${JSON.stringify(fi.pts[0])}`);
const fi2 = faceImage(avecImage(), { scale: 2 });
ok('image : `scale` la met à l\'échelle comme le contour',
  fi && fi2 && near(lg(fi2.img.o, fi2.img.u), 2 * lg(fi.img.o, fi.img.u), 0.01),
  `${lg(fi.img.o, fi.img.u).toFixed(2)} → ${lg(fi2.img.o, fi2.img.u).toFixed(2)}`);
// Un bitmap plus petit que la pièce reste plus petit : il se pose, il ne remplit
// pas (le piège du <pattern>, qui aurait carrelé la plaque).
const petit = faceImage(avecImage({ u: { x: 20, y: 0 }, v: { x: 0, y: 10 } }));
ok('image : un bitmap plus petit que la pièce ne s\'étire pas pour la remplir',
  fi && petit && near(lg(petit.img.o, petit.img.u), lg(fi.img.o, fi.img.u) / 2, 0.01)
  && petit.pts.length === fi.pts.length,
  `${lg(fi.img.o, fi.img.u).toFixed(2)} → ${lg(petit.img.o, petit.img.u).toFixed(2)}`);
ok('image : elle est découpée au CONTOUR de la pièce, pas au rectangle du bitmap',
  fi && fi.pts.length === DEMO.pieces[1].poly.length, fi && fi.pts.length);
ok('image : elle est rangée DEVANT toutes les faces de sa pièce',
  fi && M.assemblyFaces(avecImage()).filter((f) => !f.img).every((f) => f.z < fi.z));
// Le côté vu : un flanc retourné d'un demi-tour montre son AUTRE face. L'image
// doit changer de côté avec lui — donc rester décalée du même côté à l'écran,
// vers l'œil. Si elle suivait bêtement le plan, le demi-tour l'enverrait derrière
// la matière et elle disparaîtrait.
const flanc = { ...DEMO, pieces: [{ ...DEMO.pieces[0], miroir: '',
  img: { href: PIXEL, o: { x: -20, y: -10 }, u: { x: 40, y: 0 }, v: { x: 0, y: 20 }, alpha: 1 } }] };
const moyenne = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }),
  { x: 0, y: 0 });
/** De combien l'image est soulevée au-dessus du milieu de sa pièce, à l'écran. */
const souleve = (yaw) => {
  const fs = M.assemblyFaces(flanc, { xf: (p) => M.rotZ(p, yaw) });
  const im = fs.find((f) => f.img);
  const c = moyenne(im.pts);
  const m = moyenne(fs.filter((f) => !f.img).flatMap((f) => f.pts));
  return { x: c.x - m.x, y: c.y - m.y };
};
ok('image : elle se plaque sur le côté VU, lacet compris',
  meme(souleve(0), souleve(180)) && lg({ x: 0, y: 0 }, souleve(0)) > 0.5,
  `${JSON.stringify(souleve(0))} contre ${JSON.stringify(souleve(180))}`);
// Sortie SVG : un découpage nommé, un groupe qui porte l'opacité, et la matrice
// qui amène le carré unité sur le parallélogramme de la face.
const svgImage = JSON.stringify(M.renderFaces([fi], 0, 0)[0].values);
ok('renderFaces : l\'image sort avec son découpage, son opacité et sa matrice',
  svgImage.includes('kx-img-') && svgImage.includes('url(#kx-img-')
  && svgImage.includes('matrix(') && svgImage.includes(PIXEL) && svgImage.includes('0.8'),
  svgImage.slice(0, 120));
ok('renderFaces : une pièce SANS image ne sort ni image ni découpage',
  !JSON.stringify(M.renderFaces([tri('rgb(1,2,3)')], 0, 0)[0].values).includes('kx-img-'));

// --- l'allègement des contours garde les COINS (v2026.8.56) --------------------
// Douglas-Peucker ne connaît que l'écart à la corde : sur le PCA9685 du robot,
// large de 26 px à l'écran, ses détrompeurs d'un millimètre passaient sous la
// tolérance — et les points de coin partaient avec eux, si bien que les bords
// droits se mettaient à onduler. La carte sortait chiffonnée.
const rect = (w, h, pas) => {
  const p = [];
  for (let x = 0; x < w; x += pas) p.push({ x, y: 0 });
  for (let y = 0; y < h; y += pas) p.push({ x: w, y });
  for (let x = w; x > 0; x -= pas) p.push({ x, y: h });
  for (let y = h; y > 0; y -= pas) p.push({ x: 0, y });
  return p;
};
const carte = rect(26, 19, 1);
const allege = M.simplifyPoly(carte, 0.7);
const ecart = (poly) => Math.max(...poly.map((q) => Math.min(q.x, 26 - q.x, q.y, 19 - q.y)));
ok('simplifyPoly : un rectangle allégé RESTE un rectangle (4 coins, rien qui ondule)',
  allege.length === 4 && ecart(allege) < 1e-9, `${allege.length} points`);
ok('simplifyPoly : un rectangle allégé garde son aire',
  Math.abs(Math.abs(M.signedArea(allege)) - 26 * 19) < 1e-6, Math.abs(M.signedArea(allege)));
// Un détrompeur de 1 mm sur un bord : c'est un coin, il survit.
const encoche = [...carte.slice(0, 10), { x: 10, y: 1.2 }, { x: 12, y: 1.2 }, ...carte.slice(12)];
ok('simplifyPoly : un détrompeur d\'un millimètre survit à la tolérance',
  M.simplifyPoly(encoche, 0.7).some((q) => Math.abs(q.y - 1.2) < 1e-9),
  M.simplifyPoly(encoche, 0.7).length);
// Et l'allègement doit rester un allègement : un cercle Inkscape tourne de
// quelques degrés par point, aucun de ses sommets n'est un coin.
const cercle = M.regularPoly(72, 20);
ok('simplifyPoly : un cercle dense est toujours ALLÉGÉ (pas de coin à garder)',
  M.simplifyPoly(cercle, 0.7).length < cercle.length / 2, M.simplifyPoly(cercle, 0.7).length);

// --- les pastilles rouges font les ARTICULATIONS -------------------------------
// Règle du dessin (v2026.8.42) : UNE pastille rouge = UNE articulation, et son
// PREMIER MOT dit à quoi elle s'emboîte. Ce qui suit ne sert qu'à distinguer deux
// pastilles voisines — Inkscape exige des ids uniques, d'où « patella-f » sur le
// fémur face à « patella-t » sur le tibia. Rien de tout ça ne se voit sur une
// image : quatre pattes empilées au même endroit ressemblent à une patte.
ok('axisFamily : la famille est le PREMIER mot',
  M.axisFamily('coxa-gh') === 'coxa' && M.axisFamily('patella-t') === 'patella',
  M.axisFamily('coxa-gh'));
ok('axisFamily : un nom d\'un seul mot est sa propre famille',
  M.axisFamily('patella') === 'patella');
const AX = {
  'coxa-gh': { x: 20, y: -10, z: 8 },
  'coxa-gb': { x: 20, y: -10, z: -8 },
  'patella': { x: 0, y: 0, z: 0 },
};
const arts = M.articulations(AX);
ok('articulations : CHAQUE pastille en est une — rien n\'est regroupé',
  arts.length === 3, arts.map((j) => j.name).join(', '));
ok('articulations : l\'articulation porte le nom ENTIER de sa pastille',
  arts.some((j) => j.name === 'coxa-gh') && arts.some((j) => j.name === 'coxa-gb'),
  arts.map((j) => j.name).join(', '));
ok('articulations : la famille est le premier mot, deux pastilles voisines la partagent',
  arts.filter((j) => j.famille === 'coxa').length === 2
  && arts.find((j) => j.name === 'patella')?.famille === 'patella');
ok('articulations : `at` est le point de la pastille, tel quel',
  near(arts.find((j) => j.name === 'coxa-gh').at.z, 8, 1e-9)
  && near(arts.find((j) => j.name === 'coxa-gb').at.z, -8, 1e-9));
ok('articulations : `scale` s\'applique au point',
  near(M.articulations(AX, 2).find((j) => j.name === 'coxa-gh').at.x, 40, 1e-9));
ok('articulations : un ASSEMBLAGE se lit directement (ses pastilles sont dans .axes)',
  M.articulations({ ...DEMO, axes: AX }).length === 3);
ok('assemblyAxis : une pastille absente ne fabrique pas de point',
  M.assemblyAxis(DEMO, 'jamais-dessine') === null
  && M.assemblyAxis(DEMO, 'coxa')?.x === 28);

// --- une pastille porte un AXE, pas un point ----------------------------------
// Règle du dessin (v2026.8.43) : deux pièces en MIROIR créent entre elles un axe
// de rotation dirigé selon leur ÉPAISSEUR — la flèche « ép ». Une plaque posée à
// plat donne donc un axe VERTICAL, un flanc un axe en travers du robot. L'axe est
// rangé par son ZÉRO, le milieu des deux exemplaires, et c'est ce zéro qui centre
// deux dessins l'un sur l'autre au montage : sans lui, le fémur se colle contre UN
// flanc au lieu de tenir entre les deux — et sur une image, ça ne se voit pas.
ok('planeAxisDir : une plaque `dessus` pivote autour d\'un axe VERTICAL',
  M.planeAxisDir('dessus') === 'z', M.planeAxisDir('dessus'));
ok('planeAxisDir : un `flanc` tourne autour de x, une `face` autour de y',
  M.planeAxisDir('flanc') === 'x' && M.planeAxisDir('face') === 'y',
  `${M.planeAxisDir('flanc')} / ${M.planeAxisDir('face')}`);
ok('NORMALE : le lecteur et le moteur nomment la MÊME direction',
  PLANS.every((p) => NORMALE[p] === M.planeAxisDir(p)),
  PLANS.map((p) => `${p}→${NORMALE[p]}/${M.planeAxisDir(p)}`).join(' '));
const axPlaque = axeDePastille('dessus', { x: 20, y: -10 }, { x: 0, y: 0, z: -13.75 });
ok('axeDePastille : l\'axe d\'une plaque à plat est VERTICAL', axPlaque.dir === 'z', axPlaque.dir);
ok('axeDePastille : le point rangé est le ZÉRO de l\'axe, pas la pastille dessinée',
  axPlaque.z === 0 && axPlaque.x === 20 && axPlaque.y === -10, JSON.stringify(axPlaque));
// Deux plaques à ±13.75 : l'axe passe pile entre elles. C'est l'épreuve qui dit
// que « centré sur le zéro » vaut bien « au milieu des deux pièces en miroir ».
const deuxPlaques = poses({ pos: { x: 0, y: 0, z: -13.75 }, miroir: 'z' })
  .map((q) => place('dessus', { x: 20, y: -10 }, q));
ok('axeDePastille : l\'axe passe au MILIEU des deux pièces en miroir',
  near(axPlaque.z, (deuxPlaques[0].z + deuxPlaques[1].z) / 2, 1e-9)
  && near(axPlaque.x, deuxPlaques[0].x, 1e-9),
  `${deuxPlaques[0].z} / ${deuxPlaques[1].z} → ${axPlaque.z}`);
const posFlanc = { x: -12.25, y: 0, z: 0 };
const axFlanc = axeDePastille('flanc', { x: 5, y: -8 }, posFlanc);
const ptFlanc = place('flanc', { x: 5, y: -8 }, posFlanc);
ok('axeDePastille : l\'axe d\'un flanc est en TRAVERS, et son zéro tombe sur x',
  axFlanc.dir === 'x' && axFlanc.x === 0, JSON.stringify(axFlanc));
ok('axeDePastille : les deux autres coordonnées gardent la pose du dessin',
  near(axFlanc.y, ptFlanc.y, 1e-9) && near(axFlanc.z, ptFlanc.z, 1e-9),
  `(${axFlanc.y}, ${axFlanc.z}) contre (${ptFlanc.y}, ${ptFlanc.z})`);
ok('axisVector : la direction devient un vecteur unité, et rien sans direction',
  M.axisVector('z')?.z === 1 && M.axisVector('x')?.x === 1 && M.axisVector() === null);
ok('articulations : la DIRECTION de l\'axe suit la pastille',
  M.articulations({ h: { x: 0, y: 0, z: 0, dir: 'z' } })[0].dir === 'z');

// --- le MONTAGE du robot entier ------------------------------------------------
// Deux ensembles dont une pastille porte le même premier mot s'emboîtent, et celui
// qui en offre le plus porte l'autre : quatre pastilles « coxa… » sur le corps,
// une sur le fémur → quatre fémurs, donc quatre patellas, donc quatre tibias.

/** Un ensemble d'essai : ses pastilles et le centre de ses pièces suffisent au
 *  monteur — c'est tout ce qu'il regarde. */
const ens = (nom, axes, pos) => ({
  nom,
  A: { source: 't', box: { x: 1, y: 1, z: 1 }, axes, pieces: [{ name: 'p', plan: 'dessus', mat: 'pmma', ep: 3, pos, w: 1, h: 1, poly: carre(1, 1) }] },
});
// Quatre coxas = quatre pastilles, une par patte. Toutes commencent par
// « coxa » : c'est ce mot-là, et lui seul, qui les relie au fémur. Chacune porte
// un AXE : les coxas sont verticales (les plaques du corps sont posées à plat),
// les patellas en travers (les côtés du fémur sont des flancs) — la patte balaye
// autour de z et plie autour de x, comme une vraie.
const ROBOT = [
  ens('corps', {
    'coxa-ag': { x: -20, y: -20, z: 0, dir: 'z' },
    'coxa-ad': { x: 20, y: -20, z: 0, dir: 'z' },
    'coxa-rg': { x: -20, y: 20, z: 0, dir: 'z' },
    'coxa-rd': { x: 20, y: 20, z: 0, dir: 'z' },
  }, { x: 0, y: 0, z: 0 }),
  ens('femur', {
    coxa: { x: 0, y: 0, z: 0, dir: 'z' },
    'patella-f': { x: 0, y: 30, z: 0, dir: 'x' },
  }, { x: 0, y: 15, z: 0 }),
  ens('tibia', {
    'patella-t': { x: 0, y: 0, z: 0, dir: 'x' },
    pied: { x: 0, y: 25, z: -30 },
  }, { x: 0, y: 12, z: -15 }),
];
/** Le point d'une articulation dans le repère de son ensemble. */
const artAt = (A, nom) => M.articulations(A).find((j) => j.name === nom).at;
const MO = M.montage(ROBOT);
const combien = (n) => MO.filter((i) => i.nom === n).length;
ok('montage : la BASE est celle qui offre le plus d\'articulations',
  MO[0]?.nom === 'corps' && !MO[0].parent, `${MO[0]?.nom}`);
ok('montage : quatre coxas donnent quatre fémurs', combien('femur') === 4, `${combien('femur')}`);
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
  ecartMax = Math.max(ecartMax, M.len(M.sub(monde(f, artAt(ROBOT[1].A, 'coxa')), surLeCorps)));
}
ok('montage : les articulations sont SUPERPOSÉES — la coxa du fémur tombe sur celle du corps',
  ecartMax < 1e-9, `${ecartMax.toFixed(9)} mm`);
let ecartPatella = 0;
const fems = MO.filter((i) => i.nom === 'femur');
for (const [n, t] of MO.filter((i) => i.nom === 'tibia').entries()) {
  ecartPatella = Math.max(ecartPatella,
    M.len(M.sub(monde(t, artAt(ROBOT[2].A, 'patella-t')), monde(fems[n], artAt(ROBOT[1].A, 'patella-f')))));
}
// « patella-f » et « patella-t » : deux noms, un seul point de contact. C'est le
// premier mot qui les apparie, le suffixe n'est là que pour Inkscape.
ok('montage : le tibia se pose sur la patella de SON fémur', ecartPatella < 1e-9,
  `${ecartPatella.toFixed(9)} mm`);
// Quatre pattes empilées au même endroit, c'est le défaut qu'on ne voit pas sur
// une image : chacune doit partir du côté où sa coxa se trouve déjà.
ok('montage : les quatre pattes sont ÉCARTÉES, pas empilées',
  new Set(fems.map((i) => Math.round(i.lacet))).size === 4,
  fems.map((i) => Math.round(i.lacet)).join('°, ') + '°');
ok('montage : un tibia suit le lacet de son fémur (une famille à une articulation ne tourne rien)',
  MO.filter((i) => i.nom === 'tibia').every((t, n) => near(t.lacet, fems[n].lacet, 1e-9)));
// Ce qui se superpose, ce sont deux DROITES : même direction des deux côtés,
// zéros confondus. Deux axes croisés ne peuvent pas se monter — le monteur ne sait
// tourner qu'autour de Z — donc la famille commune retenue est celle dont les deux
// axes pointent dans le même sens.
const dirDe = (A, nom) => M.articulations(A).find((j) => j.name === nom).dir;
ok('montage : chaque exemplaire s\'accroche par un axe de MÊME direction que le parent',
  MO.filter((i) => i.parent).every((i) => {
    const parent = ROBOT.find((e) => e.nom === i.parent).A;
    const enfant = ROBOT.find((e) => e.nom === i.nom).A;
    const chez = M.articulations(enfant).find((j) => j.famille === M.axisFamily(i.via));
    return dirDe(parent, i.via) === chez.dir;
  }),
  MO.filter((i) => i.parent).map((i) => `${i.nom}/${i.via}`).join(', '));
// Deux familles partagées, l'une croisée et l'autre alignée : c'est l'alignée qui
// emporte le montage, sinon la pièce se poserait de travers sans rien dire.
const CROISE = M.montage([
  ens('socle', { pivot: { x: 0, y: 0, z: 0, dir: 'z' }, charniere: { x: 20, y: 0, z: 0, dir: 'x' } },
    { x: 0, y: 0, z: 0 }),
  ens('volet', { pivot: { x: 0, y: 0, z: 0, dir: 'x' }, charniere: { x: 0, y: 0, z: 0, dir: 'x' } },
    { x: 0, y: 10, z: 0 }),
]);
ok('montage : entre deux familles partagées, celle dont les axes s\'alignent l\'emporte',
  CROISE.find((i) => i.nom === 'volet')?.via === 'charniere',
  `${CROISE.find((i) => i.nom === 'volet')?.via}`);
const SEUL = M.montage([...ROBOT, ens('carte', { trou: { x: 0, y: 0, z: 0 } }, { x: 0, y: 0, z: 0 })]);
ok('montage : un ensemble sans famille commune reste à sa place, sans parent',
  SEUL.filter((i) => i.nom === 'carte').length === 1
  && !SEUL.find((i) => i.nom === 'carte').parent);
ok('montage : sans aucune articulation partagée, rien n\'est monté (la rangée reprend la main)',
  M.montage([ens('a', {}, { x: 0, y: 0, z: 0 }), ens('b', {}, { x: 0, y: 0, z: 0 })])
    .every((i) => !i.parent));

// --- les pastilles d'un PROFIL : même règle, pièce isolée ----------------------
// Un profil est dessiné SEUL puis posé entre deux articulations, à l'échelle. Ses
// pastilles doivent suivre la pièce : sinon le tibia s'accoste sur une patella resté
// aux cotes du dessin, et la patte se disloque à la première mise à l'échelle.
const OS = { poly: carre(80, 10), w: 80, h: 10, axes: { coxa: { x: -30, y: 0 }, patella: { x: 30, y: 0 } } };
const posA = M.profileAxes(OS, { x: 0, y: 0, z: 0 }, { x: 80, y: 0, z: 0 });
ok('profileAxes : la pastille est posée dans le monde, bord gauche sur `from`',
  near(posA.coxa.x, 10, 1e-6) && near(posA.patella.x, 70, 1e-6),
  `${posA.coxa.x} → ${posA.patella.x}`);
const posB = M.profileAxes(OS, { x: 0, y: 0, z: 0 }, { x: 160, y: 0, z: 0 });
ok('profileAxes : les pastilles suivent la MISE À L\'ÉCHELLE de la pièce',
  near(posB.patella.x - posB.coxa.x, 2 * (posA.patella.x - posA.coxa.x), 1e-6),
  `${(posA.patella.x - posA.coxa.x).toFixed(1)} → ${(posB.patella.x - posB.coxa.x).toFixed(1)}`);
const posC = M.profileAxes(OS, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -80 });
ok('profileAxes : une pièce posée debout emporte ses pastilles',
  near(posC.coxa.z, -10, 1e-6) && near(posC.patella.z, -70, 1e-6),
  `${posC.coxa.z} → ${posC.patella.z}`);
ok('profileAxes : un profil sans pastille ne rend rien (et ne casse pas)',
  Object.keys(M.profileAxes({ poly: carre(10, 10), w: 10, h: 10 },
    { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).length === 0);
// Un point du dessin doit tomber sur la pièce : la pastille de la patella est dans la
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
    // L'image plaquée, si la pièce en porte une. Le bitmap DOIT être embarqué :
    // la webview tourne sous une CSP fermée et n'ira jamais chercher un fichier
    // à côté de la planche — un href resté relatif ne se verrait qu'à l'exécution,
    // par un carré vide. Ses deux vecteurs sont des millimètres, comme le contour.
    if (p.img) {
      ok(`${nom}/${p.name} : bitmap EMBARQUÉ (data:), pas un lien vers la planche`,
        p.img.href.startsWith('data:image/'), p.img.href.slice(0, 22));
      ok(`${nom}/${p.name} : image posée à plat sur la pièce (deux côtés non nuls)`,
        Math.hypot(p.img.u.x, p.img.u.y) > 0.5 && Math.hypot(p.img.v.x, p.img.v.y) > 0.5,
        `${p.img.u.x}×${p.img.v.y} mm`);
      // Une image DÉTOURÉE déborde forcément un peu de la pièce : c'est le clip
      // qui a donné le contour, et il est plus petit que le bitmap. Ce qu'on
      // cherche ici, c'est une image restée en PIXELS — elle serait quatre fois
      // trop grande, pas plus large d'un dixième de millimètre.
      ok(`${nom}/${p.name} : image à la taille de la pièce, en millimètres`,
        Math.hypot(p.img.u.x, p.img.u.y) <= p.w * 1.1 && Math.hypot(p.img.v.x, p.img.v.y) <= p.h * 1.1,
        `${p.w}×${p.h} mm de pièce`);
      ok(`${nom}/${p.name} : transparence lue sur le dessin`,
        p.img.alpha > 0 && p.img.alpha <= 1, String(p.img.alpha));
    }
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
    // Une pastille rangée porte une DROITE : sa direction est celle de l'épaisseur
    // de la pièce qui la porte, et son zéro tombe pile dessus. Un axe dont le zéro
    // aurait dérivé collerait l'autre dessin contre un seul flanc.
    ok(`${nom} : axe « ${axe} » orienté (${v.dir ?? '—'})`,
      v.dir === 'x' || v.dir === 'y' || v.dir === 'z', v.dir ?? 'aucune direction');
    if (v.dir) {
      ok(`${nom} : axe « ${axe} » centré sur son ZÉRO`, v[v.dir] === 0, `${v.dir}=${v[v.dir]}`);
    }
  }
  // Les familles lues sur le dessin de Frank : une pastille dont le nom finit par
  // un numéro, c'est le suffixe qu'Inkscape ajoute à un id déjà pris après un
  // copier-coller — elle est restée dans la famille de la pièce d'où elle vient,
  // et son ensemble ira s'emboîter au mauvais endroit.
  for (const j of M.articulations(a)) {
    ok(`${nom} : pastille « ${j.name} » nommée, pas dupliquée par Inkscape`,
      !/-\d+$/.test(j.name), `famille « ${j.famille} »`);
  }
  ok(`${nom} : mis en volume sans faute`, M.assemblyFaces(a, { scale: 1 }).length > 0);
  ok(`${nom} : aucun point projeté aberrant`,
    M.assemblyFaces(a, { scale: 1 }).every((f) =>
      f.pts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))));
}
// Le dessin de démonstration porte une image sur son entretoise : c'est la seule
// preuve que la chaîne complète tient — Inkscape lu par Chrome, rangé en
// millimètres, embarqué en data:, plaqué en volume. Elle disparaîtrait sans bruit.
const demo = M.assemblage('corps-demo');
ok('corps-demo : l\'entretoise porte bien son image (chaîne complète)',
  demo.pieces.filter((p) => p.img).length === 1
  && demo.pieces.find((p) => p.img)?.name === 'entretoise',
  demo.pieces.filter((p) => p.img).map((p) => p.name).join(', ') || 'aucune');
ok('corps-demo : son image ressort en volume, découpée au contour de la pièce',
  M.assemblyFaces(demo, { scale: 1 }).filter((f) => f.img).length === 1);

ok('hasAssemblage : un assemblage jamais dessiné est reconnu absent',
  !M.hasAssemblage('rien-du-tout') && (!noms.length || M.hasAssemblage(noms[0])));

// --- une image SEULE fait la pièce, et son détourage donne le contour ---------
// v2026.8.65 : Frank avait effacé le contour des deux cartes du robot, ne laissant
// que leur photo — elles ont disparu du dessin sans un mot. Une image est un
// habillage, il lui faut une pièce : à défaut de tracé, c'est le DÉTOURAGE de la
// photo (le clip-path d'Inkscape) qui la donne, sinon le rectangle du bitmap.
const corpsR = M.hasAssemblage('araignee-corps') ? M.assemblage('araignee-corps') : null;
if (corpsR) {
  const cartes = corpsR.pieces.filter((p) => p.img);
  ok('araignée : les deux cartes sont là, chacune habillée de sa photo',
    cartes.length === 2, cartes.map((p) => p.name).join(', ') || 'aucune');
  const pca = corpsR.pieces.find((p) => p.name === 'pca9685');
  // La silhouette détourée, ce sont ses coins coupés et ses trous de vis : un
  // rectangle du bitmap n'en aurait ni l'un ni l'autre.
  ok('araignée : le PCA9685 tient sa silhouette du DÉTOURAGE, pas du rectangle du bitmap',
    pca && pca.poly.length > 8 && (pca.holes?.length ?? 0) > 0,
    pca && `${pca.poly.length} points, ${pca.holes?.length ?? 0} trous`);
  // La photo couvre sa pièce à quelques pour cent près : le détourage rogne les
  // bords transparents du bitmap, il ne le redimensionne pas.
  for (const p of cartes) {
    const iw = Math.abs(p.img.u.x || p.img.u.y);
    const ih = Math.abs(p.img.v.y || p.img.v.x);
    ok(`araignée/${p.name} : la photo est plaquée à la taille de la pièce`,
      near(iw / p.w, 1, 0.06) && near(ih / p.h, 1, 0.06),
      `pièce ${p.w}×${p.h} contre photo ${iw}×${ih}`);
  }
}

// --- la TAILLE du système, écrite sur la planche (v2026.8.65) -----------------
// « système : araignee largeur : 800 » : agrandir le robot se fait dans Inkscape,
// plus dans le code. L'accesseur rend undefined si la planche n'en dit rien, et
// le composant garde alors sa taille de repli.
ok('systemeLargeur : la taille écrite sur la planche est rangée',
  typeof M.systemeLargeur('araignee') === 'number' && M.systemeLargeur('araignee') > 100
  && M.systemeLargeur('araignee') < 4000, String(M.systemeLargeur('araignee')));
ok('systemeLargeur : la patte a la sienne, et elle est plus petite que le robot',
  M.systemeLargeur('patte') > 100 && M.systemeLargeur('patte') < M.systemeLargeur('araignee'),
  `${M.systemeLargeur('patte')} contre ${M.systemeLargeur('araignee')}`);
ok('systemeLargeur : un système sans étiquette ne rend rien (repli du composant)',
  M.systemeLargeur('rien-du-tout') === undefined);

// --- le montage sur le VRAI dessin ---------------------------------------------
// Le robot d'essai plus haut éprouve la règle ; celui-ci éprouve le DESSIN de
// Frank, tel qu'il est rangé. C'est là que se verrait un axe dont le zéro aurait
// dérivé : le fémur se collerait contre une seule plaque au lieu de tenir entre
// les deux, et sur une image de 360 px ça ne se voit pas.
const DESSINES = noms.filter((n) => n.startsWith('araignee')).map((n) => ({ nom: n, A: M.assemblage(n) }));
if (DESSINES.length > 1) {
  const MR = M.montage(DESSINES);
  const monteR = (inst, p) => M.add(M.rotZ(p, inst.lacet), inst.pos);
  ok('araignée dessinée : les ensembles se montent les uns sur les autres',
    MR.some((i) => i.parent), MR.map((i) => `${i.nom}${i.parent ? `←${i.via}` : ''}`).join(', '));
  let ecart = 0;
  const exemplaires = (n) => MR.filter((x) => x.nom === n);
  for (const nomE of new Set(MR.filter((x) => x.parent).map((x) => x.nom))) {
    const enf = exemplaires(nomE);
    const par = exemplaires(enf[0].parent);
    const P = DESSINES.find((e) => e.nom === enf[0].parent).A;
    const E = DESSINES.find((e) => e.nom === nomE).A;
    // Les exemplaires naissent dans l'ordre : un bloc de points par parent. C'est
    // ainsi qu'on retrouve QUEL fémur porte quel tibia.
    enf.forEach((i, k) => {
      const chez = M.articulations(E).find((j) => j.famille === M.axisFamily(i.via));
      const surLeParent = par[Math.floor((k * par.length) / enf.length)];
      ecart = Math.max(ecart, M.len(M.sub(monteR(i, chez.at),
        monteR(surLeParent, M.articulations(P).find((j) => j.name === i.via).at))));
    });
  }
  ok('araignée dessinée : les axes montés sont SUPERPOSÉS, zéros confondus',
    ecart < 1e-6, `${ecart.toFixed(6)} mm`);
}

const fail = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - fail.length}/${checks.length} contrôles`);
process.exit(fail.length ? 1 : 0);
