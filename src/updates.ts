import * as vscode from 'vscode';

// Vérification optionnelle des mises à jour des bibliothèques de simulation
// embarquées. Kablix est hors-ligne par défaut : ce module n'est sollicité
// que sur action explicite (commande) ou réglage opt-in.

// Versions actuelles lues à l'exécution dans package.json (champ dependencies).
// Le bundle est CommonJS : require est disponible.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { dependencies?: Record<string, string> };

// Bibliothèques de simulation surveillées.
const WATCHED_PACKAGES = ['avr8js', 'rp2040js', 'lit'] as const;

const REGISTRY = 'https://registry.npmjs.org';
const GITHUB_ISSUES = 'https://github.com/franksauret/kablix/issues';
const REQUEST_TIMEOUT_MS = 5000;

interface LibraryUpdate {
  name: string;
  current: string;
  latest: string;
}

// Nettoie une version (retire un éventuel préfixe ^ ~ = et les pré-versions).
function normalizeVersion(version: string): string {
  return version.replace(/^[\^~=>< ]+/, '').split(/[-+]/)[0];
}

// Compare deux versions semver (major.minor.patch). > 0 si a > b.
function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Interroge le registre npm pour la dernière version publiée d'un paquet.
// Renvoie null en cas d'échec (réseau absent, timeout, réponse invalide).
async function fetchLatestVersion(pkgName: string): Promise<string | null> {
  const url = `${REGISTRY}/${pkgName}/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    // Échec silencieux : pas de réseau, timeout, JSON invalide…
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Vérifie chaque bibliothèque surveillée et ne renvoie que celles dont une
// version plus récente existe. Un échec par paquet n'interrompt pas le reste.
export async function checkLibraryUpdates(): Promise<LibraryUpdate[]> {
  const deps = pkg.dependencies ?? {};
  const results = await Promise.all(
    WATCHED_PACKAGES.map(async (name): Promise<LibraryUpdate | null> => {
      const current = deps[name];
      if (!current) return null;
      const latest = await fetchLatestVersion(name);
      if (!latest) return null;
      return compareVersions(latest, current) > 0
        ? { name, current: normalizeVersion(current), latest }
        : null;
    })
  );
  return results.filter((r): r is LibraryUpdate => r !== null);
}

// Versions REFUSÉES par l'utilisateur (bouton « Pas cette version ») :
// { rp2040js: '1.3.4' }. Une version encore plus récente reproposera.
const SKIPPED_KEY = 'kablix.libraryUpdates.skipped';

type SkippedMap = Record<string, string>;

function skippedVersions(context: vscode.ExtensionContext): SkippedMap {
  const raw = context.globalState.get<unknown>(SKIPPED_KEY);
  if (!raw || typeof raw !== 'object') return {};
  const out: SkippedMap = {};
  for (const [name, version] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof version === 'string') out[name] = version;
  }
  return out;
}

/**
 * Installation réellement possible ? Seulement dans le DÉPÔT de l'extension
 * (F5 / mode développement) : ailleurs, les bibliothèques sont déjà fondues
 * dans `dist/webview.js` par esbuild, et un `npm install` n'y changerait rien —
 * la seule mise à jour possible pour un utilisateur est celle de l'extension.
 */
function canInstall(context: vscode.ExtensionContext): boolean {
  return context.extensionMode === vscode.ExtensionMode.Development;
}

/** Lance `npm install pkg@version …` dans le dépôt, dans un terminal visible. */
function installUpdates(context: vscode.ExtensionContext, updates: LibraryUpdate[]): void {
  const specs = updates.map((u) => `${u.name}@${u.latest}`).join(' ');
  const term = vscode.window.createTerminal({
    name: 'Kablix — npm install',
    cwd: context.extensionUri.fsPath,
  });
  term.show();
  term.sendText(`npm install ${specs}`);
  void vscode.window.showInformationMessage(
    vscode.l10n.t('Kablix: once the install is finished, run “npm run build” and restart the extension.')
  );
}

/**
 * Présente le résultat à l'utilisateur sous forme de notification VS Code.
 * `silent` : au démarrage, ne rien afficher si tout est à jour — et respecter
 * les versions refusées. La commande manuelle, elle, montre toujours tout :
 * c'est une action explicite, elle ne doit rien cacher.
 *
 * Trois réponses possibles (Frank, v2026.8.21) : installer, plus tard (la
 * notification revient à la prochaine ouverture), ou refuser CETTE version
 * (plus jamais reproposée tant qu'elle reste la dernière publiée).
 */
export async function promptLibraryUpdates(
  context: vscode.ExtensionContext,
  silent = false
): Promise<void> {
  let updates: LibraryUpdate[];
  try {
    updates = await checkLibraryUpdates();
  } catch {
    // Ne jamais remonter d'erreur visible si le réseau est absent.
    return;
  }

  if (silent) {
    const skipped = skippedVersions(context);
    updates = updates.filter((u) => skipped[u.name] !== u.latest);
  }

  if (updates.length === 0) {
    if (!silent) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Kablix: the simulation libraries are up to date.')
      );
    }
    return;
  }

  const list = updates.map((u) => `${u.name} ${u.current} → ${u.latest}`).join(', ');
  const message = vscode.l10n.t(
    'Kablix: a newer version of the simulation libraries is available ({0}). Updating may break the extension; if a problem occurs, please open an issue on GitHub ({1}).',
    list,
    GITHUB_ISSUES
  );
  // Hors dépôt, « Installer » n'installerait rien : le bouton devient le lien npm.
  const install = canInstall(context) ? vscode.l10n.t('Install') : vscode.l10n.t('See on npm');
  const later = vscode.l10n.t('Later');
  const never = vscode.l10n.t('Not this version');

  const choice = await vscode.window.showWarningMessage(message, install, later, never);
  if (choice === install) {
    if (canInstall(context)) installUpdates(context, updates);
    else void vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${updates[0].name}`));
    return;
  }
  if (choice === never) {
    const skipped = skippedVersions(context);
    for (const u of updates) skipped[u.name] = u.latest;
    await context.globalState.update(SKIPPED_KEY, skipped);
  }
  // « Plus tard » (et la fermeture de la notification) : rien à mémoriser,
  // la vérification du prochain démarrage reproposera.
}
