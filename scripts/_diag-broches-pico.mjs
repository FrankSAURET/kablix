// Position (en unités du schéma) des pastilles nommées d'un composant du
// .projix, et position qu'une sonde doit prendre pour les accrocher SELON SA
// ROTATION.
//
// Trois sondes posées sur trois broches VOISINES (10 px d'écart) se
// recouvrent : une sonde fait 80 px de large. Il faut donc les tourner pour
// qu'elles partent en éventail, comme sur une paillasse — et connaître pour
// chaque quart de tour où tombe la pastille.
//
// Usage : node scripts/_diag-broches-pico.mjs <projix> <partId> <pin,pin,...>
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-broches');
const cible = process.argv[2] ?? 'testkablix/sonde-logique-pico.projix';
const partId = process.argv[3] ?? 'U1';
const noms = (process.argv[4] ?? 'GP14,GP15,GND.4').split(',');

const zip = await JSZip.loadAsync(readFileSync(join(ROOT, cible)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
const DIAGRAM = ${JSON.stringify(diagram)};
const PART = ${JSON.stringify(partId)};
const NOMS = ${JSON.stringify(noms)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	for (let i = 0; i < 10; i++) await wait(60);
	const world = document.querySelector('.canvas__world');
	const wr = world.getBoundingClientRect();
	const brut = (id, nom) => {
		const r0 = editor.rendered && editor.rendered.get(id);
		const dot = r0 && r0.hotspots && r0.hotspots.get(nom);
		if (!dot) return null;
		const r = dot.getBoundingClientRect();
		return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
	};
	const s0 = editor.diagram.parts.find((p) => /sonde/i.test(p.type));
	const g0 = brut(s0.id, 'G');
	const echelle = g0.x / (s0.x + 10);
	const pin = (id, nom) => { const r = brut(id, nom); return r && { x: r.x / echelle, y: r.y / echelle }; };

	const lignes = [];
	for (const nom of NOMS) {
		const p = pin(PART, nom);
		lignes.push({ quoi: PART + '/' + nom, x: p ? Math.round(p.x * 100) / 100 : null, y: p ? Math.round(p.y * 100) / 100 : null });
	}
	// Décalage pastille - origine de la sonde, pour chaque quart de tour : on
	// pose une sonde d'essai, on la tourne, on mesure.
	const essai = editor.addPart('sonde-logique', 100, 100);
	await wait(80);
	editor.snapPartToGrid(essai.id);
	await wait(40);
	for (const rot of [0, 90, 180, 270]) {
		if (rot) { editor.rotateSelection(90); await wait(60); }
		const g = pin(essai.id, 'G');
		lignes.push({ quoi: 'decalage pastille a ' + rot + ' deg',
			x: g ? Math.round((g.x - essai.x) * 100) / 100 : null,
			y: g ? Math.round((g.y - essai.y) * 100) / 100 : null });
	}
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(lignes);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ quoi: 'exception: ' + String(e && e.message) }]);
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
	`<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=25000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log('--', cible);
for (const r of rows) console.log(' ', JSON.stringify(r));
