// Signal au démarrage : composants de la bibliothèque mis à jour dans le dépôt,
// ou nouveaux composants apparus depuis la dernière vérification.
//
// Sans lui, un composant corrigé dans le dépôt restait sur l'ancienne version
// tant que personne n'ouvrait le gestionnaire (demande de Frank, v2026.9.5.144 :
// un Mod1 venu d'un dmx-grove 2026.8.1 installé, sans les sondes du 2026.9.1).
//
// Ce module ne touche à RIEN dans la bibliothèque : il lit l'index du dépôt,
// compare, prévient. L'installation reste dans le gestionnaire de composants.
import * as vscode from 'vscode';
import { KompixL10nEntry, traduireKompix } from './kompixI18n';
import type { KompixLibrary } from './kompixLibrary';

const l10n = vscode.l10n;

/** Un composant tel que l'annonce l'index d'un dépôt. */
export interface RemoteComponent {
  type: string;
  label: string;
  description?: string;
  reference?: string;
  thumbnail?: string; // base64 ou URL
  version: string;
  author?: string;
  file?: string; // nom du fichier .kompix dans le dépôt (ex. "led.kompix")
  sourceUrl?: string; // URL complète du fichier .kompix
  /** Composant encore à l'essai : sa carte porte la mention « Experimental ». */
  experimental?: boolean;
  /** Traductions des libellés portées par le paquet (voir kompixI18n). */
  l10n?: Record<string, KompixL10nEntry>;
}

/**
 * Compare deux numéros de version « 1.2.10 » façon semver simplifié : rend un
 * nombre > 0 si `a` est plus récent que `b`. Les segments sont comparés en
 * NOMBRES — « 1.2.10 » est postérieur à « 1.2.9 », ce qu'une comparaison de
 * chaînes rendait faux. Un segment absent vaut 0 (« 1.2 » = « 1.2.0 »), et tout
 * ce qui n'est pas un nombre (suffixe « -beta ») est ignoré.
 */
export function compareVersions(a: string | undefined, b: string | undefined): number {
  const decoupe = (v: string | undefined): number[] =>
    String(v ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const ga = decoupe(a);
  const gb = decoupe(b);
  for (let i = 0; i < Math.max(ga.length, gb.length); i++) {
    const diff = (ga[i] ?? 0) - (gb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Lit l'index d'un dépôt et rend ses composants, libellés dans la langue de
 * VS Code et URL complète du .kompix posée. `timeoutMs` : au démarrage, un
 * dépôt qui ne répond pas ne doit pas laisser la requête pendue.
 */
export async function fetchRepositoryComponents(
  repoUrl: string,
  timeoutMs?: number
): Promise<RemoteComponent[]> {
  const baseUrl = repoUrl.replace(/\/$/, '');
  const indexUrl = baseUrl + '/index.json';
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetch(indexUrl, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // `.json()` rend `any` : le typer ici est le seul endroit où la forme de
    // l'index distant est vérifiée avant d'être servie au reste de l'extension.
    const data = (await response.json()) as { components?: RemoteComponent[] };
    const components: RemoteComponent[] = data.components ?? [];
    // Les libellés d'un composant PAS ENCORE installé viennent de l'index, il
    // n'y a pas de paquet local à relire — sans traduction, ils sortaient en
    // anglais.
    return components.map((c) => ({
      ...traduireKompix(c),
      sourceUrl: c.file ? baseUrl + '/' + c.file : undefined,
    }));
  } finally {
    clearTimeout(timer);
  }
}

/** Mémoire de la machine : type → version du dépôt déjà vue (donc déjà signalée). */
const SEEN_KEY = 'kablix.componentsSeen';

/** Délai laissé à chaque dépôt au démarrage. */
const REQUEST_TIMEOUT_MS = 8000;

/** Noms affichés au plus dans la notification ; au-delà, « … (+N) ». */
const MAX_LISTED = 5;

export interface ComponentsReport {
  /** Installés dont le dépôt propose une version plus récente, jamais signalée. */
  updates: { type: string; label: string; from: string; to: string }[];
  /** Apparus dans le dépôt depuis la dernière vérification, non installés. */
  added: { type: string; label: string; version: string }[];
  /** Mémoire à enregistrer après cette vérification. */
  seen: Record<string, string>;
}

/**
 * Le bilan, sans effet de bord. Règles :
 * - une MISE À JOUR = un composant installé que le dépôt fait avancer ; elle est
 *   signalée une fois par version du dépôt (pas à chaque démarrage : le
 *   gestionnaire la montre de toute façon, carte orange) ;
 * - un NOUVEAU = un type du dépôt jamais vu sur cette machine et non installé ;
 * - PREMIÈRE vérification (`seen` absent) : tout le dépôt est « déjà là », on ne
 *   crie pas « nouveau » sur la bibliothèque entière — seules les mises à jour
 *   des composants installés sont signalées ;
 * - la mémoire se COMPLÈTE, elle ne se remplace pas : un dépôt injoignable ce
 *   jour-là ne doit pas faire revenir tous ses composants en « nouveaux ».
 */
export function componentsReport(
  installed: { type: string; version: string }[],
  remote: RemoteComponent[],
  seen: Record<string, string> | undefined
): ComponentsReport {
  const firstRun = seen === undefined;
  const known = seen ?? {};
  const versionsLocales = new Map(installed.map((c) => [c.type, c.version]));
  const report: ComponentsReport = { updates: [], added: [], seen: { ...known } };
  const vus = new Set<string>();
  for (const c of remote) {
    // Deux dépôts proposant le même type : le premier gagne, comme dans le
    // gestionnaire.
    if (!c?.type || vus.has(c.type)) continue;
    vus.add(c.type);
    const version = String(c.version ?? '');
    const local = versionsLocales.get(c.type);
    if (local !== undefined) {
      if (compareVersions(version, local) > 0 && known[c.type] !== version) {
        report.updates.push({ type: c.type, label: c.label || c.type, from: local, to: version });
      }
    } else if (!firstRun && !(c.type in known)) {
      report.added.push({ type: c.type, label: c.label || c.type, version });
    }
    report.seen[c.type] = version;
  }
  return report;
}

/** « a, b, c, d, e… (+3) » : la notification doit rester lisible. */
function liste(noms: string[]): string {
  if (noms.length <= MAX_LISTED) return noms.join(', ');
  return `${noms.slice(0, MAX_LISTED).join(', ')}… (+${noms.length - MAX_LISTED})`;
}

/** Texte de la notification, ou undefined s'il n'y a rien à dire. */
export function componentsMessage(report: ComponentsReport): string | undefined {
  const maj = liste(report.updates.map((u) => `${u.label} ${u.from} → ${u.to}`));
  const neufs = liste(report.added.map((a) => a.label));
  if (report.updates.length && report.added.length) {
    return l10n.t('Kablix: component updates ({0}) and new components ({1}) are available.', maj, neufs);
  }
  if (report.updates.length) return l10n.t('Kablix: component updates are available ({0}).', maj);
  if (report.added.length) return l10n.t('Kablix: new components are available ({0}).', neufs);
  return undefined;
}

/**
 * Vérification du démarrage : attend la lecture de la bibliothèque, interroge
 * les dépôts, prévient s'il y a lieu. Muet sur toute panne (réseau absent,
 * dépôt injoignable, index illisible) : ce n'est qu'un signal.
 */
export async function checkComponentsOnStartup(
  context: vscode.ExtensionContext,
  library: KompixLibrary
): Promise<void> {
  try {
    await library.whenReady();
  } catch {
    return; // bibliothèque illisible : rien de fiable à comparer
  }
  const repos =
    vscode.workspace.getConfiguration('kablix').get<string[]>('componentRepositories') ?? [];
  const remote: RemoteComponent[] = [];
  let joints = 0;
  for (const repoUrl of repos) {
    try {
      remote.push(...(await fetchRepositoryComponents(repoUrl, REQUEST_TIMEOUT_MS)));
      joints++;
    } catch {
      // dépôt muet : on fait avec les autres
    }
  }
  // Aucun dépôt joint : ne rien écrire, sinon la première vérification RÉUSSIE
  // ne serait plus reconnue comme première, et tout le dépôt sortirait en
  // « nouveau ».
  if (joints === 0) return;

  const raw = context.globalState.get<unknown>(SEEN_KEY);
  const seen =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.fromEntries(
          Object.entries(raw as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === 'string'
          )
        )
      : undefined;
  const report = componentsReport(library.listInstalled(), remote, seen);
  // Mémorisé AVANT la question (modèle d'announce.ts) : la notification peut
  // rester des heures à l'écran, et une seconde fenêtre la reposerait.
  await context.globalState.update(SEEN_KEY, report.seen);

  const message = componentsMessage(report);
  if (!message) return;
  const open = l10n.t('Open the manager');
  const later = l10n.t('Not now');
  const choice = await vscode.window.showInformationMessage(message, open, later);
  if (choice === open) await vscode.commands.executeCommand('kablix.openComponentManager');
}
