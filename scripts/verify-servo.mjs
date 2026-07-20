// Test de régression : rotation VISIBLE du servomoteur (v2026.7.121).
// Vrai élément <kablix-servo> en Chrome headless — la consigne `angle` n'est plus
// appliquée d'un coup : le bras poursuit la consigne à la vitesse `speed`
// (secondes par TOUR de 360°, réglable au dixième dans l'inspecteur ; 0 =
// instantané, ancien comportement). On mesure l'angle RÉELLEMENT dessiné
// (transform rotate() du groupe du palonnier), pas la propriété.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-servo');

const entry = `
import '../../src/webview/composants/servo-element.mjs';
import { CATALOG } from '../../src/webview/diagram/catalog.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const mk = async (attrs = {}) => {
		const el = document.createElement('kablix-servo');
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
		document.body.appendChild(el);
		await el.updateComplete;
		return el;
	};
	// Angle RÉELLEMENT dessiné : rotate(<deg> cx cy) du groupe du palonnier.
	const drawn = (el) => {
		const g = el.shadowRoot.querySelector('#horn-rot');
		const m = g && /rotate\\(\\s*([\\d.\\-]+)/.exec(g.getAttribute('transform') ?? '');
		return m ? Number(m[1]) : NaN;
	};

	// --- 1. Catalogue : propriété d'inspecteur au dixième de seconde ------------
	const def = CATALOG.find((p) => p.type === 'servo');
	const prop = def?.props?.find((p) => p.attr === 'speed');
	ok('catalogue : propriété speed présente', !!prop, JSON.stringify(prop ?? null));
	ok('catalogue : réglable au DIXIÈME de seconde (step 0,1)', prop?.step === 0.1, prop?.step);
	ok('catalogue : 0 autorisé (instantané) et bornée', prop?.min === 0 && prop?.max > 0,
		\`\${prop?.min}..\${prop?.max}\`);
	ok('catalogue : défaut 2 s/tour', def?.attrs?.speed === '2', def?.attrs?.speed);

	// --- 2. La rotation N'EST PLUS instantanée ----------------------------------
	// 2 s/tour = 180°/s : à 180° de consigne il faut ~1 s.
	const s = await mk({ speed: '2' });
	ok('départ : bras au repos (0°)', Math.abs(drawn(s)) < 0.01, drawn(s));
	s.angle = 180;
	await s.updateComplete;
	const d0 = drawn(s);
	ok('consigne 180° : le bras NE SAUTE PAS à 180°', d0 < 20, d0);
	await wait(300);
	const d1 = drawn(s);
	ok('après ~0,3 s : le bras a bougé', d1 > d0 + 5, \`\${d0} → \${d1}\`);
	ok('après ~0,3 s : mais pas encore arrivé', d1 < 175, d1);
	await wait(1400);
	const d2 = drawn(s);
	ok('après ~1,7 s : consigne 180° atteinte', Math.abs(d2 - 180) < 0.5, d2);

	// --- 3. Vitesse RÉGLABLE : plus lent = plus loin du but au même instant -----
	const fast = await mk({ speed: '1' });   // 360°/s
	const slow = await mk({ speed: '10' });  // 36°/s
	fast.angle = 180; slow.angle = 180;
	await fast.updateComplete; await slow.updateComplete;
	await wait(300);
	const df = drawn(fast), ds = drawn(slow);
	ok('vitesse suivie : 1 s/tour avance plus vite que 10 s/tour', df > ds + 20, \`\${df} vs \${ds}\`);
	await wait(900);
	ok('1 s/tour : arrivé en ~1,2 s (180° à 360°/s)', Math.abs(drawn(fast) - 180) < 0.5, drawn(fast));
	ok('10 s/tour : toujours en route après 1,2 s', drawn(slow) < 120, drawn(slow));

	// --- 4. speed = 0 → instantané (ancien comportement conservé) ---------------
	const inst = await mk({ speed: '0' });
	inst.angle = 135;
	await inst.updateComplete;
	ok('speed=0 : saut immédiat à la consigne', Math.abs(drawn(inst) - 135) < 0.01, drawn(inst));
	// Valeur invalide → instantané aussi (jamais de bras figé).
	const bad = await mk({ speed: 'x' });
	bad.angle = 90;
	await bad.updateComplete;
	ok('speed invalide : instantané (pas de bras bloqué)', Math.abs(drawn(bad) - 90) < 0.01, drawn(bad));

	// --- 5. Consigne changée EN COURS de route (le servo suit sans à-coup) ------
	const chg = await mk({ speed: '2' });
	chg.angle = 180;
	await chg.updateComplete;
	await wait(400);
	const mid = drawn(chg);
	chg.angle = 0; // demi-tour en pleine course
	await chg.updateComplete;
	await wait(200);
	const back = drawn(chg);
	ok('demi-tour en pleine course : le bras revient', back < mid - 5, \`\${mid} → \${back}\`);
	await wait(900);
	ok('demi-tour : consigne 0° atteinte', Math.abs(drawn(chg)) < 0.5, drawn(chg));

	// --- 6. Consigne bornée 0..180 ---------------------------------------------
	const cl = await mk({ speed: '0' });
	cl.angle = 900;
	await cl.updateComplete;
	ok('consigne hors bornes écrêtée à 180°', Math.abs(drawn(cl) - 180) < 0.01, drawn(cl));
	cl.angle = -50;
	await cl.updateComplete;
	ok('consigne négative écrêtée à 0°', Math.abs(drawn(cl)) < 0.01, drawn(cl));

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
// NB : pas de --virtual-time-budget ici — la rotation se mesure en temps RÉEL
// (rAF), le temps virtuel fausserait les paliers. --timeout borne la page.
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `servo : ${fail} échec(s).` : `servo : ${rows.length} contrôles OK — rotation visible et vitesse réglable.`);
process.exit(fail ? 1 : 0);
