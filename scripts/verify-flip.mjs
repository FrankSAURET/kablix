// Test de régression : le RETOURNEMENT se fait dans le repère de l'ÉCRAN, pas
// dans celui du composant (v2026.7.233). Cause corrigée : la liste CSS était
// `rotate(θ) scale(±1)` — la fonction la plus à droite étant la plus INTERNE, le
// miroir jouait avant la rotation, donc sur les axes du dessin. Sur une diode
// couchée à 90°, « retourner horizontalement » la retournait verticalement à
// l'écran (bug signalé par Frank : « les inversions sont inversées »).
// Contrôles : diode à 0°, 90° et 45°, miroirs H et V, positions des broches A/K
// mesurées à l'écran ; l'aide au bandeau de nom et la grille ne sont pas visées.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-flip');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/diode-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const world = document.querySelector('.canvas__world');
	// Centres écran (unités monde) des broches, dans l'ordre du pinInfo de la
	// diode : K (cathode) puis A (anode). Les pastilles n'ont pas d'attribut de
	// nom dans le DOM, on s'appuie donc sur cet ordre.
	const pins = () => {
		const wr = world.getBoundingClientRect();
		const cont = [...document.querySelectorAll('.part')].pop();
		const p = [...cont.querySelectorAll('.pin')].map((dot) => {
			const r = dot.getBoundingClientRect();
			return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
		});
		return { K: p[0], A: p[1] };
	};
	const fmt = (p) => Object.entries(p).map(([k, v]) => k + '(' + v.x.toFixed(1) + ',' + v.y.toFixed(1) + ')').join(' ');
	const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

	const part = editor.addPart('diode', 200, 200);
	await wait(80);
	const set = async (rotation, flipH, flipV) => {
		part.rotation = rotation;
		part.flipH = flipH;
		part.flipV = flipV;
		editor.rerenderPart(part.id);
		await wait(60);
		return pins();
	};

	// --- 1. Diode droite : le miroir H échange A et K, le miroir V ne les bouge pas.
	const flat = await set(0, false, false);
	ok('diode 0° : A et K côte à côte à l’horizontale',
		near(flat.A.y, flat.K.y) && Math.abs(flat.A.x - flat.K.x) > 20, fmt(flat));
	const flatH = await set(0, true, false);
	ok('diode 0° + miroir H : A et K ÉCHANGÉS, ordonnées gardées',
		near(flatH.A.x, flat.K.x) && near(flatH.K.x, flat.A.x) && near(flatH.A.y, flat.A.y), fmt(flatH));
	const flatV = await set(0, false, true);
	ok('diode 0° + miroir V : abscisses INCHANGÉES (rien à échanger)',
		near(flatV.A.x, flat.A.x) && near(flatV.K.x, flat.K.x), fmt(flatV));

	// --- 2. Diode couchée à 90° : c'est là que les deux axes étaient échangés.
	const up = await set(90, false, false);
	ok('diode 90° : A et K l’un au-dessus de l’autre',
		near(up.A.x, up.K.x) && Math.abs(up.A.y - up.K.y) > 20, fmt(up));
	// Miroir H à l'écran = axe VERTICAL : deux broches déjà alignées en x ne
	// bougent pas. Avant le correctif, il les échangeait (comportement du V).
	const upH = await set(90, true, false);
	ok('diode 90° + miroir H : A et K NE sont pas échangés (axe vertical)',
		near(upH.A.y, up.A.y) && near(upH.K.y, up.K.y), fmt(upH));
	// Miroir V à l'écran = axe HORIZONTAL : il échange les deux broches.
	const upV = await set(90, false, true);
	ok('diode 90° + miroir V : A et K ÉCHANGÉS (axe horizontal)',
		near(upV.A.y, up.K.y) && near(upV.K.y, up.A.y) && near(upV.A.x, up.A.x), fmt(upV));

	// --- 3. Angle quelconque : le miroir H laisse les ordonnées en place.
	const diag = await set(45, false, false);
	const diagH = await set(45, true, false);
	// Miroir H = axe vertical : chaque broche garde son ordonnée et l'écart
	// horizontal entre les deux change de signe (l'axe passe par le centre du
	// dessin, on ne compare donc pas les abscisses absolues).
	ok('diode 45° + miroir H : ordonnées gardées, écart horizontal inversé',
		near(diagH.A.y, diag.A.y) && near(diagH.K.y, diag.K.y)
		&& near(diagH.A.x - diagH.K.x, diag.K.x - diag.A.x), fmt(diag) + ' → ' + fmt(diagH));

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
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
	`<div id="canvas" class="canvas" style="width:800px;height:600px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `flip : ${fail} échec(s).` : `flip : ${rows.length} contrôles OK — le miroir suit les axes de l'ÉCRAN.`);
process.exit(fail ? 1 : 0);
