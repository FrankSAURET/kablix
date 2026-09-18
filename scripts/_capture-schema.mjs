// Capture PNG d'un .projix rendu par le VRAI éditeur (Chrome headless) : de
// quoi vérifier de visu qu'une pince pince bien là où elle dit.
// Usage : node scripts/_capture-schema.mjs <projix> [sortie.png]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-capture-schema');
const cible = process.argv[2] ?? 'testkablix/sonde-logique-pico.projix';
const sortie = process.argv[3] ?? join(ROOT, 'V-apercu-' + basename(cible, '.projix') + '.png');

const zip = await JSZip.loadAsync(readFileSync(join(ROOT, cible)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
const DIAGRAM = ${JSON.stringify(diagram)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	for (let i = 0; i < 12; i++) await wait(60);
	// Le .projix porte la caméra de Frank (ici un zoom de 1000 %) : pour un
	// aperçu de la planche entière on repart d'une vue à l'échelle 1.
	editor.setCamera({ zoom: Number(location.hash.slice(1)) || 1, panX: 20, panY: 20 });
	for (let i = 0; i < 6; i++) await wait(60);
	document.title = 'pret';
})();
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0;background:#fff">` +
	`<div class="workshop"><aside id="palette" class="palette" style="display:none"></aside>` +
	`<div id="canvas" class="canvas" style="width:900px;height:620px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector" style="display:none"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=900,620',
	'--virtual-time-budget=12000', `--screenshot=${sortie}`,
	`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}#${process.argv[4] ?? 1}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
console.log('capture :', sortie);
