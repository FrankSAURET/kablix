// Vérifie l'oscilloscope (kablix-oscillo, kind 'scope') :
//  - catalogue : rangé dans Appareils de mesure, deux calibres réglables ;
//  - netlist : il ne conduit RIEN (comme un voltmètre), ses deux prises restent
//    deux nœuds séparés — contre-épreuve avec l'ampèremètre, qui est un fil ;
//  - meterReadings : la même lecture qu'un voltmètre, jamais de court-circuit ;
//  - aide : fiche FR présente, illustrée ;
//  - rendu réel en Chrome headless : dessin, taille 1:1, broches, trace calée
//    sur la grille DESSINÉE (19,82 px par carreau), fenêtre de temps, cartouche
//    de trois lignes sous l'écran, boutons (butée des volts, tour complet du
//    temps, inertes hors simulation), pastilles nues des prises banane ;
//  - sonde : quand la prise « + » tombe sur une broche de la carte, le moteur
//    date chaque bascule (scopeProbePins) et la courbe se dessine en escalier ;
//  - déclenchement : bouton de sens (montant/descendant) et curseur de niveau,
//    l'écran commençant toujours sur le même passage du signal.
import esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-oscillo-'));
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
const { meterReadings, buildNets, scopeProbePins, pulseMonitorPins } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const { partDef, partCategory } = await buildTo('src/webview/diagram/catalog.mts', 'catalog.mjs');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-3) => a !== null && a !== undefined && Math.abs(a - b) < eps * Math.max(1, Math.abs(b));

// --- Catalogue -----------------------------------------------------------------
const def = partDef('oscillo');
check('catalogue : oscillo = kablix-oscillo, kind scope, catégorie Instruments',
  def.tag === 'kablix-oscillo' && def.kind === 'scope' && partCategory(def) === 'Instruments');
// simControl : c'est lui qui pose l'attribut `simulating`, donc qui rend les
// deux boutons tournables pendant la simulation.
check('catalogue : simControl (les boutons ne tournent qu\'en simulation)', def.simControl === true);
check('catalogue : calibres de départ 1 V/div et 1 s/div',
  def.attrs?.voltsdiv === '1' && def.attrs?.sdiv === '1');
const pv = def.props?.find((p) => p.attr === 'voltsdiv');
check('catalogue : Volts/div = les cinq graduations du dessin',
  !!pv && pv.kind === 'select' && pv.options?.join(',') === '0.1,0.5,1,2,5');
const ps = def.props?.find((p) => p.attr === 'sdiv');
check('catalogue : s/div = nombre libre (pas de liste 1-2-5)', !!ps && ps.kind === 'number');
// Déclenchement : le niveau part VIDE (le curseur se pose tout seul), le sens
// part sur le front montant.
check('catalogue : déclenchement au départ — niveau libre, front montant',
  def.attrs?.trigger === '' && def.attrs?.triggeredge === 'rising');
const pt = def.props?.find((p) => p.attr === 'triggeredge');
check('catalogue : sens du déclenchement = montant ou descendant',
  !!pt && pt.kind === 'select' && pt.options?.join(',') === 'rising,falling');

// --- Aide locale ---------------------------------------------------------------
const helpMd = join(root, 'docs', 'fr', 'composants', 'oscillo.md');
check('aide : fiche docs/fr/composants/oscillo.md présente', existsSync(helpMd));
if (existsSync(helpMd)) {
  const md = readFileSync(helpMd, 'utf8');
  const refs = [...md.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((m) => decodeURIComponent(m[1]));
  const missing = refs.filter((r) => !existsSync(join(root, 'docs', 'fr', 'composants', r)));
  check(`aide : images et liens relatifs valides (${refs.length} réf.)${missing.length ? ` — manquant : ${missing.join(', ')}` : ''}`,
    refs.length > 0 && missing.length === 0);
  check('aide : bornes, carreaux et deux boutons documentés',
    /\*\*\+\*\*/.test(md) && /\*\*GND\*\*/.test(md) &&
    /`voltsdiv`/.test(md) && /`sdiv`/.test(md) && /carreau/i.test(md) && /parall[èe]le/i.test(md));
  check('aide : déclenchement expliqué (curseur et sens du front)',
    /d[ée]clench/i.test(md) && /`triggeredge`/.test(md) && /curseur/i.test(md));
}

// --- Schémas de banc -----------------------------------------------------------
const ALIM = (v = '5') => ({ id: 'psu1', type: 'alim', x: 0, y: 0, attrs: { voltage: v, maxcurrent: '1' } });
const O = (id) => ({ id, type: 'oscillo', x: 0, y: 0, attrs: { voltsdiv: '1', sdiv: '1' } });
const M = (id, mode) => ({ id, type: 'multimetre', x: 0, y: 0, attrs: { mode } });
const R = (id, value) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(value) } });
const W = (id, a, b) => ({ id, a, b });
const pin = (partId, p) => ({ partId, pin: p });
const lire = (diagram, id, vcc = 5, drive) => meterReadings(diagram, vcc, drive).find((m) => m.partId === id);

// 1. Aux bornes de l'alimentation : il lit la tension de la source.
const bornes = (part) => ({
  parts: [ALIM('5'), part],
  wires: [
    W('w1', pin('psu1', 'V+'), pin(part.id, '+')),
    W('w2', pin('psu1', 'GND'), pin(part.id, 'GND')),
  ],
});
const auxBornes = lire(bornes(O('o1')), 'o1');
check('oscillo aux bornes de l\'alim 5 V → 5,00 V', near(auxBornes.value, 5, 0.02));
check('oscillo : jamais de court-circuit, même en travers de l\'alim', auxBornes.fault === '');

// 2. Netlist : l'oscillo ne conduit rien, l'ampèremètre si (contre-épreuve).
const netsO = buildNets(bornes(O('o1')));
const netsI = buildNets(bornes(M('m1', 'current')));
check('netlist : oscillo → prises SÉPARÉES (aucune influence sur le montage)',
  netsO.netOf(pin('o1', '+')) !== netsO.netOf(pin('o1', 'GND')));
check('netlist : ampèremètre → prises RÉUNIES (contre-épreuve)',
  netsI.netOf(pin('m1', '+')) === netsI.netOf(pin('m1', 'GND')));

// 3. Au milieu d'un pont 1 kΩ / 1 kΩ → la moitié de la tension, et le pont
//    n'est PAS modifié par la présence de l'appareil.
const pont = (part) => ({
  parts: [ALIM('5'), R('r1', 1000), R('r2', 1000), part],
  wires: [
    W('w1', pin('psu1', 'V+'), pin('r1', '1')),
    W('w2', pin('r1', '2'), pin('r2', '1')),
    W('w3', pin('r2', '2'), pin('psu1', 'GND')),
    W('w4', pin('r1', '2'), pin(part.id, '+')),
    W('w5', pin('psu1', 'GND'), pin(part.id, 'GND')),
  ],
});
check('oscillo sur pont 1k/1k sous 5 V → 2,50 V', near(lire(pont(O('o1')), 'o1').value, 2.5, 0.02));
check('oscillo et voltmètre lisent la même chose au même endroit',
  near(lire(pont(O('o1')), 'o1').value, lire(pont(M('m1', 'voltage')), 'm1').value, 1e-6));

// 4. Prises en l'air : rien à tracer.
check('prises en l\'air → aucune mesure (courbe interrompue)',
  lire({ parts: [ALIM('5'), O('o1')], wires: [] }, 'o1').value === null);

// 5. Fils inversés : la courbe passe sous l'axe, comme un vrai appareil.
const inverse = {
  parts: [ALIM('5'), O('o1')],
  wires: [
    W('w1', pin('psu1', 'V+'), pin('o1', 'GND')),
    W('w2', pin('psu1', 'GND'), pin('o1', '+')),
  ],
};
check('prises inversées → mesure négative (-5,00 V)', near(lire(inverse, 'o1').value, -5, 0.02));

// 6. Source = broche de carte pilotée (le `drive` de la simulation) : c'est le
//    cas d'usage normal, on regarde une sortie clignoter.
const surBroche = {
  parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, O('o1')],
  wires: [
    W('w1', pin('uno', '13'), pin('o1', '+')),
    W('w2', pin('o1', 'GND'), pin('uno', 'GND.1')),
  ],
};
check('broche D13 à l\'état haut → ≈ 5 V',
  near(lire(surBroche, 'o1', 5, (p) => (p === '13' ? 'high' : 'hiz')).value, 5, 0.02));
check('broche D13 à l\'état bas → ≈ 0 V',
  Math.abs(lire(surBroche, 'o1', 5, () => 'low').value) < 0.01);

// 7. Sonde : la broche que le moteur doit dater front par front.
//    Sans elle, l'appareil n'aurait qu'un point par image — 60 par seconde — et
//    un signal de quelques centaines de hertz serait pris n'importe où dans sa
//    période : la courbe sauterait d'une image à l'autre.
const sonde = scopeProbePins(surBroche);
check('sonde : prise + sur D13 → le moteur date la broche 13',
  sonde.length === 1 && sonde[0].pin === '13' && sonde[0].partId === 'o1');
check('sonde : au milieu d’un pont diviseur, aucune broche à sonder (signal lent)',
  scopeProbePins(pont(O('o1'))).length === 0);
check('sonde : prises en l’air → rien à sonder',
  scopeProbePins({ parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, O('o1')], wires: [] }).length === 0);
check('sonde : sans oscilloscope au schéma, rien à sonder (aucun coût)',
  scopeProbePins(bornes(M('m1', 'voltage'))).length === 0);
// Deux appareils : chacun sa broche.
const deux = {
  parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, O('o1'), O('o2')],
  wires: [
    W('w1', pin('uno', '13'), pin('o1', '+')),
    W('w2', pin('o1', 'GND'), pin('uno', 'GND.1')),
    W('w3', pin('uno', '9'), pin('o2', '+')),
    W('w4', pin('o2', 'GND'), pin('uno', 'GND.1')),
  ],
};
check('sonde : deux oscilloscopes → deux broches datées',
  scopeProbePins(deux).map((q) => q.partId + '@' + q.pin).sort().join(' ') === 'o1@13 o2@9');
// Le hachage se surveille aussi pour un oscilloscope SEUL. Avant, il fallait un
// multimètre au schéma : la broche n'était pas suivie du tout, et la tension
// lue sautait entre 0 V et 5 V au hasard de l'image (retour de Frank).
check('sonde : un oscilloscope seul suffit à faire surveiller la broche',
  pulseMonitorPins(surBroche, 5).includes('13'));

// --- Rendu réel (Chrome headless) ----------------------------------------------
const CACHE = join(root, 'node_modules', '.cache-oscillo');
mkdirSync(CACHE, { recursive: true });
const entry = `
import '../../src/webview/composants/oscillo-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
import { Editor } from '../../src/webview/diagram/editor.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const el = document.createElement('kablix-oscillo');
	document.body.appendChild(el);
	await wait(80);
	const sh = el.shadowRoot;
	const svg = sh.querySelector('svg');
	const res = {};
	res.drawn = !!sh.querySelector('#Ecran-4') && !!sh.querySelector('#oscillo-bouton-tension')
		&& !!sh.querySelector('#oscillo-bouton-s_div');
	const box = svg.getBoundingClientRect();
	res.size = [Math.round(box.width), Math.round(box.height)];
	res.pins = el.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' ');
	const trace = sh.querySelector('#oscillo-trace');
	// Les calibres s'écrivent dans le cartouche DESSINÉ sous l'écran : trois
	// lignes empilées (calibre vertical, horizontal, déclenchement).
	const info = sh.querySelector('#text-info');
	const lignes = () => [].map.call(info.querySelectorAll('tspan'), (t) => t.textContent);
	const cal = () => lignes().slice(0, 2).join(' | ');
	const bb = (n) => { const b = n.getBoundingClientRect(); return [+b.left.toFixed(2), +b.top.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)]; };
	res.vide = trace.getAttribute('d') === '' && trace.style.display === 'none';
	res.calDepart = cal();
	res.calLignes = lignes().length;
	// Le cartouche est SOUS l'écran, pas dedans : il ne cache aucune courbe.
	res.calSousEcran = bb(info)[1] >= sh.querySelector('#Ecran-4').getBoundingClientRect().bottom - 0.5;
	// --- Trace calée sur la grille DESSINÉE ------------------------------------
	// Un carré 0/5 V à 1 V/div doit monter de exactement 5 carreaux, du zéro
	// (croisement des axes) au trait du haut.
	const bbox = () => { const b = trace.getBBox(); return [+b.x.toFixed(2), +b.y.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)]; };
	for (let i = 0; i <= 600; i++) el.push(i * 1000 / 60, Math.floor(i / 60) % 2 ? 5 : 0);
	await wait(10);
	res.carre = bbox();
	// Le même signal à 5 V/div : un seul carreau de haut.
	el.setAttribute('voltsdiv', '5');
	await wait(10);
	res.carre5 = bbox();
	el.setAttribute('voltsdiv', '1');
	await wait(10);
	// Fenêtre de temps : 10 carreaux. À 1 s/div les 10 s remplissent l'écran ;
	// à 5 s/div elles n'en occupent plus que le cinquième, collé à DROITE.
	res.pleineLargeur = bbox();
	el.setAttribute('sdiv', '5');
	await wait(10);
	res.large = bbox();
	res.calLarge = cal();
	el.setAttribute('sdiv', '1');
	await wait(10);
	// Écrêtage : 100 V à 1 V/div ne doit pas sortir de l'écran.
	el.clearTrace();
	for (let i = 0; i <= 60; i++) el.push(i * 1000 / 60, 100);
	await wait(10);
	res.ecrete = bbox();
	// Nouveau lancement de la simulation : l'écran repart vide.
	el.setAttribute('simulating', '');
	await wait(10);
	res.videAuDemarrage = trace.getAttribute('d') === '';
	// --- Unités du calibre horizontal ------------------------------------------
	const calFor = async (s) => { el.setAttribute('sdiv', s); await wait(5); return cal(); };
	res.calMs = await calFor('0.05');
	res.calUs = await calFor('0.00002');
	await calFor('1');
	// --- Boutons ---------------------------------------------------------------
	const zoneV = sh.querySelector('#oscillo-zone-volts');
	const zoneT = sh.querySelector('#oscillo-zone-time');
	res.zonesNoExport = zoneV.hasAttribute('data-no-export') && zoneT.hasAttribute('data-no-export');
	res.aiguillesUnwrap = sh.querySelector('#oscillo-aiguille-volts').hasAttribute('data-unwrap-export')
		&& sh.querySelector('#oscillo-aiguille-time').hasAttribute('data-unwrap-export');
	const clic = (zone, cote) => {
		const b = zone.getBoundingClientRect();
		zone.dispatchEvent(new PointerEvent('pointerdown', {
			bubbles: true, composed: true, cancelable: true,
			clientX: b.x + b.width * (cote === 'droite' ? 0.8 : 0.2), clientY: b.y + b.height / 2,
		}));
	};
	const molette = (zone, dy) => zone.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: dy }));
	// Inertes en édition (le clic sert à sélectionner et déplacer).
	el.removeAttribute('simulating');
	await wait(5);
	clic(zoneV, 'droite');
	molette(zoneT, -100);
	res.edition = [el.getAttribute('voltsdiv'), el.getAttribute('sdiv')];
	// En simulation : la moitié droite tourne à droite.
	el.setAttribute('simulating', '');
	await wait(5);
	let vu = null;
	el.addEventListener('scope-scale', (e) => { vu = e.detail; });
	clic(zoneV, 'droite');
	await wait(5);
	res.voltsDroite = el.getAttribute('voltsdiv');
	res.evenement = vu && [vu.voltsdiv, vu.sdiv];
	clic(zoneV, 'gauche');
	await wait(5);
	res.voltsGauche = el.getAttribute('voltsdiv');
	res.aiguille1 = sh.querySelector('#oscillo-aiguille-volts').getAttribute('transform');
	// Butée aux deux bouts : cinq crans, pas de bouclage.
	for (let i = 0; i < 6; i++) clic(zoneV, 'droite');
	await wait(5);
	res.voltsMax = el.getAttribute('voltsdiv');
	res.aiguilleMax = sh.querySelector('#oscillo-aiguille-volts').getAttribute('transform');
	for (let i = 0; i < 8; i++) clic(zoneV, 'gauche');
	await wait(5);
	res.voltsMin = el.getAttribute('voltsdiv');
	res.aiguilleMin = sh.querySelector('#oscillo-aiguille-volts').getAttribute('transform');
	// Bouton s/div : la suite 1 - 2 - 5, donc UN TOUR = trois crans = facteur 10.
	el.setAttribute('sdiv', '1');
	await wait(5);
	res.sdivSuite = [];
	for (let i = 0; i < 9; i++) {
		molette(zoneT, -100);
		await wait(2);
		res.sdivSuite.push(Number(el.getAttribute('sdiv')));
	}
	// Retour à 1 s, puis un tour plein à droite.
	for (let i = 0; i < 9; i++) molette(zoneT, 100);
	await wait(5);
	for (let i = 0; i < 3; i++) molette(zoneT, -100);
	await wait(5);
	res.sdivTour = Number(el.getAttribute('sdiv'));
	res.aiguilleTour = sh.querySelector('#oscillo-aiguille-time').getAttribute('transform');
	for (let i = 0; i < 6; i++) molette(zoneT, 100);
	await wait(5);
	res.sdivRetour = Number(el.getAttribute('sdiv'));
	// Cinquante crans de plus : le bouton descend jusqu'à sa butée basse (1 µs).
	for (let i = 0; i < 50; i++) molette(zoneT, -100);
	await wait(5);
	res.sdivLoin = Number(el.getAttribute('sdiv'));
	el.removeAttribute('simulating');

	// --- Déclenchement ---------------------------------------------------------
	// Sans lui la courbe glisse : chaque image repartirait où le hasard l'a
	// laissée. L'appareil cale le bord GAUCHE de l'écran sur un passage du signal
	// par la tension de déclenchement, toujours dans le même sens.
	const cur = sh.querySelector('#oscillo-trigger-cursor');
	const zoneTrig = sh.querySelector('#oscillo-zone-trigger');
	const mover = sh.querySelector('#trigger-button-mover');
	res.trigNoExport = cur.hasAttribute('data-no-export') && zoneTrig.hasAttribute('data-no-export');
	// La zone de clic recouvre PILE le bouton dessiné.
	res.trigZone = bb(zoneTrig);
	res.trigBouton = bb(sh.querySelector('#trigger-button'));
	el.setAttribute('voltsdiv', '1');
	el.setAttribute('sdiv', '1');
	el.removeAttribute('trigger');
	el.setAttribute('triggeredge', 'rising');
	el.setAttribute('simulating', '');
	await wait(5);
	el.clearTrace();
	// Créneau 0/5 V : une seconde en haut, une seconde en bas, 30 s d'historique
	// (il faut plus d'un écran derrière soi pour trouver un front).
	const creneau = () => { for (let i = 0; i <= 1800; i++) el.push(i * 1000 / 60, Math.floor(i / 60) % 2 ? 5 : 0); };
	creneau();
	await wait(10);
	res.decAuto = lignes()[2];
	res.curAuto = cur.getAttribute('d');
	res.dMontant = trace.getAttribute('d').slice(0, 11);
	res.moverHaut = bb(mover);
	el.setAttribute('triggeredge', 'falling');
	await wait(10);
	res.dDescendant = trace.getAttribute('d').slice(0, 13);
	res.moverBas = bb(mover);
	el.setAttribute('triggeredge', 'rising');
	await wait(5);
	// Curseur pris à la souris. Le dessin est à l'échelle 1:1 : viser la 4e
	// graduation au-dessus du zéro, c'est viser 108,86 − 4 × 19,82 = 29,58 px.
	const tirer = (yDessin) => {
		const boite = svg.getBoundingClientRect();
		cur.dispatchEvent(new PointerEvent('pointerdown', {
			bubbles: true, composed: true, cancelable: true,
			clientX: boite.left + 12, clientY: boite.top + yDessin,
		}));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	};
	el.removeAttribute('simulating');
	await wait(5);
	tirer(29.58);
	res.curseurEdition = el.getAttribute('trigger');
	el.setAttribute('simulating', '');
	await wait(5);
	el.clearTrace();
	creneau();
	await wait(5);
	let vuT = null;
	el.addEventListener('scope-scale', (e) => { vuT = e.detail; });
	tirer(29.58);
	await wait(5);
	res.trigVolts = el.getAttribute('trigger');
	res.decManuel = lignes()[2];
	res.curManuel = cur.getAttribute('d');
	res.evtTrig = vuT && [vuT.trigger, vuT.triggeredge];
	res.dManuel = trace.getAttribute('d').slice(0, 11);
	// Bouton de sens : inerte en édition, bascule en simulation.
	const clicTrig = () => {
		const b = zoneTrig.getBoundingClientRect();
		zoneTrig.dispatchEvent(new PointerEvent('pointerdown', {
			bubbles: true, composed: true, cancelable: true,
			clientX: b.left + b.width / 2, clientY: b.top + b.height / 2,
		}));
	};
	el.removeAttribute('simulating');
	await wait(5);
	clicTrig();
	res.edgeEdition = el.getAttribute('triggeredge');
	el.setAttribute('simulating', '');
	await wait(5);
	clicTrig();
	await wait(5);
	res.edgeClic = el.getAttribute('triggeredge');
	clicTrig();
	await wait(5);
	res.edgeRetour = el.getAttribute('triggeredge');
	el.removeAttribute('trigger');
	el.removeAttribute('simulating');
	el.clearTrace();
	await wait(5);

	// --- Escalier : ce que verse la sonde du moteur -----------------------------
	// Deux points au MÊME instant à chaque bascule, et RIEN entre deux : c'est
	// tout ce que rend le moteur, qui date les fronts au cycle près.
	el.setAttribute('voltsdiv', '1');
	el.setAttribute('sdiv', '1');
	await wait(5);
	const fronts = [];
	for (let k = 0; k <= 20; k++) {
		const t = k * 500;
		const v = k % 2 ? 5 : 0;
		if (k > 0) fronts.push(t, k % 2 ? 0 : 5);
		fronts.push(t, v);
	}
	el.pushMany(fronts);
	await wait(10);
	res.escalierD = trace.getAttribute('d');
	res.escalierBox = bbox();
	// Contre-épreuve : les MÊMES fronts versés un par un (mode instantanés).
	el.clearTrace();
	await wait(5);
	for (let i = 0; i + 1 < fronts.length; i += 2) el.push(fronts[i], fronts[i + 1]);
	await wait(10);
	res.penteD = trace.getAttribute('d');
	el.clearTrace();
	await wait(5);

	// --- Éditeur réel : pastilles des prises banane -----------------------------
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const osc = editor.addPart('oscillo', 40, 40);
	const servo = editor.addPart('servo', 400, 40);
	await wait(120);
	const pads = (id, cls) => editor.rendered.get(id).container.querySelectorAll(cls).length;
	res.oscPads = [pads(osc.id, '.pin'), pads(osc.id, '.pin--vcc'), pads(osc.id, '.pin--gnd')];
	res.servoPads = [pads(servo.id, '.pin--vcc'), pads(servo.id, '.pin--gnd')];
	res.ref = osc.id;
	// L'inspecteur écrit les calibres dans le schéma (le bouton passe par lui).
	editor.updatePartAttr(osc.id, 'voltsdiv', '0.5');
	editor.updatePartAttr(osc.id, 'sdiv', '0.25');
	await wait(30);
	const enregistre = editor.diagram.parts.find((p) => p.id === osc.id).attrs;
	res.attrEcrit = [enregistre.voltsdiv, enregistre.sdiv];
	res.attrPose = [editor.elementOf(osc.id).getAttribute('voltsdiv'), editor.elementOf(osc.id).getAttribute('sdiv')];

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
    // Grille DESSINÉE par Frank : 10 carreaux de 19,82 px, zéro au croisement
    // des axes (105,99 ; 108,86). Toute la trace se cale là-dessus.
    const DIV = 19.82, ZERO_Y = 108.86, GAUCHE = 10.34, LARGEUR = 198.2;
    const pres = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;
    check('rendu : dessin de Frank présent (écran + les deux boutons)', r.drawn === true);
    check('rendu : 220×270 px (1:1 viewBox)', r.size[0] === 220 && r.size[1] === 270);
    check('rendu : broches +@50,250 GND@70,250', r.pins === '+@50,250 GND@70,250');
    check('rendu : sans mesure, écran vierge (aucune courbe)', r.vide === true);
    check('rendu : calibres écrits « Vert : 1 V/div | Hor : 1 s/div »',
      r.calDepart === 'Vert : 1 V/div | Hor : 1 s/div');
    check('rendu : cartouche de trois lignes, SOUS l\'écran (aucune courbe cachée)',
      r.calSousEcran === true && r.calLignes === 3);
    check(`rendu : carré 0/5 V à 1 V/div → 5 carreaux pile (${r.carre[3]} px)`,
      pres(r.carre[3], 5 * DIV) && pres(r.carre[1] + r.carre[3], ZERO_Y));
    check(`rendu : le même à 5 V/div → un seul carreau (${r.carre5[3]} px)`, pres(r.carre5[3], DIV));
    check('rendu : à 1 s/div, 10 s de signal remplissent l\'écran',
      pres(r.pleineLargeur[0], GAUCHE) && pres(r.pleineLargeur[2], LARGEUR, 1.5));
    check(`rendu : à 5 s/div, les mêmes 10 s tiennent dans deux carreaux, collées à droite (${r.large[2]} px)`,
      pres(r.large[2], 2 * DIV, 1.5) && pres(r.large[0] + r.large[2], GAUCHE + LARGEUR, 1.5));
    check('rendu : calibre horizontal suivi (5 s/div)', r.calLarge === 'Vert : 1 V/div | Hor : 5 s/div');
    check('rendu : 100 V à 1 V/div → courbe écrêtée au bord de l\'écran, pas hors cadre',
      pres(r.ecrete[1], 9.76) && r.ecrete[3] <= 1);
    check('rendu : nouveau lancement → écran effacé', r.videAuDemarrage === true);
    check('rendu : calibre en millisecondes sous la seconde', r.calMs === 'Vert : 1 V/div | Hor : 50 ms/div');
    check('rendu : calibre en microsecondes sous la milliseconde', r.calUs === 'Vert : 1 V/div | Hor : 20 µs/div');
    check('rendu : zones de clic hors du dessin exporté (data-no-export)', r.zonesNoExport === true);
    check('rendu : aiguilles aplaties à l\'export (data-unwrap-export)', r.aiguillesUnwrap === true);
    check('rendu : boutons INERTES en édition (le clic sélectionne le composant)',
      r.edition[0] === '1' && r.edition[1] === '1');
    check('rendu : en simulation, moitié droite → calibre supérieur (1 → 2 V/div) + événement',
      r.voltsDroite === '2' && r.evenement && r.evenement[0] === 2);
    check('rendu : moitié gauche → calibre inférieur (retour à 1 V/div)', r.voltsGauche === '1');
    check('rendu : aiguille sur la 3e graduation à 1 V/div (2 × 75°)',
      /rotate\(150 /.test(r.aiguille1));
    check('rendu : butée en haut du Volts/div (5 V/div, aiguille à 300°)',
      r.voltsMax === '5' && /rotate\(300 /.test(r.aiguilleMax));
    check('rendu : butée en bas du Volts/div (0,1 V/div, aiguille au repos)',
      r.voltsMin === '0.1' && /rotate\(0 /.test(r.aiguilleMin));
    check(`rendu : s/div — un tour de bouton (3 crans à droite) = courbe 10 fois dilatée (${r.sdivTour})`,
      near(r.sdivTour, 0.1, 0.02) && /rotate\(360/.test(r.aiguilleTour));
    check(`rendu : 6 crans à gauche → retour à 10 s/div (${r.sdivRetour})`, near(r.sdivRetour, 10, 0.02));
    // Neuf crans depuis 1 s : la suite d'un vrai appareil, trois décades pleines.
    check(`rendu : s/div avance en 1 - 2 - 5 (${(r.sdivSuite || []).join(' ')})`,
      JSON.stringify(r.sdivSuite) === JSON.stringify([0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001]));
    check(`rendu : le bouton s/div s'arrête à sa butée basse (50 crans de plus : ${r.sdivLoin} s/div)`,
      near(r.sdivLoin, 1e-6, 1e-9));
    // --- Déclenchement ---------------------------------------------------------
    const hauteurCurseur = (d) => Number(/L17\.34,([\d.]+)/.exec(d || '')?.[1]);
    check('déclenchement : curseur et zone de clic hors du dessin exporté', r.trigNoExport === true);
    check('déclenchement : la zone de clic recouvre le bouton dessiné',
      r.trigZone.every((v, i) => pres(v, r.trigBouton[i], 0.6)));
    check(`déclenchement : niveau posé tout seul à mi-hauteur du créneau (${r.decAuto})`,
      r.decAuto === 'Dec : 2,5 V' && pres(hauteurCurseur(r.curAuto), ZERO_Y - 2.5 * DIV, 0.1));
    check('déclenchement : front MONTANT → l\'écran commence en haut du créneau',
      r.dMontant === 'M10.34,9.76');
    check('déclenchement : front DESCENDANT → l\'écran commence en bas',
      r.dDescendant === 'M10.34,108.86');
    check('déclenchement : la moitié bleue du bouton descend d\'exactement sa hauteur',
      pres(r.moverBas[1] - r.moverHaut[1], r.moverHaut[3], 0.3) &&
      pres(r.moverBas[2], r.moverHaut[2], 0.1));
    check('déclenchement : curseur INERTE en édition', r.curseurEdition === null);
    check(`déclenchement : curseur tiré sur la 4e graduation → 4 V (${r.trigVolts})`,
      near(Number(r.trigVolts), 4, 0.02) && r.decManuel === 'Dec : 4 V');
    check('déclenchement : le triangle se pose à la hauteur réglée',
      pres(hauteurCurseur(r.curManuel), ZERO_Y - 4 * DIV, 0.1));
    check('déclenchement : réglage renvoyé à l\'hôte (scope-scale)',
      !!r.evtTrig && near(Number(r.evtTrig[0]), 4, 0.02) && r.evtTrig[1] === 'rising');
    check('déclenchement : à 4 V le créneau cale encore sur le front montant',
      r.dManuel === 'M10.34,9.76');
    check('déclenchement : bouton de sens INERTE en édition', r.edgeEdition === 'rising');
    check('déclenchement : un clic bascule le sens, un autre le ramène',
      r.edgeClic === 'falling' && r.edgeRetour === 'rising');
    // --- Escalier ---------------------------------------------------------------
    // Un créneau ne se dessine correctement que si le trait TIENT le palier puis
    // saute d'un coup : sinon il monte en pente d'un front au suivant, et
    // l'écran montre des triangles (retour de Frank sur oscillo-pico2).
    const pts = (d) => (d || '').slice(1).split('L').map((s) => s.split(',').map(Number));
    const marches = (d) => {
      const p = pts(d);
      let plats = 0, sauts = 0, pentes = 0;
      for (let i = 1; i < p.length; i++) {
        const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1];
        if (Math.abs(dy) < 0.01) { if (dx > 0.01) plats++; }
        else if (Math.abs(dx) < 0.01) sauts++;
        else pentes++;
      }
      return { plats, sauts, pentes };
    };
    const esc = marches(r.escalierD);
    check(`escalier : que des paliers et des sauts droits, aucune pente (${esc.plats} plats, ${esc.sauts} sauts, ${esc.pentes} pentes)`,
      esc.pentes === 0 && esc.sauts >= 10 && esc.plats >= 10);
    check(`escalier : créneau 0/5 V à 1 V/div → 5 carreaux pile (${r.escalierBox[3]} px)`,
      pres(r.escalierBox[3], 5 * DIV) && pres(r.escalierBox[1] + r.escalierBox[3], ZERO_Y));
    check(`contre-épreuve : les mêmes fronts pris un par un montent EN PENTE (${marches(r.penteD).pentes})`,
      marches(r.penteD).pentes > 0);

    check('éditeur : prises banane SANS pastille rouge/noire (2 .pin nus)',
      r.oscPads[0] === 2 && r.oscPads[1] === 0 && r.oscPads[2] === 0);
    check('éditeur : le servo garde ses pastilles V+/GND (contre-épreuve)',
      r.servoPads[0] === 1 && r.servoPads[1] === 1);
    check(`éditeur : repère d'appareil de mesure (${r.ref})`, /^M\d+$/.test(r.ref));
    check('éditeur : les calibres sont enregistrés dans le schéma et posés sur l\'élément',
      r.attrEcrit.join(',') === '0.5,0.25' && r.attrPose.join(',') === '0.5,0.25');
  }
} else {
  console.log('⚠️ Chrome introuvable : rendu headless sauté');
}

console.log(failures === 0 ? '\nverify:oscillo OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
