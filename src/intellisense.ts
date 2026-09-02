// Coloration et analyse de code TOUJOURS valides dans un projet Kablix : plus de
// soulignement rouge sous `Serial` dans un `.ino`, plus de « import machine
// introuvable » dans un `.py` MicroPython.
//
// Kablix n'analyse aucun code lui-même — ce sont les extensions installées qui le
// font (cpptools pour le C++, Pylance pour le Python). Elles ne savent juste pas
// de quel monde parle le fichier ouvert : le sketch .ino n'est pas du C++ de
// bureau, et le .py du Pico n'est pas du Python de bureau. Il leur manque à
// chacune UN réglage, que Kablix connaît déjà puisqu'il connaît la carte :
//
//  • Arduino (.ino) : « Arduino VS Code IDE » sait fabriquer le
//    `c_cpp_properties.json` de la carte, mais seulement quand on le lui
//    demande. Kablix vient d'écrire la carte dans `.vscode/arduino.yaml`
//    (voir arduinoIde.ts) : on enchaîne sur sa commande de reconstruction.
//  • Pico (.py) : Pylance ne connaît ni `machine`, ni `neopixel`, ni `rp2`. Les
//    déclarations de ces modules sont livrées AVEC l'extension MicroPico
//    (dossier `mpy_stubs`) ; il suffit d'indiquer ce dossier à Pylance dans les
//    réglages du dossier de travail.
//
// Confort pur : tout est silencieux, toute erreur est avalée. Aucun réglage
// existant n'est écrasé — on n'AJOUTE que ce qui manque.
import * as vscode from 'vscode';
import type { Board } from './compiler';
import { arduinoIdeTarget, ARDUINO_IDE_EXTENSION_ID } from './arduinoIde';

/** Réglage utilisateur : mise au point de l'analyse de code, active par défaut. */
const SETTING = 'kablix.syncIntelliSense';

/** Identifiant Marketplace de l'extension MicroPython (MicroPico). */
export const MICROPICO_EXTENSION_ID = 'paulober.pico-w-go';

/** Commande de l'extension Arduino qui régénère `.vscode/c_cpp_properties.json`. */
const ARDUINO_REBUILD = 'arduino.rebuildIntelliSenseConfig';

/** Dossier des déclarations MicroPython livré dans MicroPico. */
const STUBS_DIR = 'mpy_stubs';

/**
 * Déjà fait pour ce couple (dossier, carte) : on ne relance pas la mise au point
 * à chaque clic dans la webview. La carte fait partie de la clé — changer de
 * carte change le `c_cpp_properties.json` attendu.
 */
const dejaFait = new Set<string>();

/** Dossier de travail qui porte le fichier, sinon le premier ouvert. */
function dossier(hint?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  if (hint) {
    const owner = vscode.workspace.getWorkspaceFolder(hint);
    if (owner) return owner;
  }
  return folders[0];
}

/** Vrai si ce chemin existe (fichier ou dossier). */
async function existe(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ajoute une valeur à un réglage-liste du dossier de travail SANS toucher au
 * reste : si elle y est déjà, on n'écrit rien (chaque écriture rouvre le fichier
 * de réglages et réveille Pylance). Passe par l'API de configuration et non par
 * un `settings.json` réécrit à la main : le fichier accepte les commentaires, et
 * VS Code sait les préserver, pas nous.
 */
async function ajouterAuChemin(
  cfg: vscode.WorkspaceConfiguration,
  cle: string,
  valeur: string,
  cible: vscode.ConfigurationTarget
): Promise<boolean> {
  const vue = cfg.inspect<string[]>(cle);
  const actuel =
    (cible === vscode.ConfigurationTarget.WorkspaceFolder
      ? vue?.workspaceFolderValue
      : vue?.workspaceValue) ?? [];
  if (actuel.includes(valeur)) return false;
  await cfg.update(cle, [...actuel, valeur], cible);
  return true;
}

/**
 * Sketch `.ino` : demande à l'extension Arduino de régénérer sa configuration
 * IntelliSense pour la carte que Kablix vient d'écrire dans `arduino.yaml`.
 * Sans ça, cpptools analyse le sketch comme du C++ nu — `Serial`, `pinMode`,
 * `digitalWrite` sont alors autant de soulignements rouges.
 */
async function miseAuPointArduino(): Promise<boolean> {
  if (!vscode.extensions.getExtension(ARDUINO_IDE_EXTENSION_ID)) return false;
  const commandes = await vscode.commands.getCommands(true);
  if (!commandes.includes(ARDUINO_REBUILD)) return false;
  await vscode.commands.executeCommand(ARDUINO_REBUILD);
  return true;
}

/**
 * Programme `.py` de Pico : montre à Pylance le dossier de déclarations
 * MicroPython livré avec MicroPico. Trois réglages, posés sur le DOSSIER de
 * travail (`.vscode/settings.json`), aucun écrasé s'il existe déjà :
 *  • `typeshedPaths` + `extraPaths` → Pylance sait ce qu'est `machine.Pin` ;
 *  • `reportMissingModuleSource` → plus de trait ondulé jaune sous l'import
 *    (les déclarations sont des `.pyi` : il n'y a PAS de source à trouver, et
 *    c'est normal — le vrai module vit dans la puce).
 */
async function miseAuPointMicroPython(folder: vscode.WorkspaceFolder): Promise<boolean> {
  const ext = vscode.extensions.getExtension(MICROPICO_EXTENSION_ID);
  if (!ext) return false;
  const stubs = vscode.Uri.joinPath(ext.extensionUri, STUBS_DIR);
  if (!(await existe(stubs))) return false;

  const cible = vscode.ConfigurationTarget.WorkspaceFolder;
  const cfg = vscode.workspace.getConfiguration(undefined, folder.uri);
  let ecrit = false;
  ecrit = (await ajouterAuChemin(cfg, 'python.analysis.typeshedPaths', stubs.fsPath, cible)) || ecrit;
  ecrit = (await ajouterAuChemin(cfg, 'python.analysis.extraPaths', stubs.fsPath, cible)) || ecrit;

  // Import résolu par une déclaration seule : ce n'est pas un défaut ici.
  const vue = cfg.inspect<Record<string, string>>('python.analysis.diagnosticSeverityOverrides');
  const surcharges = { ...(vue?.workspaceFolderValue ?? {}) };
  if (surcharges.reportMissingModuleSource !== 'none') {
    surcharges.reportMissingModuleSource = 'none';
    await cfg.update('python.analysis.diagnosticSeverityOverrides', surcharges, cible);
    ecrit = true;
  }
  return ecrit;
}

/**
 * Rend l'analyse de code valide pour la carte courante. Appelée à chaque choix
 * de carte, juste après la synchro `arduino.yaml` : le premier passage fait le
 * travail, les suivants ne coûtent rien (mémoire `dejaFait`).
 *
 * `hint` : le fichier qui désigne le dossier de travail (programme, .projix…).
 */
export async function syncIntelliSense(board: Board, hint?: vscode.Uri): Promise<boolean> {
  try {
    if (!vscode.workspace.getConfiguration().get<boolean>(SETTING, true)) return false;
    const folder = dossier(hint);
    if (!folder) return false;
    const cle = `${folder.uri.toString()}|${board}`;
    if (dejaFait.has(cle)) return false;
    dejaFait.add(cle);
    return arduinoIdeTarget(board) ? await miseAuPointArduino() : await miseAuPointMicroPython(folder);
  } catch {
    return false; // confort pur : jamais d'erreur remontée à l'utilisateur
  }
}

/** Oublie ce qui a été fait (tests, et rechargement de fenêtre côté hôte). */
export function resetIntelliSenseCache(): void {
  dejaFait.clear();
}
