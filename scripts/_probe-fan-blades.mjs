// Corrélation du profil angulaire de l'hélice pour k = 2..12 pales : montre
// quel décalage recolle le dessin sur lui-même (le plus petit qui passe le
// seuil EST le nombre de pales).
import esbuild from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-fan-view');
mkdirSync(CACHE, { recursive: true });

const entry = `
import '../../src/webview/composants/ventilo-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const el = document.createElement('kablix-ventilo');
  document.body.appendChild(el);
  await el.updateComplete;
  await wait(60);
  const wrap = el.shadowRoot.querySelector('.spin');
  const toLocal = wrap.getCTM().inverse();
  const box = wrap.getBBox();
  const pts = [];
  for (const n of wrap.querySelectorAll('path,circle,ellipse,rect,polygon,polyline')) {
    const len = n.getTotalLength ? n.getTotalLength() : 0;
    const ctm = n.getCTM();
    if (!(len > 0) || !ctm) continue;
    const m = toLocal.multiply(ctm);
    const k = Math.min(240, Math.max(24, Math.round(len / 2)));
    for (let i = 0; i < k; i++) {
      const p = n.getPointAtLength((len * i) / k);
      pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
    }
  }
  let ax = box.x + box.width / 2, ay = box.y + box.height / 2;
  for (let i = 0; i < 300; i++) {
    let best = pts[0], far = -1;
    for (const p of pts) { const d = (p.x-ax)**2 + (p.y-ay)**2; if (d > far) { far = d; best = p; } }
    const k = 1 / (i + 2);
    ax += (best.x - ax) * k; ay += (best.y - ay) * k;
  }
  const N = 360, prof = new Array(N).fill(0);
  for (const p of pts) {
    const a = ((Math.atan2(p.y - ay, p.x - ax) * 180) / Math.PI + 360) % 360;
    prof[Math.floor(a) % N] = Math.max(prof[Math.floor(a) % N], Math.hypot(p.x - ax, p.y - ay));
  }
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < N; i++) {
      const j = pass ? N - 1 - i : i;
      if (!prof[j]) prof[j] = prof[(j + (pass ? 1 : N - 1)) % N];
    }
  const mean = prof.reduce((s, v) => s + v, 0) / N;
  const dev = prof.map((v) => v - mean);
  const energy = dev.reduce((s, v) => s + v * v, 0);
  const lignes = ['axe ' + ax.toFixed(1) + ',' + ay.toFixed(1) + '  bladeCount=' + el.bladeCount];
  for (let k = 2; k <= 14; k++) {
    if (N % k) { lignes.push('k=' + k + ' (décalage non entier)'); continue; }
    const shift = N / k;
    let dot = 0;
    for (let i = 0; i < N; i++) dot += dev[i] * dev[(i + shift) % N];
    lignes.push('k=' + k + '  corr=' + (dot / energy).toFixed(3));
  }
  // Creux et bosses du profil : autant de bosses que de pales.
  let bosses = 0;
  for (let i = 0; i < N; i++) {
    const a = prof[(i + N - 1) % N], b = prof[i], c = prof[(i + 1) % N];
    if (b > a && b >= c && b > mean) bosses++;
  }
  lignes.push('bosses du profil (grossier) : ' + bosses);

  // Créneaux plein/vide sur un cercle : chaque pale traversée = un front.
  const rayon = Math.max(...pts.map((p) => Math.hypot(p.x - ax, p.y - ay)));
  const formes = [...wrap.querySelectorAll('path,circle,ellipse,rect,polygon')].map((n) => ({
    n, inv: toLocal.multiply(n.getCTM()).inverse(),
  }));
  const dedans = (x, y) => formes.some(({ n, inv }) => {
    const p = new DOMPoint(inv.a * x + inv.c * y + inv.e, inv.b * x + inv.d * y + inv.f);
    return n.isPointInFill(p);
  });
  for (const frac of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
    const r = rayon * frac;
    const plein = [];
    for (let i = 0; i < 720; i++) {
      const a = (i * Math.PI) / 360;
      plein.push(dedans(ax + r * Math.cos(a), ay + r * Math.sin(a)));
    }
    let fronts = 0;
    for (let i = 0; i < plein.length; i++) if (plein[i] && !plein[(i + plein.length - 1) % plein.length]) fronts++;
    lignes.push('r=' + frac.toFixed(2) + 'R  pales traversées : ' + fronts +
      '  (rempli ' + Math.round((100 * plein.filter(Boolean).length) / plein.length) + ' %)');
  }
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = lignes.join('\\n');
  document.body.appendChild(out);
}
run().catch((e) => {
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = 'exception ' + e.message;
  document.body.appendChild(out);
});
`;
writeFileSync(join(CACHE, 'blades.mjs'), entry);
const b = await esbuild.build({
  entryPoints: [join(CACHE, 'blades.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
writeFileSync(join(CACHE, 'blades.html'),
  `<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=8000', '--dump-dom',
  `file:///${join(CACHE, 'blades.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'aucune mesure');
