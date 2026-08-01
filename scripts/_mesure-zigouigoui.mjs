// Mesure des « zigouigouis » de l'autoroutage sur un .projix réel :
//   node scripts/_mesure-zigouigoui.mjs testkablix/condo-pico.projix
// Charge le schéma dans un VRAI Editor en Chrome headless, lance autoRoute(),
// puis liste fil par fil la polyligne obtenue, ses coudes, et les DÉCROCHÉS :
// un segment court (≤ 20 px) encadré par deux segments du MÊME axe et du MÊME
// sens — l'escalier d'un pas de grille visible sur « A Examiner/bug routage.png ».
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-zig');
const file = process.argv[2] ?? 'testkablix/condo-pico.projix';
const png = process.argv.includes('--png');
const fresh = process.argv.includes('--fresh');
// --clear=w-11 : n'efface les coudes QUE de ce fil (voir ce que le routeur ferait
// de lui seul, les autres fils restant en place).
const clear = (process.argv.find((a) => a.startsWith('--clear=')) ?? '').slice(8);
const zip = await JSZip.loadAsync(readFileSync(join(ROOT, file)));
const diagram = await zip.file('diagram.json').async('string');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/capacitor-element.mjs';
const DIAGRAM = ${diagram};
const FRESH = ${fresh};
const CLEAR = ${JSON.stringify(clear)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const editor = new Editor(document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), document.getElementById('inspector'));
  window.__editor = editor;
  editor.loadDiagram(DIAGRAM);
  await wait(1500);

  const poly = (w) => {
    const a = editor.hotspotCenter(w.a), b = editor.hotspotCenter(w.b);
    if (!a || !b) return null;
    return [a, ...(w.points ?? []), b].map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  };
  // Décroché : segment court entre deux segments de même axe ET même sens.
  const jogs = (pts, maxLen = 20) => {
    const out = [];
    for (let i = 1; i < pts.length - 2; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (len > maxLen || len < 0.5) continue;
      const vAxis = (p, q) => (Math.abs(p.x - q.x) <= 1 ? 'V' : 'H');
      if (vAxis(p0, p1) !== vAxis(p2, p3)) continue;      // pas le même axe : virage normal
      if (vAxis(p1, p2) === vAxis(p0, p1)) continue;      // colinéaire : rien à voir
      const dir = (p, q) => (vAxis(p, q) === 'V' ? Math.sign(q.y - p.y) : Math.sign(q.x - p.x));
      if (dir(p0, p1) !== dir(p2, p3)) continue;          // demi-tour : c'est un créneau voulu
      out.push({ i, axe: vAxis(p0, p1), decalage: Math.round(len * 10) / 10,
        avant: Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y)),
        apres: Math.round(Math.hypot(p3.x - p2.x, p3.y - p2.y)) });
    }
    return out;
  };
  const snapshot = () => editor.diagram.wires.filter((w) => !w.auto).map((w) => {
    const pts = poly(w);
    return { id: w.id, de: w.a.partId + '.' + w.a.pin, vers: w.b.partId + '.' + w.b.pin,
      coudes: pts ? pts.length - 2 : -1, pts, jogs: pts ? jogs(pts) : [] };
  });

  // --fresh : on efface les coudes enregistrés dans le fichier pour voir ce que
  // le routeur produit DE ZÉRO (un fichier déjà routé est préservé tel quel).
  if (FRESH || CLEAR) {
    for (const w of editor.diagram.wires) if (FRESH || w.id === CLEAR) w.points = undefined;
    editor.redrawWires();
    await wait(200);
  }
  const avant = snapshot();
  editor.autoRoute();
  await wait(500);
  const apres = snapshot();
  editor.autoRoute();
  await wait(500);
  const apres2 = snapshot();
  const tot = (s) => ({ fils: s.length, coudes: s.reduce((n, w) => n + w.coudes, 0),
    hors_norme: s.filter((w) => w.coudes > 4).length, decroches: s.reduce((n, w) => n + w.jogs.length, 0) });
  document.getElementById('measures').textContent = JSON.stringify({
    total_avant: tot(avant), total_apres: tot(apres), total_2e_passage: tot(apres2),
    fils: apres.map((w) => ({ id: w.id, de: w.de, vers: w.vers, coudes: w.coudes,
      jogs: w.jogs, pts: w.pts.map((p) => p.x + ',' + p.y).join(' → ') })),
  }, null, 2);
  if (editor.fitView) editor.fitView();
  await wait(400);
}
run().catch((e) => {
  document.getElementById('measures').textContent = JSON.stringify({ error: e.message, stack: String(e.stack).slice(0, 400) });
});
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
  join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
  `<div class="workshop"><aside id="palette" class="palette"></aside>` +
  `<div id="canvas" class="canvas" style="width:1000px;height:700px"><svg id="wires" class="wires"></svg></div>` +
  `<aside id="inspector" class="inspector"></aside></div>` +
  `<pre id="measures"></pre>` +
  `<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const OUT = process.env.KABLIX_OUT ?? CACHE;
const url = `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`;
if (png) {
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1200,900',
    '--virtual-time-budget=20000', '--screenshot=' + join(OUT, 'zig.png'), url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  console.log('OK → ' + join(OUT, 'zig.png'));
} else {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1200,900',
    '--virtual-time-budget=20000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
  console.log(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}
