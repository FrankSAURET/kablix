import * as vscode from 'vscode';

/**
 * Deux numéros de version (décision de Frank, 21 août 2026) :
 *  - PUBLIC  : `version` de package.json, calver `AAAA.MM.incrément`. Il n'avance
 *    qu'à une VRAIE publication et vaut toujours celui de la PROCHAINE version
 *    publiée.
 *  - INTERNE : `buildNumber` de package.json, compteur qui démarre à 1 et ne
 *    repart JAMAIS à zéro (ni au changement de mois, ni au bump du public).
 *    Il avance à chaque lot livré et n'intéresse que les développeurs.
 *
 * L'interface affiche `2026.8.102.7` pendant le développement, `2026.8.102` chez
 * l'utilisateur : le numéro interne ne doit jamais fuir dans une version publiée.
 */

let modeDeveloppement = false;

/** Mémorise le mode d'exécution de l'extension (appelé une fois par `activate`). */
export function memoriserModeExtension(mode: vscode.ExtensionMode): void {
  modeDeveloppement = mode !== vscode.ExtensionMode.Production;
}

function manifeste(): { version?: string; buildNumber?: number | string } {
  return vscode.extensions.getExtension('electropol-fr.kablix')?.packageJSON ?? {};
}

/**
 * Vrai hors production — donc pendant un F5 de développement et dans une
 * fenêtre d'extension de test, faux dans une extension installée depuis la
 * place de marché.
 *
 * La webview ne peut pas répondre à cette question toute seule : elle n'a pas
 * `vscode.ExtensionMode`, et la construction qui produit son paquet est la même
 * dans les deux cas. C'est donc l'hôte qui le lui dit (attribut du `body` dans
 * `webview-html.ts`).
 */
export function enDeveloppement(): boolean {
  return modeDeveloppement;
}

/** Numéro public seul : `2026.8.102`. Chaîne vide si introuvable. */
export function versionPublique(): string {
  return manifeste().version ?? '';
}

/** Numéro affiché : public en production, public + build en développement. */
export function versionAffichee(): string {
  const publique = versionPublique();
  const build = manifeste().buildNumber;
  return modeDeveloppement && publique && build ? `${publique}.${build}` : publique;
}
