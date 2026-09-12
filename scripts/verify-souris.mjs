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
//   7. un clic droit quitte le mode étiquette sans en poser une.
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
} finally {
	try { ws?.close(); } catch { /* déjà fermé */ }
	proc.kill();
}

const fail = checks.filter((c) => !c.ok).length;
console.log(fail ? `souris : ${fail} échec(s).` : `souris : ${checks.length} contrôles OK — gestes de souris réels.`);
process.exit(fail ? 1 : 0);
