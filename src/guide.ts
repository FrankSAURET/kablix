import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { renderMarkdown, markdownTitle } from './markdown';
import { SHOW_PART_HELP } from './partHelp';

// Aide GÉNÉRALE de Kablix (bouton ❔ / commande « Kablix : Aide »).
//
// Elle sert directement le guide utilisateur versionné — `docs/<lang>/USAGE.md`
// — au lieu d'une copie HTML figée dans le code, qui divergeait du guide à
// chaque évolution. Même rendu maison que l'aide des composants (markdown.ts) :
// l'aperçu Markdown de VS Code limite ses ressources locales au dossier du
// document et perdrait toutes les captures.
//
// Les captures qui manquent localement (restées hors du vsix pour ne pas
// alourdir le paquet) sont servies depuis le dépôt GitHub, les autres depuis
// l'extension — donc hors-ligne. Les 3 démos animées sont embarquées en WebM
// (v2026.7.190) et injectées en `data:` dans la page (v2026.7.191).

/** Commande interne : navigation d'un guide à l'autre (liens entre guides). */
export const SHOW_GUIDE = 'kablix.showGuide';

/** Guide ouvert par défaut (bouton ❔). */
export const MAIN_GUIDE = 'USAGE';

/** Base des ressources non embarquées dans le vsix (captures lourdes). */
const RAW_BASE = 'https://raw.githubusercontent.com/FrankSAURET/kablix/main/';

/** Démos animées du guide : traitées à part (cf. resolveAssets). */
const VIDEO_EXT = /\.(webm|mp4)$/i;

/** Fichier local → `data:` (MIME + octets dans la page, aucune requête). */
async function dataUri(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const mime = /\.mp4$/i.test(uri.path) ? 'video/mp4' : 'video/webm';
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Langue des guides selon VS Code (repli anglais). */
function docLang(): 'fr' | 'en' {
  return (vscode.env.language ?? 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export class GuidePanel {
  public static readonly viewType = 'kablix.guide';
  private static current: GuidePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  /**
   * Ouvre (ou réutilise) le panneau d'aide sur un guide. `name` est le nom du
   * fichier sans extension, dans `docs/<lang>/`. Renvoie `false` si le guide
   * n'existe dans aucune langue.
   */
  public static async show(extensionUri: vscode.Uri, name = MAIN_GUIDE): Promise<boolean> {
    const found = await readGuide(extensionUri, name);
    if (!found) return false;

    if (!GuidePanel.current) {
      const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
      const panel = vscode.window.createWebviewPanel(
        GuidePanel.viewType,
        found.title,
        column,
        {
          enableScripts: false,
          // Navigation entre guides et vers les fiches de composants.
          enableCommandUris: [SHOW_GUIDE, SHOW_PART_HELP],
          localResourceRoots: [extensionUri],
          retainContextWhenHidden: true,
        }
      );
      GuidePanel.current = new GuidePanel(panel, extensionUri);
    }
    await GuidePanel.current.render(found);
    GuidePanel.current.panel.reveal();
    return true;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.onDidDispose(() => this.onDispose(), null, this.disposables);
  }

  private async render(guide: Guide): Promise<void> {
    const webview = this.panel.webview;
    const base = vscode.Uri.joinPath(this.extensionUri, 'docs', guide.lang);
    const assets = await resolveAssets(webview, this.extensionUri, base, guide.text);

    const body = renderMarkdown(guide.text, {
      resolveAsset: (rel) => assets.get(rel) ?? rel,
      resolveDocLink: (rel) => docHref(rel),
    });
    this.panel.title = guide.title;
    webview.html = pageHtml(webview, guide.lang, guide.title, body);
  }

  private onDispose(): void {
    GuidePanel.current = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

interface Guide {
  lang: 'fr' | 'en';
  title: string;
  text: string;
}

/** Guide dans la langue de VS Code, sinon dans l'autre langue. */
async function readGuide(extensionUri: vscode.Uri, name: string): Promise<Guide | undefined> {
  const first = docLang();
  const langs: ('fr' | 'en')[] = first === 'fr' ? ['fr', 'en'] : ['en', 'fr'];
  for (const lang of langs) {
    const uri = vscode.Uri.joinPath(extensionUri, 'docs', lang, `${name}.md`);
    try {
      const text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
      return { lang, title: markdownTitle(text) ?? name, text };
    } catch {
      // Guide absent dans cette langue : on tente l'autre.
    }
  }
  return undefined;
}

/**
 * Lien `[texte](cible.md)` d'un guide → navigation interne. Une fiche de
 * composant (`composants/led.md`) rouvre l'aide des composants, un autre guide
 * rouvre ce panneau ; tout le reste (fichier non servi) est neutralisé.
 */
function docHref(rel: string): string {
  const clean = rel.split('#')[0].replace(/\\/g, '/');
  const part = clean.match(/^composants\/([a-z0-9-]+)\.md$/i);
  if (part) return commandUri(SHOW_PART_HELP, part[1]);
  const guide = clean.match(/^([A-Za-z0-9_-]+)\.md$/);
  if (guide) return commandUri(SHOW_GUIDE, guide[1]);
  return '';
}

function commandUri(command: string, arg: string): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify([arg]))}`;
}

/**
 * URI d'affichage de chaque image (ou vidéo) du guide. Un fichier PRÉSENT dans
 * l'extension est servi en local (hors-ligne) — c'est le cas des 3 démos WebM
 * depuis la v2026.7.190 ; un fichier sorti du vsix pour l'alléger est servi
 * depuis le dépôt GitHub.
 */
async function resolveAssets(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  base: vscode.Uri,
  text: string
): Promise<Map<string, string>> {
  const rels = new Set<string>();
  for (const m of text.matchAll(/!\[[^\]]*\]\((<[^>]+>|[^)\s]+)\)/g)) {
    rels.add(decodeURIComponent(m[1].replace(/^<|>$/g, '').trim()));
  }
  for (const m of text.matchAll(/<img\s+[^>]*?\bsrc\s*=\s*"([^"]*)"/gi)) {
    rels.add(decodeURIComponent(m[1]));
  }

  const out = new Map<string, string>();
  const root = extensionUri.path.replace(/\/$/, '');
  await Promise.all(
    [...rels].map(async (rel) => {
      if (/^https?:/i.test(rel)) { out.set(rel, rel); return; }
      const uri = vscode.Uri.joinPath(base, rel);
      try {
        // Vidéo : servie EN DUR dans la page (data:). Derrière l'URI de webview
        // le lecteur restait inerte — le média y arrive sans type annoncé et
        // sans requêtes de plage. Un data: porte son MIME et tout l'octet-stream,
        // et les 3 démos ne pèsent que 1,2 Mo à elles trois (v2026.7.191).
        if (VIDEO_EXT.test(rel)) { out.set(rel, await dataUri(uri)); return; }
        await vscode.workspace.fs.stat(uri);
        out.set(rel, webview.asWebviewUri(uri).toString());
      } catch {
        // Absente du paquet : chemin relatif à la racine du dépôt → URL raw.
        const inRepo = uri.path.startsWith(root + '/') ? uri.path.slice(root.length + 1) : '';
        out.set(rel, inRepo ? RAW_BASE + inRepo.split('/').map(encodeURIComponent).join('/') : '');
      }
    })
  );
  return out;
}

function pageHtml(webview: vscode.Webview, lang: string, title: string, body: string): string {
  const nonce = randomBytes(24).toString('base64');
  // `https:` : les captures lourdes restées hors du vsix viennent du dépôt.
  // `media-src` : les 3 démos WebM du guide, embarquées (v2026.7.190) et
  // servies en `data:` (v2026.7.191) ; `https:` couvre le repli GitHub si une
  // vidéo venait à sortir du paquet.
  const csp = [
    `default-src 'none'`,
    `style-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} https: data:`,
    `media-src ${webview.cspSource} https: data:`,
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
      padding: 0 1.5rem 4rem;
    }
    .wrap { max-width: 52rem; margin: 0 auto; }
    h1 { font-size: 1.7rem; margin: 1.5rem 0 0.3rem; }
    h2 {
      font-size: 1.25rem;
      margin: 2.2rem 0 0.5rem;
      padding-top: 0.4rem;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
    }
    h3 { font-size: 1.05rem; margin: 1.3rem 0 0.3rem; }
    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
    figure { margin: 1rem 0; text-align: center; }
    img, video { max-width: 100%; height: auto; vertical-align: middle; }
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
      padding: 0.8rem 1rem;
      overflow: auto;
      font-size: 0.88em;
      line-height: 1.45;
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
