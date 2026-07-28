// Extensions CONSEILLÉES à côté de Kablix : Kablix simule, elles s'occupent du
// reste de la chaîne (téléversement sur la vraie carte, gestion des cartes et
// des bibliothèques). Elles ne sont pas des dépendances — Kablix fonctionne seul
// —, on se contente donc de les proposer UNE FOIS, puis via une commande.
import * as vscode from 'vscode';

const l10n = vscode.l10n;

/** Marque « proposition déjà faite » (une seule fois par machine). */
const RECO_PROMPTED_KEY = 'kablix.recommendedExtensionsPrompted';

/** Extensions conseillées (choix de Frank). */
export const RECOMMENDED_EXTENSIONS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'electropol-fr.arduino-vscode-ide', name: 'Arduino VS Code IDE' },
  { id: 'framboise-pi.frappy-pi-pico', name: 'Frappy Pi Pico' },
];

/** Celles qui ne sont pas encore installées. */
export function missingRecommended(): Array<{ id: string; name: string }> {
  return RECOMMENDED_EXTENSIONS.filter((e) => !vscode.extensions.getExtension(e.id));
}

/**
 * Installe les extensions conseillées manquantes (barre de progression, une par
 * une : `installExtension` ne prend qu'un identifiant). Les échecs sont signalés
 * sans interrompre les suivantes.
 */
export async function installRecommendedExtensions(): Promise<void> {
  const missing = missingRecommended();
  if (missing.length === 0) {
    void vscode.window.showInformationMessage(
      l10n.t('Kablix: the recommended extensions are already installed.')
    );
    return;
  }
  const failed: string[] = [];
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: l10n.t('Kablix: installing the recommended extensions…') },
    async () => {
      for (const e of missing) {
        try {
          await vscode.commands.executeCommand('workbench.extensions.installExtension', e.id);
        } catch {
          failed.push(e.name);
        }
      }
    }
  );
  if (failed.length > 0) {
    void vscode.window.showErrorMessage(
      l10n.t('Kablix: could not install {0}. Install it from the Extensions view.', failed.join(', '))
    );
  } else {
    void vscode.window.showInformationMessage(
      l10n.t('Kablix: recommended extensions installed.')
    );
  }
}

/**
 * Ouvre la vue Extensions filtrée sur les extensions conseillées : l'utilisateur
 * voit les fiches et décide lui-même. Repli si la recherche n'est pas disponible.
 */
export async function showRecommendedExtensions(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.extensions.search',
    RECOMMENDED_EXTENSIONS.map((e) => `@id:${e.id}`).join(' ')
  );
}

/**
 * À la première activation, propose une seule fois d'installer les extensions
 * conseillées absentes. Mémorisé dans globalState quel que soit le choix : on ne
 * redemande plus (la commande « Extensions conseillées » reste disponible).
 * `forced` : appel explicite par la commande, la mémoire est ignorée.
 */
export async function promptRecommendedExtensions(
  context: vscode.ExtensionContext,
  forced = false
): Promise<void> {
  const missing = missingRecommended();
  if (!forced) {
    if (context.globalState.get<boolean>(RECO_PROMPTED_KEY, false)) return;
    if (missing.length === 0) return;
  }
  if (forced && missing.length === 0) {
    void vscode.window.showInformationMessage(
      l10n.t('Kablix: the recommended extensions are already installed.')
    );
    return;
  }
  const install = l10n.t('Install');
  const see = l10n.t('See them');
  const later = l10n.t('Not now');
  const choice = await vscode.window.showInformationMessage(
    l10n.t(
      'Kablix works well with {0}: uploading to a real board, board and library management. Install them?',
      missing.map((e) => e.name).join(l10n.t(' and '))
    ),
    install,
    see,
    later
  );
  // Quel que soit le choix (y compris fermeture), on ne redemande plus tout seul.
  await context.globalState.update(RECO_PROMPTED_KEY, true);
  if (choice === install) await installRecommendedExtensions();
  else if (choice === see) await showRecommendedExtensions();
}
