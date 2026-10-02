// Batterie qui se vide et alimente la carte (feuille de route n° 2, v2026.9.7.179).
//
// Le Power bank a désormais une capacité (mAh). Il se vide de ce qu'il débite :
// ses charges directes, plus la carte entière quand c'est lui qui l'alimente
// (V+ sur VIN, 5V, VSYS ou VBUS, masses réunies). Vide, sa sortie se coupe ; s'il
// faisait tourner la carte, la simulation s'arrête et dit au bout de combien de
// temps de programme. Sa jauge (LED1..4 du dessin) montre la charge restante.
//
// Il contrôle :
//   1. le modèle (`alimentationDeLaCarte`) sur des schémas écrits ici ;
//   2. la décharge et l'autonomie (`consommation.mts`) ;
//   3. la jauge du VRAI élément <kablix-powerbank> en Chrome headless ;
//   4. le câblage dans sim.mts (décharge, coupure, arrêt de la carte).
//   2 bis. les piles de bibliothèque (v2026.9.7.180) : tension qui baisse avec
//      la charge, plages des entrées (refus de démarrer, extinction en route),
//      pattes « + » / « - » lues par leurs rôles.
//
// Contre-épreuve : `node scripts/verify-batterie.mjs --ancien=<réf>` prend
// model.mts, consommation.mts et powerbank-element.mts d'une autre version.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ANCIEN_ARG = process.argv.find((a) => a.startsWith('--ancien'));
const REF = ANCIEN_ARG?.includes('=') ? ANCIEN_ARG.split('=')[1] : ANCIEN_ARG ? 'HEAD' : null;
if (REF) console.log(`(contre-épreuve : sources en version ${REF})`);
const versionAncienne = {
	name: 'version-ancienne',
	setup(b) {
		b.onLoad({ filter: /[\\/](diagram[\\/](model|catalog)|consommation|composants[\\/]powerbank-element)\.mts$/ }, (args) => {
			if (!REF) return undefined;
			const rel = relative(ROOT, args.path).replace(/\\/g, '/');
			let contents = '';
			try { contents = execFileSync('git', ['show', `${REF}:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { contents = 'export {};'; }
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
const tmp = mkdtempSync(join(tmpdir(), 'kablix-batterie-'));
const charger = async (entree, nom) => {
	const out = join(tmp, nom);
	await esbuild.build({ entryPoints: [join(ROOT, entree)], outfile: out, bundle: true, format: 'esm', platform: 'node',
		logLevel: 'silent', loader: { '.svg': 'text', '.webp': 'dataurl' }, plugins: [versionAncienne] });
	return import(pathToFileURL(out).href);
};

let echecs = 0;
const check = (ok, nom, detail = '') => {
	if (!ok) echecs++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${nom}${detail ? ' — ' + detail : ''}`);
};

// --- 1. Qui alimente la carte ---------------------------------------------------
console.log('1. Qui alimente la carte');
const { alimentationDeLaCarte } = await charger('src/webview/diagram/model.mts', 'model.mjs');
const PB = { id: 'pb1', type: 'powerbank', x: 0, y: 0, attrs: { voltage: '5', maxcurrent: '2', capacity: '10000' } };
const W = (id, a, b) => ({ id, a, b });
const schema = (carte, broche, gnd, avecMasse = true) => ({
	parts: [{ id: 'c', type: carte, x: 0, y: 0 }, PB],
	wires: [
		W('w1', { partId: 'pb1', pin: 'V+' }, { partId: 'c', pin: broche }),
		...(avecMasse ? [W('w2', { partId: 'pb1', pin: 'GND' }, { partId: 'c', pin: gnd })] : []),
	],
});
const qui = (d) => (typeof alimentationDeLaCarte === 'function' ? alimentationDeLaCarte(d) : undefined);
check(qui(schema('uno', '5V', 'GND.1'))?.psuId === 'pb1', 'Uno : V+ sur 5V, masses réunies → la batterie alimente la carte');
check(qui(schema('uno', 'VIN', 'GND.1'))?.broche === 'VIN', 'Uno : V+ sur VIN → alimentée par le régulateur');
check(qui(schema('pico', 'VSYS', 'GND'))?.broche === 'VSYS', 'Pico : V+ sur VSYS');
check(qui(schema('uno', '5V', 'GND.1', false)) === null, 'masse non reliée : la carte reste sur l’USB');
check(qui(schema('uno', '13', 'GND.1')) === null, 'V+ sur une broche d’entrée/sortie : ce n’est pas une alimentation');

// Court-circuit d'une pile (Frank, 02/10) : V+ relié à la masse sans rien entre les deux.
const { psuCourtCircuit } = await charger('src/webview/diagram/model.mts', 'model-cc.mjs');
const cc = (d) => (typeof psuCourtCircuit === 'function' ? psuCourtCircuit(d, 'pb1') : undefined);
check(cc({ parts: [PB], wires: [W('w1', { partId: 'pb1', pin: 'V+' }, { partId: 'pb1', pin: 'GND' })] }) === true,
	'fil direct V+ → GND : court-circuit');
check(cc({ parts: [PB], wires: [] }) === false, 'pile seule : pas de court-circuit');
check(cc(schema('uno', '5V', 'GND.1')) === false, 'pile qui alimente une carte (V+ sur 5V, GND sur GND) : pas de court-circuit');
check(cc({ parts: [PB, { id: 'r1', type: 'resistor', x: 0, y: 0, attrs: { value: '220' } }], wires: [
	W('w1', { partId: 'pb1', pin: 'V+' }, { partId: 'r1', pin: '1' }), W('w2', { partId: 'r1', pin: '2' }, { partId: 'pb1', pin: 'GND' })] }) === false,
	'pile sur une résistance de 220 Ω : une charge, pas un court-circuit');
check(cc({ parts: [PB, { id: 'r1', type: 'resistor', x: 0, y: 0, attrs: { value: '0' } }], wires: [
	W('w1', { partId: 'pb1', pin: 'V+' }, { partId: 'r1', pin: '1' }), W('w2', { partId: 'r1', pin: '2' }, { partId: 'pb1', pin: 'GND' })] }) === true,
	'pile sur une résistance de 0 Ω : court-circuit');

// --- 2. Décharge et autonomie ---------------------------------------------------
console.log('2. Décharge et autonomie');
const { decharger, autonomieH } = await charger('src/webview/consommation.mts', 'conso.mjs');
if (typeof decharger !== 'function') {
	check(false, 'consommation.mts exporte decharger() et autonomieH()');
} else {
	check(Math.abs(decharger(10, 0.046, 3_600_000) - 9.954) < 1e-9, '10 Ah, 46 mA pendant 1 h → 9,954 Ah');
	check(decharger(0.001, 1, 3_600_000) === 0, 'jamais en dessous de zéro');
	check(decharger(5, 0.1, 0) === 5, 'tranche vide (pause) : rien ne part');
	check(Math.abs(autonomieH(10, 0.046) - 217.39) < 0.01, 'autonomie : 10 Ah à 46 mA → 217 h (une Uno sur Power bank)');
	check(Math.abs(autonomieH(0.22, 0.0013) - 169.2) < 0.1, 'autonomie : CR2032 (220 mAh) à 1,3 mA → 169 h (une Pico en lightsleep)');
	check(autonomieH(1, 0) === Infinity, 'rien ne débite : autonomie infinie');
}

// --- 2 bis. Piles de bibliothèque (v2026.9.7.180) ----------------------------------
console.log('2 bis. Piles de bibliothèque (4 × AA, 9 V, CR2032, LiPo)');
const { tensionBatterie, PLAGES_ENTREE } = await charger('src/webview/consommation.mts', 'conso2.mjs');
if (typeof tensionBatterie !== 'function' || !PLAGES_ENTREE) {
	check(false, 'consommation.mts exporte tensionBatterie() et PLAGES_ENTREE');
} else {
	const AA4 = { full: 6.4, empty: 4.4 };
	check(tensionBatterie(AA4, 1) === 6.4 && tensionBatterie(AA4, 0) === 4.4, '4 × AA : 6,4 V pleine, 4,4 V vide');
	check(Math.abs(tensionBatterie(AA4, 0.5) - 5.4) < 1e-9, 'la tension baisse en ligne droite avec la charge (50 % → 5,4 V)');
	check(tensionBatterie(AA4, 2) === 6.4 && tensionBatterie(AA4, -1) === 4.4, 'charge bornée à 0..1');
	const dansPlage = (v, broche) => v >= PLAGES_ENTREE[broche].min && v <= PLAGES_ENTREE[broche].max;
	check(!dansPlage(3.0, '5V') && !dansPlage(3.0, 'VIN'), 'CR2032 (3 V) sur une Uno : refusée sur 5V comme sur VIN');
	check(!dansPlage(4.2, 'VIN'), 'LiPo (4,2 V) sur VIN : refusée');
	check(dansPlage(4.2, 'VSYS') && dansPlage(3.0, 'VSYS') && dansPlage(2.0, 'VSYS'), 'LiPo et CR2032 sur VSYS : acceptées jusqu’à vide');
	check(!dansPlage(9.5, 'VSYS') && !dansPlage(6.4, 'VSYS'), '9 V et 4 × AA sur VSYS : hors plage');
	check(dansPlage(6.4, 'VIN') && !dansPlage(6.1, 'VIN'), '4 × AA sur VIN : démarre à 6,4 V, s’éteint sous 6,2 V');
}
const { model: m2, catalog: c2 } = await (async () => {
	const out = join(tmp, 'diag.mjs');
	await esbuild.build({ stdin: { contents: "export * as model from './src/webview/diagram/model.mts';\nexport * as catalog from './src/webview/diagram/catalog.mts';\n",
		resolveDir: ROOT, loader: 'ts' }, outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
		loader: { '.svg': 'text', '.webp': 'dataurl' }, plugins: [versionAncienne] });
	return import(pathToFileURL(out).href);
})();
try {
	c2.registerCustomPart({ type: 'pile-test', label: 'Pile', kind: 'psu', svg: '<svg viewBox="0 0 20 20"></svg>',
		pins: [{ name: '+', x: 10, y: 0 }, { name: '-', x: 10, y: 20 }], pinRoles: { 'V+': '+', GND: '-' },
		attrs: { voltage: '3' }, params: [{ name: 'capacity', label: 'Capacity (mAh)', value: 220 }], battery: { full: 3, empty: 2 } });
	const d = { parts: [{ id: 'c', type: 'pico', x: 0, y: 0 }, { id: 'p1', type: 'pile-test', x: 0, y: 0 }],
		wires: [W('w1', { partId: 'p1', pin: '+' }, { partId: 'c', pin: 'VSYS' }), W('w2', { partId: 'p1', pin: '-' }, { partId: 'c', pin: 'GND.1' })] };
	const a = m2.alimentationDeLaCarte(d);
	check(a?.psuId === 'p1' && a?.broche === 'VSYS', 'pile de bibliothèque (pattes « + » et « - ») : elle alimente la Pico par VSYS', JSON.stringify(a));
	check(c2.partDef('pile-test').custom?.battery?.full === 3, 'le bloc battery du paquet arrive jusqu’au catalogue');
	check(c2.pinElectricalRole('pile-test', '+') === 'vcc' && c2.pinElectricalRole('pile-test', '-') === 'gnd',
		'fil tiré depuis « + » : rouge ; depuis « - » : noir');
} catch (err) {
	check(false, 'pile de bibliothèque dans le modèle', String(err).split('\n')[0]);
}

// --- 3. La jauge du vrai élément --------------------------------------------------
console.log('3. Jauge du Power bank (Chrome headless)');
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find((c) => c && existsSync(c));
if (!chrome) {
	check(false, 'Chrome introuvable — jauge non contrôlée');
} else {
	const entree = join(tmp, 'e.mjs');
	writeFileSync(entree, `
import '${join(ROOT, 'src/webview/composants/powerbank-element.mts').replace(/\\/g, '/')}';
const allumees = (el) => [...el.shadowRoot.querySelectorAll('[id^="LED"]')].filter((l) => /fill:#ffffff/.test(l.getAttribute('style') ?? '')).length;
const el = document.createElement('kablix-powerbank');
document.body.appendChild(el);
const r = { repos: allumees(el) };
el.setAttribute('simulating', '');
r.pleine = allumees(el);
el.charge = 0.6; r.p60 = allumees(el);
el.charge = 0.3; r.p30 = allumees(el);
el.charge = 0.01; r.p1 = allumees(el);
el.charge = 0; r.vide = allumees(el);
el.removeAttribute('simulating'); el.setAttribute('simulating', ''); r.relance = allumees(el);
const pre = document.createElement('pre'); pre.id = 'm'; pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
`);
	const b = await esbuild.build({ entryPoints: [entree], bundle: true, format: 'iife', write: false,
		loader: { '.svg': 'text', '.webp': 'dataurl' }, logLevel: 'silent', plugins: [versionAncienne] });
	const page = join(tmp, 'p.html');
	writeFileSync(page, `<!doctype html><meta charset=utf8><body><script>${b.outputFiles[0].text}</script>`);
	const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=5000', '--dump-dom',
		pathToFileURL(page).href], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
	const raw = dom.match(/<pre id="m">([\s\S]*?)<\/pre>/);
	const r = raw ? JSON.parse(raw[1].replace(/&quot;/g, '"')) : null;
	check(!!r && r.repos === 0 && r.pleine === 4, 'éteinte au repos, 4 LED en simulation (pleine)', JSON.stringify(r));
	check(!!r && r.p60 === 3 && r.p30 === 2 && r.p1 === 1, 'une LED par quart entamé : 60 % → 3, 30 % → 2, 1 % → 1', JSON.stringify(r));
	check(!!r && r.vide === 0, 'vide : plus aucune LED', JSON.stringify(r));
	check(!!r && r.relance === 4, 'nouveau lancement : repart pleine', JSON.stringify(r));
}

// --- 4. Câblage dans sim.mts --------------------------------------------------------
console.log('4. sim.mts');
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
const bloc = sim.match(/function majBatteries\([\s\S]*?\r?\n}\r?\n/)?.[0] ?? '';
check(/alimentationDeLaCarte\(editor\.diagram\)/.test(bloc) && /psuLoadAmps\(/.test(bloc) && /decharger\(/.test(bloc),
	'la batterie se vide de ses charges ET de la carte quand elle l’alimente');
check(/const sortie = restantAh <= 0 \? 0/.test(bloc) && /el\.volts = battery \|\| restantAh <= 0 \? sortie : undefined/.test(bloc),
	'vide : sa sortie se coupe (tension 0) ; une pile publie sa tension qui baisse');
check(/PLAGES_ENTREE\[alim!?\.broche\]/.test(bloc) && /dropped to \{1\} V: the board switched off/.test(bloc),
	'pile qui passe sous le seuil de l’entrée en route : la carte s’éteint');
const refus = sim.match(/function refusAlimentation\([\s\S]*?\r?\n}\r?\n/)?.[0] ?? '';
check(/tensionBatterie\(battery, 1\)/.test(refus) && /The board does not start/.test(refus),
	'pile hors plage au lancement : la carte refuse de démarrer, avec un message');
check(/ENTREES_NON_PROTEGEES\.has\(alim\.broche\)\) return null/.test(refus),
	'sur-tension sur VSYS/VBUS (pas de régulateur) : PAS de refus au lancement — la carte démarre et grille');
check(/sortie > plage\.max/.test(bloc) && /burnedBoards\.add\(alim!\.boardPartId\)/.test(bloc) && /markBurned\(boardId/.test(bloc) && /stopRun\(\)/.test(bloc),
	'sur-tension en cours de route (pile 9 V sur VSYS) : la carte est détruite (markBurned), la simulation s’arrête');
// Frank (02/10) : la carte détruite doit MONTRER l'explosion et son message sur le
// montage, pas dans la barre d'état. stopRun() remet les composants à neuf et
// vide les cadres de défaut : le marquage vient donc APRÈS l'arrêt.
const surtension = bloc.match(/if \(sortie > plage\.max\) \{[\s\S]*?\n    \}\n/)?.[0] ?? '';
check(surtension.indexOf('stopRun()') > 0 && surtension.indexOf('stopRun()') < surtension.indexOf('markBurned('),
	'carte détruite : le marquage « grillé » (explosion + cadre + message) est posé APRÈS stopRun');
check(!/setStatus\(/.test(surtension), 'carte détruite : rien dans la barre d’état, le message est sur le montage');
check(/psuCourtCircuit\(editor\.diagram, part\.id/.test(bloc) && /ouvrirMiseEnGardePiles\(/.test(bloc),
	'pile en court-circuit : détectée en route, la mise en garde s’ouvre');
const cour = bloc.match(/if \(avantAh > 0 && psuCourtCircuit[\s\S]*?\n    \}\n/)?.[0] ?? '';
check(cour.indexOf('stopRun()') > 0 && cour.indexOf('stopRun()') < cour.indexOf('markBurned(') && !/setStatus\(/.test(cour),
	'court-circuit : explosion et cadre posés APRÈS stopRun, rien dans la barre d’état');
const mise = sim.match(/function ouvrirMiseEnGardePiles\([\s\S]*?\r?\n}\r?\n/)?.[0] ?? '';
check(/MISE_EN_GARDE_LECTURE_S = 15/.test(sim) && /bouton\.disabled = reste > 0/.test(mise) && /if \(reste > 0\) return;/.test(mise),
	'mise en garde : bouton inactif pendant le temps de lecture imposé (15 s), fermeture refusée avant');
const html = readFileSync(join(ROOT, 'src', 'webview-html.ts'), 'utf8');
for (const [point, motif] of [['court-circuit', /A short circuit means fire/], ['sens dans le holder', /in a holder the wrong way round/],
	['chargeur', /good-quality charger/], ['ne pas charger en dormant', /charge while you sleep/], ['surface inflammable', /flammable surface/],
	['piles neuves et usagées', /mix new and used/], ['températures extrêmes', /extreme temperatures/], ['pile déformée', /swollen or damaged/],
	['poubelle', /throw them in the bin/]]) {
	check(motif.test(html), `mise en garde : le point « ${point} » y est`);
}
check(/const refus = refusAlimentation\(\);\s*if \(refus\) \{\s*setStatus\(refus\);\s*return;/.test(sim),
	'le refus tombe AVANT la création du moteur');
check(/if \(!alimenteLaCarte \|\| !engine\) continue;\s*if \(restantAh <= 0\) \{/.test(bloc) && /stopRun\(\)/.test(bloc), 'vide alors qu’elle alimente la carte : la simulation s’arrête');
check(/chargesBatteries\.clear\(\)/.test(sim), 'nouveau lancement : les batteries repartent pleines');

console.log(echecs ? `\nRESULTAT: ECHEC (${echecs})` : '\nRESULTAT: OK');
process.exit(echecs ? 1 : 0);
