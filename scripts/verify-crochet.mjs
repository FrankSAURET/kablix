// Le bout du crochet métallique de la sonde : ARRONDI, et centré sur la grille.
//
// LA DEMANDE. Frank (18/09, alignement crochet.png) : « Le crochet métalique ne
// tombe toujours pas sur la grille. De plus je l'ai dessiné arrondi et je
// souhaite qu'il le reste avec le CENTRE DE L'ARRONDI sur une intersection de
// grille. » Deux exigences qui tiennent ensemble, et c'est ce couple qui a été
// mal lu une première fois.
//
// CE QUI AVAIT ÉTÉ CONCLU À TORT. Un lot précédent a vu que la matière peinte
// débordait du croisement (bord en 9,27 ; 70,75 pour un nœud sur 10 ; 70) et en
// a déduit un défaut d'alignement, corrigé en coupant le trait au carré
// (`stroke-linecap:butt`). Mais ce débordement EST l'arrondi : un demi-disque
// de rayon 1,1 (la moitié de l'épaisseur) autour du nœud. Le supprimer alignait
// le bord au prix du dessin que Frank voulait.
//
// POURQUOI MESURER DES PIXELS. `getBBox()` ignore l'épaisseur et la
// terminaison du trait, `getPointAtLength()` parcourt la géométrie sans la
// peinture : mesuré, les deux rendent EXACTEMENT les mêmes chiffres avec `butt`
// et avec `round`. Un banc bâti dessus serait vert quoi qu'il arrive — c'est
// précisément l'erreur qu'on ferme ici. On rend donc le tracé dans un canvas et
// on lit l'alpha.
//
// CE QU'ON EXIGE. La matière doit s'étendre SYMÉTRIQUEMENT autour du nœud, donc
// déborder vers l'extérieur d'environ un rayon — et non s'arrêter dessus, ce
// que donnerait la coupe au carré. Mesuré : `butt` déborde de 0, `round` de 1,0.
//
// Usage : node scripts/verify-crochet.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-verify-crochet');

// Pas de backtick dans ce bloc : tout le banc est un gabarit entre backticks.
const entry = `
import '../../src/webview/composants/sonde-logique-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => {
	let bon = false, boum = '';
	try { bon = typeof cond === 'function' ? !!cond() : !!cond; }
	catch (e) { boum = ' [exception: ' + (e && e.message) + ']'; }
	checks.push({ name, ok: bon, detail: String(detail) + boum });
};
// Échelle du rendu : 10 pixels par unité de viewBox, pour lire au dixième.
const E = 10;

async function run() {
	const el = document.createElement('kablix-sonde-logique');
	document.body.appendChild(el);
	for (let i = 0; i < 10; i++) await wait(60);
	const r = el.shadowRoot;
	const tige = r.querySelector('#path944');
	ok('le crochet métallique existe dans le dessin', !!tige);
	if (!tige) { publier(); return; }

	const style = tige.getAttribute('style') || '';
	const cap = (style.match(/linecap:(\\w+)/) || [])[1];
	// L exigence « qu il le reste arrondi », lue directement sur le trait. Ce
	// contrôle seul ne suffirait pas — il dit l intention, pas le résultat — mais
	// il nomme la cause quand les mesures de pixels tombent.
	ok('le bout du crochet est ARRONDI (pas coupé au carré)', cap === 'round', 'linecap=' + cap);

	// Le nœud du tracé doit être sur un croisement de la grille de 10.
	const d = tige.getAttribute('d') || '';
	const mm = d.match(/M\\s*([\\d.]+)\\s+([\\d.]+)/);
	const nx = mm ? Number(mm[1]) : NaN;
	const ny = mm ? Number(mm[2]) : NaN;
	ok('le centre de l arrondi est sur une INTERSECTION de la grille',
		nx % 10 === 0 && ny % 10 === 0, 'noeud (' + nx + ' ; ' + ny + ')');

	// --- Mesure des vrais pixels -------------------------------------------
	// Le crochet est isolé dans son propre SVG : dans la pince entière, le corps
	// vert recouvre sa partie enfouie et masquerait justement ce qu on mesure.
	const defs = r.querySelector('defs');
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 80 80');
	svg.setAttribute('width', String(80 * E));
	svg.setAttribute('height', String(80 * E));
	if (defs) svg.appendChild(defs.cloneNode(true));
	const copie = tige.cloneNode(true);
	// Peint en noir plein : c est la FORME qui est en cause, pas la teinte (et le
	// dégradé de Frank ne se transporte pas d un document à l autre).
	copie.setAttribute('style', style.replace(/stroke:[^;]+/, 'stroke:#000'));
	svg.appendChild(copie);

	const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
	const img = new Image();
	await new Promise((bon, ko) => { img.onload = bon; img.onerror = ko; img.src = URL.createObjectURL(blob); });
	const cv = document.createElement('canvas');
	cv.width = 80 * E; cv.height = 80 * E;
	const ctx = cv.getContext('2d');
	ctx.drawImage(img, 0, 0);
	const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
	const peint = (a, b) => (a < 0 || b < 0 || a >= cv.width || b >= cv.height)
		? false : px[(b * cv.width + a) * 4 + 3] > 40;

	const cx = nx * E, cy = ny * E;
	const k = Math.SQRT1_2;
	// Longueur de matière le long d une direction depuis le nœud.
	const portee = (sx, sy, max) => {
		let n = 0;
		for (let t = 0; t < max * E; t++) {
			if (!peint(Math.round(cx + sx * t * k), Math.round(cy + sy * t * k))) break;
			n = t / E;
		}
		return n;
	};
	const dehors = portee(-1, +1, 4);   // vers le bas-gauche : l ergot, dehors
	const dedans = portee(+1, -1, 12);  // vers le haut-droit : la part enfouie
	const perpA = portee(+1, +1, 4);
	const perpB = portee(-1, -1, 4);

	ok('il y a bien de la matière AU croisement lui-même', peint(cx, cy));
	// LE contrôle qui distingue l arrondi de la coupe au carré. Mesuré : butt
	// donne 0, round donne 1,0 — la moitié de l épaisseur (2,2). Le seuil est
	// posé bas (0,6) pour ne pas dépendre du pas d échantillonnage, mais il est
	// très au-dessus du 0 que rend une coupe nette.
	ok('l arrondi DÉBORDE du croisement vers l extérieur (c est un demi-disque, pas une coupe)',
		dehors >= 0.6, 'débord ' + dehors + ' unité(s)');
	// ...et il ne déborde pas plus que son rayon : un crochet qui TRAVERSERAIT
	// le croisement serait de nouveau mal aligné, ce que Frank signalait au
	// départ (« bout en 7,71 ; 72,31 », soit 2,3 unités dehors).
	ok('l arrondi ne déborde pas au-delà de son rayon (le crochet ne traverse pas la grille)',
		dehors <= 1.5, 'débord ' + dehors + ' unité(s)');
	// Symétrie : un demi-disque s étend autant des deux côtés de l axe. Une
	// terminaison décalée ou une pointe donneraient deux valeurs très écartées.
	ok('l arrondi est SYMÉTRIQUE autour de l axe du trait (donc centré)',
		Math.abs(perpA - perpB) <= 0.4, perpA + ' contre ' + perpB);
	// Le crochet reste un ergot visible : ni effacé, ni changé en aiguille.
	ok('le crochet garde une longueur visible d ergot',
		dedans >= 4 && dedans <= 10, dedans + ' unité(s)');

	publier();
}
function publier() {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	checks.push({ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) });
	publier();
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
if (!chrome) { console.log('Chrome introuvable — banc ignoré.'); process.exit(0); }
const dom = execFileSync(chrome, [
	'--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
	'--virtual-time-budget=20000', '--dump-dom',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('❌ mesures introuvables — la page n\'a pas fini son script.'); console.log(dom.slice(0, 1200)); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `crochet : ${fail} échec(s).` : `crochet : ${rows.length} contrôles OK — bout arrondi, centre de l'arrondi sur la grille.`);
process.exit(fail ? 1 : 0);
