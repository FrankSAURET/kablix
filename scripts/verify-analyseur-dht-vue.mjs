// Vérifie que l'onglet de l'analyseur ÉCRIT les valeurs d'une trame DHT, à
// tous les zooms où on la regarde (Frank, 23/09 : « je ne vois pas les valeurs
// s'afficher. juste départ. »).
//
// DEUX DÉFAUTS SE CUMULAIENT, et `verify-analyseur.mjs` (Node pur) ne pouvait
// voir ni l'un ni l'autre : il prouve le décodeur sur la capture ENTIÈRE, jamais
// ce que la vue en écrit.
// - De loin (le DÉPART de 18 ms lisible), la trame de 4 ms n'a qu'une dizaine
//   de pixels : aucun texte n'y tient. Et de près, la mesure posée sur le même
//   intervalle que les octets n'était jamais écrite (un texte par intervalle).
// - De près, le décodage ne porte que sur la fenêtre visible (+10 %) : le
//   DÉPART, 18 ms plus tôt, en sort, et sans lui le décodeur ne reconnaît plus
//   la trame. Rien n'est décodé du tout.
//
// Vrai HTML de l'onglet, vrai analyseur.mts, Chrome headless piloté en CDP brut.
// Le zoom se fait à la vraie molette (`Input.dispatchMouseEvent`), cran par
// cran, du cadrage « toute la capture » jusqu'aux bits ; à chaque cran, on
// relève ce que la vue écrit (interception de `fillText`).
//
// Contre-épreuve sans toucher aux sources : `--ancien=<fichiers>` compile les
// fichiers nommés dans leur version du dernier enregistrement git (HEAD), par
// exemple `--ancien=analyseur,analyseur-vue,analyseur-decodage`. Le banc DOIT
// alors échouer.
//
// Usage : node scripts/verify-analyseur-dht-vue.mjs [--ancien=a,b,c]
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-dht-vue-'));
const PORT = 9417;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const ancien = (process.argv.find((a) => a.startsWith('--ancien=')) ?? '').slice('--ancien='.length).split(',').filter(Boolean);

let echecs = 0;
const check = (nom, ok, detail = '') => {
	if (ok) console.log(`  ✅ ${nom}`);
	else {
		echecs++;
		console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`);
	}
};

// --- Trame DHT11 fabriquée par l'encodeur du MOTEUR --------------------------
await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/engines/dht22.mts')],
	outfile: join(tmp, 'dht22.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { buildDht22Schedule } = await import(pathToFileURL(join(tmp, 'dht22.mjs')).href);
/** Départ du maître (18 ms bas, comme le pilote MicroPython du DHT11) puis la réponse. */
const trame = (tDepart) => {
	const f = [tDepart, 0, tDepart + 18, 1];
	const debut = tDepart + 18 + 0.03;
	for (const e of buildDht22Schedule(22, 50, 0, 1, 'dht11')) f.push(debut + e.cycle / 1000, e.value ? 1 : 0);
	return f;
};
// Trois lectures, 150 ms d'écart : « toute la capture » montre alors ~330 ms,
// où le DÉPART est lisible et une trame n'a qu'une dizaine de pixels. On zoome
// sur celle du MILIEU : ancrée près d'un bord, elle sortirait de l'écran.
const L = trame(0).length;
const fronts = [...trame(10), ...trame(160), ...trame(310)];
const T_DEBUT = fronts[0];
const T_FIN = fronts[fronts.length - 2];
const TRAME = { t0: 160 + 18.03, t1: fronts[2 * L - 2] };

// --- Page : vrai HTML de l'onglet, vrai bundle -------------------------------
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
let html = AnalyseurPanel.html({ asWebviewUri: (u) => u, cspSource: 'x:' }, { fsPath: 'W:/ext' }, 'W:/p/banc.projix');

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
const page = await esbuild.build({
	entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
	bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', logLevel: 'silent',
	plugins: [versionHead],
});
if (ancien.length) console.log(`(contre-épreuve : ${ancien.join(', ')} en version HEAD)`);
const nonce = /'nonce-([^']+)'/.exec(html)?.[1];
const bundle = page.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// `fillText` relevé AVANT que l'onglet ne dessine : chaque texte écrit, avec sa
// position, son alignement et sa largeur.
const ESPION = `
window.__msgs = [];
window.acquireVsCodeApi = () => ({ postMessage(m) { window.__msgs.push(m); }, setState() {} });
window.__textes = [];
const origine = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...r) {
	window.__textes.push({ t: String(t), x, y, align: this.textAlign, w: this.measureText(String(t)).width });
	return origine.call(this, t, x, y, ...r);
};`;
html = html
	.replace('</head>', `<script nonce="${nonce}">${ESPION}</script></head>`)
	.replace(/<script nonce="[^"]*" src="[^"]*"><\/script>/, () => `<script nonce="${nonce}">${bundle}</script>`);
const fichierPage = join(tmp, 'onglet.html');
writeFileSync(fichierPage, html);

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
	`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'profil')}`, '--window-size=1200,700',
	`file:///${fichierPage.replace(/\\/g, '/')}`], { stdio: 'ignore' });
let ws;
try {
	let liste = null;
	for (let i = 0; i < 40 && !liste; i++) {
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
	for (let i = 0; i < 40 && !(await ev(`(window.__msgs || []).some((m) => m.type === 'analyseurPret')`)); i++) await attendre(250);

	// La capture arrive comme à la réouverture d'un .projix : décodage DHT11 réglé
	// sur la voie de la pince, cadrage « toute la capture ».
	const etat = {
		voies: [{ voie: 0, nom: 'DATA', pin: 'GP22', fronts, niveauInitial: 1 }],
		decodages: [{ protocole: 'dht', id: 'd1', donnees: 0, modele: 'dht11' }],
	};
	await ev(`window.postMessage(${JSON.stringify({ type: 'restaure', etat })}, '*')`);
	await attendre(200);

	/** Textes écrits sous la piste 0 (bande des annotations) au prochain rendu forcé. */
	const Y_ANNOT = 22 + 46 + 1 + (14 - 3) / 2;
	const releve = async () => {
		await ev(`window.__textes = []`);
		await ev(`window.postMessage({ type: 'repeindre' }, '*')`);
		await attendre(60);
		const t = await ev('window.__textes');
		return t.filter((x) => Math.abs(x.y - Y_ANNOT) < 0.6).map((x) => {
			const g = x.align === 'center' ? x.x - x.w / 2 : x.align === 'right' ? x.x - x.w : x.x;
			return { t: x.t, g, d: g + x.w };
		});
	};
	const r = await ev(`(() => { const r = document.getElementById('trace').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width }; })()`);
	// Abscisse du milieu de la trame visée dans le cadrage « toute la capture »
	// (`ajuster()` : 1 % de marge de chaque côté).
	const etendue = T_FIN - T_DEBUT;
	const f0 = { t0: T_DEBUT - etendue * 0.01, duree: etendue * 1.02 };
	const plot = r.w - 104 - 12;
	const tMilieu = (TRAME.t0 + TRAME.t1) / 2;
	const xAncre = r.left + 104 + ((tMilieu - f0.t0) / f0.duree) * plot;
	const molette = async () => {
		const p = { x: Math.round(xAncre), y: Math.round(r.top + 40) };
		await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, buttons: 0 });
		await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', ...p, deltaX: 0, deltaY: -100 });
		await attendre(40);
	};

	const RESUME = '50 %HR · 22 °C · somme ✓';
	const CHAMPS = ['0x32 0x00 · 50 %HR', '0x16 0x00 · 22 °C', '0x48 · somme ✓'];
	const CRANS = 19; // 330 ms × 0,8^19 ≈ 4,7 ms : la trame entière, bits lisibles
	const parCran = [];
	for (let k = 0; k <= CRANS; k++) {
		if (k > 0) await molette();
		parCran.push(await releve());
	}
	const dire = (l) => l.map((x) => `« ${x.t} »`).join(' ');
	if (process.argv.includes('--detail')) parCran.forEach((l, k) => console.log(`  cran ${String(k).padStart(2)} : ${l.map((x) => `${x.t} [${x.g.toFixed(0)}-${x.d.toFixed(0)}]`).join(' | ')}`));

	console.log('Onglet de l\'analyseur, trame DHT11 (50 %HR, 22 °C), zoom à la molette');
	check('témoin : la molette zoome vraiment (les textes du dernier cran diffèrent du premier)',
		dire(parCran[0]) !== dire(parCran[CRANS]), `${dire(parCran[0])} / ${dire(parCran[CRANS])}`);
	const large = parCran[0];
	check('toute la capture : le DÉPART est écrit', large.some((x) => x.t === 'DÉPART'), dire(large));
	check(`toute la capture : la mesure est écrite en clair (« ${RESUME} »)`,
		large.some((x) => x.t === RESUME), dire(large));
	const muets = parCran
		.map((l, k) => ({ k, l }))
		.filter(({ l }) => !(l.some((x) => x.t.includes('50 %HR')) && l.some((x) => x.t.includes('22 °C'))));
	check('à CHAQUE cran de zoom, l\'humidité ET la température sont écrites',
		muets.length === 0, muets.map(({ k, l }) => `cran ${k} : ${dire(l) || 'rien'}`).join(' · '));
	const pres = parCran[CRANS];
	check('de près : les trois champs écrits en entier, octets et valeur, sans résumé',
		CHAMPS.every((c) => pres.some((x) => x.t === c)) && !pres.some((x) => x.t === RESUME), dire(pres));
	const chevauchements = [];
	parCran.forEach((l, k) => {
		for (let i = 0; i < l.length; i++) {
			for (let j = i + 1; j < l.length; j++) {
				if (l[i].g < l[j].d - 0.5 && l[j].g < l[i].d - 0.5) chevauchements.push(`cran ${k} : « ${l[i].t} » / « ${l[j].t} »`);
			}
		}
	});
	check('aucun texte n\'en recouvre un autre, à aucun cran', chevauchements.length === 0, chevauchements.slice(0, 4).join(' · '));
} catch (e) {
	echecs++;
	console.log('  ❌ ÉCHEC', e?.stack ?? e);
} finally {
	try { ws?.close(); } catch { /* */ }
	proc.kill();
	await attendre(300);
	try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
}
console.log(echecs === 0 ? '\nTout est vert.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
