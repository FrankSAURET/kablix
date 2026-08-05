import * as vscode from 'vscode';

/**
 * Disposition par défaut de l'espace de travail Kablix : deux colonnes côte à
 * côte — l'une pour le code, l'autre pour le simulateur Kablix — plus les
 * panneaux/barres fermés. Par défaut le code est à GAUCHE (~1/3) et Kablix à
 * DROITE (~2/3), mais l'utilisateur peut inverser les deux côtés et enregistrer
 * cette organisation (« Sauvegarder cette organisation par défaut ») : on
 * mémorise alors le CÔTÉ de Kablix ET le ratio, et on les rétablit aux
 * lancements suivants (les emplacements restent dédiés).
 *
 * L'API d'extension ne sait pas dimensionner en pixels ni sauvegarder un
 * « layout complet » (panneaux + barres) d'un bloc. On combine donc :
 *   • `vscode.setEditorLayout` pour la grille des groupes d'éditeurs (ratios),
 *   • des commandes `workbench.action.*` pour les barres et panneaux,
 *   • le placement des onglets (colonne du .projix / du code) selon le côté.
 */

/** Ratio de largeur du groupe de CODE (peu importe le côté). Kablix prend le reste. */
const LAYOUT_RATIO_KEY = 'kablix.layout.codeRatio';
/** Côté du simulateur Kablix : 'right' (défaut) ou 'left'. */
const LAYOUT_SIDE_KEY = 'kablix.layout.kablixSide';
/** Ratio par défaut : 1/3 code, 2/3 simulateur. */
const DEFAULT_CODE_RATIO = 1 / 3;

/** Côté du simulateur : 'left' | 'right'. */
export type KablixSide = 'left' | 'right';

/**
 * Exécute une commande du workbench SANS jamais faire échouer la suite.
 * `executeCommand` REJETTE sur un id inconnu (« command 'x' not found ») : une
 * seule commande absente d'une version de VS Code suffisait à interrompre toute
 * la disposition (la grille n'était plus posée du tout). Chaque étape est donc
 * indépendante ; l'échec est seulement journalisé.
 */
async function run(command: string, ...args: unknown[]): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(command, ...args);
    return true;
  } catch (err) {
    console.warn(`Kablix layout: ${command} — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Disposition déjà posée pour CETTE session ? Variable de module (pas
 * globalState) : elle repart à false à chaque relance de VS Code, si bien que la
 * disposition est reposée à la première ouverture de chaque session — mais plus
 * ensuite, pour respecter un ajustement manuel en cours de session.
 */
let layoutAppliedThisSession = false;

/** Ratio de code enregistré (borné à [0.15, 0.85]), défaut 1/3. */
function codeRatio(context: vscode.ExtensionContext): number {
  const raw = context.globalState.get<number>(LAYOUT_RATIO_KEY, DEFAULT_CODE_RATIO);
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_CODE_RATIO;
  return Math.min(0.85, Math.max(0.15, raw));
}

/** Côté enregistré du simulateur Kablix (défaut : droite). */
export function kablixSide(context: vscode.ExtensionContext): KablixSide {
  return context.globalState.get<KablixSide>(LAYOUT_SIDE_KEY, 'right') === 'left'
    ? 'left'
    : 'right';
}

/**
 * Colonne d'éditeur du simulateur Kablix selon le côté mémorisé. Avec deux
 * colonnes, la 1 est à gauche et la 2 à droite : Kablix à droite ⇒ colonne 2.
 */
export function kablixColumn(context: vscode.ExtensionContext): vscode.ViewColumn {
  return kablixSide(context) === 'left' ? vscode.ViewColumn.One : vscode.ViewColumn.Two;
}

/** Colonne d'éditeur du CODE (l'autre colonne que celle de Kablix). */
export function codeColumn(context: vscode.ExtensionContext): vscode.ViewColumn {
  return kablixSide(context) === 'left' ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
}

/**
 * Pose la grille à deux colonnes selon le côté et le ratio mémorisés. N'affecte
 * QUE la géométrie : le contenu des groupes est placé par ailleurs (le
 * simulateur s'ouvre dans `kablixColumn`, le code dans `codeColumn`).
 *
 * `setEditorLayout` attribue les tailles dans l'ORDRE des colonnes (1 = gauche).
 * On met donc le ratio de code du bon côté : code à gauche ⇒ ratio en premier ;
 * code à droite (Kablix à gauche) ⇒ ratio en second.
 */
export async function applyEditorGrid(context: vscode.ExtensionContext): Promise<void> {
  const ratio = codeRatio(context);
  const codeLeft = kablixSide(context) === 'right'; // code à gauche ⇔ Kablix à droite
  const sizes = codeLeft ? [ratio, 1 - ratio] : [1 - ratio, ratio];
  await run('vscode.setEditorLayout', {
    orientation: 0, // 0 = horizontal (colonnes côte à côte)
    groups: [{ size: sizes[0] }, { size: sizes[1] }],
  });
}

/**
 * Disposition complète au (premier) lancement : barres et panneau fermés +
 * grille selon le côté/ratio mémorisés. Idempotente sur la session : si
 * l'utilisateur a ensuite modifié la disposition, on ne la réimpose pas.
 * `force` rétablit la disposition à la demande (clic sur l'icône « réarranger »).
 */
export async function applyDefaultLayout(
  context: vscode.ExtensionContext,
  force = false
): Promise<void> {
  if (!force && layoutAppliedThisSession) return;
  layoutAppliedThisSession = true;
  // Tous panneaux fermés (demande de Frank) : barre latérale (explorateur) ET
  // panneau du bas (terminal/problèmes) fermés — il ne reste que les deux zones
  // d'éditeurs (code d'un côté, Kablix de l'autre).
  await run('workbench.action.closeSidebar');
  await run('workbench.action.closePanel');
  await run('workbench.action.closeAuxiliaryBar');
  // Côté AVANT largeurs : l'échange des groupes emporte leurs tailles, la grille
  // doit donc être reposée après coup.
  await placeKablixSide(context);
  // « Réarranger » (action explicite) remet en plus chaque onglet dans sa zone :
  // ateliers .projix côté Kablix, fichiers de code côté code. Pas à l'ouverture
  // automatique (force=false), où déplacer les onglets de l'utilisateur serait
  // une surprise.
  if (force) await sortTabsIntoColumns(context);
  await applyEditorGrid(context);
}

/** Nombre de zones d'éditeurs (groupes d'onglets) actuellement ouvertes. */
export function editorGroupCount(): number {
  return vscode.window.tabGroups.all.length;
}

/**
 * Re-pose côté ET largeurs APRÈS l'ouverture du fichier de code, mais SEULEMENT
 * si la seconde zone vient d'apparaître (`groupsBefore` valait 1).
 *
 * Pourquoi c'est nécessaire : quand tous les fichiers de code sont fermés, il ne
 * reste qu'UNE zone à l'ouverture du .projix. `setEditorLayout` crée bien la
 * seconde, mais elle est VIDE — et VS Code referme aussitôt les groupes vides
 * (`workbench.editor.closeEmptyGroups`, activé par défaut). La grille est donc
 * annulée dans la seconde qui suit ; le fichier de code, ouvert juste après,
 * recrée un groupe avec les largeurs par défaut (50/50) et du côté que VS Code
 * choisit. D'où le symptôme signalé par Frank : « le code s'ouvre au bon endroit
 * mais la taille des panneaux n'est pas refaite ».
 *
 * On ne fait rien si les deux zones existaient déjà : la disposition posée plus
 * tôt (ou ajustée à la main) doit être respectée.
 */
export async function settleLayoutAfterCode(
  context: vscode.ExtensionContext,
  groupsBefore: number
): Promise<void> {
  if (groupsBefore >= 2) return; // la seconde zone n'est pas nouvelle
  if (editorGroupCount() < 2) return; // toujours une seule zone : rien à répartir
  await placeKablixSide(context);
  await applyEditorGrid(context);
}

/**
 * Verrouille le groupe d'éditeurs du simulateur (celui appelant, supposé actif
 * au moment de la création du panneau). Un groupe verrouillé refuse tout nouvel
 * éditeur : les fichiers de code ouverts ensuite (explorateur, double-clic,
 * onglet du .projix) vont donc dans l'AUTRE groupe — la colonne de code. Sans
 * effet si le groupe est déjà verrouillé (commande idempotente).
 */
export async function lockSimulatorGroup(): Promise<void> {
  await run('workbench.action.lockEditorGroup');
}

/** Entrée d'onglet vue de façon souple (webview/custom = `viewType`, texte = `uri` seule). */
type TabInputLike = { uri?: vscode.Uri | string; viewType?: string };

/** Entrée d'un onglet, ou `undefined` (terminal, diff, aperçu sans ressource). */
function tabInput(tab: vscode.Tab): TabInputLike | undefined {
  const input = tab.input as TabInputLike | undefined;
  return input && typeof input === 'object' ? input : undefined;
}

/** Onglet d'atelier Kablix (éditeur personnalisé `kablix.projix`). */
function isProjixTab(tab: vscode.Tab): boolean {
  const input = tabInput(tab);
  return !!input && 'viewType' in input && String(input.viewType).includes('kablix.projix');
}

/**
 * Onglet de FICHIER ordinaire (programme, README…) : une `uri`, aucun `viewType`.
 * Les webviews et éditeurs personnalisés (atelier .projix, fiche d'aide, guide)
 * portent un `viewType` et sont donc exclus — seul l'atelier est repositionné,
 * les fiches d'aide restent où l'utilisateur les a mises.
 */
function isCodeTab(tab: vscode.Tab): boolean {
  const input = tabInput(tab);
  return !!input && !('viewType' in input) && input.uri !== undefined;
}

/** Identité d'un onglet (ressource + nature) : deux onglets de même clé sont des doublons. */
function tabKey(tab: vscode.Tab): string {
  const input = tabInput(tab);
  return `${input?.viewType ?? ''}\n${String(input?.uri ?? '')}`;
}

/**
 * Groupe d'éditeur contenant l'atelier .projix. Sert à savoir de quel côté
 * (gauche/droite) l'utilisateur a placé Kablix — au moment de « Sauvegarder
 * cette organisation par défaut » comme au moment de réarranger.
 *
 * On balaie TOUS les onglets de chaque groupe, pas seulement l'onglet actif :
 * il suffisait qu'un autre onglet soit au premier plan dans la colonne de
 * Kablix (ou que le focus soit passé au code) pour ne rien trouver — le côté
 * retombait alors sur « droite » et l'inversion n'était pas mémorisée.
 *
 * Quand des .projix traînent dans PLUSIEURS zones (signalé par Frank : « une
 * projix s'est ouverte dans chaque zone, et là c'est la panique »), le premier
 * trouvé ne veut plus rien dire. On départage : la zone dont l'onglet .projix
 * est au premier plan, sinon celle qui en compte le plus, sinon la plus à
 * gauche. Le tri (`sortTabsIntoColumns`) règle ensuite le fond du problème.
 */
function projixColumn(): vscode.ViewColumn | undefined {
  let best: { column: vscode.ViewColumn; count: number; active: boolean } | undefined;
  for (const group of vscode.window.tabGroups.all) {
    const count = group.tabs.filter(isProjixTab).length;
    if (count === 0) continue;
    const active = !!group.activeTab && isProjixTab(group.activeTab);
    if (!best || (active && !best.active) || (active === best.active && count > best.count)) {
      best = { column: group.viewColumn, count, active };
    }
  }
  return best?.column;
}

/** Nombre de zones contenant au moins un atelier .projix (>1 ⇒ disposition à trier). */
function projixGroupCount(): number {
  return vscode.window.tabGroups.all.filter((g) => g.tabs.some(isProjixTab)).length;
}

/**
 * Verrouille/déverrouille la zone d'une colonne donnée. Un groupe verrouillé
 * REFUSE tout éditeur entrant : sans le déverrouiller, le tri ne pourrait pas y
 * ramener un atelier égaré (et si la zone de code s'était retrouvée verrouillée,
 * plus aucun fichier de code ne pouvait y revenir).
 */
async function setGroupLock(column: vscode.ViewColumn, locked: boolean): Promise<void> {
  if (!(await focusGroup(column as number))) return;
  await run(locked ? 'workbench.action.lockEditorGroup' : 'workbench.action.unlockEditorGroup');
}

/**
 * Rend un onglet ACTIF dans SA propre zone, sans en ouvrir un second : les
 * commandes de déplacement (`moveEditorTo*Group`) n'agissent que sur l'éditeur
 * actif, et VS Code n'offre aucun moyen d'activer un onglet arbitraire par
 * l'API. Rouvrir la même ressource dans la MÊME colonne et le MÊME viewType ne
 * duplique rien : VS Code active l'onglet en place (cf. `openOrRevealProjix`).
 */
async function activateTab(tab: vscode.Tab): Promise<boolean> {
  const input = tabInput(tab);
  if (!input?.uri) return false;
  const column = tab.group.viewColumn;
  return input.viewType
    ? run('vscode.openWith', input.uri, input.viewType, column)
    : run('vscode.open', input.uri, column);
}

/** Onglet mal placé : sa zone actuelle, la zone attendue, et s'il fait doublon. */
type MisplacedTab = {
  tab: vscode.Tab;
  column: vscode.ViewColumn;
  target: vscode.ViewColumn;
  duplicate: boolean;
};

/**
 * Onglets qui ne sont pas dans leur zone dédiée : les ateliers .projix hors de
 * la zone Kablix, les fichiers de code hors de la zone de code. `duplicate` :
 * la MÊME ressource est déjà ouverte dans la zone cible — on ferme l'exemplaire
 * égaré au lieu de le déplacer (fermer n'est jamais destructeur ici, il reste
 * l'autre onglet du même document ; VS Code ne demande d'enregistrer que pour
 * le dernier).
 */
function misplacedTabs(
  kablixCol: vscode.ViewColumn,
  codeCol: vscode.ViewColumn
): MisplacedTab[] {
  const inTarget = new Map<vscode.ViewColumn, Set<string>>();
  for (const group of vscode.window.tabGroups.all) {
    inTarget.set(group.viewColumn, new Set(group.tabs.map(tabKey)));
  }
  const out: MisplacedTab[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const projix = isProjixTab(tab);
      if (!projix && !isCodeTab(tab)) continue; // fiche d'aide, guide, terminal : on n'y touche pas
      const target = projix ? kablixCol : codeCol;
      if (group.viewColumn === target) continue;
      out.push({
        tab,
        column: group.viewColumn,
        target,
        duplicate: inTarget.get(target)?.has(tabKey(tab)) ?? false,
      });
    }
  }
  return out;
}

/** Garde-fou de boucle : au pire un déplacement d'un cran par onglet et par colonne. */
const MAX_SORT_STEPS = 64;

/**
 * Remet chaque onglet dans sa zone dédiée : TOUS les ateliers .projix côté
 * Kablix, TOUS les fichiers de code côté code. Appelé par « réarranger les
 * fenêtres » (action explicite), jamais en arrière-plan.
 *
 * Pourquoi : il suffit qu'un .projix s'ouvre dans la zone de code (glisser un
 * onglet, « ouvrir sur le côté », restauration de session après changement de
 * dossier) pour que la disposition devienne incohérente — le côté de Kablix
 * n'est plus défini, l'échange de groupes déplace n'importe quoi, et le verrou
 * protège la mauvaise zone.
 *
 * L'état est RELU à chaque tour (les colonnes et les index changent à chaque
 * déplacement) et un onglet qui ne bouge pas est abandonné plutôt que réessayé
 * en boucle.
 */
export async function sortTabsIntoColumns(context: vscode.ExtensionContext): Promise<void> {
  const kablixCol = kablixColumn(context);
  const codeCol = codeColumn(context);
  // Les deux zones sont déverrouillées le temps du tri : le verrou de la zone
  // Kablix refuserait l'atelier qu'on lui ramène.
  await setGroupLock(kablixCol, false);
  if (codeCol !== kablixCol) await setGroupLock(codeCol, false);
  const abandoned = new Set<string>();
  for (let step = 0; step < MAX_SORT_STEPS; step++) {
    const job = misplacedTabs(kablixCol, codeCol).find((m) => !abandoned.has(tabKey(m.tab)));
    if (!job) break;
    const key = tabKey(job.tab);
    if (job.duplicate) {
      try {
        await vscode.window.tabGroups.close(job.tab);
      } catch {
        abandoned.add(key); // fermeture refusée : on laisse cet onglet tranquille
      }
      continue;
    }
    // Dernier onglet de sa zone et la zone cible n'existe pas encore : le
    // déplacer viderait la zone d'origine, VS Code la refermerait aussitôt
    // (closeEmptyGroups) et l'onglet reviendrait d'où il vient — un aller-retour
    // visible pour rien. On le laisse en place.
    const source = vscode.window.tabGroups.all.find((g) => g.viewColumn === job.column);
    const targetExists = vscode.window.tabGroups.all.some((g) => g.viewColumn === job.target);
    if (source?.tabs.length === 1 && !targetExists) {
      abandoned.add(key);
      continue;
    }
    const cmd = editorMoveCommand(job.column as number, job.target as number);
    if (!cmd || !(await activateTab(job.tab)) || !(await run(cmd))) {
      abandoned.add(key);
      continue;
    }
    // Sans effet (une seule zone, groupe refusé…) : ne pas insister.
    const stillThere = misplacedTabs(kablixCol, codeCol)
      .some((m) => tabKey(m.tab) === key && m.column === job.column);
    if (stillThere) abandoned.add(key);
  }
  // Verrou rétabli sur la SEULE zone Kablix : les fichiers de code ouverts
  // ensuite repartent dans l'autre colonne. Le focus reste sur l'atelier.
  await setGroupLock(kablixCol, true);
}

/**
 * Colonne d'un onglet de TEXTE déjà ouvert sur ce fichier, ou `undefined`. Si le
 * fichier est ouvert plusieurs fois, `preferred` l'emporte (on garde alors
 * l'onglet du bon côté). Les onglets d'éditeurs personnalisés (le .projix, une
 * fiche d'aide) portent un `viewType` : ils sont ignorés.
 */
export function textTabColumn(
  uri: vscode.Uri,
  preferred?: vscode.ViewColumn
): vscode.ViewColumn | undefined {
  const wanted = uri.toString();
  let found: vscode.ViewColumn | undefined;
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input as { uri?: vscode.Uri; viewType?: string } | undefined;
      if (!input || typeof input !== 'object' || 'viewType' in input) continue;
      if (input.uri?.toString() !== wanted) continue;
      if (group.viewColumn === preferred) return group.viewColumn;
      found ??= group.viewColumn;
    }
  }
  return found;
}

/** Commande de déplacement de l'ÉDITEUR actif d'un cran vers la colonne cible. */
export function editorMoveCommand(current: number, target: number): string | null {
  if (current === target) return null;
  return target < current
    ? 'workbench.action.moveEditorToLeftGroup'
    : 'workbench.action.moveEditorToRightGroup';
}

/**
 * Déplace l'onglet de `uri` (supposé ACTIF) jusqu'à la colonne `target`, un cran
 * à la fois. Sert à ne PAS ouvrir un second onglet du même fichier quand il est
 * déjà ouvert du mauvais côté : on repositionne l'existant.
 *
 * VS Code n'a pas de `moveEditorToNthGroup` (seuls First/Last/Left/Right
 * existent) : d'où la boucle, bornée et interrompue dès qu'un déplacement reste
 * sans effet (colonne relue entre chaque cran).
 */
export async function moveEditorToColumn(uri: vscode.Uri, target: vscode.ViewColumn): Promise<void> {
  for (let step = 0; step < FOCUS_GROUP_COMMANDS.length; step++) {
    const current = textTabColumn(uri, target);
    const cmd = current === undefined ? null : editorMoveCommand(current, target);
    if (!cmd) return;
    if (!(await run(cmd))) return;
    if (textTabColumn(uri, target) === current) return; // sans effet : ne pas insister
  }
}

/**
 * Commande d'échange des deux groupes pour amener celui de Kablix (colonne
 * `current`) sur la colonne `target`. `null` s'il n'y a rien à faire.
 *
 * On déplace le GROUPE, pas l'onglet : sortir l'onglet Kablix de son groupe le
 * viderait, VS Code fermerait le groupe vide et il ne resterait qu'une colonne.
 * L'échange conserve les deux zones, leurs contenus et le verrou du groupe
 * simulateur (le verrou est une propriété du groupe, il suit le déplacement).
 *
 * Les ids sont `moveACTIVEEditorGroupLeft/Right` : `moveEditorGroupLeft/Right`
 * (v183) n'existe PAS dans VS Code — `executeCommand` rejetait, la disposition
 * s'arrêtait là et plus rien n'était rétabli, ni le côté ni les largeurs.
 */
export function groupSwapCommand(current: number, target: number): string | null {
  if (current === target) return null;
  return target < current
    ? 'workbench.action.moveActiveEditorGroupLeft'
    : 'workbench.action.moveActiveEditorGroupRight';
}

/**
 * Commandes de focus par NUMÉRO de colonne (1 = gauche). VS Code n'en fournit
 * que jusqu'à la 8e — au-delà, on ne touche à rien plutôt que de risquer de
 * déplacer le mauvais groupe.
 */
const FOCUS_GROUP_COMMANDS = [
  'workbench.action.focusFirstEditorGroup',
  'workbench.action.focusSecondEditorGroup',
  'workbench.action.focusThirdEditorGroup',
  'workbench.action.focusFourthEditorGroup',
  'workbench.action.focusFifthEditorGroup',
  'workbench.action.focusSixthEditorGroup',
  'workbench.action.focusSeventhEditorGroup',
  'workbench.action.focusEighthEditorGroup',
];

/** Commande de focus du groupe de la colonne donnée, `null` hors des 8 premières. */
export function focusGroupCommand(column: number): string | null {
  return FOCUS_GROUP_COMMANDS[column - 1] ?? null;
}

/** Donne le focus au groupe d'éditeur de la colonne donnée (1 = gauche). */
async function focusGroup(column: number): Promise<boolean> {
  const cmd = focusGroupCommand(column);
  return cmd ? run(cmd) : false;
}

/**
 * Remet le groupe de Kablix du côté mémorisé. Sans cela, « réarranger » ne
 * reposait que les LARGEURS : si l'utilisateur avait inversé les deux zones
 * depuis, le code restait à gauche et Kablix à droite (l'inversion n'était
 * rétablie qu'à la réouverture du .projix, qui vise `kablixColumn`).
 */
async function placeKablixSide(context: vscode.ExtensionContext): Promise<void> {
  if (vscode.window.tabGroups.all.length < 2) return; // une seule zone : rien à échanger
  // Des ateliers .projix dans plusieurs zones : « quel côté est celui de Kablix »
  // n'a plus de sens et l'échange déplacerait des groupes au hasard. On laisse
  // le tri (sortTabsIntoColumns) rassembler les onglets d'abord.
  if (projixGroupCount() > 1) return;
  const target = kablixColumn(context);
  // Boucle bornée : avec 3 colonnes ou plus, un seul échange ne suffit pas à
  // ramener Kablix sur la colonne cible. On relit la colonne réelle à chaque
  // tour — si la commande reste sans effet, on s'arrête au lieu de tourner.
  for (let step = 0; step < FOCUS_GROUP_COMMANDS.length; step++) {
    const current = projixColumn();
    const cmd = current === undefined ? null : groupSwapCommand(current, target);
    if (!cmd) return;
    if (!(await focusGroup(current as number))) return; // groupe hors de portée
    if (!(await run(cmd))) return;
    if (projixColumn() === current) return; // sans effet : ne pas insister
  }
}

/**
 * « Sauvegarder cette organisation par défaut » : lit la grille d'éditeurs
 * courante ET la colonne de l'onglet Kablix, puis mémorise le CÔTÉ de Kablix
 * (gauche/droite) et le ratio du groupe de code. Restaurés tels quels aux
 * lancements suivants — les emplacements restent dédiés (Kablix ne change plus
 * de côté). Le layout ne conserve que les ratios de largeur — l'API n'offre pas
 * mieux (pas de pixels ni de tailles de barres).
 */
export async function saveDefaultLayout(context: vscode.ExtensionContext): Promise<void> {
  try {
    const layout = (await vscode.commands.executeCommand('vscode.getEditorLayout')) as {
      orientation?: number;
      groups?: { size?: number }[];
    };
    const groups = layout?.groups ?? [];
    // Côté de Kablix = colonne de l'onglet .projix actif (1 = gauche, 2 = droite).
    const kablixCol = projixColumn();
    const side: KablixSide = kablixCol === 1 ? 'left' : 'right';
    await context.globalState.update(LAYOUT_SIDE_KEY, side);

    if (groups.length >= 2) {
      const sizes = groups.map((g) => (typeof g.size === 'number' ? g.size : 0));
      const total = sizes.reduce((a, b) => a + b, 0);
      // Ratio du groupe de CODE (celui qui n'est pas Kablix). Kablix à gauche
      // (side='left') ⇒ code à droite ⇒ 2e groupe ; sinon code à gauche ⇒ 1er.
      const codeIdx = side === 'left' ? 1 : 0;
      const ratio = total > 0 ? sizes[codeIdx] / total : DEFAULT_CODE_RATIO;
      await context.globalState.update(LAYOUT_RATIO_KEY, ratio);
      vscode.window.setStatusBarMessage(
        vscode.l10n.t('Kablix: default layout saved ({0}% / {1}%).',
          Math.round(ratio * 100), Math.round((1 - ratio) * 100)),
        4000
      );
      return;
    }
    // Un seul groupe : on retient le ratio par défaut (le côté est déjà posé).
    await context.globalState.update(LAYOUT_RATIO_KEY, DEFAULT_CODE_RATIO);
    vscode.window.setStatusBarMessage(vscode.l10n.t('Kablix: default layout saved.'), 4000);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Kablix : ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
