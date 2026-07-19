// TEMP — vue visuelle du PCA9685 dans le vrai éditeur : uno + PCA + servo sur
// P1 + alim de laboratoire sur le bornier, fils auto-colorés. À supprimer.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-pca');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pca9685-element.mjs';
import '../../src/webview/composants/alim-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const uno = editor.addPart('uno', 40, 260);
	const pca = editor.addPart('pca9685', 380, 40);
	const srv = editor.addPart('servo', 780, 60);
	const alim = editor.addPart('alim', 780, 260);
	await wait(200);
	const W = (a, pa, b, pb) => editor.addWire({ partId: a.id, pin: pa }, { partId: b.id, pin: pb });
	W(pca, 'GND', uno, 'GND.1');
	W(pca, 'VCC', uno, '5V');
	W(pca, 'SDA', uno, 'A4');
	W(pca, 'SCL', uno, 'A5');
	W(srv, 'PWM', pca, 'PWM0');
	W(srv, 'V+', pca, 'P1.5V');
	W(srv, 'GND', pca, 'P1.GND');
	W(alim, 'V+', pca, 'V+');
	W(alim, 'GND', pca, 'GND.2');
	editor.select(null);
	await wait(250);
	editor.fitView();
	await wait(150);
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
	`<div id="canvas" class="canvas" style="width:1100px;height:640px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector" style="display:none"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', `--user-data-dir=${process.env.TEMP}\\kbx-chrome`, '--virtual-time-budget=12000', '--window-size=1120,660', '--force-device-scale-factor=1.5', `--screenshot=${join(CACHE, 'view.png')}`, `file:///${join(CACHE, 'v.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });
console.log('Capture :', join(CACHE, 'view.png'));
