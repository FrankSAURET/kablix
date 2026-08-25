// Vérifie les résistances variables nues (LDR / CTN / CTP / phototransistor /
// photodiode) :
//  - variableResistorOhms : caractéristiques R(x) et paramètres de l'inspecteur ;
//  - adcDividerLevels : pont diviseur réel vu par les entrées ADC (résistances
//    adjointes, rails non traversés, curseur en direct via liveOhms) ;
//  - internalWiringSvg : schéma dessiné à la main (bouton K) des 4 types ;
//  - photoDeviceBindings : résistance de charge obligatoire du phototransistor
//    et de la photodiode ;
//  - rendu réel en Chrome headless : dessin, curseur de simulation, géométrie.
import esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-divider-'));
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
const { variableResistorOhms, adcDividerLevels, photoDeviceBindings } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const { internalWiringSvg } = await buildTo('src/webview/diagram/internal-wiring.mts', 'wiring.mjs');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => a !== null && Math.abs(a - b) < eps * Math.max(1, Math.abs(b));

// --- Caractéristiques R(x) ------------------------------------------------------
check('LDR : 1 lx → R1lx (50 kΩ)', near(variableResistorOhms('ldr', 1), 50_000));
check('LDR : 100 lx, γ=0,7 → 50k·100^-0,7', near(variableResistorOhms('ldr', 100), 50_000 * Math.pow(100, -0.7)));
check('LDR : obscurité totale (0 lx) → 10 MΩ', near(variableResistorOhms('ldr', 0), 1e7));
check('LDR : paramètres inspecteur (R1lx=100k, γ=1)', near(variableResistorOhms('ldr', 10, { r1lx: '100000', gamma: '1' }), 10_000));
check('CTN : 25 °C → R25 (10 kΩ)', near(variableResistorOhms('ntc', 25), 10_000));
check('CTN : 100 °C, B=3950 → ~697 Ω (décroît)', near(variableResistorOhms('ntc', 100), 10_000 * Math.exp(3950 * (1 / 373.15 - 1 / 298.15))));
check('CTN : -55 °C → résistance très forte (>500 kΩ)', variableResistorOhms('ntc', -55) > 500_000);
check('CTP : 25 °C → R25 (2 kΩ)', near(variableResistorOhms('ptc', 25), 2000));
check('CTP : 100 °C, tc=0,79 %/°C → 2k·(1+0,0079·75)', near(variableResistorOhms('ptc', 100), 2000 * (1 + 0.0079 * 75)));
check('CTP : croît avec la température', variableResistorOhms('ptc', 80) > variableResistorOhms('ptc', 20));
// Phototransistor : le courant de collecteur suit l'éclairement, donc la
// résistance équivalente varie en 1/Ee — bornée par Ron (plein soleil) et
// Rdark (noir complet).
check('Phototransistor : 1 mW/cm² → Ron·Eemax/Ee (1 kΩ)', near(variableResistorOhms('phototransistor', 1), 1000));
check('Phototransistor : éclairement maximal (5) → Ron (200 Ω)', near(variableResistorOhms('phototransistor', 5), 200));
check('Phototransistor : noir complet (0) → Rdark (10 MΩ)', near(variableResistorOhms('phototransistor', 0), 1e7));
check('Phototransistor : lumière infime → plafonné à Rdark', near(variableResistorOhms('phototransistor', 1e-9), 1e7));
check('Phototransistor : au-delà du maximum → plancher Ron', near(variableResistorOhms('phototransistor', 50), 200));
check('Phototransistor : paramètres inspecteur (Ron=100, Eemax=10)', near(variableResistorOhms('phototransistor', 2, { ron: '100', eemax: '10' }), 500));
check('Phototransistor : décroît quand la lumière monte', variableResistorOhms('phototransistor', 4) < variableResistorOhms('phototransistor', 0.5));

// Photodiode : même loi, sans le gain du transistor → cent fois plus résistante.
check('Photodiode : 1 mW/cm² → Ron·Eemax/Ee (100 kΩ)', near(variableResistorOhms('photodiode', 1), 100_000));
check('Photodiode : éclairement maximal (5) → Ron (20 kΩ)', near(variableResistorOhms('photodiode', 5), 20_000));
check('Photodiode : noir complet (0) → Rdark (100 MΩ)', near(variableResistorOhms('photodiode', 0), 1e8));
check('Photodiode : au-delà du maximum → plancher Ron', near(variableResistorOhms('photodiode', 50), 20_000));
check('Photodiode : cent fois plus résistante que le phototransistor',
  near(variableResistorOhms('photodiode', 1) / variableResistorOhms('phototransistor', 1), 100));
check('Photodiode : paramètres inspecteur (Ron=10k, Eemax=10)', near(variableResistorOhms('photodiode', 2, { ron: '10000', eemax: '10' }), 50_000));

// --- Pont diviseur vu par l'ADC -------------------------------------------------
const uno = { id: 'uno', type: 'uno', x: 0, y: 0 };
const pico = { id: 'pico', type: 'pico', x: 0, y: 0 };
const R = (id, value) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(value) } });
const W = (id, a, b) => ({ id, a, b });

// Pont classique : 5V — R10k — A0 — LDR — GND (LDR au repos : attrs lux=500).
const rLdr500 = variableResistorOhms('ldr', 500);
const pont = {
  parts: [uno, { id: 'ldr1', type: 'ldr', x: 0, y: 0, attrs: { lux: '500' } }, R('r1', 10_000)],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: 'A0' }),
    W('w3', { partId: 'uno', pin: 'A0' }, { partId: 'ldr1', pin: '1' }),
    W('w4', { partId: 'ldr1', pin: '2' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
let levels = adcDividerLevels(pont);
check('pont 5V—10k—A0—LDR—GND : A0 mesuré', levels.length === 1 && levels[0].mcuPin === 'A0');
check('pont : level = Rldr/(10k+Rldr) au repos (500 lx)', near(levels[0]?.level, rLdr500 / (10_000 + rLdr500)));

// Curseur en direct (liveOhms) : 10 lx → LDR ~9,98 kΩ → level ≈ 0,5.
const rLdr10 = variableResistorOhms('ldr', 10);
levels = adcDividerLevels(pont, (part) => (part.id === 'ldr1' ? rLdr10 : null));
check('pont : liveOhms (curseur 10 lx) → level ≈ 0,5', near(levels[0]?.level, rLdr10 / (10_000 + rLdr10)));

// Pont inversé : 5V — LDR — A0 — R10k — GND (tension monte avec l'éclairement).
const pontInv = {
  parts: [uno, { id: 'ldr1', type: 'ldr', x: 0, y: 0, attrs: { lux: '500' } }, R('r1', 10_000)],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'ldr1', pin: '1' }),
    W('w2', { partId: 'ldr1', pin: '2' }, { partId: 'uno', pin: 'A0' }),
    W('w3', { partId: 'uno', pin: 'A0' }, { partId: 'r1', pin: '1' }),
    W('w4', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
levels = adcDividerLevels(pontInv);
check('pont inversé : level = 10k/(10k+Rldr)', near(levels[0]?.level, 10_000 / (10_000 + rLdr500)));

// CTN à 25 °C avec R série 10 kΩ : moitié de VCC.
const pontNtc = {
  parts: [uno, { id: 'ntc1', type: 'ntc', x: 0, y: 0, attrs: { temperature: '25' } }, R('r1', 10_000)],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: 'A1' }),
    W('w3', { partId: 'uno', pin: 'A1' }, { partId: 'ntc1', pin: '1' }),
    W('w4', { partId: 'ntc1', pin: '2' }, { partId: 'uno', pin: 'GND.2' }),
  ],
};
levels = adcDividerLevels(pontNtc);
check('CTN 25 °C + R 10k : A1 à mi-tension', levels.length === 1 && levels[0].mcuPin === 'A1' && near(levels[0].level, 0.5));

// Réseau sans résistance variable : aucune mesure posée (le potentiomètre etc.
// gardent la main sur leurs entrées).
const fixe = {
  parts: [uno, R('r1', 10_000), R('r2', 10_000)],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: 'A0' }),
    W('w3', { partId: 'uno', pin: 'A0' }, { partId: 'r2', pin: '1' }),
    W('w4', { partId: 'r2', pin: '2' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('diviseur de résistances fixes seules : ignoré', adcDividerLevels(fixe).length === 0);

// Un seul rail câblé : nœud tiré à ce rail.
const pullUp = {
  parts: [uno, { id: 'ldr1', type: 'ldr', x: 0, y: 0 }],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'ldr1', pin: '1' }),
    W('w2', { partId: 'ldr1', pin: '2' }, { partId: 'uno', pin: 'A0' }),
  ],
};
levels = adcDividerLevels(pullUp);
check('LDR vers 5V seule (pas de masse) → level 1', levels.length === 1 && near(levels[0].level, 1));

// Le rail opposé n'est pas un conducteur : A0—LDR—GND + GND—R—5V ailleurs ne
// fabrique PAS de chemin vers VCC à travers la masse.
const viaRail = {
  parts: [uno, { id: 'ldr1', type: 'ldr', x: 0, y: 0 }, R('r1', 100)],
  wires: [
    W('w1', { partId: 'uno', pin: 'A0' }, { partId: 'ldr1', pin: '1' }),
    W('w2', { partId: 'ldr1', pin: '2' }, { partId: 'uno', pin: 'GND.1' }),
    W('w3', { partId: 'uno', pin: 'GND.2' }, { partId: 'r1', pin: '1' }),
    W('w4', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: '5V' }),
  ],
};
levels = adcDividerLevels(viaRail);
check('chemin via la masse interdit → nœud tiré à 0', levels.length === 1 && near(levels[0].level, 0));

// Pico : GP26 (ADC0) entre R 3,3 kΩ (haut) et CTP (bas).
const rPtc25 = variableResistorOhms('ptc', 25);
const pontPico = {
  parts: [pico, { id: 'ptc1', type: 'ptc', x: 0, y: 0, attrs: { temperature: '25' } }, R('r1', 3300)],
  wires: [
    W('w1', { partId: 'pico', pin: '3V3' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'pico', pin: 'GP26' }),
    W('w3', { partId: 'pico', pin: 'GP26' }, { partId: 'ptc1', pin: '1' }),
    W('w4', { partId: 'ptc1', pin: '2' }, { partId: 'pico', pin: 'GND.1' }),
  ],
};
levels = adcDividerLevels(pontPico);
check('Pico : CTP sur GP26 mesurée', levels.length === 1 && levels[0].mcuPin === 'GP26' && near(levels[0].level, rPtc25 / (3300 + rPtc25)));

// Phototransistor : ses pattes s'appellent c et e (pas 1 et 2) — le modèle les
// retrouve par `pinRoles`, sinon le pont ne serait jamais vu.
const rPhoto1 = variableResistorOhms('phototransistor', 1);
const pontPhoto = {
  parts: [uno, { id: 'ph1', type: 'phototransistor', x: 0, y: 0, attrs: { ee: '1' } }, R('r1', 10_000)],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: 'A2' }),
    W('w3', { partId: 'uno', pin: 'A2' }, { partId: 'ph1', pin: 'c' }),
    W('w4', { partId: 'ph1', pin: 'e' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
levels = adcDividerLevels(pontPhoto);
check('phototransistor : pont lu sur A2 via les pattes c/e',
  levels.length === 1 && levels[0].mcuPin === 'A2' && near(levels[0].level, rPhoto1 / (10_000 + rPhoto1)));
levels = adcDividerLevels(pontPhoto, (p) => (p.id === 'ph1' ? variableResistorOhms('phototransistor', 5) : null));
check('phototransistor : curseur à fond → level ≈ 200/10200', near(levels[0]?.level, 200 / 10_200));

// --- Résistance de charge obligatoire (photoDeviceBindings) ---------------------
const bind = (d) => photoDeviceBindings(d).find((b) => b.partId === 'ph1');
const nu = (attrs) => ({ id: 'ph1', type: 'phototransistor', x: 0, y: 0, attrs });
let pb = bind(pontPhoto);
check('charge : pont complet → boucle fermée, 10 kΩ en série',
  pb?.wired === true && pb?.looped === true && near(pb?.seriesOhms, 10_000));

// Sans résistance : la patte du haut ne rejoint aucun rail, rien à mesurer.
const sansR = {
  parts: [uno, nu()],
  wires: [
    W('w1', { partId: 'uno', pin: 'A2' }, { partId: 'ph1', pin: 'c' }),
    W('w2', { partId: 'ph1', pin: 'e' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
pb = bind(sansR);
check('charge : sans résistance série → boucle absente', pb?.wired === true && pb?.looped === false && pb?.seriesOhms === null);

// En travers des rails : boucle fermée mais 0 Ω en série = court-circuit.
const enTravers = {
  parts: [uno, nu()],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'ph1', pin: 'c' }),
    W('w2', { partId: 'ph1', pin: 'e' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
pb = bind(enTravers);
check('charge : en travers des rails → 0 Ω en série', pb?.looped === true && pb?.seriesOhms === 0);

pb = bind({ parts: [uno, nu()], wires: [] });
check('charge : composant posé sans fil → rien à signaler', pb?.wired === false && pb?.looped === false);
check('charge : les autres résistances variables ne sont pas concernées', photoDeviceBindings(pont).length === 0);

// Photodiode : pattes K/A et charge de 100 kΩ (le courant est cent fois plus
// faible, il faut une grande résistance pour en tirer une tension).
const rDiode1 = variableResistorOhms('photodiode', 1);
const pontDiode = {
  parts: [uno, { id: 'pd1', type: 'photodiode', x: 0, y: 0, attrs: { ee: '1' } }, R('r1', 100_000)],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'pd1', pin: 'K' }),
    W('w2', { partId: 'pd1', pin: 'A' }, { partId: 'uno', pin: 'A3' }),
    W('w3', { partId: 'uno', pin: 'A3' }, { partId: 'r1', pin: '1' }),
    W('w4', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
levels = adcDividerLevels(pontDiode);
check('photodiode : pont lu sur A3 via les pattes K/A',
  levels.length === 1 && levels[0].mcuPin === 'A3' && near(levels[0].level, 100_000 / (100_000 + rDiode1)));
levels = adcDividerLevels(pontDiode, (p) => (p.id === 'pd1' ? variableResistorOhms('photodiode', 5) : null));
check('photodiode : curseur à fond → level ≈ 100/120', near(levels[0]?.level, 100_000 / 120_000));

const bindD = photoDeviceBindings(pontDiode).find((b) => b.partId === 'pd1');
check('charge photodiode : pont complet → boucle fermée, 100 kΩ en série',
  bindD?.wired === true && bindD?.looped === true && near(bindD?.seriesOhms, 100_000));
const diodeEnTravers = {
  parts: [uno, { id: 'pd1', type: 'photodiode', x: 0, y: 0, attrs: {} }],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'pd1', pin: 'K' }),
    W('w2', { partId: 'pd1', pin: 'A' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('charge photodiode : en travers des rails → 0 Ω en série',
  photoDeviceBindings(diodeEnTravers)[0]?.seriesOhms === 0);

// --- Schéma interne (bouton K) --------------------------------------------------
const pins2 = [{ name: '1', x: 10, y: 30 }, { name: '2', x: 90, y: 30 }];
for (const type of ['ldr', 'ntc', 'ptc']) {
  const svg = internalWiringSvg('resistor', pins2, undefined, type, { w: 100, h: 60 });
  check(`schéma interne ${type.toUpperCase()} : dessin de Frank présent`, !!svg && svg.includes(`${type}sch-`));
}
const svgPhoto = internalWiringSvg('resistor', [{ name: 'c', x: 10, y: 40 }, { name: 'e', x: 20, y: 40 }], undefined, 'phototransistor', { w: 30, h: 50 });
check('schéma interne phototransistor : dessin de Frank présent',
  !!svgPhoto && (svgPhoto.match(/<path/g) ?? []).length > 5);
const svgDiode = internalWiringSvg('resistor', [{ name: 'K', x: 10, y: 40 }, { name: 'A', x: 20, y: 40 }], undefined, 'photodiode', { w: 30, h: 50 });
check('schéma interne photodiode : dessin de Frank présent',
  !!svgDiode && (svgDiode.match(/<path/g) ?? []).length > 5);
check('schéma interne résistance fixe : symbole boîte générique conservé',
  (internalWiringSvg('resistor', pins2, undefined, 'resistor') ?? '').includes('<path'));

// --- Rendu réel (Chrome headless) ----------------------------------------------
const CACHE = join(root, 'node_modules', '.cache-divider');
mkdirSync(CACHE, { recursive: true });
const entry = `
import '../../src/webview/composants/ldr-element.mjs';
import '../../src/webview/composants/ntc-element.mjs';
import '../../src/webview/composants/ptc-element.mjs';
import '../../src/webview/composants/phototransistor-element.mjs';
import '../../src/webview/composants/photodiode-element.mjs';
async function run() {
	const mk = (tag, sim) => {
		const el = document.createElement(tag);
		if (sim) el.setAttribute('simulating', '');
		document.body.appendChild(el);
		return el;
	};
	const ldr = mk('kablix-ldr', false);
	const ldrSim = mk('kablix-ldr', true);
	const ntcSim = mk('kablix-ntc', true);
	const ptcSim = mk('kablix-ptc', true);
	const ph = mk('kablix-phototransistor', false);
	const phSim = mk('kablix-phototransistor', true);
	const pd = mk('kablix-photodiode', false);
	const pdSim = mk('kablix-photodiode', true);
	await ldr.updateComplete; await ldrSim.updateComplete;
	await ntcSim.updateComplete; await ptcSim.updateComplete;
	await ph.updateComplete; await phSim.updateComplete;
	await pd.updateComplete; await pdSim.updateComplete;
	// Curseur : bouge l'éclairement, l'hôte relaie l'événement input.
	let inputSeen = false;
	ldrSim.addEventListener('input', () => { inputSeen = true; });
	const range = ldrSim.renderRoot.querySelector('.sim-control input');
	range.value = '100';
	range.dispatchEvent(new Event('input'));
	await ldrSim.updateComplete;
	const svgBox = (el) => {
		const r = el.renderRoot.querySelector('svg').getBoundingClientRect();
		return [Math.round(r.width), Math.round(r.height)];
	};
	const res = {
		ldrDrawn: ldr.renderRoot.querySelectorAll('svg [id^="ldr-"]').length > 10,
		ldrBox: svgBox(ldr),
		ntcBox: svgBox(ntcSim),
		ldrNoControl: !ldr.renderRoot.querySelector('.sim-control'),
		ldrControl: !!ldrSim.renderRoot.querySelector('.sim-control'),
		ldrVal: ldrSim.renderRoot.querySelector('.sim-control .val').textContent.trim(),
		ldrLux: ldrSim.lux,
		inputSeen,
		ntcDrawn: ntcSim.renderRoot.querySelectorAll('svg [id^="ntc-"]').length > 10,
		ptcDrawn: ptcSim.renderRoot.querySelectorAll('svg [id^="ptc-"]').length > 10,
		ntcVal: ntcSim.renderRoot.querySelector('.sim-control .val').textContent.trim(),
		ntcRange: [ntcSim.renderRoot.querySelector('.sim-control input').min, ntcSim.renderRoot.querySelector('.sim-control input').max],
		ldrPins: ldr.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' '),
		ntcPins: ntcSim.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' '),
		phDrawn: phSim.renderRoot.querySelectorAll('svg path').length > 5,
		phBox: svgBox(phSim),
		phNoControl: !ph.renderRoot.querySelector('.sim-control'),
		phPins: phSim.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' '),
		phRange: [phSim.renderRoot.querySelector('.sim-control input').min, phSim.renderRoot.querySelector('.sim-control input').max],
		pdDrawn: pdSim.renderRoot.querySelectorAll('svg path').length > 5,
		pdBox: svgBox(pdSim),
		pdNoControl: !pd.renderRoot.querySelector('.sim-control'),
		pdPins: pdSim.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' '),
		pdRange: [pdSim.renderRoot.querySelector('.sim-control input').min, pdSim.renderRoot.querySelector('.sim-control input').max],
	};
	// Curseur d'éclairement : la valeur suit et l'hôte est prévenu.
	let phInput = false;
	phSim.addEventListener('input', () => { phInput = true; });
	const phRange = phSim.renderRoot.querySelector('.sim-control input');
	phRange.value = '2.5';
	phRange.dispatchEvent(new Event('input'));
	await phSim.updateComplete;
	res.phEe = phSim.ee;
	res.phVal = phSim.renderRoot.querySelector('.sim-control .val').textContent.trim();
	res.phInput = phInput;
	// Irradiance max d'instance : la plage du curseur suit l'inspecteur.
	phSim.setAttribute('eemax', '20');
	await phSim.updateComplete;
	res.phRange2 = phSim.renderRoot.querySelector('.sim-control input').max;
	// Valeur farfelue : plage assainie, le curseur reste utilisable.
	phSim.setAttribute('eemax', '0');
	await phSim.updateComplete;
	res.phSane = Number(phSim.renderRoot.querySelector('.sim-control input').max) > 0;
	// Photodiode : même curseur d'éclairement, même relais de l'événement.
	let pdInput = false;
	pdSim.addEventListener('input', () => { pdInput = true; });
	const pdRange = pdSim.renderRoot.querySelector('.sim-control input');
	pdRange.value = '3.5';
	pdRange.dispatchEvent(new Event('input'));
	await pdSim.updateComplete;
	res.pdEe = pdSim.ee;
	res.pdVal = pdSim.renderRoot.querySelector('.sim-control .val').textContent.trim();
	res.pdInput = pdInput;
	// Tmin/Tmax d'instance (inspecteur) : la plage du curseur suit les attributs.
	ntcSim.setAttribute('tmin', '0');
	ntcSim.setAttribute('tmax', '50');
	ptcSim.setAttribute('tmin', '-10');
	ptcSim.setAttribute('tmax', '90');
	await ntcSim.updateComplete; await ptcSim.updateComplete;
	res.ntcRange2 = [ntcSim.renderRoot.querySelector('.sim-control input').min, ntcSim.renderRoot.querySelector('.sim-control input').max];
	res.ptcRange2 = [ptcSim.renderRoot.querySelector('.sim-control input').min, ptcSim.renderRoot.querySelector('.sim-control input').max];
	// Bornes farfelues (min ≥ max) : assainies pour garder un curseur utilisable.
	ntcSim.setAttribute('tmin', '80');
	ntcSim.setAttribute('tmax', '50');
	await ntcSim.updateComplete;
	const saneMin = Number(ntcSim.renderRoot.querySelector('.sim-control input').min);
	const saneMax = Number(ntcSim.renderRoot.querySelector('.sim-control input').max);
	res.saneRange = saneMin < saneMax;
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(res);
	document.body.appendChild(out);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: root, logLevel: 'silent' });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body><script>${b.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (chrome) {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([^<]+)<\/pre>/);
  if (!m) {
    check('rendu headless : mesures produites', false);
  } else {
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    check('rendu : dessin LDR présent (édition)', r.ldrDrawn === true);
    check('rendu : LDR 100×60, CTN 40×80 (1:1 viewBox)', r.ldrBox[0] === 100 && r.ldrBox[1] === 60 && r.ntcBox[0] === 40 && r.ntcBox[1] === 80);
    check('rendu : pas de curseur hors simulation', r.ldrNoControl === true);
    check('rendu : curseur affiché en simulation', r.ldrControl === true);
    check('rendu : curseur LDR déplacé → 100 lx + événement input', r.ldrLux === 100 && r.ldrVal === '100 lx' && r.inputSeen === true);
    check('rendu : dessins CTN et CTP présents', r.ntcDrawn === true && r.ptcDrawn === true);
    check('rendu : CTN 25 °C, plage -55..125', r.ntcVal === '25 °C' && r.ntcRange[0] === '-55' && r.ntcRange[1] === '125');
    check("rendu : Tmin/Tmax d'instance suivis (CTN 0..50, CTP -10..90)",
      r.ntcRange2[0] === '0' && r.ntcRange2[1] === '50' && r.ptcRange2[0] === '-10' && r.ptcRange2[1] === '90');
    check('rendu : bornes incohérentes (min ≥ max) assainies', r.saneRange === true);
    check('rendu : broches LDR 1@10,30 2@90,30', r.ldrPins === '1@10,30 2@90,30');
    check('rendu : broches CTN 1@10,70 2@30,70', r.ntcPins === '1@10,70 2@30,70');
    check('rendu : dessin phototransistor présent, 30×50', r.phDrawn === true && r.phBox[0] === 30 && r.phBox[1] === 50);
    check('rendu : phototransistor sans curseur hors simulation', r.phNoControl === true);
    check('rendu : curseur phototransistor 0..5 mW/cm²', r.phRange[0] === '0' && r.phRange[1] === '5');
    check('rendu : curseur déplacé → 2,5 mW/cm² + événement input', r.phEe === 2.5 && r.phVal === '2.50' && r.phInput === true);
    check("rendu : irradiance max d'instance suivie (0..20)", r.phRange2 === '20');
    check('rendu : irradiance max farfelue assainie', r.phSane === true);
    check('rendu : broches phototransistor c@10,40 e@20,40', r.phPins === 'c@10,40 e@20,40');
    check('rendu : dessin photodiode présent, 30×50', r.pdDrawn === true && r.pdBox[0] === 30 && r.pdBox[1] === 50);
    check('rendu : photodiode sans curseur hors simulation', r.pdNoControl === true);
    check('rendu : curseur photodiode 0..5 mW/cm²', r.pdRange[0] === '0' && r.pdRange[1] === '5');
    check('rendu : curseur photodiode déplacé → 3,5 mW/cm² + événement input',
      r.pdEe === 3.5 && r.pdVal === '3.50' && r.pdInput === true);
    check('rendu : broches photodiode K@10,40 A@20,40', r.pdPins === 'K@10,40 A@20,40');
  }
} else {
  console.log('⚠️ Chrome introuvable : rendu headless sauté');
}

console.log(failures === 0 ? '\nverify:divider OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
