// Vérifie l'alimentation de laboratoire (kablix-alim, kind 'psu') :
//  - netlist : V+ = rail VCC / GND = masse (une LED s'allume sans carte),
//    ledPowerCircuit remonte la TENSION de l'alim (attr puis live) ;
//  - psuLoadAmps : courant débité (LED, pont résistif, court-circuit, servo) ;
//  - catalogue : rangée dans Appareils de mesure, propriétés tension / courant max ;
//  - rendu réel en Chrome headless : dessin, affichage LED Board-7, rotation du
//    bouton (0-30 V sur 300°), drag rotatif en simulation, LED courant limite,
//    libellés traduisibles, broches sur pastilles.
import esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-psu-'));
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
const { ledOn, ledPowerCircuit, psuLoadAmps } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const { partDef, partCategory, CATEGORY_ORDER } = await buildTo('src/webview/diagram/catalog.mts', 'catalog.mjs');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) < eps * Math.max(1, Math.abs(b));

// --- Catalogue -----------------------------------------------------------------
const def = partDef('alim');
check('catalogue : alim = kablix-alim, kind psu, catégorie Instruments',
  def.tag === 'kablix-alim' && def.kind === 'psu' && partCategory(def) === 'Instruments');
// Sans entrée dans CATEGORY_ORDER la section ne s'afficherait jamais dans la palette.
check('catalogue : Instruments présent dans CATEGORY_ORDER',
  CATEGORY_ORDER.includes('Instruments'));
check('catalogue : propriétés voltage (0-30) et maxcurrent',
  def.props?.some((p) => p.attr === 'voltage' && p.max === 30) &&
  def.props?.some((p) => p.attr === 'maxcurrent'));

// --- Aide locale (bouton d'aide de l'inspecteur → docs/composants/<type>.md) ----
// Le bouton est affiché pour TOUT composant intégré : sans la fiche, il n'ouvre
// rien et affiche « Aucune aide disponible ».
const helpMd = join(root, 'docs', 'composants', `${def.type}.md`);
check('aide : fiche docs/composants/alim.md présente', existsSync(helpMd));
if (existsSync(helpMd)) {
  const md = readFileSync(helpMd, 'utf8');
  // Chaque image et chaque lien relatif de la fiche doit exister (l'aperçu
  // Markdown de VS Code affiche sinon une image cassée / un lien mort).
  const refs = [...md.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((m) => decodeURIComponent(m[1]));
  const missing = refs.filter((r) => !existsSync(join(root, 'docs', 'composants', r)));
  check(`aide : images et liens relatifs valides (${refs.length} réf.)${missing.length ? ` — manquant : ${missing.join(', ')}` : ''}`,
    refs.length > 0 && missing.length === 0);
  // Points que la fiche doit couvrir : bornes, plage du bouton, limitation.
  check('aide : bornes V+/GND, plage 0-30 V et limitation de courant documentées',
    /\*\*V\+\*\*/.test(md) && /\*\*GND\*\*/.test(md) && /30\s*V/.test(md) &&
    /300°/.test(md) && /Courant limite/.test(md) && /maxcurrent/.test(md));
}

// --- Netlist : l'alim est une source -------------------------------------------
const ALIM = (v = '5', i = '1') => ({ id: 'psu1', type: 'alim', x: 0, y: 0, attrs: { voltage: v, maxcurrent: i } });
const R = (id, value) => ({ id, type: 'resistor', x: 0, y: 0, attrs: { value: String(value) } });
const LED = (id, color = 'red') => ({ id, type: 'led', x: 0, y: 0, attrs: { color } });
const W = (id, a, b) => ({ id, a, b });

// LED + résistance sur l'alim SEULE (aucune carte dans le schéma).
const ledDiag = {
  parts: [ALIM(), R('r1', 220), LED('led1')],
  wires: [
    W('w1', { partId: 'psu1', pin: 'V+' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'led1', pin: 'A' }),
    W('w3', { partId: 'led1', pin: 'C' }, { partId: 'psu1', pin: 'GND' }),
  ],
};
check('LED sur alim seule : allumée (V+ = rail haut, GND = masse)',
  ledOn(ledDiag, 'led1', () => false) === true);
const circ = ledPowerCircuit(ledDiag, 'led1');
check('ledPowerCircuit : 220 Ω en série, tension = attr voltage (5 V)',
  near(circ.ohms, 220) && near(circ.supplyVolts, 5));
const circLive = ledPowerCircuit(ledDiag, 'led1', (id) => (id === 'psu1' ? 12 : null));
check('ledPowerCircuit : tension LIVE du bouton (12 V) prioritaire', near(circLive.supplyVolts, 12));

// LED alimentée par la carte : supplyVolts null (l'appelant prend le VCC carte).
const unoDiag = {
  parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, R('r1', 220), LED('led1')],
  wires: [
    W('w1', { partId: 'uno', pin: '5V' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'led1', pin: 'A' }),
    W('w3', { partId: 'led1', pin: 'C' }, { partId: 'uno', pin: 'GND.1' }),
  ],
};
const circUno = ledPowerCircuit(unoDiag, 'led1');
check('ledPowerCircuit : source = carte → supplyVolts null', near(circUno.ohms, 220) && circUno.supplyVolts === null);

// --- Courant débité (psuLoadAmps) ----------------------------------------------
check('charge : LED rouge + 220 Ω sous 5 V → ≈ 14,5 mA',
  near(psuLoadAmps(ledDiag, 'psu1', 5), (5 - 1.8) / 220, 1e-3));
check('charge : LED bleue (Vf 3 V) sous 2,5 V → 0 A (ne conduit pas)',
  psuLoadAmps({ ...ledDiag, parts: [ALIM(), R('r1', 220), LED('led1', 'blue')] }, 'psu1', 2.5) === 0);
const bridgeDiag = {
  parts: [ALIM(), R('r1', 1000)],
  wires: [
    W('w1', { partId: 'psu1', pin: 'V+' }, { partId: 'r1', pin: '1' }),
    W('w2', { partId: 'r1', pin: '2' }, { partId: 'psu1', pin: 'GND' }),
  ],
};
check('charge : pont 1 kΩ V+→GND sous 10 V → 10 mA', near(psuLoadAmps(bridgeDiag, 'psu1', 10), 0.01));
const shortDiag = {
  parts: [ALIM()],
  wires: [W('w1', { partId: 'psu1', pin: 'V+' }, { partId: 'psu1', pin: 'GND' })],
};
check('charge : fil direct V+→GND = court-circuit (99 A)', psuLoadAmps(shortDiag, 'psu1', 5) >= 99);
const directLed = {
  parts: [ALIM(), LED('led1')],
  wires: [
    W('w1', { partId: 'psu1', pin: 'V+' }, { partId: 'led1', pin: 'A' }),
    W('w2', { partId: 'led1', pin: 'C' }, { partId: 'psu1', pin: 'GND' }),
  ],
};
check('charge : LED branchée en direct → 99 A (grillera)', psuLoadAmps(directLed, 'psu1', 5) >= 99);
const servoDiag = {
  parts: [ALIM(), { id: 'sv1', type: 'servo', x: 0, y: 0 }, { id: 'sv2', type: 'servo', x: 0, y: 0 }],
  wires: [
    W('w1', { partId: 'psu1', pin: 'V+' }, { partId: 'sv1', pin: 'V+' }),
    W('w2', { partId: 'sv1', pin: 'V+' }, { partId: 'sv2', pin: 'V+' }),
    W('w3', { partId: 'psu1', pin: 'GND' }, { partId: 'sv1', pin: 'GND' }),
  ],
};
check('charge : 2 servos sur le rail V+ → 0,4 A', near(psuLoadAmps(servoDiag, 'psu1', 5), 0.4));
check('charge : extraAmps ajouté tel quel', near(psuLoadAmps(servoDiag, 'psu1', 5, undefined, 0.25), 0.65));

// --- Rendu réel (Chrome headless) ----------------------------------------------
const CACHE = join(root, 'node_modules', '.cache-psu');
mkdirSync(CACHE, { recursive: true });
const entry = `
import '../../src/webview/composants/alim-element.mjs';
import '../../src/webview/composants/servo-element.mjs';
import { Editor } from '../../src/webview/diagram/editor.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const el = document.createElement('kablix-alim');
	el.setAttribute('voltage', '12.5');
	document.body.appendChild(el);
	await wait(80);
	const sh = el.shadowRoot;
	const svg = sh.querySelector('svg');
	const res = {};
	// Écran aligné à DROITE : bord droit du texte stable quel que soit le nombre
	// de chiffres (« 12,50 » puis « 5,00 »), calé sur la marge du dessin (~201 px).
	const dispEl = sh.querySelector('#alim-Text-Affichage');
	const rightOf = () => {
		const m = dispEl.getCTM(); const b = dispEl.getBBox();
		return m.a * (b.x + b.width) + m.c * b.y + m.e;
	};
	const right1 = rightOf();
	el.setAttribute('voltage', '5');
	await wait(10);
	const right2 = rightOf();
	res.rightAligned = Math.abs(right1 - 201.4) < 3 && Math.abs(right2 - right1) < 0.8;
	el.setAttribute('voltage', '12.5');
	await wait(10);
	res.drawn = sh.querySelectorAll('[id^="alim-"]').length > 10;
	const box = svg.getBoundingClientRect();
	res.size = [Math.round(box.width), Math.round(box.height)];
	res.pins = el.pinInfo.map((p) => p.name + '@' + p.x + ',' + p.y).join(' ');
	res.display = (sh.querySelector('#alim-Text-Affichage tspan') || sh.querySelector('#alim-Text-Affichage')).textContent;
	// Le dessin retouché de Frank n'a plus de groupe alim-bouton-rot : le bouton
	// (alim-bouton) porte lui-même la rotation. Repli sur l'ancien id par sécurité.
	res.rot125 = (sh.querySelector('#alim-bouton') || sh.querySelector('#alim-bouton-rot'))?.style.transform;
	// Libellés traduisibles (défaut anglais dans ce banc).
	res.labelTension = sh.querySelector('#alim-text-tension tspan').textContent;
	res.labelLimite = [...sh.querySelectorAll('#alim-text-courant-limite tspan')].map((n) => n.textContent).join('/');
	// Bouton inerte HORS simulation.
	const ctm = svg.getScreenCTM();
	const at = (deg) => {
		const rad = (deg * Math.PI) / 180;
		return new DOMPoint(240.91 + 30 * Math.cos(rad), 68.9 + 30 * Math.sin(rad)).matrixTransform(ctm);
	};
	const zone = svg.querySelector(':scope > circle');
	const drag = (deg) => {
		const p = at(deg);
		zone.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	};
	drag(320); // 20 V… mais hors simulation : ne doit rien faire
	res.voltsEdit = el.volts;
	// EN SIMULATION : la tension repart de l'attribut puis suit le drag.
	el.setAttribute('simulating', '');
	await wait(20);
	res.voltsStart = el.volts;
	let inputSeen = false;
	el.addEventListener('input', () => { inputSeen = true; });
	drag(320); // 120° (zéro du cadran) + 200° → 20 V
	res.voltsDragged = el.volts;
	res.inputSeen = inputSeen;
	res.displayDragged = (sh.querySelector('#alim-Text-Affichage tspan') || sh.querySelector('#alim-Text-Affichage')).textContent;
	// LED courant limite : DÉGRADÉ conservé (même géométrie que le dessin, seule
	// la couleur passe au rouge vif #ff0000) + halo derrière la LED.
	const led = sh.querySelector('#alim-LED-courant-limite');
	const gradOff = led.style.fill;
	const on = sh.querySelector('#alim-led-on');
	const src = sh.querySelector('#alim-radialGradient115');
	res.gradSame = !!on && !!src &&
		['cx', 'cy', 'r', 'gradientTransform', 'gradientUnits'].every((a) => on.getAttribute(a) === src.getAttribute(a));
	res.gradVivid = !!on && [...on.querySelectorAll('stop')].some((s) => /#ff0000/i.test(s.getAttribute('style') || ''));
	el.overAmps = true;
	const glow = sh.querySelector('#alim-led-glow');
	res.ledOver = led.style.fill.includes('alim-led-on') && led.style.filter.includes('drop-shadow');
	res.ledOverRaw = led.style.fill;
	res.glowOn = !!glow && glow.style.display !== 'none' && glow.children.length === 2 &&
		[...glow.children].every((e) => e.style.filter.includes('blur') && e.getAttribute('fill') === '#ff0000');
	// Halo centré sur la LED et plus large qu'elle (comme la LED simple).
	const halo = glow?.children[0];
	res.glowCentered = !!halo &&
		halo.getAttribute('cx') === led.getAttribute('cx') && halo.getAttribute('cy') === led.getAttribute('cy') &&
		Number(halo.getAttribute('rx')) > Number(led.getAttribute('rx')) * 2;
	el.overAmps = false;
	res.ledOff = led.style.fill === gradOff && led.style.fill.includes('radialGradient115');
	res.glowOff = !!glow && glow.style.display === 'none';
	// Sortie de simulation : retour à la tension de démarrage.
	el.removeAttribute('simulating');
	await wait(20);
	res.voltsReset = el.volts;

	// --- Éditeur réel : pastilles des bornes + arrondi du stepper ----------------
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	const alim = editor.addPart('alim', 40, 40);
	const servo = editor.addPart('servo', 400, 40);
	await wait(120);
	const pads = (id, cls) => editor.rendered.get(id).container.querySelectorAll(cls).length;
	// L'alim n'a PLUS de pastille rouge/noire (prises banane déjà dessinées) ;
	// contre-épreuve : le servo garde les siennes.
	res.alimPads = [pads(alim.id, '.pin'), pads(alim.id, '.pin--vcc'), pads(alim.id, '.pin--gnd')];
	res.servoPads = [pads(servo.id, '.pin--vcc'), pads(servo.id, '.pin--gnd')];
	// Stepper de l'inspecteur (alim resélectionnée) : 5,1 + 0,1 = 5,2 pile.
	editor.select({ kind: 'part', id: alim.id });
	await wait(30);
	const inspector = document.getElementById('inspector');
	const stepInput = inspector.querySelector('.inspector__stepper-input');
	const plus = stepInput.closest('.inspector__stepper').querySelectorAll('.inspector__stepper-btn')[1];
	stepInput.value = '5.1';
	stepInput.dispatchEvent(new Event('change'));
	plus.click();
	const part = editor.diagram.parts.find((p) => p.id === alim.id);
	res.stepRounded = part.attrs.voltage;

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(res);
	document.body.appendChild(out);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: root, logLevel: 'silent' });
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
    check('rendu : dessin de Frank présent (ids alim-)', r.drawn === true);
    check('rendu : 280×110 px (1:1 viewBox)', r.size[0] === 280 && r.size[1] === 110);
    check('rendu : broches V+@95.65,92.87 GND@115.65,92.87', r.pins === 'V+@95.65,92.87 GND@115.65,92.87');
    check('rendu : écran suit l’attribut voltage (12,50)', r.display === '12,50');
    check('rendu : bouton tourné de 125° à 12,5 V (10°/V)', r.rot125 === 'rotate(125deg)');
    check('rendu : libellés traduisibles (Voltage / Current limit)',
      r.labelTension === 'Voltage' && r.labelLimite === 'Current/limit');
    check('rendu : bouton INERTE hors simulation', near(r.voltsEdit, 12.5));
    check('rendu : entrée en simulation → tension de démarrage', near(r.voltsStart, 12.5));
    check('rendu : drag à 320° du cadran → 20 V + événement input',
      near(r.voltsDragged, 20, 0.02) && r.inputSeen === true);
    check('rendu : écran suit le drag (20,00)', r.displayDragged === '20,00');
    check('rendu : LED allumée = MÊME dégradé radial que le dessin (centre, rayon, transform)', r.gradSame === true);
    check('rendu : dégradé allumé en rouge VIF #ff0000', r.gradVivid === true);
    check(`rendu : LED courant limite passe sur le dégradé vif (+ drop-shadow) — ${r.ledOverRaw}`, r.ledOver === true);
    check('rendu : halo affiché (2 ellipses rouges floutées, comme la LED simple)', r.glowOn === true);
    check('rendu : halo centré sur la LED et plus large qu\'elle', r.glowCentered === true);
    check('rendu : LED restaurée au dégradé d\'origine (fin de surcourant)', r.ledOff === true);
    check('rendu : halo masqué hors surcourant', r.glowOff === true);
    check('rendu : sortie de simulation → tension de démarrage', near(r.voltsReset, 12.5));
    check('rendu : écran aligné à DROITE (bord droit stable 12,50 → 5,00)', r.rightAligned === true);
    check('éditeur : bornes de l\'alim SANS pastille rouge/noire (2 .pin nus)',
      r.alimPads[0] === 2 && r.alimPads[1] === 0 && r.alimPads[2] === 0);
    check('éditeur : le servo garde ses pastilles V+/GND (contre-épreuve)',
      r.servoPads[0] === 1 && r.servoPads[1] === 1);
    check('éditeur : stepper 5,1 + 0,1 → 5,2 pile (2 décimales max)', r.stepRounded === '5.2');
  }
} else {
  console.log('⚠️ Chrome introuvable : rendu headless sauté');
}

console.log(failures === 0 ? '\nverify:psu OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
