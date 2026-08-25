// Capture d'un composant pour illustrer sa fiche d'aide
// (docs/img/composants/<type>.webp). Rend le VRAI élément forké dans Chrome
// headless, sur fond transparent, à la même largeur que les images existantes
// (~360 px). Chrome ne sait tirer qu'en PNG : la capture est convertie en WebP
// (avec sa transparence) par `_png2webp.mjs`, format de TOUTES les images de
// l'aide depuis la v2026.7.187.
// Usage : node scripts/_capture-part.mjs <type> [<type>…]
import { writeFileSync, mkdirSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'img', 'composants');

// type → module d'élément + balise + attributs de la variante illustrée.
// `width` : largeur de sortie si 360 px donne une image démesurée (composant
// étroit et haut, comme les condensateurs — 360 de large = 1000 de haut).
// `height` : même chose mais l'échelle est calée sur la HAUTEUR — pour les
// composants dessinés en portrait (Pico 2), où c'est elle qui déborde.
const PARTS = {
  ldr: { module: 'ldr-element.mjs', tag: 'kablix-ldr' },
  ntc: { module: 'ntc-element.mjs', tag: 'kablix-ntc' },
  ptc: { module: 'ptc-element.mjs', tag: 'kablix-ptc' },
  // Phototransistor : dessin étroit et haut (30×50) — sortie calée sur la
  // hauteur, sinon 360 px de large donnent une image démesurée.
  phototransistor: { module: 'phototransistor-element.mjs', tag: 'kablix-phototransistor', height: 250 },
  // Photodiode : même dessin étroit et haut (30×50) que le phototransistor.
  photodiode: { module: 'photodiode-element.mjs', tag: 'kablix-photodiode', height: 250 },
  'grove-pico': { module: 'grove-shield-element.mjs', tag: 'kablix-grove-pico', attrs: { pwr: '3v3' } },
  // Les quatre Pico partagent l'élément <kablix-pico-board> : seul `variant`
  // change. Pico et Pico W sont dessinées en paysage, les Pico 2 en portrait —
  // d'où la sortie calée sur la hauteur pour ces deux-là.
  pico: { module: 'pico-board.mjs', tag: 'kablix-pico-board', attrs: { variant: 'pico' } },
  picow: { module: 'pico-board.mjs', tag: 'kablix-pico-board', attrs: { variant: 'picow' } },
  pico2: { module: 'pico-board.mjs', tag: 'kablix-pico-board', height: 360, attrs: { variant: 'pico2' } },
  pico2w: { module: 'pico-board.mjs', tag: 'kablix-pico-board', height: 360, attrs: { variant: 'pico2w' } },
  diode: { module: 'diode-element.mjs', tag: 'kablix-diode' },
  'condo-np': { module: 'capacitor-element.mjs', tag: 'kablix-capacitor', width: 190, attrs: { ctype: 'np', value: '1e-7' } },
  'condo-p-1': { module: 'capacitor-element.mjs', tag: 'kablix-capacitor', width: 165, attrs: { ctype: 'p', value: '1e-5' } },
  'condo-p-2': { module: 'capacitor-element.mjs', tag: 'kablix-capacitor', width: 125, attrs: { ctype: 'chem', value: '1e-4' } },
  ventilo: { module: 'ventilo-element.mjs', tag: 'kablix-ventilo' },
  'moteur-dc': { module: 'moteur-dc-element.mjs', tag: 'kablix-moteur-dc', width: 250 },
  dht11: { module: 'dht22-element.mjs', tag: 'kablix-dht11' },
  // Boîtier partagé TO-92 : même dessin pour les trois, seule l'inscription
  // change (`text`, une ligne par saut de ligne) — comme dans le catalogue.
  // Le composant de bibliothèque : illustré avec la référence la plus courante,
  // celle que le sélecteur propose en tête de liste.
  transistor: { module: 'transistor-element.mjs', tag: 'kablix-transistor', width: 200, attrs: { text: 'PN\n2222A', named: '1' } },
  pn2222a: { module: 'transistor-element.mjs', tag: 'kablix-transistor', width: 200, attrs: { text: 'PN\n2222A', named: '1' } },
  npn: { module: 'transistor-element.mjs', tag: 'kablix-transistor', width: 200, attrs: { text: 'NPN' } },
  pnp: { module: 'transistor-element.mjs', tag: 'kablix-transistor', width: 200, attrs: { symbol: 'pnp', text: 'PNP' } },
  relais: { module: 'relais-element.mjs', tag: 'kablix-relais' },
  // Boutons poussoirs : capuchon au REPOS, couleur du catalogue pour le grand
  // modèle (le 6 mm n'a que son capuchon rouge).
  button: { module: 'pushbutton-element.mjs', tag: 'kablix-pushbutton', attrs: { color: 'green' } },
  'button-6mm': { module: 'pushbutton-6mm-element.mjs', tag: 'kablix-pushbutton-6mm' },
  // Capteur à effet Hall : boîtier partagé TO92S (dessin étroit et haut comme le
  // TO-92 du transistor) — illustré hors simulation, donc sans son aimant.
  hall: { module: 'hall-element.mjs', tag: 'kablix-hall', width: 160 },
  // Potentiomètre ajustable : illustré avec le code le plus parlant (104 =
  // 100 kΩ), vis à mi-course.
  'pot-rot2': { module: 'pot-rot2-element.mjs', tag: 'kablix-pot-rot2', width: 200, attrs: { ohms: '100000', value: '50' } },
  powerbank: { module: 'powerbank-element.mjs', tag: 'kablix-powerbank' },
  // Multimètre de table : dessin en paysage (270×90), illustré en VOLTMÈTRE
  // (levier en bas) — le mode par défaut du catalogue.
  multimetre: { module: 'multimetre-element.mjs', tag: 'kablix-multimetre', attrs: { mode: 'voltage' } },
  // Oscilloscope : dessin en portrait (220×270), illustré avec une VRAIE courbe
  // — un écran vide ne dirait pas ce que fait l'appareil. `js` pousse le signal
  // comme le ferait la simulation, dix secondes à 60 images par seconde.
  oscillo: {
    module: 'oscillo-element.mjs', tag: 'kablix-oscillo', width: 240,
    attrs: { voltsdiv: '1', sdiv: '1' },
    js: 'for (let i = 0; i <= 600; i++) el.push(i * 1000 / 60, 2 + 1.6 * Math.sin((i / 60) * Math.PI * 2 / 2.5));',
  },
  // Patte seule : illustrée patella PLIÉ (une patte bien droite se lit comme un
  // simple tube — la pose montre les deux articulations).
  patte: {
    module: 'patte-element.mjs', tag: 'kablix-patte', width: 250,
    attrs: { speed: '0', coxaAngle: '75', patellaAngle: '125' },
  },
  // Araignée : électronique embarquée toujours dessinée (v2026.8.58), patellas
  // pliées (`speed: 0` = pas d'animation, la pose est atteinte avant la mesure).
  araignee: {
    module: 'araignee-element.mjs', tag: 'kablix-araignee',
    attrs: { speed: '0', patella0: '120', patella1: '120', patella2: '120', patella3: '120' },
  },
};

// Circuits intégrés logiques : douze références pour UN dessin (le boîtier
// DIL-14), seule l'inscription et les noms de pattes changent. `catalog` prend
// ces attributs à la source (`partDef`) au lieu de les recopier ici.
for (const t of ['cd4081', 'cd4071', 'cd4070', 'cd4011', 'cd4001', 'cd40106',
  '74xx08', '74xx32', '74xx86', '74xx00', '74xx02', '74xx14']) {
  PARTS[t] = { module: 'logic-ic-element.mjs', tag: 'kablix-ic', catalog: t };
}

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
${spec.catalog ? `import { partDef } from '../../src/webview/diagram/catalog.mjs';` : ''}
const el = document.createElement('${spec.tag}');
${spec.catalog ? `for (const [k, v] of Object.entries(partDef(${JSON.stringify(spec.catalog)}).attrs ?? {})) el.setAttribute(k, v);` : ''}
${Object.entries(spec.attrs ?? {}).map(([k, v]) => `el.setAttribute('${k}', ${JSON.stringify(v)});`).join('\n')}
document.body.appendChild(el);
${spec.js ?? ''}
// Un custom element sans style :host reste en display inline, et transform
// n'a AUCUN effet sur une boîte inline : le dessin resterait à sa taille
// naturelle dans une image dimensionnée pour l'échelle voulue (carte tassée
// dans le coin, le reste transparent).
if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
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
  const scale = ${spec.height ? `${spec.height} / ((y1 - y0) * px)` : `${spec.width ?? WIDTH} / ((x1 - x0) * px)`};
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
  const bundle = await esbuild({ entryPoints: [entryPath], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' } });
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
  // Conversion sur place, puis seul le .webp rejoint docs/img/composants.
  execFileSync(process.execPath, [join(ROOT, 'scripts', '_png2webp.mjs'), shot], { stdio: 'ignore' });
  const webp = shot.replace(/\.png$/, '.webp');
  if (!existsSync(webp)) { console.warn(`  ✗ ${type} : conversion WebP échouée`); continue; }
  renameSync(webp, join(OUT, `${type}.webp`));
  unlinkSync(shot);
  console.log(`  ✓ ${type}.webp (${w}×${h}, ${(readFileSync(join(OUT, `${type}.webp`)).length / 1024).toFixed(0)} Ko)`);
}
