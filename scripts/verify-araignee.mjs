// Test de régression : robot araignée complet <kablix-araignee> (v2026.8.9).
// Vrai élément en Chrome headless. Trois pièges vécus pendant l'écriture du
// composant, tous invisibles à la compilation :
//   1. un sous-template de patte passé à `html` au lieu de `svg` de lit : les
//      quatre pattes existent dans le DOM mais en namespace XHTML — JAMAIS
//      dessinées (la fiche d'aide sortait avec le seul châssis) ;
//   2. `speed = 0` (rotation instantanée) : l'angle affiché n'était recopié que
//      par les images d'animation, l'araignée restait donc figée à 90° ;
//   3. le câblage INTERNE (canaux 0..7 → 8 articulations) n'est routé par aucun
//      fil : il vit dans sim.mts, on vérifie donc qu'il y est branché.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-araignee');

const entry = `
import '../../src/webview/composants/araignee-element.mjs';
import { CATALOG, partCategory, partDef } from '../../src/webview/diagram/catalog.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const mk = async (attrs = {}) => {
		const el = document.createElement('kablix-araignee');
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
		document.body.appendChild(el);
		await el.updateComplete;
		return el;
	};
	// Groupes de patte = enfants du <svg> qui ne sont ni le châssis ni les cartes.
	const legs = (el) => [...el.shadowRoot.querySelector('svg').children]
		.filter((g) => g.id !== 'corps' && g.id !== 'cartes');
	// Angle RÉELLEMENT dessiné : rotate(<deg> …) du groupe de l'articulation.
	const rot = (g) => {
		const m = /rotate\\(\\s*([\\d.\\-]+)/.exec(g?.getAttribute('transform') ?? '');
		return m ? Number(m[1]) : NaN;
	};
	const hipG = (el, i) => legs(el)[i]?.firstElementChild;
	const kneeG = (el, i) => [...(hipG(el, i)?.children ?? [])].find((c) => c.tagName === 'g' && /rotate/.test(c.getAttribute('transform') ?? ''));

	// --- 1. Catalogue -----------------------------------------------------------
	const def = CATALOG.find((p) => p.type === 'araignee');
	ok('catalogue : composant araignee présent', !!def);
	ok('catalogue : kind « araignee »', def?.kind === 'araignee', def?.kind);
	ok('catalogue : balise kablix-araignee', def?.tag === 'kablix-araignee', def?.tag);
	ok('catalogue : rangée dans les actionneurs', def && partCategory(def) === 'Actuators', def && partCategory(def));
	ok('catalogue : adresse I²C réglable (0x40 par défaut)',
		def?.attrs?.address === '0x40' && def?.props?.some((p) => p.attr === 'address'), def?.attrs?.address);
	ok('catalogue : électronique embarquée MASQUÉE par défaut',
		def?.attrs?.boards === '' && def?.props?.some((p) => p.attr === 'boards'), JSON.stringify(def?.attrs?.boards));
	ok('catalogue : vitesse réglable au dixième', def?.props?.find((p) => p.attr === 'speed')?.step === 0.1);

	// --- 2. Broches : le bus I²C SEUL sort du châssis ---------------------------
	const el = await mk();
	const pins = el.pinInfo.map((p) => p.name);
	ok('broches : SCL/SDA/V+/GND et rien d\\'autre',
		pins.length === 4 && ['SCL', 'SDA', 'V+', 'GND'].every((n) => pins.includes(n)), pins.join(','));
	ok('broches : toutes sur la grille de 10 px',
		el.pinInfo.every((p) => p.x % 10 === 0 && p.y % 10 === 0), JSON.stringify(el.pinInfo.map((p) => [p.x, p.y])));

	// --- 3. Les 4 pattes sont VRAIMENT dessinées (piège du namespace) -----------
	const svg = el.shadowRoot.querySelector('svg');
	ok('dessin : 4 groupes de patte', legs(el).length === 4, legs(el).length);
	ok('dessin : pattes en namespace SVG (pas XHTML)',
		legs(el).every((g) => g.namespaceURI === 'http://www.w3.org/2000/svg'),
		legs(el).map((g) => g.namespaceURI).join(' '));
	const bb = svg.getBBox();
	// Le châssis seul mesure 170x160 (110..280 / 120..280) : une bbox de cette
	// taille = pattes absentes du rendu, exactement le bug du namespace.
	ok('dessin : les pattes DÉBORDENT du châssis (bbox > 200 px)',
		bb.width > 200 && bb.height > 200, \`\${Math.round(bb.width)}x\${Math.round(bb.height)}\`);
	ok('dessin : chaque patte a une surface non nulle',
		legs(el).every((g) => g.getBBox().width > 50), legs(el).map((g) => Math.round(g.getBBox().width)).join(','));
	ok('dessin : pattes de DROITE montées en miroir',
		legs(el).filter((g) => /scale\\(1 -1\\)/.test(g.getAttribute('transform') ?? '')).length === 2,
		legs(el).map((g) => g.getAttribute('transform')).join(' | '));

	// --- 4. Électronique embarquée : masquée par défaut, montrée sur demande ----
	ok('cartes : absentes par défaut', !el.shadowRoot.querySelector('#cartes'));
	const shown = await mk({ boards: '1' });
	ok('cartes : dessinées quand « boards » est coché', !!shown.shadowRoot.querySelector('#cartes'));

	// --- 5. Les 8 articulations sont indépendantes ------------------------------
	// speed=0 : la consigne doit être atteinte IMMÉDIATEMENT (le rappel manquait).
	const inst = await mk({ speed: '0' });
	inst.knee2 = 150;
	await inst.updateComplete;
	ok('speed=0 : genou arrière-gauche à sa consigne tout de suite',
		Math.abs(rot(kneeG(inst, 2)) - 60) < 0.01, rot(kneeG(inst, 2)));
	ok('speed=0 : les autres articulations n\\'ont pas bougé',
		[0, 1, 3].every((i) => Math.abs(rot(kneeG(inst, i))) < 0.01) && [0, 1, 2, 3].every((i) => Math.abs(rot(hipG(inst, i))) < 0.01),
		[0, 1, 2, 3].map((i) => \`\${rot(hipG(inst, i))}/\${rot(kneeG(inst, i))}\`).join(' '));
	inst.hip0 = 0; inst.hip1 = 180;
	await inst.updateComplete;
	ok('hanches : 0° et 180° dessinent -90° et +90°',
		Math.abs(rot(hipG(inst, 0)) + 90) < 0.01 && Math.abs(rot(hipG(inst, 1)) - 90) < 0.01,
		\`\${rot(hipG(inst, 0))} / \${rot(hipG(inst, 1))}\`);
	inst.hip3 = 900; // consigne aberrante
	await inst.updateComplete;
	ok('consigne hors bornes écrêtée à 180°', Math.abs(rot(hipG(inst, 3)) - 90) < 0.01, rot(hipG(inst, 3)));

	// --- 6. Animation : la patte POURSUIT sa consigne à la vitesse réglée -------
	const slow = await mk({ speed: '2' }); // 180°/s
	slow.knee0 = 180;
	await slow.updateComplete;
	const d0 = rot(kneeG(slow, 0));
	ok('animation : le genou NE SAUTE PAS à la consigne', d0 < 20, d0);
	await wait(300);
	const d1 = rot(kneeG(slow, 0));
	ok('animation : après ~0,3 s le genou a bougé', d1 > d0 + 5, \`\${d0} → \${d1}\`);
	await wait(1200);
	ok('animation : consigne atteinte après ~1,5 s', Math.abs(rot(kneeG(slow, 0)) - 90) < 1, rot(kneeG(slow, 0)));

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
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body style="margin:0"><script>${b.outputFiles[0].text}</script></body>`);

// --- 7. Câblage interne : branché dans la simulation (aucun fil ne le montre) --
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
const source = [
  ["sim : le fork est importé (sinon la balise n'existe pas)", /import '\.\/composants\/araignee-element\.mjs';/.test(sim)],
  ['sim : un PCA9685 est instancié pour l\'araignée', /kind === 'araignee'[\s\S]{0,400}new Pca9685Device/.test(sim)],
  ['sim : applyAraignee() appelée à chaque rafraîchissement', /\n\s*applyAraignee\(\);/.test(sim)],
  ['sim : canaux pairs → hanche, impairs → genou', /ch % 2 === 0 \? 'hip' : 'knee'/.test(sim)],
  ['sim : les 8 canaux sont lus', /ch < 8/.test(sim)],
];

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
for (const [name, cond] of source) rows.push({ name, ok: !!cond, detail: '' });
let fail = 0;
for (const r of rows) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `araignee : ${fail} échec(s).` : `araignee : ${rows.length} contrôles OK — 4 pattes dessinées, 8 articulations pilotées par le PCA9685 embarqué.`);
process.exit(fail ? 1 : 0);
