// Diagnostic : autoroutage d'un VRAI schéma — coudes par fil et traversées de
// corps mesurées sur les boîtes d'obstacle réelles.
// Usage : node scripts/_mesure-boite.mjs [testkablix/<banc>.projix]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import JSZip from 'jszip';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CACHE = join(ROOT, 'node_modules', '.cache-boite');
const { build: esbuild } = await import('esbuild');

// Le banc 7seg-uno d'origine n'existe plus : le montage se choisit en argument.
const BANC = process.argv[2] ?? 'testkablix/7seg-pico.projix';
const zip = await JSZip.loadAsync(readFileSync(join(ROOT, BANC)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

// Mêmes forks que la webview : un composant absent ne se dessine pas, donc
// n'est pas un obstacle, et l'autoroutage lui passe au travers.
const imports = [...readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8')
	.matchAll(/^import '\.\/composants\/(.+?)\.mjs';/gm)]
	.map((m) => `import '../../src/webview/composants/${m[1]}.mjs';`).join('\n');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
${imports}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DIAGRAM = ${JSON.stringify(diagram)};

// Recouvrement d'un segment H/V avec un rectangle.
function ov(p, q, r) {
	if (Math.abs(p.y - q.y) < 1) {
		if (p.y < r.y || p.y > r.y + r.h) return 0;
		return Math.max(0, Math.min(Math.max(p.x, q.x), r.x + r.w) - Math.max(Math.min(p.x, q.x), r.x));
	}
	if (Math.abs(p.x - q.x) < 1) {
		if (p.x < r.x || p.x > r.x + r.w) return 0;
		return Math.max(0, Math.min(Math.max(p.y, q.y), r.y + r.h) - Math.max(Math.min(p.y, q.y), r.y));
	}
	return 0;
}

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	await wait(600);
	editor.select(null); editor.autoRoute();
	await wait(200);
	const obs = editor.partObstacles();
	const rows = [];
	for (const w of editor.diagram.wires) {
		const a = editor.hotspotCenter(w.a), b = editor.hotspotCenter(w.b);
		if (!a || !b) continue;
		const poly = [a, ...(w.points ?? []), b];
		let pierce = [];
		for (const o of obs) {
			if (o.id === w.a.partId || o.id === w.b.partId) continue;
			let c = 0;
			for (let i = 0; i < poly.length - 1; i++) c += ov(poly[i], poly[i + 1], o);
			if (c > 1) pierce.push(o.id + ':' + c.toFixed(0));
		}
		rows.push({ w: w.a.pin + '→' + w.b.pin, coudes: (w.points ?? []).length, pierce });
	}
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify({ boxes: obs.map((o) => o.id + ' ' + o.x.toFixed(0) + ',' + o.y.toFixed(0) + ' ' + o.w.toFixed(0) + 'x' + o.h.toFixed(0)), rows });
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify({ err: String(e && e.stack).slice(0, 500) });
	document.body.appendChild(out);
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
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log(JSON.stringify(res, null, 1));
