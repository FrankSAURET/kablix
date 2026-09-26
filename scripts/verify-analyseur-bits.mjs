// Vérifie l'affichage binaire de l'analyseur (v2026.9.5.150). Frank : « Rajoute
// un affichage binaire. S'il est sélectionné, les bits s'affichent en dessous du
// signal en étant synchronisé avec et un marqueur sépare chaque bit ».
//
// VOLET A — le décodage (Node). Les six décodeurs, réglage `bits` posé : chaque
// bit lu sort en annotation `bit`, `0`/`1`, dans SA cellule sur le fil (UART et
// DMX : la durée du bit ; I²C et SPI : d'un front d'horloge opposé au suivant ;
// 1-Wire : le slot ; DHT : du creux au creux suivant). Les octets et repères
// descendent d'une ligne, et la piste en réserve une de plus. Sans le réglage,
// rien ne change.
//
// VOLET B — l'onglet (Chrome headless, CDP brut). Vraie page, vrai bundle. La
// case « Bits » se coche à la VRAIE souris (bouton du bus dessiné sur la piste,
// puis la case du panneau) : le réglage part vers l'hôte, la piste grandit, les
// chiffres s'écrivent sous le créneau, centrés dans leur cellule, et un trait
// pointillé part du créneau à chaque bord de bit, pile sur les fronts.
//
// Contre-épreuve sans toucher aux sources : `--ancien` compile
// analyseur-decodage, analyseur-vue et analyseur dans leur version HEAD
// (`--ancien=a,b` pour n'en prendre que certains). Le banc DOIT échouer.
//
// Usage : node scripts/verify-analyseur-bits.mjs [--ancien[=a,b]] [--image=<dossier>]
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-bits-'));
const PORT = 9421;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const argAncien = process.argv.find((a) => a === '--ancien' || a.startsWith('--ancien='));
const ancien = !argAncien
	? []
	: argAncien === '--ancien'
		? ['analyseur-decodage', 'analyseur-vue', 'analyseur']
		: argAncien.slice('--ancien='.length).split(',').filter(Boolean);

let echecs = 0;
let controles = 0;
// Chien de garde : un Chrome muet ne doit pas figer `verify:all`.
let etape = 'démarrage';
setTimeout(() => {
	console.log(`  ❌ banc figé (étape : ${etape})`);
	process.exit(1);
}, 90_000).unref();
/** Un contrôle ; `ok` peut être une fonction, dont une exception devient un échec nommé. */
const check = (nom, ok, detail = '') => {
	controles++;
	let vrai = ok;
	let pourquoi = detail;
	if (typeof ok === 'function') {
		try { vrai = ok(); } catch (e) { vrai = false; pourquoi = `exception : ${e?.message ?? e}`; }
	}
	if (vrai) console.log(`  ✅ ${nom}`);
	else {
		echecs++;
		console.log(`  ❌ ${nom}${pourquoi ? ` — ${typeof pourquoi === 'function' ? pourquoi() : pourquoi}` : ''}`);
	}
};

/** Remplace à la compilation les fichiers de `--ancien` par leur version HEAD. */
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /src[\\/]webview[\\/][^\\/]+\.mts$/ }, (args) => {
			const nom = args.path.replace(/\\/g, '/').split('/').pop().replace(/\.mts$/, '');
			if (!ancien.includes(nom)) return undefined;
			const contents = execFileSync('git', ['show', `HEAD:src/webview/${nom}.mts`], { cwd: ROOT, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
if (ancien.length) console.log(`(contre-épreuve : ${ancien.join(', ')} en version HEAD)`);

// --- Signaux fabriqués --------------------------------------------------------

/**
 * Fronts d'une ligne décrite par ses paliers successifs `[niveau, durée]`, à
 * partir de `t0`, ligne haute avant. Deux paliers de même niveau se fondent.
 */
const paliers = (t0, liste) => {
	const f = [];
	let n = 1;
	let t = t0;
	for (const [v, d] of liste) {
		if (v !== n) f.push({ t, niveau: v });
		n = v;
		t += d;
	}
	return f;
};
/** Paliers d'une suite de bits de durée `b`. */
const bitsEnPaliers = (bits, b) => bits.map((v) => [v, b]);
/** Bits LSB d'abord d'un octet. */
const lsb = (n, nb = 8) => Array.from({ length: nb }, (_, k) => (n >> k) & 1);
/** Bits MSB d'abord d'un octet. */
const msb = (n) => Array.from({ length: 8 }, (_, k) => (n >> (7 - k)) & 1);
/** Caractère UART : start, données LSB d'abord, parité éventuelle, stops. */
const caractere = (n, { parite = null, stops = 1 } = {}) => {
	const d = lsb(n);
	const p = parite === null ? [] : [parite === 'even' ? d.filter(Boolean).length % 2 : 1 - (d.filter(Boolean).length % 2)];
	return [0, ...d, ...p, ...Array(stops).fill(1)];
};
/** Fronts d'une ligne décrite par des événements `[t, niveau]` (ligne haute avant). */
const evenements = (liste, avant = 1) => {
	const f = [];
	let n = avant;
	for (const [t, v] of [...liste].sort((a, b) => a[0] - b[0])) {
		if (v === n) continue;
		f.push({ t, niveau: v });
		n = v;
	}
	return f;
};
const voieDe = (voie, fronts, niveauInitial = 1) => ({ voie, pin: `P${voie}`, nom: `V${voie}`, fronts, niveauInitial });
const EPS = 1e-9;
const proche = (a, b, e = EPS) => Math.abs(a - b) <= e;

// === VOLET A : le décodage ====================================================
console.log('Volet A — décodage, réglage « bits »');
const dec = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur-decodage.mts')],
	outfile: join(tmp, 'decodage.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	plugins: [versionHead],
});
void dec;
const { decoder, lignesSousVoie } = await import(pathToFileURL(join(tmp, 'decodage.mjs')).href);
const bitsDe = (annots) => annots.filter((a) => a.bit);
const chiffres = (annots) => bitsDe(annots).map((a) => a.texte).join('');

// --- UART 8N1 : « A » (0x41) ---
{
	const b = 1000 / 9600;
	const T0 = 1;
	const v = voieDe(0, paliers(T0, bitsEnPaliers(caractere(0x41), b)));
	const r = { protocole: 'uart', donnees: 0, bauds: 9600 };
	const sans = decoder([v], r);
	const avec = decoder([v], { ...r, bits: true });
	check('UART sans le réglage : aucun bit, aucune ligne déplacée', () => bitsDe(sans).length === 0 && sans.every((a) => a.ligne === undefined),
		() => JSON.stringify(sans));
	check('UART 8N1 « A » : start 0, données LSB d\'abord 10000010, stop 1', () => chiffres(avec) === '0100000101', () => chiffres(avec));
	check('UART : natures start, 8 × donnée, stop', () => bitsDe(avec).map((a) => a.nature).join(',') === ['start', ...Array(8).fill('donnee'), 'stop'].join(','),
		() => bitsDe(avec).map((a) => a.nature).join(','));
	check('UART : chaque bit dans sa cellule [t0 + k·b, t0 + (k+1)·b]', () => bitsDe(avec).every((a, k) => proche(a.t0, T0 + k * b) && proche(a.t1, T0 + (k + 1) * b)),
		() => bitsDe(avec).map((a) => `[${a.t0.toFixed(4)} ${a.t1.toFixed(4)}]`).join(' '));
	check('UART : bits sur la ligne 0 (sous le créneau), Start / octet / STOP descendus en ligne 1',
		() => bitsDe(avec).every((a) => (a.ligne ?? 0) === 0) && avec.filter((a) => !a.bit).map((a) => `${a.texte}@${a.ligne}`).join(' | ') === "Start@1 | 0x41 'A'@1 | STOP@1",
		() => avec.filter((a) => !a.bit).map((a) => `${a.texte}@${a.ligne}`).join(' | '));
	check('UART : les bits partent sous la voie de données, comme les octets', () => bitsDe(avec).every((a) => a.voie === 0));
}

// --- UART 8O2 : parité et deux bits d'arrêt, deux caractères collés ---
{
	const b = 1000 / 9600;
	const T0 = 2;
	const fmt = { parite: 'odd', stops: 2 };
	const v = voieDe(0, paliers(T0, bitsEnPaliers([...caractere(0x41, fmt), ...caractere(0x42, fmt)], b)));
	const avec = decoder([v], { protocole: 'uart', donnees: 0, bauds: 9600, bitsDonnees: 8, parite: 'odd', bitsArret: 2, bits: true });
	const attendu = [...caractere(0x41, fmt), ...caractere(0x42, fmt)].join('');
	check('UART 8O2 « AB » collés : 2 × 12 bits, parité et deux stops compris', () => chiffres(avec) === attendu, () => `${chiffres(avec)} au lieu de ${attendu}`);
	const n = bitsDe(avec).map((a) => a.nature);
	check('UART 8O2 : la parité en contrôle, les deux derniers bits en stop', () => n[9] === 'controle' && n[10] === 'stop' && n[11] === 'stop' && n[21] === 'controle' && n[23] === 'stop', () => n.join(','));
	check('UART 8O2 : le 2e caractère commence où finit le 1er (cellules bord à bord)', () => bitsDe(avec).every((a, k, l) => k === 0 || proche(l[k - 1].t1, a.t0)));
}

// --- DMX : BREAK, MAB, START code, deux canaux, 8N2 ; puis un émetteur à un stop ---
{
	const b = 0.004;
	const T0 = 0.01;
	const slot = (n, stops = 2) => [0, ...lsb(n), ...Array(stops).fill(1)];
	const trame = [[0, 0.1], [1, 0.012], ...bitsEnPaliers([...slot(0x00), ...slot(0xc8), ...slot(0x05)], b)];
	const v = voieDe(0, paliers(T0, trame));
	const avec = decoder([v], { protocole: 'dmx', donnees: 0, bits: true });
	const attendu = [...slot(0x00), ...slot(0xc8), ...slot(0x05)].join('');
	check('DMX 8N2 : START code 0x00, c1 = 0xC8, c2 = 0x05 — 3 × 11 bits, rien dans le BREAK ni le MAB',
		() => chiffres(avec) === attendu && proche(bitsDe(avec)[0].t0, T0 + 0.112), () => `${chiffres(avec)} au lieu de ${attendu}`);
	check('DMX : start, 8 × donnée, 2 × stop par créneau', () => bitsDe(avec).slice(11, 22).map((a) => a.nature).join(',') === ['start', ...Array(8).fill('donnee'), 'stop', 'stop'].join(','));
	check('DMX : les valeurs lisibles en ligne 1 (c1=0xC8), les bits en ligne 0',
		() => avec.some((a) => a.texte === 'c1=0xC8' && a.ligne === 1) && bitsDe(avec).every((a) => (a.ligne ?? 0) === 0));
	const un = voieDe(0, paliers(T0, [[0, 0.1], [1, 0.012], ...bitsEnPaliers([...slot(0x00, 1), ...slot(0x81, 1)], b)]));
	const avecUn = decoder([un], { protocole: 'dmx', donnees: 0, bits: true });
	check('DMX à un seul bit d\'arrêt : 10 bits par créneau, pas de 2e stop inventé',
		() => chiffres(avecUn).startsWith([...slot(0x00, 1)].join('') + [...slot(0x81, 1)].join('')) && proche(bitsDe(avecUn)[10].t0, T0 + 0.112 + 10 * b),
		() => chiffres(avecUn));
}

// --- I²C : START, adresse 0x3C en écriture, ACK, STOP ---
{
	const T = 0.01;
	const D = 0.015;
	const bits = [...msb(0x78), 0];
	const scl = [[0, 1]];
	const sda = [[0.01, 0]]; // START : SDA tombe horloge haute
	for (let k = 0; k < 9; k++) {
		scl.push([D + k * T, 0], [D + k * T + T / 2, 1]);
		sda.push([D + k * T + T / 4, bits[k]]);
	}
	scl.push([D + 9 * T, 0], [D + 9 * T + T / 2, 1]);
	sda.push([D + 9 * T + T / 4, 0], [D + 9 * T + (3 * T) / 4, 1]); // STOP
	const voies = [voieDe(0, evenements(scl)), voieDe(1, evenements(sda))];
	const avec = decoder(voies, { protocole: 'i2c', horloge: 0, donnees: 1, bits: true });
	check('I²C : adresse 0x3C W MSB d\'abord 01111000, puis ACK 0', () => chiffres(avec) === '011110000', () => chiffres(avec));
	check('I²C : huit données puis l\'ACK en contrôle', () => bitsDe(avec).map((a) => a.nature).join(',') === [...Array(8).fill('donnee'), 'controle'].join(','));
	// La norme fait remonter SCL, SDA basse, avant de relâcher SDA : cette
	// impulsion n'est ni un bit ni un octet commencé.
	check('I²C : l\'impulsion d\'horloge du STOP n\'est ni un bit affiché ni un « octet tronqué »',
		() => !avec.some((a) => a.nature === 'erreur') && bitsDe(avec).length === 9,
		() => avec.map((a) => a.texte).join(' | '));
	check('I²C : chaque bit d\'un front descendant de SCL au suivant, cellules bord à bord',
		() => bitsDe(avec).every((a, k) => proche(a.t0, D + k * T) && proche(a.t1, D + (k + 1) * T)),
		() => bitsDe(avec).map((a) => `[${a.t0.toFixed(4)} ${a.t1.toFixed(4)}]`).join(' '));
	check('I²C : les bits sous SDA (voie de données), START et STOP en ligne 1',
		() => bitsDe(avec).every((a) => a.voie === 1) && avec.filter((a) => a.texte === 'START' || a.texte === 'STOP').every((a) => a.ligne === 1));
}

// --- SPI mode 0 : CS, 0xA5 sur MOSI ---
{
	const T = 0.004;
	const D = 0.012;
	const sck = [];
	const mosi = [];
	msb(0xa5).forEach((v, k) => {
		mosi.push([D + k * T, v]);
		sck.push([D + k * T + T / 2, 1], [D + (k + 1) * T, 0]);
	});
	const cs = [[0.01, 0], [D + 8 * T + 0.002, 1]];
	const voies = [voieDe(0, evenements(sck, 0), 0), voieDe(1, evenements(mosi, 0), 0), voieDe(2, evenements(cs))];
	const avec = decoder(voies, { protocole: 'spi', horloge: 0, donnees: 1, selection: 2, mode: 0, bits: true });
	check('SPI mode 0 : MOSI 0xA5 MSB d\'abord 10100101', () => chiffres(avec) === '10100101', () => chiffres(avec));
	check('SPI : chaque bit d\'un front descendant de SCK au suivant (le 1er, sans front avant, en demi-période symétrique)',
		() => bitsDe(avec).every((a, k) => proche(a.t0, D + k * T) && proche(a.t1, D + (k + 1) * T)),
		() => bitsDe(avec).map((a) => `[${a.t0.toFixed(4)} ${a.t1.toFixed(4)}]`).join(' '));
}

// --- 1-Wire : RESET puis SKIP ROM (0xCC) ---
{
	const us = 0.001;
	const liste = [[1, 10 * us], [0, 500 * us], [1, 100 * us]];
	for (const v of lsb(0xcc)) liste.push(...(v ? [[0, 6 * us], [1, 64 * us]] : [[0, 60 * us], [1, 10 * us]]));
	const avec = decoder([voieDe(0, paliers(0, liste))], { protocole: 'onewire', donnees: 0, bits: true });
	check('1-Wire : SKIP ROM 0xCC LSB d\'abord 00110011', () => chiffres(avec) === '00110011', () => chiffres(avec));
	const debut = 610 * us;
	check('1-Wire : chaque bit sur son slot de 60 µs, à partir de son creux',
		() => bitsDe(avec).every((a, k) => proche(a.t0, debut + k * 70 * us, 1e-7) && proche(a.t1 - a.t0, 60 * us, 1e-7)),
		() => bitsDe(avec).map((a) => `[${(a.t0 / us).toFixed(1)} ${(a.t1 / us).toFixed(1)}]`).join(' '));
	check('1-Wire : RESET et octet descendus en ligne 1', () => avec.filter((a) => !a.bit).every((a) => a.ligne === 1));
}

// --- DHT11 : trame de l'encodeur du MOTEUR ---
{
	await esbuild.build({
		entryPoints: [join(ROOT, 'src/webview/engines/dht22.mts')],
		outfile: join(tmp, 'dht22.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	});
	const { buildDht22Schedule } = await import(pathToFileURL(join(tmp, 'dht22.mjs')).href);
	const f = [{ t: 1, niveau: 0 }, { t: 19, niveau: 1 }];
	for (const e of buildDht22Schedule(22, 50, 0, 1, 'dht11')) {
		const n = e.value ? 1 : 0;
		if (n !== f[f.length - 1].niveau) f.push({ t: 19.03 + e.cycle / 1000, niveau: n });
	}
	const avec = decoder([voieDe(0, f)], { protocole: 'dht', donnees: 0, modele: 'dht11', bits: true });
	const octets = [0x32, 0x00, 0x16, 0x00, 0x48].map(msb).flat().join('');
	check('DHT11 50 %HR 22 °C : les 40 bits, MSB d\'abord (32 00 16 00 48)', () => chiffres(avec) === octets, () => chiffres(avec));
	check('DHT : chaque bit de son creux au creux suivant (cellules bord à bord)', () => bitsDe(avec).every((a, k, l) => k === 0 || proche(l[k - 1].t1, a.t0)) && bitsDe(avec).every((a) => a.t1 > a.t0));
	check('DHT : octets descendus en ligne 1, valeurs en ligne 2',
		() => avec.some((a) => a.texte === '0x32' && a.ligne === 1) && avec.some((a) => /°C/.test(a.texte) && !a.resume && a.ligne === 2));
}

// --- Lignes réservées sous la piste ---
check('lignes sous la piste : UART 1, UART + bits 2, DHT + bits 3, bits d\'un décodage posé ailleurs sans effet',
	() => lignesSousVoie([{ protocole: 'uart', donnees: 0 }], 0) === 1
		&& lignesSousVoie([{ protocole: 'uart', donnees: 0, bits: true }], 0) === 2
		&& lignesSousVoie([{ protocole: 'dht', donnees: 0, bits: true }], 0) === 3
		&& lignesSousVoie([{ protocole: 'uart', donnees: 1, bits: true }], 0) === 1);

// === VOLET B : l'onglet =======================================================
console.log('Volet B — onglet de l\'analyseur, case « Bits » à la vraie souris');
const STUB = `
export const Uri = { joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/'), toString() { return this.fsPath; } }) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const env = { language: 'en' };
export const window = {}; export const ViewColumn = {};
export default { Uri, l10n, env, window, ViewColumn };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
await esbuild.build({
	entryPoints: [join(ROOT, 'src/analyseur-panel.ts')],
	outfile: join(tmp, 'analyseur-panel.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { AnalyseurPanel } = await import(pathToFileURL(join(tmp, 'analyseur-panel.mjs')).href);
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Relevé du dessin : textes écrits, cases translucides, et chemins tracés avec
// leur pointillé (les séparateurs de bits sont les seuls en [2, 2]).
const ESPION = `
window.__msgs = [];
window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(JSON.parse(JSON.stringify(m))); }, setState() {} });
window.__textes = []; window.__cases = []; window.__traits = [];
const P = CanvasRenderingContext2D.prototype;
const fillText = P.fillText, fillRect = P.fillRect, moveTo = P.moveTo, lineTo = P.lineTo;
P.fillText = function (t, x, y, ...r) {
	window.__textes.push({ t: String(t), x, y, align: this.textAlign, w: this.measureText(String(t)).width });
	return fillText.call(this, t, x, y, ...r);
};
P.fillRect = function (x, y, w, h) {
	if (this.globalAlpha < 0.5) window.__cases.push({ x, y, w, h });
	return fillRect.call(this, x, y, w, h);
};
P.moveTo = function (x, y) {
	window.__traits.push({ q: 'm', x, y, tiret: this.getLineDash().join(',') });
	return moveTo.call(this, x, y);
};
P.lineTo = function (x, y) {
	if (this.getLineDash().join(',') === '2,2') window.__traits.push({ q: 'l', x, y, tiret: '2,2' });
	return lineTo.call(this, x, y);
};`;
const html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/banc.projix');
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const fichier = join(tmp, 'onglet.html');
writeFileSync(fichier, html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`));

// « A », « B » puis « U » à 9600 bauds, 8N1 : deux caractères entiers à l'écran
// et un troisième pour que le cadrage « toute la capture » ne coupe pas le
// stop du deuxième.
const B = 1000 / 9600;
const T_A = 1;
const CARS = [[0x41, T_A], [0x42, T_A + 12 * B], [0x55, T_A + 24 * B]];
const liste = [];
let tCourant = T_A;
for (const [n, t] of CARS) {
	if (t > tCourant) liste.push([1, t - tCourant]);
	liste.push(...bitsEnPaliers(caractere(n), B));
	tCourant = t + 10 * B;
}
const FRONTS = paliers(T_A, liste);
const FRONTS_PLATS = FRONTS.flatMap(({ t, niveau }) => [t, niveau]);
const T_DEBUT = FRONTS[0].t;
const T_FIN = FRONTS[FRONTS.length - 1].t;

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => p && existsSync(p));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,700',
	`file:///${fichier.replace(/\\/g, '/')}`], { stdio: 'ignore' });
let ws;
try {
	etape = 'connexion à Chrome';
	let listeCibles = null;
	// 30 s : sous verify:all, sept bancs en parallèle, Chrome met parfois plus de 10 s à ouvrir son port.
	for (let i = 0; i < 120 && !listeCibles; i++) {
		try { listeCibles = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await attendre(250); }
	}
	ws = new WebSocket(listeCibles.find((c) => c.type === 'page').webSocketDebuggerUrl);
	let id = 0;
	const attentes = new Map();
	ws.addEventListener('message', (e) => {
		const m = JSON.parse(e.data);
		if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
	});
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	const cdp = (method, params = {}) => new Promise((res) => { const n = ++id; attentes.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
	const ev = async (expr) => {
		const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
		return r.result?.result?.value;
	};
	etape = 'page prête';
	for (let i = 0; i < 120 && !(await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`).catch(() => false)); i++) await attendre(250);
	etape = 'restauration de la capture';

	const etat = {
		voies: [{ voie: 0, nom: 'TX', pin: 'D1', fronts: FRONTS_PLATS, niveauInitial: 1 }],
		decodages: [{ protocole: 'uart', id: 'd1', donnees: 0, bauds: 9600 }],
	};
	await ev(`window.postMessage(${JSON.stringify({ type: 'restaure', etat })}, '*')`);
	await attendre(200);

	/** Rendu forcé, puis tout ce qu'il a dessiné. */
	const releve = async () => {
		await ev(`window.__textes = []; window.__cases = []; window.__traits = []`);
		await ev(`window.postMessage({ type: 'repeindre' }, '*')`);
		await attendre(80);
		return { textes: await ev('window.__textes'), cases: await ev('window.__cases'), traits: await ev('window.__traits') };
	};
	const trace = async () => ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`);
	const clic = async (x, y) => {
		const p = { x: Math.round(x), y: Math.round(y) };
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(80);
	};
	// Géométrie de analyseur-vue.mts : barre de temps 62, piste 46, créneau 22,
	// ligne de décodage 18, marges 104 / 12.
	const REGLE_H = 62, PISTE_H = 46, CRENEAU_H = 22, ANNOT_H = 18, MARGE_G = 104, MARGE_D = 12;
	const yTexte = (ligne) => REGLE_H + PISTE_H + 1 + ligne * ANNOT_H + (ANNOT_H - 3) / 2;
	const surLigne = (rel, ligne) => rel.textes.filter((x) => Math.abs(x.y - yTexte(ligne)) < 0.6).sort((a, b) => a.x - b.x);
	const uart = (rel) => rel.textes.find((x) => x.t === 'UART');
	const reglages = async () => (await ev('window.__msgs')).filter((m) => m.type === 'analyseurReglages').pop();

	etape = 'relevé avant la case';
	const avant = await releve();
	const r0 = await trace();
	check('témoin : la trame UART est décodée sous la piste (« 0x41 \'A\' » en ligne 0)', () => surLigne(avant, 0).some((x) => x.t === "0x41 'A'"),
		() => surLigne(avant, 0).map((x) => x.t).join(' | '));
	check('sans la case : une seule ligne sous la piste (canvas de 114 px), aucun séparateur de bit',
		() => Math.round(r0.h) === REGLE_H + PISTE_H + ANNOT_H + 8 && !avant.traits.some((p) => p.tiret === '2,2'), () => `hauteur ${r0.h}`);

	// Vraie souris : le bouton du bus (« UART » écrit sur la piste), puis la case.
	etape = 'clics souris';
	const bouton = uart(avant);
	check('témoin : le bouton du bus est dessiné (« UART »)', () => !!bouton);
	if (bouton) await clic(r0.left + bouton.x, r0.top + bouton.y);
	const caseBits = await ev(`(() => {
		const l = [...document.querySelectorAll('.flottant label')].find((x) => x.textContent.trim() === 'Bits');
		const c = l?.querySelector('input[type=checkbox]');
		if (!c) return null;
		const r = c.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, coche: c.checked };
	})()`);
	check('le panneau du décodage montre une case « Bits », décochée par défaut', () => caseBits !== null && caseBits.coche === false, () => JSON.stringify(caseBits));
	if (caseBits) await clic(caseBits.x, caseBits.y);
	const regl = await reglages();
	check('case cochée à la souris : le réglage part vers l\'hôte avec bits: true (le .projix le garde)',
		() => regl?.decodages?.[0]?.bits === true, () => JSON.stringify(regl?.decodages));

	etape = 'relevé case cochée';
	const apres = await releve();
	const r1 = await trace();
	check('la piste réserve une ligne de plus (canvas de 152 px)', () => Math.round(r1.h) === REGLE_H + PISTE_H + 2 * ANNOT_H + 8, () => `hauteur ${r1.h}`);
	// Cadrage « toute la capture » : 1 % de marge de chaque côté (`ajuster()`).
	const etendue = T_FIN - T_DEBUT;
	const f0 = { t0: T_DEBUT - etendue * 0.01, duree: etendue * 1.02 };
	const plot = r1.w - MARGE_G - MARGE_D;
	const xDe = (t) => MARGE_G + ((t - f0.t0) / f0.duree) * plot;
	const attendus = [];
	for (const [n, t] of CARS.slice(0, 2)) caractere(n).forEach((v, k) => attendus.push({ v: String(v), t0: t + k * B, t1: t + (k + 1) * B }));
	const ligne0 = surLigne(apres, 0);
	const lus = ligne0.slice(0, attendus.length);
	check('« A » puis « B » : les 20 bits écrits sous le créneau (ligne 0), dans l\'ordre du fil',
		() => lus.map((x) => x.t).join('') === attendus.map((a) => a.v).join(''), () => ligne0.map((x) => x.t).join(''));
	check('chaque chiffre centré dans SA cellule de bit (à 1 px près)',
		() => lus.length === attendus.length && lus.every((x, k) => x.align === 'center' && Math.abs(x.x - (xDe(attendus[k].t0) + xDe(attendus[k].t1)) / 2) < 1),
		() => lus.map((x, k) => `${x.x.toFixed(1)}/${((xDe(attendus[k]?.t0) + xDe(attendus[k]?.t1)) / 2).toFixed(1)}`).join(' '));
	check('octets et repères descendus en ligne 1 (« 0x41 \'A\' », « 0x42 \'B\' »)',
		() => surLigne(apres, 1).some((x) => x.t === "0x41 'A'") && surLigne(apres, 1).some((x) => x.t === "0x42 'B'"),
		() => surLigne(apres, 1).map((x) => x.t).join(' | '));
	const yHaut = REGLE_H + (PISTE_H - CRENEAU_H) / 2;
	const yBasBits = REGLE_H + PISTE_H + 1 + ANNOT_H - 3;
	const departs = apres.traits.filter((p) => p.q === 'm' && p.tiret === '2,2');
	const arrivees = apres.traits.filter((p) => p.q === 'l' && p.tiret === '2,2');
	check('séparateurs : traits pointillés du haut du créneau au bas de la ligne des bits',
		() => departs.length > 0 && departs.every((p) => proche(p.y, yHaut, 0.01)) && arrivees.length === departs.length && arrivees.every((p) => proche(p.y, yBasBits, 0.01)),
		() => `${departs.length} départs, y ${[...new Set(departs.map((p) => p.y))].join(',')} → ${[...new Set(arrivees.map((p) => p.y))].join(',')}`);
	const bords = [...new Set(attendus.flatMap((a) => [a.t0, a.t1]).map((t) => Math.round(xDe(t))))];
	check(`un séparateur à chacun des ${bords.length} bords de bit de « A » et « B », un seul par bord`,
		() => bords.every((x) => departs.filter((p) => Math.abs(p.x - (x + 0.5)) < 1.01).length === 1),
		() => bords.filter((x) => departs.filter((p) => Math.abs(p.x - (x + 0.5)) < 1.01).length !== 1).join(','));
	// Synchronisés avec le signal : chaque front du créneau tombe sur un séparateur.
	const frontsVisibles = FRONTS.filter((f) => f.t <= CARS[1][1] + 10 * B);
	check('synchronisés : chaque front de « A » et « B » tombe sur un séparateur (à 1 px près)',
		() => frontsVisibles.every((f) => departs.some((p) => Math.abs(p.x - xDe(f.t)) < 1.01)),
		() => frontsVisibles.filter((f) => !departs.some((p) => Math.abs(p.x - xDe(f.t)) < 1.01)).map((f) => xDe(f.t).toFixed(1)).join(','));
	const dossierImage = process.argv.find((a) => a.startsWith('--image='))?.slice('--image='.length);
	if (dossierImage) {
		const png = await cdp('Page.captureScreenshot', { format: 'png' });
		writeFileSync(join(dossierImage, 'bits-uart.png'), Buffer.from(png.result.data, 'base64'));
	}

	// Changer de bus garde la case : c'est une façon de lire, pas un rôle.
	etape = 'changement de bus';
	await ev(`(() => { const s = [...document.querySelectorAll('.flottant label')].find((x) => x.textContent.startsWith('Bus'))?.querySelector('select'); s.value = 'dmx'; s.dispatchEvent(new Event('change')); })()`);
	await attendre(80);
	const reglDmx = await reglages();
	check('changer de bus (UART → DMX) garde l\'affichage binaire', () => reglDmx?.decodages?.[0]?.protocole === 'dmx' && reglDmx.decodages[0].bits === true,
		() => JSON.stringify(reglDmx?.decodages));
	await ev(`(() => { const s = [...document.querySelectorAll('.flottant label')].find((x) => x.textContent.startsWith('Bus'))?.querySelector('select'); s.value = 'uart'; s.dispatchEvent(new Event('change')); })()`);
	await attendre(80);

	// Décocher à la souris : plus de bits, plus de ligne, rien d'écrit dans le projet.
	const caseBis = await ev(`(() => {
		const c = [...document.querySelectorAll('.flottant label')].find((x) => x.textContent.trim() === 'Bits')?.querySelector('input[type=checkbox]');
		if (!c) return null;
		const r = c.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, coche: c.checked };
	})()`);
	check('le panneau refait après le changement de bus montre la case toujours cochée', () => caseBis?.coche === true, () => JSON.stringify(caseBis));
	if (caseBis) await clic(caseBis.x, caseBis.y);
	const reglOff = await reglages();
	const fin = await releve();
	const r2 = await trace();
	check('case décochée : le réglage n\'écrit plus rien (pas de bits: false dans le projet)',
		() => reglOff?.decodages?.[0] && !('bits' in reglOff.decodages[0]), () => JSON.stringify(reglOff?.decodages));
	check('case décochée : la piste reprend sa hauteur, les séparateurs disparaissent',
		() => Math.round(r2.h) === REGLE_H + PISTE_H + ANNOT_H + 8 && !fin.traits.some((p) => p.tiret === '2,2'), () => `hauteur ${r2.h}`);
} catch (e) {
	echecs++;
	console.log('  ❌ ÉCHEC', e?.stack ?? e);
} finally {
	try { ws?.close(); } catch { /* */ }
	proc.kill();
	await attendre(300);
	try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
}
// Un banc qui s'arrête tôt paraît vert : on exige le compte complet.
const MIN = 38;
if (controles < MIN) {
	echecs++;
	console.log(`  ❌ ${controles} contrôles joués, ${MIN} attendus`);
}
console.log(echecs === 0 ? `\nTout est vert (${controles} contrôles).` : `\n${echecs} échec(s) sur ${controles} contrôles.`);
process.exit(echecs === 0 ? 0 : 1);
