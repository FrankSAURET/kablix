import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

const l10n = vscode.l10n;

/** Marque « proposition d'association déjà faite » (une seule fois par machine). */
const ASSOC_PROMPTED_KEY = 'kablix.projixAssociationPrompted';

/** Icône du paquet (source de la copie faite par le script). */
function packagedIcon(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, 'media', 'kablix.ico').fsPath;
}

/** Arguments PowerShell du script d'association packagé. */
function scriptArgs(context: vscode.ExtensionContext): string[] {
  const script = vscode.Uri.joinPath(
    context.extensionUri,
    'outils',
    'associer-projix-windows.ps1'
  ).fsPath;
  return ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-IconPath', packagedIcon(context)];
}

/**
 * Associe l'extension .projix à VS Code (icône Kablix comprise) en lançant le
 * script PowerShell packagé. HKCU uniquement : pas de droits admin, réversible.
 * Windows seulement (ailleurs : message informatif).
 */
export async function associateProjix(context: vscode.ExtensionContext): Promise<void> {
  if (process.platform !== 'win32') {
    void vscode.window.showInformationMessage(
      l10n.t('File association is only available on Windows.')
    );
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: l10n.t('Associating .projix files…') },
    () =>
      new Promise<void>((resolve) => {
        execFile(
          'powershell.exe',
          scriptArgs(context),
          { windowsHide: true },
          (err, _stdout, stderr) => {
            if (err) {
              void vscode.window.showErrorMessage(
                l10n.t('Could not associate .projix files: {0}', stderr || err.message)
              );
            } else {
              void vscode.window.showInformationMessage(
                l10n.t(
                  '.projix files are now associated with Kablix. Double-click a .projix file in Explorer to open it.'
                )
              );
            }
            resolve();
          }
        );
      })
  );
}

/**
 * À la première activation (Windows), propose une seule fois d'associer les
 * fichiers .projix. Mémorisé dans globalState pour ne plus jamais redemander,
 * quel que soit le choix.
 */
export async function promptProjixAssociationOnFirstRun(
  context: vscode.ExtensionContext
): Promise<void> {
  if (process.platform !== 'win32') return;
  if (context.globalState.get<boolean>(ASSOC_PROMPTED_KEY, false)) return;

  const yes = l10n.t('Associate');
  const later = l10n.t('Not now');
  const choice = await vscode.window.showInformationMessage(
    l10n.t(
      'Associate .projix files with Kablix so a double-click in Explorer opens them (with the Kablix icon)?'
    ),
    yes,
    later
  );
  // Quel que soit le choix (y compris fermeture), on ne redemande plus.
  await context.globalState.update(ASSOC_PROMPTED_KEY, true);
  if (choice === yes) {
    await associateProjix(context);
  }
}

/**
 * Association déjà faite mais icône périmée (ex. copie à fond vert opaque des
 * versions 2026.7.225 à 2026.9.5) : le script est rejoué en silence, il recopie
 * l'icône du paquet dans %LOCALAPPDATA%\Kablix et prévient l'Explorateur.
 * Copie absente (jamais associé, ou association retirée) : rien.
 */
export async function refreshProjixIcon(context: vscode.ExtensionContext): Promise<void> {
  const localAppData = process.env.LOCALAPPDATA;
  if (process.platform !== 'win32' || !localAppData) return;
  try {
    const [copie, paquet] = await Promise.all([
      readFile(path.join(localAppData, 'Kablix', 'kablix.ico')),
      readFile(packagedIcon(context)),
    ]);
    if (copie.toString('base64') === paquet.toString('base64')) return;
  } catch {
    return;
  }
  execFile('powershell.exe', scriptArgs(context), { windowsHide: true }, () => undefined);
}
