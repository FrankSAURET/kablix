// Test de régression : robot araignée <kablix-araignee> et patte <kablix-patte>
// (v2026.8.9, refondu en VOLUME v2026.8.22). Vrai élément en Chrome headless.
// Les pièges vécus, tous invisibles à la compilation :
//   1. un sous-template passé à `html` au lieu de `svg` de lit : les pattes
//      existent dans le DOM mais en namespace XHTML — JAMAIS dessinées (la
//      fiche d'aide sortait avec le seul châssis) ;
//   2. `speed = 0` (rotation instantanée) : l'angle affiché n'était recopié que
//      par les images d'animation, l'araignée restait donc figée à 90° ;
//   3. le câblage INTERNE (canaux 0..7 → 8 articulations) n'est routé par aucun
//      fil : il vit dans sim.mts, on vérifie donc qu'il y est branché ;
//   4. depuis la 3D, la cinématique se lit dans `geometry` (position des pieds)
//      et non plus dans des `rotate(…)` : mesurer un pied dit si la patte se
//      lève VRAIMENT, ce qu'un angle de rotation à plat ne disait pas.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-araignee');

const entry = `
import '../../src/webview/composants/araignee-element.mjs';
import '../../src/webview/composants/patte-element.mjs';
import { LEG_ALONE, LEG_SPIDER } from '../../src/webview/composants/patte-element.mjs';
import { CATALOG, partCategory, partDef } from '../../src/webview/diagram/catalog.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });
const deg = (rad) => (rad * 180) / Math.PI;
/** Écart d'angle ramené dans -180..180 (comparer deux caps sans piège de tour). */
const ecart = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

async function run() {
	const mk = async (attrs = {}, tag = 'kablix-araignee') => {
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
		document.body.appendChild(el);
		await el.updateComplete;
		return el;
	};
	// La cinématique se lit dans la géométrie 3D dessinée, pas dans le DOM :
	// cap de la patte au sol (direction hanche → genou) et hauteur du pied.
	const cap = (g) => deg(Math.atan2(g.knee.y - g.hip.y, g.knee.x - g.hip.x));
	const polys = (el) => el.shadowRoot.querySelectorAll('polygon').length;

	// --- 1. Catalogue -----------------------------------------------------------
	const def = CATALOG.find((p) => p.type === 'araignee');
	ok('catalogue : composant araignee présent', !!def);
	ok('catalogue : kind « araignee »', def?.kind === 'araignee', def?.kind);
	ok('catalogue : balise kablix-araignee', def?.tag === 'kablix-araignee', def?.tag);
	ok('catalogue : rangée dans « Système »', def && partCategory(def) === 'Systems', def && partCategory(def));
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
	ok('dessin : 4 pattes dans la géométrie', el.geometry.length === 4, el.geometry.length);
	ok('dessin : tout est en namespace SVG (pas XHTML)',
		[...el.shadowRoot.querySelectorAll('polygon')].every((p) => p.namespaceURI === 'http://www.w3.org/2000/svg'));
	// Une patte = 5 boîtes ≈ 3 faces visibles chacune ; moins de 60 polygones en
	// tout = des pattes absentes du rendu, exactement le bug du namespace.
	ok('dessin : les faces des 4 pattes sont sorties (> 60 polygones)', polys(el) > 60, polys(el));
	const bb = svg.getBBox();
	// Châssis + bornier seuls projettent ~134x100 ; avec les pattes, 192x166.
	// Une bbox trop petite = pattes absentes du rendu (le bug du namespace).
	ok('dessin : les pattes DÉBORDENT du châssis (bbox > 170×130)',
		bb.width > 170 && bb.height > 130, \`\${Math.round(bb.width)}x\${Math.round(bb.height)}\`);
	ok('dessin : tout le robot tient dans sa feuille 400×400',
		bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= 400 && bb.y + bb.height <= 400,
		\`\${Math.round(bb.x)},\${Math.round(bb.y)} \${Math.round(bb.width)}x\${Math.round(bb.height)}\`);
	ok('dessin : une ombre au sol par pied (la hauteur ne se voit pas autrement)',
		el.shadowRoot.querySelectorAll('.araignee__shadows ellipse').length === 5, // 4 pieds + le corps
		el.shadowRoot.querySelectorAll('.araignee__shadows ellipse').length);
	ok('broches : le bornier I²C est dessiné À PLAT sur les pastilles de pinInfo',
		[...el.shadowRoot.querySelectorAll('.araignee__connector rect')]
			.filter((r) => el.pinInfo.some((p) => Math.abs(p.y - (Number(r.getAttribute('y')) + Number(r.getAttribute('height')) / 2)) < 0.01)).length === 4);

	// --- 4. Debout : les 4 pieds portent le robot, hanches en croix -------------
	const g0 = el.geometry;
	const solHip = g0[0].hip.z;
	ok('debout (90°/90°) : les 4 pieds à la MÊME hauteur',
		g0.every((g) => Math.abs(g.foot.z - g0[0].foot.z) < 0.01), g0.map((g) => g.foot.z.toFixed(1)).join(' '));
	ok('debout : tibia VERTICAL (le pied tombe d\\'une longueur de tibia)',
		Math.abs(g0[0].foot.z - (solHip - LEG_SPIDER.tibia)) < 0.01, g0[0].foot.z);
	ok('debout : les 4 hanches réparties en croix (90° d\\'écart)',
		[1, 2, 3].every((i) => {
			const e = Math.abs(ecart(deg(Math.atan2(g0[i].hip.y, g0[i].hip.x)), deg(Math.atan2(g0[0].hip.y, g0[0].hip.x))));
			return Math.abs(e - 90) < 0.5 || Math.abs(e - 180) < 0.5;
		}), g0.map((g) => deg(Math.atan2(g.hip.y, g.hip.x)).toFixed(0)).join(' '));

	// --- 5. Électronique embarquée : masquée par défaut, montrée sur demande ----
	const shown = await mk({ boards: '1' });
	ok('cartes : dessinées quand « boards » est coché (3 boîtes de plus)',
		polys(shown) >= polys(el) + 9, \`\${polys(el)} → \${polys(shown)}\`);

	// --- 6. Les 8 articulations sont indépendantes ------------------------------
	// speed=0 : la consigne doit être atteinte IMMÉDIATEMENT (le rappel manquait).
	const inst = await mk({ speed: '0' });
	inst.knee2 = 150;
	await inst.updateComplete;
	const gi = inst.geometry;
	// Genou 150° = tibia relevé de 60° : le pied remonte de tibia·(1 − cos60°).
	ok('speed=0 : genou arrière-gauche à sa consigne tout de suite',
		Math.abs(gi[2].foot.z - (solHip - LEG_SPIDER.tibia * Math.cos(Math.PI / 3))) < 0.01, gi[2].foot.z);
	ok('speed=0 : le pied est bien LEVÉ (la 2D à plat ne le montrait pas)',
		gi[2].foot.z > gi[0].foot.z + 15, \`\${gi[2].foot.z.toFixed(1)} vs \${gi[0].foot.z.toFixed(1)}\`);
	ok('speed=0 : les autres articulations n\\'ont pas bougé',
		[0, 1, 3].every((i) => Math.abs(gi[i].foot.z - g0[i].foot.z) < 0.01 && Math.abs(ecart(cap(gi[i]), cap(g0[i]))) < 0.01));
	inst.hip0 = 0; inst.hip1 = 0;
	await inst.updateComplete;
	const gh = inst.geometry;
	// Patte GAUCHE et patte DROITE reçoivent la MÊME consigne : montées en
	// miroir, elles doivent balayer en sens OPPOSÉ (comme sur le vrai châssis).
	ok('hanche : consigne 0° = 90° de balayage', Math.abs(Math.abs(ecart(cap(gh[0]), cap(g0[0]))) - 90) < 0.01, ecart(cap(gh[0]), cap(g0[0])));
	ok('hanches : la patte de droite est montée en MIROIR (balayage opposé)',
		ecart(cap(gh[0]), cap(g0[0])) * ecart(cap(gh[1]), cap(g0[1])) < 0,
		\`\${ecart(cap(gh[0]), cap(g0[0])).toFixed(0)} / \${ecart(cap(gh[1]), cap(g0[1])).toFixed(0)}\`);
	inst.hip3 = 900; // consigne aberrante
	await inst.updateComplete;
	ok('consigne hors bornes écrêtée à 180°',
		Math.abs(Math.abs(ecart(cap(inst.geometry[3]), cap(g0[3]))) - 90) < 0.01, ecart(cap(inst.geometry[3]), cap(g0[3])));

	// --- 7. Animation : la patte POURSUIT sa consigne à la vitesse réglée -------
	const slow = await mk({ speed: '2' }); // 180°/s
	slow.knee0 = 180;
	await slow.updateComplete;
	const z0 = slow.geometry[0].foot.z;
	ok('animation : le genou NE SAUTE PAS à la consigne', z0 < g0[0].foot.z + 8, z0);
	await wait(300);
	const z1 = slow.geometry[0].foot.z;
	ok('animation : après ~0,3 s le pied est monté', z1 > z0 + 5, \`\${z0.toFixed(1)} → \${z1.toFixed(1)}\`);
	await wait(1200);
	// Genou 180° = tibia tendu à l'horizontale : le pied est à la hauteur du genou.
	ok('animation : consigne atteinte après ~1,5 s', Math.abs(slow.geometry[0].foot.z - solHip) < 0.5, slow.geometry[0].foot.z);

	// --- 8. La patte SEULE : même mécanique, et rien ne dépasse de sa feuille ---
	const p = await mk({ speed: '0' }, 'kablix-patte');
	ok('patte seule : debout, le pied touche le SOL (z = 0, l\\'ombre se colle dessous)',
		Math.abs(p.geometry.foot.z) < 0.01, p.geometry.foot.z);
	const psvg = p.shadowRoot.querySelector('svg');
	const vb = psvg.viewBox.baseVal;
	const dehors = [];
	for (const h of [0, 45, 90, 135, 180]) {
		for (const k of [0, 45, 90, 135, 180]) {
			p.hipAngle = h; p.kneeAngle = k;
			await p.updateComplete;
			const b = psvg.getBBox();
			if (b.x < vb.x || b.y < vb.y || b.x + b.width > vb.x + vb.width || b.y + b.height > vb.y + vb.height) {
				dehors.push(\`\${h}/\${k}\`);
			}
		}
	}
	ok('patte seule : AUCUNE pose ne déborde de la feuille (25 poses)', dehors.length === 0, dehors.join(' '));
	p.hipAngle = 90; p.kneeAngle = 90;
	await p.updateComplete;
	ok('patte seule : les broches restent hors du dessin (colonne x = 10)',
		psvg.getBBox().x > 20 && p.pinInfo.every((q) => q.x === 10), Math.round(psvg.getBBox().x));
	ok('patte seule : plus courte que celles du robot (elle tient dans sa vignette)',
		LEG_ALONE.coxa < LEG_SPIDER.coxa && LEG_ALONE.tibia < LEG_SPIDER.tibia);

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

// --- 9. Câblage interne : branché dans la simulation (aucun fil ne le montre) --
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
console.log(fail ? `araignee : ${fail} échec(s).` : `araignee : ${rows.length} contrôles OK — robot en volume, 8 articulations pilotées par le PCA9685 embarqué.`);
process.exit(fail ? 1 : 0);
