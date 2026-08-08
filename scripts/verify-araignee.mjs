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
	const patteDef = CATALOG.find((p) => p.type === 'patte');
	ok('catalogue : composant araignee présent', !!def);
	ok('catalogue : kind « araignee »', def?.kind === 'araignee', def?.kind);
	ok('catalogue : balise kablix-araignee', def?.tag === 'kablix-araignee', def?.tag);
	ok('catalogue : rangée dans « Système »', def && partCategory(def) === 'Systems', def && partCategory(def));
	// v2026.8.24 : l'adresse ne se choisit plus dans une liste mais par les six
	// pads AD0..AD5 du PCA9685, comme sur le vrai module — tous pontés = 0x7F.
	ok('catalogue : adresse I²C par les pads AD0..AD5 (0x7F par défaut)',
		def?.attrs?.address === '0x7F'
		&& [0, 1, 2, 3, 4, 5].every((b) => def?.attrs?.[\`ad\${b}\`] === '1' && def?.props?.some((p) => p.attr === \`ad\${b}\`))
		&& !def?.props?.some((p) => p.attr === 'address'), def?.attrs?.address);
	ok('catalogue : électronique embarquée MASQUÉE par défaut',
		def?.attrs?.boards === '' && def?.props?.some((p) => p.attr === 'boards'), JSON.stringify(def?.attrs?.boards));
	ok('catalogue : vitesse réglable au dixième', def?.props?.find((p) => p.attr === 'speed')?.step === 0.1);
	// Le robot EST une Pico W : le déposer choisit cette carte comme cible, et
	// le drapeau « pinless » dit à l'éditeur qu'aucun fil ne peut s'y raccrocher.
	ok('catalogue : le robot EST une carte Pico W', def?.board === 'picow', def?.board);
	ok('catalogue : robot déclaré SANS broches (pinless)', def?.pinless === true, String(def?.pinless));
	ok('catalogue : 8 cases d\\'inversion de servo (une par articulation)',
		[0, 1, 2, 3].every((i) => def?.props?.some((p) => p.attr === \`revhip\${i}\`) && def?.props?.some((p) => p.attr === \`revknee\${i}\`)));
	ok('catalogue : la patte a ses 2 cases d\\'inversion',
		patteDef?.props?.some((p) => p.attr === 'revhip') && patteDef?.props?.some((p) => p.attr === 'revknee'));

	// --- 2. Broches : le robot n'en a plus AUCUNE (v2026.8.24) ------------------
	const el = await mk();
	ok('broches : aucune — rien ne se câble au robot', el.pinInfo.length === 0,
		el.pinInfo.map((p) => p.name).join(','));

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
	ok('dessin : plus de bornier ni de nappe (le robot n\\'a plus de connectique)',
		el.shadowRoot.querySelectorAll('.araignee__connector').length === 0);
	// La Pico W est la SEULE pièce verte de la scène (plaque bleu-gris, PCA bleu,
	// batterie noire) : compter ses faces suffit à dire qu'elle est bien posée.
	const verts = [...el.shadowRoot.querySelectorAll('polygon')].filter((q) => {
		const m = (q.getAttribute('fill') ?? '').match(/\\d+/g);
		if (!m) return false;
		const [r, g, b] = m.map(Number);
		return g > 30 && g > r * 1.5 && g > b * 1.4;
	});
	ok('dessin : la carte Pico W est posée sur le dos, toujours visible (circuit vert)',
		verts.length >= 3, verts.length);

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
	// Deux boîtes seulement depuis la v2026.8.24 (PCA9685 + batterie) : la Pico W
	// a quitté la liste, elle est toujours dessinée.
	const shown = await mk({ boards: '1' });
	ok('cartes : dessinées quand « boards » est coché (2 boîtes de plus)',
		polys(shown) >= polys(el) + 6, \`\${polys(el)} → \${polys(shown)}\`);

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

	// --- 6 bis. Sens de montage : un servo vissé à l'envers part de l'autre côté -
	// C'est un réglage MÉCANIQUE : le programme envoie toujours la même consigne,
	// seule la pièce tourne dans l'autre sens (180 − angle).
	const dir = await mk({ speed: '0' });
	dir.hip0 = 30;
	await dir.updateComplete;
	const capDroit = cap(dir.geometry[0]);
	dir.hip0 = 150;
	await dir.updateComplete;
	const capMiroir = cap(dir.geometry[0]);
	const inv = await mk({ speed: '0', revhip0: '1' });
	inv.hip0 = 30;
	await inv.updateComplete;
	ok('inversion : revhip0 = la consigne 30° donne le cap de 150°',
		Math.abs(ecart(cap(inv.geometry[0]), capMiroir)) < 0.01 && Math.abs(ecart(capDroit, capMiroir)) > 1,
		\`\${cap(inv.geometry[0]).toFixed(1)} vs \${capMiroir.toFixed(1)} (droit \${capDroit.toFixed(1)})\`);
	ok('inversion : elle ne touche QUE son articulation',
		[1, 2, 3].every((i) => Math.abs(ecart(cap(inv.geometry[i]), cap(g0[i]))) < 0.01
			&& Math.abs(inv.geometry[i].foot.z - g0[i].foot.z) < 0.01));
	// Genou : 30° et 150° lèvent le pied de la MÊME hauteur (cos ±60°), c'est le
	// côté qui change — on compare donc le pied dans l'espace, pas sa hauteur.
	const kn = await mk({ speed: '0' });
	kn.knee2 = 150;
	await kn.updateComplete;
	const p150 = { ...kn.geometry[2].foot };
	kn.knee2 = 30;
	await kn.updateComplete;
	const p30 = { ...kn.geometry[2].foot };
	const ecartPied = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
	const invk = await mk({ speed: '0', revknee2: '1' });
	invk.knee2 = 30; // inversé → 150 : le pied doit se poser là où 150 le met
	await invk.updateComplete;
	ok('inversion : revknee2 = la consigne 30° pose le pied comme 150°',
		ecartPied(invk.geometry[2].foot, p150) < 0.01 && ecartPied(p150, p30) > 5,
		\`\${ecartPied(invk.geometry[2].foot, p150).toFixed(2)} / \${ecartPied(p150, p30).toFixed(1)}\`);

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
	// La patte a AUSSI ses deux cases d'inversion : servo à l'envers = même
	// consigne, pose miroir. Le repère est le pied EN PLAN (x) et non sa hauteur :
	// 30° et 150° lèvent le pied pareil (cos ±60°), c'est le côté qui change.
	const pied = (q) => \`\${q.geometry.foot.x.toFixed(2)},\${q.geometry.foot.z.toFixed(2)}\`;
	const pRev = await mk({ speed: '0', revknee: '1' }, 'kablix-patte');
	pRev.kneeAngle = 150;
	await pRev.updateComplete;
	const pDroit = await mk({ speed: '0' }, 'kablix-patte');
	pDroit.kneeAngle = 30;
	await pDroit.updateComplete;
	ok('patte seule : revknee inverse le genou (150 inversé = 30 droit)',
		Math.abs(pRev.geometry.foot.x - pDroit.geometry.foot.x) < 0.01
		&& Math.abs(pRev.geometry.foot.z - pDroit.geometry.foot.z) < 0.01,
		\`\${pied(pRev)} vs \${pied(pDroit)}\`);
	pDroit.kneeAngle = 150;
	await pDroit.updateComplete;
	ok('patte seule : sans la case, 150 et 30 donnent bien DEUX poses',
		Math.abs(pDroit.geometry.foot.x - pRev.geometry.foot.x) > 5, \`\${pied(pDroit)} vs \${pied(pRev)}\`);

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
const ed = readFileSync(join(ROOT, 'src/webview/diagram/editor.mts'), 'utf8');
const source = [
  ["sim : le fork est importé (sinon la balise n'existe pas)", /import '\.\/composants\/araignee-element\.mjs';/.test(sim)],
  ['sim : un PCA9685 est instancié pour l\'araignée', /kind === 'araignee'[\s\S]{0,900}new Pca9685Device/.test(sim)],
  ['sim : son adresse vient des pads AD0..AD5', /pca9685Address\(part\.attrs\)/.test(sim)],
  ['sim : applyAraignee() appelée à chaque rafraîchissement', /\n\s*applyAraignee\(\);/.test(sim)],
  ['sim : canaux pairs → hanche, impairs → genou', /ch % 2 === 0 \? 'hip' : 'knee'/.test(sim)],
  ['sim : les 8 canaux sont lus', /ch < 8/.test(sim)],
  // Déposer le robot bascule la carte cible sur la Pico W : c'est `board` de la
  // DÉFINITION qui décide, pas le kind (le robot n'est pas une carte nue).
  ['sim : déposer le robot choisit sa carte (def.board, pas def.kind)',
    /onPartAdded = \(part\) => \{[\s\S]{0,300}partDef\(part\.type\)\.board/.test(sim)],
  // Un vieux schéma câblait le bornier I²C du robot : ces fils ne mènent plus
  // nulle part, l'éditeur les écarte à l'ouverture.
  ['éditeur : les fils visant un composant sans broches sont écartés au chargement',
    /isPinless\(idMap\.get\(e\.partId\)/.test(ed) && /partDef\(type\)\.pinless === true/.test(ed)],
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
