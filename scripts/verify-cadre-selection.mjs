// Le cadre de sélection colle-t-il au DESSIN ?
//
// Deux pièges corrigés en v2026.9.2.59, que ce banc surveille :
//  1. `getBBox` mesure des TRACÉS, pas de l'encre. Les pales du ventilateur sont
//     remplies d'un dégradé radial qui s'éteint sur son pourtour : elles montaient
//     à y=10,8 alors que rien n'y est peint avant y=18,25. Le cadre dépassait donc
//     le boîtier de 7,5 unités en haut. Corrigé par une mesure sur l'ALPHA d'un
//     rendu hors écran, en cache par type, qui ne fait que rogner `getBBox`.
//  2. Le bandeau de nom se calait sur le viewBox du corps, pas sur le dessin : il
//     flottait au-dessus du vide (10,8 px ventilo, 9,0 px Uno). Il partage
//     désormais la même mesure que le cadre — donc il le touche.
//
// Tout est mesuré dans le VRAI éditeur, en Chrome headless (pas de simulacre) :
// c'est la seule façon d'avoir un getBBox et un canvas dignes de ce nom.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-verifcadre');

// Bornes attendues du cadre, en unités de viewBox. Ce n'est PAS l'encre seule :
// l'encre ne sert qu'à ROGNER `getBBox`, jamais à l'élargir — un contour ou une
// ombre peut déborder du tracé (multimètre : encre large de 253,75 pour un tracé
// de 251,41, c'est le tracé qui gagne). L'attendu est donc l'intersection des
// deux, relevée au pixel (scan alpha à 4 px/unité ∩ getBBox).
const ATTENDU = {
	// Le cas de Frank : sans l'encre, y valait 10,80 et w 208,06 (pales en dégradé
	// transparent). L'encre rogne à 18,25 / 203,75, et c'est elle qui l'emporte.
	ventilo: { x: 9.97, y: 18.25, w: 203.53, h: 192, note: 'encre ⊂ tracé : le cadre suit l\'encre' },
	led: { x: 5.95, y: 5.92, w: 17.44, h: 34.08, note: 'tracé ⊂ encre : cadre inchangé' },
	resistor: { x: 10, y: 4.33, w: 60, h: 11.34, note: 'tracé ⊂ encre : cadre inchangé' },
	multimetre: { x: 11.92, y: 3.59, w: 251.41, h: 81.98, note: 'tracé ⊂ encre : cadre inchangé' },
};
const TOL = 2.5; // unités de viewBox : antialiasing + arrondi du rendu à 3 px/unité

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import '../../src/webview/composants/ventilo-element.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/multimetre-element.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const canvas = document.getElementById('canvas');
	const editor = new Editor(canvas, document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	canvas.classList.add('canvas--show-labels', 'canvas--show-ids');
	await wait(60);
	editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	const rows = [];
	const types = ['ventilo', 'led', 'resistor', 'multimetre', 'arduino-uno'];
	let x = 120;
	for (const type of types) {
		const p = editor.addPart(type === 'arduino-uno' ? 'uno' : type, x, 600);
		x += 500;
		await wait(400);
		editor.selectedParts = new Set([p.id]);
		editor.setPartHighlight();
		// La mesure d'encre est ASYNCHRONE (chargement d'une Image) : on laisse au
		// cache le temps de se remplir et au recalage de passer.
		await wait(900);
		editor.setPartHighlight();
		await wait(150);
		const cont = [...document.querySelectorAll('.part')]
			.find((c) => (c.querySelector('.part__id')?.textContent ?? '') === p.id);
		const body = cont.querySelector('.part__body');
		const sel = body.querySelector('.part__selbox');
		const head = cont.querySelector('.part__head');
		const el = cont.querySelector(':scope > .part__body > *');
		const svgs = [...(el.shadowRoot ?? el).querySelectorAll('svg')].filter((s) => !s.parentElement?.closest('svg'));
		const svg = svgs.reduce((best, s) => {
			const a = (s.width?.baseVal?.value || 0) * (s.height?.baseVal?.value || 0);
			const ba = best ? (best.width?.baseVal?.value || 0) * (best.height?.baseVal?.value || 0) : -1;
			return a > ba ? s : best;
		}, null);
		const vb = svg?.viewBox?.baseVal;
		const vw = svg?.width?.baseVal?.value || 0;
		const vh = svg?.height?.baseVal?.value || 0;
		// Cadre exprimé en unités du viewBox, pour comparer aux scans alpha.
		const sx = vb && vb.width ? vb.width / vw : 1;
		const sy = vb && vb.height ? vb.height / vh : 1;
		const rb = body.getBoundingClientRect();
		const rs = sel ? sel.getBoundingClientRect() : null;
		const rh = head.getBoundingClientRect();
		rows.push({
			type,
			cadre: !sel ? null : {
				x: +((sel.offsetLeft) * sx + (vb ? vb.x : 0)).toFixed(2),
				y: +((sel.offsetTop) * sy + (vb ? vb.y : 0)).toFixed(2),
				w: +(sel.offsetWidth * sx).toFixed(2),
				h: +(sel.offsetHeight * sy).toFixed(2),
			},
			// Écart vertical entre le BAS du bandeau et le HAUT du cadre, en px écran.
			ecartBandeauCadre: rs ? +(rs.top - rh.bottom).toFixed(1) : null,
			// Le bandeau doit démarrer au bord gauche du cadre.
			ecartBandeauGauche: rs ? +(rh.left - rs.left).toFixed(1) : null,
			// Largeur du bandeau contre celle de son TEXTE (spans visibles) plus
			// le padding horizontal : la barre grise ne doit plus s'étirer sur la
			// largeur du composant derrière deux caractères d'id.
			bandeauW: +rh.width.toFixed(1),
			texteW: +([...head.children]
				.filter((c) => getComputedStyle(c).display !== 'none')
				.reduce((s, c) => s + c.getBoundingClientRect().width, 0) + 12).toFixed(1),
			corps: { w: +rb.width.toFixed(1), h: +rb.height.toFixed(1) },
		});
	}
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(rows);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ err: String(e && e.stack) }]);
	document.body.appendChild(out);
});
`;

mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' }, absWorkingDir: ROOT,
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:2600px;height:1400px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`);

const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.error('Chrome introuvable — contrôle ignoré.'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
	'--virtual-time-budget=60000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
	{ encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.error('ÉCHEC : aucune mesure produite.'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
if (rows[0]?.err) { console.error('ÉCHEC :', rows[0].err); process.exit(1); }

let ko = 0;
const ok = (cond, texte) => { console.log(`${cond ? '  ok  ' : ' ÉCHEC'} ${texte}`); if (!cond) ko++; };

console.log('— Cadre de sélection calé sur l\'encre du dessin —');
for (const r of rows) {
	const a = ATTENDU[r.type];
	if (!a) continue;
	ok(!!r.cadre, `${r.type} : un cadre est posé — ${a.note}`);
	if (!r.cadre) continue;
	for (const k of ['x', 'y', 'w', 'h']) {
		const d = Math.abs(r.cadre[k] - a[k]);
		ok(d <= TOL, `${r.type}.${k} = ${r.cadre[k]} (attendu ${a[k]}, écart ${d.toFixed(2)} ≤ ${TOL})`);
	}
}

console.log('— Le ventilateur, cas qui a motivé la correction —');
const v = rows.find((r) => r.type === 'ventilo');
// Sans la mesure d'encre, getBBox rendait y=10,80 : le cadre dépassait le boîtier
// par le haut. Le contrôle serre donc surtout le bord supérieur.
ok(v?.cadre && v.cadre.y > 15, `haut du cadre à y=${v?.cadre?.y} (> 15 : plus de débord au-dessus du boîtier)`);
ok(v?.cadre && v.cadre.x + v.cadre.w < 216, `bord droit à ${v ? (v.cadre.x + v.cadre.w).toFixed(2) : '?'} (< 216)`);

console.log('— Bandeau de nom au contact du cadre —');
for (const r of rows) {
	ok(r.ecartBandeauCadre !== null && Math.abs(r.ecartBandeauCadre) <= 2,
		`${r.type} : bas du bandeau à ${r.ecartBandeauCadre} px du haut du cadre (|écart| ≤ 2)`);
	ok(r.ecartBandeauGauche !== null && Math.abs(r.ecartBandeauGauche) <= 2,
		`${r.type} : bandeau aligné à gauche du cadre (écart ${r.ecartBandeauGauche} px)`);
}

// La barre grise se cale sur SON TEXTE et non sur le composant (Frank) : elle
// s'étirait sur toute la largeur du corps derrière deux caractères d'id.
console.log('— La barre grise est à la taille de son texte —');
for (const r of rows) {
	ok(r.bandeauW <= r.texteW + 2,
		`${r.type} : bandeau large de ${r.bandeauW} px pour un texte de ${r.texteW} px`);
}

console.log(ko === 0 ? `\nOK — ${rows.length} composants, tous les contrôles passent.` : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
