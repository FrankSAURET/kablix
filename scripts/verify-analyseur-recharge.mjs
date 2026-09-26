// Banc : l'onglet de l'analyseur RECHARGÉ par VS Code garde ses courbes
// (v2026.9.5.149).
//
// LE DÉFAUT (Frank, 25/09) : « si je déplace l'onglet VS Code, sur un autre
// écran par exemple, les courbes disparaissent ». VS Code RECHARGE la page d'un
// onglet qu'on déplace vers une autre fenêtre : elle repart vide et se redit
// « prête ». Or l'hôte ne lui rendait alors que la capture d'un ancien .projix
// (le plus souvent rien), et tout ce qu'il lui avait posté pendant le
// rechargement s'était perdu. La mesure du run n'existait plus que dans le
// journal CSV.
//
// Trois volets, chacun avec du VRAI code :
//   A. L'HÔTE. Vrais panel.ts, analyseur-panel.ts et journal, faux `vscode`. On
//      rejoue un run, on « recharge » la page au milieu, et on exige que la page
//      rechargée reçoive voies, départ puis TOUTE la mesure — dans cet ordre, et
//      sans rejouer en plus la file d'attente.
//   B. LA CAPTURE (Node). Rendre une mesure entière à la page doit donner la
//      MÊME capture que le run vu en direct : fenêtre autour du déclenchement,
//      capture pleine au même front, fin du run sans lui.
//   C. LA PAGE (Chrome). Le vrai analyseur.mts reçoit la séquence de l'hôte ;
//      on lit son état (« capture pleine à … ») et on compte les pixels des
//      pistes.
//
// Contre-épreuve : `node scripts/verify-analyseur-recharge.mjs --ancien` prend
// les fichiers du lot dans HEAD (greffon esbuild, `git show`) — le banc DOIT
// alors échouer. `--ancien=src/panel.ts,…` n'en prend que certains.
import esbuild from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-analyseur-recharge-'));

// Le journal vit sous os.tmpdir() : dossier PRIVÉ, sinon verify-analyseur-journal
// (peut-être lancé en même temps) balaierait nos journaux en plein banc.
const tempPrive = join(tmp, 'temp');
mkdirSync(tempPrive, { recursive: true });
process.env.TEMP = tempPrive;
process.env.TMP = tempPrive;
process.env.TMPDIR = tempPrive;

let ok = 0;
const echecs = [];
/** `cond` peut être une fonction : une exception vaut échec NOMMÉ, pas mort du banc. */
const check = (cond, titre, detail = '') => {
	let vrai = false;
	try { vrai = typeof cond === 'function' ? !!cond() : !!cond; } catch (e) { detail = `exception : ${e?.message ?? e}`; }
	if (vrai) { ok++; console.log(`  ✓ ${titre}`); return; }
	echecs.push(titre);
	console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`);
};

// --- Contre-épreuve : fichiers du lot pris dans HEAD -------------------------
const LOT = [
	'src/analyseur-journal.ts',
	'src/panel.ts',
	'src/analyseur-panel.ts',
	'src/webview/analyseur-capture.mts',
	'src/webview/analyseur.mts',
];
const argAncien = process.argv.find((a) => a.startsWith('--ancien'));
const ANCIENS = !argAncien ? [] : argAncien.includes('=') ? argAncien.split('=')[1].split(',') : LOT;
if (ANCIENS.length) console.log(`(contre-épreuve : ${ANCIENS.join(', ')} en version HEAD)`);
const versionHead = {
	name: 'version-head',
	setup(b) {
		b.onLoad({ filter: /[\\/]src[\\/].*\.m?ts$/ }, (args) => {
			const rel = relative(ROOT, args.path).replace(/\\/g, '/');
			if (!ANCIENS.includes(rel)) return undefined;
			const contents = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
			return { contents, loader: 'ts', resolveDir: dirname(args.path) };
		});
	},
};

// --- Signal commun aux volets B et C -----------------------------------------
// GP0 : horloge rapide, un front toutes les 10 µs (le DMX en fait autant).
// GP1 : signal lent, un front toutes les 0,5 ms ; il MONTE à 0,5 ms — c'est le
// front de déclenchement. GP0 remplit la profondeur de la page (60 000 fronts)
// bien avant la fin : la capture déclenchée doit se figer à 600 ms.
function signal(nGP0 = 150_000, nGP1 = 3000) {
	const GP0 = [];
	for (let k = 1; k <= nGP0; k++) GP0.push(k / 100, k % 2);
	const GP1 = [];
	for (let k = 1; k <= nGP1; k++) GP1.push(k / 2, k % 2);
	return { GP0, GP1 };
}

// ============================================================================
// A. L'HÔTE : la page rechargée reçoit toute la mesure
// ============================================================================
console.log('A. hôte');
const STUB = `
import { posix } from 'node:path';
const vs = (globalThis.__vs ||= { panneaux: [] });
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (base, ...parts) => uri(posix.join(base.fsPath, ...parts)) };
export const ViewColumn = { One: 1, Two: 2, Active: -1, Beside: -2 };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
function nouveauPanneau(viewType, title) {
  const p = {
    viewType, title, visible: true, recu: [],
    webview: {
      html: '', options: {}, cspSource: 'x:', asWebviewUri: (u) => u,
      postMessage(m) { p.recu.push(m); return Promise.resolve(true); },
      onDidReceiveMessage(f) { p._onMsg = f; return { dispose() {} }; },
    },
    onDidDispose(f) { p._onDispose = f; return { dispose() {} }; },
    onDidChangeViewState() { return { dispose() {} }; },
    reveal() { p.visible = true; },
    dispose() { p._onDispose?.(); },
  };
  vs.panneaux.push(p);
  return p;
}
export const window = {
  createWebviewPanel: (viewType, title) => nouveauPanneau(viewType, title),
  registerWebviewPanelSerializer: () => ({ dispose() {} }),
  showSaveDialog: async () => undefined,
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  setStatusBarMessage: () => ({ dispose() {} }),
  activeTextEditor: undefined,
  tabGroups: { all: [], close: async () => {} },
  onDidChangeActiveTextEditor: () => ({ dispose() {} }),
  registerCustomEditorProvider: () => ({ dispose() {} }),
  visibleTextEditors: [],
  createTextEditorDecorationType: () => ({ dispose() {} }),
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/espace') }],
  fs: { writeFile: async () => {}, readFile: async () => new Uint8Array(), stat: async () => ({ type: 1 }), delete: async () => {} },
  getConfiguration: () => ({ get: (_k, d) => d, update: async () => {} }),
  onDidSaveTextDocument: () => ({ dispose() {} }),
  onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }),
  openTextDocument: async () => { throw new Error('non utilisé'); },
  asRelativePath: (p) => (typeof p === 'string' ? p : p.fsPath),
  applyEdit: async () => true,
  createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }), dispose() {} }),
};
export const commands = { executeCommand: async () => undefined, registerCommand: () => ({ dispose() {} }) };
export const env = { clipboard: { readText: async () => '', writeText: async () => {} }, openExternal: async () => true, language: 'en' };
export const Range = class {}; export const Position = class {}; export const Selection = class {};
export const ThemeIcon = class {}; export const EventEmitter = class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} };
export const TextEdit = { replace: () => ({}) };
export const WorkspaceEdit = class { replace() {} };
export const Disposable = class { static from() { return { dispose() {} }; } dispose() {} };
export const TabInputCustom = class {}; export const TabInputText = class {};
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ProgressLocation = { Notification: 15 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const RelativePattern = class {};
export const OverviewRulerLane = { Full: 7 };
export default { Uri, ViewColumn, l10n, window, workspace, commands, env };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);
{
	const sortie = join(tmp, 'panel.mjs');
	await esbuild.build({
		entryPoints: [join(ROOT, 'src/panel.ts')],
		outfile: sortie, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		alias: { vscode: join(tmp, 'vscode-stub.mjs') },
		plugins: [versionHead],
	});
	const { SimulatorPanel } = await import(pathToFileURL(sortie).href);
	const vs = globalThis.__vs;

	let numero = 0;
	/** Atelier minimal : pas de webview à lui, mais le VRAI relais vers l'onglet. */
	const atelier = (projet) => {
		const p = Object.create(SimulatorPanel.prototype);
		p.panelId = `recharge-${++numero}`;
		p.documentUri = { fsPath: projet, scheme: 'file', toString: () => projet };
		p.projectUri = p.documentUri;
		p.projectBaseName = projet.replace(/^.*\//, '').replace(/\.projix$/, '');
		p.projectDirty = false;
		p.analyseurVoies = [];
		p.analyseurCapture = null;
		p.analyseurReglages = null;
		p.analyseurEnCours = false;
		p.post = () => {};
		p.updateTitle = () => {};
		p.panel = { onDocEdit: () => {} };
		p.extensionUri = { fsPath: 'W:/ext', scheme: 'file' };
		return p;
	};
	const VOIES = [
		{ voie: 0, pin: 'GP14', nom: 'SDA', probleme: null, analogique: false, suivi: false },
		{ voie: 1, pin: 'GP15', nom: 'SCL', probleme: null, analogique: false, suivi: false },
	];
	/** Salve n°k : deux fronts sur GP14, un sur GP15, sans recouvrement. */
	const salve = (k) => ({ GP14: [k, 1, k + 0.5, 0], GP15: [k + 0.25, k % 2] });
	const fronts = (pin, de, a) => {
		const out = [];
		for (let k = de; k <= a; k++) out.push(...salve(k)[pin]);
		return out;
	};
	const pret = (pan) => {
		const avant = pan.recu.length;
		pan._onMsg({ type: 'analyseurPret' });
		return pan.recu.slice(avant);
	};
	const types = (msgs) => msgs.map((m) => m.type).join(', ');
	const frontsDe = (msg, pin) => msg?.etat?.voies?.find((v) => v.pin === pin)?.fronts ?? [];

	// A1. Onglet ouvert, run en cours, page déplacée vers une autre fenêtre.
	{
		const p = atelier('W:/projet/recharge.projix');
		p.onMessage({ type: 'analyseurVoies', voies: VOIES });
		p.onMessage({ type: 'openAnalyseur' });
		const pan = vs.panneaux.at(-1);
		pret(pan);
		p.onMessage({ type: 'analyseurDepart' });
		for (let k = 1; k <= 5; k++) p.onMessage({ type: 'analyseurFronts', salves: salve(k) });
		check(pan.recu.filter((m) => m.type === 'fronts').length === 5, 'A1 : avant le déplacement, la page reçoit ses salves en direct');
		// Rechargement : ce que l'hôte poste maintenant se perd, la page n'écoute plus.
		for (let k = 6; k <= 7; k++) p.onMessage({ type: 'analyseurFronts', salves: salve(k) });
		const apres = pret(pan);
		check(types(apres) === 'voies, depart, restaure',
			'A1 : page rechargée en plein run — voies, PUIS départ, PUIS la mesure', types(apres));
		const r = apres.find((m) => m.type === 'restaure');
		check(JSON.stringify(frontsDe(r, 'GP14')) === JSON.stringify(fronts('GP14', 1, 7)),
			'A1 : la mesure rendue porte TOUS les fronts de GP14, même ceux postés pendant le rechargement',
			`${frontsDe(r, 'GP14').length / 2} fronts rendus pour 14 versés`);
		check(JSON.stringify(frontsDe(r, 'GP15')) === JSON.stringify(fronts('GP15', 1, 7)),
			'A1 : et tous ceux de GP15', `${frontsDe(r, 'GP15').length / 2} fronts rendus pour 7 versés`);
		check(!apres.some((m) => m.type === 'fronts'), 'A1 : aucune salve rejouée EN PLUS de la mesure (pas de fronts en double)', types(apres));
		p.onMessage({ type: 'analyseurFronts', salves: salve(8) });
		check(pan.recu.at(-1)?.type === 'fronts', 'A1 : le run continue, la page rechargée reçoit la suite en direct');
		// Second déplacement, simulation arrêtée : pas de départ, la mesure entière.
		p.onMessage({ type: 'analyseurArret' });
		const fin = pret(pan);
		check(types(fin) === 'voies, restaure', 'A1 : rechargée à l’arrêt — voies et mesure, aucun départ', types(fin));
		check(JSON.stringify(frontsDe(fin.at(-1), 'GP14')) === JSON.stringify(fronts('GP14', 1, 8)),
			'A1 : la mesure rendue à l’arrêt va jusqu’au dernier front', `${frontsDe(fin.at(-1), 'GP14').length / 2} fronts`);
		// Onglet déjà vivant qu'on révèle : ses voies seulement, sa capture est à lui.
		const avant = pan.recu.length;
		p.onMessage({ type: 'openAnalyseur' });
		check(types(pan.recu.slice(avant)) === 'voies', 'A1 : révéler l’onglet ne lui renvoie que ses voies', types(pan.recu.slice(avant)));
		pan.dispose();
	}

	// A2. Onglet ouvert POUR LA PREMIÈRE FOIS en plein run, salves en file d'attente.
	{
		const p = atelier('W:/projet/milieu.projix');
		p.onMessage({ type: 'analyseurVoies', voies: VOIES });
		p.onMessage({ type: 'analyseurDepart' });
		for (let k = 1; k <= 3; k++) p.onMessage({ type: 'analyseurFronts', salves: salve(k) });
		p.onMessage({ type: 'openAnalyseur' });
		const pan = vs.panneaux.at(-1);
		p.onMessage({ type: 'analyseurFronts', salves: salve(4) }); // page pas encore prête : en file
		const apres = pret(pan);
		check(types(apres) === 'voies, depart, restaure', 'A2 : onglet ouvert en plein run — voies, départ, mesure', types(apres));
		check(JSON.stringify(frontsDe(apres.at(-1), 'GP14')) === JSON.stringify(fronts('GP14', 1, 4)),
			'A2 : la mesure porte le run depuis son début, file d’attente comprise', `${frontsDe(apres.at(-1), 'GP14').length / 2} fronts`);
		check(!pan.recu.some((m) => m.type === 'fronts'), 'A2 : la file d’attente n’est pas rejouée par-dessus', types(pan.recu));
		pan.dispose();
	}

	// A3. Ancien .projix porteur d'une capture : elle ne vaut que tant qu'aucun run
	// n'a eu lieu. Juste après un départ, le journal est vide — rendre la vieille
	// mesure la ferait rejouer devant les fronts du run qui commence.
	{
		const p = atelier('W:/projet/ancien.projix');
		p.analyseurCapture = { voies: [{ voie: 0, pin: 'GP14', nom: 'SDA', fronts: [900, 1, 950, 0] }] };
		p.analyseurReglages = { declenchement: { voie: 0, sens: 'rising' }, decodages: [], voiesReglages: {}, echantillonnage: 0 };
		p.onMessage({ type: 'analyseurVoies', voies: VOIES });
		p.onMessage({ type: 'openAnalyseur' });
		let pan = vs.panneaux.at(-1);
		const avantRun = pret(pan);
		check(JSON.stringify(frontsDe(avantRun.at(-1), 'GP14')) === '[900,1,950,0]',
			'A3 : avant tout run, la page reçoit la capture du .projix', types(avantRun));
		p.onMessage({ type: 'analyseurDepart' });
		const apres = pret(pan);
		const r = apres.find((m) => m.type === 'restaure');
		check(r && frontsDe(r, 'GP14').length === 0, 'A3 : run qui démarre — la vieille mesure du .projix n’est PAS rendue',
			JSON.stringify(r?.etat?.voies));
		check(r?.etat?.declenchement?.sens === 'rising', 'A3 : mais les réglages, si (le déclenchement du projet)', JSON.stringify(r?.etat));
		pan.dispose();
	}

	// A4. Run long : le journal ne rend pas des millions de fronts, mais la tête
	// (capture déclenchée tôt) et la queue (fin du run) de chaque broche.
	{
		const p = atelier('W:/projet/long.projix');
		p.onMessage({ type: 'analyseurVoies', voies: VOIES });
		p.onMessage({ type: 'analyseurDepart' });
		const N = 250_000;
		for (let k = 0; k < N; k += 1000) {
			const plat = [];
			for (let i = k; i < k + 1000; i++) plat.push(i / 100, i % 2);
			p.onMessage({ type: 'analyseurFronts', salves: { GP14: plat } });
		}
		p.onMessage({ type: 'openAnalyseur' });
		const pan = vs.panneaux.at(-1);
		const f = frontsDe(pret(pan).at(-1), 'GP14');
		const n = f.length / 2;
		check(n >= 140_000 && n <= 160_000, 'A4 : un run de 250 000 fronts est rendu en tête + queue bornées', `${n} fronts`);
		check(f[0] === 0 && f[2 * 69_999] === 69_999 / 100, 'A4 : la tête est le DÉBUT du run, sans trou', `${f[0]} … ${f[2 * 69_999]}`);
		check(f.at(-2) === (N - 1) / 100, 'A4 : la queue finit au DERNIER front du run', `${f.at(-2)}`);
		let ordonne = true;
		for (let i = 2; i < f.length; i += 2) if (f[i] <= f[i - 2]) { ordonne = false; break; }
		check(ordonne, 'A4 : fronts rendus dans l’ordre du temps');
		pan.dispose();
	}

	// A5. Profondeur réglée dans l'onglet (v2026.9.5.161) : la mémoire du journal
	// la suit. À 250 000 fronts par voie, une tête de 70 000 ne rendrait à la page
	// rechargée qu'un bout de sa capture déclenchée tôt.
	{
		const p = atelier('W:/projet/profond.projix');
		p.onMessage({ type: 'analyseurVoies', voies: VOIES });
		p.onMessage({ type: 'openAnalyseur' });
		const pan = vs.panneaux.at(-1);
		pret(pan);
		const reglages = (profondeur) => ({ type: 'analyseurReglages', declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0, profondeur });
		pan._onMsg(reglages(250_000));
		check(() => p.analyseurPourProjix()?.profondeur === 250_000, 'A5 : la profondeur réglée est gravée dans le .projix',
			JSON.stringify(p.analyseurPourProjix()));
		p.onMessage({ type: 'analyseurDepart' });
		const N = 700_000;
		for (let k = 0; k < N; k += 1000) {
			const plat = [];
			for (let i = k; i < k + 1000; i++) plat.push(i / 100, i % 2);
			p.onMessage({ type: 'analyseurFronts', salves: { GP14: plat } });
		}
		const r = pret(pan).at(-1);
		const f = frontsDe(r, 'GP14');
		const n = f.length / 2;
		const tete = Math.ceil((250_000 * 7) / 6);
		let sansTrou = f[0] === 0;
		for (let i = 1; sansTrou && i < tete; i++) if (f[2 * i] !== i / 100) sansTrou = false;
		check(sansTrou, 'A5 : la tête suit la profondeur — 291 667 fronts du début, sans trou', `${n} fronts, ${f[2 * (tete - 1)]} au rang ${tete - 1}`);
		check(n >= 2 * tete && n <= 2.25 * tete, 'A5 : tête + queue restent bornées', `${n} fronts`);
		check(f.at(-2) === (N - 1) / 100, 'A5 : la queue finit au DERNIER front du run', `${f.at(-2)}`);
		check(r?.etat?.profondeur === 250_000, 'A5 : la mesure rendue porte la profondeur réglée', JSON.stringify(r?.etat?.profondeur));
		// Retour au défaut : plus rien à graver, le projet redevient sans réglage.
		pan._onMsg(reglages(60_000));
		check(() => p.analyseurPourProjix() === undefined, 'A5 : la profondeur par défaut n’est pas écrite', JSON.stringify(p.analyseurPourProjix()));
		pan.dispose();
		// Un .projix qui porte une profondeur la rend à l'onglet, même sans autre réglage.
		const q = atelier('W:/projet/profond-relu.projix');
		q.chargerAnalyseur({ profondeur: 1_000_000 });
		check(() => q.etatAnalyseur().capture?.profondeur === 1_000_000, 'A5 : la profondeur d’un .projix ouvert est rendue à l’onglet',
			JSON.stringify(q.etatAnalyseur().capture));
	}
}

// ============================================================================
// B. LA CAPTURE : une mesure rejouée = la même capture qu'en direct
// ============================================================================
console.log('B. capture');
{
	const sortie = join(tmp, 'capture.mjs');
	await esbuild.build({
		entryPoints: [join(ROOT, 'src/webview/analyseur-capture.mts')],
		outfile: sortie, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
		plugins: [versionHead],
	});
	const { AnalyseurCapture } = await import(pathToFileURL(sortie).href);
	const VOIES_C = [{ voie: 0, pin: 'GP0', nom: 'horloge' }, { voie: 1, pin: 'GP1', nom: 'lent' }];
	const D = { voie: 1, sens: 'rising' };
	const etat = (c) => JSON.stringify({
		tTrigger: c.tTrigger, pleine: c.pleine, tFin: c.tFin,
		voies: c.listeVoies.map((v) => ({
			pin: v.pin, n: v.fronts.length, t0: v.fronts[0]?.t, t1: v.fronts.at(-1)?.t,
			niveauInitial: v.niveauInitial, perte: v.perte ?? null,
		})),
	});
	const neuve = (d) => {
		const c = new AnalyseurCapture();
		c.declarerVoies(VOIES_C);
		c.reinitialiser();
		c.reglerDeclenchement(d);
		return c;
	};
	/** Le run vu EN DIRECT : salves d'une milliseconde, comme le moteur. */
	const direct = (s, d) => {
		const c = neuve(d);
		const pos = { GP0: 0, GP1: 0 };
		const fin = Math.max(s.GP0.at(-2), s.GP1.at(-2));
		for (let t = 1; t <= Math.ceil(fin); t++) {
			const tranche = {};
			for (const pin of ['GP0', 'GP1']) {
				const plat = s[pin];
				let i = pos[pin];
				while (i < plat.length && plat[i] <= t) i += 2;
				if (i > pos[pin]) tranche[pin] = plat.slice(pos[pin], i);
				pos[pin] = i;
			}
			c.verser(tranche);
		}
		return c;
	};
	/** La mesure ENTIÈRE rendue à une page rechargée (restaurer). */
	const rejeu = (s, d) => {
		const c = neuve(d);
		if (typeof c.rejouer !== 'function') throw new Error('AnalyseurCapture.rejouer absent');
		c.rejouer(s);
		c.chercherDeclenchement();
		return c;
	};
	const s = signal();
	const eDirect = etat(direct(s, D));
	let eRejeu = null;
	try { eRejeu = etat(rejeu(s, D)); } catch (e) { eRejeu = `exception : ${e.message}`; }
	check(JSON.parse(eDirect).pleine === true, 'B : témoin — en direct, la capture déclenchée se remplit puis s’arrête', eDirect);
	check(eRejeu === eDirect, 'B : déclenchement — la mesure rejouée donne la capture vue en direct', `${eRejeu}\n      direct : ${eDirect}`);
	const eDirectLibre = etat(direct(s, null));
	let eRejeuLibre = null;
	try { eRejeuLibre = etat(rejeu(s, null)); } catch (e) { eRejeuLibre = `exception : ${e.message}`; }
	check(eRejeuLibre === eDirectLibre, 'B : sans déclenchement — mêmes derniers fronts qu’en direct', `${eRejeuLibre}\n      direct : ${eDirectLibre}`);
	// La forme que rend le journal : tête de 70 000 fronts + queue de 70 000,
	// trou au milieu. La capture qu'on en tire doit rester celle du run entier.
	const long = signal(300_000, 6000);
	const troue = {
		GP0: long.GP0.slice(0, 2 * 70_000).concat(long.GP0.slice(-2 * 70_000)),
		GP1: long.GP1,
	};
	let eTroue = null;
	let eTroueLibre = null;
	try { eTroue = etat(rejeu(troue, D)); eTroueLibre = etat(rejeu(troue, null)); } catch (e) { eTroue = eTroueLibre = `exception : ${e.message}`; }
	check(eTroue === etat(direct(long, D)), 'B : tête + queue du journal, déclenchement tôt — la capture du run entier', eTroue);
	check(eTroueLibre === etat(direct(long, null)), 'B : tête + queue du journal, sans déclenchement — la fin du run entier', eTroueLibre);
	// Témoin de l'ordre : tout verser PUIS régler le déclenchement (ce que faisait
	// la page avant ce lot) rabote la mesure à la fin du run avant que le
	// déclenchement n'existe. Ce contrôle prouve que le banc voit la différence.
	const c = new AnalyseurCapture();
	c.declarerVoies(VOIES_C);
	c.reinitialiser();
	c.verser(s);
	c.reglerDeclenchement(D);
	c.chercherDeclenchement();
	check(etat(c) !== eDirect, 'B : témoin — verser tout AVANT de régler le déclenchement donne une autre capture', etat(c));
}

// ============================================================================
// C. LA PAGE : le vrai analyseur.mts rechargé garde ses courbes
// ============================================================================
console.log('C. page');
{
	const b = await esbuild.build({
		entryPoints: [join(ROOT, 'src/webview/analyseur.mts')],
		bundle: true, format: 'iife', write: false, logLevel: 'silent',
		loader: { '.svg': 'text', '.webp': 'dataurl' }, absWorkingDir: ROOT,
		plugins: [versionHead],
	});
	const script = b.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
	const page = `<!doctype html><meta charset=utf8>
<style>
 body { margin:0; padding:0; font:13px sans-serif; }
 .barre { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:6px 10px; }
 #trace { display:block; width:100%; }
</style>
<body>
<div class="barre">
 <select id="horloge"><option value="0">Unlimited</option></select>
 <button id="tout" type="button">Whole capture</button>
 <button id="suivre" type="button">Follow live</button>
 <span id="etat"></span>
</div>
<canvas id="trace"></canvas>
<script>
 window.acquireVsCodeApi = () => ({ postMessage() {}, setState() {} });
 window.KABLIX_LANG = 'en';
</script>
<script>${script}</script>
<script>
 ${signal.toString()}
 const post = (m) => window.dispatchEvent(new MessageEvent('message', { data: m }));
 const wait = (ms) => new Promise((r) => setTimeout(r, ms));
 const cv = document.getElementById('trace');
 // Pixels peints piste par piste : barre de temps 62, puis 64 par piste.
 const parPiste = (n) => {
  const g = cv.getContext('2d');
  const k = cv.height / Math.max(1, cv.clientHeight);
  const out = [];
  for (let i = 0; i < n; i++) {
   const d = g.getImageData(110, Math.round((62 + i * 64) * k), cv.width - 130, Math.round(64 * k)).data;
   let c = 0;
   for (let j = 3; j < d.length; j += 4) if (d[j] > 0) c++;
   out.push(c);
  }
  return out;
 };
 const etat = () => document.getElementById('etat').textContent;
 // Pixels du repère de déclenchement (tireté #e34948) : il n'est peint que s'il
 // tombe dans la fenêtre.
 const rouges = () => {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let c = 0;
  for (let j = 0; j < d.length; j += 4) {
   if (d[j + 3] > 200 && Math.abs(d[j] - 227) < 16 && Math.abs(d[j + 1] - 73) < 16 && Math.abs(d[j + 2] - 72) < 16) c++;
  }
  return c;
 };
 // Empreinte de la barre de temps : ses graduations bougent avec la fenêtre.
 const regle = () => {
  const k = cv.height / Math.max(1, cv.clientHeight);
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, Math.round(62 * k)).data;
  let h = 0;
  for (let j = 0; j < d.length; j++) h = (Math.imul(h, 31) + d[j]) >>> 0;
  return h;
 };
 // GP2 : une pince posée qui ne voit passer aucun front — piste TÉMOIN, le poids
 // d'une piste qui ne trace rien (jamais un seuil écrit en dur).
 const VOIES = ['GP0', 'GP1', 'GP2'].map((pin, voie) => ({ voie, pin, nom: pin, probleme: null, analogique: false, suivi: false }));
 const REGLAGES = { declenchement: { voie: 1, sens: 'rising' }, decodages: [], voiesReglages: {}, echantillonnage: 0 };
 (async () => {
  const erreurs = [];
  window.addEventListener('error', (e) => erreurs.push(String(e.message)));
  const s = signal();
  const m = {};
  await wait(50);
  // 1. EN DIRECT. Onglet ouvert juste après le départ : l'hôte n'a encore
  //    aucune mesure, il rend les réglages SEULS (voies vides) — ce message ne
  //    doit pas vider les voies de la capture.
  post({ type: 'voies', voies: VOIES });
  post({ type: 'depart' });
  post({ type: 'restaure', etat: { voies: [], ...REGLAGES } });
  const pos = { GP0: 0, GP1: 0 };
  for (let t = 1; t <= 1500; t++) {
   const salves = {};
   for (const pin of ['GP0', 'GP1']) {
    let i = pos[pin];
    while (i < s[pin].length && s[pin][i] <= t) i += 2;
    if (i > pos[pin]) salves[pin] = s[pin].slice(pos[pin], i);
    pos[pin] = i;
   }
   post({ type: 'fronts', salves });
  }
  post({ type: 'repeindre' });
  await wait(300);
  m.etatDirect = etat();
  m.pistesDirect = parPiste(3);
  // 2. RECHARGÉE. La page repart de zéro et reçoit ce que l'hôte lui rend :
  //    voies, départ, puis la mesure ENTIÈRE du journal avec ses réglages.
  post({ type: 'voies', voies: VOIES });
  post({ type: 'depart' });
  post({ type: 'restaure', etat: { voies: [
   { voie: 0, pin: 'GP0', nom: 'GP0', fronts: s.GP0 },
   { voie: 1, pin: 'GP1', nom: 'GP1', fronts: s.GP1 },
   { voie: 2, pin: 'GP2', nom: 'GP2', fronts: [] },
  ], ...REGLAGES } });
  post({ type: 'repeindre' });
  await wait(300);
  m.etatRecharge = etat();
  m.pistesRecharge = parPiste(3);
  // 3. RECHARGÉE À MI-RUN, SANS DÉCLENCHEMENT, et le run continue : la suite
  //    arrive en direct derrière la mesure rendue.
  post({ type: 'voies', voies: VOIES });
  post({ type: 'depart' });
  const moitie = (plat, t) => plat.slice(0, plat.findIndex((x, i) => i % 2 === 0 && x > t));
  post({ type: 'restaure', etat: { voies: [
   { voie: 0, pin: 'GP0', nom: 'GP0', fronts: moitie(s.GP0, 700) },
   { voie: 1, pin: 'GP1', nom: 'GP1', fronts: moitie(s.GP1, 700) },
  ], declenchement: null, decodages: [], voiesReglages: {}, echantillonnage: 0 } });
  for (let t = 701; t <= 1500; t++) {
   post({ type: 'fronts', salves: {
    GP0: s.GP0.slice(2 * (t - 1) * 100, 2 * t * 100),
    GP1: [t - 0.5, (2 * t - 1) % 2, t, 0],
   } });
  }
  post({ type: 'repeindre' });
  await wait(300);
  m.etatSuite = etat();
  m.pistesSuite = parPiste(3);
  // 4. RECHARGÉE À MI-RUN, DÉCLENCHEMENT DÉJÀ TOMBÉ, et le run continue : c'est
  //    l'onglet ouvert au lancement (Frank, 26/09, ds18b20-pico : « la courbe
  //    clignote »). La vue se pose sur le déclenchement et n'en bouge plus.
  post({ type: 'voies', voies: VOIES });
  post({ type: 'depart' });
  post({ type: 'restaure', etat: { voies: [
   { voie: 0, pin: 'GP0', nom: 'GP0', fronts: moitie(s.GP0, 300) },
   { voie: 1, pin: 'GP1', nom: 'GP1', fronts: moitie(s.GP1, 300) },
  ], ...REGLAGES } });
  const suite = (de, a) => {
   for (let t = de; t <= a; t++) {
    post({ type: 'fronts', salves: { GP0: s.GP0.slice(2 * (t - 1) * 100, 2 * t * 100), GP1: s.GP1.slice(4 * (t - 1), 4 * t) } });
   }
  };
  suite(301, 400);
  post({ type: 'repeindre' });
  await wait(300);
  m.rougeA = rouges();
  m.regleA = regle();
  m.pistesDeclenche = parPiste(3);
  suite(401, 500);
  post({ type: 'repeindre' });
  await wait(300);
  m.rougeB = rouges();
  m.regleB = regle();
  m.erreurs = erreurs.join(' | ').slice(0, 300);
  const out = document.createElement('pre');
  out.id = 'measures';
  out.textContent = JSON.stringify(m);
  document.body.appendChild(out);
 })();
</script>
</body>`;
	const fichier = join(tmp, 'page.html');
	writeFileSync(fichier, page);
	const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
	if (!chrome) {
		check(false, 'C : Chrome introuvable — le volet page n’a pas pu être joué');
	} else {
		const dom = execFileSync(chrome, [
			'--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${join(tmp, 'profil')}`,
			'--window-size=900,700', '--virtual-time-budget=60000', '--dump-dom',
			`file:///${fichier.replace(/\\/g, '/')}`,
		], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		const brut = dom.match(/<pre id="measures"[^>]*>([\s\S]*?)<\/pre>/);
		if (!brut) {
			check(false, 'C : la page a fini son script', dom.slice(0, 800));
		} else {
			const m = JSON.parse(brut[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
			console.log(`  (mesuré : direct « ${m.etatDirect} » ${JSON.stringify(m.pistesDirect)} · rechargée « ${m.etatRecharge} » ${JSON.stringify(m.pistesRecharge)} · suite « ${m.etatSuite} » ${JSON.stringify(m.pistesSuite)})`);
			const nue = (p) => p[2];
			const trace = (p, i) => p[i] > nue(p) * 1.3;
			check(m.erreurs === '', 'C : la page ne lève aucune erreur', m.erreurs);
			check(/^Capture full: 600 ms kept \(60 k edges per channel\)/.test(m.etatDirect),
				'C : en direct, réglages reçus seuls — la capture déclenchée se remplit : 600 ms gardées', m.etatDirect);
			check(trace(m.pistesDirect, 0) && trace(m.pistesDirect, 1), 'C : en direct, les deux voies tracent', JSON.stringify(m.pistesDirect));
			check(m.etatRecharge === m.etatDirect, 'C : rechargée, la page retrouve la MÊME capture qu’en direct', `« ${m.etatRecharge} »`);
			check(trace(m.pistesRecharge, 0) && trace(m.pistesRecharge, 1), 'C : rechargée, les courbes sont là', JSON.stringify(m.pistesRecharge));
			check(/^Capturing… 1500\.0$/.test(m.etatSuite), 'C : rechargée à mi-run, la suite du run s’ajoute derrière', m.etatSuite);
			check(trace(m.pistesSuite, 0) && trace(m.pistesSuite, 1), 'C : et les courbes tracent toujours', JSON.stringify(m.pistesSuite));
			console.log(`  (mesuré, déclenchement déjà tombé : repère ${m.rougeA} → ${m.rougeB} px, barre de temps ${m.regleA} → ${m.regleB})`);
			check(m.rougeA > 20, 'C : rechargée à mi-run après le déclenchement, la vue se pose dessus', `${m.rougeA} px du repère`);
			check(trace(m.pistesDeclenche, 0) && trace(m.pistesDeclenche, 1), 'C : les courbes autour du déclenchement tracent', JSON.stringify(m.pistesDeclenche));
			check(m.regleA === m.regleB && m.rougeA === m.rougeB, 'C : la suite du run arrive, la vue ne bouge plus (plus de clignotement)',
				`barre ${m.regleA} → ${m.regleB}, repère ${m.rougeA} → ${m.rougeB}`);
		}
	}
}

try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome relâche son profil un peu tard */ }

// Un banc qui n'a rien mesuré n'est pas un banc vert.
const total = ok + echecs.length;
if (total < 31) {
	echecs.push('le banc a joué tous ses contrôles');
	console.log(`  ✗ le banc a joué tous ses contrôles — seulement ${total} contrôle(s)`);
}
console.log(echecs.length
	? `analyseur-recharge : ${echecs.length} échec(s) sur ${ok + echecs.length}.`
	: `analyseur-recharge : ${ok} contrôles OK — l’onglet rechargé garde toute sa mesure.`);
process.exit(echecs.length ? 1 : 0);
