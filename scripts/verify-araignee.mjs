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
//      lève VRAIMENT, ce qu'un angle de rotation à plat ne disait pas ;
//   5. depuis la v2026.8.44 le robot est le DESSIN de Frank (trois assemblages
//      de `Composants3D.svg`) : plus une cote n'est écrite dans le code, donc
//      plus une cote n'est écrite ICI. Les contrôles portent sur ce qui doit
//      rester vrai quel que soit le dessin — pieds au sol, tibia rigide, patte
//      droite en miroir de la gauche, rien hors de la feuille.
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
import { robot, legXf, YAW } from '../../src/webview/composants/araignee-element.mjs';
import { SIMPLIFY, SYSTEME_PX } from '../../src/webview/composants/patte-element.mjs';
import { assemblyFaces, project, rotZ } from '../../src/webview/composants/iso3d.mjs';
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
	// cap de la patte au sol (direction coxa → patella) et hauteur du pied.
	const cap = (g) => deg(Math.atan2(g.patella.y - g.coxa.y, g.patella.x - g.coxa.x));
	const polys = (el) => el.shadowRoot.querySelectorAll('polygon').length;
	const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

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
	// v2026.8.58 : la case « montrer l'électronique embarquée » est SUPPRIMÉE
	// (Frank) — le corps est toujours dessiné entier, le PMMA translucide laisse
	// voir ce qu'il y a dedans.
	ok('catalogue : plus de case « électronique embarquée »',
		def?.attrs?.boards === undefined && !def?.props?.some((p) => p.attr === 'boards'),
		JSON.stringify(def?.attrs?.boards));
	ok('catalogue : vitesse réglable au dixième', def?.props?.find((p) => p.attr === 'speed')?.step === 0.1);
	// Le robot EST une Pico W : le déposer choisit cette carte comme cible, et
	// le drapeau « pinless » dit à l'éditeur qu'aucun fil ne peut s'y raccrocher.
	ok('catalogue : le robot EST une carte Pico W', def?.board === 'picow', def?.board);
	ok('catalogue : robot déclaré SANS broches (pinless)', def?.pinless === true, String(def?.pinless));
	ok('catalogue : 8 cases d\\'inversion de servo (une par articulation)',
		[0, 1, 2, 3].every((i) => def?.props?.some((p) => p.attr === \`revcoxa\${i}\`) && def?.props?.some((p) => p.attr === \`revpatella\${i}\`)));
	ok('catalogue : la patte a ses 2 cases d\\'inversion',
		patteDef?.props?.some((p) => p.attr === 'revcoxa') && patteDef?.props?.some((p) => p.attr === 'revpatella'));
	// Calage du palonnier : un tour complet de chaque côté, réglable au degré.
	const zeroDef = (d, a) => d?.props?.find((p) => p.attr === a);
	ok('catalogue : 8 réglages de zéro de servo (un par articulation)',
		[0, 1, 2, 3].every((i) => zeroDef(def, \`zerocoxa\${i}\`) && zeroDef(def, \`zeropatella\${i}\`)));
	ok('catalogue : le zéro va de −360 à +360°, au degré',
		[def, patteDef].every((d) => (d === def ? ['zerocoxa0', 'zeropatella3'] : ['zerocoxa', 'zeropatella'])
			.every((a) => zeroDef(d, a)?.kind === 'number' && zeroDef(d, a)?.min === -360
				&& zeroDef(d, a)?.max === 360 && zeroDef(d, a)?.step === 1)));
	ok('catalogue : la patte a ses 2 réglages de zéro',
		!!zeroDef(patteDef, 'zerocoxa') && !!zeroDef(patteDef, 'zeropatella'));

	// --- 2. Broches : le robot n'en a plus AUCUNE (v2026.8.24) ------------------
	const el = await mk();
	ok('broches : aucune — rien ne se câble au robot', el.pinInfo.length === 0,
		el.pinInfo.map((p) => p.name).join(','));

	// --- 3. Le robot vient du DESSIN, et il est VRAIMENT dessiné ---------------
	// Rien n'est codé en dur : les trois assemblages doivent être là, et les
	// quatre coxas sortir des pastilles rouges du corps.
	const R = robot();
	ok('dessin : les trois assemblages sont lus (corps, fémur, tibia)',
		!!R && !!R.corps && !!R.leg?.femur && !!R.leg?.tibia);
	ok('dessin : 4 coxas lues sur les pastilles du corps', R?.coxas?.length === 4, R?.coxas?.length);
	ok('dessin : la patella vient des deux pastilles « patella » (fémur et tibia)',
		!!R?.leg?.patellaF && !!R?.leg?.patellaT && !!R?.leg?.coxaF);
	// Deux pattes à gauche (x < 0), deux à droite : c'est ce qui donne les deux
	// sens de balayage. Une planche redessinée de travers se verrait ici.
	ok('dessin : deux coxas à gauche, deux à droite (montage en miroir)',
		R?.mirror?.filter(Boolean).length === 2, R?.mirror?.join(','));
	const svg = el.shadowRoot.querySelector('svg');
	ok('dessin : 4 pattes dans la géométrie', el.geometry.length === 4, el.geometry.length);
	ok('dessin : tout est en namespace SVG (pas XHTML)',
		[...el.shadowRoot.querySelectorAll('polygon')].every((p) => p.namespaceURI === 'http://www.w3.org/2000/svg'));
	// Le corps seul sort ~250 polygones : moins de 400 en tout = des pattes
	// absentes du rendu, exactement le bug du namespace.
	ok('dessin : les faces des 4 pattes sont sorties (> 400 polygones)', polys(el) > 400, polys(el));
	// … et pas dix fois trop : les contours Inkscape non allégés donnaient 2 900
	// polygones et 26 ms par image, une marche en diaporama.
	ok('dessin : contours allégés (< 1 500 polygones, sinon l\\'animation rame)', polys(el) < 1500, polys(el));
	const bb = svg.getBBox();
	// La feuille est réglée UNE FOIS pour tout le système (SYSTEME_PX, v2026.8.62) :
	// le banc la LIT sur le dessin au lieu de la recopier, et tout ce qui suit se
	// mesure en fraction d'elle — la doubler ne doit rien casser.
	const feuille = svg.viewBox.baseVal;
	ok('dessin : la feuille fait la taille voulue du système, une seule fois réglée',
		feuille.width === SYSTEME_PX && feuille.height === SYSTEME_PX,
		feuille.width + 'x' + feuille.height + ' pour ' + SYSTEME_PX);
	// Le robot doit REMPLIR sa feuille (marges et ombres mises à part) : c'est ce
	// qui fait qu'agrandir la feuille agrandit le robot. Une bbox trop petite =
	// pattes absentes du rendu (le bug du namespace).
	ok('dessin : le robot remplit sa feuille (le cadrage suit la taille voulue)',
		bb.width > feuille.width * 0.6 && bb.height > feuille.height * 0.4,
		\`\${Math.round(bb.width)}x\${Math.round(bb.height)} dans \${feuille.width}\`);
	ok('dessin : tout le robot tient dans sa feuille',
		bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= feuille.width && bb.y + bb.height <= feuille.height,
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

	// --- 4. Debout : les 4 pieds portent le robot -------------------------------
	const g0 = el.geometry;
	const solHip = g0[0].coxa.z;
	ok('debout (90°/90°) : les 4 pieds à la MÊME hauteur',
		g0.every((g) => Math.abs(g.foot.z - g0[0].foot.z) < 0.01), g0.map((g) => g.foot.z.toFixed(1)).join(' '));
	// Le SOL est z = 0 : c'est là que se collent les ombres, et c'est le dessin
	// qui décide de la hauteur du robot — pas une constante.
	ok('debout : les pieds touchent le sol (z = 0, sous les ombres)',
		Math.abs(g0[0].foot.z) < 0.01, g0[0].foot.z.toFixed(3));
	ok('debout : les 4 coxas à la même hauteur (le corps est de niveau)',
		g0.every((g) => Math.abs(g.coxa.z - solHip) < 0.01), g0.map((g) => g.coxa.z.toFixed(1)).join(' '));
	ok('debout : les pieds sont PLUS ÉCARTÉS que les coxas (pattes vers dehors)',
		Math.max(...g0.map((g, i) => dist(g.foot, g0[(i + 2) % 4].foot)))
		> Math.max(...g0.map((g, i) => dist(g.coxa, g0[(i + 2) % 4].coxa))));
	ok('debout : le corps est au-dessus du sol', solHip > 20, solHip.toFixed(1));

	// --- 5. Électronique embarquée : TOUJOURS dessinée, jamais devant les pattes -
	// v2026.8.58 : plus de case à cocher (Frank) — la batterie, le PCA9685 et la
	// Pico W font partie du dessin, le PMMA translucide les laisse voir.
	ok('cartes : batterie et PCA9685 font partie du corps dessiné',
		['batterie', 'pca9685'].every((n) => R?.corps?.pieces?.some((p) => p.name === n)),
		R?.corps?.pieces?.map((p) => p.name).join(','));
	// Depuis la v2026.8.65 les deux cartes portent leur PHOTO, détourée par le
	// clip-path du dessin : elles ne sont plus une couleur mais une image plaquée.
	// La voir dans le DOM dit qu'elles sont dessinées sans avoir à cocher quoi que
	// ce soit — et que le bitmap est bien EMBARQUÉ (la webview interdit le réseau).
	const photos = [...el.shadowRoot.querySelectorAll('image')]
		.filter((q) => (q.getAttribute('href') ?? '').startsWith('data:image/'));
	ok('cartes : les deux photos de cartes sont plaquées, sans rien cocher (bitmap embarqué)',
		photos.length >= 2, photos.length);
	// Et elles sont plaquées PAR UNE MATRICE sur un carré unité : c'est ce qui les
	// pose de biais sur la face, au lieu d'un rectangle collé à l'écran.
	ok('cartes : la photo suit la face en volume (matrice, pas un collage droit)',
		photos.every((q) => q.getAttribute('width') === '1'
			&& /matrix\\(/.test(q.getAttribute('transform') ?? '')));
	// Le piège corrigé en v2026.8.58 : empilement() décalait une pièce de sa
	// DIAGONALE (arrière → avant) au lieu de la profondeur à laquelle elle sera
	// peinte. Les deux plaques de PMMA du corps partaient 27 unités en avant et
	// recouvraient les servos des pattes. On mesure donc les profondeurs de rendu.
	const moy = (fs) => fs.reduce((s, f) => s + f.z, 0) / Math.max(fs.length, 1);
	const parPiece = (faces) => {
		const m = new Map();
		for (const f of faces) {
			if (!m.has(f.g)) m.set(f.g, []);
			m.get(f.g).push(f);
		}
		return [...m.values()];
	};
	const teinte = (fs) => (fs[0].fill.match(/[\\d.]+/g) ?? []).map(Number);
	const isoOpts = { scale: R.k, simplify: SIMPLIFY };
	const corpsF = assemblyFaces(R.corps, { ...isoOpts,
		xf: (p) => rotZ({ x: p.x, y: p.y, z: p.z + R.ground }, YAW) });
	// Plaques du corps : le PMMA blanc translucide (r ≈ g ≈ b, clair).
	const plaques = parPiece(corpsF).filter((fs) => {
		const [r, g, b] = teinte(fs);
		return r > 90 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12;
	});
	// Servos de fémur : les seules pièces VIOLETTES (r et b > g).
	const servos = [];
	for (let i = 0; i < 4; i++) {
		for (const fs of parPiece(assemblyFaces(R.leg.femur, { ...isoOpts, xf: legXf(R, i, 90, 120).femur }))) {
			const [r, g, b] = teinte(fs);
			if (r > g * 1.3 && b > g * 1.3) servos.push(moy(fs));
		}
	}
	ok('empilement : les plaques du corps et les servos des pattes sont mesurés',
		plaques.length >= 2 && servos.length >= 4, \`\${plaques.length} plaques, \${servos.length} servos\`);
	// La patte avant est DEVANT le corps : son servo doit être peint après les
	// plaques. Avant le correctif : plaques à 111, servo le plus avancé à 65.
	ok('empilement : les plaques du corps ne recouvrent plus les servos des pattes',
		Math.max(...servos) > Math.max(...plaques.map(moy)),
		\`plaques \${plaques.map((fs) => moy(fs).toFixed(1)).join('/')} vs servos \${servos.map((v) => v.toFixed(1)).join('/')}\`);

	// --- 5 bis. Les yeux : une PIÈCE de la planche (v2026.8.65) -----------------
	// Un disque rouge « araignee-corps-yeux », posé sur le pont et doublé par
	// miroir=x. Plus une seule cote dans le code : c'est le dessin qui les met
	// là, et l'empilement qui les fait passer devant le PMMA translucide.
	const oeil = R.corps.pieces.find((p) => p.name === 'yeux');
	ok('yeux : la pièce « yeux » est dans le corps, doublée par miroir=x',
		!!oeil && oeil.miroir === 'x' && Math.abs(oeil.pos.x) > 0.1,
		oeil ? JSON.stringify(oeil.pos) + ' miroir=' + oeil.miroir : 'pièce absente');
	const rOeil = oeil ? Math.max(oeil.w, oeil.h) / 2 : 0;
	const yx = oeil
		? [-1, 1].map((s) => ({ c: { x: s * Math.abs(oeil.pos.x), y: oeil.pos.y, z: oeil.pos.z }, r: rOeil }))
		: [];
	ok('yeux : deux, et symétriques par rapport à l\\'axe du robot',
		yx.length === 2 && Math.abs(yx[0].c.x + yx[1].c.x) < 0.01
		&& Math.abs(yx[0].c.y - yx[1].c.y) < 0.01 && Math.abs(yx[0].c.z - yx[1].c.z) < 0.01,
		JSON.stringify(yx));
	const pont = R.corps.pieces.filter((p) => p.plan === 'dessus' && p.name !== 'yeux')
		.sort((a, b) => b.w * b.h - a.w * a.h)[0];
	const ysPont = pont.poly.map((q) => q.y + pont.pos.y);
	const yAvant = Math.min(...ysPont);
	const yArriere = Math.max(...ysPont);
	// L'AVANT, c'est le y le plus petit (y croissant = vers l'arrière).
	ok('yeux : sur le NEZ, dans le quart avant du pont',
		yx.every((e) => e.c.y < yAvant + (yArriere - yAvant) / 4),
		yx.map((e) => e.c.y.toFixed(1)).join(' ') + ' dans ' + yAvant.toFixed(1) + '..' + yArriere.toFixed(1));
	// … et POSÉS dessus : le nez est arrondi, deux yeux trop avancés dépasseraient
	// dans le vide. On teste le disque entier, pas son centre.
	const dedans = (poly, p) => {
		let c = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const a = poly[i], b = poly[j];
			if ((a.y > p.y) !== (b.y > p.y)
				&& p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
		}
		return c;
	};
	ok('yeux : entièrement posés sur le pont (rien ne dépasse dans le vide)',
		yx.every((e) => Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6).every((t) =>
			dedans(pont.poly, {
				x: e.c.x - pont.pos.x + e.r * Math.cos(t),
				y: e.c.y - pont.pos.y + e.r * Math.sin(t),
			}))));
	// Sur la face SUPÉRIEURE de la plaque du haut (miroir=z en pose deux) : un œil
	// calé sur la plaque du bas serait noyé dans le corps.
	const zPont = (pont.miroir && pont.miroir.includes('z') ? Math.abs(pont.pos.z) : pont.pos.z)
		+ pont.ep / 2;
	ok('yeux : posés SUR la face du dessus du pont, pas dedans',
		yx.every((e) => e.c.z > zPont && e.c.z < zPont + e.r),
		yx.map((e) => e.c.z.toFixed(2)).join(' ') + ' vs ' + zPont.toFixed(2));
	// Le piège : le PMMA du pont est TRANSLUCIDE, donc peint d'un bloc à sa
	// profondeur MOYENNE — il repasse par-dessus le nez et éteint les yeux.
	// C'est empilement() qui les remonte, on le mesure sur les faces rendues.
	// Une plaque translucide est peinte d'un bloc, à sa profondeur MOYENNE : c'est
	// donc elle qu'il faut battre, et la face rouge la plus en arrière qui décide.
	const estRouge = (fs) => { const [r, g, b] = teinte(fs); return r > 100 && r > g * 2.5 && r > b * 2.5; };
	const yf = parPiece(corpsF).filter(estRouge);
	ok('yeux : peints DEVANT le corps (le PMMA translucide ne les éteint pas)',
		yf.length === 2 && Math.min(...yf.flat().map((f) => f.z)) > Math.max(...plaques.map(moy)),
		'yeux ' + Math.min(...yf.flat().map((f) => f.z)).toFixed(1)
		+ ' vs PMMA ' + plaques.map((fs) => moy(fs).toFixed(1)).join('/'));
	// Et rouges pour de vrai, dans le DOM : c'est la seule couleur rouge de la
	// scène (PMMA clair, cartes verte et bleue, servos noirs, os gris).
	const rouges = [...el.shadowRoot.querySelectorAll('polygon')].filter((q) => {
		const m = (q.getAttribute('fill') ?? '').match(/[\\d.]+/g);
		if (!m) return false;
		const [r, g, b] = m.map(Number);
		return r > 100 && r > g * 2.5 && r > b * 2.5;
	});
	ok('yeux : deux pastilles rouges dessinées (faces rouges dans le DOM)',
		rouges.length >= 4, rouges.length);

	// --- 6. Les 8 articulations sont indépendantes ------------------------------
	// speed=0 : la consigne doit être atteinte IMMÉDIATEMENT (le rappel manquait).
	const inst = await mk({ speed: '0' });
	const tibia0 = dist(g0[2].patella, g0[2].foot);
	inst.patella2 = 150;
	await inst.updateComplete;
	const gi = inst.geometry;
	// Le tibia est une PIÈCE : sa longueur ne change pas avec la pose. C'est le
	// contrôle qui attrape un pivot pris au mauvais endroit (le pied se mettait à
	// glisser le long de la patte au lieu de tourner autour de la patella).
	ok('speed=0 : le tibia reste RIGIDE en pliant la patella',
		Math.abs(dist(gi[2].patella, gi[2].foot) - tibia0) < 0.01,
		\`\${dist(gi[2].patella, gi[2].foot).toFixed(2)} vs \${tibia0.toFixed(2)}\`);
	ok('speed=0 : le pied est bien LEVÉ (la 2D à plat ne le montrait pas)',
		gi[2].foot.z > gi[0].foot.z + 15, \`\${gi[2].foot.z.toFixed(1)} vs \${gi[0].foot.z.toFixed(1)}\`);
	ok('speed=0 : la patella, lui, n\\'a pas bougé (il est porté par la coxa)',
		dist(gi[2].patella, g0[2].patella) < 0.01, dist(gi[2].patella, g0[2].patella).toFixed(3));
	ok('speed=0 : les autres articulations n\\'ont pas bougé',
		[0, 1, 3].every((i) => Math.abs(gi[i].foot.z - g0[i].foot.z) < 0.01 && Math.abs(ecart(cap(gi[i]), cap(g0[i]))) < 0.01));
	inst.coxa0 = 0; inst.coxa1 = 0;
	await inst.updateComplete;
	const gh = inst.geometry;
	// Patte GAUCHE et patte DROITE reçoivent la MÊME consigne : montées en
	// miroir, elles doivent balayer en sens OPPOSÉ (comme sur le vrai châssis).
	ok('coxa : consigne 0° = 90° de balayage', Math.abs(Math.abs(ecart(cap(gh[0]), cap(g0[0]))) - 90) < 0.01, ecart(cap(gh[0]), cap(g0[0])));
	ok('coxas : la patte de droite est montée en MIROIR (balayage opposé)',
		ecart(cap(gh[0]), cap(g0[0])) * ecart(cap(gh[1]), cap(g0[1])) < 0,
		\`\${ecart(cap(gh[0]), cap(g0[0])).toFixed(0)} / \${ecart(cap(gh[1]), cap(g0[1])).toFixed(0)}\`);
	inst.coxa3 = 900; // consigne aberrante
	await inst.updateComplete;
	ok('consigne hors bornes écrêtée à 180°',
		Math.abs(Math.abs(ecart(cap(inst.geometry[3]), cap(g0[3]))) - 90) < 0.01, ecart(cap(inst.geometry[3]), cap(g0[3])));

	// --- 6 bis. Sens de montage : un servo vissé à l'envers part de l'autre côté -
	// C'est un réglage MÉCANIQUE : le programme envoie toujours la même consigne,
	// seule la pièce tourne dans l'autre sens (180 − angle).
	const dir = await mk({ speed: '0' });
	dir.coxa0 = 30;
	await dir.updateComplete;
	const capDroit = cap(dir.geometry[0]);
	dir.coxa0 = 150;
	await dir.updateComplete;
	const capMiroir = cap(dir.geometry[0]);
	const inv = await mk({ speed: '0', revcoxa0: '1' });
	inv.coxa0 = 30;
	await inv.updateComplete;
	ok('inversion : revcoxa0 = la consigne 30° donne le cap de 150°',
		Math.abs(ecart(cap(inv.geometry[0]), capMiroir)) < 0.01 && Math.abs(ecart(capDroit, capMiroir)) > 1,
		\`\${cap(inv.geometry[0]).toFixed(1)} vs \${capMiroir.toFixed(1)} (droit \${capDroit.toFixed(1)})\`);
	ok('inversion : elle ne touche QUE son articulation',
		[1, 2, 3].every((i) => Math.abs(ecart(cap(inv.geometry[i]), cap(g0[i]))) < 0.01
			&& Math.abs(inv.geometry[i].foot.z - g0[i].foot.z) < 0.01));
	// Patella : 30° et 150° lèvent le pied de la MÊME hauteur (cos ±60°), c'est le
	// côté qui change — on compare donc le pied dans l'espace, pas sa hauteur.
	const kn = await mk({ speed: '0' });
	kn.patella2 = 150;
	await kn.updateComplete;
	const p150 = { ...kn.geometry[2].foot };
	kn.patella2 = 30;
	await kn.updateComplete;
	const p30 = { ...kn.geometry[2].foot };
	const ecartPied = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
	const invk = await mk({ speed: '0', revpatella2: '1' });
	invk.patella2 = 30; // inversé → 150 : le pied doit se poser là où 150 le met
	await invk.updateComplete;
	ok('inversion : revpatella2 = la consigne 30° pose le pied comme 150°',
		ecartPied(invk.geometry[2].foot, p150) < 0.01 && ecartPied(p150, p30) > 5,
		\`\${ecartPied(invk.geometry[2].foot, p150).toFixed(2)} / \${ecartPied(p150, p30).toFixed(1)}\`);

	// --- 6 ter. Calage du palonnier : le zéro de CHAQUE servo (v2026.8.49) -----
	// Le bras se remonte cannelure par cannelure : le décalage dit quel angle la
	// pièce dessine quand le programme envoie 0°. Il s'ajoute APRÈS l'inversion.
	const zc = await mk({ speed: '0', zerocoxa0: '30' });
	zc.coxa0 = 60;
	await zc.updateComplete;
	ok('zéro : zerocoxa0 = 30 décale la consigne 60° sur le cap de 90°',
		Math.abs(ecart(cap(zc.geometry[0]), cap(g0[0]))) < 0.01,
		\`\${cap(zc.geometry[0]).toFixed(1)} vs \${cap(g0[0]).toFixed(1)}\`);
	ok('zéro : il ne touche QUE son articulation',
		[1, 2, 3].every((i) => Math.abs(ecart(cap(zc.geometry[i]), cap(g0[i]))) < 0.01
			&& Math.abs(zc.geometry[i].foot.z - g0[i].foot.z) < 0.01));
	// Cumul : inversé (180 − 30 = 150) puis décalé de −60 → 90, la pose de repos.
	const zr = await mk({ speed: '0', revcoxa0: '1', zerocoxa0: '-60' });
	zr.coxa0 = 30;
	await zr.updateComplete;
	ok('zéro : il s\\'ajoute APRÈS l\\'inversion (rev puis décalage)',
		Math.abs(ecart(cap(zr.geometry[0]), cap(g0[0]))) < 0.01,
		\`\${cap(zr.geometry[0]).toFixed(1)} vs \${cap(g0[0]).toFixed(1)}\`);
	// Patella : la consigne 30 décalée de +120 doit poser le pied comme 150.
	const zk = await mk({ speed: '0', zeropatella2: '120' });
	zk.patella2 = 30;
	await zk.updateComplete;
	ok('zéro : zeropatella2 = 120 pose le pied comme la consigne 150°',
		ecartPied(zk.geometry[2].foot, p150) < 0.01,
		ecartPied(zk.geometry[2].foot, p150).toFixed(2));
	// Un décalage aberrant est écrêté au tour complet, pas propagé tel quel.
	const zx = await mk({ speed: '0', zerocoxa1: '5000' });
	zx.coxa1 = 90;
	await zx.updateComplete;
	ok('zéro : un décalage aberrant est écrêté à ±360°',
		Math.abs(ecart(cap(zx.geometry[1]), cap(g0[1]))) < 0.01,
		ecart(cap(zx.geometry[1]), cap(g0[1])).toFixed(2));

	// --- 6 quater. La pose de Frank : mêmes angles = même hauteur (v2026.8.63) --
	// Question posée sur la dernière pose de araignee-pico.py (coxa 115,
	// patella 130 sur les quatre pattes, avec ses réglages de montage) : les
	// pointes de tibia n'ont pas l'air à la même hauteur. Mesure : elles y sont
	// AU MILLIÈME. Ce qui trompe l'œil est la vue de biais — un pied plus loin
	// monte à l'écran sans monter d'un millimètre. On vérifie donc les deux : la
	// hauteur vraie (égale) et la hauteur d'écran (différente, et c'est normal).
	const FRANK = { speed: '0', revcoxa2: '1', revcoxa3: '1',
		zerocoxa0: '-14', zerocoxa1: '-14', zerocoxa2: '14', zerocoxa3: '14' };
	const fr = await mk(FRANK);
	for (let i = 0; i < 4; i++) { fr['coxa' + i] = 115; fr['patella' + i] = 130; }
	await fr.updateComplete;
	const gf = fr.geometry;
	ok('pose de Frank : les 4 pointes de tibia sont à la MÊME hauteur',
		gf.every((g) => Math.abs(g.foot.z - gf[0].foot.z) < 0.001),
		gf.map((g) => g.foot.z.toFixed(3)).join(' '));
	ok('pose de Frank : les pieds sont LEVÉS (la patella pliée les décolle)',
		gf[0].foot.z > 20, gf[0].foot.z.toFixed(1));
	// Symétrie gauche/droite, mesurée dans le monde : il faut défaire le lacet de
	// présentation (YAW), sinon deux points symétriques n'ont ni le même x ni le
	// même y à l'écran — et c'est exactement ce qui donne l'illusion.
	const sansLacet = (p) => rotZ(p, -YAW);
	const paire = (a, b) => {
		const u = sansLacet(gf[a].foot);
		const v = sansLacet(gf[b].foot);
		return Math.hypot(u.x + v.x, u.y - v.y, u.z - v.z);
	};
	// Tolérance d'un dixième d'unité : les coxas arrière du DESSIN ne sont pas
	// symétriques au centième de millimètre (18,9 à gauche, 18,89 à droite), et
	// un dixième de degré de lacet se voit au bout d'un tibia. La hauteur, elle,
	// reste juste au millième — c'est elle qui est en cause ici.
	ok('pose de Frank : patte gauche et patte droite sont en miroir (avant)',
		paire(0, 1) < 0.2, paire(0, 1).toFixed(3));
	ok('pose de Frank : idem à l\\'arrière', paire(2, 3) < 0.2, paire(2, 3).toFixed(3));
	// L'écran, lui, les étale : c'est la profondeur, pas la hauteur. La preuve
	// visible à l'écran est l'OMBRE, posée à la verticale sous le pied — l'écart
	// pied-ombre vaut exactement la hauteur du pied dans cette projection.
	const ecran = gf.map((g) => project(g.foot).y);
	ok('pose de Frank : à l\\'écran elles sont à des hauteurs DIFFÉRENTES (vue de biais)',
		Math.max(...ecran) - Math.min(...ecran) > 50,
		ecran.map((v) => v.toFixed(0)).join(' '));
	ok('pose de Frank : l\\'ombre de chaque pied tombe pile à sa hauteur sous lui',
		gf.every((g) => {
			const sol = project({ x: g.foot.x, y: g.foot.y, z: 0 });
			const pied = project(g.foot);
			return Math.abs(sol.x - pied.x) < 0.01 && Math.abs(sol.y - pied.y - g.foot.z) < 0.01;
		}));
	// Et le vrai défaut trouvé en cherchant : l'échelle d'impulsion. Le PCA9685
	// lisait 1000-2000 µs quand le composant est réglé sur 500-2500 : la consigne
	// 130° (1944 µs) faisait tourner l'articulation jusqu'à 169,9°.
	const echelle = (us, min = 500, max = 2500) =>
		Math.max(0, Math.min(180, ((us - min) / (max - min)) * 180));
	const us130 = 500 + Math.floor((130 * 2000) / 180);
	ok('impulsion : 130° commandés donnent bien 130° dessinés (500-2500 µs)',
		Math.abs(echelle(us130) - 130) < 0.6, echelle(us130).toFixed(1));
	ok('impulsion : l\\'ancienne échelle 1000-2000 donnait 169,9° pour 130°',
		Math.abs(echelle(us130, 1000, 2000) - 169.9) < 0.6, echelle(us130, 1000, 2000).toFixed(1));

	// --- 7. Animation : la patte POURSUIT sa consigne à la vitesse réglée -------
	// La cible est mesurée sur une instance instantanée (speed = 0) : le dessin
	// décide où tombe le pied, le test ne fait que vérifier qu'on y arrive.
	const cible = await mk({ speed: '0' });
	cible.patella0 = 180;
	await cible.updateComplete;
	const but = { ...cible.geometry[0].foot };
	const slow = await mk({ speed: '2' }); // 180°/s
	slow.patella0 = 180;
	await slow.updateComplete;
	const z0 = slow.geometry[0].foot.z;
	ok('animation : la patella NE SAUTE PAS à la consigne', z0 < g0[0].foot.z + 8, z0);
	await wait(300);
	const z1 = slow.geometry[0].foot.z;
	ok('animation : après ~0,3 s le pied est monté', z1 > z0 + 5, \`\${z0.toFixed(1)} → \${z1.toFixed(1)}\`);
	await wait(1200);
	ok('animation : consigne atteinte après ~1,5 s', dist(slow.geometry[0].foot, but) < 0.5,
		dist(slow.geometry[0].foot, but).toFixed(2));

	// --- 7 bis. Aucune pose ne sort de la feuille (25 poses, ombres comprises) --
	// Le cadrage est calculé sur le débattement complet des quatre pattes : c'est
	// ce qui remplace l'échelle codée en dur. Un dessin plus long rentre tout
	// seul — mais s'il rentrait mal, le robot serait rogné dans l'atelier sans
	// que rien d'autre ne le dise.
	const pose = await mk({ speed: '0' });
	const psheet = pose.shadowRoot.querySelector('svg');
	const pvb = psheet.viewBox.baseVal;
	const sortis = [];
	for (const h of [0, 45, 90, 135, 180]) {
		for (const k of [0, 45, 90, 135, 180]) {
			for (let i = 0; i < 4; i++) { pose['coxa' + i] = h; pose['patella' + i] = k; }
			await pose.updateComplete;
			const b = psheet.getBBox();
			if (b.x < pvb.x || b.y < pvb.y || b.x + b.width > pvb.x + pvb.width || b.y + b.height > pvb.y + pvb.height) sortis.push(h + '/' + k);
		}
	}
	ok('cadrage : AUCUNE des 25 poses ne déborde de la feuille', sortis.length === 0, sortis.join(' '));

	// --- 8. La patte SEULE : même mécanique, et rien ne dépasse de sa feuille ---
	const p = await mk({ speed: '0' }, 'kablix-patte');
	ok('patte seule : debout, le pied touche le SOL (z = 0, l\\'ombre se colle dessous)',
		Math.abs(p.geometry.foot.z) < 0.01, p.geometry.foot.z);
	const psvg = p.shadowRoot.querySelector('svg');
	const vb = psvg.viewBox.baseVal;
	const dehors = [];
	for (const h of [0, 45, 90, 135, 180]) {
		for (const k of [0, 45, 90, 135, 180]) {
			p.coxaAngle = h; p.patellaAngle = k;
			await p.updateComplete;
			const b = psvg.getBBox();
			if (b.x < vb.x || b.y < vb.y || b.x + b.width > vb.x + vb.width || b.y + b.height > vb.y + vb.height) {
				dehors.push(\`\${h}/\${k}\`);
			}
		}
	}
	ok('patte seule : AUCUNE pose ne déborde de la feuille (25 poses)', dehors.length === 0, dehors.join(' '));
	p.coxaAngle = 90; p.patellaAngle = 90;
	await p.updateComplete;
	ok('patte seule : la mécanique est VRAIMENT dessinée (fémur + tibia)', polys(p) > 40, polys(p));
	// Depuis la v2026.8.48 la patte seule est le MÊME dessin que celles du robot,
	// montée toute nue : les proportions doivent coller au millième près, seule
	// l'échelle de la vignette change.
	const rapport = (g) => dist(g.coxa, g.patella) / dist(g.patella, g.foot);
	ok('patte seule : c\\'est la MÊME patte que celles du robot (mêmes proportions)',
		Math.abs(rapport(p.geometry) - rapport(g0[0])) < 0.01,
		\`\${rapport(p.geometry).toFixed(3)} vs \${rapport(g0[0]).toFixed(3)}\`);
	// Le CONNECTEUR (dessin de Frank) : deux borniers nommés, trois carrés dorés
	// chacun, et les six broches posées PILE dessus — six points nus alignés ne
	// disaient pas quel fil allait où.
	const plug = p.shadowRoot.querySelector('.leg__plug');
	const golds = [...p.shadowRoot.querySelectorAll('.leg__plug rect')]
		.filter((r) => ((r.getAttribute('style') ?? '') + (r.getAttribute('fill') ?? '')).toLowerCase().includes('#f6d32d'));
	const textes = [...p.shadowRoot.querySelectorAll('.leg__plug text')].map((t) => t.textContent.trim());
	// La feuille est en unités = pixels (width = viewBox) : un rectangle mesuré à
	// l'écran se compare donc directement aux coordonnées des broches.
	const sr = psvg.getBoundingClientRect();
	const centres = golds.map((r) => {
		const b = r.getBoundingClientRect();
		return { x: b.x - sr.x + b.width / 2, y: b.y - sr.y + b.height / 2 };
	});
	ok('patte seule : le connecteur de Frank est incrusté', !!plug && golds.length === 6, golds.length);
	ok('patte seule : les deux borniers sont NOMMÉS (Coxa, Patella)',
		textes.includes('Coxa') && textes.includes('Patella'), textes.join(' '));
	ok('patte seule : chaque broche tombe sur son carré doré',
		p.pinInfo.length === 6 && p.pinInfo.every((q) => centres.some((c) => Math.abs(c.x - q.x) < 1.5 && Math.abs(c.y - q.y) < 1.5)),
		centres.map((c) => \`\${c.x.toFixed(1)},\${c.y.toFixed(1)}\`).join(' '));
	ok('patte seule : la mécanique ne recouvre pas le connecteur',
		p.shadowRoot.querySelector('.leg__solid').getBBox().x > 40,
		Math.round(p.shadowRoot.querySelector('.leg__solid').getBBox().x));
	// La patte a AUSSI ses deux cases d'inversion : servo à l'envers = même
	// consigne, pose miroir. Le repère est le pied EN PLAN (x) et non sa hauteur :
	// 30° et 150° lèvent le pied pareil (cos ±60°), c'est le côté qui change.
	const pied = (q) => \`\${q.geometry.foot.x.toFixed(2)},\${q.geometry.foot.z.toFixed(2)}\`;
	const pRev = await mk({ speed: '0', revpatella: '1' }, 'kablix-patte');
	pRev.patellaAngle = 150;
	await pRev.updateComplete;
	const pDroit = await mk({ speed: '0' }, 'kablix-patte');
	pDroit.patellaAngle = 30;
	await pDroit.updateComplete;
	ok('patte seule : revpatella inverse la patella (150 inversé = 30 droit)',
		Math.abs(pRev.geometry.foot.x - pDroit.geometry.foot.x) < 0.01
		&& Math.abs(pRev.geometry.foot.z - pDroit.geometry.foot.z) < 0.01,
		\`\${pied(pRev)} vs \${pied(pDroit)}\`);
	// Et son calage de palonnier : consigne 10 décalée de +20 = consigne 30 nue.
	const pZero = await mk({ speed: '0', zeropatella: '20' }, 'kablix-patte');
	pZero.patellaAngle = 10;
	await pZero.updateComplete;
	ok('patte seule : zeropatella décale le zéro du servo (10 + 20 = 30)',
		Math.abs(pZero.geometry.foot.x - pDroit.geometry.foot.x) < 0.01
		&& Math.abs(pZero.geometry.foot.z - pDroit.geometry.foot.z) < 0.01,
		\`\${pied(pZero)} vs \${pied(pDroit)}\`);
	pDroit.patellaAngle = 150;
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
  // Depuis la v2026.8.53 le périphérique n'est plus instancié sur place : il est
  // DÉCRIT, et la fabrique partagée le monte (côté page ou dans le worker).
  ['sim : un PCA9685 est décrit pour l\'araignée', /kind === 'araignee'[\s\S]{0,900}kind: 'pca'/.test(sim)],
  ['sim : son adresse vient des pads AD0..AD5', /pca9685Address\(part\.attrs\)/.test(sim)],
  ['sim : applyAraignee() appelée à chaque rafraîchissement', /\n\s*applyAraignee\(\);/.test(sim)],
  ['sim : canaux pairs → coxa, impairs → patella', /ch % 2 === 0 \? 'coxa' : 'patella'/.test(sim)],
  ['sim : les 8 canaux sont lus', /ch < 8/.test(sim)],
  // v2026.8.63 : UNE seule échelle d'impulsion pour tous les chemins. Le PCA9685
  // avait la sienne, écrite en dur (1000-2000 µs), qui ignorait les réglages du
  // composant — le robot ne prenait donc pas la pose commandée.
  ['sim : une seule formule impulsion → angle (servoAngleUs)',
    /function servoAngleUs\(us: number, attrs\?: Record<string, string>\): number/.test(sim)],
  ['sim : elle lit les réglages du composant (pulsemin/pulsemax)',
    /Number\(attrs\?\.pulsemin\) \|\| 500/.test(sim) && /Number\(attrs\?\.pulsemax\) \|\| 2500/.test(sim)],
  ["sim : plus aucune échelle 1000-2000 µs écrite en dur", !/20000 - 1000\) \/ 1000/.test(sim)],
  ['sim : le robot passe SES réglages d\'impulsion', /servoAngleUs\(duty \* 20000, part\.attrs\)/.test(sim)],
  ['sim : un servo ou une patte sur PCA9685 aussi', /servoAngleUs\(duty \* 20000, attrsOf\(c\.targetId\)\)/.test(sim)],
  ['catalogue : le robot a ses deux réglages d\'impulsion (500-2500 µs)',
    /type: 'araignee'[\s\S]{0,400}pulsemin: '500', pulsemax: '2500'/.test(
      readFileSync(join(ROOT, 'src/webview/diagram/catalog.mts'), 'utf8'))],
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
