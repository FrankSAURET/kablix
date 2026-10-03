// Banc : décodage 1-Wire stable quand on fait glisser la courbe (v2026.9.5.166),
// à la VRAIE souris.
//
// LA DEMANDE (Frank, 27/09, ds18b20-pico) : « Le 0xBe n'apparait pas. Si
// j'attrape la courbe et que je la fait défiler vers la gauche il apparait puis
// si je continue à bouger la courbe vers la gauche elle saute et affiche autre
// chose, la F1, F2 ne sont plus synchroniser et l'affichage. Ca se produit
// quelle que soit le facteur de zoom quand le premier octet après match rom
// commence à disparaître à gauche. »
//
// La cause : la vue ne décode que ce qu'elle montre (plus une marge). Le 1-Wire
// ne se comprend qu'à partir de son RESET : une tranche qui commence au milieu
// de l'adresse compte ses octets de travers, 0xBE n'est plus reconnu comme
// commande de fonction, et, pire, une tranche qui démarre au milieu d'un octet
// décale tous les bits suivants — octets faux, « 5 bits » en erreur.
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless piloté en CDP brut
// (`Input.dispatchMouseEvent`) : la courbe est tenue et glissée pour de vrai,
// F1 et F2 se posent pour de vrai. Ce qui est peint se relit en interceptant le
// contexte 2D. La référence est le décodage de TOUTE la capture, fait ici.
//
// Contre-épreuve : `node scripts/verify-analyseur-onewire-glisse.mjs --ancien`
// prend les sources de l'analyseur dans HEAD — le banc DOIT alors échouer.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-ow-glisse-'));
const PORT = 9435;
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
// Le décodeur de référence : toujours la version courante, sur toute la capture.
const sortieDecodeur = join(tmp, 'decodage.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur-decodage.mts')],
	outfile: sortieDecodeur, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { decoderTous } = await import(pathToFileURL(sortieDecodeur).href);

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

// --- Le signal : un DS18B20 lu comme le fait ds18b20-pico.py ------------------
// Durées du capteur simulé (relevées sur la vraie capture) : RESET 480 µs,
// présence 30 µs après, 110 µs ; slot de 70 µs ; le maître écrit un 1 en 6 µs,
// un 0 en 60 µs ; le capteur répond un 0 en 30 µs, un 1 laisse le creux du
// maître (6 µs).
const US = 1 / 1000;
const crc8 = (octets) => {
	let c = 0;
	for (const o of octets) {
		let b = o;
		for (let k = 0; k < 8; k++) {
			const melange = (c ^ b) & 1;
			c >>= 1;
			if (melange) c ^= 0x8c;
			b >>= 1;
		}
	}
	return c;
};
const ADRESSE = [0x28, 0x24, 0x61, 0xf5, 0x8c, 0x7e, 0xac, 0xe7];
const SCRATCHPAD = [0x30, 0x02, 0x4b, 0x46, 0x7f, 0xff, 0x0c, 0x10];
SCRATCHPAD.push(crc8(SCRATCHPAD));
const DQ = [];
const creux = (t, us) => { DQ.push(t, 0, t + us * US, 1); };
/** Une transaction : RESET, présence, octets écrits par le maître puis lus. */
const transaction = (t, ecrits, lus = []) => {
	creux(t, 480);
	creux(t + 510 * US, 110);
	let s = t + 960 * US;
	for (const [octets, zero] of [[ecrits, 60], [lus, 30]]) {
		for (const o of octets) {
			for (let k = 0; k < 8; k++) {
				creux(s, (o >> k) & 1 ? 6 : zero);
				s += 70 * US;
			}
		}
	}
};
transaction(1, [0xcc, 0x44]);
transaction(5, [0x55, ...ADRESSE, 0xbe], SCRATCHPAD);
transaction(20, [0xcc, 0x44]);

const REGLAGE = { protocole: 'onewire', id: 'd1', donnees: 0, bits: true };
const frontsObjets = [];
for (let i = 0; i < DQ.length; i += 2) frontsObjets.push({ t: DQ[i], niveau: DQ[i + 1] });
const REFERENCE = decoderTous([{ voie: 0, fronts: frontsObjets, niveauInitial: 1 }], [REGLAGE])
	.filter((a) => !a.bit && /^0x/.test(a.texte));
const BE = REFERENCE.find((a) => a.texte === '0xBE READ SCRATCHPAD');
const MATCH = REFERENCE.find((a) => a.texte === '0x55 MATCH ROM');

const VOIES = [{ voie: 0, nom: 'DQ', pin: 'GP14', probleme: null, analogique: false }];
const CAPTURE = {
	voies: [{ voie: 0, nom: 'DQ', pin: 'GP14', fronts: DQ, niveauInitial: 1 }],
	declenchement: null, decodages: [REGLAGE], voiesReglages: {}, echantillonnage: 0,
};
/** Vue de départ : 3 ms, le RESET du MATCH ROM près du bord gauche. */
const DEPART = { t0: 4.7, duree: 3 };

// Bande des F (analyseur-vue), et hauteur où la courbe se tient.
const Y_F = 52;
const Y_COURBE = 150;

console.log(`Référence : ${REFERENCE.length} octets décodés sur toute la capture, dont ${BE ? '0xBE READ SCRATCHPAD' : '— 0xBE ABSENT —'}`);
check(!!BE && !!MATCH && REFERENCE.some((a) => a.texte === `0x${SCRATCHPAD[8].toString(16).toUpperCase().padStart(2, '0')}`),
	'témoin : décodée en entier, la capture nomme 0x55 MATCH ROM et 0xBE READ SCRATCHPAD, CRC compris');

const chrome = [process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chrome) {
	check(false, 'Chrome introuvable — le banc n’a pas pu être joué');
} else {
	const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
		`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,500',
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
		const pret = async () => {
			for (let i = 0; i < 120; i++) {
				if (await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)) return true;
				await attendre(250);
			}
			return false;
		};
		const envoyer = (m) => ev(`window.postMessage(${JSON.stringify(m)}, '*')`);

		// La vue de départ passe par l'état que VS Code rend à l'onglet : c'est la
		// seule porte vers une fenêtre précise sans zoomer à la molette.
		check(await pret(), 'la page se dit prête');
		await ev(`sessionStorage.setItem('etat', ${JSON.stringify(JSON.stringify({ fenetre: DEPART, suivi: false }))})`);
		await cdp('Page.reload');
		await attendre(300);
		check(await pret(), 'rechargée avec la vue de départ, la page se dit prête');
		await envoyer({ type: 'voies', voies: VOIES });
		await envoyer({ type: 'restaure', etat: CAPTURE });
		await attendre(250);
		const boite = await ev(`(() => { const c = document.getElementById('trace'); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height, largeur: c.width }; })()`);

		// --- Outils ---------------------------------------------------------------
		const releve = async () => {
			await attendre(120);
			await ev(`window.__peint = []`);
			await envoyer({ type: 'repeindre' });
			await attendre(60);
			return ev('window.__peint');
		};
		const fenetre = async () => {
			await envoyer({ type: 'repeindre' });
			await attendre(60);
			return ev(`JSON.parse(sessionStorage.getItem('etat') || '{}').fenetre ?? null`);
		};
		const X_MIN = 104;
		const xMax = () => boite.largeur - 12;
		const plot = () => boite.largeur - 116;
		const xDe = (t, f) => X_MIN + ((t - f.t0) / f.duree) * plot();
		const tDe = (x, f) => f.t0 + ((x - X_MIN) / plot()) * f.duree;
		/** Milieu où la vue écrit le texte d'une annotation (bornée au tracé). */
		const milieu = (a, f) => {
			const x0 = xDe(a.t0, f);
			const x1 = xDe(a.t1, f);
			return (Math.max(X_MIN, x0) + Math.min(xMax(), Math.max(x1, x0 + 1))) / 2;
		};
		const X = (x) => Math.round(boite.left + x);
		const Y = (y) => Math.round(boite.top + y);
		const souris = (type, x, y, boutons) => cdp('Input.dispatchMouseEvent', {
			type, x: X(x), y: Y(y), button: type === 'mouseMoved' && !boutons ? 'none' : 'left', buttons: boutons, clickCount: type === 'mouseMoved' ? 0 : 1,
		});
		const glisser = async (x0, y0, x1, y1) => {
			await souris('mouseMoved', x0, y0, 0);
			await souris('mousePressed', x0, y0, 1);
			for (let k = 1; k <= 8; k++) {
				await souris('mouseMoved', x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8, 1);
				await attendre(15);
			}
			await souris('mouseReleased', x1, y1, 0);
			await attendre(100);
		};
		const drapeau = (vu, nom) => vu.find((p) => p.quoi === 'texte' && p.t === nom) ?? null;
		const octetsPeints = (vu) => vu.filter((p) => p.quoi === 'texte' && /^0x[0-9A-F]{2}( |$)/.test(p.t));
		const fmt = (x) => (x == null ? '—' : x.toFixed(1));

		/**
		 * Ce que la vue devrait montrer dans la fenêtre `f`, comparé à ce qu'elle
		 * peint : chaque octet écrit est un octet de la référence, à sa place ; tout
		 * octet entier à l'écran est écrit ; aucun octet tronqué (« n bits »).
		 */
		const ecarts = (vu, f) => {
			const e = [];
			for (const p of vu) if (p.quoi === 'texte' && / bits$/.test(p.t)) e.push(`« ${p.t} » à x ${fmt(p.x)}`);
			const peints = octetsPeints(vu);
			for (const p of peints) {
				if (!REFERENCE.some((a) => a.texte === p.t && Math.abs(milieu(a, f) - p.x) <= 1.5)) e.push(`« ${p.t} » à x ${fmt(p.x)} n’est pas dans la capture`);
			}
			for (const a of REFERENCE) {
				if (xDe(a.t0, f) < X_MIN + 1 || xDe(a.t1, f) > xMax() - 1) continue;
				if (!peints.some((p) => p.t === a.texte && Math.abs(milieu(a, f) - p.x) <= 1.5)) e.push(`« ${a.texte} » entier à l’écran mais pas écrit`);
			}
			return e;
		};

		// --- 1. Vue de départ -----------------------------------------------------
		console.log('Vue de départ');
		let f = await fenetre();
		check(!!f && Math.abs(f.t0 - DEPART.t0) < 1e-9 && Math.abs(f.duree - DEPART.duree) < 1e-9,
			'témoin : la vue reprend 3 ms à partir de 4,7 ms', JSON.stringify(f));
		let vu = await releve();
		let e = ecarts(vu, f);
		check(e.length === 0 && octetsPeints(vu).some((p) => p.t === '0x55 MATCH ROM'),
			'la vue montre RESET, 0x55 MATCH ROM et le début de l’adresse, comme la référence', e.join(' · '));
		// Teinte des commandes (Frank, 27/09) : le fond pâle peint SOUS le texte de
		// chaque octet — rose pour une commande, bleu pour l'adresse.
		const ROSE = ['#d37bc1', '#9e3699'];
		const BLEU = ['#2f7fd8', '#5a9ee6'];
		const fondDe = (p) => vu.find((r) => r.quoi === 'rect' && r.a > 0.1 && r.a < 0.5 &&
			p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.c ?? null;
		const teintes = octetsPeints(vu).map((p) => `${p.t} ${fondDe(p)}`);
		const commandes = octetsPeints(vu).filter((p) => / [A-Z]/.test(p.t));
		const adresse = octetsPeints(vu).filter((p) => /^0x[0-9A-F]{2}$/.test(p.t));
		check(commandes.length > 0 && commandes.every((p) => ROSE.includes(fondDe(p))),
			'0x55 MATCH ROM peint sur fond rose', teintes.join(' · '));
		check(adresse.length > 0 && adresse.every((p) => BLEU.includes(fondDe(p))),
			'les octets d’adresse restent sur fond bleu', teintes.join(' · '));
		const dossierImage = process.argv.find((a) => a.startsWith('--image='))?.slice('--image='.length);
		/** Capture dans les deux thèmes, variables posées comme VS Code le fait ; la page finit en sombre, comme au départ. */
		const photos = async (nom) => {
			if (!dossierImage) return;
			for (const th of [
				{ nom: 'clair', classe: 'vscode-light', fond: '#ffffff', texte: '#3b3b3b' },
				{ nom: 'sombre', classe: 'vscode-dark', fond: '#1f1f1f', texte: '#cccccc' },
			]) {
				await ev(`(() => {
					document.documentElement.style.setProperty('--vscode-editor-background', '${th.fond}');
					document.documentElement.style.setProperty('--vscode-foreground', '${th.texte}');
					document.body.style.background = '${th.fond}';
					document.body.className = '${th.classe}';
				})()`);
				await envoyer({ type: 'repeindre' });
				await attendre(150);
				const png = await cdp('Page.captureScreenshot', { format: 'png' });
				writeFileSync(join(dossierImage, `onewire-${nom}-${th.nom}.png`), Buffer.from(png.result.data, 'base64'));
			}
			await ev(`(() => { document.documentElement.removeAttribute('style'); document.body.removeAttribute('style'); document.body.className = ''; })()`);
			await envoyer({ type: 'repeindre' });
			await attendre(100);
		};
		await photos('commandes');

		// --- 2. F1 et F2 posés autour de 0xBE -------------------------------------
		// La courbe glisse d'abord jusqu'à montrer 0xBE au milieu, puis F1 et F2
		// se posent sur ses bords, à la vraie souris.
		console.log('F1 et F2 autour de 0xBE');
		const cible = { t0: (BE.t0 + BE.t1) / 2 - DEPART.duree / 2, duree: DEPART.duree };
		const aParcourir = ((cible.t0 - f.t0) / f.duree) * plot();
		for (let reste = aParcourir; reste > 0.5;) {
			const pas = Math.min(reste, 900);
			await glisser(1150, Y_COURBE, 1150 - pas, Y_COURBE);
			reste -= pas;
		}
		f = await fenetre();
		vu = await releve();
		const garage = { F1: drapeau(vu, 'F1'), F2: drapeau(vu, 'F2') };
		check(!!garage.F1 && !!garage.F2 && garage.F1.x < X_MIN, 'témoin : F1 et F2 attendent au garage');
		e = ecarts(vu, f);
		check(e.length === 0 && octetsPeints(vu).some((p) => p.t === '0xBE READ SCRATCHPAD'),
			'la courbe tirée jusqu’à 0xBE : « 0xBE READ SCRATCHPAD » est écrit, à sa place', e.join(' · '));
		// À 3 px à l'intérieur de l'octet : l'aimant les colle aux fronts qui le bordent.
		await glisser(garage.F1.x, Y_F, Math.round(xDe(BE.t0, f)) + 3, Y_F);
		await glisser(garage.F2.x, Y_F, Math.round(xDe(BE.t1, f)) - 3, Y_F);
		vu = await releve();
		const f1 = drapeau(vu, 'F1');
		const f2 = drapeau(vu, 'F2');
		check(!!f1 && !!f2 && f1.x > X_MIN && f2.x > f1.x, 'F1 et F2 posés sur la courbe', `F1 ${fmt(f1?.x)} · F2 ${fmt(f2?.x)}`);
		const tF1 = tDe(f1?.x ?? 0, f);
		const tF2 = tDe(f2?.x ?? 0, f);
		const texteBE = octetsPeints(vu).find((p) => p.t === '0xBE READ SCRATCHPAD');
		check(!!texteBE && texteBE.x > f1.x && texteBE.x < f2.x, '« 0xBE READ SCRATCHPAD » est écrit entre F1 et F2',
			`F1 ${fmt(f1?.x)} · texte ${fmt(texteBE?.x)} · F2 ${fmt(f2?.x)}`);
		await photos('be');

		// --- 3. Le glissé qui faisait tout sauter ---------------------------------
		// Retour au départ, puis la courbe est tenue et tirée vers la gauche, pas à
		// pas, sans la lâcher : à chaque pas, la vue relue doit dire la même chose
		// que la référence, et F1/F2 rester sur 0xBE.
		console.log('Glissé vers la gauche, de la vue de départ jusqu’après la lecture du scratchpad');
		for (let reste = ((f.t0 - DEPART.t0) / f.duree) * plot(); reste > 0.5;) {
			const pas = Math.min(reste, 900);
			await glisser(150, Y_COURBE, 150 + pas, Y_COURBE);
			reste -= pas;
		}
		f = await fenetre();
		check(Math.abs(f.t0 - DEPART.t0) < 0.01, 'témoin : ramenée à la main à la vue de départ', JSON.stringify(f));
		const PAS = 37; // px : ni multiple d'un slot (25,3 px) ni d'un octet (202 px)
		const FIN = 16.8; // ms : le CRC sorti à gauche
		let pas = 0;
		let pasSurBE = 0;
		let pasBEEntier = 0;
		const ecartsVus = [];
		const decalagesF = [];
		const horsDeF = [];
		while (f.t0 < FIN && pas < 400) {
			await souris('mouseMoved', 1150, Y_COURBE, 0);
			await souris('mousePressed', 1150, Y_COURBE, 1);
			for (let x = 1150 - PAS; x >= 150 && f.t0 < FIN; x -= PAS) {
				await souris('mouseMoved', x, Y_COURBE, 1);
				pas++;
				vu = await releve();
				f = await fenetre();
				for (const d of ecarts(vu, f)) if (ecartsVus.length < 12) ecartsVus.push(`t0 ${f.t0.toFixed(3)} ms : ${d}`);
				const beEntier = xDe(BE.t0, f) >= X_MIN + 1 && xDe(BE.t1, f) <= xMax() - 1;
				if (beEntier) pasBEEntier++;
				const g1 = drapeau(vu, 'F1');
				const g2 = drapeau(vu, 'F2');
				for (const [nom, g, tF] of [['F1', g1, tF1], ['F2', g2, tF2]]) {
					const attendu = xDe(tF, f);
					if (attendu < X_MIN + 2 || attendu > xMax() - 2) continue;
					if (!g || Math.abs(g.x - attendu) > 1) decalagesF.push(`t0 ${f.t0.toFixed(3)} : ${nom} à ${fmt(g?.x)}, attendu ${fmt(attendu)}`);
				}
				const b = octetsPeints(vu).find((p) => p.t === '0xBE READ SCRATCHPAD');
				if (beEntier && b && g1 && g2) {
					pasSurBE++;
					if (!(b.x > g1.x && b.x < g2.x)) horsDeF.push(`t0 ${f.t0.toFixed(3)} : texte ${fmt(b.x)}, F ${fmt(g1.x)}–${fmt(g2.x)}`);
				}
			}
			await souris('mouseReleased', 150, Y_COURBE, 0);
			await attendre(80);
			f = await fenetre();
		}
		console.log(`  (${pas} pas de ${PAS} px, vue finale à ${f.t0.toFixed(3)} ms)`);
		check(f.t0 >= FIN, 'témoin : le glissé a mené la vue au-delà du CRC', `t0 ${f.t0.toFixed(3)}`);
		check(ecartsVus.length === 0, 'à chaque pas, la vue écrit les octets de la capture, à leur place, sans « n bits » ni octet manquant',
			ecartsVus.join('\n      '));
		check(pasBEEntier > 5 && pasSurBE === pasBEEntier,
			'à chaque pas où 0xBE est entier à l’écran, « 0xBE READ SCRATCHPAD » est écrit', `${pasSurBE} / ${pasBEEntier} pas`);
		check(decalagesF.length === 0, 'F1 et F2 suivent la courbe au pixel', decalagesF.slice(0, 6).join(' · '));
		check(horsDeF.length === 0, 'et « 0xBE READ SCRATCHPAD » reste entre F1 et F2', horsDeF.slice(0, 6).join(' · '));

		const erreurs = await ev(`(window.__erreurs || []).join(' | ')`);
		check(erreurs === '', 'aucune erreur dans la page', erreurs);
	} catch (e) {
		check(false, 'le banc s’est déroulé jusqu’au bout', e?.stack ?? String(e));
	} finally {
		try { ws?.close(); } catch { /* */ }
		proc.kill();
		await attendre(300);
		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
	}
}
console.log(echecs.length === 0 ? `\nTout est vert (${ok} contrôles).` : `\n${echecs.length} échec(s) sur ${ok + echecs.length} contrôles.`);
process.exit(echecs.length === 0 ? 0 : 1);
