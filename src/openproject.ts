import * as vscode from 'vscode';
import { kablixColumn } from './layout';

const l10n = vscode.l10n;

/**
 * Type de l'éditeur personnalisé des projets .projix. Déclaré ICI (et non dans
 * `projix-editor.ts`) pour que le repérage des onglets ouverts n'entraîne pas
 * tout l'éditeur avec lui : ce module ne dépend que de `vscode` et de
 * `layout.ts`, donc il se teste sous un faux `vscode` (banc `verify:reveal`).
 */
export const PROJIX_VIEW_TYPE = 'kablix.projix';

/** Compteur d'untitled pour donner une URI DISTINCTE à chaque « nouveau projet »
 *  (même URI ⇒ VS Code révèle l'onglet existant au lieu d'en ouvrir un autre). */
let untitledCounter = 0;

/**
 * Onglet .projix déjà ouvert dans la fenêtre, vu depuis les GROUPES D'ONGLETS et
 * non depuis les sessions vivantes. C'est toute la nuance : après un changement
 * de dossier (rechargement de fenêtre), VS Code restaure bien les onglets
 * .projix, mais un éditeur personnalisé n'est résolu que lorsqu'il devient
 * visible — `SimulatorPanel.active()` renvoie donc `undefined` alors qu'un
 * atelier est là, replié dans un autre groupe. Sans ce repérage, l'icône Kablix
 * empilait un « nouveau projet » à côté de l'atelier existant.
 *
 * Priorité : l'onglet actif du groupe actif, puis l'onglet actif d'un autre
 * groupe, puis le premier .projix trouvé.
 */
export function findOpenProjixTab(): vscode.Tab | undefined {
  const isProjix = (tab: vscode.Tab): boolean =>
    tab.input instanceof vscode.TabInputCustom && tab.input.viewType === PROJIX_VIEW_TYPE;
  const groups = vscode.window.tabGroups.all;
  const activeGroup = vscode.window.tabGroups.activeTabGroup;
  const ordered = [
    ...(activeGroup ? [activeGroup] : []),
    ...groups.filter((g) => g !== activeGroup),
  ];
  for (const group of ordered) {
    if (group.activeTab && isProjix(group.activeTab)) return group.activeTab;
  }
  for (const group of ordered) {
    const found = group.tabs.find(isProjix);
    if (found) return found;
  }
  return undefined;
}

/**
 * Icône Kablix sans session vivante : on RÉVÈLE l'atelier .projix déjà ouvert
 * s'il y en a un (cas du changement de dossier, cf. `findOpenProjixTab`), sinon
 * seulement on ouvre un nouveau projet.
 */
export async function openOrRevealProjix(context: vscode.ExtensionContext): Promise<void> {
  const tab = findOpenProjixTab();
  if (tab && tab.input instanceof vscode.TabInputCustom) {
    try {
      // Rouvrir la MÊME uri dans le MÊME viewType ne duplique rien : VS Code
      // active l'onglet en place (et le résout, ce qui recrée la session).
      await vscode.commands.executeCommand(
        'vscode.openWith',
        tab.input.uri,
        PROJIX_VIEW_TYPE,
        tab.group.viewColumn
      );
      return;
    } catch {
      // Fichier disparu du disque depuis la restauration de l'onglet : on ne
      // laisse pas l'icône Kablix sans effet, on ouvre un nouveau projet.
    }
  }
  await openNewProjix(context);
}

/**
 * Ouvre un nouveau projet Kablix : un document .projix « untitled » dans
 * l'éditeur personnalisé, dans un NOUVEL onglet du côté Kablix mémorisé (droite
 * par défaut). Le point ● natif apparaît dès la première modification ; Ctrl+S
 * propose l'emplacement.
 */
export async function openNewProjix(context: vscode.ExtensionContext): Promise<void> {
  // URI untitled unique : sans le suffixe, rouvrir « nouveau projet » ne ferait
  // que révéler l'onglet déjà ouvert.
  const suffix = untitledCounter === 0 ? '' : ` ${untitledCounter + 1}`;
  untitledCounter++;
  const name = l10n.t('New project') + suffix + '.projix';
  const uri = vscode.Uri.parse('untitled:' + name);
  await vscode.commands.executeCommand(
    'vscode.openWith',
    uri,
    PROJIX_VIEW_TYPE,
    kablixColumn(context)
  );
}
