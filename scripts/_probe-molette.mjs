// Sonde : molette de la liste des modèles de transistor.
// Vrai Editor en Chrome headless, à plusieurs facteurs d'échelle d'écran.
// Mesure APRÈS chaque cran : quelle entrée est réellement calée en haut et de
// combien de pixels elle dépasse (visible = ligne coupée).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CACHE = join(ROOT, 'node_modules', '.cache-molette');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/transistor-element.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const inspector = document.getElementById('inspector');
  const editor = new Editor(
    document.getElementById('canvas'), document.getElementById('palette'),
    document.getElementById('wires'), inspector);
  const q = editor.addPart('transistor', 100, 100);
  editor.select({ kind: 'part', id: q.id });
  await wait(80);
  const liste = inspector.querySelector('.inspector__reflist');
  const out = { dpr: window.devicePixelRatio, trouve: !!liste, journal: [] };
  if (liste) {
    const lignes = [...liste.children];
    const top = () => liste.getBoundingClientRect().top + liste.clientTop;
    // Entrée réellement collée au haut de la fenêtre (mesure PEINTE) + son écart.
    const vu = () => {
      const t = top();
      let best = 0, d = Infinity;
      lignes.forEach((r, i) => {
        const e = r.getBoundingClientRect().top - t;
        if (Math.abs(e) < Math.abs(d)) { d = e; best = i; }
      });
      return { i: best, ecart: d };
    };
    out.n = lignes.length;
    out.scrollHeight = liste.scrollHeight;
    out.clientHeight = liste.clientHeight;
    out.hauteurs = lignes.map((r) => +r.getBoundingClientRect().height.toFixed(3));
    // Positions dans le contenu, mesurées à défilement nul.
    liste.scrollTop = 0;
    const base = top() - liste.scrollTop;
    out.pos = lignes.map((r) => +(r.getBoundingClientRect().top - base).toFixed(3));
    for (let n = 1; n < lignes.length + 3; n++) {
      liste.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }));
      const v = vu();
      out.journal.push({ cran: n, attendu: n, vu: v.i, ecart: +v.ecart.toFixed(3),
        scrollTop: +liste.scrollTop.toFixed(3) });
    }
    // Remontée complète.
    out.remontee = [];
    for (let n = 1; n < lignes.length + 3; n++) {
      liste.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
      const v = vu();
      out.remontee.push({ cran: n, vu: v.i, ecart: +v.ecart.toFixed(3),
        scrollTop: +liste.scrollTop.toFixed(3) });
    }
  }
  const pre = document.createElement('pre');
  pre.id = 'measures';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
}
run().catch((e) => {
  const pre = document.createElement('pre');
  pre.id = 'measures';
  pre.textContent = JSON.stringify({ erreur: String(e && e.stack).slice(0, 500) });
  document.body.appendChild(pre);
});
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:900px;height:700px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const echelle of ['1', '1.25', '1.5']) {
	const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
		'--window-size=1500,1000', `--force-device-scale-factor=${echelle}`,
		'--virtual-time-budget=20000', '--dump-dom',
		`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
	const r = m ? JSON.parse(unesc(m[1])) : { erreur: 'mesures introuvables' };
	console.log('===== échelle ' + echelle + ' (dpr ' + r.dpr + ') =====');
	if (r.erreur) { console.log(r.erreur); continue; }
	console.log('entrées ' + r.n + ' | contenu ' + r.scrollHeight + ' px | fenêtre ' + r.clientHeight + ' px');
	console.log('pos : ' + JSON.stringify(r.pos));
	console.log('descente :');
	for (const j of r.journal) {
		console.log('  cran ' + String(j.cran).padStart(2) + ' attendu ' + String(j.attendu).padStart(2)
			+ ' vu ' + String(j.vu).padStart(2) + ' écart ' + String(j.ecart).padStart(8)
			+ ' scrollTop ' + j.scrollTop + (j.vu !== j.attendu ? '   <<< DÉCALAGE' : '')
			+ (Math.abs(j.ecart) > 0.6 ? '   <<< LIGNE COUPÉE' : ''));
	}
	console.log('remontée :');
	for (const j of r.remontee) {
		console.log('  cran ' + String(j.cran).padStart(2) + ' vu ' + String(j.vu).padStart(2)
			+ ' écart ' + String(j.ecart).padStart(8) + ' scrollTop ' + j.scrollTop
			+ (Math.abs(j.ecart) > 0.6 ? '   <<< LIGNE COUPÉE' : ''));
	}
}
