// Banc de MESURE de l'autoroutage sur le VRAI montage de Frank
// (testkablix/16 servo + alim.projix → _montage-16servo.json) : 8 servos à 270°,
// pca9685, alim, pico. Charge le montage dans un vrai Editor en Chrome headless,
// lance autoRoute(), puis mesure le tracé obtenu (coudes, biais, colinéarités
// superflues, alignement des équipotentielles, départs orthogonaux).
// Objectif : mesurer AVANT de coder (leçon v136/137 : ne pas coder sur un cas inventé).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-mesure-route');
const montage = readFileSync(join(ROOT, 'scripts', '_montage-16servo.json'), 'utf8');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/pca9685-element.mjs';
import '../../src/webview/composants/alim-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
const MONTAGE = ${montage};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const canvas = document.getElementById('canvas');
  const palette = document.getElementById('palette');
  const svg = document.getElementById('wires');
  const inspector = document.getElementById('inspector');
  const editor = new Editor(canvas, palette, svg, inspector);
  window.__editor = editor;
  editor.loadDiagram(MONTAGE);
  await wait(1500); // laisse les SVG externes se mesurer + recollage grille

  // Centre monde d'une broche.
  const pinC = (partId, pin) => editor.hotspotCenter({ partId, pin });

  // Segments d'un fil (repère monde) : broche a → points → broche b.
  const wireSegs = (w) => {
    const a = pinC(w.a.partId, w.a.pin), b = pinC(w.b.partId, w.b.pin);
    if (!a || !b) return null;
    const pts = [a, ...(w.points ?? []), b];
    const s = [];
    for (let i = 0; i < pts.length - 1; i++) s.push([pts[i], pts[i + 1]]);
    return { pts, segs: s };
  };

  const measure = (label) => {
    let bends = 0, diagonal = 0, redundant = 0, total = 0;
    for (const w of editor.diagram.wires) {
      if (w.auto) continue;
      const r = wireSegs(w);
      if (!r) continue;
      total++;
      bends += Math.max(0, r.pts.length - 2);
      // Segments en biais (ni H ni V).
      for (const [p, q] of r.segs) {
        if (Math.abs(p.x - q.x) > 1 && Math.abs(p.y - q.y) > 1) diagonal++;
      }
      // Coudes superflus : 3 points consécutifs colinéaires (H ou V).
      for (let i = 1; i < r.pts.length - 1; i++) {
        const A = r.pts[i-1], B = r.pts[i], C = r.pts[i+1];
        const colH = Math.abs(A.y - B.y) <= 1 && Math.abs(B.y - C.y) <= 1;
        const colV = Math.abs(A.x - B.x) <= 1 && Math.abs(B.x - C.x) <= 1;
        if (colH || colV) redundant++;
      }
    }
    return { label, total, bends, diagonal, redundant };
  };

  // Empreinte des points d'un fil (pour détecter s'il a changé).
  const fingerprint = () => {
    const m = {};
    for (const w of editor.diagram.wires) {
      if (w.auto) continue;
      m[w.id] = JSON.stringify((w.points ?? []).map((p) => [Math.round(p.x), Math.round(p.y)]));
    }
    return m;
  };

  // Toutes les broches (centre monde).
  const allPins = [];
  for (const [id, r] of editor.rendered) {
    for (const pin of r.hotspots.keys()) {
      const c = pinC(id, pin);
      if (c) allPins.push({ id, pin, c });
    }
  }
  // Distance d'un point à un segment.
  const distToSeg = (p, a, b) => {
    const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx*vx + vy*vy;
    let t = L2 ? ((p.x-a.x)*vx + (p.y-a.y)*vy)/L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + t*vx), dy = p.y - (a.y + t*vy);
    return Math.hypot(dx, dy);
  };
  // Compte les fils qui passent SUR une broche étrangère (< seuil px), après routage.
  const onForeignPins = (seuil) => {
    let count = 0; const hits = [];
    for (const w of editor.diagram.wires) {
      if (w.auto) continue;
      const r = wireSegs(w); if (!r) continue;
      for (const pin of allPins) {
        const own = (pin.id === w.a.partId && pin.pin === w.a.pin) || (pin.id === w.b.partId && pin.pin === w.b.pin);
        if (own) continue;
        let near = false;
        for (const [s, t] of r.segs) if (distToSeg(pin.c, s, t) <= seuil) { near = true; break; }
        if (near) { count++; hits.push(w.id + ' [' + w.a.partId + '.' + w.a.pin + '->' + w.b.partId + '.' + w.b.pin + '] sur ' + pin.id + '.' + pin.pin); break; }
      }
    }
    return { count, hits: hits.slice(0, 12) };
  };

  const before = measure('avant autoRoute');
  const pinBefore = onForeignPins(3);
  const fp0 = fingerprint();
  editor.autoRoute();
  await wait(400);
  const after = measure('après 1er autoRoute');
  const fp1 = fingerprint();
  // Idempotence : un 2e autoRoute ne doit (quasi) rien changer.
  editor.autoRoute();
  await wait(400);
  const after2 = measure('après 2e autoRoute');
  const fp2 = fingerprint();

  let changed1 = 0, changed2 = 0;
  for (const id of Object.keys(fp1)) {
    if (fp0[id] !== fp1[id]) changed1++;
    if (fp1[id] !== fp2[id]) changed2++;
  }

  const out = { before, after, after2,
    fils_modifies_1er_passage: changed1 + '/' + Object.keys(fp1).length,
    fils_modifies_2e_passage: changed2 + '/' + Object.keys(fp2).length,
    sur_broche_AVANT_3px: pinBefore,
    sur_broche_etrangere_3px: onForeignPins(3) };
  document.getElementById('measures').textContent = JSON.stringify(out, null, 2);
  // Recentre pour la capture d'écran.
  if (editor.fitView) editor.fitView();
  await wait(300);
}
run().catch((e) => {
  document.getElementById('measures').textContent = JSON.stringify({ error: e.message, stack: String(e.stack).slice(0, 400) });
});
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
  join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
  `<div class="workshop"><aside id="palette" class="palette"></aside>` +
  `<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>` +
  `<aside id="inspector" class="inspector"></aside></div>` +
  `<pre id="measures"></pre>` +
  `<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const OUT = 'V:/Temp/claude/h--OneDrive-4-Programation---VS-Code-Extensions-Kablix/01082e75-d385-466a-8142-498007024e80/scratchpad';
const png = process.argv.includes('--png');
if (png) {
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1400,1000', '--virtual-time-budget=22000', '--screenshot=' + join(OUT, 'route-apres.png'), `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  console.log('OK → route-apres.png');
} else {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1400,1000', '--virtual-time-budget=22000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
  console.log(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}
