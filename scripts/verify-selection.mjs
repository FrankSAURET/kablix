// Test de régression : visualisation de la sélection dans l'éditeur (v2026.7.103).
// Vrai Editor + vraie feuille media/styles.css en Chrome headless :
//  - fil sélectionné = classe wire--selected (halo accent) + « fourmis en
//    marche » (g.wire-ants, 2 tracés pointillés alternés au même `d` que le fil,
//    resynchronisés par positionWire) ;
//  - coude sélectionné = disque d'accent cerclé (.wire-handle--active) ;
//  - composant sélectionné = pointillé + halo (.part--selected .part__body) ;
//  - désélection / suppression : plus aucune trace (classes ET fourmis).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-selection');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

function pdown(el, opts = {}) {
	el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ...opts }));
}
function pup() {
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
}
function clickSelect(el, opts = {}) {
	pdown(el, opts);
	pup();
}

async function run() {
	const canvas = document.getElementById('canvas');
	const palette = document.getElementById('palette');
	const svg = document.getElementById('wires');
	const inspector = document.getElementById('inspector');
	const editor = new Editor(canvas, palette, svg, inspector);
	const led1 = editor.addPart('led', 100, 100);
	const led2 = editor.addPart('led', 300, 100);
	await wait(60);
	editor.addWire({ partId: led1.id, pin: 'A' }, { partId: led2.id, pin: 'C' },
		{ points: [{ x: 200, y: 60 }], color: 'green' });
	editor.redrawWires();
	await wait(30);

	// --- 1. Sélection d'un fil : classe + fourmis + halo -----------------------
	const path = svg.querySelector('path.wire');
	clickSelect(path);
	ok('fil : classe wire--selected posée', path.classList.contains('wire--selected'));
	let ants = svg.querySelector('g.wire-ants');
	const antPaths = ants ? [...ants.children] : [];
	const d0 = path.getAttribute('d') || '';
	ok('fil : fourmis présentes (2 tracés, d identique non vide)',
		ants && antPaths.length === 2 && d0.length > 0 && antPaths.every((p) => p.getAttribute('d') === d0),
		'd=' + d0.slice(0, 30));
	const csDark = ants ? getComputedStyle(antPaths[0]) : null;
	const csLight = ants ? getComputedStyle(antPaths[1]) : null;
	ok('fourmis : pointillés animés (dasharray 5, animation ants-march)',
		csDark && csDark.strokeDasharray.includes('5') && csDark.animationName === 'ants-march',
		csDark ? csDark.strokeDasharray + ' / ' + csDark.animationName : 'absent');
	ok('fourmis : deux teintes alternées (sombre != clair)',
		csDark && csLight && csDark.stroke !== csLight.stroke,
		(csDark && csDark.stroke) + ' vs ' + (csLight && csLight.stroke));
	ok('fil : halo accent (filter drop-shadow)',
		getComputedStyle(path).filter.includes('drop-shadow'));

	// --- 2. Coude inséré au double-clic : fourmis resynchronisées --------------
	const box = path.getBoundingClientRect();
	path.dispatchEvent(new MouseEvent('dblclick', {
		bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
	}));
	await wait(20);
	ants = svg.querySelector('g.wire-ants');
	const d1 = path.getAttribute('d') || '';
	ok('coude inséré : d du fil changé + fourmis resynchronisées',
		d1 !== d0 && ants && [...ants.children].every((p) => p.getAttribute('d') === d1));

	// --- 3. Coude sélectionné : disque d'accent cerclé --------------------------
	const handle = document.querySelector('.wire-handle');
	ok('poignées de coude affichées', !!handle);
	if (handle) {
		clickSelect(handle);
		const cs = getComputedStyle(handle);
		ok('coude actif : classe wire-handle--active', handle.classList.contains('wire-handle--active'));
		ok('coude actif : disque (fond accent, rond, anneau)',
			cs.borderRadius === '50%' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.boxShadow !== 'none',
			cs.borderRadius + ' / ' + cs.backgroundColor);
	}

	// --- 4. Sélection de composants : pointillé + halo --------------------------
	const body1 = editor.elementOf(led1.id).closest('.part__body') ??
		editor.elementOf(led1.id).parentElement;
	clickSelect(body1);
	const cont1 = body1.closest('.part') ?? body1.parentElement;
	ok('composant : classe part--selected posée', cont1.classList.contains('part--selected'));
	const csBody = getComputedStyle(body1);
	ok('composant : pointillé + halo (outline dashed, box-shadow)',
		csBody.outlineStyle === 'dashed' && csBody.boxShadow !== 'none',
		csBody.outlineStyle + ' / ' + csBody.boxShadow.slice(0, 40));
	ok('composant : la sélection du composant a retiré les fourmis du fil',
		!svg.querySelector('g.wire-ants') && !path.classList.contains('wire--selected'));
	const body2 = editor.elementOf(led2.id).parentElement;
	pdown(body2, { ctrlKey: true });
	ok('Ctrl+clic : 2 composants en surbrillance',
		document.querySelectorAll('.part--selected').length === 2);

	// --- 5. Désélection : plus aucune trace -------------------------------------
	clickSelect(canvas);
	ok('clic sur le fond : plus de part--selected ni de poignées',
		document.querySelectorAll('.part--selected').length === 0 &&
		document.querySelectorAll('.wire-handle').length === 0);

	// --- 6. Lot de câbles (Ctrl+clic) : fourmis posées/retirées -----------------
	pdown(path, { ctrlKey: true });
	ok('Ctrl+clic fil : lot → fourmis + classe',
		!!svg.querySelector('g.wire-ants') && path.classList.contains('wire--selected'));
	pdown(path, { ctrlKey: true });
	ok('re-Ctrl+clic fil : lot vidé → fourmis retirées',
		!svg.querySelector('g.wire-ants') && !path.classList.contains('wire--selected'));

	// --- 7. Suppression du fil sélectionné : fil ET fourmis hors du DOM ---------
	clickSelect(path);
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
	ok('Suppr : fil et fourmis retirés du DOM',
		!svg.querySelector('path.wire') && !svg.querySelector('g.wire-ants'));

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
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `selection : ${fail} échec(s).` : `selection : ${rows.length} contrôles OK — sélection bien visualisée (fils, coudes, composants).`);
process.exit(fail ? 1 : 0);
