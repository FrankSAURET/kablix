// Test de régression : LECTEUR DE PROFILS et mise en volume (v2026.8.23).
// Un contour dessiné à la main entre maintenant dans le moteur isométrique
// (`iso3d.mts`) : châssis découpé au laser, os de patte, blocs de servo. Les
// pièges sont tous géométriques, donc invisibles à la compilation ET peu
// lisibles à l'œil sur une image de 360 px :
//   1. le découpage en triangles doit COUVRIR la pièce — une oreille manquée
//      laisse un trou par lequel on voit le fond de la page (vécu sur l'encoche
//      avant du châssis de démonstration) ;
//   2. et rester DEDANS : l'éventail autour du centre, qui suffisait à
//      l'octogone codé en dur, bave hors de toute forme concave ;
//   3. le sens du tracé n'est pas garanti (Inkscape rend ce que le crayon a
//      fait) : à l'envers, dessus et dessous échangent leur normale et la
//      plaque est éclairée par en dessous ;
//   4. un perçage simplement soulevé de quelques dixièmes disparaît sous sa
//      propre plaque, celle-ci étant triée morceau par morceau.
// Ici tout est du calcul pur : pas de navigateur, juste le vrai module bundlé.
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-profils');
mkdirSync(CACHE, { recursive: true });

const bundle = join(CACHE, 'iso3d.mjs');
await esbuild({
  entryPoints: [join(ROOT, 'scripts', '_profils-entry.mts')],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'node',
});
const M = await import(pathToFileURL(bundle).href);

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// --- outils de mesure ---------------------------------------------------------
const area = (poly) => Math.abs(M.signedArea(poly));
const triArea = (t) => Math.abs(M.signedArea(t));
function centroid(t) {
  return { x: (t[0].x + t[1].x + t[2].x) / 3, y: (t[0].y + t[1].y + t[2].y) / 3 };
}
function pointIn(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// --- formes d'épreuve ---------------------------------------------------------
const CARRE = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
/** Un « L » : la forme concave minimale, celle qui met l'éventail en défaut. */
const EL = [
  { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 },
  { x: 20, y: 20 }, { x: 20, y: 60 }, { x: 0, y: 60 },
];
/** Un peigne : trois dents, donc six sommets rentrants — de quoi épuiser un
 *  découpage d'oreilles qui s'arrêterait à la première difficulté. */
const PEIGNE = (() => {
  const p = [{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 30 }];
  for (let i = 2; i >= 0; i--) {
    p.push({ x: 10 + i * 30 + 20, y: 30 }, { x: 10 + i * 30 + 20, y: 10 }, { x: 10 + i * 30, y: 10 }, { x: 10 + i * 30, y: 30 });
  }
  p.push({ x: 0, y: 30 });
  return p;
})();

for (const [nom, poly] of [['carré', CARRE], ['L concave', EL], ['peigne', PEIGNE]]) {
  const tris = M.triangulate(poly);
  const somme = tris.reduce((s, t) => s + triArea(t), 0);
  ok(`triangulate(${nom}) : aire couverte`, near(somme, area(poly), area(poly) * 0.001),
    `${somme.toFixed(2)} contre ${area(poly).toFixed(2)}`);
  // Au plus n-2 triangles ; moins si le tracé porte des sommets alignés, qui ne
  // sont jamais des oreilles et disparaissent sans rien retirer à la matière.
  ok(`triangulate(${nom}) : découpage complet en ${tris.length} triangles`,
    tris.length > 0 && tris.length <= poly.length - 2, `${tris.length} pour ${poly.length} sommets`);
  const dehors = tris.filter((t) => !pointIn(centroid(t), poly));
  ok(`triangulate(${nom}) : aucun triangle hors de la forme`, dehors.length === 0, `${dehors.length} hors`);
  const plats = tris.filter((t) => triArea(t) < 1e-9);
  ok(`triangulate(${nom}) : aucun triangle plat`, plats.length === 0, `${plats.length} plats`);
}

// Sens de tracé : Inkscape rend le sens du crayon, l'un ou l'autre.
const horaire = [...EL].reverse();
ok('triangulate : sens horaire accepté',
  near(M.triangulate(horaire).reduce((s, t) => s + triArea(t), 0), area(EL), area(EL) * 0.001));
ok('triangulate : sortie toujours en sens trigonométrique',
  M.triangulate(horaire).every((t) => M.signedArea(t) > 0));
ok('triangulate : moins de 3 points → rien', M.triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length === 0);

// --- prismes : dessus, dessous, tranche ---------------------------------------
/** Aire des faces projetées à l'écran — un dessus manquant s'y voit tout de suite. */
const airesEcran = (faces) => faces.reduce((s, f) => s + Math.abs(M.signedArea(f.pts)), 0);
const prisme = M.prismFaces(EL, 0, 10, '#bcdff0');
const prismeInverse = M.prismFaces(horaire, 0, 10, '#bcdff0');
ok('prismFaces : le sens du tracé ne change rien',
  near(airesEcran(prisme), airesEcran(prismeInverse), 0.01),
  `${airesEcran(prisme).toFixed(2)} contre ${airesEcran(prismeInverse).toFixed(2)}`);
ok('prismFaces : le dessus est bien là',
  prisme.some((f) => f.pts.length === 3), `${prisme.length} faces`);
// Le dessus couvre exactement l'aire du contour, projection comprise
// (l'isométrie multiplie les aires horizontales par cos30 ≈ 0,866). Le dessous,
// lui, est vu de dos : il ne compte pas — d'où une seule fois l'aire.
const COS30 = Math.cos(Math.PI / 6);
const dessus = prisme.filter((f) => f.pts.length === 3);
ok('prismFaces : le dessus couvre toute la pièce, sans trou',
  near(airesEcran(dessus), area(EL) * COS30, area(EL) * COS30 * 0.02),
  `${airesEcran(dessus).toFixed(1)} contre ${(area(EL) * COS30).toFixed(1)}`);
// Faces de taille comparable : c'est ce qui rend le tri en profondeur juste.
const grand = dessus.filter((f) => Math.abs(M.signedArea(f.pts)) > 400);
ok('prismFaces : aucune face plate démesurée', grand.length === 0, `${grand.length} > 400 px²`);

// --- décalques : un perçage passe devant SA plaque -----------------------------
const trou = [
  { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 },
];
const plaque = M.prismFaces(EL, 0, 10, '#bcdff0');
const decal = M.decalFaces(trou, 10, '#4b6b7a', plaque);
const plusLoin = Math.max(...plaque.map((f) => f.z));
ok('decalFaces : rangé devant toute la plaque',
  decal.length > 0 && decal.every((f) => f.z > plusLoin), `${decal.length} faces`);
ok('decalFaces : sans plaque, il reste à sa hauteur',
  M.decalFaces(trou, 10, '#4b6b7a').every((f) => f.z < plusLoin + 1000));

// --- extrusion d'un profil dessiné --------------------------------------------
const PROFIL = { poly: EL.map((p) => ({ x: p.x - 30, y: p.y - 30 })), w: 60, h: 60 };
const faces = M.extrudeProfile(PROFIL, { x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 8, '#c9d6de');
ok('extrudeProfile : produit des faces', faces.length > 6, `${faces.length}`);
// La pièce tient exactement entre ses deux articulations. Vérifié sur un profil
// RECTANGLE, dont le volume est un pavé connu : le long de +X, l'écran range en
// x = (x − y)·cos30, donc la pièce s'étend de −(ép./2)·cos30 à (L + ép./2)·cos30
// — l'épaisseur déborde en x à l'écran, ce qui n'est PAS un débordement de la
// pièce le long de son axe.
const RECT = { poly: [{ x: -30, y: -10 }, { x: 30, y: -10 }, { x: 30, y: 10 }, { x: -30, y: 10 }], w: 60, h: 20 };
const pave = M.extrudeProfile(RECT, { x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 8, '#c9d6de');
const xs = pave.flatMap((f) => f.pts.map((p) => p.x));
ok('extrudeProfile : la pièce va de `from` à `to`',
  near(Math.min(...xs), -4 * COS30, 0.02) && near(Math.max(...xs), 34 * COS30, 0.02),
  `${Math.min(...xs).toFixed(2)} → ${Math.max(...xs).toFixed(2)} (attendu ${(-4 * COS30).toFixed(2)} → ${(34 * COS30).toFixed(2)})`);
// Mise à l'échelle EN BLOC : la même pièce, deux fois plus longue, est deux fois
// plus haute. Une hauteur laissée fixe étirerait le dessin.
const court = M.extrudeProfile(PROFIL, { x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 8, '#c9d6de');
const long = M.extrudeProfile(PROFIL, { x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, 8, '#c9d6de');
const hauteur = (fs) => {
  const ys = fs.flatMap((f) => f.pts.map((p) => p.y));
  return Math.max(...ys) - Math.min(...ys);
};
ok('extrudeProfile : proportions gardées (double longueur = double hauteur)',
  near(hauteur(long) - 8 * 0.5, 2 * (hauteur(court) - 8 * 0.5), hauteur(court) * 0.08),
  `${hauteur(court).toFixed(1)} → ${hauteur(long).toFixed(1)}`);
const perce = M.extrudeProfile(PROFIL, { x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 8, '#c9d6de',
  [[{ x: -8, y: -8 }, { x: -2, y: -8 }, { x: -2, y: -2 }, { x: -8, y: -2 }]]);
ok('extrudeProfile : les perçages ajoutent des faces', perce.length > faces.length,
  `${faces.length} → ${perce.length}`);

// --- teintes ------------------------------------------------------------------
ok('shade : accepte #rrggbb', M.shade('#804020', 1) === 'rgb(128,64,32)', M.shade('#804020', 1));
ok('shade : accepte rgb() (une teinte déjà assombrie repasse par l\'éclairage)',
  M.shade('rgb(128,64,32)', 0.5) === 'rgb(64,32,16)', M.shade('rgb(128,64,32)', 0.5));
ok('shade : borné à 255', M.shade('#ffffff', 4) === 'rgb(255,255,255)', M.shade('#ffffff', 4));

// --- ce que le lecteur a rangé ------------------------------------------------
const noms = M.PROFILS;
ok('profils.mts : au moins un profil rangé', noms.length > 0, noms.join(', '));
for (const nom of noms) {
  const p = M.profile(nom);
  ok(`${nom} : contour fermé exploitable`, p.poly.length >= 3, `${p.poly.length} points`);
  ok(`${nom} : cotes cohérentes`, p.w > 0 && p.h > 0 && Number.isFinite(p.w), `${p.w}×${p.h}`);
  ok(`${nom} : aucune coordonnée aberrante`,
    p.poly.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)));
  // Centré sur le milieu de sa boîte : le composant place la pièce par son centre.
  const xs2 = p.poly.map((q) => q.x);
  const ys2 = p.poly.map((q) => q.y);
  ok(`${nom} : centré sur sa boîte englobante`,
    near(Math.min(...xs2) + Math.max(...xs2), 0, 0.05) && near(Math.min(...ys2) + Math.max(...ys2), 0, 0.05),
    `${(Math.min(...xs2) + Math.max(...xs2)).toFixed(2)}`);
  const tris = M.triangulate(p.poly);
  const somme = tris.reduce((s, t) => s + triArea(t), 0);
  ok(`${nom} : découpage complet (aucun trou dans la matière)`,
    near(somme, area(p.poly), area(p.poly) * 0.002),
    `${somme.toFixed(1)} contre ${area(p.poly).toFixed(1)}`);
  ok(`${nom} : découpage entièrement dans la pièce`,
    tris.every((t) => pointIn(centroid(t), p.poly)));
  for (const [i, h] of p.holes.entries()) {
    ok(`${nom} : perçage ${i + 1} dans la pièce`, h.every((q) => pointIn(q, p.poly)));
  }
}

// --- contre-épreuve : un banc qui ne sait rien détecter ne prouve rien ---------
const CROISE = [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 40, y: 0 }, { x: 0, y: 40 }];
const trisCroise = M.triangulate(CROISE);
const sommeCroise = trisCroise.reduce((s, t) => s + triArea(t), 0);
ok('contre-épreuve : un contour qui se croise ne passe pas le test d\'aire',
  !near(sommeCroise, area(CROISE), area(CROISE) * 0.002),
  `${sommeCroise.toFixed(1)} contre ${area(CROISE).toFixed(1)}`);

const fail = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - fail.length}/${checks.length} contrôles`);
if (!existsSync(join(ROOT, 'src/webview/composants/profils.mts'))) {
  console.log('  (profils.mts absent : lancer node scripts/_extract-profils.mjs)');
}
process.exit(fail.length ? 1 : 0);
