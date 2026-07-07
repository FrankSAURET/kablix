import * as vscode from 'vscode';

// Localisation du firmware MicroPython (.uf2) pour le Pico simulé, avec
// téléchargement assisté quand il manque. Objectif : l'extension est
// fonctionnelle dès l'installation sans étape manuelle — si aucun firmware
// n'est présent, on propose de le récupérer depuis micropython.org et on le
// met en cache dans le globalStorage de l'extension (partagé entre projets).

const l10n = vscode.l10n;

/**
 * Firmwares officiels figés (dernière stable connue à la publication de
 * Kablix). Version épinglée = reproductible et testée ; mise à jour de ces
 * constantes lors d'une future version de l'extension.
 */
const FIRMWARES = {
  pico: {
    label: 'Raspberry Pi Pico',
    file: 'RPI_PICO-20260406-v1.28.0.uf2',
    url: 'https://micropython.org/resources/firmware/RPI_PICO-20260406-v1.28.0.uf2',
    page: 'https://micropython.org/download/RPI_PICO/',
  },
  picow: {
    label: 'Raspberry Pi Pico W',
    file: 'RPI_PICO_W-20260406-v1.28.0.uf2',
    url: 'https://micropython.org/resources/firmware/RPI_PICO_W-20260406-v1.28.0.uf2',
    page: 'https://micropython.org/download/RPI_PICO_W/',
  },
} as const;

export type FirmwareVariant = keyof typeof FIRMWARES;

const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Erreur « pas de firmware » silencieuse : l'utilisateur a annulé, pas un échec. */
export class FirmwareCancelled extends Error {
  constructor() {
    super('firmware selection cancelled');
    this.name = 'FirmwareCancelled';
  }
}

/**
 * Résout le chemin d'un firmware MicroPython utilisable, dans l'ordre :
 *   1. réglage kablix.micropythonUf2 (chemin explicite de l'utilisateur) ;
 *   2. firmware déjà mis en cache dans le globalStorage ;
 *   3. scan du workspace (firmware déposé par l'utilisateur) ;
 *   4. proposition interactive : télécharger depuis micropython.org, ou
 *      choisir un .uf2 local. Le résultat est mis en cache pour les fois
 *      suivantes (plus jamais redemandé).
 *
 * Lève FirmwareCancelled si l'utilisateur renonce (à traiter en silence).
 */
export async function resolveMicropythonFirmware(
  context: vscode.ExtensionContext,
  preferred?: FirmwareVariant
): Promise<string> {
  // 1. Réglage explicite : prioritaire, erreur claire s'il pointe dans le vide.
  const configured = vscode.workspace
    .getConfiguration('kablix')
    .get<string>('micropythonUf2');
  if (configured) {
    const uri = resolveConfiguredUri(configured);
    if (uri) {
      if (await exists(uri)) return uri.fsPath;
      throw new Error(
        l10n.t('MicroPython firmware not found: {0} (kablix.micropythonUf2 setting).', configured)
      );
    }
  }

  // 2. Firmware déposé dans le workspace : prioritaire sur le cache global, pour
  //    qu'un projet 100% hors-ligne qui embarque son propre .uf2 l'utilise
  //    toujours (reproductible, indépendant de la machine).
  const found = await vscode.workspace.findFiles(
    '**/{micropython,MICROPYTHON,RPI_PICO,rp2-pico}*.uf2',
    '**/node_modules/**',
    10
  );
  const best = await newest(found);
  if (best) return best.fsPath;

  // 3. Cache global de l'extension (téléchargement précédent, partagé entre projets).
  const cached = await findCachedFirmware(context);
  if (cached) return cached.fsPath;

  // 4. Rien trouvé : proposer le téléchargement ou la sélection d'un fichier.
  return promptAndObtain(context, preferred);
}

/** Construit l'URI d'un chemin de réglage (absolu, ou relatif au workspace). */
function resolveConfiguredUri(configured: string): vscode.Uri | undefined {
  if (/^([a-zA-Z]:[\\/]|\/)/.test(configured)) return vscode.Uri.file(configured);
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.length > 0 ? vscode.Uri.joinPath(folders[0].uri, configured) : undefined;
}

/** Dossier de cache des firmwares dans le globalStorage de l'extension. */
function cacheDir(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, 'micropython');
}

/** Premier .uf2 présent dans le cache global, le cas échéant. */
async function findCachedFirmware(
  context: vscode.ExtensionContext
): Promise<vscode.Uri | undefined> {
  const dir = cacheDir(context);
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    const uris = entries
      .filter(([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith('.uf2'))
      .map(([name]) => vscode.Uri.joinPath(dir, name));
    return newest(uris);
  } catch {
    return undefined; // dossier de cache inexistant : premier lancement
  }
}

/**
 * Boîte de dialogue : aucun firmware trouvé. Propose le téléchargement
 * automatique ou la sélection d'un fichier local. Met le résultat en cache.
 */
async function promptAndObtain(
  context: vscode.ExtensionContext,
  preferred?: FirmwareVariant
): Promise<string> {
  const download = l10n.t('Download MicroPython');
  const choose = l10n.t('Choose a file…');
  const choice = await vscode.window.showWarningMessage(
    l10n.t(
      'Kablix: no MicroPython firmware (.uf2) was found. Download the official firmware from micropython.org, or select a .uf2 file you already have.'
    ),
    { modal: true },
    download,
    choose
  );

  if (choice === download) return downloadFlow(context, preferred);
  if (choice === choose) return chooseFileFlow(context);
  throw new FirmwareCancelled();
}

/**
 * Télécharge le firmware figé et le met en cache. La variante (Pico / Pico W) est
 * imposée par `preferred` (carte choisie dans le simulateur) si fournie, sinon
 * demandée à l'utilisateur.
 */
async function downloadFlow(
  context: vscode.ExtensionContext,
  preferred?: FirmwareVariant
): Promise<string> {
  const variant = preferred ?? (await pickVariant());
  if (!variant) throw new FirmwareCancelled();
  const fw = FIRMWARES[variant];

  const dir = cacheDir(context);
  await vscode.workspace.fs.createDirectory(dir);
  const target = vscode.Uri.joinPath(dir, fw.file);
  if (await exists(target)) return target.fsPath; // déjà là (course possible)

  try {
    const bytes = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: l10n.t('Kablix: downloading {0}…', fw.label),
        cancellable: true,
      },
      (_progress, token) => downloadBytes(fw.url, token)
    );
    await vscode.workspace.fs.writeFile(target, bytes);
    void vscode.window.showInformationMessage(
      l10n.t('Kablix: MicroPython firmware installed ({0}).', fw.label)
    );
    return target.fsPath;
  } catch (err) {
    if (err instanceof FirmwareCancelled) throw err;
    const message = err instanceof Error ? err.message : String(err);
    // Échec réseau : proposer le repli « choisir un fichier » plutôt qu'abandonner.
    const openPage = l10n.t('Open download page');
    const choose = l10n.t('Choose a file…');
    const pick = await vscode.window.showErrorMessage(
      l10n.t('Kablix: firmware download failed ({0}).', message),
      openPage,
      choose
    );
    if (pick === openPage) {
      void vscode.env.openExternal(vscode.Uri.parse(fw.page));
      throw new FirmwareCancelled();
    }
    if (pick === choose) return chooseFileFlow(context);
    throw new FirmwareCancelled();
  }
}

/** Sélecteur de carte pour le firmware à télécharger. */
async function pickVariant(): Promise<FirmwareVariant | undefined> {
  const items: Array<vscode.QuickPickItem & { variant: FirmwareVariant }> = [
    { label: FIRMWARES.pico.label, description: 'RP2040', variant: 'pico' },
    { label: FIRMWARES.picow.label, description: 'RP2040 + Wi-Fi', variant: 'picow' },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: l10n.t('Which board?'),
    placeHolder: l10n.t('Select the MicroPython firmware to download'),
  });
  return picked?.variant;
}

/** Variantes dont le cache contient un fichier différent du nom figé courant. */
async function outdatedVariants(
  context: vscode.ExtensionContext
): Promise<FirmwareVariant[]> {
  const dir = cacheDir(context);
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dir);
  } catch {
    return []; // pas de cache : rien à comparer, on ne force pas de téléchargement
  }
  const cachedNames = new Set(
    entries
      .filter(([, type]) => type === vscode.FileType.File)
      .map(([name]) => name)
  );
  return (Object.keys(FIRMWARES) as FirmwareVariant[]).filter((variant) => {
    const fw = FIRMWARES[variant];
    // Une variante jamais téléchargée n'est pas "obsolète" : rien à proposer,
    // le flux normal (resolveMicropythonFirmware) la téléchargera à l'usage.
    const hasAnyCachedFile = [...cachedNames].some((name) =>
      name.startsWith(variant === 'picow' ? 'RPI_PICO_W' : 'RPI_PICO-')
    );
    return hasAnyCachedFile && !cachedNames.has(fw.file);
  });
}

/**
 * Vérifie si le firmware en cache correspond à la version figée dans ce
 * module et propose le téléchargement sinon. Échec réseau/silence total :
 * cette vérification est un confort, jamais bloquante.
 */
export async function checkFirmwareUpdate(
  context: vscode.ExtensionContext,
  silent: boolean
): Promise<void> {
  const outdated = await outdatedVariants(context);
  if (outdated.length === 0) {
    if (!silent) {
      void vscode.window.showInformationMessage(
        l10n.t('Kablix: the MicroPython firmware is up to date.')
      );
    }
    return;
  }

  const names = outdated.map((v) => FIRMWARES[v].label).join(', ');
  const upgrade = l10n.t('Upgrade');
  const choice = await vscode.window.showInformationMessage(
    l10n.t('Kablix: a newer MicroPython firmware is available for {0}.', names),
    upgrade
  );
  if (choice === upgrade) await upgradeFirmware(context);
}

/**
 * Commande « Upgrade Pico firmware » : télécharge la version figée courante
 * pour la ou les variantes déjà en cache (remplace l'ancien fichier), ou
 * demande la carte si rien n'est encore en cache.
 */
export async function upgradeFirmware(context: vscode.ExtensionContext): Promise<void> {
  const outdated = await outdatedVariants(context);
  const variants = outdated.length > 0 ? outdated : [await pickVariant()].filter(
    (v): v is FirmwareVariant => v !== undefined
  );
  if (variants.length === 0) return; // annulé, ou rien à mettre à jour

  for (const variant of variants) {
    const fw = FIRMWARES[variant];
    const dir = cacheDir(context);
    await vscode.workspace.fs.createDirectory(dir);
    const target = vscode.Uri.joinPath(dir, fw.file);

    try {
      const bytes = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: l10n.t('Kablix: downloading {0}…', fw.label),
          cancellable: true,
        },
        (_progress, token) => downloadBytes(fw.url, token)
      );
      await vscode.workspace.fs.writeFile(target, bytes);
      await removeOtherCachedFiles(context, variant, fw.file);
      void vscode.window.showInformationMessage(
        l10n.t('Kablix: MicroPython firmware installed ({0}).', fw.label)
      );
    } catch (err) {
      if (err instanceof FirmwareCancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(
        l10n.t('Kablix: firmware download failed ({0}).', message)
      );
    }
  }
}

/** Retire du cache les anciens fichiers de la même variante (évite l'accumulation). */
async function removeOtherCachedFiles(
  context: vscode.ExtensionContext,
  variant: FirmwareVariant,
  keepFile: string
): Promise<void> {
  const dir = cacheDir(context);
  const prefix = variant === 'picow' ? 'RPI_PICO_W' : 'RPI_PICO-';
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) continue;
      if (name === keepFile) continue;
      if (!name.startsWith(prefix)) continue;
      // RPI_PICO- ne doit pas capter les fichiers RPI_PICO_W- (préfixe partagé) :
      // le Pico W a son propre préfixe testé en premier ci-dessus.
      if (variant === 'pico' && name.startsWith('RPI_PICO_W')) continue;
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, name));
    }
  } catch {
    // best effort : un fichier résiduel n'est pas grave
  }
}

/** Sélection d'un .uf2 local ; copié dans le cache pour réutilisation. */
async function chooseFileFlow(context: vscode.ExtensionContext): Promise<string> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: l10n.t('Use this firmware'),
    filters: { 'MicroPython firmware': ['uf2'] },
    title: l10n.t('Select a MicroPython firmware (.uf2)'),
  });
  if (!picked || picked.length === 0) throw new FirmwareCancelled();
  const source = picked[0];

  // Copie dans le cache pour que les prochains lancements n'aient plus à demander.
  try {
    const dir = cacheDir(context);
    await vscode.workspace.fs.createDirectory(dir);
    const name = source.fsPath.split(/[\\/]/).pop() ?? 'micropython.uf2';
    const target = vscode.Uri.joinPath(dir, name);
    await vscode.workspace.fs.copy(source, target, { overwrite: true });
    return target.fsPath;
  } catch {
    // Copie impossible (droits, etc.) : on utilise directement le fichier choisi.
    return source.fsPath;
  }
}

/** Télécharge une URL en mémoire avec annulation et timeout. */
async function downloadBytes(
  url: string,
  token: vscode.CancellationToken
): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const onCancel = token.onCancellationRequested(() => controller.abort());
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (token.isCancellationRequested) throw new FirmwareCancelled();
    return new Uint8Array(buf);
  } catch (err) {
    if (token.isCancellationRequested) throw new FirmwareCancelled();
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
    onCancel.dispose();
  }
}

/** Vrai si l'URI désigne un fichier existant. */
async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/** URI le plus récemment modifié de la liste (par date de fichier). */
async function newest(uris: vscode.Uri[]): Promise<vscode.Uri | undefined> {
  let best: vscode.Uri | undefined;
  let bestTime = -1;
  for (const uri of uris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.mtime > bestTime) {
        bestTime = stat.mtime;
        best = uri;
      }
    } catch {
      // fichier disparu entre temps : ignoré
    }
  }
  return best;
}
