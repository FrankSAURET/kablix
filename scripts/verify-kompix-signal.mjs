// Signal au démarrage : composant de la bibliothèque mis à jour dans le dépôt,
// ou nouveaux composants apparus (v2026.9.5.144).
//
// Demande de Frank : « signal au démarrage si un composant est modifié ou si de
// nouveaux composants sont apparus ». Cas d'origine : un dmx-grove 2026.8.1
// installé, sans les sondes du 2026.9.1 publié, et rien pour le dire.
//
// Le banc exécute pour de vrai `src/componentUpdates.ts` (bundlé par esbuild)
// avec un faux `vscode` (bouton cliqué, globalState, langue, dépôts réglés), une
// fausse bibliothèque (composants installés) et un faux `fetch` (index des
// dépôts). `--source=<fichier.ts>` le fait tourner sur une autre copie du module
// (contre-épreuve : versions volontairement fautives).
import esbuild from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-signal-'));
const argSource = process.argv.find((a) => a.startsWith('--source='));
const SOURCE = argSource ? resolve(argSource.slice('--source='.length)) : join(ROOT, 'src/componentUpdates.ts');

let ok = 0;
const fails = [];
const check = (label, cond, detail) => {
	if (cond) {
		ok++;
		console.log(`✅ ${label}`);
	} else {
		fails.push(label);
		console.log(`❌ ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
	}
};

// --- Faux `vscode` piloté par globalThis.__sig --------------------------------
// __sig.clic     : bouton cliqué (undefined = notification fermée)
// __sig.infos    : notifications affichées, avec leurs boutons
// __sig.commandes: commandes lancées
// __sig.depots   : réglage kablix.componentRepositories
// __sig.langue   : langue de VS Code
const STUB = `
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const window = {
  showInformationMessage: (msg, ...boutons) => {
    globalThis.__sig.infos.push({ msg, boutons });
    return Promise.resolve(globalThis.__sig.clic);
  },
};
export const commands = { executeCommand: async (c) => { globalThis.__sig.commandes.push(c); } };
export const workspace = {
  getConfiguration: () => ({ get: (k, d) => (k === 'componentRepositories' ? globalThis.__sig.depots : d) }),
};
export const env = { get language() { return globalThis.__sig?.langue ?? 'en'; } };
export default { l10n, window, commands, workspace, env };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const out = join(tmp, 'component-updates.mjs');
await esbuild.build({
	entryPoints: [SOURCE],
	outfile: out,
	bundle: true,
	platform: 'node',
	format: 'esm',
	logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { checkComponentsOnStartup, componentsReport, fetchRepositoryComponents } = await import(pathToFileURL(out).href);

const DEPOT_A = 'https://exemple/depot-a/';
const DEPOT_B = 'https://exemple/depot-b';

/** Faux dépôts : `index[url]` = liste de composants, ou 'hs' (réseau absent). */
function fauxDepots(index) {
	globalThis.__requetes = [];
	globalThis.fetch = async (url, init) => {
		globalThis.__requetes.push({ url: String(url), signal: init?.signal });
		const base = String(url).replace(/\/index\.json$/, '');
		const cle = Object.keys(index).find((k) => k.replace(/\/$/, '') === base);
		const rep = cle === undefined ? 'hs' : index[cle];
		if (rep === 'hs') throw new Error('réseau absent');
		if (rep === 404) return { ok: false, status: 404, json: async () => ({}) };
		return { ok: true, json: async () => ({ components: rep }) };
	};
}

/** Contexte d'extension : globalState persistant d'un appel à l'autre. */
function faireContexte() {
	const store = new Map();
	return {
		globalState: { get: (k) => store.get(k), update: async (k, v) => void store.set(k, v) },
		_store: store,
	};
}

/** Fausse bibliothèque : ce qui est installé sur la machine. */
const biblio = (installes, { panne = false } = {}) => ({
	whenReady: () => (panne ? Promise.reject(new Error('dossier illisible')) : Promise.resolve()),
	listInstalled: () => installes.map(([type, version]) => ({ type, version, label: type, origin: 'remote' })),
});

/** Joue un démarrage et rend ce qui a été affiché / lancé. */
async function demarrer(ctx, lib, { clic, depots = [DEPOT_A], langue = 'en' } = {}) {
	globalThis.__sig = { clic, infos: [], commandes: [], depots, langue };
	await checkComponentsOnStartup(ctx, lib);
	return globalThis.__sig;
}

const DMX = (v) => ({ type: 'dmx-grove', label: 'Grove DMX512', version: v, file: 'dmx-grove.kompix' });
const DS = (v = '2026.9.2') => ({ type: 'ds18b20', label: 'DS18B20', version: v, file: 'ds18b20.kompix' });
const SPOT = { type: 'spot', label: 'Spot', version: '2026.9.0', file: 'spot.kompix' };

// --- 1. Le cas d'origine : première vérification, un installé en retard -------
{
	fauxDepots({ [DEPOT_A]: [DMX('2026.9.1'), DS()] });
	const ctx = faireContexte();
	const lib = biblio([['dmx-grove', '2026.8.1']]);
	const r = await demarrer(ctx, lib);
	check('1re vérification : une notification pour le composant en retard', r.infos.length === 1, r.infos.length);
	const msg = r.infos[0]?.msg ?? '';
	check('le message nomme le composant et les deux versions', msg.includes('Grove DMX512 2026.8.1 → 2026.9.1'), msg);
	check('1re vérification : le reste du dépôt n’est PAS crié « nouveau »', !msg.includes('DS18B20'), msg);
	check('deux boutons : ouvrir le gestionnaire / pas maintenant',
		JSON.stringify(r.infos[0]?.boutons) === JSON.stringify(['Open the manager', 'Not now']),
		JSON.stringify(r.infos[0]?.boutons));
	const vu = ctx._store.get('kablix.componentsSeen');
	check('la mémoire retient tout le dépôt avec ses versions',
		vu?.['dmx-grove'] === '2026.9.1' && vu?.ds18b20 === '2026.9.2', JSON.stringify(vu));

	// --- 2. Démarrage suivant, rien n'a bougé : silence -------------------------
	const r2 = await demarrer(ctx, lib);
	check('démarrage suivant sans changement : aucune notification', r2.infos.length === 0, JSON.stringify(r2.infos));

	// --- 3. Nouvelle version ET nouveau composant -------------------------------
	fauxDepots({ [DEPOT_A]: [DMX('2026.9.2'), DS(), SPOT] });
	const r3 = await demarrer(ctx, lib, { clic: 'Open the manager' });
	const msg3 = r3.infos[0]?.msg ?? '';
	check('nouvelle version + nouveau composant : UNE notification', r3.infos.length === 1, r3.infos.length);
	check('elle annonce la mise à jour (version installée → nouvelle)', msg3.includes('Grove DMX512 2026.8.1 → 2026.9.2'), msg3);
	check('elle annonce le nouveau composant', /new components \(Spot\)/.test(msg3), msg3);
	check('un composant déjà vu, non installé, n’est pas « nouveau »', !msg3.includes('DS18B20'), msg3);
	check('« Open the manager » ouvre le gestionnaire de composants',
		JSON.stringify(r3.commandes) === JSON.stringify(['kablix.openComponentManager']), JSON.stringify(r3.commandes));

	// --- 4. « Not now » : rien ne s'ouvre, et le signal ne revient pas ----------
	fauxDepots({ [DEPOT_A]: [DMX('2026.9.3'), DS(), SPOT] });
	const r4 = await demarrer(ctx, lib, { clic: 'Not now' });
	check('« Not now » : aucune commande lancée', r4.infos.length === 1 && r4.commandes.length === 0, JSON.stringify(r4));
	const r5 = await demarrer(ctx, lib);
	check('une version signalée ne revient pas au démarrage suivant', r5.infos.length === 0, JSON.stringify(r5.infos));

	// --- 5. Composant installé entre-temps : plus rien à dire -------------------
	const r6 = await demarrer(ctx, biblio([['dmx-grove', '2026.9.3'], ['spot', '2026.9.0']]));
	check('tout est installé et à jour : silence', r6.infos.length === 0, JSON.stringify(r6.infos));
}

// --- 6. Réseau absent : silence, et la mémoire n'est PAS écrite ----------------
{
	fauxDepots({ [DEPOT_A]: 'hs' });
	const ctx = faireContexte();
	const r = await demarrer(ctx, biblio([['dmx-grove', '2026.8.1']]));
	check('réseau absent : aucune notification', r.infos.length === 0, JSON.stringify(r.infos));
	check('réseau absent : la mémoire reste vierge (la prochaine vérification sera la 1re)',
		!ctx._store.has('kablix.componentsSeen'), JSON.stringify([...ctx._store]));
	fauxDepots({ [DEPOT_A]: [DMX('2026.9.1'), DS()] });
	const r2 = await demarrer(ctx, biblio([['dmx-grove', '2026.8.1']]));
	check('réseau revenu : c’est bien une 1re vérification (retard signalé, dépôt pas crié nouveau)',
		r2.infos.length === 1 && r2.infos[0].msg.includes('2026.8.1 → 2026.9.1') && !r2.infos[0].msg.includes('DS18B20'),
		JSON.stringify(r2.infos));
	fauxDepots({ [DEPOT_A]: 404 });
	const r3 = await demarrer(ctx, biblio([]));
	check('dépôt en erreur HTTP : silence', r3.infos.length === 0, JSON.stringify(r3.infos));
}

// --- 7. Deux dépôts, dont un muet un jour : la mémoire se complète -------------
{
	const ctx = faireContexte();
	fauxDepots({ [DEPOT_A]: [DS()], [DEPOT_B]: [SPOT] });
	await demarrer(ctx, biblio([]), { depots: [DEPOT_A, DEPOT_B] });
	fauxDepots({ [DEPOT_A]: [DS()], [DEPOT_B]: 'hs' });
	const r = await demarrer(ctx, biblio([]), { depots: [DEPOT_A, DEPOT_B] });
	check('un dépôt muet : pas de notification', r.infos.length === 0, JSON.stringify(r.infos));
	check('un dépôt muet : ses composants restent en mémoire', 'spot' in (ctx._store.get('kablix.componentsSeen') ?? {}),
		JSON.stringify(ctx._store.get('kablix.componentsSeen')));
	fauxDepots({ [DEPOT_A]: [DS()], [DEPOT_B]: [SPOT] });
	const r2 = await demarrer(ctx, biblio([]), { depots: [DEPOT_A, DEPOT_B] });
	check('le dépôt revenu ne ressort PAS tous ses composants en « nouveaux »', r2.infos.length === 0, JSON.stringify(r2.infos));
}

// --- 8. Cas qui ne réclament rien -----------------------------------------------
{
	const ctx = faireContexte();
	fauxDepots({ [DEPOT_A]: [DMX('2026.9.1')] });
	const r = await demarrer(ctx, biblio([['dmx-grove', '2026.9.1'], ['mon-perso', '2026.1.0']]));
	check('installé à jour + composant maison absent du dépôt : silence', r.infos.length === 0, JSON.stringify(r.infos));
	fauxDepots({ [DEPOT_A]: [DMX('2026.8.0')] });
	const r2 = await demarrer(faireContexte(), biblio([['dmx-grove', '2026.9.1']]));
	check('dépôt plus ancien que l’installé : silence', r2.infos.length === 0, JSON.stringify(r2.infos));
	// Versions comparées en nombres, pas en chaînes : 2026.9.10 > 2026.9.9.
	fauxDepots({ [DEPOT_A]: [DMX('2026.9.10')] });
	const r3 = await demarrer(faireContexte(), biblio([['dmx-grove', '2026.9.9']]));
	check('2026.9.10 dépasse 2026.9.9 (comparaison en nombres)', r3.infos.length === 1, JSON.stringify(r3.infos));
}

// --- 9. Bibliothèque illisible : silence --------------------------------------
{
	fauxDepots({ [DEPOT_A]: [DMX('2026.9.1')] });
	const ctx = faireContexte();
	const r = await demarrer(ctx, biblio([['dmx-grove', '2026.8.1']], { panne: true }));
	check('bibliothèque illisible : ni notification ni requête', r.infos.length === 0 && globalThis.__requetes.length === 0,
		JSON.stringify(r.infos));
}

// --- 10. Même type dans deux dépôts : le premier gagne ------------------------
{
	const rep = componentsReport(
		[['dmx-grove', '2026.8.1']].map(([type, version]) => ({ type, version })),
		[DMX('2026.9.1'), { ...DMX('2026.9.5'), label: 'Doublon' }],
		{}
	);
	check('doublon entre dépôts : le premier dépôt fait foi',
		rep.updates.length === 1 && rep.updates[0].to === '2026.9.1' && rep.seen['dmx-grove'] === '2026.9.1',
		JSON.stringify(rep));
}

// --- 11. Beaucoup de nouveautés : la liste est tronquée -------------------------
{
	const ctx = faireContexte();
	fauxDepots({ [DEPOT_A]: [] });
	await demarrer(ctx, biblio([]));
	const neufs = Array.from({ length: 8 }, (_, i) => ({ type: `neuf-${i}`, label: `Neuf ${i}`, version: '2026.9.0' }));
	fauxDepots({ [DEPOT_A]: neufs });
	const r = await demarrer(ctx, biblio([]));
	const msg = r.infos[0]?.msg ?? '';
	check('8 nouveautés : 5 nommées puis « … (+3) »', msg.includes('Neuf 4… (+3)') && !msg.includes('Neuf 5'), msg);
}

// --- 12. Libellés dans la langue de VS Code -------------------------------------
{
	const ctx = faireContexte();
	const avecFr = { ...DMX('2026.9.1'), l10n: { fr: { label: 'DMX512 Grove (FR)' } } };
	fauxDepots({ [DEPOT_A]: [avecFr] });
	const r = await demarrer(ctx, biblio([['dmx-grove', '2026.8.1']]), { langue: 'fr' });
	check('le nom du composant suit la langue de VS Code', (r.infos[0]?.msg ?? '').includes('DMX512 Grove (FR) 2026.8.1'),
		r.infos[0]?.msg);
}

// --- 13. Au démarrage la requête a un délai ; dans le gestionnaire, non ---------
{
	fauxDepots({ [DEPOT_A]: [DS()] });
	await demarrer(faireContexte(), biblio([]));
	check('démarrage : la requête porte un signal d’abandon (dépôt pendu = pas d’attente sans fin)',
		globalThis.__requetes[0]?.signal !== undefined, JSON.stringify(globalThis.__requetes));
	check('l’URL demandée est celle de l’index du dépôt',
		globalThis.__requetes[0]?.url === 'https://exemple/depot-a/index.json', globalThis.__requetes[0]?.url);
	fauxDepots({ [DEPOT_A]: [DS()] });
	const liste = await fetchRepositoryComponents(DEPOT_A);
	check('gestionnaire : pas de délai imposé, URL du .kompix construite',
		globalThis.__requetes[0]?.signal === undefined && liste[0]?.sourceUrl === 'https://exemple/depot-a/ds18b20.kompix',
		JSON.stringify(liste[0]));
}

// --- 14. Le vrai index du dépôt se lit, et Mod1 aurait été signalé --------------
{
	const index = JSON.parse(readFileSync(join(ROOT, 'kablix_components/index.json'), 'utf8'));
	const dmx = index.components.find((c) => c.type === 'dmx-grove');
	const rep = componentsReport([{ type: 'dmx-grove', version: '2026.8.1' }], index.components, undefined);
	check('vrai index : le dmx-grove 2026.8.1 installé est signalé en retard',
		rep.updates.some((u) => u.type === 'dmx-grove' && u.to === dmx?.version), JSON.stringify(rep.updates));
	check('vrai index : tous ses composants entrent en mémoire',
		index.components.every((c) => rep.seen[c.type] === c.version), Object.keys(rep.seen).join(' '));
}

// --- 15. Branchement : activation, réglage, gestionnaire ------------------------
{
	const ext = readFileSync(join(ROOT, 'src/extension.ts'), 'utf8');
	check('activation : la vérification est lancée, sous le réglage (activé par défaut)',
		/get<boolean>\('checkComponentsOnStartup', true\)\)\s*\{\s*void checkComponentsOnStartup\(context, kompixLibrary\)/.test(ext));
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
	const reglage = pkg.contributes?.configuration?.properties?.['kablix.checkComponentsOnStartup'];
	check('réglage déclaré, booléen, activé par défaut', reglage?.type === 'boolean' && reglage?.default === true,
		JSON.stringify(reglage));
	const nls = JSON.parse(readFileSync(join(ROOT, 'package.nls.json'), 'utf8'));
	check('réglage décrit en langue de base', typeof nls['kablix.config.checkComponentsOnStartup'] === 'string');
	const gest = readFileSync(join(ROOT, 'src/componentManager.ts'), 'utf8');
	check('le gestionnaire lit les dépôts par la MÊME fonction',
		/from '\.\/componentUpdates'/.test(gest) && /return fetchRepositoryComponents\(repoUrl\)/.test(gest));
}

console.log('');
if (fails.length) {
	console.log(`kompix-signal : ${fails.length} échec(s) sur ${ok + fails.length} contrôles.`);
	process.exit(1);
}
console.log(`kompix-signal : ${ok} contrôles OK — mises à jour et nouveaux composants signalés au démarrage, une fois chacun.`);
