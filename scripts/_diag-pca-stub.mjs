// Diagnostic ciblé : sorties de broche proposées pour Pn.5V du PCA (fil enclavé)
// et coût comparé original / rerouté sur « 16 servo + alim.projix ».
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import JSZip from 'jszip';
import { build as esbuild } from 'esbuild';

const ROOT = 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const CACHE = join(ROOT, 'node_modules', '.cache-projix');
const cible = 'testkablix/16 servo + alim.projix';

const zip = await JSZip.loadAsync(readFileSync(join(ROOT, cible)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

const dispo = readdirSync(join(ROOT, 'src/webview/composants')).filter((f) => f.endsWith('.mts'));
const fichiers = new Set();
for (const p of diagram.parts) {
	const base = dispo.map((f) => [f, f.replace(/\.mts$/, '').replace(/-(element|board)$/, '')]);
	const hit = base.find(([, b]) => b === p.type) ?? base.find(([, b]) => b.endsWith(p.type));
	if (hit) fichiers.add(hit[0].replace(/\.mts$/, '.mjs'));
}
const imports = [...fichiers].map((f) => `import '../../src/webview/composants/${f}';`).join('\n');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
${imports}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DIAGRAM = ${JSON.stringify(diagram)};

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	await wait(1200);
	const rects = new Map(editor.partObstacles().map((o) => [o.id, o]));
	const pins = [];
	for (const [id, r] of editor.rendered) {
		for (const pin of r.hotspots.keys()) {
			const c = editor.hotspotCenter({ partId: id, pin });
			if (c) pins.push({ partId: id, pin, c });
		}
	}
	const res = {};
	for (const nom of ['P7.5V', 'P6.5V', 'P2.5V']) {
		const end = { partId: 'pca9685-2', pin: nom };
		const c = editor.hotspotCenter(end);
		const foreign = pins.filter((p) => !(p.partId === end.partId && p.pin === end.pin)).map((p) => p.c);
		const st = editor.pinStubs(end, c, rects, 10, foreign);
		res[nom] = { centre: Math.round(c.x) + ',' + Math.round(c.y),
			stubs: st.map((path) => path.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' → ')) };
	}
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(res);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify({ err: String(e && e.stack).slice(0, 600) });
	document.body.appendChild(out);
});
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'd.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'd.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'd.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1400px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'd.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(JSON.stringify(JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')), null, 1));
