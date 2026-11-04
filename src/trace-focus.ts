import * as vscode from 'vscode';

/**
 * TRACE TEMPORAIRE (v2026.11.1.292) — onglet .projix qui prend et perd le focus,
 * panneau gris (retour de Frank, 04/11/2026). Journalise, avec l'heure à la
 * milliseconde, chaque changement d'onglet, de groupe et d'éditeur actif, plus
 * les appels de Kablix qui déplacent le code. À retirer une fois la cause trouvée.
 */
let canal: vscode.OutputChannel | undefined;
let t0 = 0;

function heure(): string {
  const ms = Date.now() - t0;
  return `+${(ms / 1000).toFixed(3)} s`;
}

function nomOnglet(tab: vscode.Tab): string {
  const actif = tab.isActive ? '*' : '';
  const input = tab.input as { viewType?: string } | undefined;
  const type = input && 'viewType' in input ? ' [kablix]' : '';
  return `${actif}${tab.label}${type}`;
}

/** Photo des groupes : colonne, groupe actif (►), onglets (* = devant). */
export function photoGroupes(): string {
  return vscode.window.tabGroups.all
    .map((g) => `${g.isActive ? '►' : ' '}col ${g.viewColumn} : ${g.tabs.map(nomOnglet).join(', ') || '(vide)'}`)
    .join('\n      ');
}

export function trace(quoi: string, avecPhoto = true): void {
  if (!canal) return;
  canal.appendLine(`${heure()}  ${quoi}`);
  if (avecPhoto) canal.appendLine(`      ${photoGroupes()}`);
}

export function demarrerTraceFocus(context: vscode.ExtensionContext): void {
  canal = vscode.window.createOutputChannel('Kablix — trace focus');
  t0 = Date.now();
  trace('démarrage');
  context.subscriptions.push(
    canal,
    vscode.window.tabGroups.onDidChangeTabs((e) =>
      trace(`onglets : ouverts ${e.opened.length}, fermés ${e.closed.length}, changés ${e.changed.map((t) => t.label).join(', ')}`)
    ),
    vscode.window.tabGroups.onDidChangeTabGroups((e) =>
      trace(`groupes : ouverts ${e.opened.length}, fermés ${e.closed.length}, changés ${e.changed.length}`)
    ),
    vscode.window.onDidChangeActiveTextEditor((ed) =>
      trace(`éditeur de texte actif : ${ed ? ed.document.uri.fsPath.split(/[\\/]/).pop() + ' col ' + ed.viewColumn : '(aucun)'}`, false)
    )
  );
}
