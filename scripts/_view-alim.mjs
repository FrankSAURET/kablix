// TEMP — vue visuelle de l'alim de laboratoire : 4 exemplaires (0 V, 15 V,
// 30 V, 5 V en surcourant LED allumée). Capture PNG pour validation. À supprimer.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-alim');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/alim-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const mk = async (x, y, v, over) => {
		const p = editor.addPart('alim', x, y);
		await wait(80);
		const el = editor.elementOf(p.id);
		el.setAttribute('voltage', String(v));
		if (over) { el.setAttribute('simulating', ''); el.overAmps = true; }
		return p;
	};
	await mk(40, 30, 0, false);
	await mk(360, 30, 15, false);
	await mk(40, 190, 30, false);
	await mk(360, 190, 5, true);
	editor.select(null);
	await wait(150);
	editor.fitView();
	await wait(120);
}
run();
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'v.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'v.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'v.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette" style="display:none"></aside>` +
	`<div id="canvas" class="canvas" style="width:700px;height:340px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector" style="display:none"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', `--user-data-dir=${process.env.TEMP}\\kbx-chrome`, '--virtual-time-budget=10000', '--window-size=720,360', '--force-device-scale-factor=1.5', `--screenshot=${join(CACHE, 'view.png')}`, `file:///${join(CACHE, 'v.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });
console.log('Capture :', join(CACHE, 'view.png'));
