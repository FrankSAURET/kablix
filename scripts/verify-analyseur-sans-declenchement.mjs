// Banc : sans déclenchement réglé, un décodage pose la vue sur la première trame
// et elle n'en bouge plus pendant la capture (v2026.9.6.173).
//
// LA DEMANDE (Frank, 28/09, ds18b20-pico2 et ds18b20-uno) : « Pendant la
// capture […] la courbe se décale tout le temps », puis « Traite le cas sans
// déclenchement » — option retenue : un décodage posé déclenche sur son début
// de trame, comme ds18b20-pico qui en a un d'enregistré.
//
// La cause : sans déclenchement, la vue suit la fin de la capture, calée sur le
// DERNIER front reçu. Un bus 1-Wire parle sans arrêt : la fenêtre sautait à
// chaque salve, la courbe ne tenait jamais en place.
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless en CDP brut. Le
// trafic est celui de DallasTemperature sur Uno (RESET, SKIP ROM, CONVERT T,
// sondage de la conversion pendant 750 ms, lecture du scratchpad), versé salve
// par salve (une par image, 60 images/s) comme pendant un run.
//
// A. Décodage 1-Wire, AUCUN déclenchement : la vue se pose sur le premier
//    RESET puis ne bouge plus — fenêtre et image du tracé identiques d'une
//    salve à l'autre ; le déclenchement implicite n'est jamais enregistré.
// B. Témoin : ni décodage ni déclenchement, la vue suit toujours la fin.
//
// Contre-épreuve : `node scripts/verify-analyseur-sans-declenchement.mjs --ancien`
// prend les sources de l'analyseur dans HEAD — le volet A DOIT alors échouer.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-sans-decl-'));
const PORT = 9437;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
const echecs = [];
const check = (cond, titre, detail = '') => {
	if (cond) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

// --- Contre-épreuve : les sources de l'analyseur prises dans HEAD ------------
const ANCIEN = process.argv.includes('--ancien');
if (ANCIEN) console.log('(contre-épreuve : sources de l’analyseur en version HEAD)');
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /[\\/]src[\\/](webview[\\/]analyseur(-capture|-decodage|-vue)?\.mts|analyseur-panel\.ts)$/ }, (args) => {
			if (!ANCIEN) return undefined;
			const rel = relative(ROOT, args.path).replace(/\\/g, '/');
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};

// --- La page : vrai HTML de l'onglet, vrai script ----------------------------
const STUB = `
export const Uri = { joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/'), toString() { return this.fsPath; } }) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const env = { language: 'en' };
export const window = {}; export const ViewColumn = {};
export default { Uri, l10n, env, window, ViewColumn };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
const sortiePanneau = join(tmp, 'analyseur-panel.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/analyseur-panel.ts')],
	outfile: sortiePanneau, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
	plugins: [versionHead],
});
const { AnalyseurPanel } = await import(pathToFileURL(sortiePanneau).href);
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/ds18b20.projix');
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Faux VS Code (état gardé en sessionStorage : il survit au rechargement, comme
// celui que VS Code rend à un onglet), et relevé de ce que la vue peint.
const ESPION = `window.__msgs = []; window.__erreurs = [];
window.addEventListener('error', (e) => window.__erreurs.push(e.message));
window.acquireVsCodeApi = () => ({
	postMessage(m) { window.__msgs.push(m); },
	setState(s) { sessionStorage.setItem('etat', JSON.stringify(s)); },
	getState() { const s = sessionStorage.getItem('etat'); return s ? JSON.parse(s) : undefined; },
});
window.__peint = [];
const P = CanvasRenderingContext2D.prototype;
const espionner = (nom, releve) => {
	const origine = P[nom];
	P[nom] = function (...a) { window.__peint.push(releve.call(this, ...a)); return origine.apply(this, a); };
};
espionner('fillText', function (t, x, y) { return { quoi: 'texte', t: String(t), x, y }; });
espionner('fillRect', function (x, y, w, h) { return { quoi: 'rect', x, y, w, h, c: String(this.fillStyle), a: this.globalAlpha }; });`;
html = html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

// --- Le trafic : DallasTemperature en boucle ----------------------------------
const US = 1 / 1000;
const DQ = [];
const creux = (t, us) => { DQ.push(t, 0, t + us * US, 1); };
const ecrire = (s, octets, zero = 60) => {
	for (const o of octets) for (let k = 0; k < 8; k++) { creux(s, (o >> k) & 1 ? 6 : zero); s += 70 * US; }
	return s;
};
const reset = (t) => { creux(t, 480); creux(t + 510 * US, 110); return t + 960 * US; };
const PREMIER_RESET = 50;
for (let t = PREMIER_RESET; t < 4000;) {
	let s = ecrire(reset(t), [0xcc, 0x44]);
	// Conversion sondée : un créneau de lecture tous les 70 µs (le capteur répond 0).
	for (const fin = s + 750; s < fin; s += 70 * US) creux(s, 30);
	s = ecrire(reset(s), [0x55, 0x28, 0x24, 0x61, 0xf5, 0x8c, 0x7e, 0xac, 0xe7, 0xbe]);
	s = ecrire(s, [0x30, 0x02, 0x4b, 0x46, 0x7f, 0xff, 0x0c, 0x10, 0x55], 30);
	t = s + 300;
}
const VOIES = [{ voie: 0, nom: 'DQ', pin: 'D2', probleme: null, analogique: false, suivi: true }];
const DECODAGE = { protocole: 'onewire', id: 'd1', donnees: 0 };
const IMAGE = 1000 / 60;

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find((c) => c && existsSync(c));
if (!chrome) {
	check(false, 'Chrome introuvable — le banc n’a pas pu être joué');
} else {
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,500',
		pathToFileURL(fichierPage).href], { stdio: 'ignore' });
	let ws;
	try {
		let liste = null;
		for (let i = 0; i < 120 && !liste; i++) {
			try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await attendre(250); }
		}
		ws = new WebSocket(liste.find((c) => c.type === 'page').webSocketDebuggerUrl);
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
		const envoyer = (m) => ev(`window.postMessage(${JSON.stringify(m)}, '*')`);
		const pret = async () => {
			for (let i = 0; i < 120; i++) {
				if (await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)) return true;
				await attendre(100);
			}
			return false;
		};
		/** Fenêtre gardée par la page, et empreinte de ce que montre le tracé. */
		const releve = async () => {
			await envoyer({ type: 'repeindre' });
			await attendre(30);
			return ev(`(() => {
				const s = JSON.parse(sessionStorage.getItem('etat') || '{}');
				const u = document.getElementById('trace').toDataURL();
				let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) | 0;
				return { t0: s.fenetre?.t0 ?? null, duree: s.fenetre?.duree ?? null, suivi: s.suivi ?? null, image: h };
			})()`);
		};

		/** Un run de `duree` ms, sans déclenchement réglé, avec ou sans décodage. */
		const run = async (decodages, duree) => {
			await ev(`sessionStorage.clear()`);
			await cdp('Page.reload');
			await attendre(200);
			check(await pret(), 'la page se dit prête');
			await envoyer({ type: 'voies', voies: VOIES });
			await envoyer({ type: 'depart' });
			await envoyer({ type: 'restaure', etat: { voies: [], declenchement: null, decodages, voiesReglages: {}, echantillonnage: 0 } });
			await attendre(100);
			const vus = [];
			let i = 0;
			for (let t = 0, n = 0; t < duree; t += IMAGE, n++) {
				const plat = [];
				while (i < DQ.length && DQ[i] <= t + IMAGE) { plat.push(DQ[i], DQ[i + 1]); i += 2; }
				if (plat.length) await envoyer({ type: 'fronts', salves: { D2: plat } });
				if (n % 5 === 4) vus.push({ t: Math.round(t + IMAGE), ...(await releve()) });
			}
			return vus;
		};

		// --- A. Décodage 1-Wire, aucun déclenchement --------------------------------
		console.log('A. Décodage 1-Wire, aucun déclenchement : 3 s de run');
		const a = await run([DECODAGE], 3000);
		const posee = a.filter((v) => v.t >= 200);
		const premiere = posee[0];
		check(!!premiere && premiere.suivi === false && Math.abs(premiere.t0 + premiere.duree * 0.1 - PREMIER_RESET) < 0.01,
			'la vue se pose sur le premier RESET (au dixième de sa largeur) et cesse de suivre la fin',
			JSON.stringify(premiere));
		const fenetres = new Set(posee.map((v) => `${v.t0}|${v.duree}|${v.suivi}`));
		check(fenetres.size === 1 && posee.every((v) => v.suivi === false), `la fenêtre ne bouge plus de 200 ms à 3 s (${posee.length} relevés)`, [...fenetres].slice(0, 4).join(' · '));
		const images = new Set(posee.map((v) => v.image));
		check(images.size === 1, 'le tracé est la même image d’une salve à l’autre', `${images.size} images différentes`);
		const reglages = await ev(`window.__msgs.filter((m) => m.type === 'analyseurReglages')`);
		check(reglages.every((m) => m.declenchement === null || m.declenchement === undefined),
			'le déclenchement implicite n’est jamais enregistré dans le projet', JSON.stringify(reglages.map((m) => m.declenchement)));
		check(await ev(`!!document.querySelector('#etat') && !/\\u23f3|attente|waiting/i.test(document.getElementById('etat').textContent)`),
			'la barre d’état n’attend plus de déclenchement une fois la trame trouvée',
			await ev(`document.getElementById('etat')?.textContent`));

		// --- B. Témoin : ni décodage ni déclenchement -------------------------------
		console.log('B. Témoin : ni décodage ni déclenchement');
		const b = await run([], 1000);
		const suivis = b.filter((v) => v.t >= 200);
		check(suivis.every((v) => v.suivi === true) && new Set(suivis.map((v) => v.image)).size > 1,
			'sans décodage, la vue suit toujours la fin de la capture', JSON.stringify(suivis.slice(0, 2)));
		const erreurs = await ev('window.__erreurs');
		check(erreurs.length === 0, 'aucune exception dans la page', erreurs.join(' · '));
	} catch (e) {
		check(false, 'le banc s’est déroulé jusqu’au bout', e.message);
	} finally {
		try { ws?.close(); } catch {}
		proc.kill();
	}
}
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(echecs.length ? `\nÉCHEC (${echecs.length}) : ${echecs.join(' · ')}` : `\nTout est vert (${ok} contrôles).`);
process.exit(echecs.length ? 1 : 0);
