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
  await vscode.commands.executeCommand('vscode.setEditorLayout', {
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
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
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
  await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
}

/**
 * Groupe d'éditeur contenant l'onglet .projix ACTIF, s'il y en a un. Sert à
 * savoir de quel côté (gauche/droite) l'utilisateur a placé Kablix au moment de
 * « Sauvegarder cette organisation par défaut ».
 */
function activeProjixColumn(): vscode.ViewColumn | undefined {
  for (const group of vscode.window.tabGroups.all) {
    const tab = group.activeTab;
    const input = tab?.input as { uri?: vscode.Uri; viewType?: string } | undefined;
    if (
      tab &&
      input &&
      typeof input === 'object' &&
      'viewType' in input &&
      String(input.viewType).includes('kablix.projix')
    ) {
      return group.viewColumn;
    }
  }
  return undefined;
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
    const kablixCol = activeProjixColumn();
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
