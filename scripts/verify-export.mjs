// Test de régression : export SVG et STABILITÉ DES POSITIONS au rechargement
// (v2026.7.131). Vrai Editor en Chrome headless.
//
// Bug corrigé : `loadDiagram` recollait sur la grille de 10 px la PREMIÈRE BROCHE
// de CHAQUE composant (3 balayages différés + settle), réparation écrite en
// v2026.7.105 pour les vieux fichiers aux composants tournés hors grille. Le
// balayage étant inconditionnel, il déplaçait aussi tout composant DROIT posé
// volontairement hors grille — jusqu'à 5 px par axe à chaque ouverture. Le
// glissement se voyait surtout sur les composants NON CÂBLÉS : un composant
// câblé garde ses fils collés à ses broches (redrawWires suit), rien ne trahit
// le décalage, alors qu'un composant isolé n'a rien qui le suive.
//
// Contrôles : aller-retour save -> loadDiagram (positions au pixel près, câblés
// comme isolés, hors grille compris), contre-épreuve que le recollage des
// composants TOURNÉS fonctionne toujours, et cadrage de la feuille exportée
// (viewBox englobant tout le contenu + marge, identique avant/après).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-export');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/pico-board.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const vbOf = (svg) => {
	const m = svg.match(/viewBox="([-\\d.]+) ([-\\d.]+) ([-\\d.]+) ([-\\d.]+)"/);
	return m ? m.slice(1).map(Number) : null;
};

async function run() {
	const canvas = document.getElementById('canvas');
	const palette = document.getElementById('palette');
	const svg = document.getElementById('wires');
	const inspector = document.getElementById('inspector');
	const editor = new Editor(canvas, palette, svg, inspector);

	const pico = editor.addPart('pico', 200, 200);
	const ledCablee = editor.addPart('led', 400, 200);
	// Volontairement HORS grille de 10 px : c'est ce que le balayage déplaçait.
	const ledIsolee = editor.addPart('led', 703, 503);
	const resIsole = editor.addPart('resistor', 63, 63);
	await wait(300);
	editor.addWire({ partId: pico.id, pin: 'GP0' }, { partId: ledCablee.id, pin: 'A' }, { color: 'green' });
	editor.redrawWires();
	await wait(400);

	const avant = editor.diagram.parts.map((p) => ({ type: p.type, x: p.x, y: p.y }));
	const svgAvant = editor.exportSvg();
	const vbAvant = vbOf(svgAvant);

	// --- 1. Cadrage de la feuille exportée -------------------------------------
	// La zone visible englobe tout le contenu avec une marge de 30 px.
	const MARGE = 30;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of editor.diagram.parts) {
		const r = editor.rendered.get(p.id);
		const body = r.container.querySelector('.part__body') ?? r.el;
		minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x + body.offsetWidth);
		maxY = Math.max(maxY, p.y + body.offsetHeight);
	}
	ok('export : viewBox présent', !!vbAvant, JSON.stringify(vbAvant));
	if (vbAvant) {
		const [vx, vy, vw, vh] = vbAvant;
		ok('export : la feuille englobe tout le contenu (rien de rogné)',
			vx <= minX && vy <= minY && vx + vw >= maxX && vy + vh >= maxY,
			'viewBox ' + vbAvant.join(' ') + ' vs contenu ' +
			[minX, minY, maxX, maxY].map(Math.round).join(','));
		// Ajustée : pas de feuille démesurée autour du schéma (marge ~30 px).
		ok('export : feuille AJUSTÉE au contenu (marge ~30 px, pas de vide)',
			minX - vx <= MARGE + 2 && minY - vy <= MARGE + 2 &&
			(vx + vw) - maxX <= MARGE + 2 && (vy + vh) - maxY <= MARGE + 2,
			'marges g/h/d/b = ' + [minX - vx, minY - vy, (vx + vw) - maxX, (vy + vh) - maxY].map(Math.round).join('/'));
	}
	// Chaque composant est bien posé à SA position dans le SVG exporté.
	const groups = [...svgAvant.matchAll(/<g id="kpart-\\d+" transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)/g)]
		.map((m) => ({ tx: +m[1], ty: +m[2] }));
	ok('export : un groupe par composant', groups.length === editor.diagram.parts.length,
		groups.length + ' groupes / ' + editor.diagram.parts.length + ' composants');
	const posOk = editor.diagram.parts.every((p) =>
		groups.some((g) => Math.abs(g.tx - p.x) <= 0.5 && Math.abs(g.ty - p.y) <= 0.5));
	ok('export : chaque composant exporté à SA position (câblé ou non)', posOk,
		JSON.stringify(groups.map((g) => [Math.round(g.tx), Math.round(g.ty)])));

	// --- 2. Aller-retour save -> loadDiagram : positions INCHANGÉES -------------
	const sauve = JSON.parse(JSON.stringify({ parts: editor.diagram.parts, wires: editor.diagram.wires }));
	// Contre-épreuve : un composant TOURNÉ aux broches hors grille (vieux fichier).
	sauve.parts.push({ id: 'vieux-tourne', type: 'resistor', x: 303, y: 303, rotation: 90, attrs: {} });

	editor.loadDiagram(sauve);
	await wait(1700); // 3 balayages différés (120/350/800 ms) + settle

	const apres = editor.diagram.parts.map((p) => ({ type: p.type, x: p.x, y: p.y }));
	const deltas = avant.map((a, i) => ({
		type: a.type, dx: apres[i].x - a.x, dy: apres[i].y - a.y,
	}));
	const bouge = deltas.filter((d) => d.dx || d.dy);
	ok('rechargement : AUCUN composant ne bouge (hors grille compris)',
		bouge.length === 0,
		bouge.map((d) => d.type + ' ' + d.dx.toFixed(2) + ',' + d.dy.toFixed(2)).join(' | '));
	// Ciblé : le composant isolé hors grille, cœur de l'item.
	const iso = deltas[2];
	ok('rechargement : composant NON CÂBLÉ hors grille garde sa position',
		iso && !iso.dx && !iso.dy, iso ? iso.dx + ',' + iso.dy : 'absent');
	const cab = deltas[1];
	ok('rechargement : composant câblé garde sa position',
		cab && !cab.dx && !cab.dy, cab ? cab.dx + ',' + cab.dy : 'absent');

	// --- 3. Le recollage des composants TOURNÉS marche toujours (v2026.7.105) ---
	const tourne = editor.diagram.parts[editor.diagram.parts.length - 1];
	ok('rechargement : composant TOURNÉ hors grille TOUJOURS recollé',
		tourne && (tourne.rotation ?? 0) === 90 && (tourne.x !== 303 || tourne.y !== 303),
		tourne ? tourne.x + ',' + tourne.y + ' (rot ' + tourne.rotation + ')' : 'absent');

	// --- 4. Cadrage stable d'une ouverture à l'autre ----------------------------
	const vbApres = vbOf(editor.exportSvg());
	// (le composant tourné ajouté agrandit le contenu : on compare l'origine)
	ok('export : cadrage stable au rechargement (origine inchangée)',
		vbAvant && vbApres && vbAvant[0] === vbApres[0] && vbAvant[1] === vbApres[1],
		JSON.stringify(vbAvant) + ' -> ' + JSON.stringify(vbApres));

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
	`<div id="canvas" class="canvas" style="width:1000px;height:800px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=25000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `export : ${fail} échec(s).` : `export : ${rows.length} contrôles OK — positions stables au rechargement, feuille ajustée.`);
process.exit(fail ? 1 : 0);
