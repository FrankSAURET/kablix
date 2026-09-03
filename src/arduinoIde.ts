// Passerelle vers l'extension « Arduino VS Code IDE » (electropol-fr) : la carte
// choisie dans Kablix devient la carte du projet Arduino, pour que le sketch
// `.ino` soit reconnu (langage, IntelliSense, compilation, téléversement) sans
// avoir à la re-choisir de l'autre côté.
//
// Cette extension n'expose aucune API : son réglage de projet EST le fichier
// `.vscode/arduino.yaml`, qu'elle surveille (FileSystemWatcher) et relit à
// chaque écriture. Écrire la clé `board` suffit donc à changer sa carte, même
// si elle n'est pas encore activée — elle lit le fichier à son démarrage
// (activation sur `workspaceContains:**/*.ino`).
import * as vscode from 'vscode';
import type { Board } from './compiler';

/** Identifiant Marketplace de l'extension Arduino de Frank. */
export const ARDUINO_IDE_EXTENSION_ID = 'electropol-fr.arduino-vscode-ide';

/** Réglage utilisateur : synchro active par défaut. */
const SYNC_SETTING = 'kablix.syncArduinoIdeBoard';

/** Fichier de projet de l'extension Arduino, sous le dossier de travail. */
const CONFIG_DIR = '.vscode';
const CONFIG_FILE = 'arduino.yaml';

/**
 * Cible arduino-cli d'une carte Kablix : `board` (FQBN) et `configuration`
 * (options du menu de la carte, format `id=option`). `undefined` pour les
 * cartes qui ne sont pas des Arduino — un Pico n'a rien à faire dans un projet
 * Arduino, et sa carte courante ne doit pas être écrasée quand on passe au
 * MicroPython.
 */
export function arduinoIdeTarget(board: Board): { board: string; configuration: string } | undefined {
  switch (board) {
    case 'uno':
      return { board: 'arduino:avr:uno', configuration: '' }; // pas de menu cpu
    case 'nano':
      return { board: 'arduino:avr:nano', configuration: 'cpu=atmega328' };
    case 'mega':
      return { board: 'arduino:avr:mega', configuration: 'cpu=atmega2560' };
    default:
      return undefined; // pico, picow, pico2, pico2w : MicroPython
  }
}

/** Une clé de premier niveau d'un YAML plat (pas de ligne indentée, pas de liste). */
const ROOT_KEY = /^([A-Za-z_][\w-]*)\s*:/;

/**
 * Réécrit les clés `board` et `configuration` d'un `arduino.yaml` en laissant
 * TOUT le reste intact (sketch, port, output, buildPreferences…) : le fichier
 * appartient à l'autre extension, Kablix n'y touche que ces deux lignes — et
 * les lignes indentées d'une clé remplacée partent avec elle (une valeur peut
 * s'écrire sur plusieurs lignes). Une `configuration` vide retire la clé :
 * l'extension d'en face reprend alors les options par défaut de la carte.
 *
 * Retourne `undefined` quand le fichier dit déjà la bonne chose — on n'écrit
 * pas pour écrire, chaque écriture réveillant le watcher d'en face.
 */
export function patchArduinoYaml(
  text: string,
  target: { board: string; configuration: string; sketch?: string }
): string | undefined {
  const wanted = new Map<string, string>([['board', target.board]]);
  if (target.configuration) wanted.set('configuration', target.configuration);
  // `sketch` n'est écrit que si Kablix sait de quel .ino il parle : sans cette
  // clé, l'extension d'en face REFUSE en silence de fabriquer la configuration
  // IntelliSense (son analyse tourne « non interactive » et abandonne dès que le
  // sketch manque) — c'était la cause du soulignement rouge dans les .ino.
  if (target.sketch) wanted.set('sketch', target.sketch);
  const gerees = new Set(['board', 'configuration', ...(target.sketch ? ['sketch'] : [])]);

  const lines = text.split(/\r?\n/);
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const out: string[] = [];
  const seen = new Set<string>();
  let changed = false;
  let skipIndented = false; // suite indentée d'une clé remplacée

  for (const line of lines) {
    if (skipIndented && /^\s+\S/.test(line)) {
      changed = true;
      continue;
    }
    skipIndented = false;
    const key = ROOT_KEY.exec(line)?.[1];
    if (key !== undefined && gerees.has(key)) {
      const value = wanted.get(key);
      if (value === undefined) {
        changed = true; // clé à retirer (configuration par défaut)
      } else {
        const replacement = `${key}: ${value}`;
        if (line !== replacement) changed = true;
        out.push(replacement);
        seen.add(key);
      }
      skipIndented = true;
      continue;
    }
    out.push(line);
  }

  // Clés absentes : ajoutées à la fin, après la dernière ligne non vide.
  const missing = [...wanted].filter(([k]) => !seen.has(k));
  if (missing.length > 0) {
    changed = true;
    while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
    for (const [k, v] of missing) out.push(`${k}: ${v}`);
  }

  if (!changed) return undefined;
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  return out.join(eol) + eol;
}

/** Lit un fichier texte, `undefined` s'il n'existe pas (ou n'est pas lisible). */
async function readTextIfExists(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/**
 * Dossier de travail où poser le réglage. Le fichier de code (ou le .projix)
 * désigne son dossier de workspace ; sinon celui qui porte DÉJÀ un
 * `arduino.yaml` ; sinon le premier ouvert — le même ordre que l'extension
 * d'en face, pour ne pas écrire dans un dossier qu'elle ne lira pas.
 */
async function arduinoFolder(hint?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  if (hint) {
    const owner = vscode.workspace.getWorkspaceFolder(hint);
    if (owner) return owner.uri;
  }
  for (const folder of folders) {
    const config = vscode.Uri.joinPath(folder.uri, CONFIG_DIR, CONFIG_FILE);
    if ((await readTextIfExists(config)) !== undefined) return folder.uri;
  }
  return folders[0].uri;
}

/**
 * Chemin du sketch RELATIF au dossier de travail, en séparateurs `/` — la forme
 * qu'attend l'extension d'en face (`path.join(rootPath, dc.sketch)`).
 * `undefined` si le fichier n'est pas un `.ino`, ou s'il vit hors du dossier.
 */
export function sketchRelatif(folder: string, file: string): string | undefined {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = norm(folder);
  const cible = norm(file);
  if (!cible.toLowerCase().endsWith('.ino')) return undefined;
  if (!cible.toLowerCase().startsWith(base.toLowerCase() + '/')) return undefined;
  return cible.slice(base.length + 1);
}

/** Vrai si ce dossier de travail contient au moins un sketch `.ino`. */
async function hasSketch(folder: vscode.Uri): Promise<boolean> {
  try {
    const found = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, '**/*.ino'),
      '**/node_modules/**',
      1
    );
    return found.length > 0;
  } catch {
    return false;
  }
}

/**
 * Reporte la carte courante de Kablix dans le projet Arduino.
 *
 * Ne fait rien si : le réglage est coupé, l'extension Arduino n'est pas
 * installée, la carte n'est pas un Arduino (Pico), aucun dossier n'est ouvert,
 * ou il n'y a NI `arduino.yaml` NI sketch `.ino` dans le dossier — inutile de
 * semer un fichier de réglage dans un projet qui n'a rien d'Arduino.
 *
 * Confort pur : toute erreur est avalée, jamais remontée à l'utilisateur.
 */
export async function syncArduinoIdeBoard(board: Board, hint?: vscode.Uri): Promise<boolean> {
  try {
    if (!vscode.workspace.getConfiguration().get<boolean>(SYNC_SETTING, true)) return false;
    if (!vscode.extensions.getExtension(ARDUINO_IDE_EXTENSION_ID)) return false;
    const target = arduinoIdeTarget(board);
    if (!target) return false;

    const folder = await arduinoFolder(hint);
    if (!folder) return false;
    const config = vscode.Uri.joinPath(folder, CONFIG_DIR, CONFIG_FILE);

    const current = await readTextIfExists(config);
    const isSketch = hint?.fsPath.toLowerCase().endsWith('.ino') === true;
    if (current === undefined && !isSketch && !(await hasSketch(folder))) return false;

    // Le sketch ouvert dans Kablix devient le sketch du projet Arduino : c'est
    // lui qui débloque la fabrication de c_cpp_properties.json en face.
    const sketch = hint ? sketchRelatif(folder.fsPath, hint.fsPath) : undefined;
    const patched = patchArduinoYaml(current ?? '', sketch ? { ...target, sketch } : target);
    if (patched === undefined) return false; // déjà la bonne carte
    await vscode.workspace.fs.writeFile(config, new TextEncoder().encode(patched));
    return true;
  } catch {
    return false;
  }
}
