// Test de régression : les broches restent SUR LA GRILLE de 10 px (v2026.7.105).
// Cause corrigée : rotateSelection/flipSelection tournaient autour du centre de
// la BOÎTE MESURÉE (gap de mise en page, dimensions impaires) sans re-snap —
// les broches quittaient la grille de ~2 px (LDR/CTN/CTP/LED à 90°), et les
// .projix enregistrés ainsi gardaient des positions fractionnaires (constaté
// sur le projet rv.projix : résistance tournée à 4,4 px de la grille).
// Contrôles : pose, rotations successives 90/180/270, 45° (premier pin), miroir,
// et réalignement doux au chargement d'un schéma « sale » (positions de rv.projix).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-align');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/ldr-element.mjs';
import '../../src/webview/composants/ntc-element.mjs';
import '../../src/webview/composants/ptc-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const offGrid = (v) => Math.min((v % 10 + 10) % 10, 10 - (v % 10 + 10) % 10);

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const world = document.querySelector('.canvas__world');
	// Centres des pastilles du DERNIER composant posé, en coordonnées monde.
	const pinCenters = () => {
		const wr = world.getBoundingClientRect();
		const cont = [...document.querySelectorAll('.part')].pop();
		return [...cont.querySelectorAll('.pin')].map((dot) => {
			const r = dot.getBoundingClientRect();
			return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
		});
	};
	const fmt = (pins) => pins.map((p) => '(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')').join(' ');

	// --- 1. Pose + rotations successives : toutes les broches sur la grille ----
	for (const type of ['resistor', 'led', 'ldr', 'ntc', 'ptc']) {
		// addPart brut ne snappe pas : on imite la pose palette (addPart + snap).
		const part = editor.addPart(type, 103, 57);
		await wait(60);
		editor.snapPartToGrid(part.id);
		editor.redrawWires();
		let pins = pinCenters();
		ok(type + ' : pose → broches sur la grille',
			pins.length >= 2 && pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
		for (const step of [90, 90, 90]) { // 90 puis 180 puis 270 cumulés
			editor.rotateSelection(step);
			await wait(20);
			pins = pinCenters();
			ok(type + ' : rotation cumulée → broches sur la grille',
				pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
		}
		// 45° : seul le PREMIER pin (référence du snap) peut être sur la grille.
		editor.rotateSelection(45 - 270);
		await wait(20);
		pins = pinCenters();
		ok(type + ' : 45° → premier pin sur la grille',
			offGrid(pins[0].x) < 0.05 && offGrid(pins[0].y) < 0.05, fmt(pins));
		editor.removePart(part.id);
	}

	// --- 2. Miroir : broches sur la grille --------------------------------------
	const led = editor.addPart('led', 103, 57);
	await wait(60);
	editor.snapPartToGrid(led.id);
	editor.flipSelection('h');
	await wait(20);
	let pins = pinCenters();
	ok('miroir H : broches sur la grille',
		pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
	editor.removePart(led.id);

	// --- 3. Chargement d'un schéma « sale » (positions réelles de rv.projix) ----
	editor.loadDiagram({ parts: [
		{ id: 'ldr-72', type: 'ldr', x: 2198.5000486172257, y: 1878.5000707834274,
			attrs: {}, rotation: 90 },
		{ id: 'resistor-73', type: 'resistor', x: 2209.9342291141766, y: 1980.0854531439363,
			attrs: { value: '50000' }, rotation: 90 },
		{ id: 'ntc-76', type: 'ntc', x: 2390.006335238987, y: 1880.0015160697196, attrs: {} },
	], wires: [] });
	// Le réalignement se fait au settle (rAF) une fois les dessins mesurables.
	for (let i = 0; i < 6; i++) await wait(40);
	editor.redrawWires();
	const wr = world.getBoundingClientRect();
	const all = [...document.querySelectorAll('.part')].flatMap((cont) =>
		[...cont.querySelectorAll('.pin')].map((dot) => {
			const r = dot.getBoundingClientRect();
			return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
		}));
	ok('chargement sale : ' + all.length + ' broches recollées sur la grille',
		all.length >= 6 && all.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(all));

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
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
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
console.log(fail ? `align : ${fail} échec(s).` : `align : ${rows.length} contrôles OK — broches sur la grille (pose, rotations, miroir, chargement).`);
process.exit(fail ? 1 : 0);
