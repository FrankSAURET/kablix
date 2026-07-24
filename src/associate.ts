import * as vscode from 'vscode';
import { execFile } from 'node:child_process';

const l10n = vscode.l10n;

/** Marque « proposition d'association déjà faite » (une seule fois par machine). */
const ASSOC_PROMPTED_KEY = 'kablix.projixAssociationPrompted';

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

  const script = vscode.Uri.joinPath(
    context.extensionUri,
    'outils',
    'associer-projix-windows.ps1'
  ).fsPath;
  const icon = vscode.Uri.joinPath(context.extensionUri, 'media', 'kablix.ico').fsPath;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: l10n.t('Associating .projix files…') },
    () =>
      new Promise<void>((resolve) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            script,
            '-IconPath',
            icon,
          ],
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
