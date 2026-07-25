// Capture PNG d'un composant pour illustrer sa fiche d'aide
// (docs/img/composants/<type>.png). Rend le VRAI élément forké dans Chrome
// headless, sur fond transparent, à la même largeur que les images existantes
// (~360 px). Usage : node scripts/_capture-part.mjs <type> [<type>…]
import { writeFileSync, mkdirSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'img', 'composants');

// type → module d'élément + balise + attributs de la variante illustrée.
const PARTS = {
  ldr: { module: 'ldr-element.mjs', tag: 'kablix-ldr' },
  ntc: { module: 'ntc-element.mjs', tag: 'kablix-ntc' },
  ptc: { module: 'ptc-element.mjs', tag: 'kablix-ptc' },
  'grove-pico': { module: 'grove-shield-element.mjs', tag: 'kablix-grove-pico', attrs: { pwr: '3v3' } },
};

const WIDTH = 360; // largeur des illustrations de fiche déjà en place
const asked = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const todo = (asked.length ? asked : Object.keys(PARTS)).filter((t) => {
  if (!PARTS[t]) { console.warn(`  ✗ ${t} : composant inconnu`); return false; }
  return true;
});
if (!todo.length) process.exit(1);

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

const SCRATCH = join(ROOT, 'node_modules', '.cache-capture');
mkdirSync(SCRATCH, { recursive: true });
const chrome = findChrome();

for (const type of todo) {
  const spec = PARTS[type];
  // Page minimale : l'élément seul, mis à la largeur voulue, fond transparent.
  const entry = `
import '../../src/webview/composants/${spec.module}';
const el = document.createElement('${spec.tag}');
${Object.entries(spec.attrs ?? {}).map(([k, v]) => `el.setAttribute('${k}', '${v}');`).join('\n')}
document.body.appendChild(el);
setTimeout(() => {
  const svg = el.shadowRoot && el.shadowRoot.querySelector('svg');
  if (!svg) return;
  const box = svg.getBoundingClientRect();
  // Zone UTILE = contenu réellement dessiné (getBBox), borné au viewBox qui le
  // clippe. Sans ça, un composant dont le SVG réserve de la place vide (Grove
  // Shield) donne une image avec une grande bande transparente.
  const vb = svg.viewBox.baseVal;
  const bb = svg.getBBox();
  const x0 = Math.max(vb.x, bb.x), y0 = Math.max(vb.y, bb.y);
  const x1 = Math.min(vb.x + vb.width, bb.x + bb.width);
  const y1 = Math.min(vb.y + vb.height, bb.y + bb.height);
  const px = box.width / vb.width; // px CSS par unité de viewBox
  const scale = ${WIDTH} / ((x1 - x0) * px);
  el.style.transformOrigin = '0 0';
  el.style.transform = 'scale(' + scale + ') translate(' + (-x0 * px) + 'px,' + (-y0 * px) + 'px)';
  // La page est recadrée sur le dessin mis à l'échelle (marge de 4 px).
  const w = Math.ceil((x1 - x0) * px * scale + 8), h = Math.ceil((y1 - y0) * px * scale + 8);
  document.body.style.width = w + 'px';
  document.body.style.height = h + 'px';
  document.getElementById('size').textContent = w + 'x' + h;
}, 80);
`;
  const entryPath = join(SCRATCH, 'entry.mjs');
  writeFileSync(entryPath, entry);
  const bundle = await esbuild({ entryPoints: [entryPath], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' } });
  const htmlPath = join(SCRATCH, 'page.html');
  writeFileSync(htmlPath,
    `<!doctype html><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:4px;background:transparent}</style>` +
    `<body><span id="size" style="position:absolute;left:-9999px"></span>` +
    `<script>${bundle.outputFiles[0].text}</script></body>`);

  // Passe 1 : mesurer le dessin mis à l'échelle (--screenshot capture TOUTE la
  // fenêtre, il faut donc dimensionner la fenêtre au contenu avant de tirer).
  const dom = execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom',
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const size = dom.match(/id="size"[^>]*>(\d+)x(\d+)</);
  if (!size) { console.warn(`  ✗ ${type} : mesure échouée`); continue; }
  const [, cw, ch] = size;

  // Passe 2 : capture à la taille exacte du dessin.
  const shot = join(SCRATCH, `${type}.png`);
  if (existsSync(shot)) unlinkSync(shot);
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--default-background-color=00000000', // fond transparent, comme les images existantes
    '--virtual-time-budget=8000',
    `--screenshot=${shot}`, `--window-size=${cw},${ch}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });
  if (!existsSync(shot)) { console.warn(`  ✗ ${type} : capture échouée`); continue; }

  const png = readFileSync(shot);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  mkdirSync(OUT, { recursive: true });
  renameSync(shot, join(OUT, `${type}.png`));
  console.log(`  ✓ ${type}.png (${w}×${h}, ${(png.length / 1024).toFixed(0)} Ko)`);
}
