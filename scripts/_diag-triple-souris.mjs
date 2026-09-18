// Diagnostic « propriétés triplées » à la VRAIE souris (CDP, port 9412).
// On pose un composant depuis la palette au geste réel (appui sur son bouton,
// déplacement, relâché sur la feuille), puis on mesure :
//   - combien de composants existent réellement dans le schéma ;
//   - combien de libellés et de contrôles l'inspecteur affiche ;
//   - ce que donne une désélection / resélection (le remède de Frank).
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-triple');
const PORT = 9412;

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/gbf-element.mjs';
import '../../src/webview/composants/oscillo-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
const editor = new Editor(document.getElementById('canvas'), document.getElementById('palette'),
	document.getElementById('wires'), document.getElementById('inspector'));
editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
window.editor = editor;
window.pret = true;
`;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

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
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }

const profil = join(CACHE, 'profil');
rmSync(profil, { recursive: true, force: true });
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--window-size=1400,1000',
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });

let ws = null;
try {
	let liste = null;
	for (let i = 0; i < 40 && !liste; i++) {
		try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
		catch { await attendre(250); }
	}
	if (!liste) throw new Error('Chrome ne répond pas');
	const cible = liste.find((c) => c.type === 'page');
	ws = new WebSocket(cible.webSocketDebuggerUrl);
	let id = 0;
	const attentes = new Map();
	ws.addEventListener('message', (e) => {
		const m = JSON.parse(e.data);
		if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
	});
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	const cdp = (method, params = {}) => new Promise((res) => {
		const n = ++id; attentes.set(n, res);
		ws.send(JSON.stringify({ id: n, method, params }));
	});
	const ev = async (expr) => {
		const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
		return r.result?.result?.value;
	};

	for (let i = 0; i < 40 && !(await ev('window.pret === true')); i++) await attendre(250);
	if (!(await ev('window.pret === true'))) throw new Error('éditeur non monté');

	const bouger = (x, y, buttons) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, button: buttons ? 'left' : 'none' });
	const presser = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
	const lacher = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });

	const etat = async () => JSON.parse(await ev(`(() => {
		const insp = document.getElementById('inspector');
		const labels = [...insp.querySelectorAll('.inspector__label')].map(l => (l.textContent||'').trim());
		const d = window.editor.serialize();
		return JSON.stringify({
			parts: d.parts.length,
			types: d.parts.map(p => p.type).join(','),
			h3: insp.querySelectorAll('h3').length,
			sub: insp.querySelectorAll('.inspector__subtitle').length,
			labels,
			ctrls: insp.querySelectorAll('.inspector__control, .inspector__checkbox').length,
		});
	})()`));

	// Le bouton de palette du type voulu : les boutons ne portent pas le type,
	// on le retrouve par le libellé du catalogue (title du bouton).
	const boutonDe = async (libelle) => JSON.parse(await ev(`(() => {
		const b = [...document.querySelectorAll('.palette__item')]
			.find(el => (el.title || '').toLowerCase() === ${JSON.stringify(libelle)}.toLowerCase());
		if (!b) return JSON.stringify(null);
		b.scrollIntoView({ block: 'center' });
		const r = b.getBoundingClientRect();
		return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) });
	})()`));

	// Toutes les sections de palette dépliées : un bouton dans une section repliée
	// n'a pas de position à l'écran, donc aucun geste possible dessus.
	await ev(`(() => { for (const h of document.querySelectorAll('.palette__section--collapsed')) h.click(); })()`);
	await attendre(300);

	for (const [type, libelle] of [['resistor', 'Resistor'], ['gbf', 'Function generator'],
		['oscillo', 'Oscilloscope'], ['sonde-logique', 'Logic probe']]) {
		const btn = await boutonDe(libelle);
		if (!btn) { console.log(`— ${type} : bouton de palette introuvable`); continue; }
		// Geste réel : appui sur la palette, glissé vers la feuille, relâché.
		await bouger(btn.x, btn.y, 0);
		await presser(btn.x, btn.y);
		for (let i = 1; i <= 8; i++) await bouger(btn.x + (500 - btn.x) * i / 8, btn.y + (400 - btn.y) * i / 8, 1);
		await lacher(500, 400);
		await attendre(400);
		const e1 = await etat();
		console.log(`${type} : parts=${e1.parts} [${e1.types}] h3=${e1.h3} sub=${e1.sub} ctrls=${e1.ctrls} labels=${e1.labels.length} → ${e1.labels.join(' | ')}`);
		// Remède de Frank : désélection / resélection.
		await ev('window.editor.select(null)');
		await attendre(120);
		await ev(`(() => { const d = window.editor.serialize(); const p = d.parts[d.parts.length-1]; window.editor.select({ kind: 'part', id: p.id }); })()`);
		await attendre(250);
		const e2 = await etat();
		if (e2.ctrls !== e1.ctrls || e2.labels.length !== e1.labels.length) {
			console.log(`   ⚠ APRÈS deselection/reselection : ctrls=${e2.ctrls} labels=${e2.labels.length} → ${e2.labels.join(' | ')}`);
		} else {
			console.log(`   = inchangé après deselection/reselection`);
		}
		// On repart d'une feuille vide pour le type suivant.
		await ev('window.editor.clear()');
		await attendre(200);
	}
} catch (e) {
	console.log('ERREUR : ' + (e && e.message));
} finally {
	try { ws && ws.close(); } catch { /* rien */ }
	proc.kill();
}
