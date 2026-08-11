// Outil — LECTEUR DE PROFILS. Transforme un contour dessiné à la main (Inkscape,
// planche « Composants.svg ») en polygone prêt à être mis EN VOLUME par le moteur
// isométrique `src/webview/composants/iso3d.mts` : le châssis du robot araignée,
// les os des pattes, les blocs de servo.
//
// Ce que ça change : le châssis n'est plus un octogone codé en dur
// (`regularPoly(8, 55)`), c'est le contour que Frank a tracé — encoches, pans
// coupés, découpes en U comprises. Le dessin reste de sa main, le volume, l'ombrage
// et la cinématique restent au moteur.
//
// UNE pièce isolée, mise à l'échelle par le composant qui l'emploie. Pour
// PLUSIEURS pièces posées les unes par rapport aux autres — deux flancs de PMMA
// et les servos pris en sandwich entre eux — c'est un ASSEMBLAGE, et son lecteur
// est `_extract-assemblage.mjs` (mêmes dessins, vraies cotes conservées).
//
// Conventions du dessin (détail : docs/fr/Drawing-systems.md) :
//   • un profil = un groupe (ou un chemin) dont l'id est « <nom>-profil » ;
//   • un CONTOUR FERMÉ par pièce ; les contours supplémentaires ENTIÈREMENT
//     contenus dans le premier sont des TROUS (perçages, allègements) ;
//   • plaque (châssis, platine) : dessinée VUE DE DESSUS, le haut du dessin est
//     l'AVANT du robot. Os et blocs : dessinés VUS DE CÔTÉ, pièce couchée, le
//     bord gauche est la première articulation, le bord droit la seconde ;
//   • une pastille rouge NOMMÉE est un point d'articulation : son id Inkscape,
//     ou le texte au-dessus d'elle. Deux pastilles de même préfixe (« genou-h »
//     et « genou-b ») font un AXE de rotation — deux points, donc une droite.
//     Une pastille anonyme reste un repère de tracé et est ignorée.
//
// Sortie : src/webview/composants/profils.mts — un objet figé, relu et FUSIONNÉ à
// chaque exécution, donc extraire un seul profil ne perd pas les autres.
//
// Usage : node scripts/_extract-profils.mjs araignee-chassis patte-femur
//         node scripts/_extract-profils.mjs --source=docs/exemples/chassis.svg chassis-demo
//         node scripts/_extract-profils.mjs --list          (ce qui est déjà rangé)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, lireDessin, ringsToPiece, R2, nomDePastille } from './_lire-contours.mjs';

const OUT_FILE = join(ROOT, 'src/webview/composants/profils.mts');

const args = process.argv.slice(2);
const SOURCE = args.find((a) => a.startsWith('--source='))?.slice(9) ?? 'Composants.svg';
/** Pas d'échantillonnage des courbes, en unités du dessin. Plus fin que l'œil
 *  (la simplification qui suit efface tout ce qui ne se voit pas). */
const STEP = Number(args.find((a) => a.startsWith('--step='))?.slice(7) ?? 0.35);
/** Tolérance de simplification, en px de grille : en dessous, un point ne
 *  change plus rien à la silhouette et ne fait qu'alourdir le rendu. */
const TOL = Number(args.find((a) => a.startsWith('--tol='))?.slice(6) ?? 0.25);
const names = args.filter((a) => !a.startsWith('--'));

// --- fichier de sortie : relu avant d'être réécrit ----------------------------
/** Profils déjà rangés, lus dans le module généré (il est sa propre archive :
 *  un fichier de cache à côté finirait par mentir). */
function readExisting() {
  if (!existsSync(OUT_FILE)) return {};
  const txt = readFileSync(OUT_FILE, 'utf8');
  const a = txt.indexOf('const DATA = ');
  if (a < 0) return {};
  const b = txt.indexOf('\n} as const;', a);
  if (b < 0) return {};
  try {
    return JSON.parse(txt.slice(a + 13, b + 2));
  } catch {
    console.error('  ! profils.mts illisible : il sera reconstruit à partir des seuls profils extraits maintenant.');
    return {};
  }
}

if (args.includes('--list')) {
  const data = readExisting();
  const keys = Object.keys(data);
  if (!keys.length) console.log('  (aucun profil rangé)');
  for (const k of keys) {
    const p = data[k];
    console.log(`  ${k} : ${p.poly.length} points, ${p.w}×${p.h} px${p.holes?.length ? `, ${p.holes.length} trou(s)` : ''}`);
  }
  process.exit(0);
}

if (names.length === 0) {
  console.error('Usage: node scripts/_extract-profils.mjs [--source=f.svg] [--step=n] [--tol=n] <nom> [...]');
  console.error('       node scripts/_extract-profils.mjs --list');
  process.exit(1);
}

const { unitScale, groupes } = lireDessin({ source: SOURCE, ids: names, step: STEP });
const data = readExisting();
let changed = 0;

for (const it of groupes) {
  if (it.missing) {
    console.log(`  – ${it.name} : ni « ${it.name}-profil » ni « ${it.name} » dans ${SOURCE}`);
    continue;
  }
  if (!it.rings.length) {
    console.log(`  – ${it.name} : aucun contour fermé trouvé dans le groupe`);
    continue;
  }
  // Unités du dessin → pixels de la grille 10 px, puis simplification.
  const piece = ringsToPiece(it.name, it.rings, { k: unitScale, tol: TOL });
  if (!piece) {
    console.log(`  – ${it.name} : contours trop petits (moins de 1 px² une fois à l'échelle)`);
    continue;
  }
  // Centrage sur le milieu de la boîte englobante : le composant place ensuite
  // la pièce par son centre, sans avoir à connaître le coin de la planche.
  const { outer, holes, bb } = piece;
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  const move = (r) => r.map((p) => ({ x: R2(p[0] - cx), y: R2(p[1] - cy) }));
  const entry = {
    poly: move(outer),
    w: R2(bb.x1 - bb.x0),
    h: R2(bb.y1 - bb.y0),
  };
  if (holes.length) entry.holes = holes.map(move);
  // Les axes : les pastilles rouges nommées, dans le MÊME repère que `poly`
  // (px de grille, centrés sur la boîte). Un fémur dessiné seul dit ainsi où
  // sont son genou et sa hanche ; le sous-ensemble s'accoste dessus au lieu
  // d'être calé sur des constantes du code.
  const libres = (it.texts ?? []).map((t) => ({ s: t.s, x: t.x * unitScale - cx, y: t.y * unitScale - cy }));
  const axes = {};
  for (const pad of it.pads ?? []) {
    const p = { x: R2(pad.x * unitScale - cx), y: R2(pad.y * unitScale - cy) };
    const nom = nomDePastille(p, libres, pad.id);
    if (!nom) continue;
    axes[nom.trim()] = p;
  }
  if (Object.keys(axes).length) entry.axes = axes;
  entry.source = `${SOURCE}#${it.id}`;
  data[it.name] = entry;
  changed++;
  console.log(`  ✓ ${it.name} : ${entry.poly.length} points, ${entry.w}×${entry.h} px`
    + `${holes.length ? `, ${holes.length} trou(s)` : ''}`
    + `${entry.axes ? `, axes : ${Object.keys(axes).join(', ')}` : ''}`);
}

if (!changed) {
  console.log('  (rien à écrire)');
  process.exit(1);
}

// --- écriture du module -------------------------------------------------------
/** JSON lisible : un profil par bloc, les points quatre par ligne — un diff git
 *  doit rester consultable, c'est du dessin versionné. */
function dump(obj) {
  const parts = [];
  for (const [name, p] of Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) {
    const ring = (r) => {
      const lines = [];
      for (let i = 0; i < r.length; i += 4) {
        lines.push('      ' + r.slice(i, i + 4).map((q) => `{ "x": ${q.x}, "y": ${q.y} }`).join(', '));
      }
      return '[\n' + lines.join(',\n') + '\n    ]';
    };
    const fields = [
      `    "w": ${p.w}`,
      `    "h": ${p.h}`,
      `    "source": ${JSON.stringify(p.source ?? '')}`,
      `    "poly": ${ring(p.poly)}`,
    ];
    if (p.holes?.length) {
      fields.push(`    "holes": [\n${p.holes.map((h) => '    ' + ring(h)).join(',\n')}\n    ]`);
    }
    if (p.axes && Object.keys(p.axes).length) {
      const axes = Object.entries(p.axes)
        .map(([k, v]) => `      ${JSON.stringify(k)}: { "x": ${v.x}, "y": ${v.y} }`);
      fields.push(`    "axes": {\n${axes.join(',\n')}\n    }`);
    }
    parts.push(`  ${JSON.stringify(name)}: {\n${fields.join(',\n')}\n  }`);
  }
  return '{\n' + parts.join(',\n') + '\n}';
}

const header = `// FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Produit par \`node scripts/_extract-profils.mjs <nom>…\` à partir des contours
// dessinés dans Composants.svg (mode d'emploi : docs/fr/Drawing-systems.md).
// Le module est sa propre archive : l'outil le RELIT avant de le réécrire, donc
// extraire un seul profil ne fait pas disparaître les autres.
//
// Coordonnées en pixels de la grille 10 px, centrées sur le milieu de la boîte
// englobante de la pièce. \`holes\` : les perçages, dans le même repère.
// \`axes\` : les pastilles rouges nommées — genoux, hanches, points de pivot. Deux
// pastilles de même préfixe (\`genou-h\`, \`genou-b\`) font un axe de rotation.
import type { Profile } from './iso3d.mjs';

const DATA = ${dump(data)} as const;

export type ProfileName = keyof typeof DATA;

/** Tous les profils dessinés, dans l'ordre alphabétique. Le banc \`verify:profils\`
 *  les passe tous en revue : un contour qui se croise ou dont le découpage laisse
 *  un trou doit tomber au test, pas à l'image. */
export const PROFIL_NAMES = Object.keys(DATA) as ProfileName[];

/** Profil dessiné, prêt pour \`prismFaces\` (plaque) ou \`extrudeProfile\` (pièce). */
export function profile(name: ProfileName): Profile & {
  holes: { x: number; y: number }[][];
  axes: Record<string, { x: number; y: number }>;
} {
  const p = DATA[name] as { poly: readonly { x: number; y: number }[]; w: number; h: number;
    holes?: readonly (readonly { x: number; y: number }[])[];
    axes?: Readonly<Record<string, { readonly x: number; readonly y: number }>> };
  return {
    poly: p.poly.map((q) => ({ x: q.x, y: q.y })),
    w: p.w,
    h: p.h,
    holes: (p.holes ?? []).map((h) => h.map((q) => ({ x: q.x, y: q.y }))),
    axes: Object.fromEntries(Object.entries(p.axes ?? {}).map(([k, v]) => [k, { x: v.x, y: v.y }])),
  };
}

/** Vrai si ce profil a été dessiné et extrait (les composants gardent une forme
 *  de repli codée en dur tant que le dessin n'existe pas). */
export function hasProfile(name: string): name is ProfileName {
  return Object.prototype.hasOwnProperty.call(DATA, name);
}
`;
writeFileSync(OUT_FILE, header);
console.log(`\n  → ${OUT_FILE} (${Object.keys(data).length} profil(s))`);
