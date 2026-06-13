import * as vscode from 'vscode';
import JSZip from 'jszip';

/**
 * Format de projet Kablix « .projix » : une archive ZIP autonome contenant le
 * schéma (dessin + fils), le manifeste et, optionnellement, tous les fichiers
 * de code nécessaires à l'exécution. Ce module reste indépendant de la webview.
 */

/** Manifeste écrit dans `kablix.json` à la racine de l'archive. */
export interface ProjixManifest {
  format: 'projix';
  version: number;
  app: string;
  board: 'uno' | 'pico';
  createdAt: string;
}

/** Données extraites d'une archive ouverte. */
export interface UnpackedProject {
  manifest: ProjixManifest;
  diagram: unknown;
  codeFiles: Array<{ path: string; data: Uint8Array }>;
}

/** Version courante du format (incrémenter en cas de changement incompatible). */
export const PROJIX_FORMAT_VERSION = 1;

/** Dossiers et fichiers exclus de la copie du code (générés ou non pertinents). */
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'out']);

/** Taille (octets) au-delà de laquelle on avertit l'utilisateur. */
export const PROJIX_SIZE_WARN = 20 * 1024 * 1024;

/** Construit l'archive .projix. Le code (codeRoot) est optionnel. */
export async function packProject(opts: {
  manifest: ProjixManifest;
  diagramJson: string;
  codeRoot?: vscode.Uri;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('kablix.json', JSON.stringify(opts.manifest, null, 2));
  zip.file('diagram.json', opts.diagramJson);

  if (opts.codeRoot) {
    const codeFolder = zip.folder('code');
    if (codeFolder) {
      await addFolderRecursive(codeFolder, opts.codeRoot, '');
    }
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/** Ouvre une archive .projix et en extrait le manifeste, le schéma et le code. */
export async function unpackProject(bytes: Uint8Array): Promise<UnpackedProject> {
  const zip = await JSZip.loadAsync(bytes);

  const manifestEntry = zip.file('kablix.json');
  if (!manifestEntry) {
    throw new Error('kablix.json manquant : archive .projix invalide.');
  }
  const manifest = JSON.parse(await manifestEntry.async('string')) as ProjixManifest;
  if (manifest.format !== 'projix') {
    throw new Error('Format de fichier inattendu (format ≠ "projix").');
  }

  const diagramEntry = zip.file('diagram.json');
  if (!diagramEntry) {
    throw new Error('diagram.json manquant : archive .projix invalide.');
  }
  const diagram = JSON.parse(await diagramEntry.async('string')) as unknown;

  const codeFiles: Array<{ path: string; data: Uint8Array }> = [];
  const entries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relPath, file) => {
    if (file.dir) return;
    if (relPath.startsWith('code/')) {
      entries.push({ path: relPath.slice('code/'.length), file });
    }
  });
  for (const entry of entries) {
    codeFiles.push({ path: entry.path, data: await entry.file.async('uint8array') });
  }

  return { manifest, diagram, codeFiles };
}

/**
 * Ajoute récursivement le contenu d'un dossier à l'archive, en appliquant les
 * exclusions (dossiers générés, fichiers *.projix). Lecture via workspace.fs.
 */
async function addFolderRecursive(
  zipFolder: JSZip,
  dirUri: vscode.Uri,
  relPrefix: string
): Promise<void> {
  let entries: Array<[string, vscode.FileType]>;
  try {
    entries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch {
    return; // dossier illisible : ignoré
  }

  for (const [name, type] of entries) {
    if (type === vscode.FileType.Directory) {
      if (EXCLUDED_DIRS.has(name)) continue;
      const childFolder = zipFolder.folder(name);
      if (childFolder) {
        await addFolderRecursive(
          childFolder,
          vscode.Uri.joinPath(dirUri, name),
          relPrefix + name + '/'
        );
      }
    } else if (type === vscode.FileType.File) {
      if (name.toLowerCase().endsWith('.projix')) continue;
      try {
        const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dirUri, name));
        zipFolder.file(name, data);
      } catch {
        // fichier illisible (verrou, permission) : ignoré
      }
    }
  }
}
