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

/** Réglage utilisateur : laisser la fenêtre de sortie s'ouvrir. Muet par défaut. */
const SHOW_OUTPUT_SETTING = 'kablix.showArduinoOutput';

/** Commande VS Code qui referme le panneau du bas (sortie, terminal, problèmes). */
const CLOSE_PANEL = 'workbench.action.closePanel';

/**
 * Instants (ms) où le panneau est refermé après une analyse demandée par
 * Kablix. Trois passages, pas un de plus : l'extension d'en face montre sa
 * sortie à CHAQUE compilation, analyse comprise — et elle re-analyse toute
 * seule ~5 s après un changement de carte (son `arduino.analyzeOnSettingChange`),
 * donc la sortie se rouvre une deuxième fois, bien après notre appel.
 *
 * Passé la dernière échéance, Kablix ne touche plus à rien : les boutons
 * « Vérifier » et « Téléverser » ouvrent la sortie comme d'habitude.
 */
const MASQUAGES_MS = [0, 7000, 11000];

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
 * Pose un réglage SIMPLE (une valeur, pas une liste) sur le dossier de travail,
 * seulement s'il manque : si la valeur qui s'applique déjà est la bonne (venue
 * des réglages utilisateur, par exemple), on n'écrit rien du tout.
 */
async function poserSiAbsent(
  cfg: vscode.WorkspaceConfiguration,
  cle: string,
  valeur: string,
  cible: vscode.ConfigurationTarget
): Promise<boolean> {
  if (cfg.get<string>(cle) === valeur) return false;
  await cfg.update(cle, valeur, cible);
  return true;
}

/** Vrai si l'utilisateur veut VOIR la fenêtre de sortie pendant ce travail. */
function sortieVisible(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(SHOW_OUTPUT_SETTING, false);
}

/** Referme le panneau du bas, sans bruit si la commande n'existe pas. */
async function fermerPanneau(): Promise<void> {
  try {
    await vscode.commands.executeCommand(CLOSE_PANEL);
  } catch {
    /* confort pur */
  }
}

/**
 * Rend la mise au point de l'analyse SILENCIEUSE : le panneau du bas est
 * refermé tout de suite, puis aux deux échéances de `MASQUAGES_MS` — le temps
 * que l'analyse différée de l'extension d'en face passe à son tour.
 */
function masquerSortieArduino(): void {
  for (const delai of MASQUAGES_MS) {
    if (delai === 0) {
      void fermerPanneau();
      continue;
    }
    const timer = setTimeout(() => void fermerPanneau(), delai);
    timer.unref?.(); // un test ou une fermeture de fenêtre n'attend pas ces échéances
  }
}

/**
 * Sketch `.ino` : demande à l'extension Arduino de régénérer sa configuration
 * IntelliSense pour la carte que Kablix vient d'écrire dans `arduino.yaml`.
 * Sans ça, cpptools analyse le sketch comme du C++ nu — `Serial`, `pinMode`,
 * `digitalWrite` sont alors autant de soulignements rouges.
 *
 * `silencieux` : referme la fenêtre de sortie que l'extension d'en face ouvre
 * en analysant. Vrai pour le travail automatique (on n'a rien demandé, on ne
 * veut rien voir), faux quand l'utilisateur a lancé la commande lui-même.
 */
async function miseAuPointArduino(silencieux = false): Promise<boolean> {
  if (!vscode.extensions.getExtension(ARDUINO_IDE_EXTENSION_ID)) return false;
  const commandes = await vscode.commands.getCommands(true);
  if (!commandes.includes(ARDUINO_REBUILD)) return false;
  // La fabrication de c_cpp_properties.json compile le sketch « pour de faux »
  // et lit les commandes du compilateur : elle a donc besoin de la clé `sketch`
  // dans arduino.yaml (arduinoIde.ts vient de l'écrire) — sans elle l'analyse
  // abandonne EN SILENCE, et le .ino reste tout rouge.
  await vscode.commands.executeCommand(ARDUINO_REBUILD);
  // La commande n'a la main qu'à la FIN de l'analyse : c'est le bon moment pour
  // refermer, et pour compter les échéances de la re-analyse automatique.
  if (silencieux) masquerSortieArduino();
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

  // Les deux réglages que MicroPico pose lui-même quand il crée un projet : sans
  // eux Pylance peut rester sur un autre serveur d'analyse (donc ne rien savoir
  // des déclarations qu'on vient de lui montrer) ou analyser en mode strict.
  // Quand un type n'est pas résolu, la complétion meurt en chaîne : `I2C`
  // inconnu → `i2c` de type inconnu → `i2c.writeto_mem` jamais proposé.
  ecrit = (await poserSiAbsent(cfg, 'python.languageServer', 'Pylance', cible)) || ecrit;
  ecrit = (await poserSiAbsent(cfg, 'python.analysis.typeCheckingMode', 'basic', cible)) || ecrit;

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
    // Travail automatique : silencieux SAUF si l'utilisateur a demandé à voir la
    // fenêtre de sortie (réglage kablix.showArduinoOutput).
    return arduinoIdeTarget(board)
      ? await miseAuPointArduino(!sortieVisible())
      : await miseAuPointMicroPython(folder);
  } catch {
    return false; // confort pur : jamais d'erreur remontée à l'utilisateur
  }
}

/**
 * Remet l'analyse de code au point À LA DEMANDE (commande de la palette), et
 * rend compte en clair de ce qui s'est passé : le travail automatique est
 * silencieux par choix, donc quand il ne suffit pas il faut bien un endroit où
 * l'utilisateur lit POURQUOI. Le souvenir « déjà fait » est oublié d'abord :
 * une demande explicite refait tout.
 */
export async function remettreAuPoint(board: Board, hint?: vscode.Uri): Promise<string> {
  resetIntelliSenseCache();
  const folder = dossier(hint);
  if (!folder) return vscode.l10n.t('No folder is open, so there is nothing to set up.');

  if (arduinoIdeTarget(board)) {
    if (!vscode.extensions.getExtension(ARDUINO_IDE_EXTENSION_ID)) {
      return vscode.l10n.t('Install the "Arduino VS Code IDE" extension: it is the one that writes the IntelliSense configuration of a sketch.');
    }
    const yaml = await lireTexte(vscode.Uri.joinPath(folder.uri, '.vscode', 'arduino.yaml'));
    if (!/^sketch:\s*\S/m.test(yaml ?? '')) {
      return vscode.l10n.t('Open the .ino sketch of this project first: without it the Arduino extension cannot build the IntelliSense configuration.');
    }
    // Demande explicite : la fenêtre de sortie reste ouverte, c'est là qu'on lit
    // ce que fait l'extension d'en face (et pourquoi elle échoue, le cas échéant).
    const fait = await miseAuPointArduino(false);
    return fait
      ? vscode.l10n.t('IntelliSense configuration requested for the Arduino board. It appears in .vscode/c_cpp_properties.json after a few seconds.')
      : vscode.l10n.t('The Arduino extension did not answer: reload the window and try again.');
  }

  if (!vscode.extensions.getExtension(MICROPICO_EXTENSION_ID)) {
    return vscode.l10n.t('Install the "MicroPico" extension: it ships the MicroPython declarations that Pylance needs.');
  }
  const ecrit = await miseAuPointMicroPython(folder);
  return ecrit
    ? vscode.l10n.t('MicroPython declarations shown to Pylance in the folder settings.')
    : vscode.l10n.t('Everything is already in place for MicroPython. If a symbol is still unknown, reload the window.');
}

/** Lit un fichier texte du disque, `undefined` s'il n'existe pas. */
async function lireTexte(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/** Oublie ce qui a été fait (tests, et rechargement de fenêtre côté hôte). */
export function resetIntelliSenseCache(): void {
  dejaFait.clear();
}
