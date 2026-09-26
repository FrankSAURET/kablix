// Banc : flèches ⏮ ⏭ et déclenchement « début de trame » (v2026.9.5.153) ;
// trames identiques sautées (v2026.9.5.158).
//
// LA DEMANDE (Frank, 25/09) : « Rajoute des flèches (flèche avec trait vertical
// ⏮ ⏭) qui permettent de sauter d'une trame à l'autre en positionnant le début
// de la trame à gauche. Et du coup pour tous les protocoles, tu prévois un
// déclenchement sur début de trame comme pour le DMX ».
//
// Vrai HTML de l'onglet (AnalyseurPanel.html), vrai analyseur.mts, Chrome
// headless piloté en CDP brut : VRAIS clics sur ⏮ ⏭, sur les boutons dessinés
// des pistes et dans leurs menus. La position se lit À L'ÉCRAN — l'abscisse du
// front qui ouvre la trame — et dans la fenêtre que la page confie à VS Code.
//
// Contre-épreuve : `node scripts/verify-analyseur-trames.mjs --ancien` prend
// les sources de l'analyseur dans HEAD — le banc DOIT alors échouer.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-trames-'));
const PORT = 9429;
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
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/trames.projix');
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

// Ligne série 9600 bauds, 8N1 : trois trames (A, B, C), chacune ouverte par un
// start bit à un instant rond, au repos haut avant. Voie 1 : une horloge lente,
// sans décodage.
const BIT = 1000 / 9600;
const serie = (trames) => {
	const f = [];
	let niveau = 1;
	for (const { t: debut, octets } of trames) {
		let t = debut;
		const palier = (n) => { if (n !== niveau) { f.push(t, n); niveau = n; } t += BIT; };
		for (const o of octets) {
			palier(0);
			for (let k = 0; k < 8; k++) palier((o >> k) & 1);
			palier(1);
		}
	}
	return f;
};
const T_A = 2;
const T_B = 30;
const T_C = 60;
// Répétitions à l'identique de A et de B : ⏮ ⏭ les sautent (Frank, 26/09 —
// DmxSimple renvoie la même trame toutes les ~2 ms).
const T_A2 = 16;
const T_B2 = 45;
const TX = serie([
	{ t: T_A, octets: [0x41, 0x42] }, { t: T_A2, octets: [0x41, 0x42] },
	{ t: T_B, octets: [0x55, 0x43] }, { t: T_B2, octets: [0x55, 0x43] },
	{ t: T_C, octets: [0x5a] },
]);
const horloge = (pas, n) => { const f = []; for (let k = 1; k <= n; k++) f.push(k * pas, k % 2); return f; };
const VOIES = [
	{ voie: 0, nom: 'TX', pin: 'D1', probleme: null, analogique: false },
	{ voie: 1, nom: 'lent', pin: 'D9', probleme: null, analogique: false },
];
const CAPTURE = {
	voies: [
		{ voie: 0, nom: 'TX', pin: 'D1', fronts: TX, niveauInitial: 1 },
		{ voie: 1, nom: 'lent', pin: 'D9', fronts: horloge(10, 7), niveauInitial: 0 },
	],
	declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0,
};

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
	check(false, 'Chrome introuvable — le banc n’a pas pu être joué');
} else {
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,700',
		`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
	let ws;
	try {
		let liste = null;
		// 30 s : sous verify:all, sept bancs en parallèle, Chrome met parfois plus de 10 s à ouvrir son port.
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
		const envoyer = (m) => ev(`window.postMessage(${JSON.stringify(m)}, '*')`);
		const clic = async (x, y) => {
			const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
			await cdp('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
			await attendre(150);
		};
		/** Un bouton de la barre : présent, grisé ou non, et son centre. */
		const bouton = (idBouton) => ev(`(() => {
			const b = document.getElementById(${JSON.stringify(idBouton)});
			if (!b) return null;
			const r = b.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2, grise: b.disabled, texte: b.textContent };
		})()`);
		const cliquerBouton = async (idBouton) => {
			const b = await bouton(idBouton);
			if (!b) return false;
			await clic(b.x, b.y);
			return true;
		};
		/** Fenêtre de temps que la page vient de confier à VS Code. */
		const fenetre = async () => {
			await envoyer({ type: 'repeindre' });
			await attendre(80);
			return ev(`JSON.parse(sessionStorage.getItem('etat') || '{}').fenetre ?? null`);
		};
		/** Abscisses des fronts de la piste 0 : colonnes peintes à mi-hauteur, regroupées. */
		const fronts = async () => {
			await envoyer({ type: 'repeindre' });
			await attendre(80);
			return ev(`(() => {
				const c = document.getElementById('trace');
				const d = c.getContext('2d').getImageData(106, 42 + 23, c.width - 106 - 14, 1).data;
				const xs = [];
				for (let x = 0; x < d.length / 4; x++) {
					if (d[x * 4 + 3] <= 60) continue;
					if (xs.length && x - xs.at(-1).fin <= 1) xs.at(-1).fin = x;
					else xs.push({ debut: x, fin: x });
				}
				return xs.map((s) => 106 + (s.debut + s.fin) / 2);
			})()`);
		};
		/** Abscisse, à l'écran, d'un instant de la fenêtre (marges de analyseur-vue). */
		const xDe = (t, f) => ev(`(() => {
			const w = document.getElementById('trace').width;
			return 104 + (${t} - ${f.t0}) / ${f.duree} * (w - 104 - 12);
		})()`);
		/** Bouton dessiné d'une voie (colonne de gauche, rangée sous le nom). */
		const zone = (voie, quoi) => ev(`(() => {
			const r = document.getElementById('trace').getBoundingClientRect();
			const x = 8 + (${JSON.stringify({ teinte: 0, declenchement: 1, protocole: 2 })})[${JSON.stringify(quoi)}] * 22;
			return { x: r.left + x + 9, y: r.top + 42 + ${voie} * 64 + 15 + 8 + 9 };
		})()`);
		/** Ouvre un bouton de voie ; rend les entrées de son menu. */
		const ouvrirMenu = async (voie, quoi) => {
			const z = await zone(voie, quoi);
			await clic(z.x, z.y);
			return ev(`[...(document.querySelector('.flottant')?.querySelectorAll('button') ?? [])].map((x) => x.textContent.trim())`);
		};
		/** Clique l'entrée du menu ouvert dont le texte contient `libelle`. */
		const choisir = async (libelle) => {
			const b = await ev(`(() => {
				const e = [...(document.querySelector('.flottant')?.querySelectorAll('button') ?? [])]
					.find((x) => x.textContent.includes(${JSON.stringify(libelle)}));
				if (!e) return null;
				const r = e.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			})()`);
			if (!b) return false;
			await clic(b.x, b.y);
			return true;
		};
		const molette = async (crans) => {
			const r = await ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60 }; })()`);
			for (let i = 0; i < Math.abs(crans); i++) {
				await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(r.x), y: Math.round(r.y), deltaX: 0, deltaY: crans < 0 ? -100 : 100 });
				await attendre(30);
			}
			await attendre(150);
		};
		const pres = (a, b, tol) => Math.abs(a - b) <= tol;

		check(await pret(), 'la page se dit prête');
		await envoyer({ type: 'voies', voies: VOIES });
		await envoyer({ type: 'restaure', etat: CAPTURE });
		await attendre(150);

		// 1. Les flèches sont dans la barre, autour de ◀ ▶, grisées sans décodage.
		const prec = await bouton('trame-prec');
		const suiv = await bouton('trame-suiv');
		const gauche = await bouton('gauche');
		const droite = await bouton('droite');
		check(prec?.texte === '⏮' && suiv?.texte === '⏭', 'les flèches ⏮ ⏭ sont dans la barre', JSON.stringify({ prec, suiv }));
		check(!!prec && !!suiv && !!gauche && !!droite && prec.x < gauche.x && droite.x < suiv.x,
			'⏮ ◀ ▶ ⏭ dans cet ordre');
		check(prec?.grise === true && suiv?.grise === true, 'sans décodage, ⏮ ⏭ sont grisées');

		// 2. Décodage UART posé par le menu « P » de la voie : les flèches s'allument.
		await ouvrirMenu(0, 'protocole');
		const uart = await choisir('UART');
		const allumees = (await bouton('trame-prec'))?.grise === false && (await bouton('trame-suiv'))?.grise === false;
		check(uart && allumees, 'un décodage posé au menu allume ⏮ ⏭');

		// 3. Zoom à la molette, puis ⏮ jusqu'à la première trame.
		await molette(-8);
		const zoom = await fenetre();
		check(!!zoom && zoom.duree < 40, 'la molette a zoomé', JSON.stringify(zoom));
		for (let i = 0; i < 4; i++) await cliquerBouton('trame-prec');
		const surA = await fenetre();
		const marge = (f) => f.duree * 0.02;
		check(!!surA && pres(surA.t0, T_A - marge(surA), 1e-6),
			'⏮ répété : la première trame, son début au bord gauche', JSON.stringify(surA));
		check(!!surA && !!zoom && pres(surA.duree, zoom.duree, 1e-9), '⏮ garde le zoom', `${zoom?.duree} → ${surA?.duree}`);
		// À l'écran : le front qui ouvre la trame est le premier tracé, là où il doit être.
		if (surA) {
			const xs = await fronts();
			const xA = await xDe(T_A, surA);
			check(xs.length > 0 && pres(xs[0], xA, 2), 'à l’écran, le front d’ouverture est au bord gauche',
				`premier front à x=${xs[0]}, attendu ${xA.toFixed(1)}`);
		}

		// 4. ⏭ : trame suivante, puis la dernière, puis plus rien. Les
		//    répétitions identiques (A2, B2) sont sautées.
		await cliquerBouton('trame-suiv');
		const surB = await fenetre();
		check(!!surB && !pres(surB.t0, T_A2 - marge(surB), 1e-6), '⏭ saute la répétition identique de la première trame',
			JSON.stringify(surB));
		check(!!surB && pres(surB.t0, T_B - marge(surB), 1e-6), '⏭ : la trame suivante au bord gauche', JSON.stringify(surB));
		if (surB) {
			const xs = await fronts();
			const xB = await xDe(T_B, surB);
			check(xs.length > 0 && pres(xs[0], xB, 2), 'à l’écran, son front d’ouverture aussi',
				`premier front à x=${xs[0]}, attendu ${xB.toFixed(1)}`);
		}
		await cliquerBouton('trame-suiv');
		const surC = await fenetre();
		check(!!surC && pres(surC.t0, T_C - marge(surC), 1e-6), '⏭ encore : la dernière trame', JSON.stringify(surC));
		await cliquerBouton('trame-suiv');
		const toujoursC = await fenetre();
		check(!!toujoursC && !!surC && toujoursC.t0 === surC.t0, 'après la dernière trame, ⏭ ne bouge plus', JSON.stringify(toujoursC));
		await cliquerBouton('trame-prec');
		const retourB = await fenetre();
		check(!!retourB && !pres(retourB.t0, T_B2 - marge(retourB), 1e-6), '⏮ saute la répétition identique, lui aussi',
			JSON.stringify(retourB));
		check(!!retourB && pres(retourB.t0, T_B - marge(retourB), 1e-6), '⏮ ramène au début de la série d’avant', JSON.stringify(retourB));
		check(!!retourB && !!zoom && pres(retourB.duree, zoom.duree, 1e-9), 'le zoom n’a pas bougé de tout le parcours');

		// 5. Menu « T » de la voie décodée : « Frame start » ; la capture arrêtée
		//    se fige sur la première trame.
		const entrees = await ouvrirMenu(0, 'declenchement');
		check(entrees.some((e) => e.includes('Frame start')), 'menu T d’une voie décodée : « Frame start »', entrees.join(' | '));
		await choisir('Frame start');
		const reglage = await ev(`window.__msgs.filter((m) => m.type === 'analyseurReglages').at(-1)?.declenchement ?? null`);
		check(reglage?.voie === 0 && reglage?.sens === 'trame', 'le déclenchement « trame » est envoyé à l’hôte', JSON.stringify(reglage));
		const surDecl = await fenetre();
		check(!!surDecl && pres(surDecl.t0, T_A - surDecl.duree * 0.1, 1e-6),
			'capture arrêtée : le déclenchement trouve la première trame et y amène la vue', JSON.stringify(surDecl));

		// 6. Menu « T » d'une voie sans décodage : pas de « Frame start ».
		const entreesLent = await ouvrirMenu(1, 'declenchement');
		check(entreesLent.length > 0 && !entreesLent.some((e) => e.includes('Frame start')),
			'menu T d’une voie sans décodage : pas de « Frame start »', entreesLent.join(' | '));

		// 7. Projet rouvert avec un décodage `d1` : un décodage ajouté ensuite au
		//    menu prend un autre identifiant (le compteur reprenait à `d1`).
		//    Page neuve : celle d'avant a déjà compté un décodage.
		const erreursAvant = await ev(`(window.__erreurs || []).join(' | ')`);
		await ev(`sessionStorage.clear(); location.reload(); true`);
		await attendre(500);
		check(await pret(), 'la page rechargée se dit prête');
		await envoyer({ type: 'voies', voies: VOIES });
		await envoyer({ type: 'restaure', etat: { ...CAPTURE, decodages: [{ protocole: 'uart', id: 'd1', donnees: 0, bauds: 9600 }] } });
		await attendre(150);
		await ouvrirMenu(1, 'protocole');
		await choisir('UART');
		const ids = await ev(`(window.__msgs.filter((m) => m.type === 'analyseurReglages').at(-1)?.decodages ?? []).map((d) => d.id)`);
		check(ids.length === 2 && new Set(ids).size === 2, 'projet rouvert : un décodage ajouté prend un nouvel identifiant', JSON.stringify(ids));

		const erreurs = [erreursAvant, await ev(`(window.__erreurs || []).join(' | ')`)].filter(Boolean).join(' | ');
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
if (total < 18) {
	echecs.push('le banc a joué tous ses contrôles');
	console.log(`  ✗ le banc a joué tous ses contrôles — seulement ${total} contrôle(s)`);
}
console.log(echecs.length ? `\n${echecs.length} échec(s) sur ${total}.` : `\n${ok} contrôles OK — ⏮ ⏭ et « début de trame » tiennent.`);
process.exit(echecs.length ? 1 : 0);
