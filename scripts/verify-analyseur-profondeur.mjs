// Banc : profondeur de capture réglable et bouton « Relancer la capture »
// (v2026.9.5.161).
//
// LA DEMANDE (Frank, 26/09) : « Je viens de lancer en illimité et à 1 MHz et je
// m'arrête les 2 fois à 8,3 s » — la capture pleine à 60 000 fronts par voie.
// Réponse retenue (Option B) : la profondeur se choisit dans la barre, 60 k,
// 250 k ou 1 M, avec la durée qu'elle tiendrait au débit mesuré. Puis, dans
// todo.md : « Ajoute un bouton relancer la capture dans la barre de menu en
// haut de l'analyseur logique ».
//
// Vrai HTML de l'onglet (AnalyseurPanel.html), vrai analyseur.mts, Chrome
// headless piloté en CDP brut : VRAIS clics sur « Relancer la capture », VRAIES
// touches sur la liste des profondeurs. Ce qui se lit : le texte d'état de la
// barre, les libellés de la liste, les réglages envoyés à VS Code.
//
// Contre-épreuve : `node scripts/verify-analyseur-profondeur.mjs --ancien` prend
// les sources de l'analyseur dans HEAD — le banc DOIT alors échouer.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-profondeur-'));
const PORT = 9433;
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
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/profondeur.projix');
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const FAUX_VSCODE = `window.__msgs = []; window.__erreurs = [];
window.addEventListener('error', (e) => window.__erreurs.push(e.message));
window.acquireVsCodeApi = () => ({
	postMessage(m) { window.__msgs.push(m); },
	setState(s) { sessionStorage.setItem('etat', JSON.stringify(s)); },
	getState() { const s = sessionStorage.getItem('etat'); return s ? JSON.parse(s) : undefined; },
});`;
html = html
	.replace('</head>', `<script nonce="${nonce}">${FAUX_VSCODE}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

// D8 : horloge de 10 fronts par ms (5 kHz). D9 : le déclenchement.
const VOIES = [
	{ voie: 0, nom: 'CLK', pin: 'D8', probleme: null, analogique: false },
	{ voie: 1, nom: 'TRIG', pin: 'D9', probleme: null, analogique: false },
];
/** Fronts de l'horloge dans ]a, b] ms, à plat. */
const clk = (a, b) => {
	const f = [];
	for (let k = Math.round(a * 10) + 1; k <= Math.round(b * 10); k++) f.push(k / 10, k % 2);
	return f;
};

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
	check(false, 'Chrome introuvable — le banc n’a pas pu être joué');
} else {
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1400,700',
		`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
	let ws;
	try {
		let liste = null;
		// 30 s : sous verify:all, plusieurs bancs en parallèle, Chrome met parfois plus de 10 s à ouvrir son port.
		for (let i = 0; i < 120 && !liste; i++) {
			try { liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await attendre(250); }
		}
		ws = new WebSocket(liste.find((c) => c.type === 'page').webSocketDebuggerUrl);
		let id = 0;
		const attentes = new Map();
		ws.addEventListener('message', (ev) => {
			const m = JSON.parse(ev.data);
			if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); }
		});
		await new Promise((r) => ws.addEventListener('open', r, { once: true }));
		const cdp = (method, params = {}) => new Promise((res) => { const n = ++id; attentes.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
		const ev = async (expr) => {
			const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
			if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
			return r.result?.result?.value;
		};
		const pret = async () => {
			for (let i = 0; i < 120; i++) {
				if (await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)) return true;
				await attendre(250);
			}
			return false;
		};
		const envoyer = async (m) => { await ev(`window.postMessage(${JSON.stringify(m)}, '*')`); await attendre(60); };
		const clic = async (x, y) => {
			const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
			await attendre(150);
		};
		/** Le bouton « Relancer » : présent, grisé ou non, et son centre. */
		const bouton = (idBouton) => ev(`(() => {
			const b = document.getElementById(${JSON.stringify(idBouton)});
			if (!b) return null;
			const r = b.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2, grise: b.disabled, texte: b.textContent.trim(), large: r.width > 0 && r.height > 0 };
		})()`);
		const relancer = async () => {
			const b = await bouton('relancer');
			if (!b) return false;
			await clic(b.x, b.y);
			return true;
		};
		/** Texte d'état de la barre, après un rendu forcé. */
		const etat = async () => {
			await envoyer({ type: 'repeindre' });
			return ev(`document.getElementById('etat')?.textContent ?? ''`);
		};
		/** Liste des profondeurs : valeur choisie et libellé de chaque choix. */
		const liste2 = async () => {
			await envoyer({ type: 'repeindre' });
			return ev(`(() => {
				const s = document.getElementById('profondeur');
				return s ? { valeur: s.value, textes: [...s.options].map((o) => o.textContent) } : null;
			})()`);
		};
		/** Une VRAIE touche flèche sur la liste des profondeurs (fermée, prise au focus). */
		const touche = async (fleche) => {
			await ev(`document.getElementById('profondeur')?.focus(); true`);
			const code = fleche === 'bas' ? { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 } : { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 };
			await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...code, nativeVirtualKeyCode: code.windowsVirtualKeyCode });
			await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...code, nativeVirtualKeyCode: code.windowsVirtualKeyCode });
			await attendre(150);
		};
		const derniersReglages = () => ev(`window.__msgs.filter((m) => m.type === 'analyseurReglages').at(-1) ?? null`);

		check(await pret(), 'la page se dit prête');
		await envoyer({ type: 'voies', voies: VOIES });

		// 1. La barre : le bouton et la liste sont là, le bouton grisé hors simulation.
		const b0 = await bouton('relancer');
		check(!!b0 && b0.large && /Restart capture/.test(b0.texte), 'le bouton « Restart capture » est dans la barre', JSON.stringify(b0));
		check(b0?.grise === true, 'hors simulation, le bouton est grisé');
		const l0 = await liste2();
		check(l0?.valeur === '60000' && l0.textes.join('|') === '5 k|15 k|60 k|250 k|1 M',
			'la liste des profondeurs : 60 k choisi, sans durée tant que rien n’a bougé', JSON.stringify(l0));

		// 2. Run sans déclenchement : 2 s d'horloge, la durée s'estime.
		await envoyer({ type: 'depart' });
		for (let t = 0; t < 2000; t += 100) await envoyer({ type: 'fronts', salves: { D8: clk(t, t + 100) } });
		check((await bouton('relancer'))?.grise === false, 'en simulation, le bouton s’allume');
		const l1 = await liste2();
		check(l1?.textes.join('|') === '5 k (≈ 500 ms)|15 k (≈ 1.5 s)|60 k (≈ 6 s)|250 k (≈ 25 s)|1 M (≈ 1.7 min)',
			'chaque profondeur dit la durée qu’elle tiendrait (10 fronts par ms)', JSON.stringify(l1?.textes));

		// 3. Vrai clic sur « Relancer » : la capture est vidée, le débit oublié.
		await relancer();
		const l2 = await liste2();
		check(l2?.textes.join('|') === '5 k|15 k|60 k|250 k|1 M', 'relancer vide la capture : plus aucune durée estimée', JSON.stringify(l2?.textes));
		await envoyer({ type: 'fronts', salves: { D8: clk(2000, 2100) } });
		const l3 = await liste2();
		check(l3?.textes[2] === '60 k (≈ 6 s)', 'la salve suivante remplit la nouvelle acquisition', JSON.stringify(l3?.textes));
		check(/^Capturing… 2100\.0$/.test(await etat()), 'et la capture continue, sans attente', await etat());

		// 4. Déclenchement réglé : il tombe, puis « Relancer » le remet en attente.
		await envoyer({ type: 'arret' });
		await envoyer({ type: 'restaure', etat: { voies: [], declenchement: { voie: 1, sens: 'rising' }, decodages: [], voiesReglages: {}, echantillonnage: 0 } });
		await envoyer({ type: 'depart' });
		await envoyer({ type: 'fronts', salves: { D8: clk(0, 100), D9: [50.05, 1] } });
		const e1 = await etat();
		check(/^Capturing… 100\.0$/.test(e1), 'le déclenchement est tombé', e1);
		await relancer();
		const e2 = await etat();
		check(/waiting for the trigger edge/.test(e2), 'vrai clic sur « Relancer » : le déclenchement attend de nouveau', e2);
		await envoyer({ type: 'fronts', salves: { D8: clk(100, 200) } });
		check(/waiting for the trigger edge/.test(await etat()), 'TRIG resté haut : un niveau ne redéclenche pas', await etat());
		await envoyer({ type: 'fronts', salves: { D8: clk(200, 300), D9: [250.05, 0, 260.05, 1] } });
		check(/^Capturing… 300\.0$/.test(await etat()), 'le front montant d’après la relance déclenche', await etat());

		// 5. La relance est partie de 100 ms : CLK atteint 60 000 fronts à 6 100 ms,
		//    la capture est pleine. Puis une VRAIE flèche sur la liste : 250 k, et
		//    la capture repart.
		for (let t = 300; t < 6500; t += 100) await envoyer({ type: 'fronts', salves: { D8: clk(t, t + 100) } });
		const e3 = await etat();
		// La DURÉE gardée (6 s depuis la relance à 100 ms), pas l'heure de la
		// simulation (6 100 ms) : Frank lisait 8,3 puis 22,3, 44,4, 99,7 s.
		check(/^Capture full: 6 s kept \(60 k edges per channel\)\. Click Restart capture to capture anew\.$/.test(e3),
			'pleine à 60 000 fronts : l’état dit la durée gardée, la profondeur et comment relancer', e3);

		// 5 bis. Le cas de Frank : on relance une capture pleine plus tard (6 500 ms).
		//        Pleine de nouveau à 12 500 ms, elle tient les mêmes 6 s.
		await relancer();
		check(/waiting for the trigger edge/.test(await etat()), 'vrai clic sur « Relancer » d’une capture pleine : elle repart', await etat());
		await envoyer({ type: 'fronts', salves: { D8: clk(6500, 6600), D9: [6540.05, 0, 6550.05, 1] } });
		for (let t = 6600; t < 12_600; t += 100) await envoyer({ type: 'fronts', salves: { D8: clk(t, t + 100) } });
		const e3b = await etat();
		check(e3b === e3, 'relancée plus tard, la capture pleine annonce la même durée, pas une heure qui grandit', `${e3} → ${e3b}`);

		await touche('bas');
		const r1 = await derniersReglages();
		check(r1?.profondeur === 250_000, 'flèche sur la liste : 250 k, envoyé à VS Code avec les réglages', JSON.stringify(r1));
		check((await liste2())?.valeur === '250000', 'la liste montre 250 k');
		await envoyer({ type: 'fronts', salves: { D8: clk(12_600, 12_700) } });
		const e4 = await etat();
		check(/waiting for the trigger edge/.test(e4), 'profondeur changée sur une capture pleine : nouvelle acquisition, déclenchement réarmé', e4);
		// 61 000 fronts de CLK depuis 12 600 ms : à 60 k, pleine à 18 600 ms.
		await envoyer({ type: 'fronts', salves: { D8: clk(12_700, 12_800), D9: [12_740.05, 0, 12_750.05, 1] } });
		for (let t = 12_800; t < 18_700; t += 100) await envoyer({ type: 'fronts', salves: { D8: clk(t, t + 100) } });
		check(/^Capturing… 18700\.0$/.test(await etat()), 'à 250 k, 61 000 fronts ne remplissent plus la capture', await etat());

		// 6. Simulation arrêtée : le bouton se grise, un clic ne vide rien.
		await envoyer({ type: 'arret' });
		const b1 = await bouton('relancer');
		check(b1?.grise === true, 'simulation arrêtée : le bouton se grise');
		await relancer();
		const e5 = await etat();
		check(/^Last capture: 18700\.0 ms$/.test(e5),'un clic sur le bouton grisé ne vide pas la dernière capture', e5);
		check((await liste2())?.textes[2]?.startsWith('60 k (≈'), 'la dernière capture garde son débit estimé');

		// 6 bis. 5 k (Frank, 26/09) : trois VRAIES flèches vers le haut depuis 250 k,
		//        puis un run déclenché à 50 ms. 5 000 fronts de CLK = pleine à 500 ms.
		for (let k = 0; k < 3; k++) await touche('haut');
		check((await liste2())?.valeur === '5000', 'trois flèches vers le haut : 5 k', JSON.stringify(await liste2()));
		check((await derniersReglages())?.profondeur === 5000, '5 k envoyé à VS Code avec les réglages');
		await envoyer({ type: 'depart' });
		await envoyer({ type: 'fronts', salves: { D8: clk(0, 100), D9: [50.05, 1] } });
		for (let t = 100; t < 1000; t += 100) await envoyer({ type: 'fronts', salves: { D8: clk(t, t + 100) } });
		const e6 = await etat();
		check(/^Capture full: 500 ms kept \(5 k edges per channel\)/.test(e6), 'à 5 k, la capture est pleine après 500 ms de signal', e6);
		await envoyer({ type: 'arret' });

		// 7. Projet rouvert : la profondeur enregistrée revient dans la liste.
		await envoyer({ type: 'restaure', etat: { voies: [], declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0, profondeur: 1_000_000 } });
		check((await liste2())?.valeur === '1000000', 'projet rouvert à 1 M : la liste le montre');
		await envoyer({ type: 'restaure', etat: { voies: [], declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0, profondeur: 12_345 } });
		check((await liste2())?.valeur === '60000', 'une profondeur inconnue retombe sur 60 k');
		await envoyer({ type: 'restaure', etat: { voies: [], declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0 } });
		check((await liste2())?.valeur === '60000', 'un projet sans profondeur rouvre à 60 k');

		const erreurs = await ev(`(window.__erreurs || []).join(' | ')`);
		check(!erreurs, 'la page ne lève aucune erreur', erreurs);
	} catch (e) {
		check(false, 'le banc s’est déroulé jusqu’au bout', String(e?.stack ?? e).slice(0, 400));
	} finally {
		try { ws?.close(); } catch { /* déjà fermé */ }
		proc.kill();
	}
}

await attendre(300);
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome relâche son profil un peu tard */ }

// Un banc qui n'a rien mesuré n'est pas un banc vert.
const total = ok + echecs.length;
if (total < 20) {
	echecs.push('le banc a joué tous ses contrôles');
	console.log(`  ✗ le banc a joué tous ses contrôles — seulement ${total} contrôle(s)`);
}
console.log(echecs.length ? `\n${echecs.length} échec(s) sur ${total}.` : `\n${ok} contrôles OK — profondeur réglable et « Relancer la capture » tiennent.`);
process.exit(echecs.length ? 1 : 0);
