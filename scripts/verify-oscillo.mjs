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
	res.drawn = !!sh.querySelector('#oscillo-ecran') && !!sh.querySelector('#oscillo-bouton-tension')
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
	res.calSousEcran = bb(info)[1] >= sh.querySelector('#oscillo-ecran').getBoundingClientRect().bottom - 0.5;
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
	res.dMontant = trace.getAttribute('d').slice(0, 12);
	res.moverHaut = bb(mover);
	el.setAttribute('triggeredge', 'falling');
	await wait(10);
	res.dDescendant = trace.getAttribute('d').slice(0, 13);
	res.moverBas = bb(mover);
	el.setAttribute('triggeredge', 'rising');
	await wait(5);
	// Curseur pris à la souris. Le dessin est à l'échelle 1:1 : viser la 4e
	// graduation au-dessus du zéro, c'est viser 114,25 − 4 × 20 = 34,25 px.
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
	tirer(34.25);
	res.curseurEdition = el.getAttribute('trigger');
	el.setAttribute('simulating', '');
	await wait(5);
	el.clearTrace();
	creneau();
	await wait(5);
	let vuT = null;
	el.addEventListener('scope-scale', (e) => { vuT = e.detail; });
	tirer(34.25);
	await wait(5);
	res.trigVolts = el.getAttribute('trigger');
	res.decManuel = lignes()[2];
	res.curManuel = cur.getAttribute('d');
	res.evtTrig = vuT && [vuT.trigger, vuT.triggeredge];
	res.dManuel = trace.getAttribute('d').slice(0, 12);
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
	// Flèche de POSITION du déclenchement (bord bas de l'écran). Le créneau
	// reste bas une seconde avant chaque front montant, haut la seconde d'avant :
	// à 10 s par écran, 5 % de largeur = 0,5 s avant le front (en bas), 15 % =
	// 1,5 s avant (en haut). Position 0 = l'écran commence sur le front (en haut).
	const fleche = sh.querySelector('#oscillo-trigger-pos');
	res.posNoExport = !!fleche && fleche.hasAttribute('data-no-export');
	res.posDefaut = fleche && fleche.getAttribute('d');
	const glisser = (xDessin) => {
		const boite = svg.getBoundingClientRect();
		fleche.dispatchEvent(new PointerEvent('pointerdown', {
			bubbles: true, composed: true, cancelable: true,
			clientX: boite.left + xDessin, clientY: boite.top + 210,
		}));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	};
	el.removeAttribute('trigger');
	el.removeAttribute('simulating');
	await wait(5);
	glisser(14.75 + 0.05 * 199.5);
	res.posEdition = el.getAttribute('triggerpos');
	el.setAttribute('simulating', '');
	await wait(5);
	el.clearTrace();
	creneau();
	await wait(5);
	let vuP = null;
	el.addEventListener('scope-scale', (e) => { vuP = e.detail; });
	glisser(14.75 + 0.05 * 199.5);
	await wait(5);
	res.pos5 = el.getAttribute('triggerpos');
	res.posEvt = vuP && vuP.triggerpos;
	res.posFleche5 = fleche.getAttribute('d');
	res.dPos5 = trace.getAttribute('d').slice(0, 13);
	el.setAttribute('triggerpos', '0.15');
	await wait(5);
	res.dPos15 = trace.getAttribute('d').slice(0, 12);
	glisser(400);
	await wait(5);
	res.posLoin = el.getAttribute('triggerpos');
	res.posFlecheLoin = fleche.getAttribute('d');
	glisser(-50);
	await wait(5);
	res.posGauche = el.getAttribute('triggerpos');
	el.removeAttribute('triggerpos');
	el.removeAttribute('trigger');
	el.removeAttribute('simulating');
	el.clearTrace();
	await wait(5);

	// --- Curseurs de mesure T et V ----------------------------------------------
	const vis = (sel) => { const n = sh.querySelector(sel); return !!n && n.style.display !== 'none'; };
	const ligne = (id) => { const l = sh.querySelector(id); return ['x1', 'y1', 'x2', 'y2'].map((a) => Number(l.getAttribute(a))); };
	const texteCur = (r) => sh.querySelector('#oscillo-cursor-' + r + '-label').textContent;
	const clicCac = (r) => {
		const z = sh.querySelector('#oscillo-zone-cac-' + r);
		const b = z.getBoundingClientRect();
		z.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.bottom - 3 }));
	};
	const tirerLigne = (id, xD, yD) => {
		const boite = svg.getBoundingClientRect();
		sh.querySelector(id).dispatchEvent(new PointerEvent('pointerdown', {
			bubbles: true, composed: true, cancelable: true, clientX: boite.left + xD, clientY: boite.top + yD,
		}));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	};
	el.setAttribute('voltsdiv', '1');
	el.setAttribute('sdiv', '1');
	await wait(5);
	res.cacDepart = [vis('#oscillo-cursors-t'), vis('#oscillo-cursors-v'), vis('#oscillo-cac-t-coche'), vis('#oscillo-cac-v-coche')];
	res.cacNoExport = ['#oscillo-cursors-t', '#oscillo-cursors-v', '#oscillo-zone-cac-t', '#oscillo-zone-cac-v', '#oscillo-cac-t-coche']
		.every((s) => sh.querySelector(s).hasAttribute('data-no-export'));
	// La zone de clic contient la case dessinée.
	const caseT = bb(sh.querySelector('#oscille-cac-T'));
	const zT = bb(sh.querySelector('#oscillo-zone-cac-t'));
	res.cacZone = zT[0] <= caseT[0] && zT[1] <= caseT[1] && zT[0] + zT[2] >= caseT[0] + caseT[2] && zT[1] + zT[3] >= caseT[1] + caseT[3];
	clicCac('t');
	res.cacEdition = el.getAttribute('cursort');
	el.setAttribute('simulating', '');
	await wait(5);
	let vuC = null;
	el.addEventListener('scope-scale', (e) => { vuC = e.detail; });
	clicCac('t');
	await wait(5);
	res.cacT = [el.getAttribute('cursort'), vis('#oscillo-cursors-t'), vis('#oscillo-cac-t-coche'), vis('#oscillo-cursors-v')];
	res.cacEvt = vuC && [vuC.cursort, vuC.cursortpos];
	res.ligneT = [ligne('#oscillo-cursor-t1'), ligne('#oscillo-cursor-t2')];
	res.texteT1 = texteCur('t');
	res.flecheT = sh.querySelector('#oscillo-cursor-t-arrow').getAttribute('d');
	// Ligne 2 tirée sur la 2e graduation à droite du centre : 2,5 carreaux d'écart.
	tirerLigne('#oscillo-cursor-t2-zone', 114.75 + 2 * 20, 60);
	await wait(5);
	res.posT = el.getAttribute('cursortpos');
	res.texteT2 = texteCur('t');
	res.ligneT2 = ligne('#oscillo-cursor-t2');
	res.evtPosT = vuC && vuC.cursortpos;
	el.setAttribute('sdiv', '0.001');
	await wait(5);
	res.texteTms = texteCur('t');
	res.ligneTms = ligne('#oscillo-cursor-t2');
	el.setAttribute('sdiv', '1');
	// Curseur V : lignes horizontales, écart en volts.
	clicCac('v');
	await wait(5);
	res.cacV = [el.getAttribute('cursorv'), vis('#oscillo-cursors-v')];
	res.ligneV = [ligne('#oscillo-cursor-v1'), ligne('#oscillo-cursor-v2')];
	res.texteV1 = texteCur('v');
	el.setAttribute('voltsdiv', '0.5');
	await wait(5);
	res.texteV05 = texteCur('v');
	el.setAttribute('voltsdiv', '1');
	// Ligne 1 tirée loin sous l'écran : elle s'arrête au bord bas.
	tirerLigne('#oscillo-cursor-v1-zone', 60, 400);
	await wait(5);
	res.posVBas = el.getAttribute('cursorvpos');
	res.texteVBas = texteCur('v');
	// Décocher T : tout disparaît, V reste.
	clicCac('t');
	await wait(5);
	res.cacTOff = [el.getAttribute('cursort'), vis('#oscillo-cursors-t'), vis('#oscillo-cac-t-coche'), vis('#oscillo-cursors-v')];
	el.setAttribute('cursorv', '0');
	el.removeAttribute('cursortpos');
	el.removeAttribute('cursorvpos');
	el.removeAttribute('simulating');
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

	// --- Salve d'onde CONTINUE : le générateur BF rééchantillonné ---------------
	// Un GBF n'a pas de front à dater : sim.mts rejoue sa formule des centaines de
	// fois par image et verse la salve avec la retenue à FAUX. Sans ce mode, un
	// sinus serait dessiné en escalier au lieu d'être relié en pente. Un point
	// par image ne marchait pas du tout : à 1 kHz, seize périodes s'écoulent entre
	// deux images (« l'oscilloscope n'affiche pas du tout ce qui est généré par le
	// GBF », Frank).
	el.setAttribute('voltsdiv', '1');
	el.setAttribute('sdiv', '0.0005'); // 5 ms d'écran = 5 périodes à 1 kHz
	el.removeAttribute('trigger');
	await wait(5);
	const sinus = [];
	for (let k = 1; k <= 1200; k++) {
		const t = (10 * k) / 1200; // 10 ms, deux largeurs d'écran
		sinus.push(t, 2.5 * Math.sin(2 * Math.PI * 1000 * (t / 1000)));
	}
	el.pushMany(sinus, false);
	await wait(10);
	res.ondeD = trace.getAttribute('d');
	res.ondeBox = bbox();
	// Le MODE lui-même se prouve sur une salve CLAIRSEMÉE, moins dense que les
	// 199 colonnes de l'écran : là, la retenue et la pente ne dessinent pas la
	// même chose. Sur la salve dense d'au-dessus, chaque colonne reçoit six
	// points et l'enveloppe est identique des deux côtés — un contrôle posé là
	// passerait avant comme après, donc ne prouverait rien.
	el.clearTrace();
	await wait(5);
	const clair = [];
	for (let k = 1; k <= 40; k++) {
		const t = (5 * k) / 40; // 5 ms, une largeur d'écran, 40 points seulement
		clair.push(t, 2.5 * Math.sin(2 * Math.PI * 200 * (t / 1000)));
	}
	el.pushMany(clair, false);
	await wait(10);
	res.clairPenteD = trace.getAttribute('d');
	// Contre-épreuve DANS LE BANC : la même salve au mode de retenue (le défaut).
	el.clearTrace();
	await wait(5);
	el.pushMany(clair);
	await wait(10);
	res.clairHoldD = trace.getAttribute('d');
	el.clearTrace();
	await wait(5);

	// --- Servo à 50 Hz sous 1 ms/div : image par image, comme sim.mts ----------
	// Impulsion de 1,5 ms toutes les 20 ms, écran de 10 ms, déclenchement posé
	// tout seul. Une image sur deux, les 10 dernières ms ne contenaient AUCUN
	// front : la mi-hauteur tombait à 0 V, plus rien ne déclenchait, la courbe
	// redéfilait — elle clignotait (retour de Frank, Patte-pico-sans 16servo).
	el.setAttribute('voltsdiv', '1');
	el.setAttribute('sdiv', '0.001');
	el.setAttribute('triggerpos', '0.099');
	el.removeAttribute('trigger');
	await wait(5);
	const servoTraces = [];
	let dernier = 0;
	for (let image = 1; image <= 60; image++) {
		const maintenant = image * 16.7;
		const salve = [];
		for (let p = 0; p * 20 <= maintenant; p++) {
			for (const [t, avant, apres] of [[p * 20, 0, 3.3], [p * 20 + 1.5, 3.3, 0]]) {
				if (t > dernier && t <= maintenant) salve.push(t, avant, t, apres);
			}
		}
		const haut = (maintenant % 20) < 1.5 ? 3.3 : 0;
		salve.push(maintenant, haut);
		dernier = maintenant;
		el.pushMany(salve);
		if (image > 10) servoTraces.push(trace.getAttribute('d'));
	}
	res.servoDistinctes = new Set(servoTraces).size;
	res.servoEchantillons = [...new Set(servoTraces)].slice(0, 4);
	res.servoD = servoTraces[servoTraces.length - 1];
	el.removeAttribute('triggerpos');
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
const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (chrome) {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([^<]+)<\/pre>/);
  if (!m) {
    check('rendu headless : mesures produites', false);
  } else {
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    // Grille DESSINÉE par Frank : 10 carreaux de 20 px, zéro au croisement
    // des axes (114,75 ; 114,25). Toute la trace se cale là-dessus.
    const DIV = 20, ZERO_Y = 114.25, GAUCHE = 14.75, LARGEUR = 199.5, HAUT = 14.25;
    const pres = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;
    check('rendu : dessin de Frank présent (écran + les deux boutons)', r.drawn === true);
    check('rendu : 230×300 px (1:1 viewBox)', r.size[0] === 230 && r.size[1] === 300);
    check('rendu : broches +@50,280 GND@70,280', r.pins === '+@50,280 GND@70,280');
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
      pres(r.ecrete[1], HAUT) && r.ecrete[3] <= 1);
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
    const hauteurCurseur = (d) => Number(/L21\.75,([\d.]+)/.exec(d || '')?.[1]);
    check('déclenchement : curseur et zone de clic hors du dessin exporté', r.trigNoExport === true);
    check('déclenchement : la zone de clic recouvre le bouton dessiné',
      r.trigZone.every((v, i) => pres(v, r.trigBouton[i], 0.6)));
    check(`déclenchement : niveau posé tout seul à mi-hauteur du créneau (${r.decAuto})`,
      r.decAuto === 'Dec : 2,5 V' && pres(hauteurCurseur(r.curAuto), ZERO_Y - 2.5 * DIV, 0.1));
    check('déclenchement : front MONTANT → l\'écran commence en haut du créneau',
      r.dMontant === 'M14.75,14.25');
    check('déclenchement : front DESCENDANT → l\'écran commence en bas',
      r.dDescendant === 'M14.75,114.25');
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
      r.dManuel === 'M14.75,14.25');
    check('déclenchement : bouton de sens INERTE en édition', r.edgeEdition === 'rising');
    check('déclenchement : un clic bascule le sens, un autre le ramène',
      r.edgeClic === 'falling' && r.edgeRetour === 'rising');
    // Flèche de position : pointe en haut, base sur le bord bas de l'écran.
    const sommet = (d) => /L([\d.]+),([\d.]+)L/.exec(d || '')?.slice(1).map(Number) ?? [NaN, NaN];
    const BAS = HAUT + LARGEUR;
    check('position : flèche hors du dessin exporté', r.posNoExport === true);
    check(`position : flèche au coin bas-gauche par défaut (${r.posDefaut})`,
      pres(sommet(r.posDefaut)[0], GAUCHE, 0.05) && pres(sommet(r.posDefaut)[1], BAS - 7, 0.05)
      && /^M[\d.]+,213\.75L/.test(r.posDefaut || ''));
    check('position : flèche INERTE en édition', r.posEdition === null);
    check(`position : flèche tirée à 5 % de la largeur (${r.pos5})`,
      near(Number(r.pos5), 0.05, 0.02) && pres(sommet(r.posFleche5)[0], GAUCHE + 0.05 * LARGEUR, 0.3));
    check('position : réglage renvoyé à l\'hôte (scope-scale)', near(Number(r.posEvt), 0.05, 0.02));
    check(`position : 5 % → l'écran montre le bas du créneau AVANT le front (${r.dPos5})`,
      r.dPos5 === 'M14.75,114.25');
    check(`position : 15 % → la demi-période haute d'avant (${r.dPos15})`,
      r.dPos15 === 'M14.75,14.25');
    check(`position : tirée loin à droite, la flèche s'arrête au bord (${r.posLoin})`,
      r.posLoin === '1' && pres(sommet(r.posFlecheLoin)[0], GAUCHE + LARGEUR, 0.05));
    check(`position : tirée loin à gauche, retour au bord gauche (${r.posGauche})`, r.posGauche === '0');
    // --- Curseurs de mesure --------------------------------------------------------
    check('curseurs : cachés et cases décochées au départ', JSON.stringify(r.cacDepart) === '[false,false,false,false]');
    check('curseurs : hors du dessin exporté', r.cacNoExport === true);
    check('curseurs : la zone de clic couvre la case T dessinée', r.cacZone === true);
    check('curseurs : case INERTE en édition', r.cacEdition === null);
    check('curseurs : case T cochée → coche et deux lignes T, V toujours caché',
      JSON.stringify(r.cacT) === '["1",true,true,false]');
    check('curseurs : case renvoyée à l\'hôte (scope-scale)', !!r.cacEvt && r.cacEvt[0] === '1' && r.cacEvt[1] === '-0.5,0.5');
    check(`curseurs : T verticaux, de part et d'autre du centre, un carreau d'écart (${r.ligneT.map((l) => l[0]).join(' / ')})`,
      pres(r.ligneT[0][0], 104.75, 0.01) && pres(r.ligneT[1][0], 124.75, 0.01)
      && r.ligneT.every((l) => l[0] === l[2] && pres(l[1], HAUT, 0.01) && pres(l[3], HAUT + LARGEUR, 0.01)));
    check(`curseurs : écart T à 1 s/div → « ${r.texteT1} »`, r.texteT1 === 'ΔT = 1 s');
    check('curseurs : flèche double T (trait + deux pointes)', (r.flecheT.match(/M/g) || []).length === 3);
    check(`curseurs : ligne T glissée sur la 2e graduation (${r.posT})`,
      r.posT === '-0.5,2' && pres(r.ligneT2[0], 154.75, 0.01) && r.evtPosT === '-0.5,2');
    check(`curseurs : écart relu au glissé → « ${r.texteT2} »`, r.texteT2 === 'ΔT = 2,5 s');
    check(`curseurs : calibre changé, lignes immobiles, écart relu en ms (« ${r.texteTms} »)`,
      r.texteTms === 'ΔT = 2,5 ms' && pres(r.ligneTms[0], 154.75, 0.01));
    check(`curseurs : V horizontaux, un carreau d'écart (${r.ligneV.map((l) => l[1]).join(' / ')})`,
      r.cacV[0] === '1' && r.cacV[1] === true && pres(r.ligneV[0][1], 124.25, 0.01) && pres(r.ligneV[1][1], 104.25, 0.01)
      && r.ligneV.every((l) => l[1] === l[3] && pres(l[0], GAUCHE, 0.01)));
    check(`curseurs : écart V à 1 V/div → « ${r.texteV1} », à 0,5 V/div → « ${r.texteV05} »`,
      r.texteV1 === 'ΔV = 1 V' && r.texteV05 === 'ΔV = 0,5 V');
    check(`curseurs : ligne V tirée sous l'écran, arrêtée au bord bas (${r.posVBas}, ${r.texteVBas})`,
      r.posVBas === '-4.97,0.5' && r.texteVBas === 'ΔV = 5,47 V');
    check('curseurs : case T décochée → lignes T et coche cachées, V reste',
      JSON.stringify(r.cacTOff) === '["0",false,false,true]');
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

    // --- Onde continue (générateur BF rééchantillonné) -------------------------
    //
    // La trace est dessinée COLONNE PAR COLONNE, du plus bas au plus haut vu
    // dans le pixel : une salve dense donne donc des barres verticales, et non
    // une polyligne. Compter les pentes ou les passages par zéro ne dirait rien
    // ici — ce qui compte, c'est l'ENVELOPPE : sa hauteur et son ondulation.
    //
    // Amplitude crête 2,5 V à 1 V/div = 5 carreaux du creux au sommet, centrés
    // sur le zéro. Si le rééchantillonnage tombait au hasard dans la période (le
    // défaut d'avant, un point par image), la hauteur serait plus faible et le
    // centre partirait.
    check(`onde : sinus ±2,5 V à 1 V/div → 5 carreaux centrés sur le zéro (${r.ondeBox[3]} px)`,
      pres(r.ondeBox[3], 5 * DIV) && pres(r.ondeBox[1] + r.ondeBox[3] / 2, ZERO_Y));
    {
      const p = (r.ondeD || '').slice(1).split('L').map((s) => s.split(',').map(Number));
      // Sommet de l'enveloppe colonne par colonne (y le plus PETIT à l'écran).
      const hauts = new Map();
      for (const [x, y] of p) {
        const c = Math.round(x);
        const v = hauts.get(c);
        if (v === undefined || y < v) hauts.set(c, y);
      }
      const suite = [...hauts.keys()].sort((a, b) => a - b).map((c) => hauts.get(c));
      // Alternances du sommet autour du zéro : un sinus de 1 kHz sur un écran de
      // 5 ms passe cinq fois au-dessus et cinq fois en dessous. Six si une bosse
      // est coupée par chaque bord — ça dépend d'où tombe le déclenchement. Un
      // trait plat en ferait zéro, un bruit d'échantillonnage n'importe combien.
      let bosses = 0;
      let dessus = null;
      for (const y of suite) {
        const d = y < ZERO_Y - DIV; // plus d'un carreau au-dessus du zéro
        const b = y > ZERO_Y + DIV;
        if (d && dessus !== true) { bosses++; dessus = true; }
        else if (b && dessus !== false) { dessus = false; }
      }
      check(`onde : cinq périodes lisibles à l'écran (${bosses} bosses)`,
        bosses >= 5 && bosses <= 6);
      // Le tracé occupe TOUTE la largeur : une salve trop courte laisserait un
      // bout d'écran vide, et l'élève verrait la courbe s'arrêter en chemin.
      check(`onde : la trace couvre tout l'écran (${suite.length} colonnes)`,
        suite.length >= 190);
    }
    // Le MODE se prouve sur une salve clairsemée (40 points pour 199 colonnes) :
    // reliée EN PENTE, elle n'a aucun saut droit ; en retenue, elle devient un
    // escalier de paliers et de sauts. Sur la salve dense d'au-dessus les deux
    // modes donnent la même enveloppe — un contrôle posé là ne prouverait rien.
    const pente = marches(r.clairPenteD);
    const tenu = marches(r.clairHoldD);
    check(`onde : salve clairsemée reliée EN PENTE (${pente.pentes} pentes, ${pente.sauts} sauts)`,
      pente.pentes > 20 && pente.sauts === 0);
    check(`contre-épreuve : la MÊME salve en retenue fait un escalier (${tenu.plats} plats, ${tenu.sauts} sauts, ${tenu.pentes} pentes)`,
      tenu.sauts > 20 && tenu.pentes === 0);

    // Servo à 50 Hz sous 1 ms/div : la trace ne doit plus bouger d'une image à
    // l'autre (déclenchement tenu), et l'écran ne montre qu'UNE impulsion : deux
    // sauts, pas de barre parasite tassée au bord droit par les relevés d'après.
    check(`servo 50 Hz à 1 ms/div : trace immobile sur 50 images (${r.servoDistinctes} tracé(s) différent(s))`,
      r.servoDistinctes === 1);
    if (r.servoDistinctes !== 1) console.log(r.servoEchantillons.join('\n'));
    const servo = marches(r.servoD);
    check(`servo 50 Hz : une seule impulsion à l'écran (${servo.sauts} sauts)`, servo.sauts === 2);
    const departServo = Number(/^M([\d.]+)/.exec(r.servoD ?? '')?.[1]);
    check(`servo 50 Hz : le palier part du bord gauche (x = ${departServo})`, Math.abs(departServo - GAUCHE) < 0.01);

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
