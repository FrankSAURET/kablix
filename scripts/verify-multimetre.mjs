// Vérifie le multimètre (kablix-multimetre, kind 'meter') :
//  - catalogue : rangé dans Appareils de mesure, propriété `mode` à deux choix ;
//  - netlist : ampèremètre = FIL (ses deux prises n'en font qu'une), voltmètre
//    = rien du tout (l'appareil n'existe pas pour le montage) ;
//  - meterReadings : tension d'un pont diviseur, courant d'une branche, court-
//    circuit quand l'ampèremètre est posé en travers de l'alimentation ;
//  - aide : fiche FR présente, illustrée, avec le piège du court-circuit ;
//  - rendu réel en Chrome headless : dessin, taille 1:1, broches, écran (valeur
//    + unité, dans l'écran), bascule du levier, clic sur l'inter en simulation
//    seulement, pastilles nues des prises banane.
import esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-multi-'));
const buildTo = async (entry, outfile) => {
  await esbuild.build({
    entryPoints: [join(root, entry)],
    outfile: join(tmp, outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.svg': 'text', '.webp': 'dataurl' },
    logLevel: 'silent',
  });
  return import(pathToFileURL(join(tmp, outfile)).href);
};
const { meterReadings, meterMode, METER_SHORT_AMPS, buildNets, pulseMonitorPins } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const { partDef, partCategory, CATEGORY_ORDER } = await buildTo('src/webview/diagram/catalog.mts', 'catalog.mjs');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-3) => a !== null && a !== undefined && Math.abs(a - b) < eps * Math.max(1, Math.abs(b));

// --- Catalogue -----------------------------------------------------------------
const def = partDef('multimetre');
check('catalogue : multimetre = kablix-multimetre, kind meter, catégorie Instruments',
  def.tag === 'kablix-multimetre' && def.kind === 'meter' && partCategory(def) === 'Instruments');
check('catalogue : Instruments présent dans CATEGORY_ORDER', CATEGORY_ORDER.includes('Instruments'));
// simControl : c'est lui qui pose l'attribut `simulating` sur l'élément, donc
// qui rend l'inter à bascule cliquable pendant la simulation.
check('catalogue : simControl (l\'inter ne bascule qu\'en simulation)', def.simControl === true);
// Le VOLTMÈTRE est le défaut : oublié dans un montage il ne casse rien, alors
// qu'un ampèremètre laissé en travers de l'alimentation la met en court-circuit.
check('catalogue : mode par défaut = voltage (l\'appareil inoffensif)', def.attrs?.mode === 'voltage');
const modeProp = def.props?.find((p) => p.attr === 'mode');
check('catalogue : propriété mode = liste voltage / current',
  !!modeProp && modeProp.kind === 'select' &&
  modeProp.options?.join(',') === 'voltage,current' &&
  !!modeProp.optionLabels?.voltage && !!modeProp.optionLabels?.current);

// --- Aide locale ---------------------------------------------------------------
const helpMd = join(root, 'docs', 'fr', 'composants', 'multimetre.md');
check('aide : fiche docs/fr/composants/multimetre.md présente', existsSync(helpMd));
if (existsSync(helpMd)) {
  const md = readFileSync(helpMd, 'utf8');
  const refs = [...md.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((m) => decodeURIComponent(m[1]));
  const missing = refs.filter((r) => !existsSync(join(root, 'docs', 'fr', 'composants', r)));
  check(`aide : images et liens relatifs valides (${refs.length} réf.)${missing.length ? ` — manquant : ${missing.join(', ')}` : ''}`,
    refs.length > 0 && missing.length === 0);
  check('aide : bornes, parallèle/série et piège du court-circuit documentés',
    /\*\*\+\*\*/.test(md) && /\*\*GND\*\*/.test(md) &&
    /parall[èe]le/i.test(md) && /s[ée]rie/i.test(md) && /court-circuit/i.test(md) && /`mode`/.test(md));
}

// --- Schémas de banc -----------------------------------------------------------
const ALIM = (v = '5') => ({ id: 'psu1', type: 'alim', x: 0, y: 0, attrs: { voltage: v, maxcurrent: '1' } });
const M = (id, mode) => ({ id, type: 'multimetre', x: 0, y: 0, attrs: { mode } });
const R = (id, value) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(value) } });
const W = (id, a, b) => ({ id, a, b });
const pin = (partId, p) => ({ partId, pin: p });
const lire = (diagram, id, vcc = 5, drive, pwm) =>
	meterReadings(diagram, vcc, drive, undefined, undefined, pwm).find((m) => m.partId === id);

check('meterMode : attribut current → ampèremètre, tout le reste → voltmètre',
  meterMode(M('m', 'current')) === 'current' && meterMode(M('m', 'voltage')) === 'voltage' &&
  meterMode({ id: 'm', type: 'multimetre', x: 0, y: 0 }) === 'voltage');

// 1. Voltmètre aux bornes de l'alimentation : il lit la tension de la source.
const bornes = (mode) => ({
  parts: [ALIM('5'), M('m1', mode)],
  wires: [
    W('w1', pin('psu1', 'V+'), pin('m1', '+')),
    W('w2', pin('psu1', 'GND'), pin('m1', 'GND')),
  ],
});
check('voltmètre aux bornes de l\'alim 5 V → 5,00 V', near(lire(bornes('voltage'), 'm1').value, 5, 0.02));

// 2. Netlist : l'ampèremètre est un FIL, le voltmètre n'existe pas.
const netsV = buildNets(bornes('voltage'));
const netsI = buildNets(bornes('current'));
check('netlist : voltmètre → prises SÉPARÉES (aucune influence sur le montage)',
  netsV.netOf(pin('m1', '+')) !== netsV.netOf(pin('m1', 'GND')));
check('netlist : ampèremètre → prises RÉUNIES (c\'est un fil)',
  netsI.netOf(pin('m1', '+')) === netsI.netOf(pin('m1', 'GND')));

// 3. Voltmètre au milieu d'un pont 1 kΩ / 1 kΩ → la moitié de la tension.
const pont = {
  parts: [ALIM('5'), R('r1', 1000), R('r2', 1000), M('m1', 'voltage')],
  wires: [
    W('w1', pin('psu1', 'V+'), pin('r1', '1')),
    W('w2', pin('r1', '2'), pin('r2', '1')),
    W('w3', pin('r2', '2'), pin('psu1', 'GND')),
    W('w4', pin('r1', '2'), pin('m1', '+')),
    W('w5', pin('psu1', 'GND'), pin('m1', 'GND')),
  ],
};
check('voltmètre sur pont 1k/1k sous 5 V → 2,50 V', near(lire(pont, 'm1').value, 2.5, 0.02));

// 4. Ampèremètre EN SÉRIE dans la branche : 5 V / 1 kΩ ≈ 5 mA.
const serie = {
  parts: [ALIM('5'), R('r1', 1000), M('m1', 'current')],
  wires: [
    W('w1', pin('psu1', 'V+'), pin('r1', '1')),
    W('w2', pin('r1', '2'), pin('m1', '+')),
    W('w3', pin('m1', 'GND'), pin('psu1', 'GND')),
  ],
};
const iSerie = lire(serie, 'm1');
check(`ampèremètre en série 5 V / 1 kΩ → ≈ 5 mA (${(iSerie.value * 1000).toFixed(2)} mA)`,
  near(iSerie.value, 0.005, 0.01) && iSerie.fault === '');

// 5. Le même montage avec 2 kΩ : deux fois moins de courant (loi d'Ohm).
const serie2k = { ...serie, parts: [ALIM('5'), R('r1', 2000), M('m1', 'current')] };
check('ampèremètre : 2 kΩ → moitié moins de courant (≈ 2,5 mA)',
  near(lire(serie2k, 'm1').value, 0.0025, 0.01));

// 6. Deux ampèremètres dans la MÊME branche : chacun lit le même courant (l'un
//    ne doit pas voir l'autre comme une coupure).
const deux = {
  parts: [ALIM('5'), R('r1', 1000), M('m1', 'current'), M('m2', 'current')],
  wires: [
    W('w1', pin('psu1', 'V+'), pin('r1', '1')),
    W('w2', pin('r1', '2'), pin('m1', '+')),
    W('w3', pin('m1', 'GND'), pin('m2', '+')),
    W('w4', pin('m2', 'GND'), pin('psu1', 'GND')),
  ],
};
const lus = meterReadings(deux, 5);
check('deux ampèremètres en série : même courant lu par les deux',
  lus.length === 2 && near(lus[0].value, lus[1].value, 0.01) && near(lus[0].value, 0.005, 0.02));

// 7. Ampèremètre posé EN TRAVERS de l'alimentation : court-circuit.
const travers = bornes('current');
const iCourt = lire(travers, 'm1');
check(`ampèremètre en travers de l'alim → court-circuit signalé (${iCourt.value.toFixed(2)} A)`,
  iCourt.fault === 'short' && Math.abs(iCourt.value) > METER_SHORT_AMPS);
check('voltmètre au même endroit → aucun défaut (c\'est le bon branchement)',
  lire(bornes('voltage'), 'm1').fault === '');

// 8. Prises en l'air : rien à mesurer.
const enLair = { parts: [ALIM('5'), M('m1', 'voltage')], wires: [] };
check('prises en l\'air → aucune mesure (écran à zéro)', lire(enLair, 'm1').value === null);
const uneSeule = {
  parts: [ALIM('5'), M('m1', 'voltage')],
  wires: [W('w1', pin('psu1', 'V+'), pin('m1', '+'))],
};
check('une seule prise câblée → toujours rien à mesurer', lire(uneSeule, 'm1').value === null);

// 9. Fils inversés : la mesure change de signe, comme sur un vrai appareil.
const inverse = {
  parts: [ALIM('5'), M('m1', 'voltage')],
  wires: [
    W('w1', pin('psu1', 'V+'), pin('m1', 'GND')),
    W('w2', pin('psu1', 'GND'), pin('m1', '+')),
  ],
};
check('prises inversées → mesure négative (-5,00 V)', near(lire(inverse, 'm1').value, -5, 0.02));

// 10. Source = broche de carte pilotée (le `drive` de la simulation).
const surBroche = {
  parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, R('r1', 1000), M('m1', 'current')],
  wires: [
    W('w1', pin('uno', '13'), pin('r1', '1')),
    W('w2', pin('r1', '2'), pin('m1', '+')),
    W('w3', pin('m1', 'GND'), pin('uno', 'GND.1')),
  ],
};
const iHigh = lire(surBroche, 'm1', 5, (p) => (p === '13' ? 'high' : 'hiz'));
check(`broche D13 à l'état haut → ≈ 4,9 mA (${(iHigh.value * 1000).toFixed(2)} mA)`,
  near(iHigh.value, 5 / 1026, 0.02));
const iLow = lire(surBroche, 'm1', 5, () => 'low');
check('broche D13 à l\'état bas → plus de courant', near(iLow.value, 0, 0.01) || Math.abs(iLow.value) < 1e-4);

// 11. Broche qui HACHE (PWM) : le multimètre affiche la MOYENNE, pas le niveau
//     instantané. Sans ça le chiffre sautait de 0 V à la tension de la carte
//     d'une image à l'autre, au gré de l'instant où l'image était calculée.
const surPwm = (type) => ({
	parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, { id: 'm1', type, x: 0, y: 0, attrs: { mode: 'voltage' } }],
	wires: [
		W('w1', pin('uno', '9'), pin('m1', '+')),
		W('w2', pin('uno', 'GND.1'), pin('m1', 'GND')),
	],
});
const pwm40 = (p) => (p === '9' ? 0.4 * 5 : null);
const vInstant = lire(surPwm('multimetre'), 'm1', 5, (p) => (p === '9' ? 'high' : 'hiz'));
check(`sans lissage, le niveau instantané d'une broche haute → 5 V (${vInstant.value.toFixed(2)} V)`,
	near(vInstant.value, 5, 0.02));
const vMoyen = lire(surPwm('multimetre'), 'm1', 5, (p) => (p === '9' ? 'high' : 'hiz'), pwm40);
check(`PWM à 40 % vu au moment HAUT → moyenne 2,00 V (${vMoyen.value.toFixed(2)} V)`,
	near(vMoyen.value, 2, 0.02));
const vMoyenBas = lire(surPwm('multimetre'), 'm1', 5, (p) => (p === '9' ? 'low' : 'hiz'), pwm40);
check(`… et au moment BAS, la MÊME moyenne (${vMoyenBas.value.toFixed(2)} V) — plus d'oscillation`,
	near(vMoyenBas.value, 2, 0.02));

// L'oscilloscope, lui, doit voir les créneaux : son métier est de les montrer.
const oInstantHaut = lire(surPwm('oscillo'), 'm1', 5, (p) => (p === '9' ? 'high' : 'hiz'), pwm40);
const oInstantBas = lire(surPwm('oscillo'), 'm1', 5, (p) => (p === '9' ? 'low' : 'hiz'), pwm40);
check(`oscilloscope : PAS de lissage, il suit le créneau (${oInstantHaut.value.toFixed(2)} V / ${oInstantBas.value.toFixed(2)} V)`,
	near(oInstantHaut.value, 5, 0.02) && Math.abs(oInstantBas.value) < 0.05);

// Le rapport cyclique n'existe que sur une broche SURVEILLÉE : un appareil de
// mesure dans le schéma doit donc mettre les broches câblées sous surveillance.
check('un multimètre met les broches câblées sous surveillance de rapport cyclique',
	pulseMonitorPins(surPwm('multimetre'), 5).includes('9'));
// L'oscilloscope aussi, depuis v2026.8.102.36 : sans cela sa broche n'était
// suivie par personne, et la tension lue sautait au hasard de l'image.
check('un oscilloscope SEUL met lui aussi la broche sous surveillance',
	pulseMonitorPins(surPwm('oscillo'), 5).includes('9'));
check('… et sans aucun appareil de mesure, rien n’est surveillé pour rien',
	!pulseMonitorPins({ parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }], wires: [] }, 5).includes('9'));

// --- Rendu réel (Chrome headless) ----------------------------------------------
const CACHE = join(root, 'node_modules', '.cache-multimetre');
mkdirSync(CACHE, { recursive: true });
const entry = `
import '../../src/webview/composants/multimetre-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
import { Editor } from '../../src/webview/diagram/editor.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const el = document.createElement('kablix-multimetre');
	document.body.appendChild(el);
	await wait(80);
	const sh = el.shadowRoot;
	const svg = sh.querySelector('svg');
	const res = {};
	res.drawn = !!sh.querySelector('#Ecran') && !!sh.querySelector('#inter-bascule');
	const box = svg.getBoundingClientRect();
	res.size = [Math.round(box.width), Math.round(box.height)];
	res.pins = el.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' ');
	// Libellés du dessin traduits (défaut anglais dans ce banc).
	res.labels = [sh.querySelector('#text-courant-limite tspan').textContent,
		sh.querySelector('#text-courant-limite-6 tspan').textContent].join('/');
	// Écran : valeur en gros, unité en petit.
	const val = () => sh.querySelector('#multi-valeur').textContent;
	const unit = () => sh.querySelector('#multi-unite').textContent.trim();
	const gros = Number(sh.querySelector('#multi-valeur').getAttribute('font-size'));
	const petit = Number(sh.querySelector('#multi-unite').getAttribute('font-size'));
	res.sizes = [gros, petit];
	res.vide = [val(), unit()];
	el.reading = 5;
	await wait(5);
	res.volt = [val(), unit()];
	el.reading = 12.345;
	await wait(5);
	res.volt2 = [val(), unit()];
	// Le texte doit tenir DANS l'écran, y compris au pire cas (signe + mA).
	const dans = () => {
		const t = sh.querySelector('#Text-Affichage').getBoundingClientRect();
		const e = sh.querySelector('#Ecran').getBoundingClientRect();
		return t.left >= e.left && t.right <= e.right;
	};
	res.tientVolt = dans();
	// Levier : en BAS (rotation d'un demi-tour) en voltmètre, en HAUT en ampèremètre.
	const lev = () => sh.querySelector('#multi-levier').getAttribute('transform') || '';
	const bouleY = () => {
		const b = sh.querySelector('#circle58').getBoundingClientRect();
		return b.y + b.height / 2;
	};
	res.levVolt = /rotate\\(180/.test(lev());
	const yVolt = bouleY();
	el.setAttribute('mode', 'current');
	await wait(5);
	res.levAmp = lev() === '';
	res.levierMonte = bouleY() < yVolt - 5;
	// Changer de mode remet l'écran à zéro (des ampères lus comme des volts n'ont
	// aucun sens) — et l'unité suit.
	res.resetAuChangement = [val(), unit()];
	el.reading = 0.00499;
	await wait(5);
	res.amp = [val(), unit()];
	el.reading = 1.25;
	await wait(5);
	res.ampA = [val(), unit()];
	el.reading = -0.0499;
	await wait(5);
	res.ampNeg = [val(), unit()];
	res.tientAmp = dans();
	// Inter à bascule : INERTE en édition, actif en simulation.
	const zone = sh.querySelector('#multi-switch-zone');
	res.zoneNoExport = zone.hasAttribute('data-no-export');
	const clic = () => zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
	el.setAttribute('mode', 'voltage');
	await wait(5);
	clic();
	res.modeEdition = el.getAttribute('mode');
	el.setAttribute('simulating', '');
	await wait(5);
	let vu = null;
	el.addEventListener('meter-mode', (e) => { vu = e.detail; });
	clic();
	res.modeSim = el.getAttribute('mode');
	res.evenement = vu;
	clic();
	res.modeSim2 = el.getAttribute('mode');
	el.removeAttribute('simulating');

	// --- Éditeur réel : pastilles des prises banane -----------------------------
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const multi = editor.addPart('multimetre', 40, 40);
	const servo = editor.addPart('servo', 400, 40);
	await wait(120);
	const pads = (id, cls) => editor.rendered.get(id).container.querySelectorAll(cls).length;
	res.multiPads = [pads(multi.id, '.pin'), pads(multi.id, '.pin--vcc'), pads(multi.id, '.pin--gnd')];
	res.servoPads = [pads(servo.id, '.pin--vcc'), pads(servo.id, '.pin--gnd')];
	// L'inspecteur écrit le mode dans le schéma (le clic de l'inter passe par lui).
	editor.updatePartAttr(multi.id, 'mode', 'current');
	await wait(30);
	res.attrEcrit = editor.diagram.parts.find((p) => p.id === multi.id).attrs.mode;
	res.attrPose = editor.elementOf(multi.id).getAttribute('mode');

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(res);
	document.body.appendChild(out);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: root, logLevel: 'silent' });
writeFileSync(
  join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><body>` +
  `<div class="workshop"><aside id="palette" class="palette"></aside>` +
  `<div id="canvas" class="canvas" style="width:800px;height:400px"><svg id="wires" class="wires"></svg></div>` +
  `<aside id="inspector" class="inspector"></aside></div>` +
  `<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (chrome) {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([^<]+)<\/pre>/);
  if (!m) {
    check('rendu headless : mesures produites', false);
  } else {
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    check('rendu : dessin de Frank présent (écran + inter à bascule)', r.drawn === true);
    check('rendu : 270×90 px (1:1 viewBox)', r.size[0] === 270 && r.size[1] === 90);
    check('rendu : broches +@230,70 GND@250,70', r.pins === '+@230,70 GND@250,70');
    check('rendu : libellés traduisibles (Current / Voltage)', r.labels === 'Current/Voltage');
    check('rendu : valeur en gros, unité en petit', r.sizes[0] > r.sizes[1] * 1.5);
    check('rendu : sans mesure, écran à zéro (0,00 V)', r.vide.join(' ') === '0,00 V');
    check('rendu : 5 V → « 5,00 V »', r.volt.join(' ') === '5,00 V');
    check('rendu : 12,345 V → « 12,3 V » (quatre chiffres utiles)', r.volt2.join(' ') === '12,3 V');
    check('rendu : mesure DANS l\'écran (voltmètre)', r.tientVolt === true);
    check('rendu : voltmètre → levier basculé d\'un demi-tour', r.levVolt === true);
    check('rendu : ampèremètre → levier à sa position dessinée (en haut)', r.levAmp === true);
    check('rendu : le levier monte quand on passe en ampèremètre', r.levierMonte === true);
    check('rendu : changement de mode → écran remis à zéro, unité suivie', r.resetAuChangement.join(' ') === '0,00 mA');
    check('rendu : 4,99 mA affiché en milliampères', r.amp.join(' ') === '4,99 mA');
    check('rendu : 1,25 A affiché en ampères', r.ampA.join(' ') === '1,25 A');
    check('rendu : -49,9 mA (mesure négative, pire cas de largeur)', r.ampNeg.join(' ') === '-49,9 mA');
    check('rendu : mesure DANS l\'écran (pire cas ampèremètre)', r.tientAmp === true);
    check('rendu : zone de clic hors du dessin exporté (data-no-export)', r.zoneNoExport === true);
    check('rendu : inter INERTE en édition (le clic sélectionne le composant)', r.modeEdition === 'voltage');
    check('rendu : en simulation le clic bascule en ampèremètre + événement',
      r.modeSim === 'current' && r.evenement === 'current');
    check('rendu : deuxième clic → retour en voltmètre', r.modeSim2 === 'voltage');
    check('éditeur : prises banane SANS pastille rouge/noire (2 .pin nus)',
      r.multiPads[0] === 2 && r.multiPads[1] === 0 && r.multiPads[2] === 0);
    check('éditeur : le servo garde ses pastilles V+/GND (contre-épreuve)',
      r.servoPads[0] === 1 && r.servoPads[1] === 1);
    check('éditeur : le mode est enregistré dans le schéma et posé sur l\'élément',
      r.attrEcrit === 'current' && r.attrPose === 'current');
  }
} else {
  console.log('⚠️ Chrome introuvable : rendu headless sauté');
}

console.log(failures === 0 ? '\nverify:multimetre OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
