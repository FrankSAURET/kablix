// Vérifie le module Grove PCA9685 natif (kablix-pca9685, kind 'i2c-pwm') :
//  - catalogue : rangé dans Divers, adresse 0x40 ;
//  - rails internes (buildNets) : masse commune Grove/bornier/colonnes servo,
//    rail V+ bornier → colonnes 5V, VCC logique isolé ;
//  - pca9685Bindings : servo sur PWM0 → canal 0 ;
//  - pca9685PowerState : exigence d'alim de laboratoire ~5 V au courant
//    suffisant sur le bornier V+/GND.2 (tension attr et live, courant, câblage) ;
//  - rôles électriques des broches (pastilles rouges/noires) ;
//  - rendu réel en Chrome headless : dessin, 300×200, 54 broches sur la grille
//    de 10 px, pastilles connectorNNterminal de Frank PILE sous les broches
//    (bloc P11/P12 recalé au nettoyage).
import esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'kablix-pca-'));
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
const { buildNets, pca9685Bindings, pca9685PowerState, psuLoadAmps } = await buildTo('src/webview/diagram/model.mts', 'model.mjs');
const { partDef, partCategory, pinElectricalRole } = await buildTo('src/webview/diagram/catalog.mts', 'catalog.mjs');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) < eps * Math.max(1, Math.abs(b));

// --- Catalogue -----------------------------------------------------------------
const def = partDef('pca9685');
check('catalogue : pca9685 = kablix-pca9685, kind i2c-pwm, catégorie Divers',
  def.tag === 'kablix-pca9685' && def.kind === 'i2c-pwm' && partCategory(def) === 'Divers');
check('catalogue : adresse I²C 0x40 par défaut', def.attrs?.address === '0x40');

// --- Rôles électriques (pastilles rouges/noires des connecteurs servo) ----------
check('rôles : P1.5V/P16.5V/V+/VCC = vcc (rouge)',
  pinElectricalRole('pca9685', 'P1.5V') === 'vcc' && pinElectricalRole('pca9685', 'P16.5V') === 'vcc' &&
  pinElectricalRole('pca9685', 'V+') === 'vcc' && pinElectricalRole('pca9685', 'VCC') === 'vcc');
check('rôles : P1.GND/GND/GND.2 = gnd (noir), PWM0/SDA = autre',
  pinElectricalRole('pca9685', 'P1.GND') === 'gnd' && pinElectricalRole('pca9685', 'GND') === 'gnd' &&
  pinElectricalRole('pca9685', 'GND.2') === 'gnd' &&
  pinElectricalRole('pca9685', 'PWM0') === 'other' && pinElectricalRole('pca9685', 'SDA') === 'other');

// --- Schéma de référence : uno + PCA + servo P1 + alim sur le bornier -----------
const PCA = { id: 'pca1', type: 'pca9685', x: 0, y: 0, attrs: { address: '0x40' } };
const SRV = { id: 'srv1', type: 'servo', x: 0, y: 0, attrs: {} };
const ALIM = (v = '5', i = '1') => ({ id: 'psu1', type: 'alim', x: 0, y: 0, attrs: { voltage: v, maxcurrent: i } });
const W = (id, a, b) => ({ id, a, b });
const baseWires = [
  W('w1', { partId: 'srv1', pin: 'PWM' }, { partId: 'pca1', pin: 'PWM0' }),
  W('w2', { partId: 'srv1', pin: 'V+' }, { partId: 'pca1', pin: 'P1.5V' }),
  W('w3', { partId: 'srv1', pin: 'GND' }, { partId: 'pca1', pin: 'P1.GND' }),
];
const alimWires = [
  W('w4', { partId: 'psu1', pin: 'V+' }, { partId: 'pca1', pin: 'V+' }),
  W('w5', { partId: 'psu1', pin: 'GND' }, { partId: 'pca1', pin: 'GND.2' }),
];
const full = { parts: [PCA, SRV, ALIM()], wires: [...baseWires, ...alimWires] };

// Rails internes.
const nets = buildNets(full);
const of = (partId, pin) => nets.netOf({ partId, pin });
check('rails : bornier V+ ↔ colonnes P1.5V..P16.5V (servo alimenté par l\'alim)',
  of('pca1', 'V+') === of('pca1', 'P1.5V') && of('pca1', 'V+') === of('pca1', 'P16.5V') &&
  of('psu1', 'V+') === of('srv1', 'V+'));
check('rails : masse commune Grove + bornier + colonnes',
  of('pca1', 'GND') === of('pca1', 'GND.2') && of('pca1', 'GND') === of('pca1', 'P9.GND') &&
  of('psu1', 'GND') === of('srv1', 'GND'));
check('rails : VCC logique isolé du rail V+ servo', of('pca1', 'VCC') !== of('pca1', 'V+'));

// Bindings : servo sur PWM0 = canal 0.
const [b] = pca9685Bindings(full);
check('bindings : servo détecté sur le canal 0',
  b?.partId === 'pca1' && b?.channels.some((c) => c.ch === 0 && c.targetId === 'srv1' && c.targetKind === 'servo'));

// Charge : le servo enfiché sur la colonne compte 0,2 A via le rail interne.
check('charge : servo sur colonne P1 compté (0,2 A)', near(psuLoadAmps(full, 'psu1', 5), 0.2));

// --- Exigence d'alimentation servo (pca9685PowerState) --------------------------
const st = (d, volts) => pca9685PowerState(d, volts)[0];
check('alim 5 V reliée au bornier → sorties actives', st(full)?.ok === true && st(full)?.psuId === 'psu1');
check('sans alim → sorties inertes',
  st({ parts: [PCA, SRV], wires: baseWires })?.ok === false &&
  st({ parts: [PCA, SRV], wires: baseWires })?.psuId === null);
check('alim réglée sur 3 V → inertes (fenêtre 4,5–5,5 V)',
  st({ parts: [PCA, SRV, ALIM('3')], wires: [...baseWires, ...alimWires] })?.ok === false);
check('alim réglée sur 12 V → inertes',
  st({ parts: [PCA, SRV, ALIM('12')], wires: [...baseWires, ...alimWires] })?.ok === false);
check('tension LIVE du bouton prioritaire (5 V attr mais 8 V au bouton → inertes)',
  st(full, () => 8)?.ok === false);
check('courant insuffisant (max 0,1 A < 0,2 A servo) → inertes + alim identifiée',
  st({ parts: [PCA, SRV, ALIM('5', '0.1')], wires: [...baseWires, ...alimWires] })?.ok === false &&
  st({ parts: [PCA, SRV, ALIM('5', '0.1')], wires: [...baseWires, ...alimWires] })?.psuId === 'psu1');
check('V+ relié mais GND.2 en l\'air → inertes',
  st({ parts: [PCA, SRV, ALIM()], wires: [...baseWires, alimWires[0]] })?.ok === false);

// --- Rendu réel (Chrome headless) ----------------------------------------------
const CACHE = join(root, 'node_modules', '.cache-pca');
mkdirSync(CACHE, { recursive: true });
const entry = `
import '../../src/webview/composants/pca9685-element.mjs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
	const el = document.createElement('kablix-pca9685');
	document.body.appendChild(el);
	await wait(80);
	const sh = el.shadowRoot;
	const svg = sh.querySelector('svg');
	const res = {};
	res.drawn = sh.querySelectorAll('[id^="pca-"]').length > 100;
	const box = svg.getBoundingClientRect();
	res.size = [Math.round(box.width), Math.round(box.height)];
	res.pinCount = el.pinInfo.length;
	res.onGrid = el.pinInfo.every((p) => p.x % 10 === 0 && p.y % 10 === 0);
	const byName = new Map(el.pinInfo.map((p) => [p.name, p]));
	res.spots = ['PWM0@240,30', 'P1.5V@240,40', 'P1.GND@240,50', 'PWM15@240,150', 'P16.GND@240,170', 'SDA@10,100', 'V+@290,110', 'GND.2@290,90']
		.every((s) => {
			const [name, xy] = s.split('@');
			const p = byName.get(name);
			return p && p.x + ',' + p.y === xy;
		});
	// Pastilles connectorNNterminal de Frank PILE sous les broches (mapping n → nom).
	const mapTop5v = (n) => 16 + n; // P1..P8
	const bot5v = { 9: 26, 10: 25, 11: 28, 12: 27, 13: 30, 14: 29, 15: 32, 16: 31 };
	const botGnd = { 9: 42, 10: 41, 11: 44, 12: 43, 13: 46, 14: 45, 15: 48, 16: 47 };
	const conn = new Map([[50, 'GND'], [51, 'VCC'], [52, 'SDA'], [53, 'SCL'], [0, 'GND.2'], [49, 'V+']]);
	for (let n = 1; n <= 16; n++) conn.set(n, 'PWM' + (n - 1));
	for (let n = 1; n <= 8; n++) { conn.set(mapTop5v(n), 'P' + n + '.5V'); conn.set(32 + n, 'P' + n + '.GND'); }
	for (let n = 9; n <= 16; n++) { conn.set(bot5v[n], 'P' + n + '.5V'); conn.set(botGnd[n], 'P' + n + '.GND'); }
	let worst = 0, seen = 0, badName = '';
	for (const t of sh.querySelectorAll('[id^="pca-connector"][id$="terminal"]')) {
		const num = Number(t.id.replace('pca-connector', '').replace('terminal', ''));
		const name = conn.get(num);
		const p = name ? byName.get(name) : null;
		if (!p) { badName = t.id; continue; }
		seen++;
		const m = t.getCTM(); const bb = t.getBBox();
		const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
		const x = m.a * cx + m.c * cy + m.e, y = m.b * cx + m.d * cy + m.f;
		worst = Math.max(worst, Math.hypot(x - p.x, y - p.y));
	}
	res.padSeen = seen;
	res.padWorst = +worst.toFixed(2);
	res.padBad = badName;
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(res);
	document.body.appendChild(out);
}
run();
`;
writeFileSync(join(CACHE, 'e.mjs'), entry);
const bld = await esbuild.build({ entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false, loader: { '.svg': 'text' }, absWorkingDir: root, logLevel: 'silent' });
writeFileSync(join(CACHE, 'p.html'), `<!doctype html><meta charset=utf8><body><script>${bld.outputFiles[0].text}</script></body>`);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (chrome) {
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=15000', '--dump-dom', `file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = dom.match(/<pre id="measures"[^>]*>([^<]+)<\/pre>/);
  if (!m) {
    check('rendu headless : mesures produites', false);
  } else {
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    check('rendu : dessin Fritzing présent (ids pca-)', r.drawn === true);
    check('rendu : 300×200 px (1:1 viewBox)', r.size[0] === 300 && r.size[1] === 200);
    check('rendu : 54 broches, toutes sur la grille de 10 px', r.pinCount === 54 && r.onGrid === true);
    check('rendu : positions clés (PWM0/P1/P16/SDA/bornier)', r.spots === true);
    check('rendu : 54 pastilles de Frank appariées aux broches', r.padSeen === 54 && r.padBad === '');
    check(`rendu : pire écart pastille↔broche < 0,4 px (bloc P11/P12 recalé) — ${r.padWorst} px`, r.padWorst < 0.4);
  }
} else {
  console.log('⚠️ Chrome introuvable : rendu headless sauté');
}

console.log(failures === 0 ? '\nverify:pca OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
