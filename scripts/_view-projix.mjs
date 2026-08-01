// Capture d'écran d'un .projix chargé dans le VRAI éditeur (Chrome headless) :
// le schéma tel qu'il s'ouvre pour Frank, pour juger d'un montage sans lui
// demander une copie d'écran.
//   node scripts/_view-projix.mjs testkablix/transistor-uno/transistor-uno.projix [sortie.png]
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import JSZip from 'jszip';
import { build as esbuild } from 'esbuild';

const ROOT = 'h:/OneDrive/4 Programation/- VS Code/Extensions/Kablix';
const CACHE = join(ROOT, 'node_modules', '.cache-view-projix');
const cible = process.argv[2] ?? 'testkablix/transistor-uno/transistor-uno.projix';
const sortie = process.argv[3] ?? join(CACHE, 'vue.png');

const zip = await JSZip.loadAsync(readFileSync(join(ROOT, cible)));
const diagram = JSON.parse(await zip.file('diagram.json').async('string'));

// Les composants ne sont pas auto-chargés : on importe le fork de chaque type présent.
const dispo = readdirSync(join(ROOT, 'src/webview/composants')).filter((f) => f.endsWith('.mts'));
const fichiers = new Set();
for (const p of diagram.parts) {
	const base = dispo.map((f) => [f, f.replace(/\.mts$/, '').replace(/-(element|board)$/, '')]);
	const hit = base.find(([, b]) => b === p.type) ?? base.find(([, b]) => b.endsWith(p.type));
	if (hit) fichiers.add(hit[0].replace(/\.mts$/, '.mjs'));
	else console.log('!! composant introuvable pour le type', p.type);
}
const imports = [...fichiers].map((f) => `import '../../src/webview/composants/${f}';`).join('\n');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
${imports}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DIAGRAM = ${JSON.stringify(diagram)};
async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	// La vue de démarrage est centrée sur l'ORIGINE du monde : sans recadrage, le
	// schéma est entièrement hors champ (mesuré : monde translaté de −1250,−997).
	editor.fitView();
	// Chrome headless ne rend que ~3 images : on séquence sur setTimeout (attendre
	// un 4e requestAnimationFrame ne rendrait JAMAIS la main, et la capture
	// partirait sur une toile vide).
	await wait(2500);
	const boites = [...document.querySelectorAll('.part')].map((p) => {
		const r = p.getBoundingClientRect();
		return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',');
	});
	const monde = document.querySelector('.canvas__world');
	trace('parts=' + boites.length + ' monde=' + getComputedStyle(monde).transform
		+ '\\n' + boites.join(' | '));
}
function trace(texte) {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = texte;
	document.body.appendChild(out);
}
run().catch((e) => trace('ERREUR ' + (e && e.stack)));
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1500px;height:950px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
// `--headless=old` : le nouveau mode prend la capture SANS attendre la fin du
// budget de temps virtuel — toile vide à tous les coups.
const page = `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`;
const commun = ['--headless=old', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--window-size=1900,950'];
const dom = execFileSync(chrome, [...commun, '--dump-dom', page], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '(aucune trace)');
execFileSync(chrome, [...commun, `--screenshot=${sortie}`, page], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
console.log('capture :', sortie);
