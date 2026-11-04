// Test de régression : COPIE EN IMAGE d'une sélection (v2026.11.1.290).
// Vrai Editor + vraie feuille media/styles.css en Chrome headless, sur le projet
// de Frank `testkablix/Patte-pico-sans 16servo.projix` (Pico W, Grove Shield,
// patte d'araignée, oscilloscope).
//
// Défauts corrigés (retour de Frank) :
//  1. Encadrer au rectangle TOUT ce qui se voit ne prenait pas la patte : sa
//     feuille SVG est bien plus grande que la patte dessinée, et le rectangle
//     exigeait d'englober `.part__body`. Ses fils, du coup, ne partaient pas à
//     la copie (un fil n'est copié que si ses DEUX bouts sont sélectionnés).
//  2. Les curseurs de mesure de l'oscillo (et la coche des cases T/V) étaient
//     retirés de l'image copiée.
//  3. En simulation, même en pause, impossible de sélectionner : pas de copie
//     avec les courbes. Rectangle et Ctrl+A y sont maintenant permis, pour
//     copier seulement (aucune action d'édition dans l'inspecteur).
//
// Contre-épreuve : `git stash` puis relancer — le banc DOIT échouer.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-copie-selection');
const PROJET = join(ROOT, 'testkablix', 'Patte-pico-sans 16servo.projix');

const zip = await JSZip.loadAsync(readFileSync(PROJET));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/grove-shield-element.mjs';
import '../../src/webview/composants/patte-element.mjs';
import '../../src/webview/composants/oscillo-element.mjs';
const DIAGRAM = ${JSON.stringify(diagram)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

function marquee(canvas, from, to) {
	canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: from.x, clientY: from.y }));
	for (const k of [0.1, 0.5, 1]) {
		window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true,
			clientX: from.x + (to.x - from.x) * k, clientY: from.y + (to.y - from.y) * k }));
	}
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
}

async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'), document.getElementById('wires'),
		document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	await wait(1500);
	// Vue centrée sur le schéma, zoom 1 : tout tient dans le canvas.
	editor.fitView();
	await wait(300);

	// Boîte de ce qui SE VOIT : réunion des cadres de sélection (dessins).
	let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
	for (const r of editor.rendered.values()) {
		editor.fitSelectionBox(r.part.id);
		const b = (r.container.querySelector('.part__selbox') ?? r.container.querySelector('.part__body')).getBoundingClientRect();
		L = Math.min(L, b.left); T = Math.min(T, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom);
	}
	const from = { x: L - 12, y: T - 12 }, to = { x: R + 12, y: B + 12 };
	const patte = editor.rendered.get('Act1');
	const corps = patte.container.querySelector('.part__body').getBoundingClientRect();
	ok('cas réel : la feuille de la patte déborde de ce qui se voit',
		corps.left < from.x || corps.top < from.y || corps.right > to.x || corps.bottom > to.y,
		JSON.stringify({ corps: [corps.left, corps.top, corps.right, corps.bottom], vu: [L, T, R, B] }));

	// --- 1. Rectangle autour de tout ce qui se voit : les 4 composants ---------
	marquee(canvas, from, to);
	await wait(30);
	const pris = [...editor.selectedParts].sort();
	ok('rectangle : les 4 composants sont pris, patte comprise',
		pris.length === 4 && pris.includes('Act1'), pris.join(','));

	// --- 2. Copie : les fils visibles partent avec -----------------------------
	const visibles = DIAGRAM.wires.filter((w) => !w.auto).length;
	const svgSel = editor.buildSvg(new Set(editor.selectedParts));
	const fils = (svgSel.match(/stroke-width="3" stroke-linecap="round"/g) ?? []).length;
	ok('copie : tous les fils visibles sont dans l image (' + visibles + ')', fils === visibles && visibles > 0,
		fils + ' / ' + visibles);
	const svgTout = editor.exportSvg();
	const filsTout = (svgTout.match(/stroke-width="3" stroke-linecap="round"/g) ?? []).length;
	ok('copie : même nombre de fils que Ctrl+A / export complet', fils === filsTout, fils + ' vs ' + filsTout);

	// --- 3. Curseurs de mesure de l'oscillo dans l'image -----------------------
	ok('oscillo : curseurs T et V dans l image (cases cochées)',
		/oscillo-cursor-t1"/.test(svgSel) && /oscillo-cursor-v1"/.test(svgSel) &&
		/oscillo-cursor-t-label"/.test(svgSel) && /oscillo-cac-t-coche"/.test(svgSel));
	ok('oscillo : ni traits de prise ni zones de clic dans l image',
		!/cursor-[tv][12]-zone/.test(svgSel) && !/oscillo-zone-/.test(svgSel) && !/data-export-shown/.test(svgSel));
	const osc = editor.rendered.get('M1').el;
	osc.setAttribute('cursort', '0');
	await wait(30);
	const svgSansT = editor.buildSvg(new Set(['M1']));
	ok('oscillo : curseur T décoché → absent de l image, V toujours là',
		!/oscillo-cursor-t1"/.test(svgSansT) && !/oscillo-cac-t-coche"/.test(svgSansT) && /oscillo-cursor-v1"/.test(svgSansT));
	osc.setAttribute('cursort', '1');
	await wait(30);

	// --- 4. Simulation : rectangle et Ctrl+A permis, pour copier seulement -----
	editor.setLocked(true);
	await wait(30);
	ok('simulation : rien de sélectionné au lancement', editor.selectedParts.size === 0);
	marquee(canvas, from, to);
	await wait(30);
	ok('simulation : le rectangle sélectionne les 4 composants', editor.selectedParts.size === 4,
		[...editor.selectedParts].join(','));
	ok('simulation : sélection marquée sur le canvas (canvas--sim-select)',
		canvas.classList.contains('canvas--sim-select'));
	const sb = editor.rendered.get('M1').container.querySelector('.part__selbox');
	ok('simulation : cadre de sélection VISIBLE', sb && getComputedStyle(sb).visibility === 'visible',
		sb && getComputedStyle(sb).visibility);
	const insp = document.getElementById('inspector');
	ok('simulation : inspecteur = simple résumé, aucune action d édition',
		/Ctrl\\+C/.test(insp.textContent) && insp.querySelectorAll('button, input, select').length === 0,
		insp.textContent.slice(0, 120));
	ok('simulation : pas de sélection unique (propriétés non ouvertes)', editor.selection === null);
	const svgSim = editor.buildSvg(new Set(editor.selectedParts));
	ok('simulation : la copie emporte les fils', (svgSim.match(/stroke-width="3" stroke-linecap="round"/g) ?? []).length === visibles);
	// Suppr en simulation : rien ne disparaît.
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
	await wait(20);
	ok('simulation : Suppr ne supprime rien', editor.diagram.parts.length === 4);
	// Clic simple sur le fond : désélection, classe retirée.
	canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: from.x, clientY: from.y }));
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	await wait(20);
	ok('simulation : clic sur le fond désélectionne', editor.selectedParts.size === 0 &&
		!canvas.classList.contains('canvas--sim-select'));
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
	await wait(20);
	ok('simulation : Ctrl+A sélectionne tout', editor.selectedParts.size === 4 &&
		canvas.classList.contains('canvas--sim-select') && editor.selection === null);
	editor.setLocked(false);
	await wait(20);
	ok('fin de simulation : plus de marque de sélection de simulation',
		!canvas.classList.contains('canvas--locked'));

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
	`<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1600,1000', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `copie-selection : ${fail} échec(s).` : `copie-selection : ${rows.length} contrôles OK — copie complète, curseurs compris, sélection permise en simulation.`);
process.exit(fail ? 1 : 0);
