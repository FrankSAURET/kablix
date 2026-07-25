// Rendu Markdown → HTML minimal, pour l'aide LOCALE des composants.
//
// Pourquoi ne pas utiliser l'aperçu Markdown de VS Code ? Il restreint ses
// ressources locales au DOSSIER du document (localResourceRoots) : une image
// atteinte par `../../img/composants/x.png` est bloquée dès que la fiche n'est
// pas dans le workspace ouvert — c'est-à-dire toujours, quand l'extension est
// installée depuis un .vsix. Les fiches s'affichaient alors sans leurs images.
// On rend donc le Markdown nous-mêmes, dans une webview dont on maîtrise les
// racines autorisées (cf. partHelp.ts).
//
// La syntaxe couverte est celle RÉELLEMENT employée par les fiches
// `docs/<lang>/composants/*.md` : titres, paragraphes, images, liens, listes à
// puces et numérotées, tableaux (avec alignement), citations, blocs de code,
// séparateurs, gras/italique/code en ligne.

export interface MarkdownOptions {
  /** Chemin relatif d'une image → URI affichable par la webview. */
  resolveAsset: (relPath: string) => string;
  /** Chemin relatif d'une autre fiche (`led.md`) → href de navigation. */
  resolveDocLink: (relPath: string) => string;
}

/** Échappe le texte destiné au HTML (le Markdown des fiches n'a pas de HTML brut). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Cible d'un lien Markdown : `<a b>` (espaces autorisés) ou `a b`. */
function linkTarget(raw: string): string {
  return raw.trim().replace(/^<|>$/g, '');
}

/** Ancre stable pour un titre (accents retirés), pour les liens `#section`. */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^\x20-\x7e]/g, '') // NFD a détaché les accents : on ne garde que l'ASCII
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Rendu des marques EN LIGNE : code, images, liens, gras, italique. */
function inline(src: string, opt: MarkdownOptions): string {
  // Le code en ligne est mis de côté AVANT tout le reste : son contenu ne doit
  // subir ni le gras ni l'italique (`**` littéral dans un exemple de code).
  const codes: string[] = [];
  // Sentinelle : caractère de contrôle absent des fiches, neutre pour esc().
  const MARK = '\u0001';
  let out = src.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${esc(code)}</code>`);
    return `${MARK}${codes.length - 1}${MARK}`;
  });

  out = esc(out);

  // Image ![alt](src) — avant les liens (même syntaxe, préfixée de `!`).
  out = out.replace(/!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)\)/g, (_m, alt: string, raw: string) => {
    const src2 = opt.resolveAsset(decodeURIComponent(linkTarget(raw)));
    return `<img src="${src2}" alt="${alt}" />`;
  });

  // Lien [texte](cible) : externe (http/mailto), ancre (#), ou autre fiche (.md).
  out = out.replace(/\[([^\]]+)\]\((<[^>]+>|[^)\s]+)\)/g, (_m, text: string, raw: string) => {
    const target = linkTarget(raw);
    if (/^(https?:|mailto:)/i.test(target)) return `<a href="${target}">${text}</a>`;
    if (target.startsWith('#')) return `<a href="${target}">${text}</a>`;
    const href = opt.resolveDocLink(decodeURIComponent(target));
    return href ? `<a href="${href}">${text}</a>` : text;
  });

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return out.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => codes[Number(i)]);
}

/** Une ligne de tableau `| a | b |` → cellules (bords vides retirés). */
function cells(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

/** Alignements déduits de la ligne de séparation `|:---:|---|`. */
function alignments(line: string): (string | null)[] {
  return cells(line).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

const isTableSep = (line: string): boolean => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/**
 * Convertit une fiche Markdown en HTML. Le résultat est inséré tel quel dans la
 * webview d'aide (aucun script, styles fournis par partHelp.ts).
 */
export function renderMarkdown(src: string, opt: MarkdownOptions): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  // Un paragraphe = lignes consécutives non vides ; les fiches coupent leurs
  // phrases à 80 colonnes, il faut donc les recoller.
  const paragraph = (buf: string[]): void => {
    if (buf.length) html.push(`<p>${inline(buf.join(' '), opt)}</p>`);
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Bloc de code ``` … ```
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++; // ferme la clôture
      html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    // Ligne vide
    if (!line.trim()) { i++; continue; }

    // Séparateur horizontal (--- seul, à ne pas confondre avec un tableau)
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html.push('<hr />'); i++; continue; }

    // Titre
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      html.push(`<h${level} id="${slug(text)}">${inline(text, opt)}</h${level}>`);
      i++;
      continue;
    }

    // Tableau : ligne d'en-tête suivie d'une ligne de séparation
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const align = alignments(lines[i + 1]);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) body.push(cells(lines[i++]));
      const td = (c: string, n: number, tag: 'th' | 'td') =>
        `<${tag}${align[n] ? ` style="text-align:${align[n]}"` : ''}>${inline(c, opt)}</${tag}>`;
      html.push(
        '<table><thead><tr>' + head.map((c, n) => td(c, n, 'th')).join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + r.map((c, n) => td(c, n, 'td')).join('') + '</tr>').join('') +
        '</tbody></table>'
      );
      continue;
    }

    // Citation `>` (lignes consécutives recollées)
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${inline(quote.join(' '), opt)}</blockquote>`);
      continue;
    }

    // Liste à puces ou numérotée. Une puce peut courir sur plusieurs lignes :
    // les lignes suivantes indentées appartiennent au même item.
    const bullet = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const ordered = /\d/.test(bullet[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (m) { items.push(m[3]); i++; continue; }
        // Continuation : ligne indentée non vide qui suit une puce.
        if (items.length && /^\s+\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>` + items.map((it) => `<li>${inline(it, opt)}</li>`).join('') + `</${tag}>`);
      continue;
    }

    // Paragraphe : une image seule reste hors <p> (bloc à part entière).
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|>|```|[-*+]\s|\d+\.\s)/.test(lines[i])
      && !/^\s*(-{3,}|\*{3,})\s*$/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i++].trim());
    }
    const joined = buf.join(' ');
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(joined)) html.push(`<figure>${inline(joined, opt)}</figure>`);
    else paragraph(buf);
  }

  return html.join('\n');
}

/** Titre (premier `# …`) d'une fiche, pour nommer l'onglet. */
export function markdownTitle(src: string): string | undefined {
  const m = src.match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim().replace(/`/g, '') : undefined;
}
