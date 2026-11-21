// Banc : les schémas de test `aimant-uno` et `aimant-pico` sont bien disposés
// (⏳ 12 de v2026.11.4.325 : emplacements calculés à la main, jamais mesurés).
//
// Les VRAIS fichiers .projix de testkablix/ sont ouverts dans le VRAI Editor
// (vraie feuille media/styles.css, Chrome headless), puis la VRAIE MontageSim
// est lancée comme le fait sim.mts. Le servo est tourné à 0°, 90° puis 180°
// (les trois consignes des programmes de test). Contrôlé, sur chaque schéma :
// - l'aimant touche le palonnier dessiné (même règle que le geste de fixation :
//   `hornUnder`, tolérance de la demi-épaisseur de l'aimant) ;
// - aucun problème de montage au lancement ;
// - le capteur Hall ne voit l'aimant qu'à 90° (ce qu'annoncent les programmes) ;
// - l'aimant ne chevauche pas le capteur à 90° (aimant posé PAR-DESSUS le
//   boîtier = disposition fausse même si le Hall commute).
//
// Contre-épreuve : décaler l'aimant dans le schéma chargé (`DECALE=1`) — le
// banc DOIT échouer.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-aimant-tests');

const TESTS = {
	'aimant-uno': join(ROOT, 'testkablix', 'Arduino', 'aimant-uno', 'aimant-uno.projix'),
	'aimant-pico': join(ROOT, 'testkablix', 'aimant-pico.projix'),
};
const diagrams = {};
for (const [name, file] of Object.entries(TESTS)) {
	const zip = await JSZip.loadAsync(readFileSync(file));
	const d = JSON.parse(await zip.file('diagram.json').async('string'));
	if (process.env.DECALE) for (const p of d.parts) if (p.type === 'aimant') p.x += 40;
	diagrams[name] = d;
}

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/aimant-element.mjs';
import '../../src/webview/composants/hall-element.mjs';
import { mountLinks, hornUnder } from '../../src/webview/diagram/montage.mjs';
import { MontageSim } from '../../src/webview/montage-sim.mjs';
const DIAGRAMS = ${JSON.stringify(diagrams)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const fmt = (p) => p ? '(' + p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ')' : 'null';

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function scenario(name, diagram) {
	// Un atelier neuf par schéma : deux Editor sur le même canevas se gêneraient.
	document.querySelector('.workshop')?.remove();
	const ws = document.createElement('div');
	ws.className = 'workshop';
	ws.innerHTML = '<aside class="palette"></aside><div class="canvas" style="width:1400px;height:900px">' +
		'<svg class="wires"></svg></div><aside class="inspector"></aside>';
	document.body.appendChild(ws);
	const canvas = ws.querySelector('.canvas');
	const editor = new Editor(canvas, ws.querySelector('.palette'), ws.querySelector('.wires'), ws.querySelector('.inspector'));
	editor.loadDiagram(diagram);
	await wait(800);
	const aimantP = diagram.parts.find((p) => p.type === 'aimant');
	const hallP = diagram.parts.find((p) => p.type === 'hall');
	const servoId = aimantP?.attrs?.mount;
	ok(name + ' : un aimant fixé sur un servo, un capteur Hall', aimantP && hallP && diagram.parts.some((p) => p.id === servoId && p.type === 'servo'));
	const servo = editor.elementOf(servoId), aim = editor.elementOf(aimantP.id), hall = editor.elementOf(hallP.id);
	servo.speed = 0;
	await servo.updateComplete;

	// 1. Au repos, tel que dessiné : l'aimant touche le palonnier.
	const c = aim.centerClient();
	const cW = editor.clientToWorld(c.x, c.y);
	const zones = editor.mountZones(aimantP.id);
	const hit = hornUnder(cW, zones);
	const horn = zones.find((z) => z.carrierId === servoId)?.horn;
	ok(name + ' : l aimant touche le palonnier dessiné', hit === servoId,
		'centre ' + fmt(cW) + ' palonnier ' + (horn ? JSON.stringify({ x: +horn.x.toFixed(1), y: +horn.y.toFixed(1), w: +horn.w.toFixed(1), h: +horn.h.toFixed(1) }) : 'absent'));
	// Relevé (affiché, non contrôlé) : axe du palonnier et coin du composant, pour
	// recaler la spec si un contrôle échoue.
	const hornG = servo.renderRoot.querySelector('#horn-rot');
	const rm = /rotate\\(\\s*[\\d.\\-]+\\s+([\\d.\\-]+)\\s+([\\d.\\-]+)/.exec(hornG?.getAttribute('transform') ?? '');
	if (rm) {
		const ax = new DOMPoint(Number(rm[1]), Number(rm[2])).matrixTransform(servo.hornMatrix());
		const axW = editor.clientToWorld(ax.x, ax.y);
		const hc = hall.faceClient(), hW = editor.clientToWorld(hc.x, hc.y);
		checks.push({ name: name + ' : relevé axe ' + fmt(axW) + ', aimant ' + fmt(cW) + ', face du Hall ' + fmt(hW) + ', Hall posé ' + fmt(hallP), ok: true, detail: '' });
	}
	const { problems } = mountLinks(editor.diagram);
	ok(name + ' : aucun problème de montage', problems.length === 0, JSON.stringify(problems));

	// 2. Simulation : la vraie MontageSim, servo tourné comme par le programme.
	hall.simulating = true;
	const sim = new MontageSim();
	const said = [];
	sim.start(editor.diagram, [hall], editor, (m) => said.push(m));
	ok(name + ' : aucun message au lancement', said.length === 0, said.join(' | '));
	const vu = {};
	const gap = {};
	for (const deg of [0, 90, 180]) {
		servo.angle = deg;
		await servo.updateComplete;
		sim.update();
		await wait(0);
		vu[deg] = hall.field;
		const a = aim.centerClient(), f = hall.faceClient();
		const aW = editor.clientToWorld(a.x, a.y), fW = editor.clientToWorld(f.x, f.y);
		gap[deg] = Math.hypot(aW.x - fW.x, aW.y - fW.y) - 10;
		if (deg === 90) {
			// Corps du TO-92 : 16 mm de large centré sur la face, du haut de
			// l'élément à 14,65 mm sous la face (hall-element.mts : FACE, BODY_RIGHT).
			// Barreau seul (20 × 10, debout à 90°) : la boîte de l'élément compte
			// aussi l'anneau « fixé », plus large que le barreau.
			const aBox = { x: aW.x - 5, y: aW.y - 10, w: 10, h: 20 };
			const top = editor.clientToWorld(0, hall.getBoundingClientRect().top).y;
			const body = { x: fW.x - 8, y: top, w: 16, h: fW.y + 14.65 - top };
			const inter = overlap(aBox, body) ? Math.min(aBox.x + aBox.w - body.x, body.x + body.w - aBox.x) : 0;
			ok(name + ' : à 90°, l aimant ne recouvre pas le boîtier du capteur', inter <= 0.5,
				'aimant ' + JSON.stringify(aBox) + ' boîtier ' + JSON.stringify(body));
		}
	}
	const g = (d) => d + '° ' + gap[d].toFixed(1) + ' mm';
	ok(name + ' : à 0°, le Hall ne voit rien', vu[0] === false, g(0));
	ok(name + ' : à 90°, le Hall voit l aimant', vu[90] === true, g(90) + ' (seuil ' + hall.trigger + ' mm)');
	ok(name + ' : à 180°, le Hall ne voit rien', vu[180] === false, g(180));
	checks.push({ name: name + ' : écarts bord à bord ' + [0, 90, 180].map(g).join(', '), ok: true, detail: '' });
	sim.reset();
	editor.setLocked?.(false);
}

async function run() {
	for (const [name, d] of Object.entries(DIAGRAMS)) await scenario(name, d);
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
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1400px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1800,1000', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `aimant-tests : ${fail} échec(s).` : `aimant-tests : ${rows.length} contrôles OK — aimant-uno et aimant-pico bien disposés.`);
process.exit(fail ? 1 : 0);
