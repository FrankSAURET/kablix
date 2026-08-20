// Simulation DMX512 (v2026.8.89) — Frank : « bien sûr je veux qu'ils soient
// simulables ». Quatre étages, du plus bas au plus haut :
//
//   1. DÉCODEUR : les octets arrivent du VRAI UART matériel (250 kbauds, un
//      octet toutes les ~44 µs). Le BREAK qui ouvre une trame n'est PAS un
//      octet : la seule chose visible du décodeur est le SILENCE qui le
//      contient — d'où la resynchronisation sur un trou ≥ 88 µs.
//   2. LIAISON : dmxBindings() retrouve, dans les .projix de testkablix, quel
//      projecteur écoute quelle broche du micro, à quelle adresse.
//   3. RENDU : setGroupColor('LED', …) recolore vraiment le groupe « LED » du
//      dessin du spot — ses formes portent un dégradé en style INLINE, un
//      simple fill sur le groupe ne se verrait pas.
//   4. et 5. BOUT EN BOUT : les vrais programmes de testkablix tournent dans
//      les vrais moteurs — dmx-pico.py dans le firmware MicroPython, dmx-uno.ino
//      compilé par arduino-cli — UART → décodeur → univers ; les trois couleurs
//      doivent ressortir, et le moniteur série rester propre.
//
//   node scripts/verify-dmx.mjs [--quick]
//   --quick : étapes 1 à 3 (saute les bouts en bout, ~1 min de firmware).
import esbuild, { build as esbuildBuild } from 'esbuild';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lireKompix } from './_lire-kompix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.argv.includes('--quick');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-dmx-'));

let fail = 0;
let total = 0;
function check(label, ok, detail = '') {
	total++;
	if (!ok) fail++;
	console.log(`${ok ? '✅' : '❌'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

async function bundle(contents, name) {
	const out = join(tmp, name);
	await esbuild.build({
		stdin: { contents, resolveDir: ROOT, loader: 'ts' },
		outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	});
	return import(pathToFileURL(out).href);
}

// --- 1. Décodeur --------------------------------------------------------------
console.log('--- 1. Décodeur DMX512 (trame, start code, resynchronisation) ---');
const { DmxDecoder, DMX_SLOTS } = await bundle(
	"export * from './src/webview/engines/dmx.mts';\n", 'dmx.mjs');

const OCTET_US = 44; // 11 bits à 250 kbauds

/** Envoie une trame comme le fait l'UART : un octet toutes les 44 µs. */
function envoyer(dec, t0, octets) {
	let us = t0;
	for (const b of octets) {
		dec.feed(b, us);
		us += OCTET_US;
	}
	return us;
}

const dec = new DmxDecoder();
check('univers = 513 créneaux (octet de départ + 512 canaux)', DMX_SLOTS === 513, String(DMX_SLOTS));

// Trame d'éclairage : start code 0, puis rouge plein sur les canaux 1-2-3.
let us = envoyer(dec, 1_000, [0, 255, 0, 0]);
check('trame lue : canaux 1-2-3 = 255,0,0',
	dec.universe[1] === 255 && dec.universe[2] === 0 && dec.universe[3] === 0,
	[...dec.universe.slice(0, 5)].join(','));
check('l\'octet de départ reste en 0', dec.universe[0] === 0, String(dec.universe[0]));

// Silence d'une seconde (comme le delay(1000) du programme) puis trame verte :
// le décodeur DOIT repartir du créneau 0, pas continuer la trame précédente.
us = envoyer(dec, us + 1_000_000, [0, 0, 255, 0]);
check('resynchronisation après silence : 0,255,0',
	dec.universe[1] === 0 && dec.universe[2] === 255 && dec.universe[3] === 0,
	[...dec.universe.slice(0, 5)].join(','));

// Trame de commande (start code ≠ 0, RDM par exemple) : à ignorer entièrement.
us = envoyer(dec, us + 1_000_000, [0xcc, 1, 2, 3]);
check('start code ≠ 0 ignoré (l\'univers ne bouge pas)',
	dec.universe[1] === 0 && dec.universe[2] === 255 && dec.universe[3] === 0,
	[...dec.universe.slice(0, 5)].join(','));

// Trame complète : 512 canaux, le dernier doit arriver, rien au-delà.
const pleine = new Uint8Array(513);
pleine[512] = 77;
us = envoyer(dec, us + 1_000_000, [...pleine, 99]);
check('canal 512 atteint', dec.universe[512] === 77, String(dec.universe[512]));
check('rien ne déborde au-delà de 512 créneaux', dec.universe.length === 513, String(dec.universe.length));

// takeChanged : le worker ne publie l'univers que s'il a bougé.
dec.takeChanged();
check('takeChanged() : rien de neuf → null', dec.takeChanged() === null);
envoyer(dec, us + 1_000_000, [0, 5]);
check('takeChanged() : trame reçue → univers', dec.takeChanged() instanceof Uint8Array);
check('takeChanged() : consommé une fois', dec.takeChanged() === null);

// breakDetected() (sendbreak explicite d'un UART) : même effet qu'un silence.
const d2 = new DmxDecoder();
envoyer(d2, 0, [0, 11, 22]);
d2.breakDetected();
envoyer(d2, 500, [0, 33]);
check('breakDetected() redémarre la trame',
	d2.universe[1] === 33 && d2.universe[2] === 22, [...d2.universe.slice(0, 4)].join(','));

// --- 2. Liaison (projix de testkablix) ---------------------------------------
console.log('\n--- 2. Liaison : quel projecteur sur quelle broche, à quelle adresse ---');
// Modèle ET catalogue dans le MÊME bundle : deux bundles séparés emportent
// chacun leur copie du catalogue, et le composant .kompix enregistré dans l'un
// resterait inconnu de l'autre (cf. testkablix/_verify.mjs).
const { model, catalog } = await bundle(
	"export * as model from './src/webview/diagram/model.mts';\n"
	+ "export * as catalog from './src/webview/diagram/catalog.mjs';\n", 'diagram.mjs');

const PROJIX = [
	{ nom: 'dmx-uno', file: join(ROOT, 'testkablix', 'Arduino', 'dmx-uno', 'dmx-uno.projix'), mcuPin: '1' },
	{ nom: 'dmx-pico', file: join(ROOT, 'testkablix', 'dmx-pico.projix'), mcuPin: 'GP0' },
];

for (const p of PROJIX) {
	if (!existsSync(p.file)) { check(`${p.nom} : .projix présent`, false, p.file); continue; }
	const zip = await JSZip.loadAsync(readFileSync(p.file));
	const diagram = JSON.parse(await zip.file('diagram.json').async('string'));
	for (const cp of diagram.customParts ?? []) catalog.registerCustomPart(cp);

	const liens = model.dmxBindings(diagram);
	const b = liens.find((x) => x.partId === 'Spot1');
	check(`${p.nom} : le projecteur écoute ${p.mcuPin}`, b?.mcuPin === p.mcuPin, JSON.stringify(liens));
	check(`${p.nom} : adresse 1, 3 canaux (rouge, vert, bleu)`,
		b?.address === 1 && b?.channels === 3, JSON.stringify(b));
	check(`${p.nom} : un seul projecteur trouvé`, liens.length === 1, `${liens.length} liaison(s)`);

	// Adresse posée dans l'inspecteur (attribut prm_address) : elle décale les
	// canaux lus. C'est le seul réglage du composant.
	const spot = diagram.parts.find((x) => x.id === 'Spot1');
	spot.attrs = { ...(spot.attrs ?? {}), prm_address: 100 };
	check(`${p.nom} : adresse 100 prise dans l'inspecteur`,
		model.dmxBindings(diagram).find((x) => x.partId === 'Spot1')?.address === 100,
		JSON.stringify(model.dmxBindings(diagram)));
	spot.attrs.prm_address = 9999;
	check(`${p.nom} : adresse hors bornes ramenée à 512`,
		model.dmxBindings(diagram).find((x) => x.partId === 'Spot1')?.address === 512);
	delete spot.attrs.prm_address;

	// Câble XLR débranché : plus de projecteur sur la ligne (le fil Data+ seul
	// ne suffit pas — les deux conducteurs doivent aboutir sur la même carte).
	const wires = diagram.wires;
	diagram.wires = wires.filter((wire) => JSON.stringify(wire).indexOf('"+"') < 0);
	check(`${p.nom} : XLR débranché → aucune liaison`, model.dmxBindings(diagram).length === 0,
		JSON.stringify(model.dmxBindings(diagram)));
	diagram.wires = wires;

	// Ligne SIG débranchée du micro : la carte Grove ne reçoit plus rien.
	diagram.wires = wires.filter((wire) => JSON.stringify(wire).indexOf('SIG') < 0);
	check(`${p.nom} : SIG débranché → aucune liaison`, model.dmxBindings(diagram).length === 0,
		JSON.stringify(model.dmxBindings(diagram)));
	diagram.wires = wires;
}

// --- 3. Rendu (Chrome headless, vrai dessin du spot) -------------------------
console.log('\n--- 3. Rendu : le groupe LED du projecteur prend la couleur ---');
const chrome = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) {
	console.log('Chrome introuvable — étape sautée.');
} else {
	const CACHE = join(ROOT, 'node_modules', '.cache-dmx');
	const spot = { ...(await lireKompix('spot')), kompixMeta: { origin: 'remote' } };
	const entry = `
import { Editor } from '../../src/webview/diagram/editor.mjs';
const SPOT = ${JSON.stringify(spot)};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: !!cond, detail: String(detail) });

async function run() {
	const editor = new Editor(document.getElementById('canvas'), document.getElementById('palette'),
		document.getElementById('wires'), document.getElementById('inspector'));
	editor.setCamera({ zoom: 1, panX: 0, panY: 0 });
	editor.loadCustomParts([SPOT]);
	await wait(120);
	const pose = editor.addPart('spot', 300, 300);
	await wait(150);

	const el = editor.elementOf(pose.id);
	ok('le projecteur posé expose setGroupColor', !!el && typeof el.setGroupColor === 'function',
		el ? el.tagName : 'aucun élément');
	if (!el || typeof el.setGroupColor !== 'function') return dump();

	const svg = el.shadowRoot.querySelector('svg');
	const groupe = svg && svg.querySelector('#LED');
	ok('le dessin du spot contient le groupe « LED »', !!groupe, svg ? 'groupe absent' : 'pas de svg');
	if (!groupe) return dump();

	const forme = groupe.querySelector('ellipse, path');
	const avant = getComputedStyle(forme).fill;
	ok('la forme est peinte d un dégradé (style inline)', avant.indexOf('url(') === 0, avant);

	el.setGroupColor('LED', 'rgb(255, 0, 0)', 1);
	await wait(30);
	ok('allumé : la forme passe au rouge', getComputedStyle(forme).fill === 'rgb(255, 0, 0)',
		getComputedStyle(forme).fill);
	ok('allumé : l opacité d origine (0,62) est écrasée', getComputedStyle(forme).opacity === '1',
		getComputedStyle(forme).opacity);
	ok('allumé : halo posé sur le groupe', (groupe.style.filter || '').indexOf('drop-shadow') === 0,
		groupe.style.filter);

	el.setGroupColor('LED', 'rgb(0, 0, 255)', 0.2);
	await wait(30);
	ok('couleur suivante : la forme passe au bleu', getComputedStyle(forme).fill === 'rgb(0, 0, 255)',
		getComputedStyle(forme).fill);

	el.setGroupColor('LED', null);
	await wait(30);
	ok('éteint : le dégradé d origine est restitué', getComputedStyle(forme).fill === avant,
		getComputedStyle(forme).fill);
	ok('éteint : plus de halo', !(groupe.style.filter || '').includes('drop-shadow'), groupe.style.filter);

	// Groupe inconnu : ne doit rien casser (composant sans zone lumineuse).
	let jete = null;
	try { el.setGroupColor('PAS-LA', 'rgb(1,2,3)'); } catch (e) { jete = e.message; }
	ok('groupe absent : pas d exception', jete === null, jete);
	dump();
}
function dump() {
	const out = document.createElement('pre');
	out.id = 'measures';
	out.textContent = JSON.stringify(checks);
	document.body.appendChild(out);
}
run().catch((e) => {
	checks.push({ name: 'exception : ' + (e && e.message), ok: false, detail: String(e && e.stack).slice(0, 300) });
	dump();
});
`;
	mkdirSync(CACHE, { recursive: true });
	writeFileSync(join(CACHE, 'e.mjs'), entry);
	const b = await esbuildBuild({
		entryPoints: [join(CACHE, 'e.mjs')], bundle: true, format: 'iife', write: false,
		loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' }, absWorkingDir: ROOT,
	});
	const css = readFileSync(join(ROOT, 'media', 'styles.css'), 'utf8');
	writeFileSync(join(CACHE, 'p.html'),
		`<!doctype html><meta charset=utf8><style>${css}</style><body style="margin:0">`
		+ '<div class="workshop"><aside id="palette" class="palette"></aside>'
		+ '<div id="canvas" class="canvas" style="width:1200px;height:900px"><svg id="wires" class="wires"></svg></div>'
		+ '<aside id="inspector" class="inspector"></aside></div>'
		+ `<script>${b.outputFiles[0].text}</script></body>`);
	const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
		'--virtual-time-budget=40000', '--dump-dom',
		`file:///${join(CACHE, 'p.html').replace(/\\/g, '/')}`],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const m = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
	if (!m) check('rendu : mesures relevées', false, 'aucun <pre id="measures">');
	else {
		const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
		for (const r of rows) check(r.name, r.ok, r.detail);
	}
}

// --- 4. Bout en bout : les vrais programmes de testkablix --------------------
// Les deux tests envoient rouge, vert, bleu sur les canaux 1-2-3, une couleur
// par seconde. Le moteur tourne dans ce processus : sa boucle ne rend la main
// que par intermittence, d'où la collecte AUSSI depuis onUpdate (sans elle, un
// simple setInterval rate des couleurs entières).
const ATTENDUES = ['255,0,0', '0,255,0', '0,0,255'];

async function boutEnBout(nom, engine, pin, limiteMs) {
	const vues = new Set();
	const releve = () => {
		const u = engine.readDmx(pin);
		if (u) vues.add(`${u[1]},${u[2]},${u[3]}`);
	};
	const suivant = engine.onUpdate;
	engine.onUpdate = () => { releve(); suivant?.(); };
	const t0 = Date.now();
	engine.start();
	await new Promise((resolve) => {
		const timer = setInterval(() => {
			releve();
			if (ATTENDUES.every((c) => vues.has(c)) || Date.now() - t0 > limiteMs) {
				clearInterval(timer);
				engine.dispose();
				resolve();
			}
		}, 20);
	});
	console.log(`  ${nom} : ${[...vues].join(' | ') || 'aucune couleur'} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
	for (const c of ATTENDUES) check(`${nom} : couleur ${c} reçue sur les canaux 1-2-3`, vues.has(c));
	check(`${nom} : rien d'autre que les trois couleurs (hors univers vierge)`,
		[...vues].every((c) => c === '0,0,0' || ATTENDUES.includes(c)), [...vues].join(' | '));
}

console.log('\n--- 4. Bout en bout Pico : dmx-pico.py → UART0 → univers ---');
const fw = join(ROOT, 'test-assets', 'RPI_PICO-20230426-v1.20.0.uf2');
if (QUICK) {
	console.log('--quick : étape sautée.');
} else if (!existsSync(fw)) {
	console.log('Firmware absent — étape sautée.');
} else {
	const { parseUf2 } = await bundle("export * from './src/shared/uf2.ts';\n", 'uf2.mjs');
	const { PicoEngine } = await bundle("export * from './src/webview/engines/pico.mts';\n", 'pico.mjs');
	const segments = parseUf2(new Uint8Array(readFileSync(fw))).map((s) => ({ addr: s.addr, data: s.data }));
	const script = readFileSync(join(ROOT, 'testkablix', 'dmx-pico.py'), 'utf8');
	const engine = new PicoEngine({ kind: 'flash', segments, script });
	engine.setDmx(['GP0']);
	// Les 513 octets de la trame ne doivent PAS remonter au moniteur série : la
	// console de l'élève afficherait 513 caractères de contrôle par seconde.
	let serial = '';
	engine.onSerial = (chunk) => { serial += chunk; };
	await boutEnBout('pico', engine, 'GP0', 120_000);
	check('pico : le moniteur série ne reçoit pas la trame binaire',
		!/[ -�]/.test(serial), JSON.stringify(serial.slice(0, 60)));
	check('pico : les messages du programme arrivent quand même',
		serial.includes('Couleur'), JSON.stringify(serial.slice(-60)));
}

console.log('\n--- 5. Bout en bout uno : dmx-uno.ino → USART0 → univers ---');
const ino = join(ROOT, 'testkablix', 'Arduino', 'dmx-uno', 'dmx-uno.ino');
if (QUICK) {
	console.log('--quick : étape sautée.');
} else {
	const { compile, detectToolchain } = await bundle("export * from './src/compiler.ts';\n", 'compiler.mjs');
	if (!detectToolchain().arduinoCli) {
		console.log('arduino-cli absent — étape sautée.');
	} else {
		// La compilation d'un sketch coûte une bonne minute : le résultat est
		// gardé sous la clé du source, le banc se relance alors en quelques secondes.
		const CACHE = join(ROOT, 'node_modules', '.cache-dmx');
		mkdirSync(CACHE, { recursive: true });
		const cle = createHash('sha1').update(readFileSync(ino)).digest('hex').slice(0, 12);
		const hexFile = join(CACHE, `dmx-uno-${cle}.json`);
		let mots;
		if (existsSync(hexFile)) {
			mots = JSON.parse(readFileSync(hexFile, 'utf8'));
		} else {
			console.log('  compilation du sketch (une minute environ)…');
			const res = await compile('uno', ino, ROOT);
			mots = Array.from(res.payload.bytes);
			writeFileSync(hexFile, JSON.stringify(mots));
		}
		const { AvrEngine } = await bundle("export * from './src/webview/engines/avr.mts';\n", 'avr.mjs');
		const engine = new AvrEngine(Uint16Array.from(mots), null, 'avr328');
		engine.setDmx(['1']);
		let serial = '';
		engine.onSerial = (chunk) => { serial += chunk; };
		await boutEnBout('uno', engine, '1', 120_000);
		check('uno : le moniteur série ne reçoit pas la trame binaire',
			serial === '', JSON.stringify(serial.slice(0, 60)));
	}
}

console.log(fail
	? `\nDMX512 : ${fail} échec(s) sur ${total} contrôles.`
	: `\nDMX512 : ${total} contrôles OK — la ligne se décode et le projecteur s'allume.`);
process.exit(fail ? 1 : 0);
