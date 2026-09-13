import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { renderMarkdown, markdownTitle, markdownOutline, type OutlineEntry } from './markdown';
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
// (v2026.7.190) ; elles reçoivent DEUX sources — URI de webview puis `data:` —
// pour que le lecteur ne dépende pas d'une seule voie d'accès (v2026.7.192).

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
          // Script de la page : recherche, sommaire suivi, pliage des sections.
          enableScripts: true,
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
    const media = await resolveMedia(webview, base, guide.text);

    // Le guide porte un sommaire écrit à la main, utile sur GitHub où le
    // Markdown se lit tel quel ; ici il ferait doublon avec le sommaire
    // latéral, qui, lui, ne peut pas dériver. On le retire de l'affichage
    // seulement — le fichier n'est pas touché.
    const texte = stripTocSection(guide.text);
    const body = foldSections(
      renderMarkdown(texte, {
        resolveAsset: (rel) => assets.get(rel) ?? rel,
        resolveDocLink: (rel) => docHref(rel),
        resolveMedia: (rel) => media.get(rel) ?? [assets.get(rel) ?? rel],
      })
    );
    const outline = markdownOutline(texte);
    this.panel.title = guide.title;
    webview.html = pageHtml(webview, guide.lang, guide.title, body, outline);
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
  // `<img>` (icônes calées dans une phrase) et `<video>`/`<source>` (les démos
  // animées, écrites en HTML pour que l'aperçu Markdown de VS Code les lise).
  for (const m of text.matchAll(/<(?:img|video|source)\s+[^>]*?\bsrc\s*=\s*"([^"]*)"/gi)) {
    rels.add(decodeURIComponent(m[1]));
  }

  const out = new Map<string, string>();
  const root = extensionUri.path.replace(/\/$/, '');
  await Promise.all(
    [...rels].map(async (rel) => {
      if (/^https?:/i.test(rel)) { out.set(rel, rel); return; }
      const uri = vscode.Uri.joinPath(base, rel);
      try {
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

/**
 * Sources d'une démo animée, dans l'ordre où le lecteur les essaiera :
 *  1. l'URI de webview — la voie normale, celle qu'utilise l'aperçu vidéo de
 *     VS Code, et la seule qui n'alourdit pas la page ;
 *  2. le même fichier en `data:` — repli si la première reste muette, ce qui
 *     s'est produit en v2026.7.190 (lecteur affiché mais inerte).
 * Une vidéo absente du paquet n'a aucune source locale : elle retombe sur
 * l'URL raw de `resolveAssets`.
 */
async function resolveMedia(
  webview: vscode.Webview,
  base: vscode.Uri,
  text: string
): Promise<Map<string, string[]>> {
  const rels = new Set<string>();
  for (const m of text.matchAll(/<(?:video|source)\s+[^>]*?\bsrc\s*=\s*"([^"]*)"/gi)) {
    rels.add(decodeURIComponent(m[1]));
  }
  for (const m of text.matchAll(/!\[[^\]]*\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const rel = decodeURIComponent(m[1].replace(/^<|>$/g, '').trim());
    if (VIDEO_EXT.test(rel)) rels.add(rel);
  }

  const out = new Map<string, string[]>();
  await Promise.all(
    [...rels].map(async (rel) => {
      if (!VIDEO_EXT.test(rel) || /^https?:/i.test(rel)) return;
      const uri = vscode.Uri.joinPath(base, rel);
      try {
        out.set(rel, [webview.asWebviewUri(uri).toString(), await dataUri(uri)]);
      } catch {
        // Absente du paquet : `resolveAssets` fournira l'URL du dépôt.
      }
    })
  );
  return out;
}

/**
 * Retire du Markdown la section « Sommaire » écrite à la main (et son
 * équivalent anglais), du titre jusqu'au titre `##` suivant. Elle reste dans le
 * fichier — c'est le sommaire que voit un lecteur sur GitHub — mais le panneau
 * d'aide a le sien, généré, qui ne peut pas oublier une section.
 */
function stripTocSection(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^##\s+(sommaire|contents|table of contents)\s*$/i.test(l));
  if (start < 0) return src;
  let end = start + 1;
  while (end < lines.length && !/^##\s+/.test(lines[end])) end++;
  // Le `---` qui ferme souvent le sommaire part avec lui, sinon deux traits se
  // suivraient en tête de page.
  while (end > start + 1 && /^\s*(-{3,}|\*{3,})\s*$/.test(lines[end - 1])) end--;
  lines.splice(start, end - start);
  return lines.join('\n');
}

/**
 * Enveloppe chaque section de niveau 2 dans un `<details>` ouvert : le lecteur
 * voit tout par défaut, mais peut replier ce qui ne l'intéresse pas et garder
 * une vue d'ensemble. Le titre devient le `<summary>` — il garde son `id`, donc
 * les ancres du sommaire et les liens `#section` continuent de tomber juste.
 *
 * Repliable, pas replié : une section fermée n'est pas cherchable par le
 * navigateur et casserait le saut vers une ancre.
 */
function foldSections(html: string): string {
  const parts = html.split(/(?=<h2 )/);
  if (parts.length < 2) return html;
  const out: string[] = [];
  for (const part of parts) {
    const m = part.match(/^<h2 id="([^"]*)">([\s\S]*?)<\/h2>/);
    if (!m) {
      // Le préambule (titre du document, logo, renvoi vers l'autre langue) n'est
      // pas une section, mais il doit s'effacer avec elles pendant une recherche :
      // sinon le résultat se retrouve poussé sous 800 px de logo.
      out.push(`<div class="preambule">${part}</div>`);
      continue;
    }
    const reste = part.slice(m[0].length);
    out.push(
      `<details class="section" open><summary><h2 id="${m[1]}">${m[2]}</h2></summary>` +
      `<div class="section__body">${reste}</div></details>`
    );
  }
  return out.join('\n');
}

/** Sommaire latéral : les titres du document, `###` en retrait sous leur `##`. */
function outlineHtml(outline: OutlineEntry[], label: string): string {
  if (outline.length === 0) return '';
  const items = outline
    .map((e) => `<li class="toc__item toc__item--h${e.level}">` +
      `<a href="#${e.id}" data-anchor="${e.id}">${escapeHtml(e.text)}</a></li>`)
    .join('');
  return `<nav class="toc" aria-label="${escapeHtml(label)}"><ol class="toc__list">${items}</ol></nav>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pageHtml(
  webview: vscode.Webview,
  lang: string,
  title: string,
  body: string,
  outline: OutlineEntry[]
): string {
  const nonce = randomBytes(24).toString('base64');
  // `https:` : les captures lourdes restées hors du vsix viennent du dépôt.
  // `media-src` : les 3 démos WebM du guide, embarquées (v2026.7.190) et
  // servies en `data:` (v2026.7.191) ; `https:` couvre le repli GitHub si une
  // vidéo venait à sortir du paquet.
  // `script-src` : le seul script de la page est celui du sommaire et de la
  // recherche, écrit ici, servi sous nonce — aucune ressource extérieure.
  const csp = [
    `default-src 'none'`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} https: data:`,
    `media-src ${webview.cspSource} https: data:`,
  ].join('; ');
  const lToc = vscode.l10n.t('Contents');
  const lSearch = vscode.l10n.t('Search the guide');
  const lNoHit = vscode.l10n.t('Nothing found');
  const lFoldAll = vscode.l10n.t('Collapse all');
  const lUnfoldAll = vscode.l10n.t('Expand all');

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
    /* Deux colonnes : le sommaire à gauche, collant, et le guide à droite.
       Sous 900 px (panneau étroit, écran partagé) le sommaire passe au-dessus
       du texte et cesse de coller — une colonne de 15 rem y mangerait tout. */
    .page {
      display: grid;
      grid-template-columns: 16rem minmax(0, 52rem);
      gap: 2.5rem;
      justify-content: center;
      align-items: start;
    }
    @media (max-width: 900px) {
      .page { grid-template-columns: minmax(0, 1fr); gap: 0.5rem; }
      .toc-col { position: static !important; max-height: none !important; }
    }
    .toc-col {
      position: sticky;
      top: 0;
      max-height: 100vh;
      overflow-y: auto;
      padding: 1.5rem 1.2rem 2rem 0;
      border-right: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      font-size: 0.95em;
    }
    @media (max-width: 900px) {
      .toc-col {
        border-right: none;
        border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
        padding-right: 0;
      }
    }
    .toc__list { list-style: none; margin: 0.4rem 0 0; padding: 0; }
    .toc__item a {
      display: block;
      padding: 0.18rem 0.5rem;
      border-left: 2px solid transparent;
      border-radius: 0 3px 3px 0;
      color: var(--vscode-foreground);
      opacity: 0.8;
    }
    .toc__item a:hover {
      background: var(--vscode-list-hoverBackground, rgba(128,128,128,.15));
      text-decoration: none;
      opacity: 1;
    }
    .toc__item--h3 a { padding-left: 1.5rem; font-size: 0.94em; }
    /* Section en cours de lecture : c'est le seul repère de position dans un
       guide long, le sommaire ne défilant pas avec le texte. */
    .toc__item--courant > a {
      border-left-color: var(--vscode-textLink-foreground);
      background: var(--vscode-list-inactiveSelectionBackground, rgba(128,128,128,.12));
      opacity: 1;
      font-weight: 600;
    }
    .toc__outils { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
    .toc__outils button {
      flex: 1;
      font: inherit;
      font-size: 0.9em;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.15));
      border: none;
      border-radius: 3px;
      padding: 0.25rem 0.4rem;
      cursor: pointer;
    }
    .toc__outils button:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.28)); }
    .recherche {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,.4));
      border-radius: 3px;
      padding: 0.3rem 0.5rem;
    }
    .recherche:focus { outline: 1px solid var(--vscode-focusBorder); }
    .toc__vide { padding: 0.4rem 0.5rem; opacity: 0.7; font-style: italic; }
    /* Sections repliables : le triangle remplace la puce, le titre reste un h2
       (donc son ancre et sa taille ne changent pas). */
    details.section > summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      margin: 2.2rem 0 0.5rem;
      padding-top: 0.4rem;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
    }
    details.section > summary::-webkit-details-marker { display: none; }
    details.section > summary::before {
      content: '▾';
      /* Largeur fixe et centrage : le glyphe pivote sur lui-même et les titres
         restent alignés qu'ils soient ouverts ou fermés. */
      flex: 0 0 1em;
      text-align: center;
      font-size: 1rem;
      line-height: 1;
      opacity: 0.6;
      transition: transform 0.12s;
    }
    details.section:not([open]) > summary::before { transform: rotate(-90deg); }
    details.section > summary:hover::before { opacity: 1; }
    /* Le titre garde sa taille mais rend sa marge et son trait au summary :
       sinon la bordure passerait à l'intérieur, à droite du triangle. */
    details.section > summary h2 { margin: 0; border: none; padding: 0; }
    .toc__titre {
      margin: 0 0 0.5rem;
      font-size: 0.95em;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.65;
    }
    /* Résultat de recherche : ce qui ne correspond pas disparaît. */
    .hors-filtre { display: none !important; }
    mark {
      background: var(--vscode-editor-findMatchHighlightBackground, rgba(255,220,0,.4));
      color: inherit;
      border-radius: 2px;
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
  <div class="page">
    <aside class="toc-col">
      <p class="toc__titre">${escapeHtml(lToc)}</p>
      <input class="recherche" type="search" id="recherche" placeholder="${escapeHtml(lSearch)}"
        aria-label="${escapeHtml(lSearch)}" autocomplete="off" />
      <div class="toc__outils">
        <button type="button" id="tout-replier">${escapeHtml(lFoldAll)}</button>
        <button type="button" id="tout-deplier">${escapeHtml(lUnfoldAll)}</button>
      </div>
      ${outlineHtml(outline, lToc)}
      <p class="toc__vide" id="toc-vide" hidden>${escapeHtml(lNoHit)}</p>
    </aside>
    <div class="wrap">
${body}
    </div>
  </div>
  <script nonce="${nonce}">
${guideScript()}
  </script>
</body>
</html>`;
}

/**
 * Script du panneau d'aide : suivi de la section lue, recherche, pliage.
 * Écrit à la main (pas de dépendance) et servi sous nonce.
 */
function guideScript(): string {
  return /* js */ `
(() => {
  const liens = [...document.querySelectorAll('.toc__item a')];
  const sections = [...document.querySelectorAll('details.section')];
  const parLien = new Map(liens.map((a) => [a.dataset.anchor, a.parentElement]));

  // --- Section en cours de lecture -------------------------------------------
  // Le titre RETENU est le dernier passé au-dessus du tiers haut de la fenêtre :
  // prendre « le premier visible » sauterait en arrière dès qu'une image longue
  // occupe l'écran. La liste se relit à chaque passage — la recherche
  // reconstruit le corps des sections, donc les h3 d'avant sont morts.
  let courant = null;
  const suivre = () => {
    const limite = window.innerHeight / 3;
    let vu = null;
    let premier = null;
    for (const h of document.querySelectorAll('h2[id], h3[id]')) {
      // Un titre caché (section repliée ou hors filtre) mesure 0 partout.
      if (!h.getClientRects().length) continue;
      if (!premier) premier = h;
      if (h.getBoundingClientRect().top > limite) break;
      vu = h;
    }
    // Tout en haut de la page, aucun titre n'a encore passé le seuil : c'est le
    // premier qui est en cours de lecture, pas « aucun ».
    vu = vu || premier;
    if (!vu || vu.id === courant) return;
    courant = vu.id;
    for (const li of parLien.values()) li.classList.remove('toc__item--courant');
    parLien.get(vu.id)?.classList.add('toc__item--courant');
  };
  document.addEventListener('scroll', suivre, { passive: true });
  window.addEventListener('resize', suivre);
  suivre();

  // Un clic dans le sommaire OUVRE la section visée : le saut vers une ancre
  // repliée n'irait nulle part (un <details> fermé ne se mesure pas).
  for (const a of liens) {
    a.addEventListener('click', (e) => {
      const cible = document.getElementById(a.dataset.anchor);
      if (!cible) return;
      cible.closest('details.section')?.setAttribute('open', '');
      e.preventDefault();
      cible.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', '#' + a.dataset.anchor);
      suivre();
    });
  }

  // --- Tout replier / tout déplier -------------------------------------------
  const plier = (ouvert) => { for (const s of sections) s.open = ouvert; suivre(); };
  document.getElementById('tout-replier')?.addEventListener('click', () => plier(false));
  document.getElementById('tout-deplier')?.addEventListener('click', () => plier(true));

  // --- Recherche --------------------------------------------------------------
  // Elle filtre le SOMMAIRE (les titres qui contiennent le mot) et le CORPS
  // (les sections qui en parlent), et surligne les occurrences. Le texte
  // d'origine de chaque section est gardé pour pouvoir rendre la page intacte :
  // surligner détruit le HTML si on le fait sur place sans copie.
  const champ = document.getElementById('recherche');
  const vide = document.getElementById('toc-vide');
  const preambule = document.querySelector('.preambule');
  const corps = sections.map((s) => ({ section: s, html: s.innerHTML }));
  const sansAccent = (s) => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();

  // Le pliage choisi à la main avant une recherche est rendu tel quel après :
  // la recherche ouvre ce qu'elle trouve, elle ne redispose pas la page.
  let plisAvant = null;

  const filtrer = () => {
    const q = sansAccent(champ.value.trim());
    // Remise à plat : on repart toujours du HTML d'origine, jamais d'un
    // surlignage précédent (sinon les <mark> s'empilent).
    for (const { section, html } of corps) if (section.innerHTML !== html) section.innerHTML = html;
    for (const li of parLien.values()) li.classList.remove('hors-filtre');
    for (const s of sections) s.classList.remove('hors-filtre');
    preambule?.classList.remove('hors-filtre');
    vide.hidden = true;

    if (q.length < 2) {
      if (plisAvant) { sections.forEach((s, i) => { s.open = plisAvant[i]; }); plisAvant = null; }
      suivre();
      return;
    }
    if (!plisAvant) plisAvant = sections.map((s) => s.open);
    preambule?.classList.add('hors-filtre');

    let trouves = 0;
    for (const s of sections) {
      const dedans = sansAccent(s.textContent || '').includes(q);
      s.classList.toggle('hors-filtre', !dedans);
      s.open = dedans;
      if (dedans) { trouves++; surligner(s, q); }
    }
    // Le sommaire ne garde que les titres dont la section est restée : c'est la
    // liste des endroits où le mot se trouve, pas un second filtre.
    for (const a of liens) {
      const cible = document.getElementById(a.dataset.anchor);
      const garde = !!cible && !cible.closest('details.section')?.classList.contains('hors-filtre');
      a.parentElement.classList.toggle('hors-filtre', !garde);
    }
    vide.hidden = trouves > 0;
    suivre();
  };

  // Surligne les occurrences dans les nœuds de TEXTE seulement : toucher au
  // HTML casserait les liens, les images et les tableaux.
  const surligner = (racine, q) => {
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    const cibles = [];
    let n;
    while ((n = marcheur.nextNode())) {
      // Les blocs de programme restent intacts : y insérer des <mark> rendrait
      // un exemple illisible. Le <code> en ligne, lui, se surligne.
      if (n.parentElement?.closest('pre, script, style')) continue;
      if (sansAccent(n.nodeValue || '').includes(q)) cibles.push(n);
    }
    for (const noeud of cibles) {
      const brut = noeud.nodeValue || '';
      const plat = sansAccent(brut);
      const frag = document.createDocumentFragment();
      let i = 0;
      for (let p = plat.indexOf(q); p >= 0; p = plat.indexOf(q, i)) {
        frag.append(brut.slice(i, p));
        const m = document.createElement('mark');
        m.textContent = brut.slice(p, p + q.length);
        frag.append(m);
        i = p + q.length;
      }
      frag.append(brut.slice(i));
      noeud.parentNode?.replaceChild(frag, noeud);
    }
  };

  let minuteur = 0;
  champ?.addEventListener('input', () => {
    // Le filtre reconstruit des sections entières : on attend une pause de
    // frappe plutôt que de le refaire à chaque touche.
    clearTimeout(minuteur);
    minuteur = setTimeout(filtrer, 140);
  });
  champ?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && champ.value) { champ.value = ''; filtrer(); }
  });
})();
`;
}
