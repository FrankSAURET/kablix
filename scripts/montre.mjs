// « Montre-moi ce que ça donne » — visu interactive de TOUT ce qui porte un nom.
// On donne un préfixe (« araignee ») : l'outil ramasse dans Composants3D.svg tous
// les profils et tous les assemblages qui commencent par là, les met en volume
// avec le VRAI moteur (`iso3d.mts`) et ouvre la scène dans Chrome — de quoi la
// tourner, l'éclater, cacher ce qui gêne, et RECHARGER le dessin sans quitter
// la fenêtre.
//
// C'est l'outil qui manquait pour dessiner un robot entier : le corps, le fémur
// et le tibia sont trois assemblages séparés sur la planche, et jusqu'ici il
// fallait trois fenêtres pour les regarder — donc jamais côte à côte, jamais à la
// même échelle. Entre deux flancs serrés à 3 mm, rien ne se voit sur la planche à
// plat, et une image fixe ne dit pas si les servos passent : ici on tourne autour,
// on écarte, on redessine dans Inkscape, on clique « recharger ».
//
// Ce qui est lu est aussi RANGÉ : `assemblages.mts` et `profils.mts` sont réécrits
// à chaque lecture, exactement comme le feraient `npm run assemblage` et
// `npm run profils`. La planche n'est lue qu'UNE fois pour tout le préfixe.
//
// Usage : node scripts/montre.mjs araignee
//         node scripts/montre.mjs araignee-corps            (un seul assemblage)
//         node scripts/montre.mjs --source=docs/exemples/corps-demo.svg corps-demo
//         node scripts/montre.mjs araignee --sans-lire      (ce qui est déjà rangé)
//         node scripts/montre.mjs araignee --sans-ranger    (regarde sans réécrire)
//         node scripts/montre.mjs araignee --sans-ouvrir    (sert la page, n'ouvre rien)
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import { ROOT, findChrome, lireDessin, MM2PX, R2, planche } from './_lire-contours.mjs';
import {
  assembleGroupes, limites, mmParUnite,
  readExisting as assemblagesRanges, ecrire as ecrireAssemblages,
} from './_extract-assemblage.mjs';
import {
  profilDepuisGroupe, readExisting as profilsRanges, ecrire as ecrireProfils,
} from './_extract-profils.mjs';

const CACHE = join(ROOT, 'node_modules', '.cache-montre');
/** Pas d'échantillonnage des courbes et tolérances de simplification : celles des
 *  deux extracteurs, pour que ce qu'on regarde soit ce qui est rangé. */
const STEP = 0.2;
const TOL_MM = 0.08;
const TOL_PX = 0.25;
/** Épaisseur donnée à un PROFIL pour le montrer en volume. Un profil est une
 *  pièce sans cotes — c'est le composant qui l'emploie qui décide de sa taille —
 *  mais une silhouette sans épaisseur ne se voit pas tourner. 3 mm, comme une
 *  découpe de PMMA. */
const EP_PROFIL = 3;

const args = process.argv.slice(2);
const SOURCE = args.find((a) => a.startsWith('--source='))?.slice(9) ?? planche('3D');
const SANS_RANGER = args.includes('--sans-ranger');
const PORT = Number(args.find((a) => a.startsWith('--port='))?.slice(7) ?? 0);
const NOM = args.find((a) => !a.startsWith('-'));

if (!NOM) {
  console.error('Usage: node scripts/montre.mjs [--source=f.svg] [--sans-lire] [--sans-ranger] <préfixe>');
  process.exit(1);
}

// --- 1. Ce que le préfixe ramasse ---------------------------------------------
/**
 * À quel ASSEMBLAGE appartient une pièce. Le nom d'un assemblage est ce qui reste
 * quand on ôte le dernier segment du nom de la pièce (`araignee-corps-batterie` →
 * `araignee-corps`) — sauf si un assemblage DÉJÀ RANGÉ la revendique, auquel cas
 * c'est lui qui gagne : une pièce nommée en trois morceaux (`…-cote-gauche`) reste
 * ainsi dans son assemblage au lieu d'en fonder un nouveau.
 */
function nomAssemblage(name, prefixe, connus) {
  const revendique = connus
    .filter((c) => name.startsWith(`${c}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (revendique) return revendique;
  const coupe = name.lastIndexOf('-');
  return coupe >= prefixe.length ? name.slice(0, coupe) : name;
}

/** Les groupes du préfixe, triés : les `<nom>-profil` d'un côté, les pièces
 *  d'assemblage regroupées par assemblage de l'autre. */
function classer(groupes, prefixe, connus) {
  const profils = [];
  const asm = new Map();
  for (const g of groupes) {
    if ((g.id ?? '').endsWith('-profil')) {
      profils.push(g);
      continue;
    }
    const n = nomAssemblage(g.name, prefixe, connus);
    if (!asm.has(n)) asm.set(n, []);
    asm.get(n).push(g);
  }
  return { profils, asm };
}

/**
 * Un profil rangé (pixels de la grille 10 px) vu comme un ASSEMBLAGE d'une seule
 * pièce, en millimètres : c'est la seule façon de le montrer dans la même scène
 * qu'un corps coté, à la même échelle et sous le même lacet.
 */
function profilEnEnsemble(nom, p) {
  const k = 1 / MM2PX;
  const mm = (r) => r.map((q) => ({ x: R2(q.x * k), y: R2(q.y * k) }));
  const piece = {
    name: nom,
    plan: 'dessus',
    mat: 'pmma',
    ep: EP_PROFIL,
    pos: { x: 0, y: 0, z: 0 },
    w: R2(p.w * k),
    h: R2(p.h * k),
    poly: mm(p.poly),
    ...(p.holes?.length ? { holes: p.holes.map(mm) } : {}),
  };
  const axes = Object.fromEntries(Object.entries(p.axes ?? {})
    .map(([n, v]) => [n, { x: R2(v.x * k), y: R2(v.y * k), z: 0 }]));
  const lim = limites([piece]);
  return {
    source: p.source ?? SOURCE,
    box: { x: R2(lim.x1 - lim.x0), y: R2(lim.y1 - lim.y0), z: R2(lim.z1 - lim.z0) },
    axes,
    pieces: [piece],
  };
}

/** Assemblages et profils → la liste que la page dessine, dans l'ordre
 *  alphabétique. `lim` accompagne chacun : c'est par ses bornes qu'on les pose
 *  côte à côte sans qu'ils se chevauchent. */
function ensembles(asm, prof) {
  const out = [];
  for (const [nom, A] of Object.entries(asm)) out.push({ nom, type: 'assemblage', A });
  for (const [nom, p] of Object.entries(prof)) out.push({ nom, type: 'profil', A: profilEnEnsemble(nom, p) });
  for (const e of out) e.lim = limites(e.A.pieces);
  return out.sort((a, b) => a.nom.localeCompare(b.nom));
}

const commencePar = (obj, prefixe) => Object.fromEntries(
  Object.entries(obj).filter(([n]) => n === prefixe || n.startsWith(prefixe)));

/**
 * Tout ce qui porte le préfixe, lu et rangé. `relire = false` se contente de ce
 * que les modules générés contiennent déjà — ouverture instantanée quand seul le
 * moteur a changé.
 */
function charger(relire) {
  const dejaRanges = assemblagesRanges();
  let asm;
  let prof;
  if (relire) {
    console.log(`\n  Lecture de ${SOURCE} — tout ce qui commence par « ${NOM} »…`);
    const { unitScale, groupes } = lireDessin({ source: SOURCE, prefixes: [NOM], step: STEP });
    const connus = Object.keys(commencePar(dejaRanges, NOM));
    const { profils, asm: parAsm } = classer(groupes, NOM, connus);
    const k = mmParUnite(unitScale);
    asm = {};
    for (const [nom, gs] of [...parAsm].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${nom} :`);
      const a = assembleGroupes(nom, gs, { source: SOURCE, k, tol: TOL_MM });
      if (a) asm[nom] = a;
    }
    prof = {};
    for (const g of profils) {
      const e = profilDepuisGroupe(g, { k: unitScale, tol: TOL_PX, source: SOURCE });
      if (e) prof[g.name] = e;
    }
    // Rangé exactement comme le feraient les deux extracteurs : ils relisent leur
    // module avant de le réécrire, montrer un assemblage n'efface pas les autres.
    if (!SANS_RANGER) {
      if (Object.keys(asm).length) ecrireAssemblages({ ...dejaRanges, ...asm });
      if (Object.keys(prof).length) ecrireProfils({ ...profilsRanges(), ...prof });
    }
  } else {
    asm = commencePar(dejaRanges, NOM);
    prof = commencePar(profilsRanges(), NOM);
  }
  const liste = ensembles(asm, prof);
  console.log(`\n  ${liste.length} ensemble(s) pour « ${NOM} » : `
    + (liste.map((e) => `${e.nom} (${e.A.pieces.length})`).join(', ') || '—'));
  return {
    prefixe: NOM,
    source: SOURCE,
    lu: new Date().toLocaleTimeString('fr-FR'),
    range: relire && !SANS_RANGER,
    ensembles: liste,
  };
}

let donnees = charger(!args.includes('--sans-lire'));
if (!donnees.ensembles.length) {
  console.error(`\n  Rien à montrer : aucun profil ni assemblage « ${NOM}… ».`);
  console.error('  Rappel : une pièce d\'assemblage = un groupe dont l\'id commence par le nom,');
  console.error('  avec un texte de pose (« flanc pos=0,-9,0 ep=3 miroir=x ») ;');
  console.error('  un profil = un groupe « <nom>-profil ».');
  console.error('  Mode d\'emploi : docs/fr/Drawing-systems.md');
  process.exit(1);
}

// --- 2. La page : le vrai moteur, bundlé tel quel ------------------------------
mkdirSync(CACHE, { recursive: true });
const entryPath = join(CACHE, 'montre-entry.mjs');
writeFileSync(entryPath, `
import { html, svg, render } from 'lit';
import {
  assemblyFaces, renderFaces, rotZ, add, dot, project, MATIERES, PLANES, planeNormal,
  scale as vscale, rotationAxes, montage, axisGizmo,
} from '../../src/webview/composants/iso3d.mjs';

const W = 900, H = 620;
/** Écart entre deux ensembles posés côte à côte, en millimètres — de quoi les
 *  lire comme deux pièces d'un plan de montage, pas comme un tas. */
const ECART = 15;

const etat = {
  lacet: 22, eclate: 0, zoom: 1, axes: true, repere: true, monte: true, rangee: true,
  // Ce qu'on ne veut plus voir : par ENSEMBLE (« araignee-corps ») et par PIÈCE
  // (« araignee-corps/flanc »). Des NOMS, donc un rechargement du dessin ne perd
  // pas ce qui était masqué.
  ensCaches: new Set(), cachees: new Set(),
  // Les ensembles réduits à UN exemplaire : monté, le corps fait naître autant de
  // fémurs qu'il a de hanches, et on ne veut pas toujours les quatre.
  unSeul: new Set(),
  donnees: null, occupe: false, erreur: '',
};

async function recharge(relire) {
  etat.occupe = true;
  etat.erreur = '';
  dessine();
  try {
    const r = await fetch(relire ? '/recharger' : '/donnees', { method: relire ? 'POST' : 'GET' });
    const j = await r.json();
    if (j.erreur) etat.erreur = j.erreur;
    else etat.donnees = j;
  } catch (e) {
    etat.erreur = String((e && e.message) || e);
  }
  etat.occupe = false;
  dessine();
}

// --- disposition ---------------------------------------------------------------
const visibles = () =>
  (etat.donnees ? etat.donnees.ensembles : []).filter((e) => !etat.ensCaches.has(e.nom));

/** Le MONTAGE courant : chaque ensemble posé sur les articulations du précédent,
 *  articulations superposées — le robot entier, pas trois dessins côte à côte.
 *  Rend \`null\` si la case est décochée, ou si rien ne s'emboîte (aucune famille
 *  d'articulation partagée) : on retombe alors sur la rangée, sans rien inventer. */
function montageCourant() {
  const vis = visibles();
  if (!etat.monte || vis.length < 2) return null;
  const insts = montage(vis.map((e) => ({ nom: e.nom, A: e.A })));
  return insts.some((i) => i.parent) ? insts : null;
}

/** Les ensembles réduits à UN exemplaire : ceux dont la case ×N est décochée, et
 *  tous ceux qu'ils portent — un seul fémur ne peut pas tenir quatre tibias. */
function reduits(mont) {
  const parent = new Map();
  for (const i of mont) if (!parent.has(i.nom)) parent.set(i.nom, i.parent);
  const out = new Set();
  for (const nom of parent.keys()) {
    for (let n = nom, garde = 0; n && garde < 16; n = parent.get(n), garde++) {
      if (!etat.unSeul.has(n)) continue;
      out.add(nom);
      break;
    }
  }
  return out;
}

/**
 * Ce que la scène pose : un exemplaire par entrée, avec son lacet propre et sa
 * position en millimètres. Trois dispositions, dans cet ordre :
 *   • MONTÉ — chacun sur les articulations du précédent (le robot assemblé) ;
 *   • côte à côte — le long de X, pour les lire un par un ;
 *   • à sa place — chacun à sa propre origine.
 */
function pose(mont) {
  const vis = visibles();
  if (mont) {
    const parNom = new Map(vis.map((e) => [e.nom, e]));
    const un = reduits(mont);
    const vus = new Map();
    const out = [];
    for (const i of mont) {
      const n = vus.get(i.nom) ?? 0;
      vus.set(i.nom, n + 1);
      if (n > 0 && un.has(i.nom)) continue;
      out.push({ e: parNom.get(i.nom), lacet: i.lacet, off: i.pos, etiquette: n === 0 });
    }
    return out;
  }
  const out = [];
  let x = 0;
  for (const e of vis) {
    out.push({
      e, lacet: 0, etiquette: true,
      off: { x: etat.rangee ? x - e.lim.x0 : 0, y: 0, z: 0 },
    });
    x += (e.lim.x1 - e.lim.x0) + ECART;
  }
  return out;
}

/** Le placement d'un exemplaire : son lacet propre, sa position, puis le lacet de
 *  présentation de la scène. \`k\` convertit les millimètres en unités de feuille
 *  (1 quand on travaille en millimètres purs, comme dans le cadrage). */
const placeur = (pl, k = 1) => {
  const off = vscale(pl.off, k);
  return (p) => rotZ(add(rotZ(p, pl.lacet), off), etat.lacet);
};

/** Les deux poses d'une pièce en miroir, ou son unique pose (même règle que
 *  assemblyFaces : un dessin de flanc donne les DEUX flancs). */
function poses(p) {
  return p.miroir ? [p.pos, { ...p.pos, [p.miroir]: -p.pos[p.miroir] }] : [p.pos];
}

/**
 * Échelle et centre écran, cadrés sur la GÉOMÉTRIE réellement visible, projetée
 * au lacet courant — pièces masquées et éclaté compris. Cadrer sur les boîtes
 * englobantes laissait la moitié de la vue vide : le pavé englobant d'un châssis
 * découpé est bien plus large que sa silhouette, et l'écart se cumule sur une
 * rangée d'assemblages. Le cadrage suit donc la rotation ; c'est le prix d'une
 * scène qui reste pleine, et il ne coûte que quelques centaines de projections.
 */
function vue(disp) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const pl of disp) {
    const xf = placeur(pl);
    for (const p of pl.e.A.pieces) {
      if (etat.cachees.has(pl.e.nom + '/' + p.name)) continue;
      const { u, v } = PLANES[p.plan];
      const n = planeNormal(p.plan);
      for (const pos of poses(p)) {
        // Sens de l'éclaté : du côté où la pièce se trouve déjà (iso3d fait de même).
        const ecart = etat.eclate * Math.sign(dot(pos, n));
        for (const s of [-p.ep / 2, p.ep / 2]) {
          for (const q of p.poly) {
            const w = {
              x: pos.x + u.x * q.x + v.x * q.y + n.x * (s + ecart),
              y: pos.y + u.y * q.x + v.y * q.y + n.y * (s + ecart),
              z: pos.z + u.z * q.x + v.z * q.y + n.z * (s + ecart),
            };
            const r = project(xf(w));
            x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x);
            y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y);
          }
        }
      }
    }
  }
  if (!Number.isFinite(x0)) return { k: 1, cx: W / 2, cy: H / 2 };
  const k = etat.zoom * Math.min((W * 0.94) / Math.max(x1 - x0, 1), (H * 0.90) / Math.max(y1 - y0, 1));
  return { k, cx: W / 2 - ((x0 + x1) / 2) * k, cy: H / 2 - ((y0 + y1) / 2) * k };
}

function scene(mont) {
  const disp = pose(mont);
  if (!disp.length) return svg\`\`;
  const { k, cx, cy } = vue(disp);
  const faces = [];
  const marques = [];
  for (const pl of disp) {
    const e = pl.e;
    const xf = placeur(pl, k);
    const A = { ...e.A, pieces: e.A.pieces.filter((p) => !etat.cachees.has(e.nom + '/' + p.name)) };
    faces.push(...assemblyFaces(A, { scale: k, xf, eclate: etat.eclate * k }));
    if (disp.length > 1 && pl.etiquette) {
      // Le nom sous chaque bloc : sans lui, une rangée de trois assemblages est
      // une devinette dès qu'on l'a tournée.
      const c = project(xf({ x: (e.lim.x0 + e.lim.x1) / 2 * k, y: (e.lim.y0 + e.lim.y1) / 2 * k, z: e.lim.z0 * k }));
      marques.push(svg\`<text x=\${(c.x + cx).toFixed(1)} y=\${(c.y + cy + 26).toFixed(1)}
        text-anchor="middle" font-size="12" font-family="sans-serif" fill="#5a7183">\${e.nom}</text>\`);
    }
    if (!etat.axes) continue;
    // Les DROITES d'abord, les pastilles par-dessus : deux pastilles de même
    // préfixe (« hanche-g-h », « hanche-g-b ») sont les deux bouts d'un axe de
    // rotation, et c'est la droite qui dit autour de quoi la patte tourne.
    for (const r of rotationAxes(e.A, k)) {
      const p1 = project(xf(r.a));
      const p2 = project(xf(r.b));
      const mx = (p1.x + p2.x) / 2 + cx;
      const my = (p1.y + p2.y) / 2 + cy;
      marques.push(svg\`<line x1=\${(p1.x + cx).toFixed(1)} y1=\${(p1.y + cy).toFixed(1)}
          x2=\${(p2.x + cx).toFixed(1)} y2=\${(p2.y + cy).toFixed(1)}
          stroke="#ee0000" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round" />
        <text x=\${mx.toFixed(1)} y=\${(my - 8).toFixed(1)} text-anchor="middle"
          font-size="12" font-family="sans-serif" font-weight="600" fill="#900">\${r.name}</text>\`);
    }
    for (const [nom, v] of Object.entries(e.A.axes)) {
      const q = project(xf(vscale(v, k)));
      marques.push(svg\`<circle cx=\${(q.x + cx).toFixed(1)} cy=\${(q.y + cy).toFixed(1)} r="4"
          fill="#ee0000" fill-opacity="0.85" />
        <text x=\${(q.x + cx + 7).toFixed(1)} y=\${(q.y + cy - 6).toFixed(1)}
          font-size="12" font-family="sans-serif" fill="#c00">\${nom}</text>\`);
    }
  }
  // Le repère X/Y/Z, dans un coin et TOURNÉ AVEC LA SCÈNE : c'est lui qui dit si
  // une pièce est partie vers l'arrière ou vers la droite — la question même
  // qu'on se pose quand un dessin ne donne pas ce qu'on attendait.
  const repere = etat.repere
    ? axisGizmo({ x: 0, y: 0, z: 0 }, 34, 62, H - 52, (p) => rotZ(p, etat.lacet))
    : [];
  return svg\`<g>\${renderFaces(faces, cx, cy)}</g><g>\${marques}</g><g>\${repere}</g>\`;
}

// --- panneau -------------------------------------------------------------------
function bascule(jeu, cle) {
  if (jeu.has(cle)) jeu.delete(cle); else jeu.add(cle);
  dessine();
}

/** \`n\` = le nombre d'exemplaires que le montage lui a donnés : le corps porte
 *  quatre hanches, il naît quatre fémurs. Au-delà d'un, une case « ×n » permet de
 *  n'en garder qu'UN — quatre pattes cachent le corps qu'on voulait regarder. */
function ligneEnsemble(e, n) {
  const montre = !etat.ensCaches.has(e.nom);
  const tous = !etat.unSeul.has(e.nom);
  return html\`<div class="ligne titre">
    <label class="nom">
      <input type="checkbox" .checked=\${montre} @change=\${() => bascule(etat.ensCaches, e.nom)} />
      <b>\${e.nom}</b></label>
    \${n > 1 ? html\`<label class="fois" title="décoché : un seul exemplaire">
      <input type="checkbox" .checked=\${tous}
        @change=\${() => bascule(etat.unSeul, e.nom)} />×\${n}</label>\` : ''}
    <span class="gris">\${e.type === 'profil' ? 'profil' : e.A.pieces.length + ' pièce(s)'}
      · \${e.A.box.x}×\${e.A.box.y}×\${e.A.box.z} mm</span>
  </div>\`;
}

function lignePiece(e, p) {
  const cle = e.nom + '/' + p.name;
  const montre = !etat.cachees.has(cle);
  return html\`<label class="ligne piece">
    <input type="checkbox" .checked=\${montre} @change=\${() => bascule(etat.cachees, cle)} />
    <span class="pastille" style=\${'background:' + (p.fill || MATIERES[p.mat] || MATIERES.pmma)}></span>
    <span>\${p.name}</span>
    <span class="gris">\${p.plan} · \${p.w}×\${p.h} · ép.\${p.ep} mm\${p.miroir ? ' · ×2' : ''}</span>
  </label>\`;
}

function curseur(cle, libelle, min, max, pas, unite) {
  return html\`<label class="curseur">
    <span>\${libelle}</span>
    <input type="range" min=\${min} max=\${max} step=\${pas} .value=\${String(etat[cle])}
      @input=\${(ev) => { etat[cle] = Number(ev.target.value); dessine(); }} />
    <b>\${etat[cle]}\${unite}</b>
  </label>\`;
}

function caseSimple(cle, libelle) {
  return html\`<label class="ligne"><input type="checkbox" .checked=\${etat[cle]}
    @change=\${(ev) => { etat[cle] = ev.target.checked; dessine(); }} /> \${libelle}</label>\`;
}

function dessine() {
  const d = etat.donnees;
  const liste = d ? d.ensembles : [];
  const axes = liste.flatMap((e) => Object.entries(e.A.axes).map(([n, v]) => [e.nom, n, v]));
  // Le montage sert deux fois : à la scène, et au panneau qui dit combien
  // d'exemplaires chaque ensemble a reçus (« ×4 » = quatre hanches, quatre pattes).
  const mont = montageCourant();
  const combien = new Map();
  for (const i of mont ?? []) combien.set(i.nom, (combien.get(i.nom) ?? 0) + 1);
  render(html\`
    <div class="panneau">
      <h1>\${d ? d.prefixe : '…'}</h1>
      <p class="gris">\${liste.length} ensemble(s) · \${liste.reduce((n, e) => n + e.A.pieces.length, 0)} pièce(s)<br>
        <span class="src">\${d ? d.source : ''}\${d ? ' · lu à ' + d.lu : ''}</span></p>
      <div class="barre">
        <button @click=\${() => recharge(true)} ?disabled=\${etat.occupe}>
          \${etat.occupe ? 'lecture du dessin…' : '↻ recharger'}</button>
        <span class="gris">\${d && d.range ? 'rangé' : ''}</span>
      </div>
      \${etat.erreur ? html\`<p class="err">\${etat.erreur}</p>\` : ''}
      \${curseur('lacet', 'lacet', 0, 360, 1, '°')}
      \${curseur('eclate', 'éclaté', 0, 60, 1, ' mm')}
      \${curseur('zoom', 'zoom', 0.4, 2.5, 0.05, '×')}
      \${caseSimple('axes', 'axes dessinés')}
      \${caseSimple('repere', 'repère X Y Z')}
      \${caseSimple('monte', 'monté sur ses articulations')}
      \${etat.monte ? '' : caseSimple('rangee', 'côte à côte')}
      \${etat.monte && !mont && liste.length > 1 ? html\`<p class="note">rien à monter :
        aucun ensemble ne partage une famille d'articulation (deux dessins doivent nommer
        la même — « hanche », « genou »…). Affichage côte à côte.</p>\` : ''}
      \${liste.map((e) => html\`<div class="bloc">
        \${ligneEnsemble(e, combien.get(e.nom) ?? 1)}
        \${e.A.pieces.map((p) => lignePiece(e, p))}
      </div>\`)}
      \${axes.length ? html\`<h2>pastilles</h2>\${axes.map(([e, n, v]) =>
        html\`<div class="ligne gris"><b>\${n}</b> <span>\${e} · (\${v.x}, \${v.y}, \${v.z})</span></div>\`)}\` : ''}
    </div>
    <div class="vue"><svg width=\${W} height=\${H} viewBox="0 0 \${W} \${H}"
      xmlns="http://www.w3.org/2000/svg">\${scene(mont)}</svg></div>\`, document.body);
}

// Glisser dans la vue = tourner : plus direct qu'un curseur pour chercher
// l'angle où l'on voit ce qui coince.
let glisse = null;
addEventListener('pointerdown', (ev) => { if (ev.target.closest('.vue')) glisse = ev.clientX; });
addEventListener('pointerup', () => { glisse = null; });
addEventListener('pointermove', (ev) => {
  if (glisse === null) return;
  etat.lacet = (etat.lacet + Math.round(ev.clientX - glisse) + 360) % 360;
  glisse = ev.clientX;
  dessine();
});

// La molette zoome la SCÈNE, jamais la page. Ctrl+molette est confisqué partout
// dans la fenêtre : c'est le zoom du navigateur, et lui fait grossir le panneau
// EN MÊME TEMPS que le dessin — l'inverse de ce qu'on cherche en regardant une
// pièce de près. Sans Ctrl, seule la vue réagit (le panneau garde son défilement).
addEventListener('wheel', (ev) => {
  const dansLaVue = ev.target instanceof Element && ev.target.closest('.vue');
  if (!ev.ctrlKey && !dansLaVue) return;
  ev.preventDefault();
  const z = etat.zoom * Math.exp(-ev.deltaY / 800);
  // Arrondi au pas du curseur (0,05) : la valeur affichée reste lisible et le
  // curseur se replace exactement dessus.
  etat.zoom = Math.min(2.5, Math.max(0.4, Math.round(z * 20) / 20));
  dessine();
}, { passive: false });

dessine();
recharge(false);
`);

const bundle = await esbuild({
  entryPoints: [entryPath], bundle: true, format: 'iife', write: false, logLevel: 'warning',
});
const page = `<!doctype html><meta charset="utf-8"><title>${NOM} — Kablix</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; display: flex; gap: 16px; font: 13px/1.5 system-ui, sans-serif;
    background: #f6f9fb; color: #22333d; }
  /* Le panneau ne se laisse JAMAIS écraser : sans flex-shrink:0, la scène (SVG de
     largeur fixe) lui volait des pixels dès que la place manquait — un zoom du
     navigateur, qui réduit la fenêtre en pixels CSS, suffisait à le comprimer. */
  .panneau { flex: 0 0 330px; padding: 16px; background: #fff; box-shadow: 0 0 12px #0001;
    height: 100vh; overflow: auto; box-sizing: border-box; }
  .vue { flex: 1 1 auto; min-width: 0; display: grid; place-items: center; }
  /* C'est la scène qui cède : elle se réduit proportionnellement au lieu de pousser. */
  .vue svg { max-width: 100%; height: auto; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #789;
    margin: 18px 0 6px; }
  .gris { color: #789; }
  .src { font-size: 11px; }
  .barre { display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; }
  button { font: inherit; padding: 4px 12px; border: 1px solid #b9ccd8; border-radius: 6px;
    background: #eaf4fa; color: #22333d; cursor: pointer; }
  button:hover:enabled { background: #dcecf6; }
  button:disabled { opacity: .55; cursor: progress; }
  .err { color: #b00; background: #fff0f0; border-radius: 6px; padding: 6px 8px; font-size: 12px; }
  .bloc { margin: 12px 0 0; border-top: 1px solid #eceff1; padding-top: 6px; }
  .ligne { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .ligne .gris { margin-left: auto; font-size: 11px; }
  .titre b { font-size: 13px; }
  .titre .nom { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .fois { display: flex; align-items: center; gap: 2px; font-size: 11px; color: #567;
    border: 1px solid #dbe5eb; border-radius: 4px; padding: 0 4px; cursor: pointer; }
  .fois input { margin: 0; }
  .note { color: #7a5b16; background: #fff7e6; border-radius: 6px; padding: 6px 8px;
    font-size: 12px; margin: 8px 0 0; }
  .piece { padding-left: 14px; }
  .pastille { width: 11px; height: 11px; border-radius: 3px; border: 1px solid #0002; }
  .curseur { display: grid; grid-template-columns: 54px 1fr 58px; align-items: center; gap: 6px;
    padding: 3px 0; }
  .curseur b { text-align: right; font-variant-numeric: tabular-nums; }
  svg { background: #fff; border-radius: 8px; box-shadow: 0 2px 14px #0001; }
</style><body><script>${bundle.outputFiles[0].text}</script></body>`;
writeFileSync(join(CACHE, `${NOM}.html`), page);

// --- 3. Le serveur : c'est lui qui permet de RECHARGER -------------------------
// Une page en file:// ne peut rien demander à personne ; servie en http, elle
// redemande le dessin à chaque clic, et l'état de la fenêtre (lacet, cases
// décochées) survit puisque la page, elle, ne recharge pas.
const envoie = (res, code, type, corps) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(corps);
};

const serveur = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  try {
    if (url === '/') return envoie(res, 200, 'text/html; charset=utf-8', page);
    if (url === '/donnees') return envoie(res, 200, 'application/json', JSON.stringify(donnees));
    if (url === '/recharger' && req.method === 'POST') {
      donnees = charger(true);
      return envoie(res, 200, 'application/json', JSON.stringify(donnees));
    }
  } catch (e) {
    console.error(`  ! ${e && e.stack ? e.stack : e}`);
    return envoie(res, 500, 'application/json', JSON.stringify({ erreur: String((e && e.message) || e) }));
  }
  return envoie(res, 404, 'text/plain', 'rien ici');
});

serveur.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${serveur.address().port}/`;
  if (args.includes('--sans-ouvrir')) {
    console.log(`\n  → ${url} (Ctrl+C pour fermer)`);
  } else {
    // Une fenêtre à part, pas un onglet perdu dans la session de Frank.
    spawn(findChrome(), [`--app=${url}`, '--window-size=1260,700'], { detached: true, stdio: 'ignore' }).unref();
    console.log(`\n  → fenêtre ouverte sur « ${NOM} » — ${url}`);
    console.log(`    « ↻ recharger » relit ${SOURCE} sans quitter la fenêtre. Ctrl+C pour fermer.`);
  }
});

process.on('SIGINT', () => {
  serveur.close();
  process.exit(0);
});
