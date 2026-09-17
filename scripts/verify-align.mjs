// Test de régression : les broches restent SUR LA GRILLE de 10 px (v2026.7.105).
// Cause corrigée : rotateSelection/flipSelection tournaient autour du centre de
// la BOÎTE MESURÉE (gap de mise en page, dimensions impaires) sans re-snap —
// les broches quittaient la grille de ~2 px (LDR/CTN/CTP/LED à 90°), et les
// .projix enregistrés ainsi gardaient des positions fractionnaires (constaté
// sur le projet rv.projix : résistance tournée à 4,4 px de la grille).
// Contrôles : pose, rotations successives 90/180/270, 45° (premier pin), miroir,
// et réalignement doux au chargement d'un schéma « sale » (positions de rv.projix).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-align');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/ldr-element.mjs';
import '../../src/webview/composants/ntc-element.mjs';
import '../../src/webview/composants/ptc-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const offGrid = (v) => Math.min((v % 10 + 10) % 10, 10 - (v % 10 + 10) % 10);

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const world = document.querySelector('.canvas__world');
	// Centres des pastilles du DERNIER composant posé, en coordonnées monde.
	const pinCenters = () => {
		const wr = world.getBoundingClientRect();
		const cont = [...document.querySelectorAll('.part')].pop();
		return [...cont.querySelectorAll('.pin')].map((dot) => {
			const r = dot.getBoundingClientRect();
			return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
		});
	};
	const fmt = (pins) => pins.map((p) => '(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')').join(' ');

	// --- 1. Pose + rotations successives : toutes les broches sur la grille ----
	for (const type of ['resistor', 'led', 'ldr', 'ntc', 'ptc']) {
		// addPart brut ne snappe pas : on imite la pose palette (addPart + snap).
		const part = editor.addPart(type, 103, 57);
		await wait(60);
		editor.snapPartToGrid(part.id);
		editor.redrawWires();
		let pins = pinCenters();
		ok(type + ' : pose → broches sur la grille',
			pins.length >= 2 && pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
		for (const step of [90, 90, 90]) { // 90 puis 180 puis 270 cumulés
			editor.rotateSelection(step);
			await wait(20);
			pins = pinCenters();
			ok(type + ' : rotation cumulée → broches sur la grille',
				pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
		}
		// 45° : seul le PREMIER pin (référence du snap) peut être sur la grille.
		editor.rotateSelection(45 - 270);
		await wait(20);
		pins = pinCenters();
		ok(type + ' : 45° → premier pin sur la grille',
			offGrid(pins[0].x) < 0.05 && offGrid(pins[0].y) < 0.05, fmt(pins));
		editor.removePart(part.id);
	}

	// --- 1 bis. Les boutons ↺ ↻ tournent d'un QUART de tour (demande de Frank) --
	// Le pas de 45° reste sur les touches + et − : les boutons servent à poser un
	// composant debout ou couché, ce qui se fait toujours par quart de tour.
	{
		const part = editor.addPart('resistor', 103, 57);
		await wait(60);
		const btns = [...document.querySelectorAll('.inspector__transform-btn')];
		const droite = btns.find((b) => b.textContent === '↻');
		const gauche = btns.find((b) => b.textContent === '↺');
		ok('inspecteur : les deux boutons de rotation sont là', !!droite && !!gauche,
			btns.map((b) => b.textContent).join(' '));
		droite?.click();
		await wait(20);
		ok('bouton ↻ : un quart de tour (90°) et non 45°', part.rotation === 90, String(part.rotation));
		ok('… et son infobulle annonce bien 90°', /90/.test(droite?.title ?? ''), droite?.title);
		gauche?.click();
		gauche?.click();
		await wait(20);
		ok('bouton ↺ : quart de tour dans l’autre sens', part.rotation === 270, String(part.rotation));
		editor.removePart(part.id);
	}

	// --- 2. Miroir : broches sur la grille --------------------------------------
	const led = editor.addPart('led', 103, 57);
	await wait(60);
	editor.snapPartToGrid(led.id);
	editor.flipSelection('h');
	await wait(20);
	let pins = pinCenters();
	ok('miroir H : broches sur la grille',
		pins.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(pins));
	editor.removePart(led.id);

	// --- 3. Chargement d'un schéma « sale » (positions réelles de rv.projix) ----
	editor.loadDiagram({ parts: [
		{ id: 'ldr-72', type: 'ldr', x: 2198.5000486172257, y: 1878.5000707834274,
			attrs: {}, rotation: 90 },
		{ id: 'resistor-73', type: 'resistor', x: 2209.9342291141766, y: 1980.0854531439363,
			attrs: { value: '50000' }, rotation: 90 },
		{ id: 'ntc-76', type: 'ntc', x: 2390.006335238987, y: 1880.0015160697196, attrs: {} },
	], wires: [] });
	// Le réalignement se fait au settle (rAF) une fois les dessins mesurables.
	for (let i = 0; i < 6; i++) await wait(40);
	editor.redrawWires();
	const wr = world.getBoundingClientRect();
	const all = [...document.querySelectorAll('.part')].flatMap((cont) =>
		[...cont.querySelectorAll('.pin')].map((dot) => {
			const r = dot.getBoundingClientRect();
			return { x: r.left + r.width / 2 - wr.left, y: r.top + r.height / 2 - wr.top };
		}));
	ok('chargement sale : ' + all.length + ' broches recollées sur la grille',
		all.length >= 6 && all.every((p) => offGrid(p.x) < 0.05 && offGrid(p.y) < 0.05), fmt(all));

	// --- 4. Sonde logique : recollée même DROITE (v2026.9.4.91) ---------------
	// Une sonde n'accroche une broche qu'en la recouvrant exactement. Les .projix
	// existants en portent à des positions fractionnaires (dmx-pico : x=550,0092,
	// résidu de mesure sous-pixel passé dans gridOffset). Le recollage au
	// chargement ne visait que les composants TOURNÉS : une sonde droite restait
	// donc à côté de sa pastille. Elle se recolle maintenant quelle que soit sa
	// rotation.
	editor.loadDiagram({ parts: [
		{ id: 'SD1', type: 'sonde-logique', x: 550.0092, y: 319.9917,
			attrs: { voie: '0' }, rotation: 0 },
	], wires: [] });
	for (let i = 0; i < 6; i++) await wait(40);
	// On mesure la position ENREGISTRÉE, pas le DOM : c'est elle qui repart dans
	// le .projix, et c'est elle que le résidu sous-pixel polluait.
	const sd = editor.diagram.parts.find((p) => p.id === 'SD1');
	ok('sonde droite : position recollée sur la grille',
		sd && offGrid(sd.x) < 0.001 && offGrid(sd.y) < 0.001,
		sd ? '(' + sd.x + ',' + sd.y + ')' : 'sonde absente');

	// Et la PASTILLE elle-même, pas seulement la position enregistrée : c'est
	// son centre que l'élève pose sur la broche, donc c'est lui qui doit tomber
	// sur un croisement de la grille de 10 px.
	{
		const pins = pinCenters();
		ok('sonde : centre de la pastille sur un croisement de la grille',
			pins.length === 1 && offGrid(pins[0].x) < 0.05 && offGrid(pins[0].y) < 0.05, fmt(pins));
	}

	// --- 5. Le CROCHET métallique se voit (v2026.9.4.94) ---------------------
	// Il était noyé sous la mâchoire verte : 4,5 px de long en diagonale, dont
	// tout sauf le dernier millimètre recouvert par path14-32. On mesure donc
	// deux choses — sa taille, et le fait qu'il ressorte du dessin coloré.
	{
		const el = document.querySelector('[id="SD1"] kablix-sonde-logique')
			|| [...document.querySelectorAll('kablix-sonde-logique')].pop();
		const r = el && el.shadowRoot;
		const tige = r && r.querySelector('#path944');
		const bb = tige && tige.getBBox();
		// 8×8 unités de viewBox pour un demi-crochet de 4 : un trait en diagonale
		// qui traverse la pastille et sort de la mâchoire des deux côtés.
		ok('crochet : au moins 6 unités de viewBox dans chaque sens',
			bb && bb.width >= 6 && bb.height >= 6,
			bb ? bb.width.toFixed(2) + 'x' + bb.height.toFixed(2) : 'tige introuvable');
		// La mâchoire commence à ~5,5 unités de la pastille : un crochet qui ne
		// dépasse pas ce bord reste invisible, quelle que soit sa longueur.
		const mach = r && r.querySelector('#path14-32');
		const mb = mach && mach.getBBox();
		const svg = r && r.querySelector('svg > svg');
		// Comparaison en coordonnées ÉCRAN : les deux vivent dans des repères
		// différents (le crochet dans le viewBox, la mâchoire dans le groupe
		// tourné de la planche).
		const rc = tige && tige.getBoundingClientRect();
		const rm = mach && mach.getBoundingClientRect();
		ok('crochet : sa pointe dépasse sous la mâchoire verte',
			rc && rm && rc.bottom > rm.bottom + 2,
			rc && rm ? 'crochet bas=' + rc.bottom.toFixed(1) + ' mâchoire bas=' + rm.bottom.toFixed(1) : 'introuvable');
		ok('crochet : peint APRÈS le dessin coloré (dernier enfant du SVG)',
			tige && tige.parentNode.lastElementChild === tige,
			tige ? String(tige.parentNode.nodeName) : 'tige introuvable');
		// Dégradé argenté : recalé sur le nouveau segment, sinon le trait sort
		// d'une seule teinte plate (le dégradé d'origine est posé à des centaines
		// d'unités de là, userSpaceOnUse + gradientTransform hérité).
		const grad = r && r.querySelector('#linearGradient996');
		const gx1 = grad && Number(grad.getAttribute('x1'));
		ok('crochet : dégradé métallique recalé en travers du trait',
			grad && Math.abs(gx1 - 10) < 2 && grad.getAttribute('gradientTransform') === 'translate(0,0)',
			grad ? 'x1=' + gx1 + ' gt=' + grad.getAttribute('gradientTransform') : 'dégradé introuvable');
	}

	// --- 6. Grise tant qu'elle n'est accrochée à rien (v2026.9.4.94) ---------
	// Le geste demandé : on prend une pince, elle est grise ; posée elle prend
	// sa couleur ; décrochée elle redevient grise ; reposée elle RETROUVE la
	// même. L'indice de voie ne bouge jamais — seule la peinture change.
	{
		const el = [...document.querySelectorAll('kablix-sonde-logique')].pop();
		const GRIS = '#9e9e9e';
		el.setAttribute('accroche', '');
		await wait(20);
		const inerte = el.couleur;
		el.setAttribute('accroche', 'uno/13');
		await wait(20);
		const posee = el.couleur;
		el.setAttribute('accroche', '');
		await wait(20);
		const relachee = el.couleur;
		el.setAttribute('accroche', 'uno/12');
		await wait(20);
		const reposee = el.couleur;
		ok('sonde non accrochée : grise', inerte === GRIS, inerte);
		ok('sonde accrochée : elle prend la couleur de sa voie', posee !== GRIS, posee);
		ok('sonde décrochée : elle redevient grise', relachee === GRIS, relachee);
		ok('sonde reposée : elle retrouve EXACTEMENT sa couleur',
			reposee === posee, reposee + ' vs ' + posee);
		ok('décrochage : l’indice de voie survit (la teinte est retrouvable)',
			el.getAttribute('voie') === '0', el.getAttribute('voie'));
		// Et la peinture du dessin suit vraiment, pas seulement le getter : c'est
		// updateCouleur qui repeint le corps, et il ne tournait pas sur un
		// changement d accroche avant ce lot.
		const corps = el.shadowRoot.querySelector('#rect2-4');
		el.setAttribute('accroche', '');
		await wait(20);
		const gris = corps && corps.getAttribute('fill');
		el.setAttribute('accroche', 'uno/13');
		await wait(20);
		const colore = corps && corps.getAttribute('fill');
		ok('décrochage : le CORPS de la pince est repeint en gris', gris === GRIS, String(gris));
		ok('repose : le CORPS reprend la teinte de la voie', colore && colore !== GRIS, String(colore));
	}

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
	`<div id="canvas" class="canvas" style="width:800px;height:600px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `align : ${fail} échec(s).` : `align : ${rows.length} contrôles OK — broches sur la grille (pose, rotations, miroir, chargement).`);
process.exit(fail ? 1 : 0);
