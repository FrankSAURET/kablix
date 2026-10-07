// Vérifie la pose d'un décodage I²C depuis le bouton « P » (v2026.10.1.219).
// Frank, 07/10/2026, « 16 servo + alim-pico2 » : « je ne vois ni décodage ni
// affichage des bits sur SDA ». Ses trois décodages étaient tous faux : le « P »
// d'une voie la prenait TOUJOURS pour SDA et laissait SCL vide, et le panneau
// proposait la voie de données comme horloge (SDA = SCL, décodage muet).
//
// Vraie page, vrai bundle, Chrome headless piloté en CDP brut, clics à la VRAIE
// souris. Trois voies comme dans son projet : SDA (GP8), SCL (GP9) et une
// troisième pince sur GP9. Le bus porte un vrai échange (START, 0x40 W, ACK,
// 0x06, ACK, STOP) rejoué par LigneI2c.
//   1. « P » de la voie SCL → « I²C / TWI » : le décodage se pose avec SDA en
//      données et SCL en horloge, et la trame se lit sous la piste SDA.
//   2. « P » de la voie SCL une seconde fois : il rouvre CE décodage, n'en
//      pose pas un second, et ne montre que le bus figé et « Remove » (v.220).
//   3. Côté SDA, la liste « SCL » écrit les GPIO SCL (GP9, GP11), une entrée
//      par broche, la voisine par défaut ; ni la voie SDA ni une broche paire.
//      La case s'appelle « Bit ».
//   4. Cas symétrique : « P » de la voie SDA → l'horloge est trouvée seule.
//
// Contre-épreuve : `--ancien` compile analyseur.mts dans sa version HEAD. Le
// banc DOIT échouer.
//
// Usage : node scripts/verify-analyseur-i2c-pose.mjs [--ancien]
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-i2c-pose-'));
const PORT = 9427;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const ancien = process.argv.includes('--ancien') ? ['analyseur'] : [];

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
		b.onLoad({ filter: /src[\\/]webview[\\/][^\\/]+\.mts$/ }, (args) => {
			const nom = args.path.replace(/\\/g, '/').split('/').pop().replace(/\.mts$/, '');
			if (!ancien.includes(nom)) return undefined;
			const contents = execFileSync('git', ['show', `HEAD:src/webview/${nom}.mts`], { cwd: ROOT, encoding: 'utf8' });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};
if (ancien.length) console.log(`(contre-épreuve : ${ancien.join(', ')} en version HEAD)`);

// --- Le bus : un vrai échange I²C, rejoué par le module des moteurs ----------
await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/engines/i2c-fronts.mts')],
	outfile: join(tmp, 'i2c-fronts.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { LigneI2c } = await import(pathToFileURL(join(tmp, 'i2c-fronts.mjs')).href);
const ligne = new LigneI2c();
const T = 10; // µs : 100 kHz
const sda = [];
const scl = [];
for (const m of [ligne.start(100, T), ligne.octet(0x80, true, 0, T), ligne.octet(0x06, true, 0, T), ligne.stop(0, T)]) {
	sda.push(...m.sda);
	scl.push(...m.scl);
}
// µs → ms, l'unité des captures.
const enMs = (f) => f.map((v, i) => (i % 2 === 0 ? v / 1000 : v));
const VOIES = [
	{ voie: 0, nom: 'GP9', pin: 'GP9', fronts: enMs(scl), niveauInitial: 1 },
	{ voie: 2, nom: 'SDA', pin: 'GP8', fronts: enMs(sda), niveauInitial: 1 },
	{ voie: 4, nom: 'GP11', pin: 'GP11', fronts: [], niveauInitial: 1 },
	{ voie: 5, nom: 'GP10', pin: 'GP10', fronts: [], niveauInitial: 1 },
	{ voie: 7, nom: 'SCL', pin: 'GP9', fronts: enMs(scl), niveauInitial: 1 },
];

// --- La page -----------------------------------------------------------------
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
const ESPION = `
window.__msgs = [];
window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(JSON.parse(JSON.stringify(m))); }, setState() {} });
window.__textes = [];
const P = CanvasRenderingContext2D.prototype;
const fillText = P.fillText;
P.fillText = function (t, x, y, ...r) {
	window.__textes.push({ t: String(t), x, y });
	return fillText.call(this, t, x, y, ...r);
};`;
const html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/banc.projix');
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const fichier = join(tmp, 'onglet.html');
writeFileSync(fichier, html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`));

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,800',
	`file:///${fichier.replace(/\\/g, '/')}`], { stdio: 'ignore' });
let ws;
try {
	etape = 'connexion à Chrome';
	let listeCibles = null;
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

	const releve = async () => {
		await ev(`window.__textes = []`);
		await ev(`window.postMessage({ type: 'repeindre' }, '*')`);
		await attendre(80);
		return ev('window.__textes');
	};
	const trace = async () => ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { left: r.left, top: r.top }; })()`);
	const clic = async (x, y) => {
		const p = { x: Math.round(x), y: Math.round(y) };
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
		await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
		await attendre(100);
	};
	/** Clic souris sur le « P » dessiné sous le nom de la voie `nom`. */
	const clicP = async (nom) => {
		const textes = await releve();
		const r = await trace();
		const etiquette = textes.find((x) => x.t === nom && x.x < 104);
		const p = textes.filter((x) => x.t === 'P' && x.x < 104 && etiquette && x.y > etiquette.y).sort((a, b) => a.y - b.y)[0];
		if (!p) throw new Error(`bouton P de ${nom} introuvable`);
		await clic(r.left + p.x, r.top + p.y);
	};
	/** Clic souris sur l'entrée de menu (ou le libellé) qui porte ce texte. */
	const clicEntree = async (texte) => {
		const c = await ev(`(() => {
			const b = [...document.querySelectorAll('.flottant button')].find((x) => x.textContent.trim() === ${JSON.stringify(texte)});
			if (!b) return null;
			const r = b.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		})()`);
		if (!c) throw new Error(`entrée « ${texte} » absente du menu`);
		await clic(c.x, c.y);
	};
	const reglages = async () => (await ev('window.__msgs')).filter((m) => m.type === 'analyseurReglages').pop()?.decodages ?? [];
	const optionsScl = () => ev(`(() => {
		const s = [...document.querySelectorAll('.flottant label')].find((x) => x.textContent.startsWith('SCL'))?.querySelector('select');
		const o = [...(s?.options ?? [])].filter((x) => x.value !== '');
		return s ? { valeur: s.value, voies: o.map((x) => x.value), textes: o.map((x) => x.textContent) } : null;
	})()`);
	/** Contenu du panneau ouvert : libellés, état de la liste « Bus », boutons. */
	const panneau = () => ev(`(() => {
		const f = document.querySelector('.flottant');
		if (!f) return null;
		const bus = [...f.querySelectorAll('label')].find((x) => x.textContent.startsWith('Bus'))?.querySelector('select');
		return {
			libelles: [...f.querySelectorAll('label')].map((x) => x.textContent.trim().split('\\n')[0].slice(0, 6)),
			bus: bus ? { valeur: bus.value, fige: bus.disabled } : null,
			boutons: [...f.querySelectorAll('button')].map((x) => x.textContent.trim()),
			bit: [...f.querySelectorAll('label')].some((x) => x.textContent.trim() === 'Bit'),
		};
	})()`);
	/** Clic souris sur le bouton de protocole (« I²C ») dessiné sous la voie `nom`. */
	const clicBus = async (nom, texte) => {
		const textes = await releve();
		const r = await trace();
		const etiquette = textes.find((x) => x.t === nom && x.x < 104);
		const b = textes.filter((x) => x.t === texte && x.x < 104 && etiquette && x.y > etiquette.y).sort((a, c) => a.y - c.y)[0];
		if (!b) throw new Error(`bouton ${texte} de ${nom} introuvable`);
		await clic(r.left + b.x, r.top + b.y);
	};
	// START et ACK tiennent dans une cellule étroite et s'abrègent (« S… ») : on
	// juge sur l'adresse et l'octet, écrits en entier.
	const decode = (textes) => textes.some((x) => x.t === 'addr 0x40 W') && textes.some((x) => x.t === '0x06');

	// --- 1. « P » de la voie SCL ---
	etape = 'pose depuis SCL';
	await ev(`window.postMessage(${JSON.stringify({ type: 'restaure', etat: { voies: VOIES, decodages: [] } })}, '*')`);
	await attendre(250);
	const vu0 = await releve();
	check('témoin : les trois pistes sont là, rien de décodé au départ',
		() => ['SDA', 'SCL', 'GP9'].every((n) => vu0.some((x) => x.t === n)) && !decode(vu0), () => vu0.map((x) => x.t).join(' | '));
	await clicP('SCL');
	await clicEntree('I²C / TWI');
	const d1 = await reglages();
	check('« P » de SCL → I²C : un seul décodage, SDA (voie 2) en données, SCL (voie 7) en horloge',
		() => d1.length === 1 && d1[0].protocole === 'i2c' && d1[0].donnees === 2 && d1[0].horloge === 7, () => JSON.stringify(d1));
	const vu1 = await releve();
	check('la trame se lit sous SDA : « addr 0x40 W » puis « 0x06 »', () => decode(vu1), () => vu1.map((x) => x.t).filter((t) => t.length > 1).slice(0, 30).join(' | '));

	// --- 2. Second « P » sur SCL : le même décodage ---
	etape = 'second P sur SCL';
	await clicP('SCL');
	const pScl = await panneau();
	check('« P » de SCL rouvre le décodage posé : bus I²C montré, figé',
		() => pScl?.bus?.valeur === 'i2c' && pScl.bus.fige === true, () => JSON.stringify(pScl));
	check('côté SCL : ni liste SCL, ni valeurs, ni bit — seulement de quoi ôter le décodage',
		() => pScl && pScl.libelles.length === 1 && !pScl.bit && pScl.boutons.join() === 'Remove', () => JSON.stringify(pScl));
	await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
	await attendre(80);
	const d2 = await reglages();
	check('toujours un seul décodage après le second « P »', () => d2.length === 1, () => JSON.stringify(d2));

	// --- 3. Le panneau côté SDA : la liste SCL en numéros de GPIO ---
	etape = 'panneau SDA';
	await clicBus('SDA', 'I²C');
	const opt = await optionsScl();
	check('côté SDA : la liste SCL écrit les GPIO SCL, une entrée par broche (GP9, GP11)',
		() => opt?.textes.join() === 'GP9,GP11', () => JSON.stringify(opt));
	check('par défaut la broche voisine : GP9, sur la voie réglée (7)', () => opt?.valeur === '7', () => JSON.stringify(opt));
	check('ni la voie SDA ni une broche paire (GP10) dans la liste', () => opt && !opt.voies.includes('2') && !opt.voies.includes('5'), () => JSON.stringify(opt));
	const pSda = await panneau();
	check('côté SDA : la case s\'appelle « Bit », sans s', () => pSda?.bit === true, () => JSON.stringify(pSda));
	await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
	await attendre(80);

	// --- 4. Cas symétrique : « P » de SDA ---
	etape = 'pose depuis SDA';
	await ev(`window.postMessage(${JSON.stringify({ type: 'restaure', etat: { voies: VOIES, decodages: [] } })}, '*')`);
	await attendre(250);
	await clicP('SDA');
	await clicEntree('I²C / TWI');
	const d3 = await reglages();
	check('« P » de SDA → I²C : SDA en données, l\'horloge trouvée seule sur la voie nommée SCL (7)',
		() => d3.length === 1 && d3[0].donnees === 2 && d3[0].horloge === 7, () => JSON.stringify(d3));
	const vu3 = await releve();
	check('la trame se lit aussi dans ce sens', () => decode(vu3));
} catch (e) {
	echecs++;
	console.log('  ❌ ÉCHEC', e?.stack ?? e);
} finally {
	try { ws?.close(); } catch { /* */ }
	proc.kill();
	await attendre(300);
	try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
}
const MIN = 12;
if (controles < MIN) {
	echecs++;
	console.log(`  ❌ ${controles} contrôles joués, ${MIN} attendus`);
}
console.log(echecs === 0 ? `\nTout est vert (${controles} contrôles).` : `\n${echecs} échec(s) sur ${controles} contrôles.`);
process.exit(echecs === 0 ? 0 : 1);
