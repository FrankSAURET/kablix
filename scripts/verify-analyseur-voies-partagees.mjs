// Vérifie trois demandes de Frank sur l'analyseur (v2026.9.5.151) :
//  - DMX (dmx-uno-lib, 25/09) : « Dmx+ affiche le signal mais dmx- et sig
//    n'affichent rien. Je veux le signal sur sig et dmx+ et le signal inversé
//    sur dmx- » ;
//  - « Dans la marge tu affiches la valeur des tensions de l'état haut et
//    l'état bas avec 1 chiffre après la virgule (mais pas le 0) ».
//
// VOLET A — le modèle (Node), sur le VRAI schéma de dmx-uno-lib : ses trois
// pinces (SIG, +, -) remontent toutes à la broche 3 ; avec le manifeste publié
// de la carte (`probeInverted: ["-"]`), seule la pince du `-` est inversée.
// Deux reflets inversants à la suite se compensent.
//
// VOLET B — la capture et le format (Node) : trois voies sur la même broche
// reçoivent toutes les fronts ; le renumérotage ne les tasse pas sur un seul
// numéro ; « 3,3 V », « 5 V », « 0 V ».
//
// VOLET C — l'onglet (Chrome headless, CDP brut, vrai bundle). Les voies et les
// fronts arrivent comme de l'atelier ; la VRAIE souris posée sur un palier
// haut lit 1 sur Sig et DMX+, 0 sur DMX- ; les tensions sont écrites dans la
// marge face aux traits haut et bas ; après restauration d'une capture avec
// « Invert » réglé sur DMX-, les trois lisent 1.
//
// Contre-épreuve sans toucher aux sources : `--ancien` compile
// analyseur-capture, analyseur, analyseur-vue et diagram/model dans leur
// version HEAD (`--ancien=a,b` pour n'en prendre que certains). Le banc DOIT
// échouer.
//
// Usage : node scripts/verify-analyseur-voies-partagees.mjs [--ancien[=a,b]] [--image=<dossier>]
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-partagees-'));
const PORT = 9422;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const argAncien = process.argv.find((a) => a === '--ancien' || a.startsWith('--ancien='));
const ancien = !argAncien
	? []
	: argAncien === '--ancien'
		? ['analyseur-capture', 'analyseur', 'analyseur-vue', 'model']
		: argAncien.slice('--ancien='.length).split(',').filter(Boolean);
let echecs = 0;
let controles = 0;
let etape = 'démarrage';
setTimeout(() => {
	console.log(`  ❌ banc figé (étape : ${etape})`);
	process.exit(1);
}, 90_000).unref();
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
		b.onLoad({ filter: /src[\\/]webview[\\/](diagram[\\/])?[^\\/]+\.mts$/ }, (args) => {
			const chemin = args.path.replace(/\\/g, '/');
			const nom = chemin.split('/').pop().replace(/\.mts$/, '');
			if (!ancien.includes(nom)) return undefined;
			const rel = chemin.slice(chemin.lastIndexOf('/src/webview/') + 1);
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
if (ancien.length) console.log(`(contre-épreuve : ${ancien.join(', ')} en version HEAD)`);

/** Un fichier d'un .projix (zip), lu sans dépendance. */
function lireProjix(chemin, fichier) {
	const buf = readFileSync(chemin);
	for (let i = 0; i + 30 < buf.length; i++) {
		if (buf.readUInt32LE(i) !== 0x04034b50) continue;
		const methode = buf.readUInt16LE(i + 8);
		const tailleC = buf.readUInt32LE(i + 18);
		const lgNom = buf.readUInt16LE(i + 26);
		const lgExtra = buf.readUInt16LE(i + 28);
		const nom = buf.subarray(i + 30, i + 30 + lgNom).toString('utf8');
		if (nom !== fichier || !tailleC) continue;
		const brut = buf.subarray(i + 30 + lgNom + lgExtra, i + 30 + lgNom + lgExtra + tailleC);
		return JSON.parse((methode === 0 ? brut : inflateRawSync(brut)).toString('utf8'));
	}
	return null;
}

// --- Volet A : le modèle ---------------------------------------------------------
console.log('Volet A — les pinces de dmx-uno-lib, par le modèle réel');
const mod = await esbuild.build({
	stdin: {
		contents: `
			export { logicProbeVoies } from './src/webview/diagram/model.mts';
			export { registerCustomPart, unregisterCustomPart } from './src/webview/diagram/catalog.mts';
			export { AnalyseurCapture } from './src/webview/analyseur-capture.mts';
			export { formatTension } from './src/webview/analyseur-vue.mts';
		`,
		resolveDir: ROOT, loader: 'ts',
	},
	bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
	loader: { '.svg': 'text', '.webp': 'dataurl', '.png': 'dataurl' },
	plugins: [versionHead],
	// analyseur-vue touche au DOM à l'exécution seulement : l'import suffit.
});
writeFileSync(join(tmp, 'mod.mjs'), mod.outputFiles[0].text);
const M = await import(pathToFileURL(join(tmp, 'mod.mjs')).href);

const projix = join(ROOT, 'testkablix', 'Arduino', 'dmx-uno-lib', 'dmx-uno-lib.projix');
const diagram = lireProjix(projix, 'diagram.json');
const publie = JSON.parse(readFileSync(join(ROOT, 'kablix_components', '_sources.json'), 'utf8'))
	.components.find((c) => c.type === 'dmx-grove');
check('témoin : le schéma de dmx-uno-lib porte ses trois pinces et la carte DMX', () =>
	diagram.parts.filter((p) => p.type === 'sonde-logique').length === 3 && diagram.parts.some((p) => p.type === 'dmx-grove'));
const voiesAvec = (miroirs, inversees, niveaux) => {
	for (const c of diagram.customParts ?? []) {
		try { M.unregisterCustomPart(c.type); } catch { /* */ }
		M.registerCustomPart(c.type === 'dmx-grove' ? { ...c, probeMirrors: miroirs, probeInverted: inversees, probeLevels: niveaux } : c);
	}
	return M.logicProbeVoies(diagram);
};
const voies = voiesAvec(publie.probeMirrors, publie.probeInverted, publie.probeLevels);
const parNom = Object.fromEntries(voies.map((v) => [v.etiquette, v]));
check('les trois pinces (Sig, DMX-, DMX+) remontent à la broche 3', () =>
	['Sig', 'DMX-', 'DMX+'].every((n) => parNom[n]?.pin === '3' && !parNom[n].probleme), () => JSON.stringify(voies));
check('seule la pince du « - » est inversée (manifeste publié : probeInverted ["-"])', () =>
	parNom['DMX-']?.inverse === true && !parNom['Sig']?.inverse && !parNom['DMX+']?.inverse, () => JSON.stringify(voies));
// Tensions de l'émetteur de ligne (Frank, 25/09 : « pour le SN75176A VOH =
// 3,7 V et VOL = 1,1 V ce sont ces tensions que je veux sur DMX- et DMX+ »).
const dmx = (n) => parNom[n]?.niveaux;
check('DMX+ et DMX- portent les tensions de l\'émetteur (1,1 V / 3,7 V), Sig celles de la carte', () =>
	['DMX-', 'DMX+'].every((n) => dmx(n)?.bas === 1.1 && dmx(n)?.haut === 3.7) && !dmx('Sig'), () => JSON.stringify(voies));
const sansInversion = voiesAvec({ '+': 'SIG', '-': 'SIG' }, undefined, undefined);
check('sans probeInverted, rien n\'est inversé (manifeste d\'avant, embarqué dans un .projix)', () =>
	sansInversion.every((v) => v.pin === '3' && !v.inverse), () => JSON.stringify(sansInversion));
check('sans probeLevels, les tensions restent celles de la carte (manifeste d\'avant)', () =>
	sansInversion.every((v) => !v.niveaux), () => JSON.stringify(sansInversion));

// Deux cartes inversantes en chaîne : les inversions se compensent.
M.registerCustomPart({
	type: 'banc-inverseur', label: 'Inverseur', kind: 'passive', svg: '<svg viewBox="0 0 100 100"></svg>',
	pins: [{ name: 'IN', x: 10, y: 50 }, { name: 'OUT', x: 90, y: 50 }],
	probeMirrors: { OUT: 'IN' },
	probeInverted: ['OUT'],
});
const sonde = (id, voie, accroche) => ({ id, type: 'sonde-logique', x: 0, y: 0, attrs: { voie: String(voie), accroche } });
const chaine = M.logicProbeVoies({
	parts: [
		{ id: 'u', type: 'uno', x: 0, y: 0, attrs: {} },
		{ id: 'k1', type: 'banc-inverseur', x: 300, y: 0, attrs: {} },
		{ id: 'k2', type: 'banc-inverseur', x: 500, y: 0, attrs: {} },
		sonde('s1', 0, 'k1/OUT'), sonde('s2', 1, 'k2/OUT'),
	],
	wires: [
		{ id: 'w1', a: { partId: 'u', pin: '1' }, b: { partId: 'k1', pin: 'IN' }, path: [] },
		{ id: 'w2', a: { partId: 'k1', pin: 'OUT' }, b: { partId: 'k2', pin: 'IN' }, path: [] },
	],
});
check('une carte inversante : inversée ; deux à la suite : les inversions se compensent', () =>
	chaine[0]?.pin === '1' && chaine[0].inverse === true && chaine[1]?.pin === '1' && !chaine[1].inverse, () => JSON.stringify(chaine));

// Tensions : celles de la carte qui PILOTE le point pincé, pas d'une carte
// traversée plus loin. Un émetteur à tensions propres (0,5 / 2,5 V) suivi d'un
// inverseur qui n'en déclare pas : la sortie de l'inverseur garde la carte.
M.registerCustomPart({
	type: 'banc-emetteur', label: 'Émetteur', kind: 'passive', svg: '<svg viewBox="0 0 100 100"></svg>',
	pins: [{ name: 'IN', x: 10, y: 50 }, { name: 'OUT', x: 90, y: 50 }],
	probeMirrors: { OUT: 'IN' },
	probeLevels: { OUT: [0.5, 2.5] },
});
const chaineTensions = M.logicProbeVoies({
	parts: [
		{ id: 'u', type: 'uno', x: 0, y: 0, attrs: {} },
		{ id: 'e1', type: 'banc-emetteur', x: 300, y: 0, attrs: {} },
		{ id: 'k2', type: 'banc-inverseur', x: 500, y: 0, attrs: {} },
		sonde('s1', 0, 'e1/OUT'), sonde('s2', 1, 'k2/OUT'), sonde('s3', 2, 'u/1'),
	],
	wires: [
		{ id: 'w1', a: { partId: 'u', pin: '1' }, b: { partId: 'e1', pin: 'IN' }, path: [] },
		{ id: 'w2', a: { partId: 'e1', pin: 'OUT' }, b: { partId: 'k2', pin: 'IN' }, path: [] },
	],
});
check('tensions : celles de l\'émetteur à sa sortie, rien derrière la carte suivante ni sur la broche', () =>
	chaineTensions[0]?.niveaux?.bas === 0.5 && chaineTensions[0].niveaux.haut === 2.5
	&& chaineTensions[1]?.pin === '1' && !chaineTensions[1].niveaux && chaineTensions[2]?.pin === '1' && !chaineTensions[2].niveaux,
	() => JSON.stringify(chaineTensions));

// --- Volet B : capture et format --------------------------------------------------
console.log('Volet B — trois voies sur une broche, format des tensions');
const c = new M.AnalyseurCapture();
c.declarerVoies([{ voie: 0, pin: '3', nom: 'Sig' }, { voie: 2, pin: '3', nom: 'DMX-' }, { voie: 3, pin: '3', nom: 'DMX+' }]);
c.verser({ 3: [1, 1, 5, 0, 9, 1, 13, 0] });
check('les trois voies de la broche 3 reçoivent chacune les 4 fronts', () =>
	c.listeVoies.length === 3 && c.listeVoies.every((v) => v.fronts.length === 4), () => JSON.stringify(c.listeVoies.map((v) => [v.voie, v.fronts.length])));
c.reglerInversion([2]);
check('la voie inversée se lit à l\'envers, les deux autres à l\'endroit', () =>
	c.niveauA(0, 3) === 1 && c.niveauA(2, 3) === 0 && c.niveauA(3, 3) === 1 && c.niveauA(2, 7) === 1);
try { c.renumeroter([{ voie: 0, pin: '3' }, { voie: 2, pin: '3' }, { voie: 3, pin: '3' }]); } catch { /* */ }
check('renumérotage : trois voies déjà à leur place sur la même broche y restent, fronts compris', () =>
	c.listeVoies.map((v) => `${v.voie}:${v.fronts.length}`).join(' ') === '0:4 2:4 3:4', () => c.listeVoies.map((v) => `${v.voie}:${v.fronts.length}`).join(' '));
const f = M.formatTension;
check('tensions : « 3,3 V », « 5 V », « 0 V » en français, « 3.3 V » en anglais, 4,96 arrondi à « 5 V »', () =>
	typeof f === 'function' && f(3.3, 'fr') === '3,3 V' && f(5, 'fr') === '5 V' && f(0, 'fr') === '0 V' && f(3.3, 'en') === '3.3 V' && f(4.96, 'fr') === '5 V',
	() => (typeof f === 'function' ? [f(3.3, 'fr'), f(5, 'fr'), f(0, 'fr'), f(3.3, 'en'), f(4.96, 'fr')].join(' | ') : 'absent'));

// --- Volet C : l'onglet --------------------------------------------------------------
console.log('Volet C — onglet de l\'analyseur, vraie souris');
writeFileSync(join(tmp, 'vscode-stub.mjs'), `
export const Uri = { joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/'), toString() { return this.fsPath; } }) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const env = { language: 'en' };
export const window = {}; export const ViewColumn = {};
export default { Uri, l10n, env, window, ViewColumn };
`);
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
const ESPION = `
window.__msgs = [];
window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(JSON.parse(JSON.stringify(m))); }, setState() {} });
window.__textes = [];
const P = CanvasRenderingContext2D.prototype;
const fillText = P.fillText;
P.fillText = function (t, x, y, ...r) {
	window.__textes.push({ t: String(t), x, y, align: this.textAlign, font: this.font });
	return fillText.call(this, t, x, y, ...r);
};`;
const html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/banc.projix');
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const fichier = join(tmp, 'onglet.html');
writeFileSync(fichier, html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`));

// Géométrie de analyseur-vue.mts : barre de temps 42, piste 46, créneau 22,
// une ligne de décodage de 18 sous chaque piste, marges 104 / 12.
const REGLE_H = 42, PISTE_H = 46, CRENEAU_H = 22, ANNOT_H = 18, MARGE_G = 104, MARGE_D = 12;
const hautPiste = (k) => REGLE_H + k * (PISTE_H + ANNOT_H);
const yHaut = (k) => hautPiste(k) + (PISTE_H - CRENEAU_H) / 2;
const yBas = (k) => hautPiste(k) + (PISTE_H + CRENEAU_H) / 2;
const FRONTS = [1, 1, 5, 0, 9, 1, 13, 0];
const VOIES = [
	{ voie: 0, nom: 'Sig', pin: '3', probleme: null, analogique: false, suivi: true, volts: 5 },
	{ voie: 2, nom: 'DMX-', pin: '3', probleme: null, analogique: false, suivi: true, inverse: true, volts: 5 },
	{ voie: 3, nom: 'DMX+', pin: '3', probleme: null, analogique: false, suivi: true, volts: 5 },
];

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,700',
	`file:///${fichier.replace(/\\/g, '/')}`], { stdio: 'ignore' });
let ws;
try {
	etape = 'connexion à Chrome';
	let listeCibles = null;
	for (let i = 0; i < 40 && !listeCibles; i++) {
		try { listeCibles = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await attendre(250); }
	}
	ws = new WebSocket(listeCibles.find((x) => x.type === 'page').webSocketDebuggerUrl);
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
	const poster = (m) => ev(`window.postMessage(${JSON.stringify(m)}, '*')`);
	etape = 'page prête';
	for (let i = 0; i < 40 && !(await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`).catch(() => false)); i++) await attendre(250);

	const trace = async () => ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`);
	/** Vraie souris sur l'instant `t` (vue « toute la capture » de 1 à 13 ms), puis relevé. */
	const niveauxA = async (t) => {
		const r = await trace();
		const t0 = 1 - 12 * 0.01, duree = 12 * 1.02;
		const x = r.left + MARGE_G + ((t - t0) / duree) * (r.w - MARGE_G - MARGE_D);
		await ev('window.__textes = []');
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(r.top + hautPiste(1) + 20), buttons: 0 });
		await attendre(120);
		const textes = await ev('window.__textes');
		// Le niveau lu au réticule : « 0 » ou « 1 » en gras 13 px, face au milieu de chaque piste.
		return [0, 1, 2].map((k) => textes.filter((x) => /^[01]$/.test(x.t) && /bold/.test(x.font) && Math.abs(x.y - (hautPiste(k) + PISTE_H / 2)) < 0.6).pop()?.t ?? '—').join('');
	};
	const toutVoir = async () => {
		await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Whole capture').click()`);
		await attendre(80);
	};

	// Comme l'atelier : voies, départ, fronts (clés = broches), arrêt.
	etape = 'run simulé';
	await poster({ type: 'voies', voies: VOIES });
	await poster({ type: 'depart' });
	await poster({ type: 'fronts', salves: { 3: FRONTS } });
	await poster({ type: 'arret' });
	await attendre(100);
	await toutVoir();
	const haut = await niveauxA(3);
	check('en direct, souris sur un palier haut : Sig 1, DMX- 0 (inversé), DMX+ 1', () => haut === '101', () => `lu « ${haut} » (Sig, DMX-, DMX+)`);
	const bas = await niveauxA(7);
	check('souris sur un palier bas : Sig 0, DMX- 1, DMX+ 0', () => bas === '010', () => `lu « ${bas} »`);

	// Tensions dans la marge : forcer un rendu hors souris et relever.
	await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 690, buttons: 0 });
	await ev(`window.__textes = []; window.postMessage({ type: 'repeindre' }, '*')`);
	await attendre(100);
	const textes = await ev('window.__textes');
	const tension = (t, y) => textes.filter((x) => x.t === t && x.align === 'right' && Math.abs(x.x - (MARGE_G - 4)) < 0.6 && Math.abs(x.y - y) < 0.6);
	check('marge : « 5 V » face au trait haut de chaque piste', () => [0, 1, 2].every((k) => tension('5 V', yHaut(k)).length === 1),
		() => JSON.stringify(textes.filter((x) => / V$/.test(x.t))));
	check('marge : « 0 V » face au trait bas de chaque piste', () => [0, 1, 2].every((k) => tension('0 V', yBas(k)).length === 1));
	const dossierImage = process.argv.find((a) => a.startsWith('--image='))?.slice('--image='.length);
	if (dossierImage) {
		await niveauxA(3);
		const png = await cdp('Page.captureScreenshot', { format: 'png' });
		writeFileSync(join(dossierImage, 'voies-partagees.png'), Buffer.from(png.result.data, 'base64'));
	}

	// Une carte Pico : 3,3 V (la page est en anglais : « 3.3 V »).
	await poster({ type: 'voies', voies: VOIES.map((v) => ({ ...v, volts: 3.3 })) });
	await ev(`window.__textes = []; window.postMessage({ type: 'repeindre' }, '*')`);
	await attendre(100);
	const pico = await ev('window.__textes');
	check('Pico : « 3.3 V » face au trait haut, le chiffre après la virgule gardé', () =>
		[0, 1, 2].every((k) => pico.some((x) => x.t === '3.3 V' && Math.abs(x.y - yHaut(k)) < 0.6)), () => JSON.stringify(pico.filter((x) => / V$/.test(x.t))));

	// DMX : les voies DMX- et DMX+ portent les tensions du SN75176A, telles que
	// sim.mts les envoie (volts = haut, voltsBas = bas) ; Sig garde la carte.
	const marge = async (voies) => {
		await poster({ type: 'voies', voies });
		await ev(`window.__textes = []; window.postMessage({ type: 'repeindre' }, '*')`);
		await attendre(100);
		const tx = await ev('window.__textes');
		const a = (t, y) => tx.filter((x) => x.t === t && x.align === 'right' && Math.abs(x.x - (MARGE_G - 4)) < 0.6 && Math.abs(x.y - y) < 0.6).length === 1;
		return { a, tx };
	};
	const dmxV = await marge(VOIES.map((v) => (v.nom === 'Sig' ? v : { ...v, volts: 3.7, voltsBas: 1.1 })));
	check('DMX : « 3.7 V » face au trait haut et « 1.1 V » face au trait bas de DMX- et DMX+', () =>
		[1, 2].every((k) => dmxV.a('3.7 V', yHaut(k)) && dmxV.a('1.1 V', yBas(k))), () => JSON.stringify(dmxV.tx.filter((x) => / V$/.test(x.t))));
	check('DMX : Sig garde « 5 V » / « 0 V » (tensions de la carte)', () => dmxV.a('5 V', yHaut(0)) && dmxV.a('0 V', yBas(0)));
	const incoherent = await marge(VOIES.map((v) => ({ ...v, volts: 3.7, voltsBas: 4 })));
	check('tension basse incohérente (au-dessus de la haute) : ignorée, « 0 V » écrit', () =>
		[0, 1, 2].every((k) => incoherent.a('0 V', yBas(k))), () => JSON.stringify(incoherent.tx.filter((x) => / V$/.test(x.t))));
	// Voie en défaut : ni tension ni niveau.
	await poster({ type: 'voies', voies: [...VOIES, { voie: 4, nom: 'X', pin: '', probleme: 'nowhere', analogique: false, volts: 5 }] });
	await ev(`window.__textes = []; window.postMessage({ type: 'repeindre' }, '*')`);
	await attendre(100);
	const defaut = await ev('window.__textes');
	check('voie en défaut : aucune tension écrite dans sa marge', () =>
		!defaut.some((x) => / V$/.test(x.t) && x.y > hautPiste(3) && x.y < hautPiste(3) + PISTE_H), () => JSON.stringify(defaut.filter((x) => / V$/.test(x.t)).map((x) => x.y)));

	// Réouverture d'un projet : la capture enregistrée porte les trois voies de
	// la broche 3, et « Invert » réglé sur DMX- la remet à l'endroit.
	etape = 'restauration';
	await poster({ type: 'voies', voies: VOIES });
	await poster({
		type: 'restaure',
		etat: {
			voies: VOIES.map((v) => ({ voie: v.voie, nom: v.nom, pin: '3', fronts: FRONTS, niveauInitial: 0 })),
			voiesReglages: { 2: { repos: 1 } },
		},
	});
	await attendre(100);
	await toutVoir();
	const restaure = await niveauxA(3);
	check('restaurée : les trois pistes gardent leur mesure, et « Invert » sur DMX- la remet à l\'endroit (1 1 1)', () =>
		restaure === '111', () => `lu « ${restaure} »`);
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
const MIN = 22;
if (controles < MIN) {
	echecs++;
	console.log(`  ❌ ${controles} contrôles joués, ${MIN} attendus`);
}
console.log(echecs === 0 ? `\nTout est vert (${controles} contrôles).` : `\n${echecs} échec(s) sur ${controles} contrôles.`);
process.exit(echecs === 0 ? 0 : 1);
