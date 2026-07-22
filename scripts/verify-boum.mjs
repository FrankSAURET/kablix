// Banc de mesure de l'explosion « Boum » dans le VRAI éditeur (Chrome headless).
// Vérifie deux régressions historiques :
//  - v156/157 : l'overlay d'explosion est peint à la HAUTEUR du composant grillé
//    (LED 50, 7 seg 90, barre 110), suit le zoom du canvas — pas clippé/minuscule ;
//  - v158 : re-rendre un composant grillé (comme le faisait sim.mts en
//    réassignant `values` à chaque tick) NE recrée PAS l'overlay — sinon
//    l'animation repart de son 1er keyframe et l'explosion reste figée petite.
// L'animation est coupée avant mesure de taille (sinon figée à l'état initial en
// headless, virtual-time).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-boum');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

const entry = `
import { Editor } from '${SRC}/diagram/editor.mjs';
import '${SRC}/composants/led-element.mjs';
import '${SRC}/composants/7segment-element.mjs';
import '${SRC}/composants/led-bar-graph-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const editor = new Editor(
    document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), document.getElementById('inspector'));
  const led = editor.addPart('led', 100, 100);
  const seg = editor.addPart('7seg', 300, 100);
  const bar = editor.addPart('led-bar', 500, 100);
  await wait(80);
  for (const id of [led.id, seg.id, bar.id]) {
    const el = editor.rendered.get(id).el;
    el.burned = true;
    await el.updateComplete;
  }
  await wait(80);
  const boumOf = (id) => editor.rendered.get(id).el.renderRoot.querySelector('[class^="boum-"]');
  const sizeOf = (id) => {
    const b = boumOf(id);
    if (!b) return null;
    b.style.animation = 'none'; // sinon figé à l'état initial (headless)
    const r = b.getBoundingClientRect();
    return Math.round(r.width);
  };
  // Régression v158 : re-render à valeurs inchangées (fix sim.mts) → overlay stable.
  const segEl = editor.rendered.get(seg.id).el;
  const idBefore = boumOf(seg.id)?.className;
  for (let t = 0; t < 8; t++) {
    const cur = segEl.values;               // fix : ne réassigne QUE si encore allumé
    if (cur?.some((v) => v)) segEl.values = cur.map(() => 0);
    await segEl.updateComplete;
  }
  const idStable = boumOf(seg.id)?.className;
  // Contre-épreuve : ancien comportement (array neuve à chaque tick) → recréé.
  const idA = boumOf(seg.id)?.className;
  for (let t = 0; t < 5; t++) { segEl.values = new Array(24).fill(0); await segEl.updateComplete; }
  const idB = boumOf(seg.id)?.className;

  const res = {
    ledSize: sizeOf(led.id), segSize: sizeOf(seg.id), barSize: sizeOf(bar.id),
    overlayStableOnResilentRerender: idBefore === idStable,
    oldBehaviorRecreates: idA !== idB,
  };
  const pre = document.createElement('pre'); pre.id = 'm'; pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: join(ROOT, 'scripts'), logLevel: 'silent' });
const css = existsSync(join(ROOT, 'media/styles.css')) ? readFileSync(join(ROOT, 'media/styles.css'), 'utf8') : '';
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><style>${css}</style>
<div id="canvas" style="position:absolute;inset:0;overflow:hidden"><div id="palette"></div><svg id="wires"></svg></div>
<div id="inspector"></div><script>${b.outputFiles[0].text}</script>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✅' : '❌'} ${label}`); if (!ok) failures++; };
if (!chrome) {
  console.log('(Chrome introuvable : banc boum sauté)');
} else {
  const url = 'file:///' + join(CACHE, 'p.html').replace(/\\/g, '/');
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="m"[^>]*>([^<]+)<\/pre>/);
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
  check('LED : explosion ≈ 50 px (hauteur du corps)', r && r.ledSize >= 40 && r.ledSize <= 60);
  check('7 seg : explosion ≈ 90 px (hauteur du corps, pas minuscule)', r && r.segSize >= 80 && r.segSize <= 100);
  check('barre : explosion ≈ 110 px (hauteur du corps)', r && r.barSize >= 100 && r.barSize <= 120);
  check('overlay STABLE si re-render à valeurs inchangées (fix sim.mts v158)', r && r.overlayStableOnResilentRerender);
  check('contre-épreuve : re-render à array neuve RECRÉE l\'overlay (bug d\'origine)', r && r.oldBehaviorRecreates);
}
console.log(failures ? `Boum : ${failures} échec(s).` : 'Boum : tous les contrôles passent.');
process.exit(failures ? 1 : 0);
