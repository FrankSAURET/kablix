// Repères des composants : R1, R2, C1, BP1… (v2026.7.240)
//
// Le nom d'un composant est son REPÈRE de schéma : préfixe de famille + numéro
// suivi sur le schéma (première résistance R1, deuxième R2…). Trois pièges que
// ce banc surveille :
//  1. la famille : elle vient du modèle de simulation (`kind`), pas de la
//     catégorie de palette — une LDR est une résistance, un joystick est un
//     potentiomètre, une carte SD est un « module » ;
//  2. la numérotation : on repart du plus grand numéro DÉJÀ posé, jamais du
//     nombre de composants, sinon supprimer R2 puis reposer une résistance
//     rendrait un R2 en double ;
//  3. la STABILITÉ à l'ouverture : un projet enregistré garde ses repères
//     (c'est le nom écrit sur le papier et dans les messages de simulation) —
//     seuls un repère vide ou en double reçoivent un repère neuf, les fils
//     suivant par la table de correspondance.
//
// Usage : node scripts/verify-refnames.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache-refnames');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------------------
// 1. La table des repères, en Node, sur le VRAI catalogue
// ---------------------------------------------------------------------------
writeFileSync(join(CACHE, 'api.mjs'), `
export { refFamily, refPrefix, nextPartId } from '../../src/webview/diagram/refnames.mjs';
export { CATALOG, partDef } from '../../src/webview/diagram/catalog.mjs';
export { initLocale } from '../../src/webview/i18n.mjs';
`);
const apiFile = join(CACHE, 'api.bundle.mjs');
await esbuild({
  entryPoints: [join(CACHE, 'api.mjs')],
  outfile: apiFile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const A = await import(pathToFileURL(apiFile).href);

A.initLocale('fr');
const famille = (t) => `${t}→${A.refPrefix(t)}`;
ok('familles (FR) : résistance, condensateur, LED, transistor, diode',
  ['resistor', 'condo-np', 'led', 'transistor', 'diode'].map(A.refPrefix).join(',') === 'R,C,L,T,D',
  ['resistor', 'condo-np', 'led', 'transistor', 'diode'].map(famille).join(' '));
ok('familles (FR) : CTN, CTP et LDR sont des RÉSISTANCES',
  ['ntc', 'ptc', 'ldr'].every((t) => A.refPrefix(t) === 'R'),
  ['ntc', 'ptc', 'ldr'].map(famille).join(' '));
ok('familles (FR) : carte à µc = U, platine/shield/carte SD = Mod',
  A.refPrefix('uno') === 'U' && A.refPrefix('pico') === 'U' &&
  ['breadboard', 'grove-pico', 'microsd', 'pca9685'].every((t) => A.refPrefix(t) === 'Mod'),
  ['uno', 'pico', 'breadboard', 'grove-pico', 'microsd'].map(famille).join(' '));
ok('familles (FR) : tous les afficheurs = Aff (7 segments, barre, LCD, OLED, TFT)',
  ['7seg', 'led-bar', 'lcd', 'oled-ssd1306', 'ili9341'].every((t) => A.refPrefix(t) === 'Aff'),
  ['7seg', 'led-bar', 'lcd', 'oled-ssd1306', 'ili9341'].map(famille).join(' '));
ok('familles (FR) : les rubans et matrices NeoPixel restent des LED',
  ['neopixel', 'neopixel-matrix', 'led-ring', 'rgb-led'].every((t) => A.refPrefix(t) === 'L'),
  ['neopixel', 'neopixel-matrix', 'led-ring', 'rgb-led'].map(famille).join(' '));
ok('familles (FR) : bouton BP, clavier Cl, interrupteur Inter',
  A.refPrefix('button') === 'BP' && A.refPrefix('keypad') === 'Cl' &&
  A.refPrefix('slide-switch') === 'Inter' && A.refPrefix('dip-switch') === 'Inter',
  ['button', 'keypad', 'slide-switch', 'dip-switch'].map(famille).join(' '));
ok('familles (FR) : un joystick, ce sont deux potentiomètres → Pot',
  ['pot', 'slide-pot', 'joystick'].every((t) => A.refPrefix(t) === 'Pot'),
  ['pot', 'slide-pot', 'joystick'].map(famille).join(' '));
ok('familles (FR) : capteurs Capt (DHT compris), actionneurs Act, alim Alim',
  ['dht22', 'hcsr04', 'pir', 'flame'].every((t) => A.refPrefix(t) === 'Capt') &&
  ['buzzer', 'servo', 'relais', 'ventilo'].every((t) => A.refPrefix(t) === 'Act') &&
  A.refPrefix('alim') === 'Alim',
  ['dht22', 'hcsr04', 'buzzer', 'relais', 'alim'].map(famille).join(' '));

A.initLocale('en');
ok('familles (EN) : préfixes traduits (PB, SW, KP, Aff→Disp, Capt→Sens)',
  A.refPrefix('button') === 'PB' && A.refPrefix('slide-switch') === 'SW' &&
  A.refPrefix('keypad') === 'KP' && A.refPrefix('7seg') === 'Disp' &&
  A.refPrefix('dht22') === 'Sens' && A.refPrefix('alim') === 'PSU',
  ['button', 'slide-switch', 'keypad', '7seg', 'dht22', 'alim'].map(famille).join(' '));
ok('familles (EN) : R, C, L, T, D et U ne changent pas de langue',
  ['resistor', 'condo-np', 'led', 'transistor', 'diode', 'uno'].map(A.refPrefix).join(',') === 'R,C,L,T,D,U');
A.initLocale('fr');

// Couverture : aucun type du catalogue ne doit tomber dans le repli « Mod » par
// oubli — seuls les kinds réellement « carte complexe » y ont droit.
const MODULE_KINDS = new Set(['breadboard', 'grove-shield', 'spi-sd', 'i2c-pwm']);
const orphelins = A.CATALOG
  .filter((d) => A.refPrefix(d.type) === 'Mod' && !MODULE_KINDS.has(d.kind))
  .map((d) => `${d.type}(${d.kind})`);
ok('couverture : chaque composant du catalogue a une famille explicite',
  orphelins.length === 0, orphelins.join(' '));
ok('couverture : le catalogue entier reçoit un repère non vide',
  A.CATALOG.every((d) => /^[A-Za-z]+$/.test(A.refPrefix(d.type))));
ok('type inconnu (projet plus récent) : repli Mod, aucune exception',
  A.refPrefix('composant-du-futur') === 'Mod');

// ---------------------------------------------------------------------------
// 2. La numérotation
// ---------------------------------------------------------------------------
ok('numérotation : premier composant d’une famille = 1',
  A.nextPartId('resistor', []) === 'R1' && A.nextPartId('led', ['R1', 'R2']) === 'L1');
ok('numérotation : suivante = plus grand numéro POSÉ + 1',
  A.nextPartId('resistor', ['R1', 'R2', 'R3']) === 'R4');
ok('numérotation : un trou n’est PAS rebouché (R2 supprimé → R4, pas R2)',
  A.nextPartId('resistor', ['R1', 'R3']) === 'R4');
ok('numérotation : chaque famille compte pour elle seule',
  A.nextPartId('condo-np', ['R1', 'R2', 'R3', 'C1']) === 'C2');
ok('numérotation : repère déjà pris (fichier importé) enjambé',
  A.nextPartId('resistor', ['R1', 'R4', 'R5']) === 'R6');
ok('numérotation : les vieux repères (led-3, r-1) ne perturbent rien',
  A.nextPartId('led', ['led-3', 'led-7']) === 'L1' &&
  A.nextPartId('resistor', ['r-1', 'R2']) === 'R3');
ok('numérotation : Pot et BP ne se confondent pas (préfixes de longueurs ≠)',
  A.nextPartId('pot', ['Pot1', 'BP1', 'BP2']) === 'Pot2' &&
  A.nextPartId('button', ['Pot1', 'BP1', 'BP2']) === 'BP3');

// ---------------------------------------------------------------------------
// 3. Câblage de l'éditeur (un maillon manquant = repères perdus au chargement)
// ---------------------------------------------------------------------------
const editor = read('src/webview/diagram/editor.mts');
ok('editor : la pose d’un composant demande un repère libre',
  /addPart\([\s\S]{0,300}id: this\.freeRef\(type\)/.test(editor));
ok('editor : le collage renomme aussi par repère',
  /insertPayload[\s\S]{0,900}id: this\.freeRef\(p\.type\)/.test(editor));
ok('editor : l’ouverture d’un fichier CONSERVE les repères enregistrés',
  /const free = !p\.id \|\| this\.diagram\.parts\.some\(\(q\) => q\.id === p\.id\);/.test(editor) &&
  /id: free \? this\.freeRef\(p\.type\) : p\.id/.test(editor));
ok('editor : les fils suivent le renommage (table de correspondance)',
  /idMap\.get\(w\.a\.partId\) \?\? w\.a\.partId/.test(editor));
ok('i18n : la langue active est lisible par les tables trop courtes pour t()',
  /export function locale\(\): string/.test(read('src/webview/i18n.mts')));

// ---------------------------------------------------------------------------
// 4. Un VRAI éditeur en Chrome headless : pose, ouverture, collage
// ---------------------------------------------------------------------------
const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
import { initLocale } from '../../src/webview/i18n.mjs';
import '../../src/webview/composants/led-element.mjs';
import '../../src/webview/composants/resistor-element.mjs';
import '../../src/webview/composants/pushbutton-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

function makeEditor(s) {
	return new Editor(
		document.getElementById('canvas' + s),
		document.getElementById('palette' + s),
		document.getElementById('wires' + s),
		document.getElementById('inspector' + s)
	);
}

async function run() {
	initLocale('fr');
	const a = makeEditor('A');
	const r1 = a.addPart('resistor', 100, 100);
	const l1 = a.addPart('led', 200, 100);
	const r2 = a.addPart('resistor', 300, 100);
	const bp1 = a.addPart('button', 400, 100);
	await wait(60);
	ok('atelier : la 1re résistance est R1, la 2e R2, la LED L1, le bouton BP1',
		[r1.id, l1.id, r2.id, bp1.id].join(',') === 'R1,L1,R2,BP1', [r1.id, l1.id, r2.id, bp1.id].join(','));
	ok('atelier : le repère est bien la clé du composant dessiné',
		!!a.elementOf('R1') && !!a.elementOf('BP1'));

	// Suppression de R1 : la suivante est R3, jamais un second R2.
	a.removePart('R1');
	await wait(40);
	const r3 = a.addPart('resistor', 500, 100);
	ok('atelier : R1 supprimée → la suivante est R3 (aucun doublon)', r3.id === 'R3', r3.id);

	// --- Ouverture d'un projet enregistré : les repères sont GARDÉS -----------
	const saved = {
		parts: [
			{ id: 'R1', type: 'resistor', x: 100, y: 100 },
			{ id: 'R2', type: 'resistor', x: 200, y: 100 },
			{ id: 'L1', type: 'led', x: 300, y: 100 },
		],
		wires: [{ id: 'w1', a: { partId: 'R1', pin: '1' }, b: { partId: 'L1', pin: 'A' } }],
	};
	const b = makeEditor('B');
	b.loadDiagram(JSON.parse(JSON.stringify(saved)));
	await wait(80);
	ok('ouverture : les repères du fichier sont conservés tels quels',
		b.diagram.parts.map((p) => p.id).join(',') === 'R1,R2,L1',
		b.diagram.parts.map((p) => p.id).join(','));
	ok('ouverture : le fil reste rattaché aux mêmes composants',
		b.diagram.wires[0].a.partId === 'R1' && b.diagram.wires[0].b.partId === 'L1',
		JSON.stringify(b.diagram.wires[0] && [b.diagram.wires[0].a.partId, b.diagram.wires[0].b.partId]));
	const r4 = b.addPart('resistor', 400, 200);
	ok('ouverture : un composant posé ensuite continue la série (R3)', r4.id === 'R3', r4.id);

	// Rouvrir le MÊME fichier deux fois de suite ne doit rien renuméroter.
	const c = makeEditor('C');
	c.loadDiagram(JSON.parse(JSON.stringify(saved)));
	await wait(40);
	c.loadDiagram(JSON.parse(JSON.stringify(saved)));
	await wait(60);
	ok('ouverture : deux ouvertures de suite donnent les mêmes repères',
		c.diagram.parts.map((p) => p.id).join(',') === 'R1,R2,L1',
		c.diagram.parts.map((p) => p.id).join(','));

	// Fichier abîmé : repère vide ou en double → repère neuf, fil suivi.
	const d = makeEditor('D');
	d.loadDiagram({
		parts: [
			{ id: 'R1', type: 'resistor', x: 100, y: 100 },
			{ id: 'R1', type: 'resistor', x: 200, y: 100 },
			{ id: '', type: 'led', x: 300, y: 100 },
		],
		wires: [{ id: 'w1', a: { partId: 'R1', pin: '1' }, b: { partId: '', pin: 'A' } }],
	});
	await wait(80);
	const ids = d.diagram.parts.map((p) => p.id);
	ok('fichier abîmé : doublon et repère vide reçoivent un repère neuf',
		new Set(ids).size === 3 && ids[0] === 'R1' && ids[1] === 'R2' && ids[2] === 'L1', ids.join(','));
	ok('fichier abîmé : le fil pointe encore sur des composants existants',
		d.diagram.wires.every((w) => ids.includes(w.a.partId) && ids.includes(w.b.partId)),
		JSON.stringify(d.diagram.wires.map((w) => [w.a.partId, w.b.partId])));

	// --- Langue anglaise : la pose donne PB1, pas BP1 -------------------------
	initLocale('en');
	const e = makeEditor('E');
	const pb = e.addPart('button', 100, 100);
	await wait(40);
	ok('langue : en anglais, le bouton posé est PB1', pb.id === 'PB1', pb.id);
	initLocale('fr');

	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify([{ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) }]);
	document.body.appendChild(out);
});
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const bundle = await esbuild({
  entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
  loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
});
const css = read('media/styles.css');
const zone = (s) =>
  `<div class="workshop"><aside id="palette${s}" class="palette"></aside>` +
  `<div id="canvas${s}" class="canvas" style="width:700px;height:400px"><svg id="wires${s}" class="wires"></svg></div>` +
  `<aside id="inspector${s}" class="inspector"></aside></div>`;
writeFileSync(
  join(CACHE, 'p.html'),
  `<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">` +
  ['A', 'B', 'C', 'D', 'E'].map(zone).join('') +
  `<script>${bundle.outputFiles[0].text}</script></body>`
);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
  console.log('Chrome introuvable — partie navigateur sautée');
} else {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--window-size=1400,1400', '--virtual-time-budget=15000', '--dump-dom',
    `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) {
    ok('navigateur : mesures introuvables (page en échec)', false);
  } else {
    const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    for (const r of rows) checks.push(r);
  }
}

let fail = 0;
for (const r of checks) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
}
console.log(fail
  ? `refnames : ${fail} échec(s).`
  : `refnames : ${checks.length} contrôles OK — repères R1, C2, BP3… suivis par schéma.`);
process.exit(fail ? 1 : 0);
