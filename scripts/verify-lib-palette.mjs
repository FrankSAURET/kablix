// Repro Frank (v2026.8.89) : « je vois les 2 composants DMX dans la bibliothèque,
// je les ai installés, mais ils n'apparaissent pas ».
//
// Le trajet complet est reproduit dans un VRAI navigateur : les .kompix du dépôt
// sont dépliés comme le fait l'extension (_lire-kompix.mjs = copie de
// kompixLibrary.unpackKompix), envoyés à l'éditeur par loadCustomParts(), puis
// on regarde ce que la palette contient vraiment.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { lireKompix } from './_lire-kompix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-libpalette');

// Les deux composants du dépôt arrivent TÉLÉCHARGÉS (origin remote), comme
// chez Frank ; un troisième, bricolé sur place, sert de témoin « fait maison ».
const parts = [
	{ ...(await lireKompix('dmx-grove')), kompixMeta: { origin: 'remote', sourceUrl: 'https://exemple/dmx-grove.kompix' } },
	{ ...(await lireKompix('spot')), kompixMeta: { origin: 'remote', sourceUrl: 'https://exemple/spot.kompix' } },
	{
		type: 'perso-maison',
		label: 'Fait maison',
		kind: 'passive',
		category: 'Misc',
		pins: [{ name: 'A', x: 0, y: 10 }, { name: 'B', x: 20, y: 10 }],
		svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="#888"/></svg>',
		kompixMeta: { origin: 'local' },
	},
];

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
const PARTS = ${JSON.stringify(parts)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	await wait(30);

	editor.loadCustomParts(PARTS);
	await wait(120);

	// Le dessin d'un composant personnalisé vit dans le shadow DOM de
	// <kablix-custom-part> : querySelector('svg') ne l'y trouve pas.
	const dessinDe = (racine) => racine?.querySelector('kablix-custom-part')?.shadowRoot?.querySelector('svg') ?? null;
	const lignes = () => [...document.querySelectorAll('.palette__custom, .palette__item')];
	const trouve = (label) => lignes().find((r) => (r.textContent || '').includes(label));
	for (const p of PARTS) {
		const row = trouve(p.label);
		ok('palette : « ' + p.label + ' » y figure', !!row,
			'sections : ' + [...document.querySelectorAll('.palette__section')].map((s) => s.textContent).join(' | '));
		ok('palette : « ' + p.label + ' » est visible (pas display:none)',
			!!row && row.style.display !== 'none', row ? 'display=' + row.style.display : 'ligne absente');
		const svg = dessinDe(row);
		const box = svg?.getBoundingClientRect();
		ok('palette : « ' + p.label + ' » a sa vignette dessinée', !!svg && (svg.innerHTML || '').length > 20,
			svg ? (svg.innerHTML || '').length + ' caractères' : 'aucun <svg> dans la vignette');
		ok('palette : vignette de « ' + p.label + ' » non nulle', !!box && box.width > 4 && box.height > 4,
			box ? Math.round(box.width) + '×' + Math.round(box.height) : 'pas de boîte');
	}

	// --- Étoile, export, suppression (Frank, v2026.8.89) -----------------------
	// ★ = « ne vient pas de la bibliothèque » ; ⇩ = export, réservé au fait maison ;
	// ✕ = suppression, partie vivre dans le gestionnaire de composants.
	for (const p of PARTS) {
		const maison = p.kompixMeta.origin === 'local';
		const row = trouve(p.label);
		const texte = row?.textContent || '';
		const boutons = row ? [...row.querySelectorAll('.palette__custom-del')].map((b) => b.textContent) : [];
		ok('étoile : « ' + p.label + ' » ' + (maison ? 'en porte une' : 'n en porte pas'),
			texte.includes('★') === maison, 'libellé : ' + texte.trim());
		ok('export ⇩ : « ' + p.label + ' » ' + (maison ? 'en a un' : 'n en a pas'),
			boutons.includes('⇩') === maison, 'boutons : ' + (boutons.join(' ') || 'aucun'));
		ok('suppression ✕ : absente de la palette pour « ' + p.label + ' »',
			!boutons.includes('✕'), 'boutons : ' + (boutons.join(' ') || 'aucun'));
	}

	// Posable sur la feuille, avec toutes ses pattes.
	for (const p of PARTS) {
		let pose = null;
		try { pose = editor.addPart(p.type, 300, 300); } catch (e) { ok('feuille : ' + p.type + ' posable', false, e.message); }
		await wait(120);
		if (pose) {
			const cont = [...document.querySelectorAll('.part')]
				.find((c) => (c.querySelector('.part__id')?.textContent ?? '') === pose.id);
			const svg = dessinDe(cont);
			const box = svg?.getBoundingClientRect();
			ok('feuille : ' + p.type + ' posé et dessiné', !!svg, cont ? 'pas de svg' : 'conteneur absent');
			ok('feuille : ' + p.type + ' a une taille non nulle', !!box && box.width > 8 && box.height > 8,
				box ? Math.round(box.width) + '×' + Math.round(box.height) : 'pas de boîte');
			const pins = cont ? cont.querySelectorAll('.pin').length : 0;
			ok('feuille : ' + p.type + ' montre ses ' + p.pins.length + ' pattes', pins === p.pins.length, pins + ' patte(s)');
		}
	}

	// Bouton du gestionnaire de composants : renommé et MIS EN ÉVIDENCE aux
	// couleurs du bouton principal du thème (demande de Frank, v2026.8.91).
	const gerer = lignes().find((r) => (r.textContent || '').includes('Manage components'));
	ok('palette : le bouton « Manage components » est là', !!gerer,
		'derniers boutons : ' + lignes().map((r) => r.textContent).slice(-3).join(' | '));
	ok('palette : ce bouton porte la classe de mise en évidence',
		!!gerer && gerer.classList.contains('palette__item--manage'), gerer ? gerer.className : 'absent');
	const fond = gerer ? getComputedStyle(gerer).backgroundColor : '';
	ok('palette : il a un fond plein (pas le bouton discret d avant)',
		fond.indexOf('rgb') === 0 && fond !== 'rgba(0, 0, 0, 0)', 'fond = ' + fond);
	ok('palette : plus de bouton « Import components »',
		!lignes().some((r) => (r.textContent || '').includes('Import components')), 'ancien libellé encore présent');

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
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' }, absWorkingDir: ROOT });
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
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=40000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `bibliothèque/palette : ${fail} échec(s).` : `bibliothèque/palette : ${rows.length} contrôles OK — les composants installés arrivent dans la palette.`);
process.exit(fail ? 1 : 0);
