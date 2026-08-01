// Fenêtre du créateur de composants (v2026.7.239) : vrai PartCreator ouvert
// dans un Chrome headless avec la vraie feuille de style.
//  - zone du modèle « transistor » : E/B/C empilés, Vce max, gain, Ic max,
//    boîtier (→ vue externe, dessinée par le vrai composant) et symbole
//    NPN/PNP (→ vue interne) ;
//  - retouche des deux dessins dans l'éditeur SVG du système, actualisation au
//    retour du fichier (marqueurs relus) ;
//  - les trois zones se redimensionnent à la poignée ;
//  - le contrôle de simulation n'apparaît qu'après un clic sur ＋.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-creator-ui');

const entry = `
import { PartCreator } from '../../src/webview/diagram/creator.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

const modal = () => document.querySelector('.creator');
const byText = (sel, txt) => [...modal().querySelectorAll(sel)].find((e) => (e.textContent || '').includes(txt));
/** Libellés de la zone du modèle, dans l'ordre d'affichage. */
const rowLabels = () => [...modal().querySelectorAll('#cr-roles .creator__ctrlrow label')].map((l) => l.textContent);

async function run() {
	let saved = null;
	const edits = [];
	const creator = new PartCreator((data) => { saved = data; });
	creator.onEditSvg = (which, svg) => edits.push({ which, svg });
	creator.open();
	await wait(120);

	// --- 1. Contrôle de simulation : rien tant qu'on n'a pas cliqué ＋ ----------
	ok('contrôle : aucun formulaire à l ouverture',
		modal().querySelector('#cr-ctrl').children.length === 0);
	ok('contrôle : bouton ＋ proposé', !!modal().querySelector('#cr-ctrl-add'));
	modal().querySelector('#cr-ctrl-add').click();
	await wait(30);
	const ctrlType = modal().querySelector('#cr-ctrl-type');
	ok('contrôle : le ＋ crée un curseur réglable', !!ctrlType && ctrlType.value === 'slider');
	ok('contrôle : le ＋ s efface tant qu un contrôle existe',
		modal().querySelector('#cr-ctrl-add').style.visibility === 'hidden');
	ok('contrôle : min/max/pas proposés avec le curseur',
		[...modal().querySelectorAll('#cr-ctrl input')].length >= 4);
	modal().querySelector('#cr-ctrl-del').click();
	await wait(30);
	ok('contrôle : le ✕ le retire et rend le ＋',
		modal().querySelector('#cr-ctrl').children.length === 0 &&
		modal().querySelector('#cr-ctrl-add').style.visibility !== 'hidden');

	// --- 2. Zone du modèle transistor -----------------------------------------
	modal().querySelector('#cr-name').value = 'KB 741';
	const kind = modal().querySelector('#cr-kind');
	kind.value = 'transistor';
	kind.dispatchEvent(new Event('change'));
	await wait(40);
	const labels = rowLabels();
	ok('transistor : E, B et C l un au-dessus de l autre',
		labels[0] === 'E' && labels[1] === 'B' && labels[2] === 'C', JSON.stringify(labels));
	ok('transistor : Vce max, gain, Ic max, boîtier puis symbole',
		labels.length === 8 && !!modal().querySelector('#cr-pkg') && !!modal().querySelector('#cr-symbol'),
		JSON.stringify(labels));
	ok('transistor : une ligne = un libellé + un champ (pas deux lignes)',
		modal().querySelectorAll('#cr-roles .creator__ctrlrow').length === 8);

	// --- 3. Boîtier choisi → vue externe --------------------------------------
	const pkg = modal().querySelector('#cr-pkg');
	pkg.value = 'to92';
	pkg.dispatchEvent(new Event('change'));
	await wait(200);
	const ext = modal().querySelector('#cr-preview-ext svg');
	ok('boîtier : le dessin TO-92 arrive dans la vue externe',
		!!ext && Number(ext.getAttribute('width')) === 50, ext && ext.outerHTML.slice(0, 60));
	const pinDots = [...modal().querySelectorAll('#cr-preview-ext .pin')].map((d) => parseFloat(d.style.left) + ',' + parseFloat(d.style.top));
	ok('boîtier : les 3 pattes sont posées au bon endroit',
		pinDots.join(' ') === '20,40 30,40 40,40', JSON.stringify(pinDots));
	ok('boîtier : le nom saisi est inscrit sur la face plate',
		!!ext && /KB/.test(ext.textContent || '') && /741/.test(ext.textContent || ''), ext && ext.textContent);
	ok('boîtier : l inscription emporte sa police (hors du shadow DOM)',
		!!ext && /font-family/.test(ext.innerHTML));
	ok('boîtier : les rôles E/B/C peuvent viser les pattes détectées',
		[...modal().querySelectorAll('select[data-role]')].every((s) => s.options.length === 3));

	// --- 4. Symbole choisi → vue interne --------------------------------------
	const sym = modal().querySelector('#cr-symbol');
	sym.value = 'pnp';
	sym.dispatchEvent(new Event('change'));
	await wait(60);
	const int = modal().querySelector('#cr-preview-int svg');
	ok('symbole : le schéma PNP arrive dans la vue interne', !!int && int.querySelectorAll('path').length > 2,
		int && int.outerHTML.slice(0, 80));
	ok('symbole : vue interne à la taille du dessin externe',
		!!int && Number(int.getAttribute('width')) === 50, int && int.getAttribute('width'));
	ok('symbole : superposition activée pour contrôler le calage',
		modal().querySelector('#cr-int-overlay').checked);

	// --- 5. Retouche dans l éditeur du système --------------------------------
	byText('button', 'default editor').click();
	await wait(20);
	ok('éditeur externe : le dessin externe part en retouche',
		edits.length === 1 && edits[0].which === 'ext' && /svg/.test(edits[0].svg), JSON.stringify(edits.length));
	// Retour du fichier enregistré : deux pastilles rouges = deux broches.
	creator.applyEditedSvg('ext', '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40">' +
		'<rect x="0" y="0" width="60" height="40" fill="#333"/>' +
		'<circle cx="10" cy="30" r="1.5" fill="#ff0000" fill-opacity="0.8"/>' +
		'<circle cx="50" cy="30" r="1.5" fill="#ff0000" fill-opacity="0.8"/>' +
		'<text x="10" y="26" fill="#ff0000" text-anchor="middle">IN</text>' +
		'<text x="50" y="26" fill="#ff0000" text-anchor="middle">OUT</text></svg>');
	await wait(40);
	const ext2 = modal().querySelector('#cr-preview-ext svg');
	ok('éditeur externe : le dessin enregistré remplace l ancien',
		!!ext2 && Number(ext2.getAttribute('width')) === 60, ext2 && ext2.getAttribute('width'));
	const names = [...modal().querySelectorAll('#cr-pins .creator__pinrow input:not(.creator__coord)')].map((i) => i.value);
	ok('éditeur externe : les pastilles rouges ajoutées deviennent des broches',
		names.join(',') === 'IN,OUT', JSON.stringify(names));
	byText('button', 'default editor').click();
	// (le second bouton porte le même libellé : on vise celui de la vue interne)
	modal().querySelector('#cr-int-edit').click();
	await wait(20);
	ok('éditeur externe : la vue interne aussi peut être retouchée',
		edits.some((e) => e.which === 'int'), JSON.stringify(edits.map((e) => e.which)));

	// --- 6. Trois zones redimensionnables -------------------------------------
	const form = modal().querySelector('.creator__form');
	const gutter = modal().querySelector('.creator__gutter[data-gutter="0"]');
	ok('zones : deux poignées entre les trois zones',
		modal().querySelectorAll('.creator__gutter').length === 2);
	const w0 = form.getBoundingClientRect().width;
	const g = gutter.getBoundingClientRect();
	gutter.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: g.left + 3, clientY: g.top + 20, pointerId: 1 }));
	gutter.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: g.left + 123, clientY: g.top + 20, pointerId: 1 }));
	gutter.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: g.left + 123, clientY: g.top + 20, pointerId: 1 }));
	await wait(40);
	const w1 = form.getBoundingClientRect().width;
	ok('zones : la poignée élargit le formulaire de ce qu on la tire',
		Math.abs(w1 - w0 - 120) < 3, w0 + ' → ' + w1);
	const extPane = modal().querySelectorAll('.creator__pane')[0].getBoundingClientRect().width;
	const intPane = modal().querySelectorAll('.creator__pane')[1].getBoundingClientRect().width;
	ok('zones : seule la frontière bouge (la vue interne garde sa largeur)',
		Math.abs(intPane - (extPane + 120)) < 4, 'ext=' + extPane + ' int=' + intPane);
	// Le glissement s'arrête avant d'écraser la zone voisine.
	const g2 = gutter.getBoundingClientRect();
	gutter.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: g2.left + 3, clientY: g2.top + 20, pointerId: 2 }));
	gutter.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: g2.left + 5000, clientY: g2.top + 20, pointerId: 2 }));
	gutter.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: g2.left + 5000, clientY: g2.top + 20, pointerId: 2 }));
	await wait(40);
	ok('zones : la vue externe ne peut pas être écrasée (160 px au minimum)',
		modal().querySelectorAll('.creator__pane')[0].getBoundingClientRect().width >= 159,
		modal().querySelectorAll('.creator__pane')[0].getBoundingClientRect().width);

	// --- 7. Composant enregistré ----------------------------------------------
	for (const s of modal().querySelectorAll('select[data-role]')) s.value = s.options[0].value;
	modal().querySelector('#cr-save').click();
	await wait(40);
	ok('enregistrement : modèle « transistor » retenu', saved && saved.kind === 'transistor', saved && saved.kind);
	ok('enregistrement : caractéristiques saisies embarquées',
		saved && saved.attrs && saved.attrs.symbol === 'pnp' && saved.attrs.gain === '100' &&
		saved.attrs.vcemax === '40' && saved.attrs.icmax === '0.6', saved && JSON.stringify(saved.attrs));
	ok('enregistrement : rôles E/B/C posés sur des pattes réelles',
		saved && saved.pinRoles && saved.pins.some((p) => p.name === saved.pinRoles.E),
		saved && JSON.stringify(saved.pinRoles));
	ok('enregistrement : la vue interne suit le composant', saved && !!saved.innerSvg);
	ok('fermeture : la surveillance des dessins est arrêtée', !document.querySelector('.creator'));

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
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(
	chrome,
	['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1600,1000', '--virtual-time-budget=20000',
		'--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
// Contrôles i18n côté Node (le banc Chrome tourne en anglais).
const i18n = readFileSync(join(ROOT, 'src', 'webview', 'i18n.mts'), 'utf8');
for (const [key, label] of [
	["'Open in the default editor…'", 'bouton de retouche externe'],
	["'Add a simulation control \\(slider, switch\\)'", 'bouton ＋ du contrôle'],
	["'Free drawing'", 'boîtier « dessin libre »'],
	["'Drag to resize'", 'infobulle des poignées'],
]) {
	rows.push({
		name: `i18n : ${label} traduit`,
		ok: new RegExp(`${key}:\\s*[^,]`).test(i18n),
		detail: 'clé absente du catalogue FR',
	});
}
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail
	? `creator-ui : ${fail} échec(s).`
	: `creator-ui : ${rows.length} contrôles OK — zone transistor, retouche externe, zones ajustables, contrôle à la demande.`);
process.exit(fail ? 1 : 0);
