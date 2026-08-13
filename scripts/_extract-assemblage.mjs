// Outil — LECTEUR D'ASSEMBLAGES. Un assemblage, c'est PLUSIEURS pièces plates
// posées les unes par rapport aux autres : le corps du robot araignée, fait de
// deux flancs de PMMA de 3 mm avec les servos pris en sandwich entre eux.
//
// Le lecteur de profils (`_extract-profils.mjs`) sait lire UNE pièce et la met à
// l'échelle demandée par le composant. Cela ne suffit plus ici : entre deux
// flancs, 3 mm d'épaisseur et 18 mm d'entrefer SONT l'information — pas une
// proportion à recalculer. Un assemblage garde donc les cotes du dessin, en
// millimètres, et chaque pièce porte sa POSE.
//
// Conventions du dessin (détail : docs/fr/Drawing-systems.md) :
//   • une pièce = un groupe dont l'id commence par « <assemblage>- » ;
//     les pièces sont posées CÔTE À CÔTE sur la planche, comme un plan de
//     découpe laser — ce n'est pas leur place sur la planche qui compte ;
//   • un texte dans le groupe donne la POSE : « flanc pos=0,-9,0 ep=3 miroir=y » ;
//   • une pastille rouge marque un AXE d'articulation, le texte au-dessus le
//     nomme (« coxa-av ») — même convention que les broches d'un composant.
//     Cet axe est une DROITE, dirigée selon l'ÉPAISSEUR de la pièce qui la porte
//     (une plaque `dessus` donne un axe vertical), et rangée par son ZÉRO : le
//     milieu des deux exemplaires quand la pièce est en miroir.
//
// Sortie : src/webview/composants/assemblages.mts, sa propre archive (relu avant
// d'être réécrit, donc extraire un assemblage ne perd pas les autres).
//
// Le module est aussi IMPORTÉ par le banc `verify:assemblage` (parsePose, place,
// encombrement) : la règle éprouvée par le banc est celle qu'exécute l'outil, pas
// une copie qui dériverait. D'où le garde d'exécution en bas de fichier.
//
// Usage : node scripts/_extract-assemblage.mjs araignee-corps
//         node scripts/_extract-assemblage.mjs --source=docs/exemples/corps-demo.svg corps-demo
//         node scripts/_extract-assemblage.mjs --list
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, MM2PX, lireDessin, ringsToPiece, R2, nomDePastille, planche } from './_lire-contours.mjs';

const OUT_FILE = join(ROOT, 'src/webview/composants/assemblages.mts');

export const PLANS = ['dessus', 'flanc', 'face'];
/** Matières connues : le mot dit la couleur et rien d'autre. Une pièce sans
 *  `mat=` est du PMMA — c'est ce dont tout le châssis est découpé. */
export const MATIERES = ['pmma', 'alu', 'servo', 'carte', 'laiton', 'pile'];

/** Pose par défaut : à plat au centre. Une pièce sans étiquette est ainsi
 *  VISIBLE au mauvais endroit, donc corrigible, plutôt que muette. */
const POSE_DEFAUT = { plan: 'dessus', pos: { x: 0, y: 0, z: 0 }, ep: 3, mat: 'pmma', miroir: '' };

export function readExisting() {
  if (!existsSync(OUT_FILE)) return {};
  const txt = readFileSync(OUT_FILE, 'utf8');
  const a = txt.indexOf('const DATA = ');
  if (a < 0) return {};
  const b = txt.indexOf('\n} as const;', a);
  if (b < 0) return {};
  try {
    return JSON.parse(txt.slice(a + 13, b + 2));
  } catch {
    console.error('  ! assemblages.mts illisible : il sera reconstruit à partir du seul assemblage extrait maintenant.');
    return {};
  }
}

/**
 * Étiquette de pose : « flanc pos=0,-9,0 ep=3 miroir=y mat=alu ». Le premier mot
 * est le plan ; tout le reste est optionnel et se lit dans n'importe quel ordre.
 * Rend `null` si le texte n'est pas une étiquette (c'est alors un nom d'axe).
 */
export function parsePose(s) {
  const mots = s.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!PLANS.includes(mots[0])) return null;
  const pose = { ...POSE_DEFAUT, plan: mots[0], pos: { ...POSE_DEFAUT.pos } };
  for (const m of mots.slice(1)) {
    const [cle, val = ''] = m.split('=');
    if (cle === 'pos') {
      const n = val.split(',').map(Number);
      if (n.length === 3 && n.every(Number.isFinite)) pose.pos = { x: n[0], y: n[1], z: n[2] };
    } else if (cle === 'ep') pose.ep = Number(val) || pose.ep;
    else if (cle === 'mat' && MATIERES.includes(val)) pose.mat = val;
    else if (cle === 'miroir') pose.miroir = val && 'xyz'.includes(val) ? val : 'y';
  }
  return pose;
}

/** Direction de l'ÉPAISSEUR d'une pièce, par plan — la flèche « ép » du dessin.
 *  C'est aussi la direction de l'AXE de toute pastille posée sur cette pièce :
 *  une plaque à plat (`dessus`) pivote autour d'un axe VERTICAL, un flanc autour
 *  d'un axe en travers du robot. Même table que `planeAxisDir` d'iso3d.mts. */
export const NORMALE = { dessus: 'z', flanc: 'x', face: 'y' };

/** L'AXE que porte une pastille : une DROITE, pas un point. Deux pièces en miroir
 *  créent entre elles un axe de rotation dirigé selon leur épaisseur ; le point
 *  rangé est le ZÉRO de cet axe — le milieu des deux exemplaires en miroir, et
 *  l'origine de l'assemblage sinon. C'est par ce zéro que deux dessins se centrent
 *  l'un sur l'autre au montage, sans une cote à reporter. */
export function axeDePastille(plan, p, pos) {
  const dir = NORMALE[plan];
  return { ...place(plan, p, pos), [dir]: 0, dir };
}

/** Point du dessin (centré sur la pièce) → repère 3D de l'assemblage, en mm.
 *  Même convention que `PLANES` dans iso3d.mts : le y du dessin DESCEND. */
export function place(plan, p, pos) {
  const u = { dessus: [1, 0, 0], flanc: [0, 1, 0], face: [1, 0, 0] }[plan];
  const v = { dessus: [0, 1, 0], flanc: [0, 0, -1], face: [0, 0, -1] }[plan];
  return {
    x: R2(pos.x + u[0] * p.x + v[0] * p.y),
    y: R2(pos.y + u[1] * p.x + v[1] * p.y),
    z: R2(pos.z + u[2] * p.x + v[2] * p.y),
  };
}

/** Les poses d'une pièce : une seule, ou deux si elle est en miroir — le second
 *  exemplaire est de l'autre côté du plan, et c'est lui qui donne l'encombrement
 *  en travers. */
export function poses(p) {
  return p.miroir ? [p.pos, { ...p.pos, [p.miroir]: -p.pos[p.miroir] }] : [p.pos];
}

/**
 * Encombrement réel d'un jeu de pièces : la cote qu'on lit sur un plan de
 * montage, et le seul moyen de voir d'un coup d'œil qu'une pièce est posée de
 * travers. L'épaisseur ne compte QUE le long de la normale du plan : une plaque
 * de 100 mm posée à plat encombre 100 mm en large et 3 mm en haut, pas 103.
 */
export function encombrement(pieces) {
  const lim = limites(pieces);
  return { x: R2(lim.x1 - lim.x0), y: R2(lim.y1 - lim.y0), z: R2(lim.z1 - lim.z0) };
}

/** Les six bornes de l'assemblage, en mm. `encombrement` n'en garde que les
 *  tailles ; `montre` a besoin des bornes elles-mêmes pour poser plusieurs
 *  assemblages côte à côte sans les faire se chevaucher. */
export function limites(pieces) {
  const lim = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of pieces) {
    const e = { dessus: { z: p.ep / 2 }, flanc: { x: p.ep / 2 }, face: { y: p.ep / 2 } }[p.plan];
    const d = { x: e.x ?? 0, y: e.y ?? 0, z: e.z ?? 0 };
    for (const pos of poses(p)) {
      for (const q of p.poly) {
        const w = place(p.plan, q, pos);
        for (const ax of ['x', 'y', 'z']) {
          lim[`${ax}0`] = Math.min(lim[`${ax}0`], w[ax] - d[ax]);
          lim[`${ax}1`] = Math.max(lim[`${ax}1`], w[ax] + d[ax]);
        }
      }
    }
  }
  return lim;
}

/** Unités du dessin → MILLIMÈTRES. Une planche Inkscape en mm a déjà les bonnes ;
 *  une planche en pixels CSS se convertit une fois pour toutes. */
export const mmParUnite = (unitScale) => (unitScale === 1 ? 1 / MM2PX : 1);

/**
 * Cœur du lecteur : des groupes DÉJÀ LUS → un assemblage. Séparé de la lecture du
 * dessin parce que `montre` lit la planche UNE fois et en tire plusieurs
 * assemblages d'un coup — relancer un Chrome sans interface par assemblage
 * coûterait plusieurs secondes à chaque « recharger ».
 * Rend `null` si aucune pièce n'a pu être lue.
 */
export function assembleGroupes(nom, groupes, { source = planche('3D'), k = 1, tol = 0.08 } = {}) {
  const pieces = [];
  const axes = {};
  for (const g of [...groupes].sort((a, b) => a.name.localeCompare(b.name))) {
    // Le nom court d'une pièce est ce qui suit le nom de l'assemblage. Un profil
    // montré seul est son propre assemblage d'une pièce : il garde son nom.
    const court = g.name.startsWith(`${nom}-`) ? g.name.slice(nom.length + 1) : g.name;
    if (!g.rings.length) {
      console.log(`  ! ${g.name} : aucun contour fermé, pièce ignorée`);
      continue;
    }
    const piece = ringsToPiece(g.name, g.rings, { k, tol });
    if (!piece) {
      console.log(`  ! ${g.name} : contours trop petits, pièce ignorée`);
      continue;
    }
    const etiquettes = g.texts.map((t) => ({ t, pose: parsePose(t.s) }));
    const brute = etiquettes.find((e) => e.pose);
    const pose = brute?.pose ?? { ...POSE_DEFAUT };
    if (!brute) {
      console.log(`  ! ${g.name} : pas d'étiquette de pose, posée à plat au centre`);
    } else previentEtiquette(g.name, brute.t.s);
    const { outer, holes, bb } = piece;
    const cx = (bb.x0 + bb.x1) / 2;
    const cy = (bb.y0 + bb.y1) / 2;
    const move = (r) => r.map((p) => ({ x: R2(p[0] - cx), y: R2(p[1] - cy) }));
    const entry = {
      name: court,
      plan: pose.plan,
      mat: pose.mat,
      // Couleur de la pièce telle qu'elle est PEINTE sur la planche, transparence
      // comprise (`#rrggbbaa`) : un flanc de PMMA bleuté à 60 % se voit en 3D
      // comme sur le dessin, et le nuancier n'est plus limité à six mots. C'est le
      // DESSIN qui décide ; `mat=` ne sert plus que de repli pour une pièce sans
      // remplissage (un contour de découpe, tracé au trait seul).
      ...(g.fill ? { fill: g.fill } : {}),
      ep: pose.ep,
      pos: pose.pos,
      w: R2(bb.x1 - bb.x0),
      h: R2(bb.y1 - bb.y0),
      poly: move(outer),
    };
    if (pose.miroir) entry.miroir = pose.miroir;
    if (holes.length) entry.holes = holes.map(move);
    pieces.push(entry);
    // Les axes : une pastille rouge, nommée par son id ou par le texte au-dessus
    // d'elle. Ses coordonnées sont celles de la pièce qui la porte, pose
    // comprise — c'est le dessin qui dit où passe la coxa, plus une constante du
    // code. Le PREMIER MOT du nom dit sur quoi elle s'emboîte (`coxa-gh` et
    // `coxa-db` sont deux coxas de la famille `coxa`, donc deux pattes).
    //
    // Ce n'est pas un point mais une DROITE : la pièce en miroir est posée deux
    // fois, et l'axe de rotation passe entre les deux exemplaires, dans le sens de
    // l'épaisseur. D'où le zéro le long de cette direction — deux plaques à
    // ±13.75 mm donnent un axe à 0, et c'est ce zéro que l'autre dessin viendra
    // rejoindre.
    const libres = g.texts.filter((t) => !parsePose(t.s))
      .map((t) => ({ s: t.s, x: t.x * k - cx, y: t.y * k - cy }));
    for (const pad of g.pads) {
      const p = { x: R2(pad.x * k - cx), y: R2(pad.y * k - cy) };
      const nomPad = nomDePastille(p, libres, pad.id);
      if (!nomPad) {
        console.log(`  ! ${g.name} : pastille sans nom (id « ${pad.id || '?'} »), ignorée`);
        continue;
      }
      axes[nomPad.trim()] = axeDePastille(pose.plan, p, pose.pos);
    }
    console.log(`  ✓ ${court} : ${entry.poly.length} points, ${entry.w}×${entry.h} mm,`
      + ` ${pose.plan} ép.${pose.ep} ${entry.fill ?? pose.mat}${pose.miroir ? ` miroir=${pose.miroir}` : ''}`
      + `${holes.length ? `, ${holes.length} trou(s)` : ''}`);
  }
  if (!pieces.length) return null;
  previentFamilles(nom, axes);
  return { source, box: encombrement(pieces), axes, pieces };
}

/** La famille d'une pastille : son PREMIER mot. Même règle que `axisFamily`
 *  d'iso3d.mts — c'est par ce mot que deux dessins s'emboîtent, et le nombre de
 *  pastilles d'une famille dit combien d'exemplaires il naîtra. */
const familleDe = (n) => (n.indexOf('-') > 0 ? n.slice(0, n.indexOf('-')) : n);

/**
 * Ce que le dessin vient de dire du montage, énoncé plutôt que deviné devant
 * l'image : quatre pastilles `coxa…` sur le corps, ce sont quatre pattes. Une
 * seule, ce serait une patte au milieu — et sur une image, quatre pattes empilées
 * au même endroit ressemblent à une patte.
 *
 * Le piège suivant est le COPIER-COLLER : Inkscape refuse deux ids identiques et
 * suffixe le second (`coxa` collée dans le tibia devient `coxa-2`). La
 * pastille garde alors la famille de la pièce d'où elle vient, et le tibia va se
 * poser sur le corps au lieu de la patella. C'est invisible sur la planche, donc c'est
 * dit ici.
 */
function previentFamilles(nom, axes) {
  const par = {};
  for (const n of Object.keys(axes)) (par[familleDe(n)] ??= []).push(n);
  for (const [f, noms] of Object.entries(par)) {
    // La DIRECTION de l'axe se lit ici et nulle part ailleurs : elle vient du plan
    // de la pièce qui porte la pastille, et deux dessins ne s'emboîtent que si
    // leurs axes pointent dans le même sens (une coxa verticale sur une plaque
    // posée à plat, une patella en travers sur un flanc).
    const dirs = [...new Set(noms.map((n) => axes[n].dir).filter(Boolean))];
    console.log(`    famille « ${f} » : ${noms.length} pastille(s), axe ${dirs.join('/').toUpperCase()}`
      + ` — ${noms.join(', ')}`);
    if (dirs.length > 1) {
      console.log(`  ! ${nom} : la famille « ${f} » mélange des axes ${dirs.join(' et ').toUpperCase()}`
        + ` — ses pastilles sont posées sur des pièces de plans différents. Une même famille`
        + ` doit tourner autour d'une seule droite.`);
    }
    for (const n of noms) {
      if (!/-\d+$/.test(n)) continue;
      console.log(`  ! ${nom} : « ${n} » finit par un numéro — c'est le suffixe qu'Inkscape ajoute`
        + ` à un id déjà pris, après un copier-coller. La pastille reste dans la famille « ${f} » :`
        + ` renommez-la (« patella-t » face au « patella-f » du fémur) sinon elle s'emboîtera au mauvais endroit.`);
    }
  }
}

/**
 * L'autre piège du dessin : la VIRGULE DÉCIMALE. Inkscape et le pavé numérique
 * français écrivent `pos=24,501,-38,083,0 ep=21,5` — la virgule sépare déjà les
 * trois coordonnées, la valeur devient illisible, et la pièce retombe
 * silencieusement au centre à 3 mm. C'est invisible sur l'image (la pièce est
 * bien là, juste au mauvais endroit), donc c'est dit ici, à la lecture.
 */
function previentEtiquette(nom, s) {
  const dit = (m) => console.log(`  ! ${nom} : ${m}`);
  for (const mot of s.toLowerCase().trim().split(/\s+/).slice(1).filter(Boolean)) {
    const [cle, val = ''] = mot.split('=');
    if (cle === 'pos') {
      const n = val.split(',');
      if (n.length !== 3 || !n.map(Number).every(Number.isFinite)) {
        dit(`« ${mot} » illisible, pièce remise au centre — le séparateur décimal`
          + ` est le POINT : pos=24.501,-38.083,0 (et non 24,501,-38,083,0).`);
      }
    } else if (cle === 'ep') {
      if (!(Number(val) > 0)) dit(`« ${mot} » illisible, épaisseur remise à 3 mm — écrivez ep=21.5, avec un point.`);
    } else if (cle === 'mat') {
      if (!MATIERES.includes(val)) dit(`matière « ${val} » inconnue, PMMA par défaut (${MATIERES.join(', ')}).`);
    } else if (cle !== 'miroir') {
      dit(`« ${mot} » n'est pas un mot d'étiquette connu (pos, ep, mat, miroir), ignoré.`);
    }
  }
}

/** Lit un assemblage du dessin : une pièce par groupe préfixé, la pose lue dans
 *  son étiquette, les pastilles rouges en axes. Rend `null` si rien n'a été lu. */
export function lireAssemblage(nom, { source = planche('3D'), step = 0.2, tol = 0.08 } = {}) {
  const { unitScale, groupes } = lireDessin({ source, prefixes: [`${nom}-`], step });
  return assembleGroupes(nom, groupes, { source, k: mmParUnite(unitScale), tol });
}

// --- écriture du module -------------------------------------------------------
/** JSON lisible : une pièce par bloc, les points quatre par ligne — un diff git
 *  doit rester consultable, c'est du dessin versionné. */
function dump(obj) {
  const ring = (r, ind) => {
    const lines = [];
    for (let i = 0; i < r.length; i += 4) {
      lines.push(ind + '  ' + r.slice(i, i + 4).map((q) => `{ "x": ${q.x}, "y": ${q.y} }`).join(', '));
    }
    return '[\n' + lines.join(',\n') + '\n' + ind + ']';
  };
  const parts = [];
  for (const [nom, a] of Object.entries(obj).sort(([x], [y]) => x.localeCompare(y))) {
    const pieces = a.pieces.map((p) => {
      const f = [
        `        "name": ${JSON.stringify(p.name)}`,
        `        "plan": ${JSON.stringify(p.plan)}`,
        `        "mat": ${JSON.stringify(p.mat)}`,
        ...(p.fill ? [`        "fill": ${JSON.stringify(p.fill)}`] : []),
        `        "ep": ${p.ep}`,
        `        "pos": { "x": ${p.pos.x}, "y": ${p.pos.y}, "z": ${p.pos.z} }`,
        `        "w": ${p.w}`,
        `        "h": ${p.h}`,
      ];
      if (p.miroir) f.push(`        "miroir": ${JSON.stringify(p.miroir)}`);
      f.push(`        "poly": ${ring(p.poly, '        ')}`);
      if (p.holes?.length) {
        f.push(`        "holes": [\n${p.holes.map((h) => '          ' + ring(h, '          ')).join(',\n')}\n        ]`);
      }
      return `      {\n${f.join(',\n')}\n      }`;
    });
    const axes = Object.entries(a.axes ?? {})
      .map(([k, v]) => `      ${JSON.stringify(k)}: { "x": ${v.x}, "y": ${v.y}, "z": ${v.z}`
        + `${v.dir ? `, "dir": ${JSON.stringify(v.dir)}` : ''} }`);
    parts.push(`  ${JSON.stringify(nom)}: {\n`
      + `    "source": ${JSON.stringify(a.source)},\n`
      + `    "box": { "x": ${a.box.x}, "y": ${a.box.y}, "z": ${a.box.z} },\n`
      + `    "axes": {${axes.length ? `\n${axes.join(',\n')}\n    ` : ''}},\n`
      + `    "pieces": [\n${pieces.join(',\n')}\n    ]\n  }`);
  }
  return '{\n' + parts.join(',\n') + '\n}';
}

export function ecrire(data) {
  const header = `// FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Produit par \`node scripts/_extract-assemblage.mjs <nom>\` à partir des pièces
// dessinées dans Composants3D.svg (mode d'emploi : docs/fr/Drawing-systems.md).
// Le module est sa propre archive : l'outil le RELIT avant de le réécrire.
//
// Un ASSEMBLAGE, ce sont plusieurs pièces plates posées les unes par rapport aux
// autres — deux flancs de PMMA de 3 mm, les servos pris en sandwich entre eux.
// Tout est en MILLIMÈTRES, cotes du dessin comprises : dans un assemblage, une
// épaisseur et un entrefer sont l'information même, pas une proportion.
//
//   • \`plan\`   : comment le dessin se pose (dessus / flanc / face) ;
//   • \`pos\`    : le centre de la pièce dans le repère de l'assemblage ;
//   • \`miroir\` : la pièce est posée DEUX fois, symétriquement (les deux flancs) ;
//   • \`axes\`   : les pastilles rouges nommées — coxas, patellas, points de pivot.
//               Chacune est une DROITE : \`dir\` dit son sens (l'épaisseur de la
//               pièce qui la porte), et le point rangé est son ZÉRO — le milieu
//               des deux exemplaires en miroir. Deux dessins s'emboîtent axes
//               superposés, zéros confondus.
import type { Assembly } from './iso3d.mjs';

const DATA = ${dump(data)} as const;

export type AssemblyName = keyof typeof DATA;

/** Tous les assemblages lus, dans l'ordre alphabétique. */
export const ASSEMBLAGE_NAMES = Object.keys(DATA) as AssemblyName[];

/** Un assemblage prêt pour \`assemblyFaces\` (iso3d.mts). */
export function assemblage(name: AssemblyName): Assembly {
  return JSON.parse(JSON.stringify(DATA[name])) as Assembly;
}

/** Vrai si cet assemblage a été dessiné et extrait (les composants gardent une
 *  forme de repli codée en dur tant que le dessin n'existe pas). */
export function hasAssemblage(name: string): name is AssemblyName {
  return Object.prototype.hasOwnProperty.call(DATA, name);
}
`;
  writeFileSync(OUT_FILE, header);
  console.log(`\n  → ${OUT_FILE} (${Object.keys(data).length} assemblage(s))`);
}

// --- ligne de commande ---------------------------------------------------------
function main(args) {
  const source = args.find((a) => a.startsWith('--source='))?.slice(9) ?? planche('3D');
  const step = Number(args.find((a) => a.startsWith('--step='))?.slice(7) ?? 0.2);
  // Tolérance de simplification, en MILLIMÈTRES : en dessous, un point ne change
  // plus la silhouette et ne fait qu'alourdir le rendu.
  const tol = Number(args.find((a) => a.startsWith('--tol='))?.slice(6) ?? 0.08);
  const names = args.filter((a) => !a.startsWith('--'));

  if (args.includes('--list')) {
    const data = readExisting();
    const keys = Object.keys(data);
    if (!keys.length) console.log('  (aucun assemblage rangé)');
    for (const k of keys) {
      const a = data[k];
      console.log(`  ${k} : ${a.pieces.length} pièce(s), ${Object.keys(a.axes ?? {}).length} axe(s)`);
      for (const p of a.pieces) {
        console.log(`      ${p.name} — ${p.plan} ${p.mat} ép.${p.ep} mm`
          + ` à (${p.pos.x}, ${p.pos.y}, ${p.pos.z})${p.miroir ? ` miroir=${p.miroir}` : ''}`);
      }
    }
    return 0;
  }

  if (names.length === 0) {
    console.error('Usage: node scripts/_extract-assemblage.mjs [--source=f.svg] <nom> [...]');
    console.error('       node scripts/_extract-assemblage.mjs --list');
    return 1;
  }

  const data = readExisting();
  let changed = 0;
  for (const nom of names) {
    const a = lireAssemblage(nom, { source, step, tol });
    if (!a) {
      console.log(`  – ${nom} : aucun groupe « ${nom}-… » dans ${source}`);
      continue;
    }
    data[nom] = a;
    changed++;
    console.log(`  → ${nom} : ${a.pieces.length} pièce(s), ${Object.keys(a.axes).length} axe(s),`
      + ` ${a.box.x}×${a.box.y}×${a.box.z} mm`);
  }
  if (!changed) {
    console.log('  (rien à écrire)');
    return 1;
  }
  ecrire(data);
  return 0;
}

// Le banc importe ce module : il ne doit alors RIEN exécuter.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
