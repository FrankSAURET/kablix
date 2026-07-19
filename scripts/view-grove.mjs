// TEMP — vue visuelle du Grove Shield : seul (switch 3V3 puis 5V) + Pico W
// enfichée + LED câblée sur D16. Capture PNG pour validation. À supprimer.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-grove');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/grove-shield-element.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/led-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	// Shield 1 : switch par défaut (3V3).
	const s1 = editor.addPart('grove-pico', 60, 40);
	// Shield 2 : switch sur 5V + Pico W enfichée.
	const s2 = editor.addPart('grove-pico', 380, 40);
	await wait(150);
	editor.updatePartAttr(s2.id, 'pwr', '5v');
	const holeTL = editor.hotspotCenter({ partId: s2.id, pin: '5V' });
	const pico = editor.addPart('picow', 0, 400);
	await wait(150);
	const pinTL = editor.hotspotCenter({ partId: pico.id, pin: 'VBUS' });
	const pr = editor.rendered.get(pico.id);
	pr.part.x += holeTL.x - pinTL.x; pr.part.y += holeTL.y - pinTL.y;
	pr.container.style.left = pr.part.x + 'px'; pr.container.style.top = pr.part.y + 'px';
	await wait(80);
	editor.plugIntoBreadboard(pr.part, editor.collectBreadboardHoles(pico.id, true));
	// LED sur le port D16 du shield 2.
	const led = editor.addPart('led', 680, 120);
	await wait(100);
	editor.addWire({ partId: led.id, pin: 'A' }, { partId: s2.id, pin: 'D16.D16' });
	editor.addWire({ partId: led.id, pin: 'C' }, { partId: s2.id, pin: 'D16.GND' });
	editor.select(null);
	await wait(200);
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
	`<div id="canvas" class="canvas" style="width:820px;height:560px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector" style="display:none"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', `--user-data-dir=${process.env.TEMP}\\kbx-chrome`, '--virtual-time-budget=10000', '--window-size=840,580', `--screenshot=${join(CACHE, 'view.png')}`, `file:///${join(CACHE, 'v.html').replace(/\\/g, '/')}`], { stdio: 'ignore' });
console.log('Capture :', join(CACHE, 'view.png'));
