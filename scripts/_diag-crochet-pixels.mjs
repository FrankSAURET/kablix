// Où tombent les VRAIS PIXELS du bout du crochet, et où est le CENTRE de son
// arrondi ?
//
// POURQUOI UN SECOND DIAGNOSTIC. `_diag-bout-crochet.mjs` lit `getBBox()` et
// `getPointAtLength()`. Ni l'un ni l'autre ne voit la terminaison du trait :
// la boîte d'un tracé SVG ignore l'épaisseur et le linecap, et la longueur
// parcourt la géométrie, pas la peinture. Mesuré : `butt` et `round` donnent
// EXACTEMENT les mêmes chiffres. Le lot précédent a donc conclu sur une mesure
// qui ne mesurait pas ce qu'il croyait.
//
// Ici on rend le SVG dans un canvas et on lit les pixels. Le bout du crochet
// est le coin bas-gauche de la matière peinte ; le centre de son arrondi est,
// lui, le nœud du tracé — et ce que le banc doit vérifier, c'est que la
// matière s'étend SYMÉTRIQUEMENT autour de ce nœud (donc un arrondi centré),
// et non qu'elle s'arrête dessus (ce que donnerait une coupe au carré).
//
// Usage : node scripts/_diag-crochet-pixels.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-crochet-px');

// Pas de backtick dans ce bloc : tout le diagnostic est un gabarit entre backticks.
const entry = `
import '../../src/webview/composants/sonde-logique-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Échelle du rendu : 10 pixels par unité de viewBox, pour lire au dixième.
const E = 10;

async function run() {
	const el = document.createElement('kablix-sonde-logique');
	document.body.appendChild(el);
	for (let i = 0; i < 10; i++) await wait(60);
	const r = el.shadowRoot;
	const hote = r.querySelector('svg > svg') || r.querySelector('svg');
	const tige = r.querySelector('#path944');

	// On rend le SEUL crochet : isolé dans son propre SVG, sans la pince verte
	// qui recouvre sa partie enfouie. Sinon le plastique masquerait justement le
	// bout qu'on veut mesurer, et on lirait la couleur du corps.
	const defs = r.querySelector('defs') || hote.querySelector('defs');
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 80 80');
	svg.setAttribute('width', String(80 * E));
	svg.setAttribute('height', String(80 * E));
	if (defs) svg.appendChild(defs.cloneNode(true));
	const copie = tige.cloneNode(true);
	// Le dégradé ne se transporte pas d un document à l autre sans ses defs :
	// on peint en noir plein, c est la FORME qui nous intéresse, pas la teinte.
	copie.setAttribute('style', copie.getAttribute('style')
		.replace(/stroke:[^;]+/, 'stroke:#000'));
	svg.appendChild(copie);

	const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
	const url = URL.createObjectURL(blob);
	const img = new Image();
	await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
	const cv = document.createElement('canvas');
	cv.width = 80 * E; cv.height = 80 * E;
	const ctx = cv.getContext('2d');
	ctx.drawImage(img, 0, 0);
	const d = ctx.getImageData(0, 0, cv.width, cv.height).data;

	// Matière peinte : alpha non nul. On cherche l extension autour du nœud.
	const peint = (px, py) => {
		if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) return false;
		return d[(py * cv.width + px) * 4 + 3] > 40;
	};
	// Le nœud du tracé, en pixels de canvas.
	const nx = 10 * E, ny = 70 * E;

	// Combien la matière dépasse-t-elle le nœud DANS L AXE du trait, vers le
	// bas-gauche (dehors) ? Un arrondi centré déborde de la moitié de
	// l épaisseur ; une coupe au carré ne déborde pas du tout.
	const k = Math.SQRT1_2;
	let dehors = 0;
	for (let t = 0; t < 4 * E; t++) {
		const px = Math.round(nx - t * k), py = Math.round(ny + t * k);
		if (!peint(px, py)) break;
		dehors = t / E;
	}
	// Et vers l intérieur, le long du trait : la longueur visible du crochet.
	let dedans = 0;
	for (let t = 0; t < 12 * E; t++) {
		const px = Math.round(nx + t * k), py = Math.round(ny - t * k);
		if (!peint(px, py)) break;
		dedans = t / E;
	}
	// Symétrie de l arrondi : la matière doit déborder AUTANT de part et d autre
	// de l axe, à hauteur du nœud. C est ce qui fait un demi-disque centré.
	const perp = (signe) => {
		let n = 0;
		for (let t = 0; t < 4 * E; t++) {
			const px = Math.round(nx + signe * t * k), py = Math.round(ny + signe * t * k);
			if (!peint(px, py)) break;
			n = t / E;
		}
		return n;
	};

	const lignes = [
		{ quoi: 'linecap', valeur: (tige.getAttribute('style').match(/linecap:(\\w+)/) || [])[1] },
		{ quoi: 'noeud du trace (unites viewBox)', x: 10, y: 70 },
		{ quoi: 'matiere AU noeud meme', peint: peint(nx, ny) },
		{ quoi: 'debord DEHORS le long du trait (unites)', valeur: Math.round(dehors * 100) / 100 },
		{ quoi: 'longueur visible vers DEDANS (unites)', valeur: Math.round(dedans * 100) / 100 },
		{ quoi: 'debord perpendiculaire + / -', plus: perp(1), moins: perp(-1) },
	];
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(lignes);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ quoi: 'exception', erreur: String(e && e.message), pile: String(e && e.stack).slice(0, 300) }]);
	document.body.appendChild(out);
});
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')],
	bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
writeFileSync(
	join(CACHE, 'p.html'),
	'<!doctype html><meta charset=utf8><body style="margin:0">' +
	'<style>kablix-sonde-logique{display:block;width:400px;height:400px}</style>' +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const dom = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
	'--virtual-time-budget=20000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); console.log(dom.slice(0, 1200)); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
for (const r of rows) console.log(' ', JSON.stringify(r));
