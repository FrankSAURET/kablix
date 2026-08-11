// « Montre-moi ce que ça donne » — visu interactive d'un ASSEMBLAGE dessiné.
// Relit les pièces de Composants.svg préfixées par le nom demandé, les met en
// volume avec le VRAI moteur (`iso3d.mts`) et ouvre la scène dans Chrome, avec
// de quoi la tourner, l'éclater et cacher des pièces.
//
// C'est l'outil qui manquait pour dessiner un corps en sandwich : entre deux
// flancs serrés à 3 mm, rien ne se voit sur la planche à plat, et une image fixe
// ne dit pas si les servos passent. Ici on tourne autour et on écarte.
//
// Usage : node scripts/montre.mjs araignee-corps
//         node scripts/montre.mjs --source=docs/exemples/corps-demo.svg corps-demo
//         node scripts/montre.mjs corps-demo --sans-lire     (ne relit pas le SVG)
//         node scripts/montre.mjs corps-demo --sans-ouvrir   (écrit la page, n'ouvre rien)
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import { ROOT, findChrome } from './_lire-contours.mjs';

const CACHE = join(ROOT, 'node_modules', '.cache-montre');
const args = process.argv.slice(2);
const SOURCE = args.find((a) => a.startsWith('--source='));
const nom = args.find((a) => !a.startsWith('-'));

if (!nom) {
  console.error('Usage: node scripts/montre.mjs [--source=f.svg] [--sans-lire] <assemblage>');
  process.exit(1);
}

// 1. Relire le dessin — c'est tout l'intérêt : on redessine dans Inkscape, on
// relance, on regarde. `--sans-lire` sert quand seul le moteur a changé.
if (!args.includes('--sans-lire')) {
  try {
    execFileSync(process.execPath, [
      join(ROOT, 'scripts', '_extract-assemblage.mjs'), ...(SOURCE ? [SOURCE] : []), nom,
    ], { stdio: 'inherit' });
  } catch {
    console.error(`\n  Rien à montrer : aucune pièce « ${nom}-… » n'a pu être lue.`);
    console.error('  Rappel : une pièce = un groupe dont l\'id commence par le nom de l\'assemblage,');
    console.error('  avec un texte de pose (« flanc pos=0,-9,0 ep=3 miroir=x »).');
    console.error('  Mode d\'emploi : docs/fr/Drawing-systems.md');
    process.exit(1);
  }
}

// 2. La page : le vrai moteur, bundlé tel quel.
mkdirSync(CACHE, { recursive: true });
const entryPath = join(CACHE, 'montre-entry.mjs');
writeFileSync(entryPath, `
import { html, svg, render } from 'lit';
import {
  assemblyFaces, renderFaces, rotZ, project, MATIERES, planeNormal, scale as vscale,
  rotationAxes,
} from '../../src/webview/composants/iso3d.mjs';
import { assemblage, hasAssemblage } from '../../src/webview/composants/assemblages.mjs';

const NOM = ${JSON.stringify(nom)};
if (!hasAssemblage(NOM)) {
  document.body.textContent = 'Assemblage inconnu : ' + NOM;
  throw new Error(NOM);
}
const A = assemblage(NOM);
const W = 760, H = 560;
const etat = { lacet: 22, eclate: 0, zoom: 1, axes: true, cachees: new Set() };

/** mm → unités de la feuille : l'assemblage remplit la vue quel que soit son
 *  encombrement, un corps de 100 mm comme une patte de 20. */
function echelle() {
  const grand = Math.max(A.box.x, A.box.y, A.box.z, 1);
  return (etat.zoom * 340) / grand;
}

function scene() {
  const k = echelle();
  const xf = (p) => rotZ(p, etat.lacet);
  const visibles = { ...A, pieces: A.pieces.filter((p) => !etat.cachees.has(p.name)) };
  const faces = assemblyFaces(visibles, { scale: k, xf, eclate: etat.eclate * k });
  const marques = [];
  if (etat.axes) {
    // Les DROITES d'abord, les pastilles par-dessus : deux pastilles de même
    // préfixe (« hanche-g-h », « hanche-g-b ») sont les deux bouts d'un axe de
    // rotation, et c'est la droite qui dit autour de quoi la patte tourne.
    for (const r of rotationAxes(A, k)) {
      const p1 = project(xf(r.a));
      const p2 = project(xf(r.b));
      const mx = (p1.x + p2.x) / 2 + W / 2;
      const my = (p1.y + p2.y) / 2 + H / 2;
      marques.push(svg\`<line x1=\${(p1.x + W / 2).toFixed(1)} y1=\${(p1.y + H / 2).toFixed(1)}
          x2=\${(p2.x + W / 2).toFixed(1)} y2=\${(p2.y + H / 2).toFixed(1)}
          stroke="#ee0000" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round" />
        <text x=\${mx.toFixed(1)} y=\${(my - 8).toFixed(1)} text-anchor="middle"
          font-size="12" font-family="sans-serif" font-weight="600" fill="#900">\${r.name}</text>\`);
    }
    for (const [nom, v] of Object.entries(A.axes)) {
      const q = project(xf(vscale(v, k)));
      marques.push(svg\`<circle cx=\${(q.x + W / 2).toFixed(1)} cy=\${(q.y + H / 2).toFixed(1)} r="4"
          fill="#ee0000" fill-opacity="0.85" />
        <text x=\${(q.x + W / 2 + 7).toFixed(1)} y=\${(q.y + H / 2 - 6).toFixed(1)}
          font-size="12" font-family="sans-serif" fill="#c00">\${nom}</text>\`);
    }
  }
  return svg\`<g>\${renderFaces(faces, W / 2, H / 2)}</g><g>\${marques}</g>\`;
}

function pieceLigne(p) {
  const coche = !etat.cachees.has(p.name);
  return html\`<label class="ligne">
    <input type="checkbox" .checked=\${coche} @change=\${(e) => {
      if (e.target.checked) etat.cachees.delete(p.name); else etat.cachees.add(p.name);
      dessine();
    }} />
    <span class="pastille" style=\${'background:' + (MATIERES[p.mat] ?? MATIERES.pmma)}></span>
    <b>\${p.name}</b>
    <span class="gris">\${p.plan} · \${p.w}×\${p.h} · ép.\${p.ep} mm\${p.miroir ? ' · ×2' : ''}</span>
  </label>\`;
}

function curseur(cle, libelle, min, max, pas, unite) {
  return html\`<label class="curseur">
    <span>\${libelle}</span>
    <input type="range" min=\${min} max=\${max} step=\${pas} .value=\${String(etat[cle])}
      @input=\${(e) => { etat[cle] = Number(e.target.value); dessine(); }} />
    <b>\${etat[cle]}\${unite}</b>
  </label>\`;
}

function dessine() {
  render(html\`
    <div class="panneau">
      <h1>\${NOM}</h1>
      <p class="gris">\${A.pieces.length} pièce(s) · \${A.box.x} × \${A.box.y} × \${A.box.z} mm<br>
        <span class="src">\${A.source}</span></p>
      \${curseur('lacet', 'lacet', 0, 360, 1, '°')}
      \${curseur('eclate', 'éclaté', 0, 60, 1, ' mm')}
      \${curseur('zoom', 'zoom', 0.4, 2.5, 0.05, '×')}
      <label class="ligne"><input type="checkbox" .checked=\${etat.axes}
        @change=\${(e) => { etat.axes = e.target.checked; dessine(); }} /> axes dessinés</label>
      <h2>pièces</h2>
      \${A.pieces.map(pieceLigne)}
      \${Object.keys(A.axes).length ? html\`<h2>pastilles</h2>\${Object.entries(A.axes).map(([n, v]) =>
        html\`<div class="ligne gris"><b>\${n}</b> (\${v.x}, \${v.y}, \${v.z})</div>\`)}\` : ''}
      \${rotationAxes(A).length ? html\`<h2>axes de rotation</h2>\${rotationAxes(A).map((r) =>
        html\`<div class="ligne gris"><b>\${r.name}</b>
          <span>\${r.len.toFixed(1)} mm d'écart</span></div>\`)}\` : ''}
    </div>
    <div class="vue"><svg width=\${W} height=\${H} viewBox="0 0 \${W} \${H}"
      xmlns="http://www.w3.org/2000/svg">\${scene()}</svg></div>\`, document.body);
}

// Glisser dans la vue = tourner : plus direct qu'un curseur pour chercher
// l'angle où l'on voit ce qui coince.
let glisse = null;
addEventListener('pointerdown', (e) => { if (e.target.closest('.vue')) glisse = e.clientX; });
addEventListener('pointerup', () => { glisse = null; });
addEventListener('pointermove', (e) => {
  if (glisse === null) return;
  etat.lacet = (etat.lacet + Math.round(e.clientX - glisse) + 360) % 360;
  glisse = e.clientX;
  dessine();
});
dessine();
`);

const bundle = await esbuild({
  entryPoints: [entryPath], bundle: true, format: 'iife', write: false, logLevel: 'warning',
});
const htmlPath = join(CACHE, `${nom}.html`);
writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><title>${nom} — Kablix</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; display: flex; gap: 16px; font: 13px/1.5 system-ui, sans-serif;
    background: #f6f9fb; color: #22333d; }
  .panneau { width: 300px; padding: 16px; background: #fff; box-shadow: 0 0 12px #0001;
    height: 100vh; overflow: auto; box-sizing: border-box; }
  .vue { flex: 1; display: grid; place-items: center; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #789;
    margin: 18px 0 6px; }
  .gris { color: #789; }
  .src { font-size: 11px; }
  .ligne { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .ligne .gris { margin-left: auto; font-size: 11px; }
  .pastille { width: 11px; height: 11px; border-radius: 3px; border: 1px solid #0002; }
  .curseur { display: grid; grid-template-columns: 54px 1fr 58px; align-items: center; gap: 6px;
    padding: 3px 0; }
  .curseur b { text-align: right; font-variant-numeric: tabular-nums; }
  svg { background: #fff; border-radius: 8px; box-shadow: 0 2px 14px #0001; }
</style><body><script>${bundle.outputFiles[0].text}</script></body>`);

// 3. Ouvrir. Une fenêtre à part, pas un onglet perdu dans la session de Frank.
const chrome = findChrome();
const url = `file:///${htmlPath.replace(/\\/g, '/')}`;
if (args.includes('--sans-ouvrir')) {
  console.log(`\n  → ${htmlPath}`);
} else {
  spawn(chrome, [`--app=${url}`, '--window-size=1120,620'], { detached: true, stdio: 'ignore' }).unref();
  console.log(`\n  → fenêtre ouverte sur ${nom} (${htmlPath})`);
}
