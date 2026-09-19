// Test de régression : les gestes de SOURIS RÉELS dans le vrai éditeur
// (v2026.9.3.73).
//
// Pourquoi un banc de plus alors que `verify:texte` couvre déjà les étiquettes :
// tous les autres bancs pilotent l'éditeur avec des événements FABRIQUÉS
// (`new PointerEvent(...)`), parce que `--dump-dom` n'offre aucune entrée. Ça
// suffit pour la logique, mais pas pour un GESTE : un événement fabriqué porte
// les champs qu'on lui donne, alors que le navigateur, lui, décide. Le
// double-clic sur une étiquette en a fait la démonstration — deux lots livrés
// verts sur une fonction qui ne marchait pas :
//   - lot .71 : écouteur `dblclick` sur le nœud. MESURÉ : le `preventDefault()`
//     du premier `pointerdown` supprime TOUS les événements souris de
//     compatibilité, `dblclick` compris. Il n'arrive jamais.
//   - lot .72 : détection par `e.detail >= 2` dans `pointerdown`. MESURÉ : un
//     `pointerdown` porte `detail = 0`, toujours. Le banc passait parce qu'il
//     posait `detail: 2` lui-même.
// Ici Chrome est piloté par le protocole de mise au point (CDP) : les clics
// sont émis par le navigateur, avec les événements qu'il produit VRAIMENT.
// C'est le seul banc qui aurait attrapé ces deux ratés.
//
// Ce qui est vérifié :
//   1. un double-clic sur une étiquette ouvre sa saisie et allume le mode texte ;
//   2. un clic simple la sélectionne sans rien ouvrir ;
//   3. deux clics espacés restent deux clics simples ;
//   4. un glisser déplace l'étiquette au lieu d'ouvrir la saisie ;
//   5. un rectangle de sélection attrape plusieurs étiquettes d'un coup ;
//   6. tirer l'une d'elles déplace TOUT le lot, et rien d'autre ;
//   7. un clic droit quitte le mode étiquette sans en poser une ;
//   8. glisser un segment de fil le déplace PERPENDICULAIREMENT à sa direction ;
//   9. lâcher une sonde logique SUR la pastille d'une broche l'y accroche et lui
//      attribue sa teinte de voie — le choix des voies de l'analyseur est un
//      GESTE, pas une liste à cocher, donc il se prouve à la vraie souris ;
//  10. une pose depuis la palette = UN composant, jamais une pile invisible
//      (c'était la cause des « propriétés triplées », v2026.9.4.94) ;
//  11. un double-clic sur le CURSEUR de simulation d'un composant, ou sur sa
//      valeur, ouvre la saisie au clavier — le même piège qu'aux lots .71/.72,
//      cette fois sur `custom-part` : l'atelier arrête `pointerdown` sur les
//      composants, et un banc à événements fabriqués ne le verrait jamais.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-souris');
const PORT = 9411;

// La page ne fait que MONTER l'éditeur et poser une étiquette : tous les gestes
// viennent de la souris pilotée depuis node, pas d'un script de page.
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
// La résistance sert au contrôle du glissé de segment (§8) : sans son élément,
// le composant se pose mais n'a aucune pastille, donc aucun fil ne se trace.
import '../../src/webview/composants/resistor-element.mjs';
// La carte et la sonde servent au contrôle de la POSE de sonde (§9) : sans leurs
// éléments, aucune pastille n'existe, donc aucune superposition à résoudre.
import '../../src/webview/composants/arduino-uno-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
// Le composant de bibliothèque sert au contrôle du CURSEUR (§11) : c'est lui
// qui porte la saisie au clavier, et il se monte seul, sans passer par l'atelier.
import '../../src/webview/composants/custom-part.mjs';
const canvas = document.getElementById('canvas');
const editor = new Editor(canvas, document.getElementById('palette'),
	document.getElementById('wires'), document.getElementById('inspector'));
editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
window.bascules = [];
editor.onTextModeChange = (v) => window.bascules.push(v);
window.editor = editor;
window.pret = true;
`;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => {
	checks.push({ name, ok: !!cond, detail: String(detail) });
	console.log(`${cond ? '✅' : '❌'} ${name}${cond ? '' : ` — ${detail}`}`);
};

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }

const profil = join(CACHE, 'profil');
rmSync(profil, { recursive: true, force: true });
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--window-size=1400,1000',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });

let ws = null;
try {
	// Le port met un instant à s'ouvrir : on réessaie plutôt que d'attendre au pif.
	let liste = null;
	for (let i = 0; i < 40 && !liste; i++) {
		try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
		catch { await attendre(250); }
	}
	if (!liste) throw new Error('Chrome ne répond pas sur le port de mise au point');
	const cible = liste.find((c) => c.type === 'page');
	ws = new WebSocket(cible.webSocketDebuggerUrl);
	let id = 0;
	const attentes = new Map();
	ws.addEventListener('message', (ev) => {
		const m = JSON.parse(ev.data);
		if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
	});
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	const cdp = (method, params = {}) => new Promise((res) => {
		const n = ++id;
		attentes.set(n, res);
		ws.send(JSON.stringify({ id: n, method, params }));
	});
	const ev = async (expr) => {
		const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
		return r.result?.result?.value;
	};

	for (let i = 0; i < 40 && !(await ev('window.pret === true')); i++) await attendre(250);
	if (!(await ev('window.pret === true'))) throw new Error('éditeur non monté');

	// Clic RÉEL : Chrome produit lui-même pointerdown/mousedown/click/dblclick,
	// avec les champs qu'il juge bons. C'est tout l'intérêt du banc.
	const souris = async (x, y, clickCount = 1) => {
		const base = { x, y, button: 'left', clickCount };
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
		await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
	};
	const doubleClic = async (x, y) => { await souris(x, y, 1); await souris(x, y, 2); };
	const etat = () => ev(`(() => {
		const n = document.querySelector('.text-note');
		const c = n && n.querySelector('.text-note__body');
		return JSON.stringify({
			edit: c ? c.contentEditable : 'absent',
			mode: window.editor.isTextMode(),
			sel: n ? n.classList.contains('text-note--selected') : false,
			bascules: window.bascules.length,
		});
	})()`);
	const centre = async () => {
		const r = await ev(`(() => { const b = document.querySelector('.text-note').getBoundingClientRect();
			return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }); })()`);
		return JSON.parse(r);
	};

	// L'étiquette est posée au geste, comme l'utilisateur : mode texte allumé,
	// puis un vrai clic sur le fond de la feuille.
	await ev('window.editor.toggleTextMode(true)');
	await souris(500, 400);
	await attendre(200);
	ok('un vrai clic sur le fond POSE une étiquette',
		!!(await ev('!!document.querySelector(".text-note")')));
	// On écrit dedans puis on referme : une étiquette vide s'efface d'elle-même.
	await ev(`(() => { const c = document.querySelector('.text-note__body');
		c.textContent = 'Annotation';
		c.dispatchEvent(new InputEvent('input', { bubbles: true }));
		c.blur(); window.editor.toggleTextMode(false); })()`);
	await attendre(200);
	let p = await centre();

	// --- 1. Clic SIMPLE : sélection, rien d'ouvert -----------------------------
	await ev('window.bascules.length = 0');
	await souris(p.x, p.y);
	await attendre(120);
	let s = JSON.parse(await etat());
	ok('un vrai clic simple SÉLECTIONNE l étiquette', s.sel === true, JSON.stringify(s));
	ok('et il n ouvre PAS la saisie', s.edit !== 'true', s.edit);
	ok('et il n allume PAS le mode texte', s.mode === false, String(s.mode));

	// --- 2. Deux clics ESPACÉS restent deux clics simples -----------------------
	await attendre(700);
	await souris(p.x, p.y);
	await attendre(120);
	s = JSON.parse(await etat());
	ok('deux clics espacés de 700 ms n ouvrent rien', s.edit !== 'true', s.edit);

	// --- 3. Le DOUBLE-CLIC, avec une vraie souris ------------------------------
	await attendre(700);
	await ev('window.bascules.length = 0');
	await doubleClic(p.x, p.y);
	await attendre(180);
	s = JSON.parse(await etat());
	ok('un VRAI double-clic ouvre la saisie', s.edit === 'true', JSON.stringify(s));
	ok('et il allume le mode texte', s.mode === true, String(s.mode));
	ok('le bouton T en est prévenu une seule fois', s.bascules === 1, String(s.bascules));

	// --- 4. Un GLISSER déplace, il n'ouvre pas ---------------------------------
	await ev(`(() => { document.querySelector('.text-note__body').blur();
		window.editor.toggleTextMode(false); })()`);
	await attendre(700);
	p = await centre();
	const avant = JSON.parse(await ev(`(() => { const b = document.querySelector('.text-note').getBoundingClientRect();
		return JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top) }); })()`));
	await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 0 });
	await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
	for (const d of [10, 25, 40, 60]) {
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + d, y: p.y + d, button: 'left', buttons: 1 });
	}
	await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + 60, y: p.y + 60, button: 'left', buttons: 0, clickCount: 1 });
	await attendre(180);
	const apres = JSON.parse(await ev(`(() => { const b = document.querySelector('.text-note').getBoundingClientRect();
		return JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top) }); })()`));
	s = JSON.parse(await etat());
	ok('un glisser DÉPLACE l étiquette', Math.abs(apres.x - avant.x) >= 40 && Math.abs(apres.y - avant.y) >= 40,
		`${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);
	ok('et un glisser n ouvre pas la saisie', s.edit !== 'true', s.edit);

	// --- 5. Le RECTANGLE de sélection attrape plusieurs étiquettes -------------
	// On repart d'une feuille nette : trois étiquettes posées par programme à des
	// places connues, deux dans la boîte à venir, une hors d'atteinte.
	await ev(`(() => {
		window.editor.clear();
		window.editor.addText('Alpha', 200, 200);
		window.editor.addText('Beta', 200, 260);
		window.editor.addText('Gamma', 200, 600);
	})()`);
	await attendre(200);
	// Coordonnées écran : le canvas commence après la palette, l'éditeur est à
	// zoom 1 sans panoramique — on relit quand même la boîte pour ne rien supposer.
	const orig = JSON.parse(await ev(`(() => { const b = document.getElementById('canvas').getBoundingClientRect();
		return JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top) }); })()`));
	const lasso = async (x1, y1, x2, y2, boutons = 1) => {
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, button: 'left', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: boutons, clickCount: 1 });
		const pas = 6;
		for (let i = 1; i <= pas; i++) {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: boutons,
				x: Math.round(x1 + ((x2 - x1) * i) / pas), y: Math.round(y1 + ((y2 - y1) * i) / pas) });
		}
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 });
	};
	const cadres = () => ev(`document.querySelectorAll('.text-note--selected').length`);
	// Boîte (150,150)→(400,400) en coordonnées feuille : Alpha et Beta dedans,
	// Gamma (y = 600) dehors.
	await lasso(orig.x + 150, orig.y + 150, orig.x + 400, orig.y + 400);
	await attendre(200);
	ok('le rectangle sélectionne DEUX étiquettes', (await cadres()) === 2, String(await cadres()));
	ok('et il laisse la troisième dehors',
		(await ev(`document.querySelectorAll('.text-note').length`)) === 3);

	// --- 6. Le lot d'étiquettes se déplace ENSEMBLE ----------------------------
	const positions = () => ev(`JSON.stringify((window.editor.serialize().texts || [])
		.map((n) => [n.text, n.x, n.y]).sort())`);
	const avantLot = JSON.parse(await positions());
	// On saisit Beta (y = 260 en feuille) et on tire de 100 px vers la droite.
	const beta = JSON.parse(await ev(`(() => {
		const n = [...document.querySelectorAll('.text-note')].find((e) => e.textContent.trim() === 'Beta');
		const b = n.getBoundingClientRect();
		return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }); })()`));
	await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: beta.x, y: beta.y, button: 'left', buttons: 0 });
	await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: beta.x, y: beta.y, button: 'left', buttons: 1, clickCount: 1 });
	for (const d of [20, 50, 80, 100]) {
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: beta.x + d, y: beta.y, button: 'left', buttons: 1 });
	}
	await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: beta.x + 100, y: beta.y, button: 'left', buttons: 0, clickCount: 1 });
	await attendre(200);
	const apresLot = JSON.parse(await positions());
	const bouge = (nom) => {
		const a = avantLot.find((e) => e[0] === nom);
		const b = apresLot.find((e) => e[0] === nom);
		return b[1] - a[1];
	};
	ok('l étiquette tirée avance de 100 px', bouge('Beta') === 100, String(bouge('Beta')));
	ok('l AUTRE étiquette du lot la suit', bouge('Alpha') === 100, String(bouge('Alpha')));
	ok('celle hors du lot ne bouge pas', bouge('Gamma') === 0, String(bouge('Gamma')));

	// --- 7. Le CLIC DROIT quitte le mode étiquette -----------------------------
	await ev('window.editor.toggleTextMode(true)');
	ok('le mode étiquette est bien allumé', (await ev('window.editor.isTextMode()')) === true);
	const combien = await ev(`document.querySelectorAll('.text-note').length`);
	await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: orig.x + 700, y: orig.y + 700, button: 'right', buttons: 0 });
	await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: orig.x + 700, y: orig.y + 700, button: 'right', buttons: 2, clickCount: 1 });
	await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: orig.x + 700, y: orig.y + 700, button: 'right', buttons: 0, clickCount: 1 });
	await attendre(200);
	ok('un clic DROIT sur le fond éteint le mode étiquette',
		(await ev('window.editor.isTextMode()')) === false);
	ok('et il ne pose aucune étiquette',
		(await ev(`document.querySelectorAll('.text-note').length`)) === combien);

	// --- 8. Un SEGMENT de fil se déplace perpendiculairement -------------------
	// Deux résistances éloignées, reliées par un fil dont on impose le tracé :
	// deux coudes, donc un segment vertical franc au milieu. On le saisit et on
	// tire vers la droite : il doit glisser en X, et rester vertical.
	await ev(`(() => {
		window.editor.toggleTextMode(false);
		window.editor.loadDiagram({
			parts: [
				{ id: 'r1', type: 'resistor', x: 100, y: 200, attrs: { value: '1000' } },
				{ id: 'r2', type: 'resistor', x: 500, y: 500, attrs: { value: '1000' } },
			],
			wires: [{ id: 'w1', color: 'green',
				a: { partId: 'r1', pin: '2' }, b: { partId: 'r2', pin: '1' },
				points: [{ x: 300, y: 210 }, { x: 300, y: 510 }] }],
		});
		// Vue remise à plat : 80 px de souris doivent valoir 80 px de feuille.
		window.editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	})()`);
	await attendre(250);
	ok('la vue est bien à zoom 1', (await ev('window.editor.serialize().camera?.zoom ?? 1')) === 1);
	// Milieu du segment vertical, en coordonnées écran (zoom 1, pas de panoramique).
	const segAvant = JSON.parse(await ev(`JSON.stringify(window.editor.serialize().wires[0].points)`));
	ok('le fil de départ a bien deux coudes', segAvant.length === 2, JSON.stringify(segAvant));
	// Position ÉCRAN d'un point de la FEUILLE : le tracé vit dans `.canvas__world`,
	// qui porte la transformation (panoramique + zoom) — on la traverse plutôt
	// que de supposer que la feuille commence au coin du canvas.
	const surEcran = async (x, y) => JSON.parse(await ev(`(() => {
		const w = document.querySelector('.canvas__world');
		const b = w.getBoundingClientRect();
		const z = window.editor.serialize().camera?.zoom ?? 1;
		return JSON.stringify({ x: Math.round(b.left + ${x} * z), y: Math.round(b.top + ${y} * z) }); })()`));
	const mid = await surEcran(300, 360);
	// Le geste ne prouve rien si la souris rate le fil : on vérifie que le point
	// visé est bien SUR le tracé avant de tirer dessus.
	ok('la souris vise bien le tracé du fil', (await ev(
		`(() => { const e = document.elementFromPoint(${mid.x}, ${mid.y});
			return !!e && e.classList.contains('wire'); })()`)) === true);
	await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.x, y: mid.y, button: 'left', buttons: 0 });
	await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mid.x, y: mid.y, button: 'left', buttons: 1, clickCount: 1 });
	for (const d of [10, 30, 55, 80]) {
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.x + d, y: mid.y, button: 'left', buttons: 1 });
	}
	await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mid.x + 80, y: mid.y, button: 'left', buttons: 0, clickCount: 1 });
	await attendre(250);
	const segApres = JSON.parse(await ev(`JSON.stringify(window.editor.serialize().wires[0].points)`));
	ok('le segment vertical a glissé vers la droite',
		segApres.length === 2 && segApres[0].x === 380 && segApres[1].x === 380, JSON.stringify(segApres));
	ok('et il est resté VERTICAL (même x aux deux bouts)',
		segApres.length === 2 && segApres[0].x === segApres[1].x, JSON.stringify(segApres));
	ok('les y des deux coudes n ont pas bougé',
		segApres.length === 2 && segApres[0].y === segAvant[0].y && segApres[1].y === segAvant[1].y,
		JSON.stringify(segApres));
	ok('le fil reste accroché à ses deux broches',
		(await ev(`(() => { const w = window.editor.serialize().wires[0];
			return w.a.partId === 'r1' && w.b.partId === 'r2'; })()`)) === true);

	// Un segment HORIZONTAL, lui, ne se déplace qu'en Y : on tire en diagonale,
	// seul le Y doit suivre. Il touche une broche : un coude doit être créé.
	await ev(`(() => { window.editor.loadDiagram({
		parts: [
			{ id: 'r1', type: 'resistor', x: 100, y: 200, attrs: { value: '1000' } },
			{ id: 'r2', type: 'resistor', x: 500, y: 500, attrs: { value: '1000' } },
		],
		wires: [{ id: 'w1', color: 'green',
			a: { partId: 'r1', pin: '2' }, b: { partId: 'r2', pin: '1' },
			points: [{ x: 200, y: 400 }, { x: 400, y: 400 }] }],
	}); window.editor.setCamera({ zoom: 1, panX: 0, panY: 0 }); })()`);
	await attendre(250);
	const horAvant = JSON.parse(await ev(`JSON.stringify(window.editor.serialize().wires[0].points)`));
	const midH = await surEcran(300, 400);
	await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: midH.x, y: midH.y, button: 'left', buttons: 0 });
	await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: midH.x, y: midH.y, button: 'left', buttons: 1, clickCount: 1 });
	for (const d of [10, 30, 50, 70]) {
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: midH.x + d, y: midH.y + d, button: 'left', buttons: 1 });
	}
	await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: midH.x + 70, y: midH.y + 70, button: 'left', buttons: 0, clickCount: 1 });
	await attendre(250);
	const horApres = JSON.parse(await ev(`JSON.stringify(window.editor.serialize().wires[0].points)`));
	ok('le segment horizontal est descendu de 70 px',
		horApres.length === 2 && horApres[0].y === 470 && horApres[1].y === 470, JSON.stringify(horApres));
	ok('et il n a PAS suivi la souris en X',
		horApres.length === 2 && horApres[0].x === horAvant[0].x && horApres[1].x === horAvant[1].x,
		JSON.stringify(horApres));

	// --- 9. POSER une sonde logique sur une broche -----------------------------
	// Le choix des voies de l'analyseur est un GESTE, pas une liste à cocher :
	// l'élève lâche la pastille de la pince PAR-DESSUS celle d'une broche. Rien
	// de tout ça ne se prouve avec un `PointerEvent` fabriqué — l'accrochage est
	// résolu au `pointerup`, et c'est le navigateur qui décide si le glissé a
	// bien eu lieu. Trois choses à démontrer : l'accrochage s'écrit, la couleur
	// est attribuée à la pose, et reposée dans le vide la sonde se désaccroche
	// SANS perdre sa teinte.
	const uno = { id: 'uno1', type: 'uno', x: 100, y: 100, attrs: {} };
	await ev(`(() => { window.editor.loadDiagram({
		parts: [
			${JSON.stringify(uno)},
			{ id: 'sd1', type: 'sonde-logique', x: 700, y: 600, attrs: {} },
		],
		wires: [],
	}); window.editor.setCamera({ zoom: 1, panX: 0, panY: 0 }); })()`);
	await attendre(400);
	const sonde1 = () => ev(`(() => { const p = window.editor.serialize().parts
		.find((x) => x.id === 'sd1');
		return JSON.stringify({ accroche: p.attrs?.accroche ?? '', voie: p.attrs?.voie ?? '',
			x: p.x, y: p.y }); })()`);
	ok('la sonde part sans accrochage et sans voie',
		(JSON.parse(await sonde1()).accroche === '') && JSON.parse(await sonde1()).voie === '',
		await sonde1());

	// Centre FEUILLE de la pastille de la broche 8 de l'Uno : on ne suppose pas
	// sa position, on la mesure — c'est l'éditeur lui-même qui la donne, comme
	// il le fait pour résoudre l'accrochage. Même chose pour la pointe de la
	// pince : le geste doit amener l'une exactement sur l'autre.
	const centreFeuille = async (partId, pin) => JSON.parse(await ev(
		`JSON.stringify(window.editor.hotspotCenter({ partId: '${partId}', pin: '${pin}' }) ?? null)`));
	const broche8 = await centreFeuille('uno1', '8');
	const pointe = await centreFeuille('sd1', 'G');
	ok('les deux pastilles sont mesurables sur le dessin',
		!!broche8 && !!pointe, JSON.stringify({ broche8, pointe }));

	if (broche8 && pointe) {
		// On saisit la pince par son CORPS (son centre), pas par sa pastille : le
		// déplacement de la souris est celui du composant, et la pastille suit.
		const avant = JSON.parse(await sonde1());
		const prise = await surEcran(avant.x + 40, avant.y + 40); // milieu du 80×80
		const dx = broche8.x - pointe.x;
		const dy = broche8.y - pointe.y;
		const arrivee = await surEcran(avant.x + 40 + dx, avant.y + 40 + dy);
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: prise.x, y: prise.y, button: 'left', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: prise.x, y: prise.y, button: 'left', buttons: 1, clickCount: 1 });
		// Plusieurs étapes : un seul saut ne compte pas comme un glissé.
		for (const k of [0.25, 0.5, 0.75, 1]) {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
				x: Math.round(prise.x + (arrivee.x - prise.x) * k),
				y: Math.round(prise.y + (arrivee.y - prise.y) * k) });
		}
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: arrivee.x, y: arrivee.y, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(350);
		const posee = JSON.parse(await sonde1());
		ok('lâcher la pince SUR la pastille de la broche 8 écrit l accrochage',
			posee.accroche === 'uno1/8', JSON.stringify(posee));
		ok('et la pose attribue la première teinte libre (voie 0)',
			posee.voie === '0', JSON.stringify(posee));

		// Reposée LOIN de toute broche : l'accrochage s'effface, la teinte reste.
		const loin = await surEcran(posee.x + 40 + 260, posee.y + 40 + 200);
		const p2 = await surEcran(posee.x + 40, posee.y + 40);
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x, y: p2.y, button: 'left', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p2.x, y: p2.y, button: 'left', buttons: 1, clickCount: 1 });
		for (const k of [0.3, 0.6, 1]) {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
				x: Math.round(p2.x + (loin.x - p2.x) * k), y: Math.round(p2.y + (loin.y - p2.y) * k) });
		}
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: loin.x, y: loin.y, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(350);
		const enlevee = JSON.parse(await sonde1());
		ok('reposée dans le vide, la pince se DÉSACCROCHE',
			enlevee.accroche === '', JSON.stringify(enlevee));
		ok('mais elle GARDE sa teinte (le repère visuel de l élève ne bouge pas)',
			enlevee.voie === '0', JSON.stringify(enlevee));
	}

	// --- 10. POSER depuis la palette : UNE pose par geste ----------------------
	// Défaut corrigé en v2026.9.4.94 (« de temps en temps les propriétés d'un
	// objet sont triplées »). Deux causes, toutes deux invisibles à l'écran
	// parce que les composants se posaient EXACTEMENT l'un sur l'autre :
	//   a) un second appui reçu avant le relâché lançait une SECONDE pose. Pire :
	//      dès le premier appui le composant naît sous le curseur et la palette
	//      bouge dessous, si bien que l'appui suivant tombe sur un AUTRE bouton —
	//      mesuré : résistance, puis phototransistor, puis photodiode, empilés ;
	//   b) deux poses SANS déplacement (clic sec) visaient le même centre de vue
	//      au pixel près, la seconde recouvrant la première.
	// L'élève voyait un seul objet, l'inspecteur montrait celui du dessus, et sa
	// désélection/resélection tombait sur un autre exemplaire de la pile — d'où
	// l'impression de propriétés en double ou en triple.
	// Rien de tout ça ne se prouve avec des événements fabriqués : c'est le
	// navigateur qui décide de l'ordre des appuis et de qui les reçoit.
	await ev('window.editor.clear()');
	await attendre(200);
	// Toutes les sections de palette dépliées : un bouton dans une section
	// repliée n'a aucune position à l'écran, donc aucun geste possible dessus.
	await ev(`(() => { for (const h of document.querySelectorAll('.palette__section--collapsed')) h.click(); })()`);
	await attendre(300);
	const boutonPalette = JSON.parse(await ev(`(() => {
		const b = [...document.querySelectorAll('.palette__item')].find((el) => (el.title || '') === 'Resistor');
		if (!b) return JSON.stringify(null);
		b.scrollIntoView({ block: 'center' });
		const r = b.getBoundingClientRect();
		return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
	})()`));
	ok('le bouton Resistor de la palette est atteignable à la souris', !!boutonPalette,
		JSON.stringify(boutonPalette));

	if (boutonPalette) {
		const poses = () => ev(`JSON.stringify(window.editor.serialize().parts
			.map((p) => p.type + '@' + Math.round(p.x) + ',' + Math.round(p.y)))`);

		// (a) TROIS appuis, un seul relâché : une seule pose doit en sortir.
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: boutonPalette.x, y: boutonPalette.y, button: 'none', buttons: 0 });
		for (let i = 0; i < 3; i++) {
			await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: boutonPalette.x, y: boutonPalette.y, button: 'left', buttons: 1, clickCount: 1 });
			await attendre(30);
		}
		for (let i = 1; i <= 6; i++) {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
				x: Math.round(boutonPalette.x + (500 - boutonPalette.x) * i / 6),
				y: Math.round(boutonPalette.y + (400 - boutonPalette.y) * i / 6) });
		}
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 400, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(450);
		const apresA = JSON.parse(await poses());
		ok('trois appuis sur la palette, un seul relâché : UN seul composant posé',
			apresA.length === 1, apresA.join(' | '));
		ok('et c est bien celui du bouton visé, pas le voisin attrapé au vol',
			apresA.length === 1 && apresA[0].startsWith('resistor@'), apresA.join(' | '));

		// (b) TROIS clics secs : trois composants, mais aucun caché sous un autre.
		await ev('window.editor.clear()');
		await attendre(200);
		// Remesure avant chaque clic : la palette a pu défiler entre-temps, et une
		// position gardée finirait par désigner le bouton du voisin.
		for (let i = 0; i < 3; i++) {
			const btnB = JSON.parse(await ev(`(() => {
				const b = [...document.querySelectorAll('.palette__item')].find((el) => (el.title || '') === 'Resistor');
				if (!b) return JSON.stringify(null);
				b.scrollIntoView({ block: 'center' });
				const r = b.getBoundingClientRect();
				return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
			})()`)) ?? boutonPalette;
			await attendre(120);
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btnB.x, y: btnB.y, button: 'none', buttons: 0 });
			await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnB.x, y: btnB.y, button: 'left', buttons: 1, clickCount: 1 });
			await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnB.x, y: btnB.y, button: 'left', buttons: 0, clickCount: 1 });
			await attendre(140);
		}
		await attendre(400);
		const apresB = JSON.parse(await poses());
		ok('trois clics secs sur la palette posent bien trois composants',
			apresB.length === 3 && apresB.every((s) => s.startsWith('resistor@')), apresB.join(' | '));
		ok('et AUCUN ne recouvre exactement un autre : plus de pile invisible',
			apresB.length > 0 && new Set(apresB.map((s) => s.split('@')[1])).size === apresB.length,
			apresB.join(' | '));

		// (c) Le geste normal ne doit RIEN perdre au passage : un appui, un glissé,
		// un relâché posent un composant, un seul, là où on l'a lâché.
		await ev('window.editor.clear()');
		await attendre(200);
		// Le bouton se REMESURE : les gestes précédents ont fait défiler la palette,
		// et l'ancienne position désigne désormais un AUTRE bouton (mesuré : une
		// LED au lieu de la résistance). Une position d'écran ne se garde pas.
		const btnC = JSON.parse(await ev(`(() => {
			const b = [...document.querySelectorAll('.palette__item')].find((el) => (el.title || '') === 'Resistor');
			if (!b) return JSON.stringify(null);
			b.scrollIntoView({ block: 'center' });
			const r = b.getBoundingClientRect();
			return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
		})()`)) ?? boutonPalette;
		await attendre(200);
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btnC.x, y: btnC.y, button: 'none', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnC.x, y: btnC.y, button: 'left', buttons: 1, clickCount: 1 });
		for (let i = 1; i <= 8; i++) {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
				x: Math.round(btnC.x + (620 - btnC.x) * i / 8),
				y: Math.round(btnC.y + (300 - btnC.y) * i / 8) });
		}
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 620, y: 300, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(450);
		const apresC = JSON.parse(await poses());
		ok('le geste normal (appui, glissé, relâché) pose toujours UN composant',
			apresC.length === 1 && apresC[0].startsWith('resistor@'), apresC.join(' | '));
	}
	// --- 11. Le CURSEUR de simulation : double-clic = saisie au clavier -------
	//
	// Frank : « pour le ds18b20 en double cliquant sur le slider ou la valeur, on
	// peut saisir la valeur au clavier (. et , indifféremment) ». Un curseur long
	// de 44 px ne sait pas viser 25,5 °C ; sur les 180 degrés de course d'un
	// DS18B20, un pixel en vaut quatre.
	//
	// Pourquoi ICI et pas dans un banc ordinaire : `dblclick` n'existe que si
	// personne n'a appelé `preventDefault()` sur le premier `pointerdown`, et
	// l'atelier le fait sur les composants. Aucun événement fabriqué ne peut
	// prouver ce point — c'est exactement ce qui a fait livrer deux lots verts
	// sur un double-clic mort (voir l'en-tête).
	{
		// Un composant minimal, monté SEUL : le curseur ne dépend ni du schéma ni
		// du moteur, juste de l'attribut `simulating`.
		await ev(`(() => {
			document.querySelectorAll('#banc-curseur').forEach((n) => n.remove());
			const el = document.createElement('kablix-custom-part');
			el.id = 'banc-curseur';
			el.style.cssText = 'position:absolute;left:700px;top:600px;z-index:99';
			el.definition = {
				type: 'thermo-essai', label: 'Thermo', kind: 'passive',
				custom: {
					svg: '<svg width="60" height="30" viewBox="0 0 60 30"></svg>',
					pins: [{ name: 'OUT', x: 0, y: 0 }],
					control: { type: 'slider', min: -55, max: 125, step: 0.5, unit: '°C' },
				},
			};
			el.setAttribute('simulating', '');
			document.body.appendChild(el);
			return true;
		})()`);
		await attendre(250);

		// Les deux cibles du geste : la barre du curseur et le nombre affiché.
		const cible = async (sel) => {
			const r = await ev(`(() => {
				const e = document.getElementById('banc-curseur');
				const n = e && e.shadowRoot && e.shadowRoot.querySelector(${JSON.stringify(sel)});
				if (!n) return JSON.stringify(null);
				const b = n.getBoundingClientRect();
				return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
			})()`);
			return JSON.parse(r);
		};
		const saisieOuverte = () => ev(`(() => {
			const e = document.getElementById('banc-curseur');
			const c = e && e.shadowRoot && e.shadowRoot.querySelector('input.saisie');
			return c ? 'ouverte' : 'absente';
		})()`);
		const valeur = () => ev(`document.getElementById('banc-curseur').controlValue`);
		// Taper dans la saisie SANS jeter si elle n'est pas ouverte : un champ
		// absent est un ÉCHEC nommé, pas une exception qui emporte la suite du
		// banc (sinon la contre-épreuve ne joue qu'un contrôle sur huit).
		const taper = (texte, touche) => ev(`(() => {
			const e = document.getElementById('banc-curseur');
			const c = e && e.shadowRoot && e.shadowRoot.querySelector('input.saisie');
			if (!c) return false;
			c.value = ${JSON.stringify(texte)};
			c.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(touche)}, bubbles: true }));
			return true;
		})()`);

		const surCurseur = await cible('input[type=range]');
		ok('le curseur de simulation est bien monté sous le composant',
			!!surCurseur, JSON.stringify(surCurseur));

		// (a) Double-clic sur la BARRE du curseur.
		await attendre(700);
		await doubleClic(surCurseur.x, surCurseur.y);
		await attendre(220);
		ok('un VRAI double-clic sur le curseur ouvre la saisie au clavier',
			(await saisieOuverte()) === 'ouverte', await saisieOuverte());

		// (b) La virgule vaut le point : c'est la demande explicite de Frank, et un
		// `<input type=number>` rendrait une chaîne vide sur un clavier français.
		await taper('25,5', 'Enter');
		await attendre(200);
		ok('« 25,5 » tapé à la virgule est retenu tel quel', (await valeur()) === 25.5, String(await valeur()));

		// (c) Et au point, le même quart de degré.
		await attendre(700);
		await doubleClic(surCurseur.x, surCurseur.y);
		await attendre(220);
		await taper('30.25', 'Enter');
		await attendre(200);
		ok('« 30.25 » tapé au point vaut exactement pareil', (await valeur()) === 30.25, String(await valeur()));

		// (d) Double-clic sur la VALEUR : même réglage vu de l'élève, donc même geste.
		await attendre(700);
		const surValeur = await cible('.val');
		await doubleClic(surValeur.x, surValeur.y);
		await attendre(220);
		ok('un double-clic sur la VALEUR ouvre la même saisie',
			(await saisieOuverte()) === 'ouverte', await saisieOuverte());

		// (e) Échap annule : la valeur d'avant est reprise, pas celle tapée.
		await taper('99', 'Escape');
		await attendre(200);
		ok('Échap referme SANS retenir ce qui était tapé',
			(await valeur()) === 30.25 && (await saisieOuverte()) === 'absente', String(await valeur()));

		// (f) Hors bornes : ramené dans la course, jamais refusé en silence.
		await attendre(700);
		await doubleClic(surCurseur.x, surCurseur.y);
		await attendre(220);
		await taper('900', 'Enter');
		await attendre(200);
		ok('une valeur hors course est ramenée à la borne (pas de champ muet)',
			(await valeur()) === 125, String(await valeur()));

		// (g) Un clic SIMPLE ne doit rien ouvrir : sinon le curseur serait inutilisable.
		await attendre(700);
		await ev(`(() => { const e = document.getElementById('banc-curseur');
			e.controlValue = 10; return true; })()`);
		await souris(surValeur.x, surValeur.y);
		await attendre(220);
		ok('un clic simple sur la valeur n ouvre RIEN',
			(await saisieOuverte()) === 'absente', await saisieOuverte());

		await ev(`(() => { document.getElementById('banc-curseur').remove(); return true; })()`);
	}
} catch (e) {
	// Sans ce filet, une exception (sélecteur disparu, éditeur non monté, page
	// morte) sortait par le `finally` SANS le moindre ❌ : le banc rendait 0
	// contrôle et passait pour vert. La contre-épreuve au `git stash` ne prouvait
	// alors plus rien. Une exception est désormais un ÉCHEC nommé.
	ok('le banc va jusqu au bout sans exception', false, (e && e.stack) || String(e));
} finally {
	try { ws?.close(); } catch { /* déjà fermé */ }
	proc.kill();
}

// Un banc qui n'a rien mesuré n'est pas un banc vert.
if (checks.length < 20) {
	ok('le banc a joué tous ses contrôles', false, `seulement ${checks.length} contrôle(s) exécuté(s)`);
}

const fail = checks.filter((c) => !c.ok).length;
console.log(fail ? `souris : ${fail} échec(s).` : `souris : ${checks.length} contrôles OK — gestes de souris réels.`);
process.exit(fail ? 1 : 0);
