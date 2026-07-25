// Mesure ciblée du fil orange resistor-275.2 → pico.GP2 de testkablix/7seg-pico2.projix
// (cas signalé par Frank) : coudes retirés puis autoRoute() dans un VRAI Editor
// en Chrome headless. On compare le tracé obtenu au tracé fait à la main
// (sortie par la DROITE de la patte 2, 3 coudes) et on affiche les stubs
// candidats des deux pattes de la résistance (hypothèse de Frank : la patte 2
// ne sort qu'en vertical).
//
// Usage : node scripts/_mesure-7seg2-gp2.mjs [--png] [--wire w-289]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-7seg2');
const WIRE = process.argv.includes('--wire') ? process.argv[process.argv.indexOf('--wire') + 1] : 'w-289';

/** Lit une entrée d'un .projix (zip : stocké ou dégonflé) sans dépendance. */
function readZipEntry(file, name) {
  const buf = readFileSync(file);
  for (let i = 0; i + 30 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const entry = buf.toString('utf8', i + 30, i + 30 + nameLen);
    const start = i + 30 + nameLen + extraLen;
    if (entry === name) {
      const data = buf.subarray(start, start + compSize);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    i = start + compSize - 1;
  }
  throw new Error(`entrée ${name} introuvable dans ${file}`);
}

const montage = readZipEntry(join(ROOT, 'testkablix', '7seg-pico2.projix'), 'diagram.json');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/7segment-element.mjs';
const MONTAGE = ${montage};
const WIRE = ${JSON.stringify(WIRE)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const editor = new Editor(
    document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), document.getElementById('inspector'));
  window.__editor = editor;
  editor.loadDiagram(JSON.parse(JSON.stringify(MONTAGE)));
  await wait(1600);

  const R = (n) => Math.round(n * 10) / 10;
  const pinC = (partId, pin) => editor.hotspotCenter({ partId, pin });
  // Le fil visé : par id si donné, sinon LE fil qui aboutit à GP2 (les ids sont
  // renumérotés à chaque enregistrement du .projix par Frank).
  const wire = () => editor.diagram.wires.find((w) => w.id === WIRE)
    ?? editor.diagram.wires.find((w) => w.a.pin === 'GP2' || w.b.pin === 'GP2');

  // Tracé complet (broche a → coudes → broche b) et sa description.
  const describe = (label) => {
    const w = wire();
    const a = pinC(w.a.partId, w.a.pin), b = pinC(w.b.partId, w.b.pin);
    const pts = [a, ...(w.points ?? []), b].map((p) => ({ x: R(p.x), y: R(p.y) }));
    const dirs = [];
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
      len += Math.abs(dx) + Math.abs(dy);
      dirs.push(Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? '·'
        : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑'));
    }
    return { label, fil: w.a.partId + '.' + w.a.pin + ' -> ' + w.b.partId + '.' + w.b.pin,
      coudes: Math.max(0, pts.length - 2), longueur: R(len),
      dirs: dirs.join(''), pts: pts.map((p) => p.x + ',' + p.y).join('  ') };
  };

  const out = {};
  out.fils = editor.diagram.wires.map((w) => w.id + ' ' + w.color + ' ' + w.a.partId + '.' + w.a.pin + '->' + w.b.partId + '.' + w.b.pin);
  if (!wire()) { document.getElementById('measures').textContent = JSON.stringify(out, null, 1); return; }
  out.aLaMain = describe('tracé de Frank (tel qu enregistre)');

  // Géométrie utile : boîtes des composants + centres des broches concernées.
  const rects = new Map(editor.partObstacles().map((o) => [o.id, o]));
  const box = rects.get(wire().a.partId);
  out.geometrie = {
    boite_resistance: box ? { x: R(box.x), y: R(box.y), w: R(box.w), h: R(box.h) } : null,
    patte1: (() => { const c = pinC(wire().a.partId, '1'); return c ? R(c.x) + ',' + R(c.y) : null; })(),
    patte2: (() => { const c = pinC(wire().a.partId, '2'); return c ? R(c.x) + ',' + R(c.y) : null; })(),
    GP2: (() => { const c = pinC(wire().b.partId, wire().b.pin); return c ? R(c.x) + ',' + R(c.y) : null; })(),
  };

  // Stubs candidats (sorties perpendiculaires) proposés à l'A* pour chaque patte.
  const stubsOf = (partId, pin) => {
    const c = pinC(partId, pin);
    if (!c) return 'broche introuvable';
    const s = editor.pinStubs({ partId, pin }, c, rects, 10);
    if (!s) return 'pinStubs indisponible';
    return s.map((p) => {
      const dx = p.x - c.x, dy = p.y - c.y;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'droite' : 'gauche') : (dy > 0 ? 'bas' : 'haut');
      return dir + ' (' + R(p.x) + ',' + R(p.y) + ')';
    });
  };
  out.stubs = {
    patte1: stubsOf(wire().a.partId, '1'),
    patte2: stubsOf(wire().a.partId, '2'),
    GP2: stubsOf(wire().b.partId, wire().b.pin),
  };

  // Coudes retirés puis autoroutage de tout le montage (les autres fils, propres,
  // sont préservés : c'est le geste de Frank).
  wire().points = [];
  editor.autoRoute();
  await wait(500);
  out.apresAutoRoute = describe('coudes retires puis autoRoute');

  document.getElementById('measures').textContent = JSON.stringify(out, null, 1);
  if (editor.fitView) editor.fitView();
  await wait(300);
}
run().catch((e) => {
  document.getElementById('measures').textContent = JSON.stringify({ error: e.message, stack: String(e.stack).slice(0, 600) });
});
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
  `<div class="workshop"><aside id="palette" class="palette"></aside>` +
  `<div id="canvas" class="canvas" style="width:1300px;height:900px"><svg id="wires" class="wires"></svg></div>` +
  `<aside id="inspector" class="inspector"></aside></div>` +
  `<pre id="measures"></pre><script>${b.outputFiles[0].text}</script></body>`);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const page = `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`;
if (process.argv.includes('--png')) {
  const shot = join(CACHE, 'apres.png');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1500,1000', '--virtual-time-budget=22000', '--screenshot=' + shot, page], { stdio: 'ignore' });
  console.log(shot);
} else {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1500,1000', '--virtual-time-budget=22000', '--dump-dom', page], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
  console.log(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}
