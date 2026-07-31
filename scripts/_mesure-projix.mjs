// Diagnostic : autoroutage d'un .projix quelconque (argv[2]) — coudes par fil,
// traversées des corps tiers et SURVOL DE BROCHES ÉTRANGÈRES, mesurés sur les
// boîtes d'obstacle et les pastilles réelles de l'éditeur.
// Usage : node scripts/_mesure-projix.mjs <projix> [neuf]
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import JSZip from 'jszip';
import { build as esbuild } from 'esbuild';

const ROOT = 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const CACHE = join(ROOT, 'node_modules', '.cache-projix');
const cible = process.argv[2] ?? 'testkablix/button-6mm-pico.projix';

const zip = await JSZip.loadAsync(readFileSync(join(ROOT, cible)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

// Les composants ne sont pas auto-chargés : on importe le fork de chaque type présent.
const dispo = readdirSync(join(ROOT, 'src/webview/composants')).filter((f) => f.endsWith('.mts'));
const fichiers = new Set();
for (const p of diagram.parts) {
	// Le type du diagramme ne colle pas toujours au nom du fichier (`button-6mm`
	// → `pushbutton-6mm-element.mts`) : on accepte aussi le nom qui se TERMINE par
	// le type, une fois le suffixe -element/-board retiré.
	const base = dispo.map((f) => [f, f.replace(/\.mts$/, '').replace(/-(element|board)$/, '')]);
	const hit = base.find(([, b]) => b === p.type) ?? base.find(([, b]) => b.endsWith(p.type));
	if (hit) fichiers.add(hit[0].replace(/\.mts$/, '.mjs'));
	else console.log('!! composant introuvable pour le type', p.type);
}
const imports = [...fichiers].map((f) => `import '../../src/webview/composants/${f}';`).join('\n');
console.log('composants importés :', [...fichiers].join(' '), '| types :', [...new Set(diagram.parts.map((p) => p.type))].join(' '));

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
${imports}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DIAGRAM = ${JSON.stringify(diagram)};

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

// Même règle que l'éditeur : une pastille est « survolée » si son centre tombe
// sur un segment du fil, à 4 px près.
function onSeg(p, a, b, tol) {
	const dx = b.x - a.x, dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y) <= tol;
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tol;
}

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	await wait(1200);
	const avant = editor.diagram.wires.map((w) => (w.points ?? []).length);
	// Fils remis à NEUF : c'est le routeur qu'on mesure, pas la préservation.
	if (${process.argv[3] === 'neuf'}) for (const w of editor.diagram.wires) w.points = [];
	editor.select(null); editor.autoRoute();
	await wait(300);
	const obs = editor.partObstacles();
	// Toutes les pastilles du schéma (repère monde), comme le fait autoRoute.
	const pinCenters = [];
	for (const [id, r] of editor.rendered) {
		for (const pin of r.hotspots.keys()) {
			const c = editor.hotspotCenter({ partId: id, pin });
			if (c) pinCenters.push({ partId: id, pin, c });
		}
	}
	const rows = [];
	editor.diagram.wires.forEach((w, i) => {
		const a = editor.hotspotCenter(w.a), b = editor.hotspotCenter(w.b);
		if (!a || !b) return;
		const poly = [a, ...(w.points ?? []), b];
		const pierce = [];
		for (const o of obs) {
			if (o.id === w.a.partId || o.id === w.b.partId) continue;
			let c = 0;
			for (let k = 0; k < poly.length - 1; k++) c += ov(poly[k], poly[k + 1], o);
			if (c > 1) pierce.push(o.id + ':' + c.toFixed(0));
		}
		// Broches étrangères survolées (les 2 broches du fil exclues).
		const surPins = [];
		for (const p of pinCenters) {
			if (p.partId === w.a.partId && p.pin === w.a.pin) continue;
			if (p.partId === w.b.partId && p.pin === w.b.pin) continue;
			for (let k = 0; k < poly.length - 1; k++) {
				if (onSeg(p.c, poly[k], poly[k + 1], 4)) { surPins.push(p.partId + '.' + p.pin); break; }
			}
		}
		rows.push({ w: w.a.partId + '.' + w.a.pin + '→' + w.b.partId + '.' + w.b.pin,
			avant: avant[i], apres: (w.points ?? []).length, pierce, surPins,
			pts: poly.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' ') });
	});
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify({
		boxes: obs.map((o) => o.id + ' ' + o.x.toFixed(0) + ',' + o.y.toFixed(0) + ' ' + o.w.toFixed(0) + 'x' + o.h.toFixed(0)),
		pins: pinCenters.map((p) => p.partId + '.' + p.pin + ' ' + Math.round(p.c.x) + ',' + Math.round(p.c.y)),
		rows,
	});
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
	`<div id="canvas" class="canvas" style="width:1400px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(JSON.stringify(JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')), null, 1));
