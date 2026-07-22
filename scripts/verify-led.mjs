// Vérifie la physique de la LED (résistance série obligatoire) :
//  - ledSeriesOhms : plus court chemin résistif source → anode + cathode → masse
//    (fils/platine = court-circuit, résistances = arêtes pondérées) ;
//  - ledElectrical : courant, sur-courant destructeur (flamme), luminosité ;
//  - rendu : LED grillée → flamme affichée + verre noirci + halo éteint (Chrome
//    headless sur le vrai composant bundlé).
import esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'kablix-led-')), 'model.mjs');
await esbuild.build({
  entryPoints: [join(root, 'src/webview/diagram/model.mts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { ledSeriesOhms, ledElectrical, rgbSeriesOhms, sevenSegSeriesOhms, ledBarSeriesOhms } =
  await import(pathToFileURL(out).href);

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};
const near = (a, b) => a !== null && Math.abs(a - b) < 1e-9;

const uno = { id: 'uno', type: 'uno', x: 0, y: 0 };
const led = { id: 'led', type: 'led', x: 0, y: 0, attrs: { color: 'red' } };
const R = (id, value) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(value) } });
const W = (id, a, b) => ({ id, a, b });

// R 220 côté anode.
const s1 = {
  parts: [uno, led, R('r1', 220)],
  wires: [
    W('w1', { partId: 'uno', pin: '9' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'led', pin: 'A' }),
    W('w3', { partId: 'led', pin: 'C' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('R 220 en série côté anode → 220 Ω', near(ledSeriesOhms(s1, 'led'), 220));

// Deux résistances en série (220 + 330).
const s2 = {
  parts: [uno, led, R('r1', 220), R('r2', 330)],
  wires: [
    W('w1', { partId: 'uno', pin: '9' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'r2', pin: '1' }),
    W('w3', { partId: 'r2', pin: '2' }, { partId: 'led', pin: 'A' }),
    W('w4', { partId: 'led', pin: 'C' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('220 + 330 en série → 550 Ω', near(ledSeriesOhms(s2, 'led'), 550));

// Branchée en direct (aucune résistance).
const s3 = {
  parts: [uno, led],
  wires: [
    W('w1', { partId: 'uno', pin: '9' }, { partId: 'led', pin: 'A' }),
    W('w2', { partId: 'led', pin: 'C' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('branchée en direct → 0 Ω', near(ledSeriesOhms(s3, 'led'), 0));

// Circuit ouvert (cathode en l'air).
const s4 = {
  parts: [uno, led, R('r1', 220)],
  wires: [
    W('w1', { partId: 'uno', pin: '9' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'led', pin: 'A' }),
  ],
};
check('circuit ouvert → null', ledSeriesOhms(s4, 'led') === null);

// Résistance côté cathode (compte aussi).
const s5 = {
  parts: [uno, led, R('r1', 150)],
  wires: [
    W('w1', { partId: 'uno', pin: '9' }, { partId: 'led', pin: 'A' }),
    W('w2', { partId: 'led', pin: 'C' }, { partId: 'r1', pin: '1' }),
    W('w3', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('R 150 côté cathode → 150 Ω', near(ledSeriesOhms(s5, 'led'), 150));

// Deux chemins parallèles : le chemin de moindre résistance gagne (pire cas).
const s6 = {
  parts: [uno, led, R('r1', 1000), R('r2', 220)],
  wires: [
    W('w1', { partId: 'uno', pin: '9' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'led', pin: 'A' }),
    W('w3', { partId: 'uno', pin: '9' }, { partId: 'r2', pin: '1' }),
    W('w4', { partId: 'r2', pin: '2' }, { partId: 'led', pin: 'A' }),
    W('w5', { partId: 'led', pin: 'C' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('1 kΩ ∥ 220 Ω → chemin min 220 Ω', near(ledSeriesOhms(s6, 'led'), 220));

// Physique : courant / sur-courant / luminosité.
const e1 = ledElectrical(220, 5, 'red'); // 3,2 V / 220 Ω = 14,5 mA
check('220 Ω / 5 V rouge : ~14,5 mA, pleine luminosité, pas de flamme',
  near(e1.amps, 3.2 / 220) && e1.lum === 1 && !e1.overCurrent);
const e2 = ledElectrical(47, 5, 'red'); // 68 mA → grillée
check('47 Ω / 5 V rouge : sur-courant → grillée', e2.overCurrent);
const e3 = ledElectrical(0, 5, 'red');
check('0 Ω (direct) : courant infini → grillée', e3.overCurrent && e3.amps === Infinity);
const e4 = ledElectrical(10000, 5, 'red'); // 0,32 mA → très sombre
check('10 kΩ / 5 V rouge : luminosité très réduite (~3 %)',
  !e4.overCurrent && e4.lum > 0.02 && e4.lum < 0.05);
const e5 = ledElectrical(20000, 5, 'red'); // 0,16 mA < 0,2 mA → éteinte
check('20 kΩ / 5 V rouge : trop faible → éteinte', e5.lum === 0 && !e5.overCurrent);
const e6 = ledElectrical(null, 5, 'red');
check('circuit ouvert : aucun courant', e6.amps === 0 && e6.lum === 0 && !e6.overCurrent);
const e7 = ledElectrical(220, 3.3, 'blue'); // 0,3 V / 220 = 1,4 mA sur Pico
check('220 Ω / 3,3 V bleue : conduit faiblement (Vf 3 V)',
  near(e7.amps, 0.3 / 220) && e7.lum > 0.1 && e7.lum < 0.2);

// --- LED RGB : résistance série par canal --------------------------------------
// Cathode commune : R par canal (220 sur R, rien sur G), COM → GND.
const rgbCC = {
  parts: [uno, { id: 'rgb', type: 'rgb-led', x: 0, y: 0 }, R('r1', 220)],
  wires: [
    W('w1', { partId: 'uno', pin: '9' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'rgb', pin: 'R' }),
    W('w3', { partId: 'uno', pin: '10' }, { partId: 'rgb', pin: 'G' }),
    W('w4', { partId: 'rgb', pin: 'COM' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('RGB cathode commune : canal R → 220 Ω', near(rgbSeriesOhms(rgbCC, 'rgb', 'R'), 220));
check('RGB cathode commune : canal G en direct → 0 Ω', near(rgbSeriesOhms(rgbCC, 'rgb', 'G'), 0));
check('RGB cathode commune : canal B non câblé → null', rgbSeriesOhms(rgbCC, 'rgb', 'B') === null);

// Anode commune : COM → 5V, canal R → R330 → broche MCU (tirée basse).
const rgbCA = {
  parts: [uno, { id: 'rgb', type: 'rgb-led', x: 0, y: 0, attrs: { common: 'anode' } }, R('r1', 330)],
  wires: [
    W('w1', { partId: 'rgb', pin: 'COM' }, { partId: 'uno', pin: '5V' }),
    W('w2', { partId: 'rgb', pin: 'R' }, { partId: 'r1', pin: '1' }),
    W('w3', { partId: 'r1', pin: '2' }, { partId: 'uno', pin: '9' }),
  ],
};
check('RGB anode commune : canal R → 330 Ω', near(rgbSeriesOhms(rgbCA, 'rgb', 'R'), 330));

// --- 7 segments : résistance par segment ---------------------------------------
const seg7 = {
  parts: [uno, { id: 'seg', type: '7seg', x: 0, y: 0 }, R('r1', 220)],
  wires: [
    W('w1', { partId: 'uno', pin: '3' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'seg', pin: 'A' }),
    W('w3', { partId: 'uno', pin: '4' }, { partId: 'seg', pin: 'B' }),
    W('w4', { partId: 'seg', pin: 'COM.1' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('7 segments : segment A avec R 220 → 220 Ω', near(sevenSegSeriesOhms(seg7, 'seg', 'A', false), 220));
check('7 segments : segment B en direct → 0 Ω', near(sevenSegSeriesOhms(seg7, 'seg', 'B', false), 0));
check('7 segments : segment C non câblé → null', sevenSegSeriesOhms(seg7, 'seg', 'C', false) === null);

// --- Barre de LED : résistance par LED ------------------------------------------
const bar = {
  parts: [uno, { id: 'bar', type: 'led-bar', x: 0, y: 0 }, R('r1', 330)],
  wires: [
    W('w1', { partId: 'uno', pin: '5' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'bar', pin: 'A3' }),
    W('w3', { partId: 'bar', pin: 'C3' }, { partId: 'uno', pin: 'GND.1' }),
    W('w4', { partId: 'uno', pin: '6' }, { partId: 'bar', pin: 'A4' }),
    W('w5', { partId: 'bar', pin: 'C4' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
check('barre : LED 3 avec R 330 → 330 Ω', near(ledBarSeriesOhms(bar, 'bar', 2), 330));
check('barre : LED 4 en direct → 0 Ω', near(ledBarSeriesOhms(bar, 'bar', 3), 0));

// --- Rendu : flamme sur LED grillée (Chrome headless) -------------------------
const CACHE = join(root, 'node_modules', '.cache-led');
mkdirSync(CACHE, { recursive: true });
const entry = `
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/rgb-led-element.mjs';
import '../../src/webview/composants/7segment-element.mjs';
import '../../src/webview/composants/led-bar-graph-element.mjs';
async function run() {
	const mk = (burned) => {
		const el = document.createElement('kablix-led');
		el.color = 'red';
		if (burned) { el.burned = true; } else { el.value = true; el.brightness = 1; }
		document.body.appendChild(el);
		return el;
	};
	const ok = mk(false), burned = mk(true);
	const rgb = document.createElement('kablix-rgb-led');
	rgb.ledRed = 1;
	rgb.burned = true;
	document.body.appendChild(rgb);
	const seg = document.createElement('kablix-7segment');
	seg.setAttribute('simulating', '');
	seg.values = [1, 0.4, 0, 0, 0, 0, 0, 0];
	document.body.appendChild(seg);
	const segBurned = document.createElement('kablix-7segment');
	segBurned.burned = true;
	document.body.appendChild(segBurned);
	const bar = document.createElement('kablix-led-bar-graph');
	bar.values = [1, 0.4, 0, 0, 0, 0, 0, 0, 0, 0];
	document.body.appendChild(bar);
	const barBurned = document.createElement('kablix-led-bar-graph');
	barBurned.burned = true;
	document.body.appendChild(barBurned);
	await ok.updateComplete; await burned.updateComplete; await rgb.updateComplete;
	await seg.updateComplete; await segBurned.updateComplete;
	await bar.updateComplete; await barBurned.updateComplete;
	// Régression v153+ : l'explosion « boum » doit rester VISIBLE au repos même si
	// les animations ne tournent pas (webview sans compositing SVG / reduced-motion).
	// On coupe l'animation et on vérifie que le groupe reste à scale(1)/opacity(1)
	// au lieu de rester coincé à scale(0) (bug de la flamme→boum non visible).
	const boumG = burned.renderRoot.querySelector('g[class^="anim-"]');
	if (boumG) boumG.style.animation = 'none';
	await new Promise((r) => setTimeout(r, 30));
	const boumCS = boumG ? getComputedStyle(boumG) : null;
	const segPolys = seg.renderRoot.querySelectorAll('polygon');
	const barRects = bar.renderRoot.querySelectorAll('#g53 rect');
	const res = {
		segFull: segPolys[0]?.style.fill,
		segDim: segPolys[1]?.style.fill,
		segOff: segPolys[2]?.style.fill,
		segFlame: !!segBurned.renderRoot.querySelector('g[class^="anim-"]'),
		barFull: barRects[0]?.style.fill,
		barDim: barRects[1]?.style.fill,
		barFlame: !!barBurned.renderRoot.querySelector('g[class^="anim-"]'),
		okFlame: !!ok.renderRoot.querySelector('g[class^="anim-"]'),
		okBody: ok.renderRoot.querySelector('#path25')?.getAttribute('fill'),
		okLight: (ok.renderRoot.querySelector('#g30') || {}).style?.display ?? 'absent',
		burnedFlame: !!burned.renderRoot.querySelector('g[class^="anim-"]'),
		burnedBody: burned.renderRoot.querySelector('#path25')?.getAttribute('fill'),
		burnedLight: (burned.renderRoot.querySelector('#g30') || {}).style?.display ?? 'absent',
		rgbFlame: !!rgb.renderRoot.querySelector('g[class^="anim-"]'),
		rgbDark: !!rgb.renderRoot.querySelector('.rgb-burned'),
		rgbHalo: rgb.renderRoot.querySelector('#circle35')?.getAttribute('opacity'),
		boumRestTransform: boumCS?.transform ?? 'absent',
		boumRestOpacity: boumCS?.opacity ?? 'absent',
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
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
  check('rendu : LED saine sans flamme, verre coloré, halo allumé',
    r && !r.okFlame && r.okBody === 'red' && r.okLight === '');
  check('rendu : LED grillée avec flamme, verre noirci, halo éteint',
    r && r.burnedFlame && r.burnedBody === '#3a3a3a' && r.burnedLight === 'none');
  check('rendu : RGB grillée — flamme + corps carbonisé + halo à zéro',
    r && r.rgbFlame && r.rgbDark && r.rgbHalo === '0');
  check('rendu : 7 segments — plein rouge, 40 % en color-mix, éteint sombre',
    r && r.segFull === 'red' && String(r.segDim).includes('color-mix') &&
    String(r.segDim).includes('40%') && r.segOff === 'rgb(68, 68, 68)');
  check('rendu : 7 segments grillé — flamme affichée', r && r.segFlame);
  check('rendu : barre — plein, 40 % en color-mix, flamme si grillée',
    r && r.barFull !== '' && String(r.barDim).includes('color-mix') && r.barFlame);
  check('rendu : explosion « boum » VISIBLE au repos (scale 1, opaque) sans animation',
    r && r.boumRestTransform === 'matrix(1, 0, 0, 1, 0, 0)' && r.boumRestOpacity === '1');
} else {
  console.log('(Chrome introuvable : volet rendu sauté)');
}

console.log(failures ? `LED : ${failures} échec(s).` : 'LED : tous les contrôles passent.');
process.exit(failures ? 1 : 0);
