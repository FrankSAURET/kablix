// Choix du firmware MicroPython : la VARIANTE de la carte doit être respectée.
//
// Défaut signalé par Frank : « Quand je clique sur REPL la version de
// MicroPython est toujours celle du Pico Pi W, indépendamment de la carte
// choisie. » Cause : `resolveMicropythonFirmware(context, preferred)` ne se
// servait de `preferred` QUE pour le téléchargement (étape 4). Les étapes
// « firmware du workspace » et « cache global » prenaient le .uf2 le plus
// RÉCENT, quelle que soit la carte — un cache contenant RPI_PICO_W servait
// donc aussi les projets Pico simple, et la bannière du REPL annonçait
// « Raspberry Pi Pico W ». Ce n'était pas voulu : ▶ était touché aussi.
//
// Ce banc exécute pour de vrai `src/firmware.ts` avec un faux `vscode` dont on
// pilote le workspace, le cache et les boîtes de dialogue.
import esbuild from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'kablix-fw-'));

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

// --- Faux `vscode` piloté par globalThis.__fw ---------------------------------
// __fw.workspace : noms de fichiers .uf2 « trouvés » dans le workspace
// __fw.cache     : noms de fichiers .uf2 présents dans le cache global
// __fw.reponse   : ce que l'utilisateur clique dans la boîte de dialogue
// __fw.avertis   : avertissements affichés (repli sur une autre carte)
const STUB = `
const uri = (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => p, with: () => uri(p) });
export const Uri = {
  file: (p) => uri(p),
  parse: (p) => uri(p),
  joinPath: (base, ...parts) => uri([base.fsPath ?? base, ...parts].join('/')),
};
export const l10n = { t: (s, ...a) => String(s).replace(/\\{(\\d+)\\}/g, (_m, i) => a[i]) };
export const FileType = { Unknown: 0, File: 1, Directory: 2 };
export const ProgressLocation = { Notification: 15 };
export const window = {
  showWarningMessage: (msg, ...rest) => {
    const boutons = rest.filter((r) => typeof r === 'string');
    globalThis.__fw.avertis.push(msg);
    // Boîte « aucun firmware » : renvoie le choix scénarisé, sinon rien.
    return Promise.resolve(boutons.length ? globalThis.__fw.reponse : undefined);
  },
  showInformationMessage: (msg) => { globalThis.__fw.infos.push(msg); return Promise.resolve(undefined); },
  showErrorMessage: () => Promise.resolve(undefined),
  showOpenDialog: () => Promise.resolve(undefined),
  showQuickPick: () => Promise.resolve(undefined),
  withProgress: (_opts, task) => task({ report() {} }, { onCancellationRequested: () => ({ dispose() {} }) }),
};
export const workspace = {
  workspaceFolders: [{ uri: uri('W:/projet') }],
  getConfiguration: () => ({ get: (_k, d) => globalThis.__fw.reglage ?? d, update: async () => {} }),
  findFiles: async () => globalThis.__fw.workspace.map((n) => uri('W:/projet/' + n)),
  fs: {
    readDirectory: async (dir) => {
      if (!String(dir.fsPath).includes('micropython')) throw new Error('pas de cache');
      if (!globalThis.__fw.cache.length) throw new Error('pas de cache');
      return globalThis.__fw.cache.map((n) => [n, 1]);
    },
    stat: async (u) => {
      // mtime : l'ordre du tableau fait foi, le DERNIER est le plus récent.
      const nom = String(u.fsPath).split('/').pop();
      const idx = [...globalThis.__fw.workspace, ...globalThis.__fw.cache].indexOf(nom);
      return { type: 1, mtime: 1000 + (idx < 0 ? 0 : idx), size: 512 };
    },
    createDirectory: async () => {},
    writeFile: async () => {},
    delete: async () => {},
  },
};
export const env = { openExternal: async () => true };
export const ExtensionContext = class {};
export default { Uri, l10n, window, workspace, env };
`;
writeFileSync(join(tmp, 'vscode-stub.mjs'), STUB);

const out = join(tmp, 'firmware.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/firmware.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  alias: { vscode: join(tmp, 'vscode-stub.mjs') },
});
const { resolveMicropythonFirmware, FirmwareCancelled } = await import(pathToFileURL(out).href);

const contexte = { globalStorageUri: { fsPath: 'C:/store', scheme: 'file' } };

/** Joue un scénario et renvoie le nom de fichier choisi (ou l'erreur). */
async function choisi({ workspace = [], cache = [], reponse, reglage }, variante) {
  globalThis.__fw = { workspace, cache, reponse, reglage, avertis: [], infos: [] };
  try {
    const chemin = await resolveMicropythonFirmware(contexte, variante);
    return { nom: String(chemin).split(/[\\/]/).pop(), avertis: globalThis.__fw.avertis };
  } catch (err) {
    return { erreur: err, avertis: globalThis.__fw.avertis };
  }
}

const PICO = 'RPI_PICO-20260406-v1.28.0.uf2';
const PICOW = 'RPI_PICO_W-20260406-v1.28.0.uf2';

// --- 1. Le cache global : la variante commande, pas la date ------------------
// C'est LE défaut de Frank : le cache contenait les deux, ou seulement le W.
{
  const r = await choisi({ cache: [PICO, PICOW] }, 'pico');
  check('cache mixte, carte Pico : c\'est le firmware Pico qui sort', r.nom === PICO, r.nom);

  const w = await choisi({ cache: [PICO, PICOW] }, 'picow');
  check('cache mixte, carte Pico W : c\'est le firmware Pico W qui sort', w.nom === PICOW, w.nom);

  // Le Pico W est le plus RÉCENT du cache : l'ancien code le renvoyait toujours.
  const v = await choisi({ cache: [PICO, PICOW] }, 'pico');
  check('le plus récent du cache ne l\'emporte plus sur la carte choisie',
    v.nom === PICO, `${v.nom} (le W est plus récent dans ce scénario)`);
}

// --- 2. Le workspace : même règle -------------------------------------------
{
  const r = await choisi({ workspace: [PICOW, PICO] }, 'pico');
  check('workspace mixte, carte Pico : firmware Pico', r.nom === PICO, r.nom);

  const w = await choisi({ workspace: [PICOW, PICO] }, 'picow');
  check('workspace mixte, carte Pico W : firmware Pico W', w.nom === PICOW, w.nom);

  // Un .uf2 au nom neutre est déposé exprès par l'élève : il sert les deux cartes.
  const n = await choisi({ workspace: ['micropython.uf2'] }, 'pico');
  check('un .uf2 au nom neutre sert encore les deux cartes', n.nom === 'micropython.uf2', n.nom);

  // Le workspace passe avant le cache (projet hors-ligne reproductible).
  const p = await choisi({ workspace: [PICO], cache: [PICO, PICOW] }, 'pico');
  check('le workspace reste prioritaire sur le cache', p.nom === PICO, p.nom);
}

// --- 3. Rien de la bonne variante : on PROPOSE, on n'impose pas l'autre ------
{
  // L'utilisateur renonce : plutôt que de ne rien lancer, on se rabat sur le
  // firmware de l'autre carte — mais en le DISANT.
  const r = await choisi({ cache: [PICOW], reponse: undefined }, 'pico');
  check('bonne variante absente et téléchargement refusé : repli sur ce qui existe',
    r.nom === PICOW, r.nom ?? String(r.erreur));
  check('le repli est signalé à l\'utilisateur',
    r.avertis.some((m) => /Raspberry Pi Pico W/.test(m)),
    JSON.stringify(r.avertis));

  // Aucun firmware nulle part et refus : là, on ne peut rien lancer.
  const vide = await choisi({ reponse: undefined }, 'pico');
  check('rien nulle part et refus : FirmwareCancelled', vide.erreur instanceof FirmwareCancelled,
    String(vide.erreur));
}

// --- 4. Le réglage explicite reste roi --------------------------------------
{
  const r = await choisi({ reglage: 'W:/projet/a-moi.uf2', cache: [PICOW] }, 'pico');
  check('kablix.micropythonUf2 l\'emporte sur tout', r.nom === 'a-moi.uf2', r.nom ?? String(r.erreur));
}

console.log(`\nfirmware : ${ok} contrôles OK — la carte choisie commande la variante du .uf2.`);
if (fails.length) {
  console.log(`\n${fails.length} échec(s) :`);
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
