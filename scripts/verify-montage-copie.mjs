// Banc : un aimant copié AVEC son servo suit le servo copié (piste 7, suite de D0).
//
// Vrai Editor + vraie feuille media/styles.css en Chrome headless. Le lien de
// montage vit dans l'attribut `mount` de l'aimant (repère du porteur) ; au
// collage, le servo copié reçoit un repère neuf (Act2…) et l'aimant copié
// restait fixé sur le servo d'origine (Act1) : deux aimants sur le même
// palonnier, le servo copié sans rien.
//
// Contrôlé : Ctrl+D sur servo + aimant, collages répétés de la même copie
// (charge utile du presse-papier intacte), aimant copié seul (garde Act1),
// élément dessiné avec le bon « Fixé sur », liens de montage sans problème.
// Puis servo supprimé : ses aimants détachés (`detachMounts`), Ctrl+Z les refixe.
//
// Contre-épreuve : neutraliser `remapMounts` ou `detachMounts` dans editor.mts —
// le banc DOIT échouer.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-montage-copie');

const DIAGRAM = {
	parts: [
		{ id: 'Act1', type: 'servo', x: 200, y: 200, attrs: {} },
		{ id: 'A1', type: 'aimant', x: 260, y: 160, attrs: { mount: 'Act1' } },
	],
	wires: [],
};

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/servo-element.mjs';
import '../../src/webview/composants/aimant-element.mjs';
import { detachMounts, mountLinks, remapMounts } from '../../src/webview/diagram/montage.mjs';
const DIAGRAM = ${JSON.stringify(DIAGRAM)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const key = (k, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

async function run() {
	// --- Logique pure ---------------------------------------------------------
	const brut = [{ id: 'A9', type: 'aimant', x: 0, y: 0, attrs: { mount: 'Act1', autre: 'x' } },
		{ id: 'Act7', type: 'servo', x: 0, y: 0, attrs: { mount: 'Act1' } }];
	const attrsAvant = brut[0].attrs;
	const n = remapMounts(brut, new Map([['Act1', 'Act4']]));
	ok('pur : aimant suivi, autres attributs gardés', brut[0].attrs.mount === 'Act4' && brut[0].attrs.autre === 'x', JSON.stringify(brut[0].attrs));
	ok('pur : attributs remplacés, pas modifiés sur place', attrsAvant.mount === 'Act1');
	ok('pur : seul un aimant est concerné', brut[1].attrs.mount === 'Act1' && n === 1, n);
	const seul = [{ id: 'A2', type: 'aimant', x: 0, y: 0, attrs: { mount: 'Act1' } }];
	ok('pur : porteur hors de la table → repère gardé', remapMounts(seul, new Map([['A1', 'A2']])) === 0 && seul[0].attrs.mount === 'Act1');

	// --- Vrai éditeur ---------------------------------------------------------
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'), document.getElementById('wires'),
		document.getElementById('inspector'));
	editor.loadDiagram(DIAGRAM);
	await wait(800);
	const byType = (t) => editor.diagram.parts.filter((p) => p.type === t);

	// 1. Servo + aimant sélectionnés, Ctrl+D.
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
	await wait(20);
	ok('Ctrl+A : servo et aimant sélectionnés', editor.selectedParts.size === 2, [...editor.selectedParts]);
	key('d', { ctrlKey: true });
	await wait(200);
	const servos = byType('servo'), aimants = byType('aimant');
	const servo2 = servos.find((p) => p.id !== 'Act1');
	const aimant2 = aimants.find((p) => p.id !== 'A1');
	ok('Ctrl+D : un servo et un aimant de plus', servos.length === 2 && aimants.length === 2, editor.diagram.parts.map((p) => p.id));
	ok('Ctrl+D : l aimant copié est fixé sur le servo copié', aimant2 && servo2 && aimant2.attrs.mount === servo2.id,
		aimant2 && JSON.stringify({ mount: aimant2.attrs.mount, servo: servo2?.id }));
	ok('Ctrl+D : l aimant d origine reste sur Act1', aimants.find((p) => p.id === 'A1').attrs.mount === 'Act1');
	const el2 = aimant2 && editor.rendered.get(aimant2.id)?.el;
	ok('Ctrl+D : l élément dessiné porte le bon « Fixé sur »', el2 && el2.mount === servo2.id, el2 && el2.mount);

	// 2. Même copie collée encore une fois : la charge utile n'a pas été touchée.
	editor.paste();
	await wait(200);
	const servo3 = byType('servo').find((p) => p.id !== 'Act1' && p.id !== servo2.id);
	const aimant3 = byType('aimant').find((p) => p.id !== 'A1' && p.id !== aimant2.id);
	ok('second collage : l aimant suit le troisième servo', aimant3 && servo3 && aimant3.attrs.mount === servo3.id,
		aimant3 && JSON.stringify({ mount: aimant3.attrs.mount, servo: servo3?.id }));

	// 3. Liens de montage du schéma obtenu : trois liens, aucun problème.
	const { links, problems } = mountLinks(editor.diagram);
	const porteurs = new Set(links.map((l) => l.carrierId));
	ok('liens : trois aimants, trois servos distincts, aucun problème', links.length === 3 && porteurs.size === 3 && problems.length === 0,
		JSON.stringify({ links, problems }));

	// 4. Aimant copié SEUL : il reste fixé sur le même servo que l original.
	editor.select({ kind: 'part', id: 'A1' });
	await wait(20);
	key('d', { ctrlKey: true });
	await wait(200);
	const aimant4 = byType('aimant').find((p) => ![ 'A1', aimant2.id, aimant3.id ].includes(p.id));
	ok('aimant copié seul : garde Act1', aimant4 && aimant4.attrs.mount === 'Act1', aimant4 && aimant4.attrs.mount);

	// 5. Porteur supprimé (touche Suppr) : ses aimants sont détachés, les autres
	// restent ; un seul Ctrl+Z ramène le servo ET les aimants refixés.
	editor.select({ kind: 'part', id: 'Act1' });
	await wait(20);
	key('Delete');
	await wait(200);
	const get = (id) => editor.diagram.parts.find((p) => p.id === id);
	ok('Suppr du servo : Act1 retiré', !get('Act1'), editor.diagram.parts.map((p) => p.id));
	ok('Suppr du servo : A1 et la copie seule détachés', get('A1')?.attrs.mount === '' && get(aimant4.id)?.attrs.mount === '',
		JSON.stringify([get('A1')?.attrs, get(aimant4.id)?.attrs]));
	ok('Suppr du servo : l élément dessiné est détaché', editor.rendered.get('A1')?.el.mount === '', editor.rendered.get('A1')?.el.mount);
	ok('Suppr du servo : les aimants des autres servos restent fixés', get(aimant2.id)?.attrs.mount === servo2.id && get(aimant3.id)?.attrs.mount === servo3.id);
	ok('Suppr du servo : plus aucun problème de montage', mountLinks(editor.diagram).problems.length === 0,
		JSON.stringify(mountLinks(editor.diagram).problems));
	editor.undo();
	await wait(300);
	ok('Ctrl+Z : servo revenu, A1 refixé sur Act1', !!get('Act1') && get('A1')?.attrs.mount === 'Act1' && get(aimant4.id)?.attrs.mount === 'Act1',
		JSON.stringify(get('A1')?.attrs));
	ok('Ctrl+Z : l élément dessiné est refixé', editor.rendered.get('A1')?.el.mount === 'Act1', editor.rendered.get('A1')?.el.mount);
	const brut2 = [{ id: 'A5', type: 'aimant', x: 0, y: 0, attrs: { mount: 'Act1' } }, { id: 'A6', type: 'aimant', x: 0, y: 0, attrs: { mount: 'Act2' } }];
	const garde = brut2[0].attrs;
	ok('pur : detachMounts ne vise que le porteur supprimé', JSON.stringify(detachMounts(brut2, 'Act1')) === '["A5"]' && brut2[1].attrs.mount === 'Act2' && garde.mount === 'Act1');

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
	`<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1600,1000', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `montage-copie : ${fail} échec(s).` : `montage-copie : ${rows.length} contrôles OK — l'aimant copié suit son servo copié.`);
process.exit(fail ? 1 : 0);
