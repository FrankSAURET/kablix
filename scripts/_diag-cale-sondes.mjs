// Calcule, dans le VRAI éditeur, la position (x,y) qu'une sonde doit avoir pour
// que sa pastille recouvre EXACTEMENT la pastille qu'elle accroche.
//
// Les positions des sondes des schémas de test ont été écrites à la main dans
// testkablix/_spec.mjs : le modèle les résout (attribut `accroche`), mais elles
// sont DESSINÉES à côté de leur broche — jusqu'à 171 px, soit dix-sept
// carreaux. C'est ce que montre sonde-logic-pico.png.
//
// Usage : node scripts/_diag-cale-sondes.mjs <fichier.projix>
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-cale');
const cible = process.argv[2] ?? 'testkablix/sonde-logique-pico.projix';

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	for (let i = 0; i < 10; i++) await wait(60);
	const world = document.querySelector('.canvas__world');
	const wr = world.getBoundingClientRect();
	const brut = (partId, nom) => {
		const r0 = editor.rendered && editor.rendered.get(partId);
		const dot = r0 && r0.hotspots && r0.hotspots.get(nom);
		if (!dot) return null;
		const r = dot.getBoundingClientRect();
		return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
	};
	// Échelle du monde : le zoom multiplie tout, on le demande à l'éditeur.
	//
	// CORRIGÉ LE 18/09 — la version précédente DÉDUISAIT l'échelle d'une sonde,
	// en supposant sa pastille à x + 10 (SONDE_PIN.x). Ce n'est vrai qu'à
	// rotation 0 : dès qu'une sonde est tournée — le cas de toutes celles de
	// sonde-logique-pico depuis le lot .98 — la pastille n'est plus là, et
	// l'échelle sortait à 13,5 au lieu de 1. TOUTES les mesures suivaient, et la
	// cible glissait d'une passe à l'autre, ce qui rendait le recalage impossible
	// à faire converger. Le zoom réel ne se devine pas, il se lit.
	const echelle = (editor.getCamera && editor.getCamera().zoom) || 1;
	const pin = (partId, nom) => {
		const r = brut(partId, nom);
		return r && { x: r.x / echelle, y: r.y / echelle };
	};
	const lignes = [];
	for (const s of editor.diagram.parts.filter((p) => /sonde/i.test(p.type))) {
		const mien = pin(s.id, 'G');
		const acc = ((s.attrs && s.attrs.accroche) || '').trim();
		const coupe = acc.lastIndexOf('/');
		const sien = coupe > 0 ? pin(acc.slice(0, coupe), acc.slice(coupe + 1)) : null;
		if (!mien || !sien) { lignes.push({ id: s.id, acc, erreur: 'pastille introuvable' }); continue; }
		lignes.push({ id: s.id, acc, rot: s.rotation ?? 0,
			x: s.x, y: s.y,
			// Décaler le composant du même vecteur que sa pastille : la pastille
			// arrive alors pile sur celle qu'elle accroche.
			bonX: Math.round((s.x + (sien.x - mien.x)) * 100) / 100,
			bonY: Math.round((s.y + (sien.y - mien.y)) * 100) / 100,
			ecart: Math.round(Math.hypot(sien.x - mien.x, sien.y - mien.y) * 100) / 100 });
	}
	lignes.push({ id: '(echelle)', ecart: Math.round(echelle * 1000) / 1000 });
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(lignes);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ id: 'exception', acc: String(e && e.message) }]);
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
