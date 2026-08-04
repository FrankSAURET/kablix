// Test de régression : couleur automatique des fils (v2026.7.262).
// Vrai Editor en Chrome headless. Le point testé : un CI enfiché sur une
// platine d'essai AMÈNE son VCC / sa masse à toute la bande de trous — un fil
// planté dans un autre trou de cette bande doit donc naître rouge (ou noir),
// alors qu'avant il ne regardait que le rôle de SES DEUX extrémités et sortait
// en couleur de nappe. Contrôles inverses : une bande de signal reste en nappe,
// et l'alimentation ne traverse pas une résistance.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-wirecolor');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { normalizeSize, stripOfPin } from '../../src/webview/diagram/breadboard.mjs';
import '../../src/webview/composants/breadboard.mjs';
import '../../src/webview/composants/logic-ic-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const canvas = document.getElementById('canvas');
	const palette = document.getElementById('palette');
	const svg = document.getElementById('wires');
	const inspector = document.getElementById('inspector');
	const editor = new Editor(canvas, palette, svg, inspector);

	// --- Scène : platine + CI 74xx00 enfiché dessus + une LED témoin ----------
	const bb = editor.addPart('breadboard', 100, 100);
	await wait(120);
	const ic = editor.addPart('74xx00', 600, 500);
	// Une LED témoin PAR sondage : deux sondages sur la même LED la relieraient
	// aux deux bandes, qui deviendraient alors un seul nœud (et le contrôle
	// inverse passerait rouge à juste titre).
	const temoins = [
		editor.addPart('led', 100, 700),
		editor.addPart('led', 300, 700),
		editor.addPart('led', 500, 700),
	];
	await wait(200);

	// Le CI est amené sur la platine (sa 1re broche sur un trou), puis enfiché
	// par le MÊME code que le relâché de la souris (plugIntoBreadboard recale).
	const pins = [...editor.rendered.get(ic.id).hotspots.keys()];
	const target = editor.hotspotCenter({ partId: bb.id, pin: 'f5' });
	const firstPin = editor.hotspotCenter({ partId: ic.id, pin: pins[0] });
	ok('scène : trou f5 et 1re broche du CI mesurés', !!target && !!firstPin,
		JSON.stringify(target) + ' / ' + JSON.stringify(firstPin));
	ic.x += Math.round(target.x - firstPin.x);
	ic.y += Math.round(target.y - firstPin.y);
	const cont = editor.rendered.get(ic.id).container;
	cont.style.left = ic.x + 'px';
	cont.style.top = ic.y + 'px';
	await wait(60);
	editor.plugIntoBreadboard(ic, editor.collectBreadboardHoles(ic.id, false));
	await wait(60);

	const autos = editor.diagram.wires.filter((w) => w.auto);
	ok('enfichage : des fils implicites relient les broches du CI aux trous',
		autos.length >= 10, autos.length + ' fils auto');

	// Trou de la platine où atterrit une broche donnée du CI.
	const holeOf = (pin) => {
		for (const w of editor.diagram.wires) {
			if (!w.auto) continue;
			if (w.a.partId === ic.id && w.a.pin === pin && w.b.partId === bb.id) return w.b.pin;
			if (w.b.partId === ic.id && w.b.pin === pin && w.a.partId === bb.id) return w.a.pin;
		}
		return null;
	};
	const size = normalizeSize(bb.attrs?.size);
	const occupe = new Set(autos.map((w) => (w.a.partId === bb.id ? w.a.pin : w.b.pin)));
	// Autre trou LIBRE de la même bande que la broche visée (là où l'élève pique
	// son fil : même bande = même nœud électrique que la broche du CI).
	const voisinLibre = (pin) => {
		const h = holeOf(pin);
		if (!h) return null;
		return stripOfPin(size, h).find((p) => p !== h && !occupe.has(p)) ?? null;
	};

	const trouVcc = voisinLibre('VCC');
	const trouGnd = voisinLibre('GND');
	const trouSignal = voisinLibre('A1');
	ok('scène : le CI occupe bien des bandes (VCC, GND, A1 retrouvées)',
		!!trouVcc && !!trouGnd && !!trouSignal,
		'vcc=' + trouVcc + ' gnd=' + trouGnd + ' a1=' + trouSignal);

	const couleurDepuis = (trou, temoin) => {
		editor.addWire({ partId: bb.id, pin: trou }, { partId: temoin.id, pin: 'A' });
		return editor.diagram.wires[editor.diagram.wires.length - 1].color;
	};

	// --- 1. LE POINT DE L'ITEM : la bande alimentée colore le fil -------------
	const cVcc = couleurDepuis(trouVcc, temoins[0]);
	ok('bande du VCC du CI : le fil planté dans un autre trou naît ROUGE',
		cVcc === 'red', 'couleur=' + cVcc + ' (trou ' + trouVcc + ')');
	const cGnd = couleurDepuis(trouGnd, temoins[1]);
	ok('bande de la masse du CI : le fil planté dans un autre trou naît NOIR',
		cGnd === 'black', 'couleur=' + cGnd + ' (trou ' + trouGnd + ')');

	// --- 2. Contre-épreuve : une bande de SIGNAL reste en couleur de nappe ----
	const cSig = couleurDepuis(trouSignal, temoins[2]);
	ok('bande d une entrée logique (A1) : couleur de nappe, ni rouge ni noir',
		cSig !== 'red' && cSig !== 'black', 'couleur=' + cSig + ' (trou ' + trouSignal + ')');

	// --- 3. Rien de cassé : le rôle DIRECT des extrémités prime toujours ------
	const uno = editor.addPart('uno', 1200, 100);
	await wait(200);
	const led2 = editor.addPart('led', 1200, 900);
	const res = editor.addPart('resistor', 1400, 900);
	await wait(150);
	editor.addWire({ partId: uno.id, pin: '5V' }, { partId: res.id, pin: '1' });
	const wVcc = editor.diagram.wires[editor.diagram.wires.length - 1];
	ok('fil branché sur le 5V de la carte : rouge (comportement d origine)',
		wVcc.color === 'red', wVcc.color);
	editor.addWire({ partId: uno.id, pin: 'GND.1' }, { partId: led2.id, pin: 'C' });
	const wGnd = editor.diagram.wires[editor.diagram.wires.length - 1];
	ok('fil branché sur une masse de la carte : noir (comportement d origine)',
		wGnd.color === 'black', wGnd.color);

	// --- 4. L alimentation NE TRAVERSE PAS une résistance ---------------------
	// L autre patte de la résistance n est plus un rail : le fil qui en part doit
	// rester en couleur de nappe (buildNets appelé avec joinResistors: false).
	editor.addWire({ partId: res.id, pin: '2' }, { partId: led2.id, pin: 'A' });
	const wRes = editor.diagram.wires[editor.diagram.wires.length - 1];
	ok('après une résistance : le fil ne devient PAS rouge',
		wRes.color !== 'red' && wRes.color !== 'black', wRes.color);

	// --- 5. Recâblage d une extrémité SUR la bande alimentée ------------------
	// dragEndpoint relit la couleur d alimentation du fil : la même règle vaut
	// au rebranchement, sinon un fil vert resterait vert sur le rail du CI.
	const libre = stripOfPin(size, holeOf('VCC')).find((p) => p !== holeOf('VCC') && p !== trouVcc && !occupe.has(p));
	ok('scène : un troisième trou libre existe sur la bande du VCC', !!libre, libre);
	const wDeplace = editor.diagram.wires.find((w) => w.id === wRes.id);
	wDeplace.a = { partId: bb.id, pin: libre };
	const recolor = editor.powerColorOf(wDeplace);
	ok('rebranchement sur la bande du VCC : la couleur repasse au rouge',
		recolor === 'red', 'couleur=' + recolor);

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
	`<div id="canvas" class="canvas" style="width:1800px;height:1200px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1900,1300', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let bad = 0;
for (const r of rows) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(bad === 0 ? `couleur des fils : ${rows.length} contrôles OK` : `${bad} contrôle(s) en échec`);
process.exit(bad === 0 ? 0 : 1);
