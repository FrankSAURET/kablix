// Banc : CARTE FILLE de bibliothèque — Grove Shield (Uno).
//
// Le shield Pico est écrit en dur dans le code (`grove-shield.mts`, banc
// `verify-grove.mjs`). Celui-ci, lui, ne vit QUE dans son paquet .kompix : le
// bloc `shield` du manifeste dit sur quoi il s'emboîte (`host`), quelles
// pastilles entrent dans la carte (`socket`), quelles pattes sont un même fil
// (`strips`) et ce que fait son interrupteur (`switch`). Zéro ligne de code par
// carte : c'est CE contrat que le banc vérifie.
//
// Deux parties : le manifeste (node, sans navigateur) puis la carte vivante
// dans le vrai éditeur (Chrome headless, vraie CSS) — dessin, interrupteur
// cliquable, connexions internes, emboîtement sur l'Uno, empilement et bulles.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(ROOT, 'node_modules', '.cache-shield');
mkdirSync(CACHE, { recursive: true });

let failures = 0;
function check(label, ok, detail = '') {
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
	if (!ok) failures++;
}

const part = await lireKompix('grove-uno');
const sh = part.shield ?? {};

// --- 1. Le manifeste porte le contrat de carte fille --------------------------
console.log('Manifeste du paquet :');
check('carte de la bibliothèque, rangée dans « Cartes & platines »',
	part.kind === 'grove-shield' && part.category === 'Boards', `${part.kind} / ${part.category}`);
check('nom affiché « Grove Shield (Uno) »', part.label === 'Grove Shield (Uno)', part.label);
check('elle s’emboîte sur une carte (host = mcu)', sh.host === 'mcu', String(sh.host));
check('95 pattes : 31 pastilles mâles + 16 prises Grove de 4',
	part.pins.length === 95 && sh.socket?.length === 31,
	`${part.pins.length} pattes, ${sh.socket?.length} pastilles`);
check('les 31 pastilles mâles existent toutes dans le dessin',
	sh.socket?.every((n) => part.pins.some((p) => p.name === n)),
	(sh.socket ?? []).filter((n) => !part.pins.some((p) => p.name === n)).join(' '));
check('17 pistes internes déclarées', sh.strips?.length === 17, String(sh.strips?.length));
check('aucune piste ne cite une patte inconnue',
	sh.strips?.flat().every((n) => part.pins.some((p) => p.name === n)),
	(sh.strips ?? []).flat().filter((n) => !part.pins.some((p) => p.name === n)).join(' '));
check('interrupteur : deux positions 3,3 V / 5 V sur l’attribut pwr',
	sh.switch?.attr === 'pwr' && sh.switch.options?.length === 2 &&
	sh.switch.options[0].rail === '3.3V' && sh.switch.options[1].rail === '5V',
	JSON.stringify(sh.switch?.options));
check('il commute les 16 VCC des prises Grove, et rien d’autre',
	sh.switch?.pins?.length === 16 && sh.switch.pins.every((n) => n.endsWith('.VCC')),
	String(sh.switch?.pins?.length));
check('le bouton du dessin existe et se déplace en position 5 V',
	part.svg.includes(`id="${sh.switch?.knob}"`) && sh.switch.options[1].dx > 0,
	`${sh.switch?.knob} dx=${sh.switch?.options?.[1]?.dx}`);
check('au repos la carte est en 5 V (l’Uno est une carte 5 V)',
	part.attrs?.pwr === '5v', JSON.stringify(part.attrs));
// Les prises A0 et A2 sont hors grille de 10 px : Frank n'a pas pu les y poser,
// et la carte doit être prise TELLE QUELLE plutôt que faussée par un calage.
{
	const horsGrille = part.pins.filter((p) => p.x % 10 !== 0 || p.y % 10 !== 0);
	const ports = [...new Set(horsGrille.map((p) => p.name.split('.')[0]))].sort();
	check('hors grille : seulement les prises A0 et A2, gardées telles quelles',
		ports.join(',') === 'A0,A2', ports.join(',') || 'aucune');
	check('les 31 pastilles mâles, elles, sont PILE sur la grille',
		!horsGrille.some((p) => sh.socket?.includes(p.name)), '');
}

// --- 2. La carte vivante dans le vrai éditeur ---------------------------------
console.log('Carte dans l’éditeur (Chrome headless) :');
const entry = `
import { Editor, plugRule } from '../../src/webview/diagram/editor.mjs';
import { buildNets } from '../../src/webview/diagram/model.mjs';
import { partDef, registerCustomPart } from '../../src/webview/diagram/catalog.mjs';
import '../../src/webview/composants/custom-part.mjs';
import '../../src/webview/composants/arduino-uno-element.mjs';
import '../../src/webview/composants/led-element.mjs';

// Exactement ce que fait la webview à l'ouverture d'un projet : le paquet lu
// devient une définition du catalogue.
registerCustomPart(${JSON.stringify({ ...part, behaviorScript: undefined })});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));

	// --- Dessin -----------------------------------------------------------------
	const shield = editor.addPart('grove-uno', 300, 120);
	await wait(150);
	const rr = editor.rendered.get(shield.id);
	const el = rr.el;
	const svg = el.shadowRoot && el.shadowRoot.querySelector('svg');
	ok('dessin rendu (viewBox 290×230)', svg && svg.getAttribute('viewBox') === '0 0 290 230',
		svg ? svg.getAttribute('viewBox') : 'pas de svg');
	ok('95 pastilles cliquables dans l éditeur', rr.hotspots.size === 95, rr.hotspots.size);

	// --- Interrupteur 3,3 V / 5 V ------------------------------------------------
	ok('défaut : pwr=5v (attrs du manifeste)', (shield.attrs && shield.attrs.pwr) === '5v',
		JSON.stringify(shield.attrs));
	const knob = el.shadowRoot.querySelector('#switch-button');
	ok('bouton du dessin trouvé (#switch-button)', !!knob, '');
	// Le bouton est mesuré À L ÉCRAN : seule preuve qu il glisse vraiment de
	// 17,39 px de dessin, quelle que soit l échelle Inkscape de son groupe.
	const echelle = svg.getBoundingClientRect().width / 290;
	const gauche = () => knob.getBoundingClientRect().left;
	const x5 = gauche();
	const zone = [...el.shadowRoot.querySelectorAll('rect')].find((r) => r.style.cursor === 'pointer');
	ok('zone cliquable de l interrupteur présente', !!zone, '');
	zone && zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
	await wait(40);
	ok('clic : attr élément pwr=3v3', el.getAttribute('pwr') === '3v3', el.getAttribute('pwr'));
	ok('clic : PERSISTÉ dans le schéma (part.attrs.pwr=3v3)',
		shield.attrs && shield.attrs.pwr === '3v3', JSON.stringify(shield.attrs));
	const course = (x5 - gauche()) / echelle;
	ok('position 3,3 V : le bouton a glissé de 17,39 px de dessin vers la gauche',
		Math.abs(course - 17.39) < 0.6, course.toFixed(2) + ' px');

	// --- Connexions internes (netlist) -------------------------------------------
	const d = editor.diagram;
	const net = (pin) => buildNets(d).netOf({ partId: shield.id, pin });
	const same = (a, b) => net(a) === net(b);
	ok('UART : TX↔patte 1, RX↔patte 0', same('UART.TX', '1') && same('UART.RX', '0'), '');
	ok('I2C : les 4 prises SDA↔A4 (et A4.2), SCL↔A5 (et A5.2)',
		same('I2C0.SDA', 'A4') && same('I2C0.SDA', 'A4.2') && same('I2C3.SDA', 'A4') &&
		same('I2C0.SCL', 'A5') && same('I2C0.SCL', 'A5.2') && same('I2C3.SCL', 'A5'), '');
	ok('numériques : D4.D4↔4, D4.D5↔5, D8.D8↔8, D8.D9↔9',
		same('D4.D4', '4') && same('D4.D5', '5') && same('D8.D8', '8') && same('D8.D9', '9'), '');
	ok('prises voisines partagées : D3.D4↔D4.D4, D5.D5↔D4.D5, D6.D7↔D7.D7',
		same('D3.D4', 'D4.D4') && same('D5.D5', 'D4.D5') && same('D6.D7', 'D7.D7'), '');
	ok('analogiques : A0.A0↔A0, A1.A1↔A1, A2.A2↔A2, A3.A3↔A3, A3.A4↔A4',
		same('A0.A0', 'A0') && same('A1.A1', 'A1') && same('A2.A2', 'A2') &&
		same('A3.A3', 'A3') && same('A3.A4', 'A4'), '');
	ok('rail de masse unique (3 pastilles + les 16 prises)',
		same('GND.1', 'GND.2') && same('GND.1', 'GND.3') &&
		same('GND.1', 'I2C0.GND') && same('GND.1', 'UART.GND') && same('GND.1', 'A0.GND'), '');
	ok('interrupteur sur 3,3 V : les VCC des prises → pastille 3.3V, jamais 5V',
		same('I2C0.VCC', '3.3V') && same('UART.VCC', '3.3V') && same('A2.VCC', '3.3V') &&
		!same('D4.VCC', '5V'), '');
	zone && zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
	await wait(40);
	ok('interrupteur sur 5 V : les VCC basculent sur la pastille 5V',
		same('I2C0.VCC', '5V') && same('D4.VCC', '5V') && !same('I2C0.VCC', '3.3V'), '');
	ok('les deux rails restent séparés (3.3V ≠ 5V ≠ masse)',
		!same('3.3V', '5V') && !same('5V', 'GND.1'), '');

	// --- Emboîtement sur l Uno ----------------------------------------------------
	const uno = editor.addPart('uno', 40, 400);
	await wait(150);
	const regle = plugRule(partDef('grove-uno'));
	ok('règle d emboîtement : sur une carte (mcu), par ses 31 pastilles mâles',
		regle && regle.host === 'mcu' && regle.own.size === 31 && !regle.onSupport,
		JSON.stringify(regle && { host: regle.host, own: regle.own.size }));
	// Poser la carte fille à 2 px près (sous le seuil d aimantation), comme un
	// vrai lâcher de souris : c est le code de pose qui recale ensuite au pixel.
	const trou = editor.hotspotCenter({ partId: uno.id, pin: 'GND.1' });
	const pad = editor.hotspotCenter({ partId: shield.id, pin: 'GND.1' });
	rr.part.x += trou.x - pad.x + 2;
	rr.part.y += trou.y - pad.y + 2;
	rr.container.style.left = rr.part.x + 'px';
	rr.container.style.top = rr.part.y + 'px';
	await wait(60);
	const holes = editor.collectBreadboardHoles(shield.id, regle);
	ok('les 31 broches de l Uno offertes à la carte fille', holes.length === 31, holes.length);
	editor.plugIntoBreadboard(rr.part, holes);
	await wait(60);
	const autos = editor.diagram.wires.filter((w) => w.auto && w.a.partId === shield.id);
	ok('emboîtement : 31 fils auto carte fille ↔ Uno', autos.length === 31, autos.length);
	const prises = autos.filter((w) => !regle.own.has(w.a.pin));
	ok('AUCUNE prise Grove enfichée (femelles : rien n y entre)',
		prises.length === 0, prises.map((w) => w.a.pin).join(' '));
	ok('chaque pastille tombe dans la broche de MÊME nom',
		autos.every((w) => w.b.pin === w.a.pin),
		autos.filter((w) => w.b.pin !== w.a.pin).map((w) => w.a.pin + '→' + w.b.pin).join(' '));
	const p2 = editor.hotspotCenter({ partId: shield.id, pin: 'GND.1' });
	ok('recalage : la pastille GND.1 pile sur sa broche (delta 0 px)',
		Math.abs(p2.x - trou.x) < 0.6 && Math.abs(p2.y - trou.y) < 0.6,
		'delta=' + (p2.x - trou.x).toFixed(1) + ',' + (p2.y - trou.y).toFixed(1));
	const group = editor.connectedGroup(uno.id);
	ok('déplacer l Uno emmène la carte fille', group.has(shield.id), [...group].join(' '));

	// --- Redirection de bout en bout : une LED sur une prise Grove ----------------
	const led = editor.addPart('led', 800, 120);
	await wait(80);
	editor.addWire({ partId: led.id, pin: 'A' }, { partId: shield.id, pin: 'D4.D4' });
	editor.addWire({ partId: led.id, pin: 'C' }, { partId: shield.id, pin: 'D4.GND' });
	const n2 = buildNets(editor.diagram);
	ok('anode de la LED sur le net de la patte 4 de l Uno (redirection complète)',
		n2.netOf({ partId: led.id, pin: 'A' }) === n2.netOf({ partId: uno.id, pin: '4' }), '');
	ok('cathode de la LED sur les masses de l Uno',
		n2.netOf({ partId: led.id, pin: 'C' }) === n2.netOf({ partId: uno.id, pin: 'GND.2' }), '');
	ok('VCC des prises (5 V) sur le net 5V de l Uno',
		n2.netOf({ partId: shield.id, pin: 'I2C0.VCC' }) === n2.netOf({ partId: uno.id, pin: '5V' }), '');

	// --- Empilement ---------------------------------------------------------------
	const zOf = (id) => getComputedStyle(editor.rendered.get(id).container).zIndex;
	ok('la carte fille (z=2) passe DEVANT son Uno (z=1)',
		zOf(shield.id) === '2' && zOf(uno.id) === '1', zOf(shield.id) + '/' + zOf(uno.id));
	ok('classe CSS de carte posée sur son hôte (part--shield-top)',
		editor.rendered.get(shield.id).container.classList.contains('part--shield-top'), '');

	// --- Bulles de broche ----------------------------------------------------------
	// « I2C0.SDA » ne dit pas quoi écrire dans le programme : la bulle ajoute la
	// patte réelle de l Uno. Rien à ajouter quand le nom la dit déjà (« D4.D5 »).
	const bulle = (n) => rr.hotspots.get(n) && rr.hotspots.get(n).title;
	ok('bulle : I2C0.SDA → I2C0.SDA.A4 et I2C2.SCL → I2C2.SCL.A5',
		bulle('I2C0.SDA') === 'I2C0.SDA.A4' && bulle('I2C2.SCL') === 'I2C2.SCL.A5',
		bulle('I2C0.SDA') + ' / ' + bulle('I2C2.SCL'));
	ok('bulle : UART.TX → UART.TX.1 et UART.RX → UART.RX.0',
		bulle('UART.TX') === 'UART.TX.1' && bulle('UART.RX') === 'UART.RX.0',
		bulle('UART.TX') + ' / ' + bulle('UART.RX'));
	ok('bulle : rien d ajouté quand le nom dit déjà la patte (D4.D4, D4.D5, A0.A0, A3.A4)',
		bulle('D4.D4') === 'D4.D4' && bulle('D4.D5') === 'D4.D5' &&
		bulle('A0.A0') === 'A0.A0' && bulle('A3.A4') === 'A3.A4',
		[bulle('D4.D4'), bulle('D4.D5'), bulle('A0.A0'), bulle('A3.A4')].join(' '));
	ok('bulle : alimentations et pastilles mâles inchangées (VCC, GND, 5V, A0, 13)',
		bulle('I2C0.VCC') === 'I2C0.VCC' && bulle('A0.GND') === 'A0.GND' &&
		bulle('5V') === '5V' && bulle('A0') === 'A0' && bulle('13') === '13',
		[bulle('I2C0.VCC'), bulle('A0.GND'), bulle('5V'), bulle('A0'), bulle('13')].join(' '));
	// Contre-preuve : l étiquette vient du NET, pas d une table recopiée.
	const etiquetees = [...rr.hotspots.keys()].filter((n) => bulle(n) !== n);
	const menteuses = etiquetees.filter((n) => !same(n, bulle(n).slice(n.length + 1)));
	ok('bulle : 10 signaux étiquetés (4 SDA, 4 SCL, TX, RX) et AUCUN ne ment sur le net',
		etiquetees.length === 10 && menteuses.length === 0,
		etiquetees.length + ' étiquetées, menteuses: ' + menteuses.join(','));

	rendre();
}
function rendre() {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	checks.push({ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 400) });
	rendre();
});
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild.build({
	entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
	loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT, logLevel: 'silent',
});
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1400px;height:900px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`);
const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) {
	console.log('  – Chrome introuvable, carte non vérifiée dans l’éditeur');
} else {
	const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
		'--virtual-time-budget=20000', '--dump-dom',
		`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
	if (!m) check('mesures relevées', false, 'aucune mesure dans le DOM');
	else for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))) {
		check(r.name, r.ok, r.detail);
	}
}

console.log(failures === 0 ? 'RESULTAT: OK' : `RESULTAT: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
