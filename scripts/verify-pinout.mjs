// Test de régression : posters de brochage chargés À LA DEMANDE (v2026.7.130).
// Les 5 posters (~3,7 Mo de SVG) ne sont plus inlinés dans webview.js — ils sont
// copiés dans dist/pinout/ par esbuild.js et récupérés par fetch au premier clic
// sur ☢, puis gardés en cache. Ce qui est vérifié :
//  - le bundle webview NE CONTIENT PLUS le markup des posters (la régression que
//    l'on veut empêcher : un import statique qui les réintroduirait) ;
//  - dist/pinout/ contient bien les 5 fichiers et esbuild les recopie ;
//  - hasPinout() reste SYNCHRONE (le bouton ☢ s'affiche sans attendre le réseau) ;
//  - le poster s'affiche réellement (fetch → .part__pinout non vide) et se pose
//    aux bonnes dimensions, pour les deux modes ('stretch' pico, 'align' uno) ;
//  - un second affichage ne refait PAS de requête (cache de session) ;
//  - fetch en échec → pas de poster mais AUCUNE exception (l'éditeur survit).
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-pinout');
const BOARDS = ['pico', 'picow', 'uno', 'mega', 'nano'];

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

// --- 1. Les posters sont bien livrés à côté du bundle, pas dedans -------------
const distPinout = join(ROOT, 'dist', 'pinout');
for (const b of BOARDS) {
	const f = join(distPinout, `${b}.svg`);
	const exists = existsSync(f);
	ok(`dist/pinout/${b}.svg livré`, exists && statSync(f).size > 1000,
		exists ? statSync(f).size + ' octets' : 'absent');
}

// Le bundle ne doit plus porter le markup des posters. Empreinte : les posters
// pico/picow sont les seuls SVG à contenir la bande vide `rTop` — on cherche
// plutôt un marqueur textuel propre aux posters (étiquettes de fonction).
const bundlePath = join(ROOT, 'dist', 'webview.js');
if (existsSync(bundlePath)) {
	const bundle = readFileSync(bundlePath, 'utf8');
	const bundleMo = bundle.length / 1024 / 1024;
	// Repère : un fragment présent dans le poster mega mais nulle part ailleurs.
	const megaPoster = readFileSync(join(distPinout, 'mega.svg'), 'utf8');
	const idMatch = megaPoster.match(/id="([A-Za-z][\w-]{8,})"/);
	const marker = idMatch ? idMatch[1] : null;
	ok('bundle : markup des posters ABSENT de webview.js',
		marker !== null && !bundle.includes(marker), 'repère=' + marker);
	// Garde-fou de poids : le bundle pesait 7,9 Mo avec les posters inlinés.
	ok('bundle : webview.js sous 6 Mo (posters sortis du bundle)', bundleMo < 6,
		bundleMo.toFixed(2) + ' Mo');
} else {
	ok('bundle : dist/webview.js présent (npm run build)', false, 'absent');
}

// --- 2. Comportement réel en navigateur --------------------------------------
const posterBase = `file:///${distPinout.replace(/\\/g, '/')}`;
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { hasPinout, pinoutPoster, loadPinoutSvg } from '../../src/webview/diagram/pinout.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
import '../../src/webview/composants/arduino-mega-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

// select() est privé : on sélectionne comme l'utilisateur, par un clic sur le corps.
function selectPart(editor, id) {
	const el = editor.rendered.get(id).container.querySelector('.part__body')
		?? editor.rendered.get(id).container;
	el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
	window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
}

async function run() {
	const canvas = document.getElementById('canvas');
	const palette = document.getElementById('palette');
	const svg = document.getElementById('wires');
	const inspector = document.getElementById('inspector');
	const editor = new Editor(canvas, palette, svg, inspector);

	// --- hasPinout est SYNCHRONE : le bouton ☢ ne dépend pas du réseau --------
	ok('hasPinout : synchrone et vrai pour les 5 cartes',
		['pico', 'picow', 'uno', 'mega', 'nano'].every((t) => hasPinout(t) === true));
	ok('hasPinout : faux pour un composant sans poster', hasPinout('led') === false);
	ok('pinoutPoster : géométrie disponible sans charger le SVG',
		pinoutPoster('pico').mode === 'stretch' && pinoutPoster('uno').mode === 'align' &&
		pinoutPoster('mega').s > 3 && pinoutPoster('led') === null);

	// --- chargement à la demande ---------------------------------------------
	let fetches = 0;
	const realFetch = window.fetch.bind(window);
	window.fetch = (...a) => { fetches++; return realFetch(...a); };

	const svgPico = await loadPinoutSvg('pico');
	ok('loadPinoutSvg : markup récupéré et commençant par <svg',
		typeof svgPico === 'string' && svgPico.startsWith('<svg') && svgPico.length > 10000,
		svgPico ? svgPico.length + ' car.' : 'null');
	ok('loadPinoutSvg : une requête pour le premier chargement', fetches === 1, 'fetches=' + fetches);
	const again = await loadPinoutSvg('pico');
	ok('loadPinoutSvg : second appel servi par le CACHE (aucune requête de plus)',
		fetches === 1 && again === svgPico, 'fetches=' + fetches);
	ok('loadPinoutSvg : null pour un composant sans poster', (await loadPinoutSvg('led')) === null);

	// --- affichage réel du poster : mode 'stretch' (pico) ---------------------
	const pico = editor.addPart('pico', 100, 100);
	await wait(120);
	selectPart(editor, pico.id);
	editor.toggleSelectedSchema();
	await wait(400); // fetch + pose
	const overlay = editor.rendered.get(pico.id).container.querySelector('.part__pinout');
	ok('pico : poster posé dans le composant (.part__pinout)', !!overlay);
	ok('pico : poster non vide (SVG injecté)',
		!!overlay && !!overlay.querySelector('svg'), overlay ? overlay.innerHTML.length + ' car.' : '');
	// Mode stretch : largeur = celle de la carte, transform scaleY appliqué.
	ok('pico : mode stretch — largeur posée et étirement vertical',
		!!overlay && parseFloat(overlay.style.width) > 0 && /scaleY/.test(overlay.style.transform),
		overlay ? overlay.style.width + ' / ' + overlay.style.transform : '');
	ok('pico : bandeau de nom effacé pendant le poster (part--pinout-shown)',
		editor.rendered.get(pico.id).container.classList.contains('part--pinout-shown'));
	// Re-clic : le poster disparaît.
	editor.toggleSelectedSchema();
	await wait(60);
	ok('pico : second clic sur ☢ retire le poster',
		!editor.rendered.get(pico.id).container.querySelector('.part__pinout'));

	// --- affichage réel : mode 'align' (uno) ----------------------------------
	const uno = editor.addPart('uno', 400, 100);
	await wait(150);
	selectPart(editor, uno.id);
	editor.toggleSelectedSchema();
	await wait(400);
	const ov2 = editor.rendered.get(uno.id).container.querySelector('.part__pinout');
	ok('uno : poster posé et non vide', !!ov2 && !!ov2.querySelector('svg'));
	// Mode align : pose par left/top/width, SANS scaleY (pas de déformation).
	ok('uno : mode align — posé sans étirement vertical',
		!!ov2 && parseFloat(ov2.style.width) > 0 && !/scaleY/.test(ov2.style.transform || ''),
		ov2 ? ov2.style.left + ',' + ov2.style.top + ' w=' + ov2.style.width : '');
	editor.toggleSelectedSchema();
	await wait(60);

	// --- robustesse : fetch en échec → pas de poster, pas d'exception ---------
	window.fetch = () => Promise.reject(new Error('réseau coupé'));
	const mega = editor.addPart('mega', 100, 400);
	await wait(120);
	let threw = false;
	try {
		selectPart(editor, mega.id);
		editor.toggleSelectedSchema();
		await wait(300);
	} catch (e) { threw = true; }
	ok('robustesse : fetch en échec ne casse pas l\\'éditeur (aucune exception)', !threw);
	ok('robustesse : aucun poster posé quand le chargement échoue',
		!editor.rendered.get(mega.id).container.querySelector('.part__pinout'));
	window.fetch = realFetch;

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
	`<div id="canvas" class="canvas" style="width:900px;height:700px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	// Même canal que la webview réelle (panel.ts) : base des posters.
	`<script>window.KABLIX_PINOUT_BASE = ${JSON.stringify(posterBase)};</script>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
// --allow-file-access-from-files : le fetch des posters part d'une page file://
// (dans la webview réelle c'est une URI vscode-webview autorisée par la CSP).
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
for (const r of rows) checks.push(r);
let fail = 0;
for (const r of checks) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `pinout : ${fail} échec(s).` : `pinout : ${checks.length} contrôles OK — posters chargés à la demande, hors du bundle.`);
process.exit(fail ? 1 : 0);
