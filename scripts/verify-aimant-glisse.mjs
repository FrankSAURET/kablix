// Banc à VRAIE souris : fixer un aimant en le glissant sur le palonnier d'un
// servo (piste 7, suite de D0 — ⏳ 11 de v2026.11.4.325).
//
// Jusqu'ici « Fixé sur » ne se remplissait qu'au clavier, dans l'inspecteur. Le
// geste se résout au `pointerup` (comme la pose d'une sonde) : c'est un GESTE,
// donc il se prouve avec des événements émis par Chrome lui-même (CDP,
// `Input.dispatchMouseEvent`), jamais avec des `PointerEvent` fabriqués (voir
// l'en-tête de verify-souris.mjs, lots .71/.72).
//
// Contrôlé :
//   1. règles pures de `mountAfterDrop` (palonnier, corps du porteur, vide,
//      repère inconnu) ;
//   2. aimant libre lâché sur le palonnier d'Act1 → fixé sur Act1, cadre vert
//      sur le palonnier PENDANT le geste, élément et inspecteur à jour ;
//   3. reposé sur le corps d'Act1 hors palonnier → reste fixé sur Act1 ;
//   4. lâché sur le palonnier d'Act2 → passe sur Act2 ;
//   5. reposé dans le vide → détaché, cadre retiré ;
//   6. aimant fixé sur un repère absent, reposé dans le vide → inchangé ;
//   7. servo tourné de 90° : le palonnier mesuré sur le dessin reste la cible.
//
// Contre-épreuve : neutraliser l'appel à `poserAimant` dans editor.mts — le
// banc DOIT échouer.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-aimant-glisse');
// Port distinct de verify-souris (9411) : les deux bancs peuvent tourner ensemble.
const PORT = 9412;

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/aimant-element.mjs';
import { mountAfterDrop } from '../../src/webview/diagram/montage.mjs';
const canvas = document.getElementById('canvas');
const editor = new Editor(canvas, document.getElementById('palette'),
	document.getElementById('wires'), document.getElementById('inspector'));
editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
window.editor = editor;
window.mountAfterDrop = mountAfterDrop;
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

const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }

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
	if (!liste) throw new Error('Chrome ne répond pas sur le port de mise au point');
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

	// --- 1. Règles pures ------------------------------------------------------
	const pur = JSON.parse(await ev(`(() => {
		const z = [
			{ carrierId: 'Act1', horn: { x: 100, y: 100, w: 20, h: 20 }, body: { x: 50, y: 50, w: 120, h: 120 } },
			{ carrierId: 'Act2', horn: { x: 400, y: 100, w: 20, h: 20 }, body: { x: 350, y: 50, w: 120, h: 120 } },
		];
		const f = window.mountAfterDrop;
		return JSON.stringify({
			surHorn: f({ x: 110, y: 110 }, z, ''),
			bordHorn: f({ x: 124, y: 110 }, z, ''),
			corpsGarde: f({ x: 60, y: 160 }, z, 'Act1'),
			corpsAutre: f({ x: 60, y: 160 }, z, 'Act2'),
			vide: f({ x: 900, y: 900 }, z, 'Act1'),
			inconnu: f({ x: 900, y: 900 }, z, 'S9'),
			change: f({ x: 410, y: 110 }, z, 'Act1'),
		});
	})()`));
	ok('pur : centre sur le palonnier → fixé', pur.surHorn === 'Act1', JSON.stringify(pur));
	ok('pur : à 4 mm du bord du palonnier → fixé (tolérance 5)', pur.bordHorn === 'Act1', JSON.stringify(pur));
	ok('pur : sur le corps de SON porteur → gardé', pur.corpsGarde === 'Act1', JSON.stringify(pur));
	ok('pur : sur le corps d un AUTRE servo (hors palonnier) → détaché', pur.corpsAutre === '', JSON.stringify(pur));
	ok('pur : dans le vide → détaché', pur.vide === '', JSON.stringify(pur));
	ok('pur : repère inconnu → inchangé', pur.inconnu === 'S9', JSON.stringify(pur));
	ok('pur : palonnier d un autre servo → change de porteur', pur.change === 'Act2', JSON.stringify(pur));

	// --- Feuille : deux servos, un aimant libre --------------------------------
	const charger = async (parts) => {
		await ev(`(() => { window.editor.loadDiagram({ parts: ${JSON.stringify(parts)}, wires: [] });
			window.editor.setCamera({ zoom: 1, panX: 0, panY: 0 }); })()`);
		await attendre(500);
	};
	await charger([
		{ id: 'Act1', type: 'servo', x: 200, y: 150, attrs: {} },
		{ id: 'Act2', type: 'servo', x: 600, y: 150, attrs: {} },
		{ id: 'A1', type: 'aimant', x: 300, y: 600, attrs: {} },
	]);

	const mount = () => ev(`(() => { const p = window.editor.serialize().parts.find((x) => x.id === 'A1');
		return p.attrs?.mount ?? ''; })()`);
	const attrEl = () => ev(`window.editor.elementOf('A1').getAttribute('mount') ?? ''`);
	// Centres ÉCRAN mesurés sur le dessin : palonnier (boîte de #horn-rot),
	// aimant (centre de son svg).
	const centreHorn = async (sid) => JSON.parse(await ev(`(() => {
		const r = window.editor.elementOf('${sid}').hornClientRect();
		return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }); })()`));
	const centreAimant = async () => JSON.parse(await ev(`JSON.stringify(window.editor.elementOf('A1').centerClient())`));
	// Point du corps du servo LOIN du palonnier (≥ 20 px de sa boîte) : cherché
	// sur la boîte du conteneur, pas supposé.
	const pointCorps = async (sid) => JSON.parse(await ev(`(() => {
		const el = window.editor.elementOf('${sid}');
		const h = el.hornClientRect();
		const c = el.closest('.part').getBoundingClientRect();
		for (let y = c.top + 15; y < c.bottom - 15; y += 5) for (let x = c.left + 15; x < c.right - 15; x += 5) {
			if (x < h.left - 20 || x > h.right + 20 || y < h.top - 20 || y > h.bottom + 20) return JSON.stringify({ x, y });
		}
		return 'null'; })()`));

	// Glisser RÉEL de l'aimant : saisi par son centre, lâché quand son centre est
	// sur la cible. `avantLacher` lit l'état de la page juste avant le relâché.
	const glisser = async (vers, avantLacher) => {
		const de = await centreAimant();
		const a = { x: Math.round(de.x), y: Math.round(de.y) };
		const z = { x: Math.round(vers.x), y: Math.round(vers.y) };
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'left', buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
		for (const k of [0.2, 0.4, 0.6, 0.8, 1]) {
			await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
				x: Math.round(a.x + (z.x - a.x) * k), y: Math.round(a.y + (z.y - a.y) * k) });
		}
		await attendre(60);
		const vu = avantLacher ? await avantLacher() : null;
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z.x, y: z.y, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(300);
		return vu;
	};
	const cadre = () => ev(`(() => { const d = document.querySelector('.mount-target');
		return d ? d.dataset.carrier : ''; })()`);

	ok('l aimant part libre', (await mount()) === '', await mount());
	const h1 = await centreHorn('Act1');
	ok('le palonnier d Act1 est mesurable', h1.w > 0 && h1.h > 0, JSON.stringify(h1));

	// --- 2. Sur le palonnier d'Act1 -------------------------------------------
	const vuPendant = await glisser(h1, cadre);
	ok('pendant le geste, le palonnier visé s entoure (cadre sur Act1)', vuPendant === 'Act1', vuPendant);
	ok('lâché sur le palonnier : fixé sur Act1', (await mount()) === 'Act1', await mount());
	ok('l élément dessiné porte mount=Act1 (maillon visible)', (await attrEl()) === 'Act1', await attrEl());
	ok('le cadre disparaît au lâcher', (await cadre()) === '', await cadre());
	const inspecteur = JSON.parse(await ev(`JSON.stringify({
		vu: [...document.querySelectorAll('#inspector input, #inspector textarea')].some((i) => i.value === 'Act1'),
		titres: document.querySelectorAll('#inspector .inspector__subtitle').length })`));
	ok('l inspecteur montre « Fixé sur » = Act1, une seule fois', inspecteur.vu && inspecteur.titres === 1, JSON.stringify(inspecteur));

	// --- 3. Sur le corps d'Act1, hors palonnier --------------------------------
	const corps = await pointCorps('Act1');
	ok('un point du corps d Act1 loin du palonnier existe', !!corps, JSON.stringify(corps));
	if (corps) {
		const vu = await glisser(corps, cadre);
		ok('sur le corps : pas de cadre (aucun palonnier visé)', vu === '', vu);
		ok('reposé sur le corps de son servo : reste fixé sur Act1', (await mount()) === 'Act1', await mount());
	}

	// --- 4. Sur le palonnier d'Act2 -------------------------------------------
	const vu2 = await glisser(await centreHorn('Act2'), cadre);
	ok('pendant le geste vers Act2, le cadre est sur Act2', vu2 === 'Act2', vu2);
	ok('lâché sur le palonnier d Act2 : passe sur Act2', (await mount()) === 'Act2', await mount());

	// --- 5. Dans le vide ------------------------------------------------------
	const vide = JSON.parse(await ev(`(() => { const b = document.querySelector('.canvas__world').getBoundingClientRect();
		return JSON.stringify({ x: b.left + 450, y: b.top + 650 }); })()`));
	const vu3 = await glisser(vide, cadre);
	ok('dans le vide : pas de cadre', vu3 === '', vu3);
	ok('reposé dans le vide : détaché', (await mount()) === '', await mount());
	ok('l élément dessiné n a plus de mount', (await attrEl()) === '', await attrEl());

	// --- 6. Repère inconnu ----------------------------------------------------
	await charger([
		{ id: 'Act1', type: 'servo', x: 200, y: 150, attrs: {} },
		{ id: 'A1', type: 'aimant', x: 300, y: 600, attrs: { mount: 'S9' } },
	]);
	await glisser(JSON.parse(await ev(`(() => { const b = document.querySelector('.canvas__world').getBoundingClientRect();
		return JSON.stringify({ x: b.left + 500, y: b.top + 700 }); })()`)));
	ok('fixé sur un repère absent, reposé dans le vide : inchangé (S9)', (await mount()) === 'S9', await mount());

	// --- 7. Servo tourné de 90° -----------------------------------------------
	await charger([
		{ id: 'Act1', type: 'servo', x: 300, y: 200, rotation: 90, attrs: {} },
		{ id: 'A1', type: 'aimant', x: 300, y: 650, attrs: {} },
	]);
	const h7 = await centreHorn('Act1');
	await glisser(h7);
	ok('servo tourné de 90° : lâché sur son palonnier → fixé', (await mount()) === 'Act1', `${await mount()} ${JSON.stringify(h7)}`);
} catch (e) {
	ok('le banc va jusqu au bout sans exception', false, (e && e.stack) || String(e));
} finally {
	try { ws?.close(); } catch { /* déjà fermé */ }
	proc.kill();
}

if (checks.length < 24) {
	ok('le banc a joué tous ses contrôles', false, `seulement ${checks.length} contrôle(s) exécuté(s)`);
}
const fail = checks.filter((c) => !c.ok).length;
console.log(fail ? `aimant-glisse : ${fail} échec(s).` : `aimant-glisse : ${checks.length} contrôles OK — geste à la vraie souris.`);
process.exit(fail ? 1 : 0);
