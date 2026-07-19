// Test de régression : Grove Shield for Pi Pico (v2026.7.114).
// Vrai éditeur en Chrome headless : dessin de Frank rendu, 126 trous sur la
// grille de 10 px, interrupteur 3V3/5V cliquable (attr `pwr` persisté dans le
// schéma), connexions internes (netlist) conformes au schéma Seeed, et
// ENFICHAGE de la Pico sur le socle central (40 fils auto, E/S redirigées).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-grove');

const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { buildNets } from '../../src/webview/diagram/model.mjs';
import { groveShieldPins, groveShieldStrips, groveSocketPins } from '../../src/webview/diagram/grove-shield.mjs';
import '../../src/webview/composants/grove-shield-element.mjs';
import '../../src/webview/composants/pico-board.mjs';
import '../../src/webview/composants/led-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const editor = new Editor(
		document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));

	// --- 1. Pose + rendu du dessin ------------------------------------------------
	const shield = editor.addPart('grove-pico', 100, 100);
	await wait(120);
	const rr = editor.rendered.get(shield.id);
	const el = rr.el;
	const svg = el.shadowRoot && el.shadowRoot.querySelector('svg');
	ok('dessin rendu (svg 220×251.64)', svg && Math.round(svg.width.baseVal.value) === 220,
		svg ? svg.width.baseVal.value + 'x' + svg.height.baseVal.value : 'pas de svg');
	const inner = svg && svg.querySelector('#gvp-Calque_2');
	ok('SVG de Frank embarqué (ids préfixés gvp-)', !!inner, '');

	// --- 2. 126 trous, tous PILE sur la grille de 10 px ----------------------------
	const pins = groveShieldPins();
	ok('126 trous déclarés', pins.length === 126, pins.length);
	ok('pinInfo de l élément = géométrie partagée', el.pinInfo.length === 126, el.pinInfo.length);
	const offGrid = pins.filter((p) => p.x % 10 !== 0 || p.y % 10 !== 0);
	ok('tous les trous sur la grille de 10 px', offGrid.length === 0, JSON.stringify(offGrid.slice(0, 3)));
	// Échantillon de positions face au dessin (sonde faite sur le SVG de Frank).
	const at = (n) => pins.find((p) => p.name === n);
	ok('socle : 5V=(10,90), GP0=(10,160), GP16=(200,90) bas GP15=(200,160)',
		at('5V').x === 10 && at('5V').y === 90 && at('GP0').x === 10 && at('GP0').y === 160 &&
		at('GP16').x === 200 && at('GP16').y === 90 && at('GP15').x === 200 && at('GP15').y === 160, '');
	ok('ports : I2C0.SDA=(60,40), A2.A2=(180,50), UART0.RX=(60,230), D20.D20=(180,230), SPI.CS=(40,220)',
		at('I2C0.SDA').x === 60 && at('I2C0.SDA').y === 40 && at('A2.A2').x === 180 && at('A2.A2').y === 50 &&
		at('UART0.RX').x === 60 && at('UART0.RX').y === 230 && at('D20.D20').x === 180 && at('D20.D20').y === 230 &&
		at('SPI.CS').x === 40 && at('SPI.CS').y === 220, '');
	// Pastilles de l'éditeur créées pour chaque trou.
	ok('126 pastilles cliquables dans l éditeur', rr.hotspots.size === 126, rr.hotspots.size);

	// --- 3. Interrupteur 3V3/5V : cliquable, persisté, netlist qui suit -----------
	ok('défaut : pwr=3v3 (attrs du catalogue)', (shield.attrs && shield.attrs.pwr) === '3v3',
		JSON.stringify(shield.attrs));
	const knob = el.shadowRoot.querySelector('#gvp-curseur-switch');
	ok('curseur du dessin trouvé (gvp-curseur-switch)', !!knob, '');
	const t3 = knob ? knob.style.transform : '';
	ok('position 3V3 : curseur déplacé vers la droite', /1\\.244/.test(t3), t3);
	// Clic sur la zone de l'interrupteur (vrai chemin pointerdown → toggle → event).
	const zone = [...el.shadowRoot.querySelectorAll('rect')].find((r) => r.style.cursor === 'pointer');
	ok('zone cliquable de l interrupteur présente', !!zone, '');
	zone && zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
	await wait(30);
	ok('clic : attr élément pwr=5v', el.getAttribute('pwr') === '5v', el.getAttribute('pwr'));
	ok('clic : PERSISTÉ dans le schéma (part.attrs.pwr=5v)', shield.attrs && shield.attrs.pwr === '5v',
		JSON.stringify(shield.attrs));
	ok('position 5V : curseur revenu à gauche', /translate\\(0/.test(knob.style.transform), knob.style.transform);

	// --- 4. Connexions internes (netlist seule, conformes au schéma Seeed) --------
	const d = editor.diagram;
	const net = (pin, pwrDiagram) => buildNets(pwrDiagram ?? d).netOf({ partId: shield.id, pin });
	const same = (a, b) => net(a) === net(b);
	ok('I2C0 : SDA↔GP8, SCL↔GP9 ; I2C1 : SDA↔GP6, SCL↔GP7',
		same('I2C0.SDA', 'GP8') && same('I2C0.SCL', 'GP9') && same('I2C1.SDA', 'GP6') && same('I2C1.SCL', 'GP7'), '');
	ok('UART0 : TX↔GP0, RX↔GP1 ; UART1 : TX↔GP4, RX↔GP5',
		same('UART0.TX', 'GP0') && same('UART0.RX', 'GP1') && same('UART1.TX', 'GP4') && same('UART1.RX', 'GP5'), '');
	ok('analogiques : A0↔GP26 (2e signal du port A1 aussi), A1↔GP27, A2↔GP28',
		same('A0.A0', 'GP26') && same('A1.A0', 'GP26') && same('A1.A1', 'GP27') && same('A2.A1', 'GP27') && same('A2.A2', 'GP28'), '');
	ok('numériques : D16↔GP16/GP17, D18↔GP18/GP19, D20↔GP20/GP21',
		same('D16.D16', 'GP16') && same('D16.D17', 'GP17') && same('D18.D18', 'GP18') &&
		same('D18.D19', 'GP19') && same('D20.D20', 'GP20') && same('D20.D21', 'GP21'), '');
	ok('SPI0 : SCK↔GP2, TX↔GP3, RX↔GP4 (=UART1.TX), CS↔GP5',
		same('SPI.SCK', 'GP2') && same('SPI.TX', 'GP3') && same('SPI.RX', 'GP4') &&
		same('SPI.RX', 'UART1.TX') && same('SPI.CS', 'GP5'), '');
	ok('rail de masse unique (socle + ports + SPI + trous de dégagement)',
		same('GND.1', 'GND.8') && same('GND.1', 'I2C0.GND') && same('GND.1', 'D20.GND') &&
		same('GND.1', 'SPI.GND') && same('GND.1', 'GND.5.b'), '');
	ok('rail 3V3 fixe : ports analogiques + SPI (indépendant du switch)',
		same('3V3', 'A0.3V3') && same('3V3', 'A2.3V3') && same('3V3', 'SPI.3V3'), '');
	// pwr=5v (état courant après le clic) : VCC des ports numériques sur 5V, pas 3V3.
	ok('switch sur 5V : VCC des ports I2C/UART/D → 5V (VBUS)',
		same('I2C0.VCC', '5V') && same('D20.VCC', '5V') && !same('I2C0.VCC', '3V3'), '');
	// Retour 3V3 par le même clic : VCC bascule.
	zone && zone.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
	await wait(30);
	ok('switch revenu sur 3V3 : VCC des ports → 3V3, plus 5V',
		same('I2C0.VCC', '3V3') && same('UART1.VCC', '3V3') && !same('D16.VCC', '5V'), '');
	ok('A0.NC isolé (aucune liaison interne)',
		!same('A0.NC', 'GND.1') && !same('A0.NC', '3V3') && !same('A0.NC', 'GP26'), '');

	// --- 5. Enfichage de la Pico sur le socle --------------------------------------
	// La Pico est posée pour que ses broches tombent à ~2 px des trous du socle
	// (le vrai chemin de pose aligne ensuite pile) : mêmes méthodes que le drag.
	const holeTL = editor.hotspotCenter({ partId: shield.id, pin: '5V' }); // (10,90) local
	const pico = editor.addPart('pico', 0, 0);
	await wait(120);
	const pinTL = editor.hotspotCenter({ partId: pico.id, pin: 'VBUS' }); // 1re broche haut-gauche
	const pr = editor.rendered.get(pico.id);
	pr.part.x += holeTL.x - pinTL.x + 2; // décalage volontaire de 2 px (< seuil de 6)
	pr.part.y += holeTL.y - pinTL.y + 2;
	pr.container.style.left = pr.part.x + 'px';
	pr.container.style.top = pr.part.y + 'px';
	await wait(60);
	const holes = editor.collectBreadboardHoles(pico.id, true);
	ok('socle seul offert à la Pico (40 trous, ni ports Grove ni SPI)',
		holes.length === 40 && holes.every((h) => groveSocketPins().has(h.pin)), holes.length);
	editor.plugIntoBreadboard(pr.part, holes);
	await wait(60);
	const autos = editor.diagram.wires.filter((w) => w.auto && w.a.partId === pico.id);
	ok('enfichage : 40 fils auto Pico ↔ socle', autos.length === 40, autos.length);
	ok('GP25 (LED interne) non enfichée', !autos.some((w) => w.a.pin === 'GP25'), '');
	const vbusWire = autos.find((w) => w.a.pin === 'VBUS');
	ok('VBUS de la Pico dans le trou 5V du shield', vbusWire && vbusWire.b.pin === '5V',
		vbusWire ? vbusWire.b.pin : 'absent');
	const gp16Wire = autos.find((w) => w.a.pin === 'GP16');
	ok('GP16 de la Pico dans le trou GP16 du shield', gp16Wire && gp16Wire.b.pin === 'GP16',
		gp16Wire ? gp16Wire.b.pin : 'absent');
	// Alignement recalé PILE : la broche VBUS est exactement sur le trou 5V.
	const p2 = editor.hotspotCenter({ partId: pico.id, pin: 'VBUS' });
	ok('recalage : broche VBUS pile sur le trou (delta 0 px)',
		Math.abs(p2.x - holeTL.x) < 0.6 && Math.abs(p2.y - holeTL.y) < 0.6,
		'delta=' + (p2.x - holeTL.x).toFixed(1) + ',' + (p2.y - holeTL.y).toFixed(1));
	// Déplacer le shield emmène la Pico (grappe d'enfichage).
	const group = editor.connectedGroup(shield.id);
	ok('déplacer le shield emmène la Pico enfichée', group.has(pico.id), [...group].join(' '));

	// --- 6. Redirection de BOUT EN BOUT : LED sur un port Grove --------------------
	// LED câblée D16.D16 ↔ anode, D16.GND ↔ cathode : le net de l'anode contient
	// GP16 de la PICO (à travers socle + fils auto), la cathode voit une masse Pico.
	const led = editor.addPart('led', 600, 100);
	await wait(80);
	editor.addWire({ partId: led.id, pin: 'A' }, { partId: shield.id, pin: 'D16.D16' });
	editor.addWire({ partId: led.id, pin: 'C' }, { partId: shield.id, pin: 'D16.GND' });
	const nets2 = buildNets(editor.diagram);
	ok('anode de la LED sur le net GP16 de la PICO (redirection complète)',
		nets2.netOf({ partId: led.id, pin: 'A' }) === nets2.netOf({ partId: pico.id, pin: 'GP16' }), '');
	ok('cathode de la LED sur le net des masses de la PICO',
		nets2.netOf({ partId: led.id, pin: 'C' }) === nets2.netOf({ partId: pico.id, pin: 'GND.1' }), '');
	// VCC d'un port : suit le switch jusqu'aux broches de la Pico.
	const n3 = buildNets(editor.diagram);
	ok('switch 3V3 : I2C0.VCC sur le net 3V3 de la PICO',
		n3.netOf({ partId: shield.id, pin: 'I2C0.VCC' }) === n3.netOf({ partId: pico.id, pin: '3V3' }), '');

	// --- 7. Surbrillance de pose (setHighlight) ------------------------------------
	el.setHighlight(['GP0', '5V']);
	const hl = el.shadowRoot.querySelectorAll('circle[fill="#ffd633"]');
	ok('setHighlight : 2 trous illuminés', hl.length === 2, hl.length);
	el.setHighlight([]);
	ok('setHighlight([]) : surbrillance retirée',
		el.shadowRoot.querySelectorAll('circle[fill="#ffd633"]').length === 0, '');

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 400) }]);
	document.body.appendChild(out);
});
`;
mkdirSync(CACHE, { recursive: true });
writeFileSync(join(CACHE, 'e.mjs'), entry);
const b = await esbuild({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: ROOT });
const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
writeFileSync(
	join(CACHE, 'p.html'),
	`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
	`<div class="workshop"><aside id="palette" class="palette"></aside>` +
	`<div id="canvas" class="canvas" style="width:1000px;height:700px"><svg id="wires" class="wires"></svg></div>` +
	`<aside id="inspector" class="inspector"></aside></div>` +
	`<script>${b.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) { console.log('Chrome introuvable — test sauté'); process.exit(0); }
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=20000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) { console.log('MESURES INTROUVABLES'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
let fail = 0;
for (const r of rows) {
	if (!r.ok) fail++;
	console.log(`${r.ok ? '✅' : '❌'} ${r.name}${!r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail ? `grove : ${fail} échec(s).` : `grove : ${rows.length} contrôles OK — shield rendu, switch actif, Pico enfichable, E/S redirigées.`);
process.exit(fail ? 1 : 0);
