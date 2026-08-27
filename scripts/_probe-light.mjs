// Sonde : le capteur de lumière Grove se rend-il, et son curseur prend-il sa
// borne haute dans la propriété « pleine échelle » (lxmax) ? (vrai éditeur,
// vrai Chrome). Le point neuf : changer la propriété change la course du
// curseur ET l'échelle de la tension.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';

const ROOT = 'C:/- VS Code/Extensions/Kablix';
const CACHE = join(ROOT, 'node_modules', '.cache-light');
mkdirSync(CACHE, { recursive: true });
const part = await lireKompix('grove-light-sensor');

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
	const capt = editor.addPart('grove-light-sensor', 200, 100);
	await wait(200);
	const el = editor.elementOf(capt.id);
	const svg = el.shadowRoot.querySelector('svg').getBoundingClientRect();
	const def = partDef('grove-light-sensor');
	const avant = !!el.shadowRoot.querySelector('.sim-control');
	el.setAttribute('simulating', '');
	await wait(120);
	const lire = () => {
		const box = el.shadowRoot.querySelector('.sim-control');
		return { box, input: box && box.querySelector('input[type=range]') };
	};
	const d = lire();
	const bornesDefaut = [d.input.min, d.input.max, d.input.step];
	const lus = [];
	for (const v of [0, 250, 500]) {
		d.input.value = String(v);
		d.input.dispatchEvent(new Event('input'));
		await wait(10);
		lus.push({ v, controlValue: el.controlValue, texte: d.box.textContent.trim() });
	}
	// La propriété de pleine échelle passe à 10 000 lx : le curseur doit suivre.
	el.setAttribute('prm_lxmax', '10000');
	await wait(60);
	const apres = lire();
	const bornes10k = apres.input ? [apres.input.min, apres.input.max, apres.input.step] : null;
	apres.input.value = '5000';
	apres.input.dispatchEvent(new Event('input'));
	await wait(10);
	const out = document.createElement('pre'); out.id = 'measures';
	out.textContent = JSON.stringify({
		taille: [Math.round(svg.width), Math.round(svg.height)],
		kind: def.kind, analogPin: def.analogPin, simControl: def.simControl,
		pattes: def.custom.pins.map((p) => p.name + '(' + p.x + ',' + p.y + ')').join(' '),
		params: (def.custom.params || []).map((p) => p.name + '=' + p.value + ' « ' + p.label + ' »'),
		curseurAvantSim: avant,
		bornesDefaut, lus,
		bornes10k, texte10k: apres.box.textContent.trim(), valeur10k: el.controlValue,
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
