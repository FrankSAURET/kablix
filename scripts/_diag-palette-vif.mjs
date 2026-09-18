// Diagnostic : deux appuis sur la palette AVANT le relâché. `startPlaceFromPalette`
// ne teste pas `placingFromPalette` : un second pointerdown crée un second
// composant, et les deux jeux d'écouteurs window restent en place.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-diag-vif');
const PORT = 9413;

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/resistor-element.mjs';
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

	const bouger = (x, y, buttons) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, button: buttons ? 'left' : 'none' });
	const presser = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
	const lacher = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });

	await ev(`(() => { for (const h of document.querySelectorAll('.palette__section--collapsed')) h.click(); })()`);
	await attendre(300);
	const btn = JSON.parse(await ev(`(() => {
		const b = [...document.querySelectorAll('.palette__item')].find(el => (el.title||'') === 'Resistor');
		b.scrollIntoView({ block: 'center' });
		const r = b.getBoundingClientRect();
		return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) });
	})()`));

	const compte = async () => JSON.parse(await ev(`(() => {
		const d = window.editor.serialize();
		const insp = document.getElementById('inspector');
		return JSON.stringify({
			parts: d.parts.length,
			pos: d.parts.map(p => p.type + '@' + Math.round(p.x) + ',' + Math.round(p.y)).join(' '),
			labels: [...insp.querySelectorAll('.inspector__label')].map(l => (l.textContent||'').trim()).join(' | '),
			sub: (insp.querySelector('.inspector__subtitle')||{}).textContent || '',
		});
	})()`));

	// --- Cas A : DEUX appuis sur le bouton avant le moindre relâché -------------
	await bouger(btn.x, btn.y, 0);
	await presser(btn.x, btn.y);
	await attendre(30);
	await presser(btn.x, btn.y);          // second appui, aucun relâché entre-temps
	await attendre(30);
	await presser(btn.x, btn.y);          // troisième
	await attendre(30);
	for (let i = 1; i <= 6; i++) await bouger(btn.x + (500 - btn.x) * i / 6, btn.y + (400 - btn.y) * i / 6, 1);
	await lacher(500, 400);
	await attendre(500);
	const a = await compte();
	console.log(`CAS A (3 appuis, 1 relâché) : parts=${a.parts} — ${a.pos}`);
	console.log(`   sous-titre inspecteur : ${a.sub}`);
	console.log(`   libellés : ${a.labels}`);

	await ev('window.editor.clear()');
	await attendre(200);

	// --- Cas B : trois clics secs rapides sur le bouton (pose au centre) --------
	for (let i = 0; i < 3; i++) {
		await bouger(btn.x, btn.y, 0);
		await presser(btn.x, btn.y);
		await lacher(btn.x, btn.y);
		await attendre(40);
		// Ce que voit le décalage : centres mesurés des composants déjà posés.
		console.log('   après clic ' + (i + 1) + ' : ' + await ev(`(() => {
			const d = window.editor.serialize();
			const corps = [...document.querySelectorAll('.part .part__body')];
			return d.parts.map((p, n) => {
				const b = corps[n];
				return p.type + ' coin=' + Math.round(p.x) + ',' + Math.round(p.y)
					+ ' taille=' + (b ? b.offsetWidth + 'x' + b.offsetHeight : 'absent');
			}).join(' | ');
		})()`));
	}
	await attendre(500);
	const c = await compte();
	console.log(`CAS B (3 clics secs) : parts=${c.parts} — ${c.pos}`);
	console.log(`   sous-titre inspecteur : ${c.sub}`);
	console.log(`   libellés : ${c.labels}`);
} catch (e) {
	console.log('ERREUR : ' + (e && e.message));
} finally {
	try { ws && ws.close(); } catch { /* rien */ }
	proc.kill();
}
