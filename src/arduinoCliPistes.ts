// Pistes vers arduino-cli qui demandent l'API VS Code : réglages et dossiers de
// l'extension sœur « Arduino VS Code IDE ». Isolé ici parce que compiler.ts doit
// rester exécutable en Node nu (les bancs de test l'importent sans VS Code).
import * as vscode from 'vscode';
import { dirname, join } from 'node:path';
import {
  chercherArduinoCli,
  diagnosticCliIntrouvable,
  type RechercheCli,
  type ToolPaths,
} from './compiler';

/** Identifiant de l'extension qui installe et range le CLI. */
export const EXT_ARDUINO_IDE = 'electropol-fr.arduino-vscode-ide';

/**
 * Dossier de stockage global de l'extension sœur. Il est FRÈRE du nôtre : on le
 * dérive de `globalStorageUri` de Kablix en remplaçant le dernier segment
 * (notre identifiant) par le sien. Reconstruire depuis %APPDATA% serait faux
 * sous VSCodium, VS Code Insiders, macOS et Linux, où la racine diffère.
 */
export function stockageGlobalArduinoIde(context: vscode.ExtensionContext): string {
  return join(dirname(context.globalStorageUri.fsPath), EXT_ARDUINO_IDE);
}

/**
 * Dossier d'installation de l'extension sœur (ancien emplacement du CLI, avant
 * sa v2026.9.3). Absent si l'extension n'est pas installée.
 */
export function installationArduinoIde(): string | undefined {
  return vscode.extensions.getExtension(EXT_ARDUINO_IDE)?.extensionPath;
}

/** Pistes VS Code à joindre aux réglages Kablix pour résoudre arduino-cli. */
export function pistesArduinoIde(context: vscode.ExtensionContext): Partial<ToolPaths> {
  // Réglages de l'AUTRE extension : l'utilisateur a pu y désigner son propre CLI.
  const cfg = vscode.workspace.getConfiguration('arduino');
  return {
    autreCommandPath: cfg.get<string>('commandPath')?.trim() || undefined,
    autrePath: cfg.get<string>('path')?.trim() || undefined,
    autreStockageGlobal: stockageGlobalArduinoIde(context),
    autreInstallation: installationArduinoIde(),
  };
}

/** Recherche complète de arduino-cli, réglages Kablix + pistes VS Code. */
export function chercherCli(context: vscode.ExtensionContext): RechercheCli {
  const kablix = vscode.workspace.getConfiguration('kablix');
  return chercherArduinoCli({
    arduinoCli: kablix.get<string>('arduinoCliPath')?.trim() || undefined,
    searchDir: kablix.get<string>('toolchainPath')?.trim() || undefined,
    ...pistesArduinoIde(context),
  });
}

/**
 * Commande « Kablix : redétecter arduino-cli ». Rien n'est mis en cache : la
 * commande relance simplement la recherche et dit ce qu'elle a trouvé — ou, à
 * défaut, TOUS les emplacements examinés (un message générique rendrait le
 * diagnostic impossible).
 */
export async function redetecterArduinoCli(context: vscode.ExtensionContext): Promise<void> {
  const recherche = chercherCli(context);
  if (recherche.chemin) {
    const copier = vscode.l10n.t('Copy path');
    const choix = await vscode.window.showInformationMessage(
      vscode.l10n.t('arduino-cli found ({0}): {1}', recherche.origine ?? '?', recherche.chemin),
      copier
    );
    if (choix === copier) await vscode.env.clipboard.writeText(recherche.chemin);
    return;
  }
  const detail = diagnosticCliIntrouvable(recherche);
  const reglage = vscode.l10n.t('Open settings');
  const choix = await vscode.window.showWarningMessage(
    vscode.l10n.t('arduino-cli not found.'),
    { modal: true, detail },
    reglage
  );
  if (choix === reglage) {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'kablix.arduinoCliPath');
  }
}
