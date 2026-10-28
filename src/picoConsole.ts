// Terminal « Pico (COMx) » : la sortie d'une VRAIE carte après un envoi.
//
// Après l'envoi, `scripts/pico-upload.py --monitor` garde le port série ouvert
// et relaie la carte : octets bruts sur stdout, saisie du terminal sur stdin.
// Sans ce relais personne ne lit le port (MicroPico reste déconnecté pour ne pas
// arrêter `main.py`) et les `print` du programme se perdent.
//
// Un seul terminal, réutilisé d'un envoi à l'autre ; le fermer libère le port.
import * as vscode from 'vscode';
import type { ChildProcess } from 'node:child_process';

/** Gris atténué pour les lignes d'état de Kablix, distinctes de la sortie de la carte. */
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

export class PicoConsole {
  private terminal: vscode.Terminal | undefined;
  private terminalPort: string | undefined;
  private readonly writer = new vscode.EventEmitter<string>();
  private child: ChildProcess | undefined;
  /** Décodage UTF-8 en flux : un accent peut tomber à cheval sur deux paquets USB. */
  private decoder = new TextDecoder('utf-8');
  /** Texte arrivé avant l'ouverture du terminal (VS Code ignore les écritures d'avant `open`). */
  private pending: string[] | undefined;

  /** Un relais tient-il le port en ce moment ? */
  isRunning(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed;
  }

  /** Écrit vers la carte (Ctrl-C compris) ; rend faux s'il n'y a pas de relais. */
  send(data: string): boolean {
    if (!this.isRunning()) return false;
    this.child!.stdin?.write(data);
    return true;
  }

  /**
   * Branche un relais sur le terminal (créé ou réutilisé) et le montre sans
   * prendre le focus. `first` = sortie de la carte déjà lue par l'appelant.
   */
  attach(child: ChildProcess, port: string, first: Buffer): void {
    this.child = child;
    this.decoder = new TextDecoder('utf-8');
    this.ensureTerminal(port);
    this.write(dim(`\r\n── ${vscode.l10n.t('Pico output ({0}) — type Ctrl-C to stop the program', port)} ──\r\n`));
    if (first.length) this.write(this.decoder.decode(first, { stream: true }));
    child.stdout?.on('data', (chunk: Buffer) => {
      if (this.child === child) this.write(this.decoder.decode(chunk, { stream: true }));
    });
    // stderr : lignes d'état du relais (carte débranchée, revenue).
    let errBuf = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      errBuf += chunk.toString('utf-8');
      let nl: number;
      while ((nl = errBuf.indexOf('\n')) >= 0) {
        const line = errBuf.slice(0, nl).trim();
        errBuf = errBuf.slice(nl + 1);
        if (this.child !== child) continue;
        if (line === 'STATUS: waiting') {
          this.write(dim(`\r\n[${vscode.l10n.t('Board disconnected, waiting for it…')}]\r\n`));
        } else if (line === 'STATUS: open') {
          this.write(dim(`[${vscode.l10n.t('Board connected')}]\r\n`));
        } else if (line) {
          this.write(dim(`${line}\r\n`));
        }
      }
    });
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = undefined;
      this.write(dim(`\r\n[${vscode.l10n.t('Serial port released')}]\r\n`));
    });
    this.terminal!.show(true);
  }

  /** Arrête le relais et attend que le port soit rendu (avant un envoi, un arrêt). */
  async release(): Promise<void> {
    const child = this.child;
    if (!child || !this.isRunning()) return;
    this.child = undefined;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000); // processus têtu : on n'attend pas plus
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
    // Le temps que Windows rende le handle du COM.
    await new Promise((r) => setTimeout(r, 200));
    this.write(dim(`\r\n[${vscode.l10n.t('Serial port released')}]\r\n`));
  }

  dispose(): void {
    this.child?.kill();
    this.child = undefined;
    this.terminal?.dispose();
    this.writer.dispose();
  }

  private write(text: string): void {
    if (this.pending) this.pending.push(text);
    else this.writer.fire(text);
  }

  private ensureTerminal(port: string): void {
    if (this.terminal && this.terminal.exitStatus === undefined) {
      if (this.terminalPort === port) return;
      this.terminal.dispose(); // autre carte : le nom de l'onglet doit suivre
    }
    this.terminalPort = port;
    this.pending = [];
    const pty: vscode.Pseudoterminal = {
      onDidWrite: this.writer.event,
      open: () => {
        const queued = this.pending ?? [];
        this.pending = undefined;
        for (const t of queued) this.writer.fire(t);
      },
      // Terminal fermé par l'utilisateur : le port est rendu.
      close: () => {
        if (this.terminal !== term) return; // ancien onglet remplacé : rien à libérer
        this.terminal = undefined;
        this.pending = undefined;
        this.child?.kill();
        this.child = undefined;
      },
      handleInput: (data) => {
        this.send(data);
      },
    };
    const term = vscode.window.createTerminal({ name: `Pico (${port})`, pty });
    this.terminal = term;
  }
}
