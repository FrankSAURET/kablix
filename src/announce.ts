// Annonces ponctuelles faites à l'utilisateur après une mise à jour de Kablix.
//
// Une annonce est identifiée par une CLÉ, pas par un numéro de version : elle
// part une seule fois par machine, et changer la clé (composants-2…) suffira à
// en refaire une plus tard. Le modèle est celui des extensions conseillées
// (recommend.ts) : proposer, mémoriser quel que soit le choix, ne plus revenir.
import * as vscode from 'vscode';

const l10n = vscode.l10n;

/** Annonces déjà faites (tableau de clés) — une seule entrée de globalState. */
const ANNOUNCED_KEY = 'kablix.announcementsSeen';

/** Bibliothèque de composants téléchargeables (v2026.8.89). */
const COMPONENT_LIBRARY = 'components-library-1';

/** Les clés d'annonces déjà montrées sur cette machine. */
function seen(context: vscode.ExtensionContext): string[] {
  const raw = context.globalState.get<unknown>(ANNOUNCED_KEY);
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
}

async function markSeen(context: vscode.ExtensionContext, key: string): Promise<void> {
  const list = seen(context);
  if (!list.includes(key)) await context.globalState.update(ANNOUNCED_KEY, [...list, key]);
}

/**
 * Prévient une fois que des composants sont désormais à télécharger : c'est la
 * nouveauté que rien ne signale dans l'interface — le bouton « ⇩ Importer des
 * composants » est en bas de la palette, là où personne ne va spontanément.
 * `forced` : appel explicite (commande), la mémoire est ignorée.
 */
export async function announceComponentLibrary(
  context: vscode.ExtensionContext,
  forced = false
): Promise<void> {
  if (!forced && seen(context).includes(COMPONENT_LIBRARY)) return;
  // Mémorisé AVANT la question : la notification peut rester des heures à
  // l'écran, et deux fenêtres VS Code ouvertes en même temps la poseraient deux
  // fois.
  await markSeen(context, COMPONENT_LIBRARY);

  const open = l10n.t('Open the manager');
  const later = l10n.t('Not now');
  const choice = await vscode.window.showInformationMessage(
    l10n.t(
      'Kablix: new components are now available for download — open the component manager (button “⚙ Manage components”, at the bottom of the palette) to install them.'
    ),
    open,
    later
  );
  if (choice === open) await vscode.commands.executeCommand('kablix.openComponentManager');
}
