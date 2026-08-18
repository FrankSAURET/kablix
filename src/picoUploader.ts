import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';

/** Gestionnaire d'upload de code MicroPython vers des cartes Pico connectées. */
export class PicoUploader {
  private detectedPorts: string[] = [];
  private selectedPort: string | undefined;
  private scriptPath: string;

  constructor(private context: vscode.ExtensionContext) {
    // Chemin du script Python de transfert REPL
    this.scriptPath = path.join(context.extensionPath, 'scripts', 'pico-upload.py');
  }

  /** Démarre la détection des ports Pico disponibles. */
  async start(): Promise<void> {
    await this.detectPorts();
  }

  /** Cherche les ports sériel disponibles sur le système. */
  private async detectPorts(): Promise<void> {
    const platform = process.platform;
    let ports: string[] = [];

    if (platform === 'win32') {
      ports = this.listPortsWindows();
    } else if (platform === 'linux') {
      ports = this.listPortsLinux();
    } else if (platform === 'darwin') {
      ports = this.listPortsMacOS();
    }

    this.detectedPorts = ports;
    if (ports.length > 0) {
      this.selectedPort = ports[0];
    }
  }

  /** Liste les ports COM sur Windows. */
  private listPortsWindows(): string[] {
    try {
      const output = execSync(
        "Get-WmiObject Win32_SerialPort | Select-Object -ExpandProperty DeviceID",
        { encoding: 'utf-8', shell: 'powershell.exe' }
      );
      return output
        .trim()
        .split('\n')
        .filter((port) => port.match(/^COM\d+$/));
    } catch {
      return [];
    }
  }

  /** Liste les ports /dev/tty* sur Linux. */
  private listPortsLinux(): string[] {
    try {
      const devDir = '/dev';
      const files = fs.readdirSync(devDir);
      return files
        .filter(
          (f) =>
            f.startsWith('ttyUSB') ||
            f.startsWith('ttyACM') ||
            f.startsWith('ttyS')
        )
        .map((f) => path.join(devDir, f));
    } catch {
      return [];
    }
  }

  /** Liste les ports /dev/tty.* sur macOS. */
  private listPortsMacOS(): string[] {
    try {
      const devDir = '/dev';
      const files = fs.readdirSync(devDir);
      return files
        .filter(
          (f) =>
            f.startsWith('tty.usbserial') ||
            f.startsWith('tty.SLAB_USBtoUART') ||
            f.startsWith('tty.wchusbserial')
        )
        .map((f) => path.join(devDir, f));
    } catch {
      return [];
    }
  }

  /** Vérifie s'il y a un port Pico disponible (détecté). */
  hasDetectedPorts(): boolean {
    return this.detectedPorts.length > 0;
  }

  /** Retourne le port sélectionné ou le premier détecté. */
  getSelectedPort(): string | undefined {
    return this.selectedPort;
  }

  /** Permet à l'utilisateur de choisir un port. */
  async choosePort(): Promise<string | undefined> {
    if (this.detectedPorts.length === 0) {
      await this.detectPorts();
    }

    if (this.detectedPorts.length === 0) {
      vscode.window.showErrorMessage(
        'Aucun port sériel détecté. Vérifiez que votre Pico est connecté.'
      );
      return undefined;
    }

    const selected = await vscode.window.showQuickPick(
      this.detectedPorts,
      {
        placeHolder: 'Choisir le port Pico',
        title: 'Sélectionner le port sériel',
      }
    );

    if (selected) {
      this.selectedPort = selected;
    }

    return selected;
  }

  /** Upload un fichier ou un dossier vers le Pico via REPL. */
  async uploadFiles(fileOrFolder: string): Promise<void> {
    let port = this.selectedPort;

    if (!port) {
      port = await this.choosePort();
      if (!port) return;
    }

    const stats = fs.statSync(fileOrFolder);
    const filesToUpload: { path: string; name: string }[] = [];

    if (stats.isDirectory()) {
      // Récurser pour trouver tous les fichiers .py
      this.collectPythonFiles(fileOrFolder, filesToUpload);
    } else if (stats.isFile() && fileOrFolder.endsWith('.py')) {
      filesToUpload.push({
        path: fileOrFolder,
        name: path.basename(fileOrFolder),
      });
    }

    if (filesToUpload.length === 0) {
      vscode.window.showWarningMessage('Aucun fichier Python trouvé.');
      return;
    }

    // Afficher un dialog pour permettre à l'utilisateur de décocher les fichiers
    const selected = await this.selectFilesForUpload(filesToUpload);
    if (selected.length === 0) {
      return;
    }

    // Uploader les fichiers
    const progress = vscode.window.createOutputChannel('Pico Upload');
    progress.show();

    try {
      await this.uploadToRepl(port, selected, progress);
      vscode.window.showInformationMessage(
        `${selected.length} fichier(s) uploadé(s) sur le Pico.`
      );
    } catch (error) {
      progress.appendLine(`Erreur: ${error}`);
      vscode.window.showErrorMessage(
        `Erreur lors du transfert: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Collecte récursivement les fichiers .py d'un dossier. */
  private collectPythonFiles(
    dir: string,
    files: { path: string; name: string }[],
    baseDir = dir
  ): void {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        this.collectPythonFiles(fullPath, files, baseDir);
      } else if (entry.endsWith('.py')) {
        const relativeName = path.relative(baseDir, fullPath);
        files.push({ path: fullPath, name: relativeName });
      }
    }
  }

  /** Affiche un dialog pour sélectionner les fichiers à uploader. */
  private async selectFilesForUpload(
    files: { path: string; name: string }[]
  ): Promise<{ path: string; name: string }[]> {
    const items = files.map((f) => ({
      label: f.name,
      picked: true,
      file: f,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Sélectionner les fichiers à uploader',
      title: `Uploader ${files.length} fichier(s)`,
    });

    return (selected || []).map((item) => item.file);
  }

  /** Envoie les fichiers au Pico via le port REPL. */
  private uploadToRepl(
    port: string,
    files: { path: string; name: string }[],
    progress: vscode.OutputChannel
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      progress.appendLine(`Connexion au port ${port}...`);

      const args = [
        this.scriptPath,
        '--port',
        port,
        '--files',
        JSON.stringify(files),
      ];

      // Essayer python3 d'abord, puis python (Windows)
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

      const worker = spawn(pythonCmd, args, {
        cwd: path.dirname(this.scriptPath),
      });

      worker.stdout.on('data', (data) => {
        progress.appendLine(data.toString().trim());
      });

      worker.stderr.on('data', (data) => {
        progress.appendLine(`Erreur: ${data.toString().trim()}`);
      });

      worker.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Upload échoué (code ${code})`));
        }
      });

      worker.on('error', (err) => {
        reject(err);
      });
    });
  }
}
