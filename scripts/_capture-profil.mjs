// Illustration d'un PROFIL dessiné : le contour est mis en volume par le vrai
// moteur `iso3d.mts` et tiré en image pour la doc (docs/img/systemes/<nom>.webp).
// C'est la moitié droite du « dessin d'origine → ce que ça donne » de
// docs/fr/Drawing-systems.md — l'image est donc toujours à jour du moteur,
// jamais une capture d'écran à la main.
//
// Usage : node scripts/_capture-profil.mjs chassis-demo:plaque femur-demo:piece
//         node scripts/_capture-profil.mjs corps-demo:assemblage corps-demo:eclate
import { writeFileSync, mkdirSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'img', 'systemes');
const SCRATCH = join(ROOT, 'node_modules', '.cache-capture');
// Largeur des illustrations de l'aide ; `--width=` sert surtout à regarder de
// près un rendu douteux avant de le livrer.
const WIDTH = Number(process.argv.find((a) => a.startsWith('--width='))?.slice(8) ?? 360);

const asked = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!asked.length) {
  console.error('Usage: node scripts/_capture-profil.mjs <nom>:<plaque|piece> [...]');
  process.exit(1);
}

function findChrome() {
  const cand = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const found = cand.find((c) => existsSync(c));
  if (!found) throw new Error('Chrome/Edge introuvable (définir CHROME_PATH)');
  return found;
}

mkdirSync(SCRATCH, { recursive: true });
mkdirSync(OUT, { recursive: true });
const chrome = findChrome();

for (const spec of asked) {
  const [name, mode = 'plaque'] = spec.split(':');
  // Mode « plat » : le contour tel que le LECTEUR l'a compris, sur la grille de
  // 10 px. C'est la colonne « dessin d'origine » de la doc, et le premier
  // endroit où regarder quand un tracé donne un volume inattendu.
  const flat = `
const p = profile(${JSON.stringify(name)});
const W = Math.ceil(p.w) + 24, H = Math.ceil(p.h) + 24;
const ring = (r) => r.map((q) => (q.x + W / 2).toFixed(2) + ',' + (q.y + H / 2).toFixed(2)).join(' ');
const body = svg\`
  <defs><pattern id="g10" width="10" height="10" patternUnits="userSpaceOnUse">
    <path d="M10 0H0V10" fill="none" stroke="#cfe3ff" stroke-width="0.5"/></pattern></defs>
  <rect width="100%" height="100%" fill="url(#g10)"/>
  <polygon points=\${ring(p.poly)} fill="#bcdff0" stroke="#33566a" stroke-width="1"/>
  \${p.holes.map((h) => svg\`<polygon points=\${ring(h)} fill="#fff" stroke="#33566a" stroke-width="1"/>\`)}
  \${p.poly.map((q) => svg\`<circle cx=\${q.x + W / 2} cy=\${q.y + H / 2} r="1.1" fill="#ee0000"/>\`)}
\`;`;
  // Deux mises en scène, exactement celles des deux usages documentés : une
  // PLAQUE est extrudée vers le haut (châssis), une PIÈCE est posée le long
  // d'un segment (os de patte, bloc de servo).
  // Un ASSEMBLAGE : plusieurs pièces posées les unes par rapport aux autres, en
  // millimètres. `:eclate` les écarte le long de leur normale — c'est la vue de
  // notice de montage, et le seul moyen de voir ce qu'il y a entre deux flancs.
  const assemble = (eclate) => `
const A = assemblage(${JSON.stringify(name)});
const k = 300 / Math.max(A.box.x, A.box.y, A.box.z, 1);
const faces = assemblyFaces(A, { scale: k, xf: (p) => rotZ(p, 22), eclate: ${eclate} * k });
const body = svg\`<g>\${renderFaces(faces, 220, 170)}</g>\`;
const W = 440, H = 340;`;
  // Mode « plans » : la figure du REPÈRE, celle qui manque toujours quand un
  // dessin ne donne pas ce qu'on attendait. La MÊME pièce en L posée dans les
  // trois plans, chacune avec le x et le y de sa feuille, et le repère du monde
  // à part. Une pièce en L parce qu'un rectangle ne dit pas s'il est retourné.
  const plans = `
// Une pièce en L : un rectangle ne dirait pas s'il est retourné.
const L = [
  { x: -17, y: -13 }, { x: 17, y: -13 }, { x: 17, y: -3 },
  { x: -5, y: -3 }, { x: -5, y: 13 }, { x: -17, y: 13 },
];
const POSES = ['dessus', 'flanc', 'face'];
const xf = (p) => rotZ(p, 22);
const O = { x: 0, y: 0, z: 0 };
const CY = 120;
// Trois vignettes CÔTE À CÔTE en coordonnées d'écran : décaler les pièces dans
// le monde les ferait descendre en cascade (l'isométrie envoie +x en bas à
// droite) et le lecteur croirait à trois positions, pas à trois orientations.
const parts = [svg\`<g>\${axisGizmo(O, 42, 76, CY, xf)}</g>
  <text x="76" y=\${CY + 74} text-anchor="middle" font-size="12" font-family="sans-serif"
    fill="#5b6b75">le monde</text>\`];
POSES.forEach((plan, i) => {
  const cx = 210 + i * 150;
  const { u, v } = PLANES[plan];
  parts.push(svg\`<g>\${renderFaces(slabFaces(L, plan, O, 3, '#bcdff0', [], xf), cx, CY)}</g>
    <g>\${axisGizmo(O, 30, cx, CY, xf, {
      labels: ['x', 'y', 'ép.'], dirs: [u, v, planeNormal(plan)],
      colors: ['#7a4dd6', '#c2600a', '#8a9ba7'],
    })}</g>
    <text x=\${cx} y=\${CY + 74} text-anchor="middle" font-size="14" font-family="sans-serif"
      font-weight="700" fill="#22333d">\${plan}</text>\`);
});
const body = svg\`\${parts}\`;
const W = 640, H = 220;`;
  const scene = mode === 'plans' ? plans
    : mode === 'assemblage' ? assemble(0) : mode === 'eclate' ? assemble(18)
    : mode === 'plat' ? flat : mode === 'piece'
    ? `
const p = profile(${JSON.stringify(name)});
const from = { x: -34, y: 0, z: 0 };
const to = { x: 34, y: 0, z: 0 };
const faces = extrudeProfile(p, from, to, 10, '#c9d6de', p.holes);
const body = svg\`<g>\${renderFaces(faces, 90, 60)}</g>\`;
const W = 180, H = 120;`
    : `
const p = profile(${JSON.stringify(name)});
const plate = prismFaces(p.poly, 0, 8, '#bcdff0');
const faces = [
  ...plate,
  // Les perçages : des décalques sombres posés sur la face du dessus.
  ...p.holes.flatMap((h) => decalFaces(h, 8, '#4b6b7a', plate)),
];
const body = svg\`<g>\${renderFaces(faces, 130, 90)}</g>\`;
const W = 260, H = 180;`;

  // Le repère X/Y/Z dans un coin de toute image EN VOLUME : sans lui, une
  // illustration ne dit pas dans quel sens la pièce est partie — exactement la
  // question qu'on se pose devant un dessin qui n'a pas donné ce qu'on attendait.
  // La figure des plans a déjà les siens, le contour à plat n'a pas de volume.
  // Taille proportionnée à la vignette, et coin bas-gauche assez rentré pour que
  // les étiquettes ne se fassent pas rogner par le viewBox (le SVG écrête).
  const gizmo = mode === 'plat' || mode === 'plans'
    ? 'const gizmo = [];'
    : `
const gz = Math.max(16, Math.min(W, H) * 0.16);
const gizmo = axisGizmo({ x: 0, y: 0, z: 0 }, gz, gz * 1.2 + 24, H - gz * 0.6 - 22, (p) => rotZ(p, 22));`;
  const entry = `
import { html, svg, render } from 'lit';
import {
  prismFaces, extrudeProfile, decalFaces, renderFaces, assemblyFaces, rotZ,
  slabFaces, axisGizmo, project, planeNormal, PLANES,
} from '../../src/webview/composants/iso3d.mjs';
import { profile } from '../../src/webview/composants/profils.mjs';
import { assemblage } from '../../src/webview/composants/assemblages.mjs';
${scene}
${gizmo}
render(html\`<svg id="art" width=\${W} height=\${H} viewBox="0 0 \${W} \${H}" xmlns="http://www.w3.org/2000/svg">\${body}<g>\${gizmo}</g></svg>\`, document.body);
setTimeout(() => {
  const s = document.getElementById('art');
  const bb = s.getBBox();
  const scale = ${WIDTH} / bb.width;
  s.style.transformOrigin = '0 0';
  s.style.transform = 'scale(' + scale + ') translate(' + (-bb.x) + 'px,' + (-bb.y) + 'px)';
  const w = Math.ceil(bb.width * scale + 8), h = Math.ceil(bb.height * scale + 8);
  document.body.style.width = w + 'px';
  document.body.style.height = h + 'px';
  document.getElementById('size').textContent = w + 'x' + h;
}, 60);
`;
  const entryPath = join(SCRATCH, 'profil-entry.mjs');
  writeFileSync(entryPath, entry);
  const bundle = await esbuild({ entryPoints: [entryPath], bundle: true, format: 'iife', write: false });
  const htmlPath = join(SCRATCH, 'profil.html');
  writeFileSync(htmlPath,
    `<!doctype html><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:4px;background:transparent}</style>` +
    `<body><span id="size" style="position:absolute;left:-9999px"></span>` +
    `<script>${bundle.outputFiles[0].text}</script></body>`);

  const dom = execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom',
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const size = dom.match(/id="size"[^>]*>(\d+)x(\d+)</);
  if (!size) { console.warn(`  ✗ ${name} : mesure échouée`); continue; }
  const [, cw, ch] = size;

  // Le contour à plat et son volume sont deux images de la même pièce : elles
  // se répondent dans la doc, elles ne doivent pas s'écraser.
  const outName = mode === 'plat' || mode === 'eclate' ? `${name}-${mode}` : name;
  const shot = join(SCRATCH, `${outName}.png`);
  if (existsSync(shot)) unlinkSync(shot);
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--default-background-color=00000000',
    '--virtual-time-budget=8000',
    `--screenshot=${shot}`, `--window-size=${cw},${ch}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });
  if (!existsSync(shot)) { console.warn(`  ✗ ${name} : capture échouée`); continue; }

  execFileSync(process.execPath, [join(ROOT, 'scripts', '_png2webp.mjs'), shot], { stdio: 'ignore' });
  const webp = shot.replace(/\.png$/, '.webp');
  if (!existsSync(webp)) { console.warn(`  ✗ ${name} : conversion WebP échouée`); continue; }
  renameSync(webp, join(OUT, `${outName}.webp`));
  unlinkSync(shot);
  console.log(`  ✓ systemes/${outName}.webp (${cw}×${ch}, ${(readFileSync(join(OUT, `${outName}.webp`)).length / 1024).toFixed(0)} Ko)`);
}
