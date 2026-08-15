// Test de régression : un composant reste SUR LA FEUILLE (v2026.8.66).
// Repro Frank : « la patte de l'araignée a une contrainte de positionnement, je
// ne peux pas la déplacer vers le haut de la feuille ; par contre je sors de la
// feuille sur la droite et le bas, ce n'est pas souhaitable (avec les autres
// composants aussi) ». La butée n'existait qu'en haut et à gauche
// (`Math.max(0, …)`), et elle portait sur l'ORIGINE du composant, pas sur son
// dessin : un composant à marge s'arrêtait trop tôt en haut et partait sans
// limite à droite et en bas.
// Contrôles : les quatre bords au glissé (petits composants et grande patte), le
// dessin qui touche VRAIMENT le bord, un lot qui reste solidaire au bord, le
// recollage sur la grille, et les collages en série.
// Depuis v2026.8.68, même racine côté caméra : le zoom auto cadre le DESSIN et
// non le cadre du composant (section 7).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-feuille');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/patte-element.mjs';
import '../../src/webview/composants/araignee-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
// La feuille, telle que l'éditeur la pose (cf. SHEET_W / SHEET_H).
const SHEET_W = 4000;
const SHEET_H = 3000;
// Tolérance : le bornage part d'une boîte MESURÉE à l'écran puis divisée par le
// zoom — le sous-pixel d'écran vaut 5 px de monde à zoom 0,2.
const EPS = 6;

async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const world = document.querySelector('.canvas__world');
	// Toute la feuille dans la vue : un seul glissé la traverse de bout en bout.
	editor.setCamera({ zoom: 0.2, panX: 0, panY: 0 });
	await wait(30);

	const contOf = (id) => [...document.querySelectorAll('.part')]
		.find((c) => (c.querySelector('.part__id')?.textContent ?? '') === id);
	// Boîte du DESSIN, en coordonnées monde : c'est elle qui doit rester dans la
	// feuille — et non le coin haut-gauche du conteneur, seul borné jusqu'ici.
	const boite = (id) => {
		const cont = contOf(id);
		if (!cont) return null;
		// Le cadre du dessin n'existe que sur les composants sélectionnés : on le
		// (re)cale ici, sinon la mesure retomberait sur le CORPS — plus grand que
		// le dessin, et la comparaison serait fausse d'un composant à l'autre.
		editor.fitSelectionBox(id);
		const el = cont.querySelector('.part__selbox') ?? cont.querySelector('.part__body');
		const wr = world.getBoundingClientRect();
		const b = el.getBoundingClientRect();
		const z = editor.getCamera().zoom;
		return {
			x: (b.left - wr.left) / z, y: (b.top - wr.top) / z,
			w: b.width / z, h: b.height / z,
		};
	};
	const dedans = (bb) => !!bb && bb.x >= -EPS && bb.y >= -EPS
		&& bb.x + bb.w <= SHEET_W + EPS && bb.y + bb.h <= SHEET_H + EPS;
	const fmt = (bb) => bb
		? 'x ' + bb.x.toFixed(1) + '..' + (bb.x + bb.w).toFixed(1)
			+ ' / y ' + bb.y.toFixed(1) + '..' + (bb.y + bb.h).toFixed(1)
		: 'boîte introuvable';

	// Glissé : appui sur le corps, déplacement écran par petits pas (le premier
	// franchit le seuil de déclenchement), relâchement.
	const glisse = async (id, sdx, sdy) => {
		const body = contOf(id).querySelector('.part__body');
		const b = body.getBoundingClientRect();
		const x0 = b.left + Math.min(b.width / 2, 20);
		const y0 = b.top + Math.min(b.height / 2, 20);
		body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x0, clientY: y0 }));
		for (const k of [0.05, 0.35, 0.7, 1]) {
			window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true,
				clientX: x0 + sdx * k, clientY: y0 + sdy * k }));
			await wait(12);
		}
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
		await wait(25);
	};
	const clic = (id, ctrl = false) => {
		const body = contOf(id).querySelector('.part__body');
		const b = body.getBoundingClientRect();
		body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0,
			ctrlKey: ctrl, clientX: b.left + 3, clientY: b.top + 3 }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
	};
	// 900 px d'écran à zoom 0,2 = 4500 px de monde : de quoi traverser la feuille
	// en entier dans les deux sens.
	const COURSE = 900;

	// --- 1. Les quatre bords, composant par composant ---------------------------
	for (const type of ['led', 'resistor', 'servo']) {
		const p = editor.addPart(type, 1500, 1200);
		await wait(90);
		for (const [nom, sdx, sdy] of [
			['la droite', COURSE, 0], ['le bas', 0, COURSE],
			['la gauche', -COURSE, 0], ['le haut', 0, -COURSE],
		]) {
			await glisse(p.id, sdx, sdy);
			const bb = boite(p.id);
			ok(type + ' : poussé vers ' + nom + ', il reste sur la feuille', dedans(bb), fmt(bb));
		}
		editor.removePart(p.id);
		await wait(20);
	}

	// --- 2. Le dessin touche VRAIMENT le bord (butée sur le dessin, pas l'origine)
	const led = editor.addPart('led', 1500, 1200);
	await wait(90);
	await glisse(led.id, 0, -COURSE);
	let bb = boite(led.id);
	ok('butée du haut : c est le DESSIN qui touche le bord, pas le coin du conteneur',
		bb && Math.abs(bb.y) < 12, fmt(bb));
	await glisse(led.id, COURSE, 0);
	bb = boite(led.id);
	ok('butée de droite : le dessin s arrête AU bord de la feuille',
		bb && Math.abs(bb.x + bb.w - SHEET_W) < 12, fmt(bb));
	editor.removePart(led.id);
	await wait(20);

	// --- 3. La patte de l'araignée : le grand composant du signalement ----------
	const patte = editor.addPart('patte', 900, 800);
	await wait(250);
	const grande = boite(patte.id);
	ok('patte : c est bien un GRAND composant (le cas signalé)',
		grande && grande.w > 250 && grande.h > 150, fmt(grande));
	// La patte a une grosse marge entre son viewBox et son dessin : c'est
	// exactement ce qui faisait buter la butée d'origine trop tôt en haut.
	const corps = contOf(patte.id).querySelector('.part__body');
	const marge = corps.offsetHeight - grande.h;
	ok('patte : son dessin ne remplit pas son cadre (la marge qui faussait la butée)',
		marge > 40, 'cadre ' + corps.offsetWidth + '×' + corps.offsetHeight
			+ ' contre dessin ' + grande.w.toFixed(0) + '×' + grande.h.toFixed(0));
	for (const [nom, sdx, sdy] of [
		['le haut', 0, -COURSE], ['la droite', COURSE, 0],
		['le bas', 0, COURSE], ['la gauche', -COURSE, 0],
	]) {
		await glisse(patte.id, sdx, sdy);
		bb = boite(patte.id);
		ok('patte : poussée vers ' + nom + ', elle reste sur la feuille', dedans(bb), fmt(bb));
	}
	editor.removePart(patte.id);
	await wait(20);

	// --- 4. Un lot reste solidaire au bord --------------------------------------
	const a = editor.addPart('led', 1500, 1200);
	const b2 = editor.addPart('led', 1700, 1400);
	await wait(120);
	// Sélection multiple : clic simple sur le premier (la pose vient de
	// sélectionner le second), puis Ctrl+clic sur le second pour l'ajouter.
	clic(a.id);
	clic(b2.id, true);
	await wait(30);
	const ecart0 = { x: b2.x - a.x, y: b2.y - a.y };
	await glisse(a.id, COURSE, COURSE);
	const ecart1 = { x: b2.x - a.x, y: b2.y - a.y };
	ok('lot : les deux composants gardent leur écart au bord (le lot ne s écrase pas)',
		Math.abs(ecart1.x - ecart0.x) < 0.6 && Math.abs(ecart1.y - ecart0.y) < 0.6,
		'écart ' + JSON.stringify(ecart0) + ' → ' + JSON.stringify(ecart1));
	ok('lot : les deux restent sur la feuille', dedans(boite(a.id)) && dedans(boite(b2.id)),
		fmt(boite(a.id)) + ' | ' + fmt(boite(b2.id)));
	editor.removePart(a.id);
	editor.removePart(b2.id);
	await wait(20);

	// --- 5. Recollage sur la grille : borné lui aussi ---------------------------
	const loin = editor.addPart('servo', SHEET_W - 20, SHEET_H - 20);
	await wait(120);
	editor.snapPartToGrid(loin.id);
	await wait(40);
	ok('recollage grille : un composant posé au ras du coin est ramené sur la feuille',
		dedans(boite(loin.id)), fmt(boite(loin.id)));
	editor.removePart(loin.id);
	await wait(20);

	// --- 6. Collages en série : chaque copie s écarte de 20 px ------------------
	const src = editor.addPart('led', SHEET_W - 140, SHEET_H - 140);
	await wait(90);
	clic(src.id);
	for (let i = 0; i < 12; i++) {
		editor.duplicateSelection();
		await wait(35);
	}
	const toutes = editor.diagram.parts;
	const dehors = toutes.filter((p) => !dedans(boite(p.id)));
	ok('collages en série : les ' + toutes.length + ' copies restent sur la feuille',
		toutes.length > 3 && dehors.length === 0,
		toutes.map((p) => p.id + ' origine ' + p.x.toFixed(0) + ',' + p.y.toFixed(0)
			+ ' dessin ' + fmt(boite(p.id))).join(' ; '));

	// --- 7. Zoom auto : il cadre le DESSIN, pas le cadre du composant (v2026.8.68)
	// Repro Frank : « le zoom auto ne se fait pas exactement sur l'araignée mais
	// sur une zone plus grande ». Le recentrage mesurait le CORPS — toujours plus
	// grand que ce qu'il montre — donc il ajustait le zoom sur du vide.
	for (const p of [...editor.diagram.parts]) editor.removePart(p.id);
	await wait(40);
	const robot = editor.addPart('araignee', 1000, 800);
	await wait(500); // dessin en volume : il grandit encore après le premier rendu
	editor.fitView();
	await wait(120);
	const cb = canvas.getBoundingClientRect();
	const cadre = contOf(robot.id).querySelector('.part__body').getBoundingClientRect();
	editor.fitSelectionBox(robot.id);
	const dessin = contOf(robot.id).querySelector('.part__selbox').getBoundingClientRect();
	// Marges du recentrage : 40 px de chaque côté, plus 56 px réservés en haut
	// pour les barres flottantes.
	const utileW = cb.width - 80;
	const utileH = cb.height - 56 - 80;
	ok('zoom auto : le cadre du robot est bien plus grand que son dessin (le piège)',
		cadre.width - dessin.width > 60 || cadre.height - dessin.height > 60,
		'cadre ' + cadre.width.toFixed(0) + '×' + cadre.height.toFixed(0)
		+ ' pour un dessin ' + dessin.width.toFixed(0) + '×' + dessin.height.toFixed(0));
	ok('zoom auto : le DESSIN remplit la zone utile (à 4 px près sur l axe limitant)',
		Math.abs(dessin.width - utileW) < 4 || Math.abs(dessin.height - utileH) < 4,
		'dessin ' + dessin.width.toFixed(1) + '×' + dessin.height.toFixed(1)
		+ ' pour une zone utile ' + utileW.toFixed(0) + '×' + utileH.toFixed(0));
	ok('zoom auto : et rien ne dépasse de la vue',
		dessin.left >= cb.left - 2 && dessin.right <= cb.right + 2
		&& dessin.top >= cb.top - 2 && dessin.bottom <= cb.bottom + 2,
		'dessin ' + dessin.left.toFixed(0) + '..' + dessin.right.toFixed(0)
		+ ' / vue ' + cb.left.toFixed(0) + '..' + cb.right.toFixed(0));
	// Le robot doit aussi être CENTRÉ dans la zone utile (sous les barres).
	const cx = (dessin.left + dessin.right) / 2 - cb.left;
	const cy = (dessin.top + dessin.bottom) / 2 - cb.top;
	ok('zoom auto : le robot est centré dans la zone utile',
		Math.abs(cx - cb.width / 2) < 3 && Math.abs(cy - (cb.height + 56) / 2) < 3,
		'centre ' + cx.toFixed(0) + ',' + cy.toFixed(0)
		+ ' attendu ' + (cb.width / 2).toFixed(0) + ',' + ((cb.height + 56) / 2).toFixed(0));

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
console.log(fail ? `feuille : ${fail} échec(s).` : `feuille : ${rows.length} contrôles OK — rien ne sort de la feuille, des quatre côtés.`);
process.exit(fail ? 1 : 0);
