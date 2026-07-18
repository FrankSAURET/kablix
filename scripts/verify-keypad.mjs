// Test de régression : clavier matriciel — variante « touches dures » (v2026.7.110).
// Vrai élément <kablix-membrane-keypad> en Chrome headless : dessins membrane ET
// touche (case membrane/touche de l'inspecteur, attr `hardkeys`), touches câblées
// (contrat sim.mts : button-press/release {key,row,column} + classe pressed),
// broches IDENTIQUES entre les deux variantes (pastilles kpt sur la grille 10 px),
// bascule dynamique membrane→touche, schéma interne dédié.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-keypad');

const entry = `
import '../../src/webview/composants/membrane-keypad-element.mjs';
import { internalWiringSvg } from '../../src/webview/diagram/internal-wiring.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const mk = async (columns, hard) => {
		const el = document.createElement('kablix-membrane-keypad');
		el.setAttribute('columns', columns);
		if (hard) el.setAttribute('hardkeys', '1');
		document.body.appendChild(el);
		await el.updateComplete;
		await wait(40);
		return el;
	};
	const keysOf = (el) => [...el.shadowRoot.querySelectorAll('[data-key-name]')];
	const press = (el, name) => {
		const k = el.shadowRoot.querySelector('[data-key-name="' + name + '"]');
		let got = null;
		el.addEventListener('button-press', (e) => { got = e.detail; }, { once: true });
		k.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		return { got, pressed: k.classList.contains('pressed') || !!el.shadowRoot.querySelector('.pressed') };
	};

	// --- 1. Membrane 4 colonnes : comportement historique inchangé -------------
	const m4 = await mk('4', false);
	ok('membrane 4col : 16 touches câblées', keysOf(m4).length === 16, keysOf(m4).length);
	// NB : la classe .pressed n'est posée qu'au verrouillage (Ctrl+clic, sim.mts)
	// ou au clavier — l'appui souris simple s'appuie sur :active (CSS).
	const p5 = press(m4, '5');
	ok('membrane : appui 5 → button-press {5,1,1}',
		p5.got && p5.got.key === '5' && p5.got.row === 1 && p5.got.column === 1,
		JSON.stringify(p5.got));

	// --- 2. Touches dures 3 colonnes -------------------------------------------
	const t3 = await mk('3', true);
	ok('touche 3col : dessin de Frank rendu (ids kpt3-)',
		!!t3.shadowRoot.querySelector('[id^="kpt3-"]'));
	const k3 = keysOf(t3);
	ok('touche 3col : 12 touches câblées', k3.length === 12, k3.length);
	ok('touche 3col : ordre de lecture 1..# ',
		k3[0]?.dataset.keyName === '1' && k3[2]?.dataset.keyName === '3' &&
		k3[9]?.dataset.keyName === '*' && k3[11]?.dataset.keyName === '#',
		k3.map((k) => k.dataset.keyName).join(''));
	const p8 = press(t3, '8');
	ok('touche 3col : appui 8 → button-press {8,2,1}',
		p8.got && p8.got.key === '8' && p8.got.row === 2 && p8.got.column === 1,
		JSON.stringify(p8.got));

	// --- 3. Touches dures 4 colonnes (dont colonne D hors groupe dans le SVG) ---
	const t4 = await mk('4', true);
	const k4 = keysOf(t4);
	ok('touche 4col : 16 touches câblées', k4.length === 16, k4.length);
	ok('touche 4col : colonne D présente (A B C D)',
		['A', 'B', 'C', 'D'].every((n) => k4.some((k) => k.dataset.keyName === n)),
		k4.map((k) => k.dataset.keyName).join(''));
	const pD = press(t4, 'D');
	ok('touche 4col : appui D → button-press {D,3,3}',
		pD.got && pD.got.key === 'D' && pD.got.row === 3 && pD.got.column === 3,
		JSON.stringify(pD.got));

	// --- 4. Broches identiques membrane/touche + sur la grille de 10 px ---------
	const pinsEq = (a, b) => JSON.stringify(a.pinInfo) === JSON.stringify(b.pinInfo);
	const m3 = await mk('3', false);
	ok('broches 3col : identiques membrane/touche (7 broches)',
		pinsEq(m3, t3) && t3.pinInfo.length === 7);
	ok('broches 4col : identiques membrane/touche (8 broches)',
		pinsEq(m4, t4) && t4.pinInfo.length === 8);
	ok('broches touche : toutes sur la grille de 10 px',
		[...t3.pinInfo, ...t4.pinInfo].every((p) => p.x % 10 === 0 && p.y % 10 === 0));
	// Pastilles dessinées (kpt3-pin-*) au même endroit que pinInfo.
	const svg3 = t3.shadowRoot.querySelector('svg');
	const toVB = (svg, x, y) => {
		const q = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM().inverse());
		return { x: q.x, y: q.y };
	};
	const drawn = t3.pinInfo.every((p) => {
		const c = svg3.querySelector('#kpt3-pin-' + p.name);
		if (!c) return false;
		const b = c.getBoundingClientRect();
		const v = toVB(svg3, b.left + b.width / 2, b.top + b.height / 2);
		return Math.abs(v.x - p.x) < 0.6 && Math.abs(v.y - p.y) < 0.6;
	});
	ok('pastilles kpt3-pin-* dessinées PILE sous les broches', drawn);

	// --- 5. Bascule dynamique membrane → touche ----------------------------------
	m3.setAttribute('hardkeys', '1');
	await m3.updateComplete;
	await wait(40);
	ok('bascule membrane→touche : dessin remplacé + touches recâblées',
		!!m3.shadowRoot.querySelector('[id^="kpt3-"]') && keysOf(m3).length === 12);

	// --- 6. Schéma interne dédié -------------------------------------------------
	const pins = t3.pinInfo.map((p) => ({ name: p.name, x: p.x, y: p.y }));
	const memSchema = internalWiringSvg('passive', pins, { columns: '3' }, 'keypad');
	const touSchema = internalWiringSvg('passive', pins, { columns: '3', hardkeys: '1' }, 'keypad');
	ok('schéma interne touche : présent et distinct du schéma membrane',
		!!touSchema && !!memSchema && touSchema !== memSchema && touSchema.length > 1000,
		(touSchema ?? '').length);

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
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `keypad : ${fail} échec(s).` : `keypad : ${rows.length} contrôles OK — variante touches dures opérationnelle.`);
process.exit(fail ? 1 : 0);
