// Téléversement d'un programme MicroPython sur une VRAIE carte Pico branchée en
// USB (à ne pas confondre avec la simulation, qui n'écrit rien sur le matériel).
//
// Trois choix qui font tout le comportement :
//
// 1. **Seules les cartes Raspberry Pi sont détectées** (identifiant fabricant USB
//    VID 2E8A). Lister « tous les ports série » remontait COM1 sur Windows — le
//    port série de la carte mère, présent sur toutes les machines — et le
//    téléversement partait dessus. Un port qui n'est pas un Pico n'est donc jamais
//    proposé, et le bouton reste éteint tant qu'aucune carte n'est branchée.
//
// 2. **Le fichier ouvert devient `main.py`** sur la carte (c'est le nom que
//    MicroPython exécute au démarrage), et on ne l'accompagne que des modules
//    qu'il IMPORTE réellement — pas de tous les `.py` du dossier. La résolution
//    est celle de la simulation (`collectPythonLibs`, compiler.ts) : mêmes règles,
//    même sous-dossier `lib/`, donc ce qui tourne en simulation tourne sur la carte.
//
// 3. **Rien n'est demandé quand il n'y a rien à choisir** : une seule carte
//    branchée, pas de question ; un seul fichier à envoyer, pas de question. La
//    fenêtre de décochage n'apparaît que s'il y a vraiment plusieurs fichiers.
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { collectPythonLibs } from './compiler';

/** Clé de contexte lue par le `when` des boutons (package.json). */
export const PICO_CONNECTED_CONTEXT = 'kablix.picoConnected';

/** Identifiant fabricant USB de Raspberry Pi : le seul retenu pour une carte Pico. */
const RPI_VENDOR_ID = '2E8A';

/** Cadence du contrôle de présence de la carte (branchement/débranchement à chaud). */
const POLL_MS = 4000;

/** Une carte trouvée sur un port série. */
export interface PicoPort {
  /** Port système : `COM3`, `/dev/ttyACM0`, `/dev/cu.usbmodem1401`. */
  port: string;
  /** Libellé lisible (nom du périphérique tel que vu par le système). */
  label: string;
}

/** Un fichier à téléverser : source locale → destination sur la carte. */
export interface UploadItem {
  /** Chemin absolu du fichier sur le disque. */
  localPath: string;
  /** Chemin sur la carte (`main.py`, `lcd_api.py`, `lib/pkg/sub.py`). */
  remotePath: string;
  /** Programme principal (celui qui est renommé `main.py`). */
  isMain: boolean;
}

/** Exécute une commande et rend sa sortie standard (chaîne vide en cas d'échec). */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : stdout);
    });
  });
}

/**
 * Liste les cartes Raspberry Pi branchées. Chaque système a sa façon de dire
 * « ce port série est un Pico » ; dans les trois cas c'est le VID 2E8A qui tranche.
 */
async function detectPicoPorts(): Promise<PicoPort[]> {
  if (process.platform === 'win32') return detectWindows();
  if (process.platform === 'darwin') return detectMac();
  return detectLinux();
}

/** Windows : le VID est dans le `PNPDeviceID`, le port dans le nom (« … (COM3) »). */
async function detectWindows(): Promise<PicoPort[]> {
  // -NonInteractive/-NoProfile : pas de profil utilisateur à charger (démarrage
  // plus court) et aucune invite possible, ce contrôle tournant en arrière-plan.
  const script =
    `Get-CimInstance Win32_PnPEntity | ` +
    `Where-Object { $_.PNPDeviceID -like '*VID_${RPI_VENDOR_ID}*' -and $_.Name -match '\\(COM\\d+\\)' } | ` +
    `ForEach-Object { $_.Name }`;
  const out = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ]);
  const ports: PicoPort[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/\((COM\d+)\)/);
    if (m) ports.push({ port: m[1], label: line.trim() });
  }
  return ports;
}

/** Linux : `/dev/serial/by-id/` nomme les liens d'après le fabricant et le produit. */
async function detectLinux(): Promise<PicoPort[]> {
  const byId = '/dev/serial/by-id';
  if (!existsSync(byId)) return [];
  const out = await run('ls', ['-l', byId]);
  const ports: PicoPort[] = [];
  for (const line of out.split('\n')) {
    // « … Raspberry_Pi_Pico_… -> ../../ttyACM0 »
    if (!/Raspberry|Pico|MicroPython/i.test(line)) continue;
    const m = line.match(/->\s*\S*?([^/\s]+)\s*$/);
    if (m) {
      const dev = `/dev/${m[1]}`;
      const name = line.split(/\s+/).find((p) => /Raspberry|Pico/i.test(p)) ?? dev;
      ports.push({ port: dev, label: `${name} (${dev})` });
    }
  }
  return ports;
}

/** macOS : `ioreg` donne le VID, les CDC sont exposés en `/dev/cu.usbmodem*`. */
async function detectMac(): Promise<PicoPort[]> {
  const out = await run('ioreg', ['-r', '-c', 'IOUSBHostDevice', '-l']);
  if (!new RegExp(`"idVendor" = ${parseInt(RPI_VENDOR_ID, 16)}`).test(out)) return [];
  const dev = await run('sh', ['-c', 'ls /dev/cu.usbmodem* 2>/dev/null']);
  return dev
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((port) => ({ port, label: `Raspberry Pi Pico (${port})` }));
}

/**
 * Construit la liste des fichiers à envoyer : le programme ouvert (renommé
 * `main.py`) plus les seuls modules qu'il importe, résolus comme en simulation.
 * Les modules gardent leur chemin relatif — `lib/` est dans le `sys.path` de
 * MicroPython, un module rangé là le reste sur la carte.
 */
export function planUpload(scriptPath: string): UploadItem[] {
  const source = readFileSync(scriptPath, 'utf-8');
  const items: UploadItem[] = [
    { localPath: scriptPath, remotePath: 'main.py', isMain: true },
  ];
  let libs: ReturnType<typeof collectPythonLibs> = [];
  try {
    libs = collectPythonLibs(scriptPath, source);
  } catch {
    libs = []; // dossier illisible : on envoie au moins le programme principal
  }
  const dir = dirname(scriptPath);
  for (const lib of libs) {
    // Un module qui s'appellerait déjà main.py entrerait en collision avec le
    // programme : il est alors laissé de côté (le principal prime).
    if (lib.rel === 'main.py') continue;
    items.push({
      localPath: lib.file ?? join(dir, lib.rel),
      remotePath: lib.rel,
      isMain: false,
    });
  }
  return items;
}

/** Téléversement sur une carte Pico réelle : détection, choix, envoi. */
export class PicoUploader {
  private ports: PicoPort[] = [];
  private lastPort: string | undefined;
  private timer: NodeJS.Timeout | undefined;
  private output: vscode.OutputChannel | undefined;
  private busy = false;
  private readonly scriptPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.scriptPath = join(context.extensionPath, 'scripts', 'pico-upload.py');
  }

  /** Première détection, puis contrôle périodique (branchement à chaud). */
  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.output?.dispose();
  }

  /** Y a-t-il une carte branchée ? (état du bouton) */
  isConnected(): boolean {
    return this.ports.length > 0;
  }

  /**
   * Relit la liste des cartes et publie l'état dans le contexte VS Code, qui
   * décide laquelle des deux icônes (active/inactive) s'affiche dans l'onglet.
   */
  private async refresh(): Promise<void> {
    // Pendant un téléversement le port est occupé : le relire ferait clignoter
    // le bouton, et sur Windows la requête WMI est lente.
    if (this.busy) return;
    const before = this.isConnected();
    try {
      this.ports = await detectPicoPorts();
    } catch {
      this.ports = [];
    }
    if (this.isConnected() !== before || this.firstRefresh) {
      this.firstRefresh = false;
      void vscode.commands.executeCommand(
        'setContext',
        PICO_CONNECTED_CONTEXT,
        this.isConnected()
      );
    }
  }

  private firstRefresh = true;

  /** Carte à utiliser : rien à demander s'il n'y en a qu'une. */
  private async pickPort(): Promise<string | undefined> {
    if (this.ports.length === 0) {
      await this.refresh();
      if (this.ports.length === 0) {
        void vscode.window.showWarningMessage(
          vscode.l10n.t('No Pico board detected. Plug one in over USB and try again.')
        );
        return undefined;
      }
    }
    if (this.ports.length === 1) return this.ports[0].port;

    const picked = await vscode.window.showQuickPick(
      this.ports.map((p) => ({
        label: p.port,
        description: p.label,
        picked: p.port === this.lastPort,
      })),
      { title: vscode.l10n.t('Which Pico board?'), placeHolder: this.lastPort }
    );
    return picked?.label;
  }

  /**
   * Envoie le programme ouvert sur la carte. Le fichier devient `main.py`, ses
   * modules importés l'accompagnent ; une fenêtre de décochage n'apparaît que
   * s'il y a plus d'un fichier.
   */
  async upload(scriptPath: string): Promise<void> {
    if (this.busy) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('An upload is already running.')
      );
      return;
    }
    let items: UploadItem[];
    try {
      items = planUpload(scriptPath);
    } catch (err) {
      void vscode.window.showErrorMessage(
        vscode.l10n.t('Cannot read {0}: {1}', basename(scriptPath), String(err))
      );
      return;
    }

    // Plusieurs fichiers : l'utilisateur décoche ce qu'il ne veut pas. Le
    // programme principal n'est pas décochable — c'est lui qu'on téléverse.
    if (items.length > 1) {
      const chosen = await vscode.window.showQuickPick(
        items.map((it) => ({
          label: it.isMain
            ? `${basename(it.localPath)} → main.py`
            : it.remotePath,
          description: it.isMain
            ? vscode.l10n.t('program (required)')
            : vscode.l10n.t('imported module'),
          detail: this.sizeOf(it.localPath),
          picked: true,
          item: it,
        })),
        {
          canPickMany: true,
          title: vscode.l10n.t('Send to the Pico board'),
          placeHolder: vscode.l10n.t('Uncheck what you do not want to send'),
        }
      );
      if (!chosen) return; // fenêtre fermée : rien n'est envoyé
      const kept = chosen.map((c) => c.item);
      // Le principal reste toujours du voyage, même décoché par mégarde.
      items = kept.some((k) => k.isMain) ? kept : [items[0], ...kept];
    }

    const port = await this.pickPort();
    if (!port) return;
    this.lastPort = port;

    const out = this.channel();
    out.clear();
    this.busy = true;
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t('Uploading to the Pico ({0})…', port),
          cancellable: false,
        },
        () => this.send(port, items, out)
      );
      void vscode.window.showInformationMessage(
        vscode.l10n.t('{0} file(s) sent. Reset the board to run main.py.', items.length)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.show(true);
      void vscode.window.showErrorMessage(
        vscode.l10n.t('Upload failed: {0}', message)
      );
    } finally {
      this.busy = false;
      void this.refresh();
    }
  }

  /** Taille du fichier, en clair, pour la fenêtre de décochage. */
  private sizeOf(file: string): string {
    try {
      return `${statSync(file).size} o`;
    } catch {
      return '';
    }
  }

  /** Journal unique, réutilisé d'un téléversement à l'autre. */
  private channel(): vscode.OutputChannel {
    if (!this.output) {
      this.output = vscode.window.createOutputChannel('Kablix — Pico upload');
    }
    return this.output;
  }

  /**
   * Lance l'outil de transfert (Python + pyserial). Le protocole lui-même est
   * dans `scripts/pico-upload.py` : c'est le raw REPL de MicroPython, le seul
   * chemin fiable pour écrire un fichier sur la carte.
   */
  private send(
    port: string,
    items: UploadItem[],
    out: vscode.OutputChannel
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = items.map((it) => ({
        path: it.localPath,
        remote: it.remotePath,
      }));
      out.appendLine(`> ${port} — ${items.length} fichier(s)`);

      // `python` sur Windows, `python3` ailleurs : c'est le nom que porte
      // l'interpréteur 3.x sur chaque système.
      const exe = process.platform === 'win32' ? 'python' : 'python3';
      const child = execFile(
        exe,
        [this.scriptPath, '--port', port, '--files', JSON.stringify(payload)],
        { maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (stdout) out.append(stdout);
          if (stderr) out.append(stderr);
          if (!err) return resolve();
          // ENOENT : Python absent du système, message explicite plutôt qu'un
          // code de sortie sans explication.
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return reject(
              new Error(
                vscode.l10n.t('Python 3 was not found. Install it, then run: pip install pyserial')
              )
            );
          }
          const detail = (stdout + stderr)
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.startsWith('ERROR'))
            .pop();
          reject(new Error(detail ? detail.replace(/^ERROR:\s*/, '') : String(err.message)));
        }
      );
      child.on('error', reject);
    });
  }
}
