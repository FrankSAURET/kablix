// Vérifie les résistances variables nues (LDR / CTN / CTP) :
//  - variableResistorOhms : caractéristiques R(x) et paramètres de l'inspecteur ;
//  - adcDividerLevels : pont diviseur réel vu par les entrées ADC (résistances
//    adjointes, rails non traversés, curseur en direct via liveOhms) ;
//  - internalWiringSvg : schéma dessiné à la main (bouton K) des 3 types ;
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
    loader: { '.svg': 'text' },
    logLevel: 'silent',
  });
  return import(pathToFileURL(join(tmp, outfile)).href);
};
const { variableResistorOhms, adcDividerLevels } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
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

// --- Schéma interne (bouton K) --------------------------------------------------
const pins2 = [{ name: '1', x: 10, y: 30 }, { name: '2', x: 90, y: 30 }];
for (const type of ['ldr', 'ntc', 'ptc']) {
  const svg = internalWiringSvg('resistor', pins2, undefined, type, { w: 100, h: 60 });
  check(`schéma interne ${type.toUpperCase()} : dessin de Frank présent`, !!svg && svg.includes(`${type}sch-`));
}
check('schéma interne résistance fixe : symbole boîte générique conservé',
  (internalWiringSvg('resistor', pins2, undefined, 'resistor') ?? '').includes('<path'));

// --- Rendu réel (Chrome headless) ----------------------------------------------
const CACHE = join(root, 'node_modules', '.cache-divider');
mkdirSync(CACHE, { recursive: true });
const entry = `
import '../../src/webview/composants/ldr-element.mjs';
import '../../src/webview/composants/ntc-element.mjs';
import '../../src/webview/composants/ptc-element.mjs';
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
	await ldr.updateComplete; await ldrSim.updateComplete;
	await ntcSim.updateComplete; await ptcSim.updateComplete;
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
	};
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(res);
	document.body.appendChild(out);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: root, logLevel: 'silent' });
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
    check('rendu : broches LDR 1@10,30 2@90,30', r.ldrPins === '1@10,30 2@90,30');
    check('rendu : broches CTN 1@10,70 2@30,70', r.ntcPins === '1@10,70 2@30,70');
  }
} else {
  console.log('⚠️ Chrome introuvable : rendu headless sauté');
}

console.log(failures === 0 ? '\nverify:divider OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
