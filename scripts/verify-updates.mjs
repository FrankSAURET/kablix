// Notification « mise à jour des bibliothèques » : elle ne doit plus revenir en
// permanence.
//
// Demande de Frank (v2026.8.21) : « n'affiche plus le message de mise à jour de
// rp2040.js en permanence. Juste une fois avec 3 propositions : installer, plus
// tard, pas cette version. Si la réponse est plus tard tu reproposes à
// l'ouverture suivante. »
//
// Ce banc exécute pour de vrai `src/updates.ts` avec un faux `vscode` (dont on
// pilote le bouton cliqué, le globalState et le mode d'extension) et un faux
// `fetch` (versions annoncées par le registre npm).
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-upd-'));

let ok = 0;
const fails = [];
const check = (label, cond, detail) => {
	if (cond) {
		ok++;
		console.log(`✅ ${label}`);
	} else {
		fails.push(label);
		console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
	}
};

// --- Faux `vscode` piloté par globalThis.__up --------------------------------
// __up.clic      : libellé du bouton cliqué (undefined = notification fermée)
// __up.avertis   : messages d'avertissement affichés, avec leurs boutons
// __up.infos     : messages d'information affichés
// __up.terminaux : terminaux créés (nom, cwd, commandes envoyées)
// __up.ouverts   : URL ouvertes dans le navigateur
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p });
export const Uri = { file: (p) => uri(p), parse: (p) => uri(p), joinPath: (b, ...r) => uri([b.fsPath, ...r].join('/')) };
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const window = {
  showWarningMessage: (msg, ...boutons) => {
    globalThis.__up.avertis.push({ msg, boutons });
    return Promise.resolve(globalThis.__up.clic);
  },
  showInformationMessage: (msg) => { globalThis.__up.infos.push(msg); return Promise.resolve(undefined); },
  createTerminal: (opts) => {
    const t = { nom: opts.name, cwd: opts.cwd, commandes: [] };
    globalThis.__up.terminaux.push(t);
    return { show() {}, sendText: (c) => t.commandes.push(c) };
  },
};
export const env = { openExternal: async (u) => { globalThis.__up.ouverts.push(String(u.fsPath ?? u)); return true; } };
export const workspace = { getConfiguration: () => ({ get: (_k, d) => d }) };
export default { Uri, l10n, window, env, workspace, ExtensionMode };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const out = join(tmp, 'updates.mjs');
await esbuild.build({
	entryPoints: [join(ROOT, 'src/updates.ts')],
	outfile: out,
	bundle: true,
	platform: 'node',
	format: 'esm',
	logLevel: 'silent',
	alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { promptLibraryUpdates } = await import(pathToFileURL(out).href);

// Versions installées, lues dans le vrai package.json (le module fait pareil).
const { dependencies } = JSON.parse(
	await import('node:fs/promises').then((fs) => fs.readFile(join(ROOT, 'package.json'), 'utf8'))
);
const RP_ACTUEL = dependencies.rp2040js.replace(/^[^\d]*/, '');
const [maj, min, patch] = RP_ACTUEL.split('.').map(Number);
const RP_NEUF = `${maj}.${min}.${patch + 1}`;
const RP_ENCORE_PLUS_NEUF = `${maj}.${min}.${patch + 2}`;

/** Faux registre npm : `versions` donne la dernière publiée par paquet. */
function faussesVersions(versions) {
	globalThis.fetch = async (url) => {
		const nom = String(url).split('/').slice(-2, -1)[0];
		if (versions[nom] === 'réseau-hs') throw new Error('réseau absent');
		return { ok: true, json: async () => ({ version: versions[nom] ?? dependencies[nom]?.replace(/^[^\d]*/, '') }) };
	};
}

/** Contexte d'extension : globalState persistant d'un appel à l'autre. */
function faireContexte(mode = 2) {
	const store = new Map();
	return {
		extensionMode: mode,
		extensionUri: { fsPath: 'H:/kablix' },
		globalState: {
			get: (k) => store.get(k),
			update: async (k, v) => void store.set(k, v),
		},
		_store: store,
	};
}

/** Joue un appel et renvoie ce qui a été affiché / fait. */
async function jouer(contexte, { clic, silent = true } = {}) {
	globalThis.__up = { clic, avertis: [], infos: [], terminaux: [], ouverts: [] };
	await promptLibraryUpdates(contexte, silent);
	return globalThis.__up;
}

// --- 1. Tout à jour : silence au démarrage, message sur demande --------------
faussesVersions({});
{
	const ctx = faireContexte();
	const dem = await jouer(ctx, { silent: true });
	check('à jour, démarrage : aucune notification', dem.avertis.length === 0 && dem.infos.length === 0,
		JSON.stringify(dem.infos));
	const man = await jouer(ctx, { silent: false });
	check('à jour, commande manuelle : « les bibliothèques sont à jour »',
		man.infos.length === 1 && /à jour|up to date/i.test(man.infos[0]), JSON.stringify(man.infos));
}

// --- 2. Les TROIS propositions, et rien d'autre ------------------------------
faussesVersions({ rp2040js: RP_NEUF });
{
	const ctx = faireContexte();
	const r = await jouer(ctx, { clic: undefined });
	check('mise à jour : une seule notification', r.avertis.length === 1, r.avertis.length);
	const b = r.avertis[0]?.boutons ?? [];
	check('trois boutons : Installer / Plus tard / Pas cette version',
		b.length === 3 && b[0] === 'Install' && b[1] === 'Later' && b[2] === 'Not this version', b.join(' | '));
	check('le message nomme le paquet et les deux versions',
		r.avertis[0].msg.includes(`rp2040js ${RP_ACTUEL} → ${RP_NEUF}`), r.avertis[0].msg);
}

// --- 3. « Plus tard » : reproposé à l'ouverture suivante ---------------------
{
	const ctx = faireContexte();
	await jouer(ctx, { clic: 'Later' });
	const r2 = await jouer(ctx, { clic: 'Later' });
	check('« Plus tard » : la notification revient à l ouverture suivante', r2.avertis.length === 1,
		r2.avertis.length);
	check('« Plus tard » : rien n est mémorisé', ctx._store.size === 0, [...ctx._store.keys()].join(','));
}

// --- 4. « Pas cette version » : plus jamais celle-là -------------------------
{
	const ctx = faireContexte();
	const r1 = await jouer(ctx, { clic: 'Not this version' });
	check('« Pas cette version » : la notification s affiche une fois', r1.avertis.length === 1, r1.avertis.length);
	const r2 = await jouer(ctx, { clic: 'Not this version' });
	check('« Pas cette version » : PLUS DE NOTIFICATION à l ouverture suivante', r2.avertis.length === 0,
		JSON.stringify(r2.avertis.map((a) => a.msg)));
	check('« Pas cette version » : la version refusée est mémorisée',
		ctx._store.get('kablix.libraryUpdates.skipped')?.rp2040js === RP_NEUF,
		JSON.stringify(ctx._store.get('kablix.libraryUpdates.skipped')));
	// Une version ENCORE plus récente n'est pas couverte par le refus.
	faussesVersions({ rp2040js: RP_ENCORE_PLUS_NEUF });
	const r3 = await jouer(ctx, { clic: undefined });
	check('refus d une version : la SUIVANTE est bien reproposée', r3.avertis.length === 1, r3.avertis.length);
	// La commande manuelle passe outre le refus : action explicite.
	faussesVersions({ rp2040js: RP_NEUF });
	const r4 = await jouer(ctx, { clic: undefined, silent: false });
	check('commande manuelle : le refus n étouffe pas la réponse', r4.avertis.length === 1, r4.avertis.length);
}

// --- 5. « Installer » : npm install dans le dépôt, en mode développement -----
{
	const ctx = faireContexte(2); // Development
	const r = await jouer(ctx, { clic: 'Install' });
	const t = r.terminaux[0];
	check('« Installer » : un terminal est ouvert dans le dépôt de l extension',
		!!t && t.cwd === 'H:/kablix', JSON.stringify(t));
	check('« Installer » : la commande installe la version annoncée',
		t?.commandes[0] === `npm install rp2040js@${RP_NEUF}`, t?.commandes.join(' ; '));
	check('« Installer » : le rappel « npm run build » est affiché',
		r.infos.some((m) => /npm run build/.test(m)), JSON.stringify(r.infos));
	check('« Installer » : rien n est mémorisé comme refusé', ctx._store.size === 0,
		[...ctx._store.keys()].join(','));
}

// --- 6. Hors dépôt : « Installer » n'installerait rien, on renvoie sur npm ---
{
	const ctx = faireContexte(1); // Production
	const r = await jouer(ctx, { clic: 'See on npm' });
	const b = r.avertis[0]?.boutons ?? [];
	check('production : le premier bouton est « Voir sur npm », pas « Installer »',
		b[0] === 'See on npm' && b.length === 3, b.join(' | '));
	check('production : aucun terminal npm n est ouvert', r.terminaux.length === 0, r.terminaux.length);
	check('production : la page npm du paquet est ouverte',
		r.ouverts[0] === 'https://www.npmjs.com/package/rp2040js', r.ouverts.join(','));
}

// --- 7. Réseau absent : silence total ----------------------------------------
{
	faussesVersions({ rp2040js: 'réseau-hs', avr8js: 'réseau-hs', lit: 'réseau-hs' });
	const ctx = faireContexte();
	const r = await jouer(ctx, { clic: undefined });
	check('réseau absent : aucune notification, aucune erreur',
		r.avertis.length === 0 && r.infos.length === 0, JSON.stringify(r.avertis));
}

console.log(
	fails.length
		? `updates : ${fails.length} échec(s).`
		: `updates : ${ok} contrôles OK — une notification, trois réponses, et la version refusée ne revient plus.`
);
process.exit(fails.length ? 1 : 0);
