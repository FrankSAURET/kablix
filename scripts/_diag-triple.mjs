// Reproduction du défaut « propriétés triplées » : on pose un composant comme
// la palette le fait (addPart silencieux + centrage + snap), on le sélectionne,
// et on compte les contrôles de l'inspecteur. Puis on désélectionne/resélectionne
// pour voir si le compte retombe (c'est ce que décrit Frank).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = 'C:/- VS Code/Extensions/Kablix';
const CACHE = join(ROOT, 'node_modules', '.cache-repro-triple');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { partDef } from '../../src/webview/diagram/catalog.mjs';
import '../../src/webview/composants/gbf-element.mjs';
import '../../src/webview/composants/sonde-logique-element.mjs';
import '../../src/webview/composants/oscillo-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const inspector = document.getElementById('inspector');
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), inspector);

	// Tous les libellés de propriété affichés, dans l'ordre.
	const labels = () => [...inspector.querySelectorAll('.inspector__label')].map((l) => (l.textContent || '').trim());
	const controls = () => inspector.querySelectorAll('.inspector__control, .inspector__checkbox').length;
	const subtitles = () => inspector.querySelectorAll('.inspector__subtitle').length;
	const titres = () => inspector.querySelectorAll('h3').length;

	for (const type of ['gbf', 'sonde-logique', 'oscillo', 'resistor']) {
		const attendu = (partDef(type).props || []).length;
		// Pose EXACTEMENT comme addPartAtVisibleCenter (chemin de la palette).
		const p = editor.addPartAtVisibleCenter(type);
		await wait(150);
		editor.select({ kind: 'part', id: p.id });
		await wait(200);
		const l1 = labels();
		const c1 = controls();
		ok(type + ' : pas de libelle en double a la 1re selection',
			new Set(l1).size === l1.length, l1.join(' | '));
		ok(type + ' : un seul titre h3 et un seul sous-titre',
			titres() === 1 && subtitles() === 1, 'h3=' + titres() + ' sub=' + subtitles());
		// Deselection / reselection : ce que fait Frank pour s'en sortir.
		editor.select(null);
		await wait(80);
		editor.select({ kind: 'part', id: p.id });
		await wait(150);
		const l2 = labels();
		const c2 = controls();
		ok(type + ' : le compte NE CHANGE PAS apres deselection/reselection',
			c1 === c2 && l1.length === l2.length,
			'avant=' + c1 + '/' + l1.length + ' apres=' + c2 + '/' + l2.length);
		ok(type + ' : nb controles == nb proprietes du catalogue (indicatif)',
			true, 'catalogue=' + attendu + ' controles=' + c1 + ' labels=' + l1.length);
	}

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 400) }]);
	document.body.appendChild(out);
});
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
	`<div class="workshop" style="display:flex;height:700px">` +
	`<aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:900px;height:700px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable'); process.exit(0); }
const dom = execFileSync(
	chrome,
	['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1500,1000', '--virtual-time-budget=30000',
		'--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
for (const r of JSON.parse(unesc(m[1]))) {
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
