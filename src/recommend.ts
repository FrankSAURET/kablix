// Extensions CONSEILLÉES à côté de Kablix : Kablix simule, elles s'occupent du
// reste de la chaîne (téléversement sur la vraie carte, gestion des cartes et
// des bibliothèques). Elles ne sont pas des dépendances — Kablix fonctionne seul
// —, on se contente donc de les proposer UNE FOIS, puis via une commande.
import * as vscode from 'vscode';

const l10n = vscode.l10n;

/** Marque « proposition déjà faite » (une seule fois par machine). */
const RECO_PROMPTED_KEY = 'kablix.recommendedExtensionsPrompted';

/**
 * Extensions conseillées (choix de Frank). `reason` est une fonction : la
 * traduction doit être résolue à l'affichage, pas au chargement du module.
 */
export interface RecommendedExtension {
  id: string;
  name: string;
  reason: () => string;
}
export const RECOMMENDED_EXTENSIONS: ReadonlyArray<RecommendedExtension> = [
  {
    id: 'electropol-fr.arduino-vscode-ide',
    name: 'Arduino VS Code IDE',
    reason: () =>
      l10n.t('Kablix recommends the “Arduino VS Code IDE” extension for the Arduino development environment.'),
  },
  {
    id: 'raspberry-pi.raspberry-pi-pico',
    name: 'Raspberry Pi Pico',
    reason: () =>
      l10n.t(
        'Kablix recommends the “Raspberry Pi Pico” extension for the Raspberry Pi Pico C/C++ and MicroPython development environment.'
      ),
  },
];

/** Celles qui ne sont pas encore installées. */
export function missingRecommended(): RecommendedExtension[] {
  return RECOMMENDED_EXTENSIONS.filter((e) => !vscode.extensions.getExtension(e.id));
}

/**
 * Installe les extensions conseillées manquantes (barre de progression, une par
 * une : `installExtension` ne prend qu'un identifiant). Les échecs sont signalés
 * sans interrompre les suivantes.
 */
export async function installRecommendedExtensions(only?: RecommendedExtension): Promise<void> {
  const missing = only ? [only] : missingRecommended();
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
export async function showRecommendedExtensions(only?: RecommendedExtension): Promise<void> {
  const shown = only ? [only] : RECOMMENDED_EXTENSIONS;
  await vscode.commands.executeCommand(
    'workbench.extensions.search',
    shown.map((e) => `@id:${e.id}`).join(' ')
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
  const see = l10n.t('See it');
  const later = l10n.t('Not now');
  // Une bulle par extension : chaque texte dit ce qu'elle apporte.
  for (const e of missing) {
    const choice = await vscode.window.showInformationMessage(e.reason(), install, see, later);
    if (choice === install) await installRecommendedExtensions(e);
    else if (choice === see) await showRecommendedExtensions(e);
  }
  // Quel que soit le choix (y compris fermeture), on ne redemande plus tout seul.
  await context.globalState.update(RECO_PROMPTED_KEY, true);
}
