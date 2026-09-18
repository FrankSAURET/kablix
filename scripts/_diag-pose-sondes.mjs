// Diagnostic : écart GÉOMÉTRIQUE entre la pastille d'une sonde et la pastille
// qu'elle dit accrocher, mesuré dans le VRAI éditeur (Chrome headless) — les
// pastilles ne sont pas dans le catalogue, elles sortent du DOM des éléments.
//
// Une sonde peut être résolue correctement par le modèle (`accroche` écrit) et
// pourtant DESSINÉE dans le vide si le schéma a été écrit à la main sans caler
// les coordonnées : c'est exactement ce que montre sonde-logic-pico.png.
//
// Usage : node scripts/_diag-pose-sondes.mjs [testkablix/sonde-logique-pico.projix]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-pose');
const cible = process.argv[2] ?? 'testkablix/sonde-logique-pico.projix';

const zip = await JSZip.loadAsync(readFileSync(join(ROOT, cible)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
const DIAGRAM = ${JSON.stringify(diagram)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	for (let i = 0; i < 10; i++) await wait(60);
	const world = document.querySelector('.canvas__world');
	const wr = world.getBoundingClientRect();
	// Centre d'une pastille nommée, en coordonnées monde. Les pastilles n'ont pas
	// d'attribut de nom dans le DOM : l'éditeur les tient dans sa table rendered.
	const pin = (partId, nom) => {
		const r0 = editor.rendered && editor.rendered.get(partId);
		const dot = r0 && r0.hotspots && r0.hotspots.get(nom);
		if (!dot) return { manque: r0 && r0.hotspots ? [...r0.hotspots.keys()].slice(0, 12).join(',') : 'pas rendu' };
		const r = dot.getBoundingClientRect();
		return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
	};
	const lignes = [];
	for (const s of editor.diagram.parts.filter((p) => /sonde/i.test(p.type))) {
		const mien = pin(s.id, 'G');
		const acc = ((s.attrs && s.attrs.accroche) || '').trim();
		const coupe = acc.lastIndexOf('/');
		const sien = coupe > 0 ? pin(acc.slice(0, coupe), acc.slice(coupe + 1)) : null;
		lignes.push({ id: s.id, x: s.x, y: s.y, rot: s.rotation, acc, mien, sien,
			dist: mien && sien && mien.x !== undefined && sien.x !== undefined
				? Math.hypot(sien.x - mien.x, sien.y - mien.y) : null });
	}
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(lignes);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ id: 'exception', acc: String(e && e.message), mien: String(e && e.stack).slice(0, 400) }]);
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
