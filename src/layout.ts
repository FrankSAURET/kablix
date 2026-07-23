import * as vscode from 'vscode';

/**
 * Disposition par défaut de l'espace de travail Kablix : éditeur de code à
 * gauche (~1/3), simulateur Kablix à droite (~2/3), explorateur fermé.
 *
 * L'API d'extension ne sait pas dimensionner en pixels ni sauvegarder un
 * « layout complet » (panneaux + barres) d'un bloc. On combine donc :
 *   • `vscode.setEditorLayout` pour la grille des groupes d'éditeurs (ratios),
 *   • des commandes `workbench.action.*` pour les barres et panneaux.
 * Le ratio est réglable et mémorisé (l'utilisateur peut « Sauvegarder
 * l'organisation par défaut » depuis le menu Kablix). Une fois le layout posé
 * au premier lancement, on n'y touche plus : les ajustements manuels tiennent.
 */

/** Ratio de largeur du groupe de code (gauche). Le simulateur prend le reste. */
const LAYOUT_RATIO_KEY = 'kablix.layout.codeRatio';
/** Ratio par défaut : 1/3 code, 2/3 simulateur. */
const DEFAULT_CODE_RATIO = 1 / 3;

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

/**
 * Pose la grille à deux colonnes (code | simulateur) selon le ratio mémorisé.
 * N'affecte QUE la géométrie : le contenu des groupes est placé par ailleurs
 * (le simulateur s'ouvre dans la colonne 2, le code dans la colonne 1).
 */
export async function applyEditorGrid(context: vscode.ExtensionContext): Promise<void> {
  const ratio = codeRatio(context);
  await vscode.commands.executeCommand('vscode.setEditorLayout', {
    orientation: 0, // 0 = horizontal (colonnes côte à côte)
    groups: [{ size: ratio }, { size: 1 - ratio }],
  });
}

/**
 * Disposition complète au (premier) lancement : explorateur fermé + grille
 * 1/3-2/3. Idempotente sur la session via `LAYOUT_APPLIED_KEY` : si l'utilisateur
 * a ensuite modifié la disposition, on ne la réimpose pas. `force` rétablit la
 * disposition à la demande (réservé à un usage futur).
 */
export async function applyDefaultLayout(
  context: vscode.ExtensionContext,
  force = false
): Promise<void> {
  if (!force && layoutAppliedThisSession) return;
  layoutAppliedThisSession = true;
  // Tous panneaux fermés (demande de Frank) : barre latérale (explorateur) ET
  // panneau du bas (terminal/problèmes) fermés — il ne reste que les deux zones
  // d'éditeurs (code à gauche, Kablix à droite).
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  await applyEditorGrid(context);
}

/**
 * Verrouille le groupe d'éditeurs du simulateur (celui appelant, supposé actif
 * au moment de la création du panneau). Un groupe verrouillé refuse tout nouvel
 * éditeur : les fichiers de code ouverts ensuite (explorateur, double-clic,
 * onglet du .projix) vont donc dans l'AUTRE groupe — la colonne de code à
 * gauche. Sans effet si le groupe est déjà verrouillé (commande idempotente).
 */
export async function lockSimulatorGroup(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
}

/**
 * « Sauvegarder l'organisation par défaut » : lit la grille d'éditeurs courante
 * et en déduit le ratio de la colonne de gauche (code), mémorisé pour les
 * prochains lancements. Le layout ne conserve que les ratios de largeur —
 * l'API ne donne pas mieux.
 */
export async function saveDefaultLayout(context: vscode.ExtensionContext): Promise<void> {
  try {
    const layout = (await vscode.commands.executeCommand('vscode.getEditorLayout')) as {
      orientation?: number;
      groups?: { size?: number }[];
    };
    const groups = layout?.groups ?? [];
    if (groups.length >= 2) {
      const sizes = groups.map((g) => (typeof g.size === 'number' ? g.size : 0));
      const total = sizes.reduce((a, b) => a + b, 0);
      // La colonne de code est la première (gauche). Ratio = sa part du total.
      const ratio = total > 0 ? sizes[0] / total : DEFAULT_CODE_RATIO;
      await context.globalState.update(LAYOUT_RATIO_KEY, ratio);
      vscode.window.setStatusBarMessage(
        vscode.l10n.t('Kablix: default layout saved ({0}% / {1}%).',
          Math.round(ratio * 100), Math.round((1 - ratio) * 100)),
        4000
      );
      return;
    }
    // Un seul groupe : on retient le ratio par défaut.
    await context.globalState.update(LAYOUT_RATIO_KEY, DEFAULT_CODE_RATIO);
    vscode.window.setStatusBarMessage(vscode.l10n.t('Kablix: default layout saved.'), 4000);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Kablix : ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
