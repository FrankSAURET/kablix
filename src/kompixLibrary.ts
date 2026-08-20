import * as vscode from 'vscode';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import JSZip from 'jszip';

type PartKind = string; // Réutilise la même enum que catalog.mts

/** Échappe une chaîne pour l'insérer littéralement dans une expression régulière. */
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** viewBox d'un document SVG, déduite de width/height si elle manque. */
function viewBoxOf(svg: string): string {
  const vb = /<svg\b[^>]*\bviewBox=["']([^"']+)["']/i.exec(svg);
  if (vb) return vb[1].trim();
  const w = /<svg\b[^>]*\bwidth=["']([\d.]+)/i.exec(svg);
  const h = /<svg\b[^>]*\bheight=["']([\d.]+)/i.exec(svg);
  return w && h ? `0 0 ${w[1]} ${h[1]}` : '0 0 100 100';
}

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

/** Fiche d'un composant réellement installé, telle que la voit le gestionnaire. */
export interface InstalledComponent {
  type: string;
  label: string;
  description?: string;
  version: string;
  author?: string;
  reference?: string;
  origin: 'local' | 'remote';
  sourceUrl?: string;
  /** Vignette data: URI construite depuis le dessin externe. */
  thumbnail?: string;
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
  /** Métadonnées du manifeste (description, auteur, référence) que CustomPartData ne porte pas. */
  private manifestMeta: Map<string, { description?: string; version?: string; author?: string; reference?: string }> = new Map();
  private onComponentsChanged: ((parts: CustomPartData[]) => void) | undefined;
  /** Promesse du premier scan (voir start / whenReady). */
  private started: Promise<void> | undefined;

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
   * Lance le scan initial et les watchers. Idempotent : rappeler start() rend la
   * même promesse, sans relancer un scan.
   */
  start(): Promise<void> {
    this.started ??= (async () => {
      mkdirSync(this.libraryFolder, { recursive: true });
      await this.scanLibrary();
      this.startWatchers();
    })();
    return this.started;
  }

  /**
   * Attend la fin du premier scan. Il tourne en tâche de fond au démarrage (pour
   * ne pas retarder l'activation) : un atelier ouvert dans la foulée demandait
   * ses composants AVANT que le dossier ait été lu, et recevait une liste vide —
   * la palette restait alors sans les composants pourtant installés.
   */
  whenReady(): Promise<void> {
    return this.started ?? Promise.resolve();
  }

  /**
   * Scanne le dossier de bibliothèque, lit tous les .kompix, en extrait les métadonnées.
   */
  private async scanLibrary(): Promise<void> {
    this.components.clear();
    this.manifestMeta.clear();
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

      // Description, auteur et référence ne voyagent pas dans CustomPartData :
      // le gestionnaire de composants en a besoin pour ses fiches, on les garde
      // de côté le temps du scan.
      this.manifestMeta.set(manifest.type, {
        description: manifest.description,
        version: manifest.version,
        author: manifest.author,
        reference: manifest.reference,
      });

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
   *
   * Le SVG rendu garde la viewBox du document source : c'est elle qui donne
   * l'échelle du composant sur la feuille. Une viewBox forfaitaire déformait
   * tout composant qui ne faisait pas 100 × 100.
   *
   * `width` et `height` sont OBLIGATOIRES : un SVG qui n'a que sa viewBox
   * s'étale à la taille de son parent, et le parent est ici un `inline-block`
   * en `line-height: 0` — le dessin sortait donc en 0 × 0, c'est-à-dire
   * invisible, palette comprise (Frank, v2026.8.89).
   */
  private extractSvgGroup(svg: string, groupId: string): string {
    const content = this.groupContent(svg, groupId);
    if (content === null) return '';
    const viewBox = viewBoxOf(svg);
    const [, , w = '100', h = '100'] = viewBox.split(/\s+/);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${content}</svg>`;
  }

  /**
   * Contenu du groupe `groupId`, ou null s'il est absent.
   *
   * Compte les `<g>` ouverts pour trouver le `</g>` qui ferme VRAIMENT le
   * groupe : Inkscape imbrique les groupes, et s'arrêter au premier `</g>`
   * coupait le dessin en deux et rendait un XML non fermé.
   */
  private groupContent(svg: string, groupId: string): string | null {
    // L'id doit correspondre en ENTIER, guillemet fermant compris : sans lui,
    // demander « diode » ramenait le groupe « diode-interne ».
    const id = escapeRe(groupId);
    const opener = new RegExp(`<g\\b[^>]*\\bid=(?:"${id}"|'${id}')[^>]*?(/?)>`, 'i');
    const open = opener.exec(svg);
    if (!open) return null;
    if (open[1] === '/') return ''; // <g id="x"/> : groupe vide, pas d'erreur

    const start = open.index + open[0].length;
    const tags = /<g\b[^>]*?(\/?)>|<\/g\s*>/gi;
    tags.lastIndex = start;
    let depth = 1;
    let tag: RegExpExecArray | null;
    while ((tag = tags.exec(svg)) !== null) {
      if (tag[0].startsWith('</')) {
        if (--depth === 0) return svg.slice(start, tag.index);
      } else if (tag[1] !== '/') {
        depth++;
      }
    }
    return null; // </g> manquant : le SVG est cassé, mieux vaut ne rien rendre
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
        // Un composant venu d'ailleurs n'est PAS approuvé du seul fait d'avoir
        // été installé : c'est acceptBehaviorHash() qui le marquera, après le
        // « Faire confiance » de l'utilisateur. Le sien, en revanche, l'est.
        acceptedAt: origin === 'local' ? new Date().toISOString() : undefined,
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
   * Enregistre un .kompix depuis un buffer (ex. téléchargé via HTTP).
   * Similaire à saveKompix mais accepte les données en mémoire.
   */
  async saveKompixFromBuffer(
    data: Uint8Array,
    origin: 'local' | 'remote' = 'local',
    sourceUrl?: string
  ): Promise<void> {
    try {
      const zip = new JSZip();
      await zip.loadAsync(data);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) return;
      const manifestText = await manifestFile.async('string');
      const manifest: KompixManifest = JSON.parse(manifestText);

      // Copie dans la bibliothèque
      const targetPath = join(this.libraryFolder, `${manifest.type}.kompix`);
      mkdirSync(this.libraryFolder, { recursive: true });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      writeFileSync(targetPath, Buffer.from(data) as any);

      // Met à jour l'index
      const behaviorHash = await this.computeBehaviorHash(zip);
      this.index.set(manifest.type, {
        type: manifest.type,
        origin,
        sourceUrl,
        behaviorHash,
        // Voir saveKompix() : l'installation n'approuve pas un code distant.
        acceptedAt: origin === 'local' ? new Date().toISOString() : undefined,
        version: manifest.version,
      });
      this.saveIndex();

      // Rescanne
      await this.scanLibrary();
    } catch (err) {
      console.error('Erreur saveKompixFromBuffer:', err);
      throw err;
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
      return createHash('sha256').update(content).digest('hex');
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
   * Liste les composants réellement installés, avec ce qu'il faut pour les
   * afficher : métadonnées du manifeste, origine (créé ici ou téléchargé) et
   * vignette tirée du dessin externe.
   */
  listInstalled(): InstalledComponent[] {
    return Array.from(this.components.values()).map((part) => {
      const meta = this.manifestMeta.get(part.type) ?? {};
      const entry = this.index.get(part.type);
      return {
        type: part.type,
        label: part.label,
        description: meta.description || undefined,
        version: meta.version || entry?.version || '?',
        author: meta.author || undefined,
        reference: meta.reference || undefined,
        origin: entry?.origin ?? 'local',
        sourceUrl: entry?.sourceUrl,
        thumbnail: part.svg
          ? `data:image/svg+xml;base64,${Buffer.from(part.svg, 'utf8').toString('base64')}`
          : undefined,
      };
    });
  }

  /**
   * Supprime un composant de la bibliothèque : le fichier .kompix ET son entrée
   * d'index. Un fichier déjà absent n'est pas une erreur — l'index est purgé
   * quand même, sinon le composant resterait « installé » sans exister.
   * Retourne false seulement si la suppression a vraiment échoué (droits, verrou).
   */
  async removeKompix(type: string): Promise<boolean> {
    const targetPath = join(this.libraryFolder, `${type}.kompix`);
    let ok = true;
    try {
      unlinkSync(targetPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error('Erreur suppression kompix:', err);
        ok = false;
      }
    }
    if (ok) {
      this.index.delete(type);
      this.saveIndex();
      await this.scanLibrary();
    }
    return ok;
  }

  /**
   * Fusionne les SVG externes et internes en un seul SVG avec deux groupes.
   * Retourne le contenu XML d'un SVG avec :
   * - <g id="type"> contenant le SVG externe
   * - <g id="type-interne"> contenant le SVG interne (s'il existe)
   */
  private mergeSvgsForKompix(type: string, extSvg: string, intSvg?: string): string {
    const extractContent = (svg: string): string => {
      const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      return match?.[1] || '';
    };

    // La viewBox part telle quelle : recomposer « 0 0 w h » depuis ses deux
    // dernières valeurs décalait tout dessin dont l'origine n'était pas (0, 0).
    const viewBox = viewBoxOf(extSvg);
    const [, , w = '100', h = '100'] = viewBox.split(/\s+/);
    const extContent = extractContent(extSvg);
    const intContent = intSvg ? extractContent(intSvg) : '';

    let result = `<svg width="${w}" height="${h}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">`;
    result += `<g id="${type}">${extContent}</g>`;
    if (intContent) result += `<g id="${type}-interne">${intContent}</g>`;
    result += '</svg>';
    return result;
  }

  /**
   * Crée un .kompix (ZIP en Uint8Array) depuis une CustomPartData.
   * N'ajoute pas de miniature (to-do : générée au moment du save).
   */
  async createKompixBufferFromPartData(data: CustomPartData, partVersion: string = '0.1.0'): Promise<Uint8Array> {
    const zip = new JSZip();

    const manifest: KompixManifest = {
      kompixVersion: 1,
      type: data.type,
      label: data.label,
      description: data.category ? `[${data.category}]` : '',
      version: partVersion,
      author: 'User',
      kind: data.kind,
      category: data.category,
      pins: data.pins,
      pinRoles: data.pinRoles,
      attrs: data.attrs,
      params: data.params,
      control: data.control ?? null,
      innerOffset: data.innerOffset ?? null,
      extAnchor: data.extAnchor ?? null,
      intAnchor: data.intAnchor ?? null,
      behavior: data.behaviorScript ? 'behavior.mjs' : null,
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const schema = this.mergeSvgsForKompix(data.type, data.svg, data.innerSvg);
    zip.file('schema.svg', schema);

    if (data.behaviorScript) {
      zip.file('behavior.mjs', data.behaviorScript);
    }

    return await zip.generateAsync({ type: 'uint8array' });
  }

  /**
   * Crée un .kompix depuis une CustomPartData et l'enregistre dans la bibliothèque.
   */
  async savePartDataAsKompix(data: CustomPartData, partVersion: string = '0.1.0'): Promise<void> {
    try {
      const buffer = await this.createKompixBufferFromPartData(data, partVersion);
      await this.saveKompixFromBuffer(buffer, 'local');
    } catch (err) {
      console.error('Erreur savePartDataAsKompix:', err);
      throw err;
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
