// Banc de l'aimant fixé sur un servo (piste 7, lot D0 de la piste 11).
//
// Vrais éléments <kablix-servo>, <kablix-aimant>, <kablix-hall> en Chrome
// headless, et VRAIE logique de simulation (MontageSim, montage-sim.mts). Seul
// l'éditeur est remplacé par un monde minimal (conteneurs `.part`, translation
// + zoom, rotation et miroir du corps comme dans editor.mts) : ce qu'on éprouve,
// c'est que l'aimant suit le palonnier DESSINÉ — rotation, miroir et zoom
// compris — et que le capteur Hall le voit passer.
//
// On mesure les positions RÉELLES à l'écran (getScreenCTM), pas les propriétés.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-aimant');

const entry = `
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/aimant-element.mjs';
import '../../src/webview/composants/hall-element.mjs';
import { CATALOG, partCategory } from '../../src/webview/diagram/catalog.mjs';
import { refFamily } from '../../src/webview/diagram/refnames.mjs';
import { mountLinks, aimantGap, hallSeesAimant, angleDelta } from '../../src/webview/diagram/montage.mjs';
import { MontageSim } from '../../src/webview/montage-sim.mjs';
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
const fmt = (p) => p ? '(' + p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ')' : 'null';

/** Monde minimal : même empilement que l'éditeur (canvas > monde > .part > .part__body > élément). */
function makeWorld({ zoom = 1, panX = 0, panY = 0 } = {}) {
	const canvas = document.createElement('div');
	canvas.style.cssText = 'position:relative;width:1200px;height:900px;overflow:hidden';
	const world = document.createElement('div');
	world.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0';
	world.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
	canvas.appendChild(world);
	document.body.appendChild(canvas);
	const parts = new Map();
	const faults = [];
	const ed = {
		elementOf: (id) => parts.get(id)?.el,
		clientToWorld(cx, cy) {
			const r = canvas.getBoundingClientRect();
			return { x: (cx - r.left - canvas.clientLeft - panX) / zoom, y: (cy - r.top - canvas.clientTop - panY) / zoom };
		},
		// Copie de Editor.setSimPose (editor.mts).
		setSimPose(id, dx, dy, deg) {
			const c = parts.get(id)?.container;
			if (!c) return;
			if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 && Math.abs(deg) < 0.01) {
				c.style.transform = ''; c.style.transformOrigin = ''; return;
			}
			const body = c.querySelector('.part__body');
			c.style.transformOrigin = (body.offsetLeft + body.offsetWidth / 2) + 'px ' + (body.offsetTop + body.offsetHeight / 2) + 'px';
			c.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + deg + 'deg)';
		},
		setFaulty: (id, on, note) => faults.push({ id, on, note }),
	};
	async function add(id, tag, x, y, { attrs = {}, rotation = 0, flipH = false } = {}) {
		const container = document.createElement('div');
		container.className = 'part';
		container.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px';
		const body = document.createElement('div');
		body.className = 'part__body';
		body.style.cssText = 'display:inline-block;line-height:0;transform-origin:center center';
		const tf = [];
		if (flipH) tf.push('scale(-1, 1)');
		if (rotation) tf.push('rotate(' + rotation + 'deg)');
		body.style.transform = tf.join(' ');
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
		body.appendChild(el);
		container.appendChild(body);
		world.appendChild(container);
		await el.updateComplete;
		parts.set(id, { container, el });
		return el;
	}
	const move = (id, x, y) => {
		const c = parts.get(id).container;
		c.style.left = x + 'px'; c.style.top = y + 'px';
	};
	return { canvas, ed, add, move, faults, remove: () => canvas.remove() };
}

/** Pose le servo à un angle (vitesse nulle : instantané) puis rejoue une frame. */
async function turn(servo, sim, deg) {
	servo.angle = deg;
	await servo.updateComplete;
	sim.update();
	await new Promise((r) => setTimeout(r, 0)); // rAF quasi mort sous --dump-dom
}

async function scenario(label, opts) {
	const W = makeWorld(opts.world);
	const diagram = {
		parts: [
			{ id: 'S1', type: 'servo', x: 300, y: 200 },
			{ id: 'A1', type: 'aimant', x: 0, y: 0, attrs: { mount: 'S1' } },
			{ id: 'Capt1', type: 'hall', x: 0, y: 0 },
		],
		wires: [],
	};
	const servo = await W.add('S1', 'kablix-servo', 300, 200, { attrs: { speed: '0' }, rotation: opts.rotation ?? 0, flipH: !!opts.flipH });
	// Aimant posé SUR le palonnier : à 25 px de l'axe dans le repère du palonnier.
	const m0 = servo.hornMatrix();
	const aim = await W.add('A1', 'kablix-aimant', 0, 0, { attrs: { mount: 'S1' } });
	// Centre de l'aimant voulu : un point du palonnier, 25 px à droite de son axe.
	const hornG = servo.renderRoot.querySelector('#horn-rot');
	const rm = /rotate\\(\\s*[\\d.\\-]+\\s+([\\d.\\-]+)\\s+([\\d.\\-]+)/.exec(hornG.getAttribute('transform'));
	const axisLocal = { x: Number(rm[1]), y: Number(rm[2]) };
	const want = new DOMPoint(axisLocal.x + 25, axisLocal.y).matrixTransform(m0);
	const wantW = W.ed.clientToWorld(want.x, want.y);
	const c0 = aim.centerClient();
	const c0W = W.ed.clientToWorld(c0.x, c0.y);
	W.move('A1', wantW.x - c0W.x, wantW.y - c0W.y);
	const axisS = new DOMPoint(axisLocal.x, axisLocal.y).matrixTransform(m0);
	const axisWorld = W.ed.clientToWorld(axisS.x, axisS.y);

	const hall = await W.add('Capt1', 'kablix-hall', 0, 0, { attrs: { trigger: '10' } });
	hall.simulating = true;
	const sim = new MontageSim();
	const said = [];
	// Capteur posé plus tard, une fois connue la position de l'aimant à 90°.
	sim.start(diagram, [hall], W.ed, (m) => said.push(m));
	ok(label + ' : aucun message au lancement', said.length === 0, said.join(' | '));
	ok(label + ' : le Hall passe en mode « vrais aimants »', hall.external === true);

	const at = () => W.ed.clientToWorld(aim.centerClient().x, aim.centerClient().y);
	await turn(servo, sim, 0);
	const p0 = at();
	ok(label + ' : à 0°, l\\'aimant reste où il a été posé', near(p0.x, wantW.x) && near(p0.y, wantW.y), fmt(p0) + ' vs ' + fmt(wantW));
	await turn(servo, sim, 90);
	const p90 = at();
	await turn(servo, sim, 180);
	const p180 = at();
	const r0 = Math.hypot(p0.x - axisWorld.x, p0.y - axisWorld.y);
	const r90 = Math.hypot(p90.x - axisWorld.x, p90.y - axisWorld.y);
	const r180 = Math.hypot(p180.x - axisWorld.x, p180.y - axisWorld.y);
	ok(label + ' : l\\'aimant reste à la même distance de l\\'axe', near(r0, r90, 0.8) && near(r0, r180, 0.8), [r0, r90, r180].map((r) => r.toFixed(2)).join(' / '));
	ok(label + ' : à 180°, l\\'aimant est à l\\'opposé (symétrique par l\\'axe)',
		near((p0.x + p180.x) / 2, axisWorld.x, 0.8) && near((p0.y + p180.y) / 2, axisWorld.y, 0.8), fmt(p0) + ' ' + fmt(p180) + ' axe ' + fmt(axisWorld));
	const cross = (p0.x - axisWorld.x) * (p90.y - axisWorld.y) - (p0.y - axisWorld.y) * (p90.x - axisWorld.x);
	ok(label + ' : sens de rotation ' + (opts.flipH ? 'inversé par le miroir' : 'horaire à l\\'écran'), opts.flipH ? cross < 0 : cross > 0, cross.toFixed(1));
	const tf = getComputedStyle(aim.parentElement.parentElement).transform;
	ok(label + ' : l\\'aimant tourne avec le palonnier', tf !== 'none', tf);

	// Capteur : face posée 12 mm (bord à bord ≈ 2 mm) de la position à 90°.
	await turn(servo, sim, 0);
	const f = hall.faceClient();
	const fW = W.ed.clientToWorld(f.x, f.y);
	W.move('Capt1', p90.x + 12 - fW.x, p90.y - fW.y);
	sim.update();
	ok(label + ' : servo à 0°, aimant loin → le Hall ne voit rien', hall.field === false && hall.near === false);
	await turn(servo, sim, 90);
	ok(label + ' : servo à 90°, aimant devant la face → le Hall commute', hall.field === true && hall.near === true);
	await hall.updateComplete;
	ok(label + ' : cercle de champ dessiné sur le capteur', !!hall.renderRoot.querySelector('.field'));
	ok(label + ' : plus d\\'aimant glissant de démonstration', !hall.renderRoot.querySelector('.magnet'));
	await turn(servo, sim, 180);
	ok(label + ' : servo à 180° → le Hall relâche', hall.field === false);
	sim.reset();
	W.remove();
}

async function run() {
	// --- 1. Catalogue et repères ----------------------------------------------
	const def = CATALOG.find((p) => p.type === 'aimant');
	ok('catalogue : aimant présent, sans broche', def?.pinless === true && def?.tag === 'kablix-aimant');
	ok('catalogue : propriété « Fixé sur »', def?.props?.some((p) => p.attr === 'mount' && p.kind === 'text'));
	ok('catalogue : rangé dans « Divers »', partCategory(def) === 'Misc', partCategory(def));
	ok('repère : famille aimant (A1 / MAG1)', refFamily('aimant') === 'magnet', refFamily('aimant'));

	// --- 2. Liens de montage (logique pure) ------------------------------------
	const d = { wires: [], parts: [
		{ id: 'S1', type: 'servo', x: 0, y: 0 },
		{ id: 'R1', type: 'resistor', x: 0, y: 0 },
		{ id: 'A1', type: 'aimant', x: 0, y: 0, attrs: { mount: 'S1' } },
		{ id: 'A2', type: 'aimant', x: 0, y: 0, attrs: { mount: 'S9' } },
		{ id: 'A3', type: 'aimant', x: 0, y: 0, attrs: { mount: ' R1 ' } },
		{ id: 'A4', type: 'aimant', x: 0, y: 0, attrs: { mount: '' } },
		{ id: 'A5', type: 'aimant', x: 0, y: 0, attrs: { mount: 'A5' } },
	] };
	const { links, problems } = mountLinks(d);
	ok('montage : A1 fixé sur S1', links.length === 1 && links[0].partId === 'A1' && links[0].carrierId === 'S1', JSON.stringify(links));
	ok('montage : repère absent signalé', problems.some((p) => p.partId === 'A2' && p.reason === 'missing'));
	ok('montage : une résistance ne porte rien (espaces ignorés)', problems.some((p) => p.partId === 'A3' && p.reason === 'not-carrier'));
	ok('montage : aimant libre ni lié ni signalé', !links.some((l) => l.partId === 'A4') && !problems.some((p) => p.partId === 'A4'));
	ok('montage : fixé sur lui-même refusé', problems.some((p) => p.partId === 'A5'));

	// --- 3. Champ binaire ------------------------------------------------------
	ok('champ : collé (centres à 10 mm) → écart 0', aimantGap({ x: 0, y: 0 }, { x: 10, y: 0 }) === 0);
	ok('champ : centres à 25 mm → écart 15 mm', near(aimantGap({ x: 0, y: 0 }, { x: 15, y: 20 }), 15, 1e-9));
	ok('champ : à 10 mm du seuil, commute', hallSeesAimant({ x: 0, y: 0 }, [{ x: 20, y: 0 }], 10));
	ok('champ : à 11 mm, ne commute pas', !hallSeesAimant({ x: 0, y: 0 }, [{ x: 21, y: 0 }], 10));
	ok('champ : un aimant sur deux suffit', hallSeesAimant({ x: 0, y: 0 }, [{ x: 99, y: 0 }, { x: 0, y: 12 }], 10));
	ok('angle : écart ramené dans ]-180, 180]', angleDelta(170, -170) === 20 && angleDelta(-170, 170) === -20);

	// --- 4. Capteur Hall : modes démonstration / vrais aimants ------------------
	const h = document.createElement('kablix-hall');
	document.body.appendChild(h);
	h.simulating = true; h.distance = 5; h.trigger = 10;
	await h.updateComplete;
	ok('Hall seul : aimant glissant affiché et proche → commute', !!h.renderRoot.querySelector('.magnet') && h.near === true);
	h.external = true;
	await h.updateComplete;
	ok('Hall + aimants de la feuille : aimant glissant masqué et ignoré', !h.renderRoot.querySelector('.magnet') && h.near === false);
	h.field = true;
	ok('Hall + aimant à portée → commute', h.near === true);
	h.remove();

	// --- 5. De bout en bout : servo, aimant porté, Hall --------------------------
	await scenario('droit, zoom 1', { world: { zoom: 1 } });
	await scenario('tourné 90° + miroir, zoom 1,7', { world: { zoom: 1.7, panX: -140, panY: -60 }, rotation: 90, flipH: true });

	// --- 6. Fixé sur un repère absent : dit, cadre rouge, aimant immobile -------
	const W = makeWorld();
	await W.add('A2', 'kablix-aimant', 50, 50, { attrs: { mount: 'S7' } });
	const said = [];
	const sim = new MontageSim();
	sim.start({ wires: [], parts: [{ id: 'A2', type: 'aimant', x: 50, y: 50, attrs: { mount: 'S7' } }] }, [], W.ed, (m) => said.push(m));
	ok('repère absent : message nommant l\\'aimant et le repère', said.length === 1 && said[0].includes('A2') && said[0].includes('S7'), said.join(' | '));
	ok('repère absent : cadre rouge posé', W.faults.some((f) => f.id === 'A2' && f.on));
	sim.reset();
	ok('arrêt : cadre rouge retiré', W.faults.some((f) => f.id === 'A2' && !f.on));
	W.remove();

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([...checks, { name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
	document.body.appendChild(out);
});
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `aimant : ${fail} échec(s).` : `aimant : ${rows.length} contrôles OK — l'aimant suit le palonnier, le Hall le voit.`);
process.exit(fail ? 1 : 0);
