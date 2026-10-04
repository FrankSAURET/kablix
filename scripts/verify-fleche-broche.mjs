// Banc de la flèche de broche en cause (Chrome headless, vrai éditeur) :
//  - `setFaultyPin` pose une flèche dont la pointe touche la broche, côté extérieur
//    de la carte (broche de gauche → flèche à gauche, broche de droite → à droite) ;
//  - l'étiquette d'explication se range contre la broche, au bout de la flèche
//    (et non plus au bord droit de la carte) ;
//  - retirer le défaut retire la flèche ; `clearFaults` vide tout.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-fleche-broche');
mkdirSync(CACHE, { recursive: true });
const SRC = (ROOT + '/src/webview').replace(/\\/g, '/');

const entry = `
import { Editor } from '${SRC}/diagram/editor.mjs';
import '${SRC}/composants/pico-board.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const editor = new Editor(
    document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), document.getElementById('inspector'));
  const pico = editor.addPart('pico', 1400, 1250);
  await wait(300);
  const r = editor.rendered.get(pico.id);
  const centre = (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, b }; };
  const boite = (r.container.querySelector('.part__selbox') || r.container.querySelector('.part__body')).getBoundingClientRect();
  const cx = boite.left + boite.width / 2, cy = boite.top + boite.height / 2;
  const loin = (x, y) => Math.hypot(x - cx, y - cy);
  const res = { pins: {} };
  for (const pin of ['GP15', 'GP16']) {
    editor.setFaulty(pico.id, true, 'Explication de test pour la broche ' + pin);
    editor.setFaultyPin(pico.id, pin, true);
    await wait(700);
    const dot = r.hotspots.get(pin);
    const d = centre(dot);
    const arrow = editor.faultLayer.querySelector('.pin-arrow[data-pin="' + pin + '"]');
    const note = editor.faultLayer.querySelector('.part__fault[data-part="' + pico.id + '"]');
    const a = arrow && centre(arrow);
    const n = note && note.getBoundingClientRect();
    // Point de l'étiquette le plus proche de la broche.
    const nx = n ? Math.max(n.left, Math.min(d.x, n.right)) : 0, ny = n ? Math.max(n.top, Math.min(d.y, n.bottom)) : 0;
    res.pins[pin] = {
      arrow: !!arrow,
      arrowOutside: a ? loin(a.x, a.y) > loin(d.x, d.y) : false,
      arrowDist: a ? Math.round(Math.hypot(a.x - d.x, a.y - d.y)) : null,
      noteOutside: n ? loin(nx, ny) >= loin(d.x, d.y) - 1 : false,
      noteDist: n ? Math.round(Math.hypot(nx - d.x, ny - d.y)) : null,
      ring: dot.classList.contains('pin--faulty'),
    };
    editor.setFaultyPin(pico.id, pin, false);
    editor.setFaulty(pico.id, false);
    res.pins[pin].goneAfter = !editor.faultLayer.querySelector('.pin-arrow');
  }
  editor.setFaulty(pico.id, true, 'x');
  editor.setFaultyPin(pico.id, 'GP15', true);
  editor.clearFaults();
  res.clearedAll = editor.faultLayer.children.length === 0 && !r.hotspots.get('GP15').classList.contains('pin--faulty');
  const pre = document.createElement('pre'); pre.id = 'm'; pre.textContent = JSON.stringify(res); document.body.appendChild(pre);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: join(ROOT, 'scripts'), logLevel: 'silent' });
const css = readFileSync(join(ROOT, 'media/styles.css'), 'utf8');
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><style>${css}</style>
<div id="canvas" style="position:absolute;inset:0;overflow:hidden"><div id="palette"></div><svg id="wires" class="wires"></svg></div>
<div id="inspector"></div><script>${b.outputFiles[0].text}</script>`);
const chrome = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync);
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✅' : '❌'} ${label}`); if (!ok) failures++; };
if (!chrome) {
  console.log('(Chrome introuvable : banc flèche de broche sauté)');
} else {
  const url = 'file:///' + join(CACHE, 'p.html').replace(/\\/g, '/');
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="m"[^>]*>([^<]+)<\/pre>/);
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
  check('page mesurée', !!r);
  for (const pin of ['GP15', 'GP16']) {
    const p = r?.pins?.[pin];
    check(`${pin} : une flèche est posée`, p?.arrow === true);
    check(`${pin} : la flèche est à l'extérieur de la carte, vers la broche`, p?.arrowOutside === true);
    check(`${pin} : la flèche touche la broche (${p?.arrowDist} px)`, p && p.arrowDist > 5 && p.arrowDist < 45);
    check(`${pin} : l'étiquette est à l'extérieur, contre la broche (${p?.noteDist} px du bord)`, p?.noteOutside === true && p.noteDist < 70);
    check(`${pin} : le rond rouge reste`, p?.ring === true);
    check(`${pin} : défaut retiré → flèche retirée`, p?.goneAfter === true);
  }
  check('clearFaults vide flèches, étiquettes et ronds', r?.clearedAll === true);
}
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
check('sim.mts : plus de message de code dans la barre d\'état (flashStatus ⚠)', !/flashStatus\(`⚠/.test(sim));
check('sim.mts : les erreurs du code vont au bas du panneau Variables', /signalerErreurCode\(t\(c\.message/.test(sim) && /signalerErreurCode\(t\(msg/.test(sim));
const html = readFileSync(join(ROOT, 'src/webview-html.ts'), 'utf8');
check('panneau Variables : zone d\'erreurs en bas, après le tableau', /id="debug-vars"[\s\S]{0,400}id="debug-errors"/.test(html));
const css2 = readFileSync(join(ROOT, 'media/styles.css'), 'utf8');
check('styles : erreurs jaune sur rouge', /\.debug__errors\s*\{[^}]*background:\s*#c00000;[^}]*color:\s*#ffe000/.test(css2));
console.log(failures ? `Flèche de broche : ${failures} échec(s).` : 'Flèche de broche : tous les contrôles passent.');
process.exit(failures ? 1 : 0);
