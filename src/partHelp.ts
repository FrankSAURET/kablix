import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { renderMarkdown, markdownTitle } from './markdown';

// Aide LOCALE d'un composant (bouton « ? » de l'inspecteur), rendue dans une
// webview Kablix plutôt que dans l'aperçu Markdown de VS Code.
//
// L'aperçu de VS Code limite ses ressources locales au dossier du document :
// les images des fiches, mutualisées dans `docs/img/composants/` et atteintes
// par `../../img/…`, étaient donc bloquées dès que l'extension tournait depuis
// un .vsix installé (fiche hors du workspace) — l'aide s'affichait sans aucune
// illustration. Ici, `localResourceRoots` couvre tout `docs/`, et les chemins
// d'images sont réécrits en URI de webview : les fiches restent hors-ligne, à un
// seul exemplaire, et illustrées.

/** Commande interne : navigation d'une fiche à l'autre (liens `[texte](led.md)`). */
export const SHOW_PART_HELP = 'kablix.showPartHelp';

/** Langue des fiches selon VS Code (repli français : toutes les fiches existent en FR). */
export function docLang(): 'fr' | 'en' {
  return (vscode.env.language ?? 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
}

/**
 * Fiche embarquée dans un .kompix : le Markdown vient du paquet, et ses
 * illustrations avec lui, en data: URI (aucun fichier sur le disque à autoriser).
 */
export interface EmbeddedSheet {
  lang: string;
  text: string;
  /** Nom du fichier tel qu'écrit dans le Markdown → data: URI. */
  assets: Map<string, string>;
}

/**
 * Ce qu'il faut d'une bibliothèque .kompix pour en tirer une fiche — juste ces
 * deux méthodes, pour que l'aide ne dépende pas du module de bibliothèque
 * (`SimulatorPanel.library`, non typé, la fournit telle quelle).
 */
export interface EmbeddedHelpSource {
  readHelp?(type: string, lang: string): Promise<EmbeddedSheet | undefined>;
}

/**
 * Ouvre l'aide d'un composant, quelle que soit sa provenance : fiche livrée
 * dans `docs/` pour un composant intégré, fiche embarquée dans le .kompix pour
 * un composant de bibliothèque. Retourne false si aucune des deux n'existe.
 */
export async function showPartHelp(
  extensionUri: vscode.Uri,
  type: string,
  library?: EmbeddedHelpSource
): Promise<boolean> {
  if (await PartHelpPanel.show(extensionUri, type)) return true;
  const sheet = await library?.readHelp?.(type, docLang());
  if (!sheet) return false;
  PartHelpPanel.showEmbedded(extensionUri, type, sheet);
  return true;
}

export class PartHelpPanel {
  public static readonly viewType = 'kablix.partHelp';
  private static current: PartHelpPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  /**
   * Ouvre (ou réutilise) le panneau d'aide sur la fiche d'un composant.
   * Renvoie `false` si aucune fiche n'existe pour ce type, dans aucune langue.
   */
  public static async show(extensionUri: vscode.Uri, type: string): Promise<boolean> {
    const found = await readSheet(extensionUri, type);
    if (!found) return false;
    PartHelpPanel.open(extensionUri, found);
    return true;
  }

  /**
   * Ouvre le panneau sur la fiche EMBARQUÉE d'un composant de bibliothèque.
   * Même panneau, même rendu que les fiches livrées dans `docs/` : seule change
   * la provenance des images (data: URI du paquet au lieu d'URI de webview).
   */
  public static showEmbedded(extensionUri: vscode.Uri, type: string, sheet: EmbeddedSheet): void {
    PartHelpPanel.open(extensionUri, {
      lang: sheet.lang === 'en' ? 'en' : 'fr',
      title: markdownTitle(sheet.text) ?? type,
      text: sheet.text,
      assets: sheet.assets,
    });
  }

  /** Crée (ou réutilise) le panneau et y rend la fiche. */
  private static open(extensionUri: vscode.Uri, found: Sheet): void {

    if (!PartHelpPanel.current) {
      const panel = vscode.window.createWebviewPanel(
        PartHelpPanel.viewType,
        found.title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: false,
          // Navigation entre fiches par lien : seule cette commande est permise.
          enableCommandUris: [SHOW_PART_HELP],
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'docs')],
          retainContextWhenHidden: false,
        }
      );
      PartHelpPanel.current = new PartHelpPanel(panel, extensionUri);
    }
    PartHelpPanel.current.render(found);
    PartHelpPanel.current.panel.reveal(undefined, true);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);
  }

  private render(sheet: Sheet): void {
    const webview = this.panel.webview;
    const docsDir = vscode.Uri.joinPath(this.extensionUri, 'docs', sheet.lang, 'composants');
    const body = renderMarkdown(sheet.text, {
      // Chemin relatif à la fiche → URI de webview (les images vivent dans
      // docs/img/composants/, deux niveaux au-dessus de la fiche). Fiche
      // embarquée : l'image est DANS le paquet, déjà en data: URI.
      resolveAsset: (rel) =>
        sheet.assets?.get(rel.replace(/^\.\//, '')) ??
        (sheet.assets ? '' : webview.asWebviewUri(vscode.Uri.joinPath(docsDir, rel)).toString()),
      // Lien vers une autre fiche : on rouvre le panneau sur ce composant.
      resolveDocLink: (rel) => {
        const m = rel.match(/([^/\\]+)\.md$/i);
        if (!m) return '';
        return `command:${SHOW_PART_HELP}?${encodeURIComponent(JSON.stringify([m[1]]))}`;
      },
    });
    this.panel.title = sheet.title;
    webview.html = pageHtml(webview, sheet.lang, sheet.title, body);
  }

  private onDispose(): void {
    PartHelpPanel.current = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

interface Sheet {
  lang: 'fr' | 'en';
  title: string;
  text: string;
  /** Fiche embarquée dans un .kompix : ses images voyagent avec elle. */
  assets?: Map<string, string>;
}

/** Fiche du composant dans la langue de VS Code, sinon en français. */
async function readSheet(extensionUri: vscode.Uri, type: string): Promise<Sheet | undefined> {
  const langs: ('fr' | 'en')[] = docLang() === 'en' ? ['en', 'fr'] : ['fr'];
  for (const lang of langs) {
    const uri = vscode.Uri.joinPath(extensionUri, 'docs', lang, 'composants', `${type}.md`);
    try {
      const text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
      return { lang, title: markdownTitle(text) ?? type, text };
    } catch {
      // Fiche absente dans cette langue : on tente la suivante (repli FR).
    }
  }
  return undefined;
}

function pageHtml(webview: vscode.Webview, lang: string, title: string, body: string): string {
  const nonce = randomBytes(24).toString('base64');
  // `media-src` : une fiche peut illustrer un composant par une démo WebM.
  // `data:` y est admis aussi — la fiche d'un composant de bibliothèque porte
  // ses illustrations DANS son paquet, il n'y a pas de fichier sur le disque.
  const csp = [
    `default-src 'none'`,
    `style-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    `media-src ${webview.cspSource} data:`,
  ].join('; ');

  return /* html */ `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.55;
      margin: 0;
      padding: 0 1.5rem 3rem;
    }
    .wrap { max-width: 46rem; margin: 0 auto; }
    h1 { font-size: 1.6rem; margin: 1.4rem 0 0.4rem; }
    h2 {
      font-size: 1.2rem;
      margin: 1.9rem 0 0.5rem;
      padding-top: 0.4rem;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
    }
    h3 { font-size: 1.03rem; margin: 1.2rem 0 0.3rem; }
    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
    figure { margin: 1rem 0; text-align: center; }
    img, video { max-width: 100%; height: auto; }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
      border-radius: 3px;
      padding: 0.05em 0.35em;
      font-size: 0.92em;
    }
    pre {
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      border-radius: 4px;
      padding: 0.7rem 1rem;
      overflow: auto;
      font-size: 0.88em;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.08));
      border-left: 3px solid var(--vscode-textLink-foreground);
      border-radius: 4px;
      margin: 0.9rem 0;
      padding: 0.5rem 1rem;
    }
    table { border-collapse: collapse; margin: 0.8rem 0; width: 100%; }
    th, td {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
      padding: 0.3rem 0.6rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.12)); }
    hr { border: none; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3)); margin: 1.8rem 0; }
    ul, ol { padding-left: 1.4rem; }
    li { margin: 0.2rem 0; }
  </style>
</head>
<body>
  <div class="wrap">
${body}
  </div>
</body>
</html>`;
}
