// Suivi Kablix d'UN JOUR, allumé par l'envoi d'un rapport « Signaler un
// problème ».
//
// Le rapport part avec les journaux de VS Code, qui disent peu de chose de ce
// que l'utilisateur a fait dans Kablix. Pendant les 24 h qui suivent un envoi,
// un journal « Kablix — suivi » note donc chaque commande Kablix lancée, sa
// durée et son erreur éventuelle. C'est un LogOutputChannel : VS Code l'écrit
// lui-même dans le dossier des journaux de la session, si bien qu'un second
// rapport l'emporte sans rien faire de plus. Passé le délai, plus rien n'est
// écrit et le canal n'est même plus créé.
import * as vscode from 'vscode';

/** Fin du suivi (horodatage en ms), dans l'état global de l'extension. */
const CLE_FIN = 'kablix.suiviFin';
/** Durée de vie du suivi après un envoi. */
export const DUREE_SUIVI_MS = 24 * 60 * 60 * 1000;

let etat: vscode.Memento | undefined;
let canal: vscode.LogOutputChannel | undefined;

/** À appeler une fois depuis `activate()`. */
export function initialiserSuivi(context: vscode.ExtensionContext): void {
  etat = context.globalState;
  context.subscriptions.push(new vscode.Disposable(() => canal?.dispose()));
  if (suiviActif()) note('Kablix activé');
}

/** Vrai tant que le délai d'un jour n'est pas écoulé. */
export function suiviActif(): boolean {
  const fin = etat?.get<number>(CLE_FIN);
  return typeof fin === 'number' && Date.now() < fin;
}

/** Allume (ou prolonge) le suivi pour 24 h à partir de maintenant. */
export async function allumerSuivi(): Promise<void> {
  await etat?.update(CLE_FIN, Date.now() + DUREE_SUIVI_MS);
  note('Suivi allumé pour 24 h (rapport envoyé)');
}

/** Écrit une ligne si le suivi est actif ; sinon ne fait rien. */
export function note(message: string, erreur?: unknown): void {
  if (!suiviActif()) return;
  canal ??= vscode.window.createOutputChannel('Kablix — suivi', { log: true });
  if (erreur === undefined) canal.info(message);
  else canal.error(`${message} : ${erreur instanceof Error ? erreur.stack ?? erreur.message : String(erreur)}`);
}

/**
 * `vscode.commands.registerCommand` doublé d'une ligne de suivi : nom de la
 * commande, durée, erreur. Hors suivi, le surcoût est un test de date.
 */
export function commande(
  id: string,
  fn: (...args: any[]) => unknown
): vscode.Disposable {
  return vscode.commands.registerCommand(id, async (...args: any[]) => {
    if (!suiviActif()) return fn(...args);
    const debut = Date.now();
    note(`▶ ${id}`);
    try {
      const r = await fn(...args);
      note(`✓ ${id} (${Date.now() - debut} ms)`);
      return r;
    } catch (err) {
      note(`✗ ${id} (${Date.now() - debut} ms)`, err);
      throw err;
    }
  });
}
