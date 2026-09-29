import * as vscode from 'vscode';

/**
 * Balise du dictionnaire de traduction de la langue de VS Code, à poser AVANT le
 * script de la page (v2026.9.7.176) : les dictionnaires ne sont plus dans
 * webview.js ni dans analyseur.js, un fichier par langue (esbuild.js). Anglais,
 * ou langue sans dictionnaire : aucune balise, les chaînes sources suffisent.
 * `data-dictionnaire` entre `nonce` et `src` : les bancs qui remplacent la balise
 * `<script nonce src>` de la page par son bundle ne la confondent pas avec elle.
 */
export function scriptDictionnaire(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
  const base = (vscode.env.language ?? 'en').toLowerCase().split(/[-_]/)[0];
  if (!['fr', 'es', 'zh'].includes(base)) return '';
  const uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', `i18n-${base}.js`));
  return `<script nonce="${nonce}" data-dictionnaire src="${uri}"></script>`;
}
