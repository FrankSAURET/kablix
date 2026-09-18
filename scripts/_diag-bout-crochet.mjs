// Où tombe EXACTEMENT l'extrémité bas-gauche du crochet metallique de la sonde,
// en unites de viewBox (80x80) ?
//
// Le lot .97 a cale la MACHOIRE verte sur (10;70). Frank (18/09) parle d'autre
// chose : « son extremite (bas gauche) doit etre sur une intersection de la
// grille. La connection c'est bien l'extremite du crochet. » Le point de
// connexion, c'est le bout de l'ERGOT metallique, pas la pointe du plastique.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-crochet');

const entry = `
import '../../src/webview/composants/sonde-logique-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const el = document.createElement('kablix-sonde-logique');
	document.body.appendChild(el);
	for (let i = 0; i < 8; i++) await wait(60);
	const r = el.shadowRoot;
	const svgH = r.querySelector('svg');
	const rs = svgH.getBoundingClientRect();
	// Rapport ecran -> viewBox : le SVG hote fait 80 unites.
	const vbX = (v) => ((v - rs.left) / rs.width) * 80;
	const vbY = (v) => ((v - rs.top) / rs.height) * 80;
	const lignes = [];
	const mesure = (nom, sel) => {
		const n = r.querySelector(sel);
		if (!n) { lignes.push({ quoi: nom, erreur: 'introuvable' }); return; }
		const b = n.getBoundingClientRect();
		lignes.push({ quoi: nom,
			gauche: Math.round(vbX(b.left) * 100) / 100,
			droite: Math.round(vbX(b.right) * 100) / 100,
			haut: Math.round(vbY(b.top) * 100) / 100,
			bas: Math.round(vbY(b.bottom) * 100) / 100 });
	};
	mesure('crochet #path944', '#path944');
	mesure('machoire #path14-32', '#path14-32');
	// Le trait est une DIAGONALE : sa boite englobante donne le coin, pas le
	// bout. On lit donc aussi ses extremites geometriques reelles.
	const t = r.querySelector('#path944');
	if (t && t.getTotalLength) {
		const L = t.getTotalLength();
		for (const [nom, pos] of [['bout a 0', 0], ['bout a L', L]]) {
			const p = t.getPointAtLength(pos);
			// Coordonnees LOCALES d'Inkscape : les ramener a l'ecran puis en viewBox.
			const m = t.getScreenCTM();
			const sp = svgH.createSVGPoint();
			sp.x = p.x; sp.y = p.y;
			const e = sp.matrixTransform(m);
			lignes.push({ quoi: 'crochet ' + nom,
				x: Math.round(vbX(e.x) * 100) / 100,
				y: Math.round(vbY(e.y) * 100) / 100 });
		}
		lignes.push({ quoi: 'crochet d (attribut)', d: t.getAttribute('d') });
		lignes.push({ quoi: 'crochet style', d: t.getAttribute('style') });
	}
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(lignes);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ quoi: 'exception', erreur: String(e && e.message) }]);
	document.body.appendChild(out);
});
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT });
writeFileSync(
	join(CACHE, 'p.html'),
	'<!doctype html><meta charset=utf8><body style="margin:0">' +
	'<style>kablix-sonde-logique{display:block;width:400px;height:400px}</style>' +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
for (const r of rows) console.log(' ', JSON.stringify(r));
