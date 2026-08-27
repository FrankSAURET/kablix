// Sonde : le capteur d'humidité du sol se rend-il, et son curseur de simulation
// apparaît-il avec les bonnes bornes ? (vrai éditeur, vrai Chrome)
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';

const ROOT = 'C:/- VS Code/Extensions/Kablix';
const CACHE = join(ROOT, 'node_modules', '.cache-soil');
mkdirSync(CACHE, { recursive: true });
const part = await lireKompix('soil-moisture-sensor');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { registerCustomPart, partDef } from '../../src/webview/diagram/catalog.mjs';
import '../../src/webview/composants/custom-part.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
registerCustomPart(${JSON.stringify({ ...part, behaviorScript: undefined })});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const editor = new Editor(document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const capt = editor.addPart('soil-moisture-sensor', 200, 100);
	await wait(200);
	const el = editor.elementOf(capt.id);
	const svg = el.shadowRoot.querySelector('svg').getBoundingClientRect();
	const def = partDef('soil-moisture-sensor');
	const avant = !!el.shadowRoot.querySelector('.sim-control');
	el.setAttribute('simulating', '');
	await wait(120);
	const box = el.shadowRoot.querySelector('.sim-control');
	const input = box && box.querySelector('input');
	const lus = [];
	for (const v of [0, 50, 100]) {
		input.value = String(v);
		input.dispatchEvent(new Event('input'));
		await wait(10);
		lus.push({ v, controlValue: el.controlValue, analogLevel: el.analogLevel, texte: box.textContent.trim() });
	}
	const out = document.createElement('pre'); out.id = 'measures';
	out.textContent = JSON.stringify({
		taille: [Math.round(svg.width), Math.round(svg.height)],
		kind: def.kind, analogPin: def.analogPin, simControl: def.simControl,
		pattes: def.custom.pins.map((p) => p.name + '(' + p.x + ',' + p.y + ')').join(' '),
		curseurAvantSim: avant,
		bornes: input ? [input.min, input.max, input.step] : null,
		lus,
	}, null, 1);
	document.body.appendChild(out);
}
run().catch((e) => { const o = document.createElement('pre'); o.id = 'measures'; o.textContent = String(e && e.stack); document.body.appendChild(o); });
`;
writeFileSync(join(CACHE, 'probe.mjs'), entry);
const b = await esbuild.build({
	entryPoints: [join(CACHE, 'probe.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(join(CACHE, 'probe.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1200px;height:800px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	'--virtual-time-budget=20000', '--dump-dom', pathToFileURL(join(CACHE, 'probe.html')).href],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'rien');
