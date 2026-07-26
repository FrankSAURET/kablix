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
// séparateurs, gras/italique/code en ligne. Les démos animées des guides sont
// écrites en `<video src="…">` HTML — pas en `![…](…)` — pour que l'APERÇU
// Markdown de VS Code les lise aussi ; le `src` est remplacé ici par une
// `<source>` par voie d'accès (cf. resolveMedia). Une « image » qui pointe un
// `.webm` sort quand même en `<video>`, la syntaxe restant admise.

export interface MarkdownOptions {
  /** Chemin relatif d'une image → URI affichable par la webview. */
  resolveAsset: (relPath: string) => string;
  /** Chemin relatif d'une autre fiche (`led.md`) → href de navigation. */
  resolveDocLink: (relPath: string) => string;
  /**
   * Chemin relatif d'une vidéo → une source PAR VOIE d'accès, la plus sûre
   * d'abord. Le lecteur essaie les `<source>` dans l'ordre et s'arrête à la
   * première qui charge : si l'URI de webview reste muette (ce qui est arrivé
   * en v2026.7.190), le `data:` de repli prend le relais tout seul.
   */
  resolveMedia?: (relPath: string) => string[];
}

/** Échappe le texte destiné au HTML (le Markdown des fiches n'a pas de HTML brut). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Cible d'un lien Markdown : `<a b>` (chevrons obligatoires si le chemin
 * contient une espace) ou `a`. Les liens sont traités APRÈS `esc()`, d'où la
 * forme échappée `&lt;…&gt;`.
 */
function linkTarget(raw: string): string {
  return raw.trim().replace(/^(<|&lt;)/, '').replace(/(>|&gt;)$/, '');
}

/** Cible d'un lien, échappée ou non — `&lt;chemin avec espaces&gt;` compris. */
const TARGET = String.raw`(&lt;[^)]*?&gt;|<[^>]+>|[^)\s]+)`;

/** Cibles rendues en `<video>` et non en `<img>` (démos des guides). */
const VIDEO = /\.(webm|mp4)$/i;

/** Type MIME déclaré à la `<source>` — le démuxeur ne le devine pas toujours. */
const videoMime = (target: string): string =>
  /\.mp4$/i.test(target) ? 'video/mp4' : 'video/webm';

/** `<source>` d'une démo : une par voie d'accès, la plus sûre d'abord. */
function videoSources(target: string, opt: MarkdownOptions): string {
  const urls = opt.resolveMedia?.(target) ?? [opt.resolveAsset(target)];
  const mime = videoMime(target);
  return urls.filter(Boolean).map((u) => `<source src="${u}" type="${mime}" />`).join('');
}

/**
 * Ancre d'un titre, pour les liens `#section`. Mêmes règles que GitHub — la
 * ponctuation est SUPPRIMÉE (et non remplacée par un tiret) puis les espaces
 * deviennent des tirets — pour que les sommaires écrits à la main dans les
 * guides (`#linterface`, `#enregistrer--ouvrir-un-projet-projix`) tombent bien
 * sur leur titre. Les accents sont retirés des deux côtés, donc cohérents.
 */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^\x20-\x7e]/g, '') // NFD a détaché les accents : on ne garde que l'ASCII
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/ /g, '-');
}

/** Rendu des marques EN LIGNE : code, images, liens, gras, italique. */
function inline(src: string, opt: MarkdownOptions): string {
  // Le code en ligne et les <img> bruts sont mis de côté AVANT tout le reste :
  // le code ne doit subir ni gras ni italique (`**` littéral dans un exemple de
  // code), et la balise <img> ne doit pas être échappée.
  const codes: string[] = [];
  // Sentinelle : caractère de contrôle absent des fiches, neutre pour esc().
  const MARK = '\u0001';
  const keep = (html: string): string => {
    codes.push(html);
    return `${MARK}${codes.length - 1}${MARK}`;
  };

  let out = src.replace(/`([^`]+)`/g, (_m, code: string) => keep(`<code>${esc(code)}</code>`));

  // `<img src="…" width="30" />` brut : les guides s'en servent pour caler une
  // icône DANS une phrase (le Markdown ne sait pas dimensionner une image).
  // `<video src="…">` / `<source src="…">` : les démos animées. Elles sont
  // écrites en HTML dans les guides — pas en `![…](…)` — pour que l'APERÇU
  // Markdown de VS Code les lise lui aussi (une image n'affiche pas un WebM).
  out = out.replace(/<(img|video|source)\s+([^>]*?)\/?>/gi, (m, tag: string, attrs: string) => {
    const srcAttr = attrs.match(/\bsrc\s*=\s*"([^"]*)"/i);
    if (!srcAttr) return m;
    const target = decodeURIComponent(srcAttr[1]);
    const t = tag.toLowerCase();
    // Vidéo : `src` retiré et remplacé par des `<source>` — un `src` présent
    // ferait ignorer les sources de repli. La balise ne se referme pas seule.
    if (t === 'video') {
      const rest = attrs.replace(/\bsrc\s*=\s*"[^"]*"/i, '').replace(/\s+/g, ' ').trim();
      return keep(`<video ${rest} preload="auto">${videoSources(target, opt)}`);
    }
    const rewritten = attrs.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${opt.resolveAsset(target)}"`);
    if (t === 'source') return keep(`<source ${rewritten.trim()} type="${videoMime(target)}" />`);
    return keep(`<img ${rewritten.trim()} />`);
  });
  out = out.replace(/<\/video>/gi, () => keep('</video>'));

  out = esc(out);

  // Image ![alt](src) — avant les liens (même syntaxe, préfixée de `!`).
  out = out.replace(new RegExp(String.raw`!\[([^\]]*)\]\(${TARGET}\)`, 'g'), (_m, alt: string, raw: string) => {
    const target = decodeURIComponent(linkTarget(raw));
    const src2 = opt.resolveAsset(target);
    // Démo animée : un <img> n'affiche pas un WebM. Les guides gardent la
    // syntaxe d'image (portable, vérifiable comme un lien), on rend une vidéo
    // qui se comporte comme le GIF qu'elle remplace — muette et en boucle —
    // mais avec les contrôles, une démo de 40 s méritant une pause.
    // Le type est déclaré sur une <source> : sans lui, le lecteur reste inerte
    // quand la réponse n'annonce pas `video/webm` (v2026.7.191).
    if (VIDEO.test(target)) {
      return `<video title="${alt}" autoplay loop muted playsinline controls preload="auto">`
        + `${videoSources(target, opt)}</video>`;
    }
    return `<img src="${src2}" alt="${alt}" />`;
  });

  // Lien [texte](cible) : externe (http/mailto), ancre (#), ou autre fiche (.md).
  out = out.replace(new RegExp(String.raw`\[([^\]]+)\]\(${TARGET}\)`, 'g'), (_m, text: string, raw: string) => {
    const target = linkTarget(raw);
    if (/^(https?:|mailto:)/i.test(target)) return `<a href="${target}">${text}</a>`;
    // Ancre interne : re-slugifiée pour retomber sur l'id du titre (les sommaires
    // des guides écrivent l'ancre accentuée, `#démarrage` → id `demarrage`).
    if (target.startsWith('#')) return `<a href="#${slug(decodeURIComponent(target.slice(1)))}">${text}</a>`;
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
    // Une image ou une démo animée seule sur sa ligne : bloc à part entière.
    const alone = /^!\[[^\]]*\]\([^)]*\)$/.test(joined) || /^<video\b[^>]*>(<source\b[^>]*>)*<\/video>$/i.test(joined);
    if (alone) html.push(`<figure>${inline(joined, opt)}</figure>`);
    else paragraph(buf);
  }

  return html.join('\n');
}

/** Titre (premier `# …`) d'une fiche, pour nommer l'onglet. */
export function markdownTitle(src: string): string | undefined {
  const m = src.match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim().replace(/`/g, '') : undefined;
}
