import * as vscode from 'vscode';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import JSZip from 'jszip';

type PartKind = string; // Réutilise la même enum que catalog.mts

/** Métadonnées d'un composant .kompix sauvegardées en index JSON. */
interface KompixIndexEntry {
  type: string;
  origin: 'local' | 'remote';
  sourceUrl?: string;
  behaviorHash?: string; // SHA256 du fichier behavior.mjs, si présent et accepté
  acceptedAt?: string; // ISO 8601
  version: string;
}

/** Contenu du manifest.json d'un .kompix. */
interface KompixManifest {
  kompixVersion: number;
  type: string;
  label: string;
  description: string;
  version: string;
  author: string;
  reference?: string;
  kind: PartKind;
  category?: string;
  board?: string;
  pins: Array<{ name: string; x: number; y: number }>;
  pinRoles?: Record<string, string>;
  attrs?: Record<string, string>;
  params?: Array<{ name: string; label: string; value: number }>;
  control?: { type: string; label?: string; unit?: string; min?: number; max?: number; step?: number; expr?: string } | null;
  innerOffset?: { x: number; y: number } | null;
  extAnchor?: { x: number; y: number } | null;
  intAnchor?: { x: number; y: number } | null;
  behavior?: string | null; // Nom du fichier .mjs, ex. "behavior.mjs"
}

/** Contenu du CustomPartData, cible de la webview. */
interface CustomPartData {
  type: string;
  label: string;
  kind: PartKind;
  svg: string;
  pins: Array<{ name: string; x: number; y: number }>;
  pinRoles?: Record<string, string>;
  attrs?: Record<string, string>;
  innerSvg?: string;
  innerOffset?: { x: number; y: number };
  extAnchor?: { x: number; y: number };
  intAnchor?: { x: number; y: number };
  params?: Array<{ name: string; label: string; value: number }>;
  control?: any;
  category?: string;
  /** Script behavior.mjs embarqué (optionnel) : comportement de simulation. */
  behaviorScript?: string;
  /** Métadonnées de confiance du comportement embarqué. */
  kompixMeta?: {
    origin: 'local' | 'remote';
    sourceUrl?: string;
    behaviorHash?: string;
    behaviorAccepted?: boolean; // true si accepté par l'user
  };
}

/**
 * Bibliothèque de composants .kompix : gère un dossier partagé, scanne les fichiers,
 * valide les manifestes, expose les composants à la webview, gère les FileSystemWatchers
 * et maintient un index de confiance pour les comportements embarqués.
 */
export class KompixLibrary {
  private libraryFolder: string;
  private indexPath: string;
  private index: Map<string, KompixIndexEntry> = new Map();
  private watcher: vscode.FileSystemWatcher | undefined;
  private workspaceWatcher: vscode.FileSystemWatcher | undefined;
  private components: Map<string, CustomPartData> = new Map();
  private onComponentsChanged: ((parts: CustomPartData[]) => void) | undefined;

  constructor(private context: vscode.ExtensionContext) {
    this.libraryFolder = this.resolveLibraryFolder();
    this.indexPath = join(this.libraryFolder, '.kompix-index.json');
    this.loadIndex();
  }

  /**
   * Résout le dossier de bibliothèque : configuration, ou défaut dans globalStorageUri.
   */
  private resolveLibraryFolder(): string {
    const config = vscode.workspace.getConfiguration('kablix');
    const folder = config.get<string>('componentsFolder', '');
    if (folder && folder.trim()) {
      return vscode.Uri.file(folder).fsPath;
    }
    return join(this.context.globalStorageUri.fsPath, 'kablix_components');
  }

  /**
   * Charge l'index de confiance depuis le fichier JSON, ou crée un vide.
   */
  private loadIndex(): void {
    try {
      if (statSync(this.indexPath).isFile()) {
        const data = readFileSync(this.indexPath, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            this.index.set(entry.type, entry);
          }
        }
      }
    } catch {
      // Fichier absent ou corrompu → index vide
    }
  }

  /**
   * Persiste l'index en JSON.
   */
  private saveIndex(): void {
    try {
      mkdirSync(this.libraryFolder, { recursive: true });
      const data = Array.from(this.index.values());
      writeFileSync(this.indexPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Erreur sauvegarde index kompix:', err);
    }
  }

  /**
   * Lance le scan initial et les watchers.
   */
  async start(): Promise<void> {
    mkdirSync(this.libraryFolder, { recursive: true });
    await this.scanLibrary();
    this.startWatchers();
  }

  /**
   * Scanne le dossier de bibliothèque, lit tous les .kompix, en extrait les métadonnées.
   */
  private async scanLibrary(): Promise<void> {
    this.components.clear();
    try {
      const files = readdirSync(this.libraryFolder);
      for (const file of files) {
        if (extname(file).toLowerCase() === '.kompix') {
          const path = join(this.libraryFolder, file);
          const data = await this.unpackKompix(path);
          if (data) {
            this.components.set(data.type, data);
          }
        }
      }
    } catch (err) {
      console.error('Erreur scan bibliothèque kompix:', err);
    }
    this.notifyWebview();
  }

  /**
   * Déplie un .kompix (ZIP), valide le manifest, extrait le SVG externe + interne.
   */
  private async unpackKompix(path: string): Promise<CustomPartData | null> {
    try {
      const data = readFileSync(path);
      const zip = new JSZip();
      await zip.loadAsync(new Uint8Array(data.buffer, data.byteOffset, data.length));

      // Lire manifest.json
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) throw new Error('manifest.json absent');
      const manifestText = await manifestFile.async('string');
      const manifest: KompixManifest = JSON.parse(manifestText);

      // Valider
      if (!manifest.type || !manifest.label || !Array.isArray(manifest.pins)) {
        throw new Error('Manifest invalide : type, label, pins requis');
      }

      // Lire schema.svg
      const schemaFile = zip.file('schema.svg');
      if (!schemaFile) throw new Error('schema.svg absent');
      const svg = await schemaFile.async('string');

      // Extraire SVG externe et interne depuis le même fichier
      const externalSvg = this.extractSvgGroup(svg, manifest.type);
      const internalSvg = this.extractSvgGroup(svg, `${manifest.type}-interne`);

      // Lire le comportement embarqué s'il existe
      let behaviorScript: string | undefined;
      if (manifest.behavior) {
        const behaviorFile = zip.file(manifest.behavior);
        if (behaviorFile) {
          behaviorScript = await behaviorFile.async('string');
        }
      }

      // Récupérer les métadonnées de confiance
      const indexEntry = this.index.get(manifest.type);

      // Construire CustomPartData
      const result: CustomPartData = {
        type: manifest.type,
        label: manifest.label,
        kind: manifest.kind,
        svg: externalSvg,
        pins: manifest.pins,
        pinRoles: manifest.pinRoles,
        attrs: manifest.attrs,
        innerSvg: internalSvg || undefined,
        innerOffset: manifest.innerOffset || undefined,
        extAnchor: manifest.extAnchor || undefined,
        intAnchor: manifest.intAnchor || undefined,
        params: manifest.params,
        control: manifest.control,
        category: manifest.category,
        behaviorScript: behaviorScript,
        kompixMeta: indexEntry ? {
          origin: indexEntry.origin,
          sourceUrl: indexEntry.sourceUrl,
          behaviorHash: indexEntry.behaviorHash,
          behaviorAccepted: !!indexEntry.acceptedAt,
        } : { origin: 'local' },
      };

      return result;
    } catch (err) {
      console.error(`Erreur déplissage ${path}:`, err);
      return null;
    }
  }

  /**
   * Extrait un groupe SVG du document par son id.
   * Convention : id="<type>" pour externe, id="<type>-interne" pour interne.
   */
  private extractSvgGroup(svg: string, groupId: string): string {
    try {
      // Regex naive pour trouver <g id="..."> ... </g>
      const pattern = new RegExp(`<g[^>]*id="?${groupId}"?[^>]*>([\\s\\S]*?)</g>`, 'i');
      const match = svg.match(pattern);
      if (match && match[1]) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${match[1]}</svg>`;
      }
    } catch {
      // Fallback
    }
    return '';
  }

  /**
   * Démarre les FileSystemWatchers : bibliothèque locale + workspace.
   */
  private startWatchers(): void {
    // Watcher sur la bibliothèque locale
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.libraryFolder, '*.kompix'),
      false,
      false,
      false
    );
    this.watcher.onDidCreate(() => this.scanLibrary());
    this.watcher.onDidChange(() => this.scanLibrary());
    this.watcher.onDidDelete(() => this.scanLibrary());

    // Watcher sur le workspace pour détecter les .kompix à copier
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      this.workspaceWatcher = vscode.workspace.createFileSystemWatcher('**/*.kompix', false, false, false);
      this.workspaceWatcher.onDidCreate((uri) => this.handleWorkspaceKompix(uri));
    }
  }

  /**
   * Copie un .kompix trouvé dans le workspace vers la bibliothèque.
   */
  private async handleWorkspaceKompix(uri: vscode.Uri): Promise<void> {
    const wsPath = uri.fsPath;
    // Vérifie que ce fichier n'est pas DÉJÀ dans la bibliothèque
    if (wsPath.startsWith(this.libraryFolder)) return;

    try {
      const data = readFileSync(wsPath);
      const zip = new JSZip();
      await zip.loadAsync(new Uint8Array(data.buffer, data.byteOffset, data.length));
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) return;
      const manifestText = await manifestFile.async('string');
      const manifest: KompixManifest = JSON.parse(manifestText);

      // Copie dans la bibliothèque, dédoublonné par type+version
      const targetPath = join(this.libraryFolder, `${manifest.type}.kompix`);
      mkdirSync(this.libraryFolder, { recursive: true });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      writeFileSync(targetPath, data as any);

      // Rescanne
      await this.scanLibrary();
    } catch (err) {
      console.error('Erreur copie workspace kompix:', err);
    }
  }

  /**
   * Envoie les composants actuels à la webview.
   */
  private notifyWebview(): void {
    if (this.onComponentsChanged) {
      const parts = Array.from(this.components.values());
      this.onComponentsChanged(parts);
    }
  }

  /**
   * Retourne le chemin du dossier de bibliothèque.
   */
  getLibraryPath(): string {
    return this.libraryFolder;
  }

  /**
   * Retourne la liste des composants actuellement chargés.
   */
  getComponents(): CustomPartData[] {
    return Array.from(this.components.values());
  }

  /**
   * Enregistre un callback appelé quand la liste change (scan, ajout, suppression).
   */
  onDidChangeComponents(callback: (parts: CustomPartData[]) => void): vscode.Disposable {
    this.onComponentsChanged = callback;
    // Notifier immédiatement
    callback(this.getComponents());
    return new vscode.Disposable(() => {
      this.onComponentsChanged = undefined;
    });
  }

  /**
   * Marque un comportement distant comme accepté (mémorisation de la confirmation).
   */
  acceptBehaviorHash(componentType: string, behaviorHash: string): void {
    const entry = this.index.get(componentType);
    if (entry && entry.behaviorHash === behaviorHash) {
      entry.acceptedAt = new Date().toISOString();
      this.saveIndex();
    }
  }

  /**
   * Enregistre un composant créé localement (.kompix) dans la bibliothèque et l'index.
   * Appelé par le créateur de composants ou montre.mjs.
   */
  async saveKompix(path: string, origin: 'local' | 'remote' = 'local', sourceUrl?: string): Promise<void> {
    try {
      const data = readFileSync(path);
      const zip = new JSZip();
      await zip.loadAsync(new Uint8Array(data.buffer, data.byteOffset, data.length));
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) return;
      const manifestText = await manifestFile.async('string');
      const manifest: KompixManifest = JSON.parse(manifestText);

      // Copie dans la bibliothèque
      const targetPath = join(this.libraryFolder, `${manifest.type}.kompix`);
      mkdirSync(this.libraryFolder, { recursive: true });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      writeFileSync(targetPath, data as any);

      // Met à jour l'index
      const behaviorHash = await this.computeBehaviorHash(zip);
      this.index.set(manifest.type, {
        type: manifest.type,
        origin,
        sourceUrl,
        behaviorHash,
        acceptedAt: new Date().toISOString(),
        version: manifest.version,
      });
      this.saveIndex();

      // Rescanne
      await this.scanLibrary();
    } catch (err) {
      console.error('Erreur saveKompix:', err);
    }
  }

  /**
   * Calcule le hash SHA256 du fichier behavior.mjs si présent.
   */
  private async computeBehaviorHash(zip: JSZip): Promise<string | undefined> {
    try {
      const behaviorFile = zip.file('behavior.mjs');
      if (!behaviorFile) return undefined;
      const content = await behaviorFile.async('uint8array');
      // Node crypto disponible côté extension
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-var-requires
      const crypto = require('crypto') as typeof import('crypto');
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
      return crypto.createHash('sha256').update(buf as any).digest('hex');
    } catch {
      return undefined;
    }
  }

  /**
   * Retourne l'entry d'index pour un composant (origin + hash).
   */
  getIndexEntry(type: string): KompixIndexEntry | undefined {
    return this.index.get(type);
  }

  /**
   * Supprime un composant de la bibliothèque.
   */
  async removeKompix(type: string): Promise<void> {
    try {
      const targetPath = join(this.libraryFolder, `${type}.kompix`);
      const { unlinkSync } = await import('node:fs');
      unlinkSync(targetPath);
      this.index.delete(type);
      this.saveIndex();
      await this.scanLibrary();
    } catch (err) {
      console.error('Erreur suppression kompix:', err);
    }
  }

  /**
   * Dispose les watchers.
   */
  dispose(): void {
    this.watcher?.dispose();
    this.workspaceWatcher?.dispose();
  }
}
