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
// `<source>` par voie d'accès (cf. resolveMedia). Une « image » qui pointe une
// vidéo sort quand même en `<video>`, la syntaxe restant admise. Format des
// démos : MP4/H.264 — l'Electron de VS Code n'a pas de démuxeur Matroska, donc
// aucun `.webm` n'y joue (v2026.7.193), même si `canPlayType` prétend le contraire.

import { texToHtml } from './math';

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
  /**
   * Texte d'une image `.svg` locale, pour l'intégrer DANS la page au lieu d'un
   * `<img>` : un SVG en `<img>` ne voit pas les variables du thème VS Code,
   * intégré il les suit (cf. SVG_THEME_CSS). `undefined` → `<img>` ordinaire.
   */
  inlineSvg?: (relPath: string) => string | undefined;
}

/**
 * Prépare un SVG (dessin Inkscape) pour l'intégrer dans la page : prologue,
 * métadonnées et tout script retirés ; `viewBox` posé s'il manque (sinon le
 * dessin ne se met pas à l'échelle) ; ids préfixés pour que deux dessins de la
 * même page ne se volent pas leurs dégradés ou marqueurs.
 */
export function prepareInlineSvg(src: string, prefix: string): string | undefined {
  let s = src
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .trim();
  const root = s.match(/<svg\b[^>]*>/);
  if (!root) return undefined;
  let tag = root[0];
  if (!/\sviewBox=/.test(tag)) {
    const w = parseFloat(tag.match(/\swidth="([\d.]+)/)?.[1] ?? '');
    const h = parseFloat(tag.match(/\sheight="([\d.]+)/)?.[1] ?? '');
    if (w > 0 && h > 0) tag = tag.replace(/^<svg/, `<svg viewBox="0 0 ${w} ${h}"`);
  }
  tag = tag.replace(/\s(width|height)="[^"]*"/g, '');
  s = s.replace(root[0], tag);
  // Ids préfixés, et toutes leurs références : url(#x), href="#x", xlink:href="#x".
  s = s
    .replace(/\sid="([^"]+)"/g, ` id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/(href)="#([^"]+)"/g, `$1="#${prefix}$2"`);
  return s;
}

/**
 * Couleurs d'un dessin intégré calées sur le thème : le noir et les gris foncés
 * (texte, axes, traits) prennent la couleur du texte de VS Code, le blanc celle
 * du fond ; le rouge sombre est éclairci en thème sombre. Les règles CSS
 * l'emportent sur les attributs de présentation d'Inkscape (`fill="#000000"`).
 */
export const SVG_THEME_CSS = `
    .svg-theme { display: block; text-align: center; }
    .svg-theme svg { max-width: 100%; height: auto; }
    .svg-theme [fill="#000000" i], .svg-theme [fill="#000" i], .svg-theme [fill="#3d3d3d" i],
    .svg-theme [fill="#1a1a1a" i], .svg-theme [fill="#333333" i], .svg-theme marker path:not([fill]) {
      fill: var(--vscode-foreground);
    }
    .svg-theme [stroke="#000000" i], .svg-theme [stroke="#000" i], .svg-theme [stroke="#3d3d3d" i] {
      stroke: var(--vscode-foreground);
    }
    .svg-theme [fill="#ffffff" i], .svg-theme [fill="#fff" i] { fill: var(--vscode-editor-background); }
    body.vscode-dark .svg-theme [fill="#a51d2d" i], body.vscode-high-contrast:not(.vscode-high-contrast-light) .svg-theme [fill="#a51d2d" i] { fill: #f07178; }
    body.vscode-dark .svg-theme [stroke="#a51d2d" i], body.vscode-high-contrast:not(.vscode-high-contrast-light) .svg-theme [stroke="#a51d2d" i] { stroke: #f07178; }
    .svg-theme text { white-space: pre; }
`;

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
 * sur leur titre. Les accents sont retirés des deux côtés, donc cohérents ;
 * les autres écritures (chinois…) sont gardées telles quelles, comme GitHub.
 */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // NFD a détaché les accents : on les retire
    .toLowerCase()
    // Lettres de TOUTES les écritures gardées (v2026.9.6.172) : un titre chinois
    // n'est fait que de lettres non latines, l'ancienne règle « ASCII seul » lui
    // donnait une ancre vide — et tous les titres du guide tombaient sur la même.
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .trim()
    .replace(/ /g, '-');
}

/**
 * Fabrique d'ancres UNIQUES pour un document : deux titres de même texte
 * (« Créer ses propres composants » existe en `##` et en `###` dans le guide)
 * donneraient sinon deux `id` identiques — le sommaire mènerait toujours au
 * premier. Suffixe `-1`, `-2`… comme GitHub, de sorte que les liens `#ancre`
 * déjà écrits dans les docs continuent de viser le premier des homonymes.
 */
function slugMaker(): (text: string) => string {
  const vus = new Map<string, number>();
  return (text) => {
    const base = slug(text);
    const n = vus.get(base) ?? 0;
    vus.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

/** Numéro des dessins intégrés : préfixe d'ids unique dans la page. */
let svgCompteur = 0;

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

  // Formules `$…$` (après le code : un `$` d'exemple de code reste du code).
  // Règle de Pandoc : pas d'espace juste après le `$` ouvrant ni juste avant le
  // fermant, pas de chiffre derrière — « 5 $ et 10 $ » n'est pas une formule.
  out = out.replace(/\$\$([^$]+)\$\$/g, (_m, tex: string) => keep(texToHtml(tex)));
  out = out.replace(/\$(?![\s$])([^$\n]*?[^\s$\\])\$(?!\d)/g, (_m, tex: string) => keep(texToHtml(tex)));

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
    // Démo animée : un <img> n'affiche pas une vidéo. Les guides gardent la
    // syntaxe d'image (portable, vérifiable comme un lien), on rend une vidéo
    // qui se comporte comme le GIF qu'elle remplace — muette et en boucle —
    // mais avec les contrôles, une démo de 40 s méritant une pause.
    // Le type est déclaré sur une <source> : sans lui, le lecteur reste inerte
    // quand la réponse n'annonce pas `video/mp4` (v2026.7.191).
    if (VIDEO.test(target)) {
      return `<video title="${alt}" autoplay loop muted playsinline controls preload="auto">`
        + `${videoSources(target, opt)}</video>`;
    }
    // Dessin SVG local : intégré pour suivre le thème. Mis de côté (keep) : ni
    // gras ni italique ne doivent fouiller dans son balisage.
    if (/\.svg$/i.test(target) && opt.inlineSvg) {
      const texte = opt.inlineSvg(target);
      const svg = texte === undefined ? undefined : prepareInlineSvg(texte, `svg${++svgCompteur}-`);
      if (svg) return keep(`<span class="svg-theme" role="img" aria-label="${alt}">${svg}</span>`);
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

  return out
    .replace(/\u0001(\d+)\u0001/g, (_m, i: string) => codes[Number(i)])
    .replace(/\u0002/g, '<br />');
}

/**
 * Recolle les lignes d'un paragraphe ou d'une citation. Une ligne terminée par
 * deux espaces (ou plus) force un retour à la ligne, comme en Markdown standard :
 * elle laisse une sentinelle que `inline` change en `<br />`.
 */
function recolle(lignes: string[]): string {
  return lignes
    .map((l, n) => (n < lignes.length - 1 && / {2,}$/.test(l) ? `${l.trim()}\u0002` : `${l.trim()} `))
    .join('')
    .trim();
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
  const ancre = slugMaker();
  let i = 0;

  // Un paragraphe = lignes consécutives non vides, recollées comme en Markdown
  // standard. Les fiches écrivent un paragraphe par ligne (règle depuis
  // v2026.9.4.125), mais une fiche tierce peut encore couper ses phrases.
  const paragraph = (buf: string[]): void => {
    if (buf.length) html.push(`<p>${inline(recolle(buf), opt)}</p>`);
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

    // Formule en bloc `$$ … $$`, sur une ligne ou sur plusieurs.
    if (/^\s*\$\$/.test(line)) {
      const tex: string[] = [line.replace(/^\s*\$\$/, '')];
      while (!/\$\$\s*$/.test(tex[tex.length - 1]) && i + 1 < lines.length) tex.push(lines[++i]);
      i++;
      html.push(texToHtml(tex.join(' ').replace(/\$\$\s*$/, ''), true));
      continue;
    }

    // Séparateur horizontal (--- seul, à ne pas confondre avec un tableau)
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html.push('<hr />'); i++; continue; }

    // Titre
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      html.push(`<h${level} id="${ancre(text)}">${inline(text, opt)}</h${level}>`);
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
      html.push(`<blockquote>${inline(recolle(quote), opt)}</blockquote>`);
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
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|>|```|[-*+]\s|\d+\.\s|\$\$)/.test(lines[i])
      && !/^\s*(-{3,}|\*{3,})\s*$/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i++].replace(/^\s+/, '')); // fin de ligne gardée : deux espaces = retour forcé
    }
    const joined = buf.map((l) => l.trim()).join(' ');
    // Une image ou une démo animée seule sur sa ligne : bloc à part entière.
    const alone = /^!\[[^\]]*\]\([^)]*\)$/.test(joined) || /^<video\b[^>]*>(<source\b[^>]*>)*<\/video>$/i.test(joined);
    if (alone) html.push(`<figure>${inline(joined, opt)}</figure>`);
    else paragraph(buf);
  }

  return html.join('\n');
}

/** Une entrée du plan d'un document : son niveau, son texte, son ancre. */
export interface OutlineEntry {
  level: number;
  text: string;
  id: string;
}

/**
 * Plan d'un document : les titres `##` et `###`, avec l'ancre que `renderMarkdown`
 * leur pose. Sert à construire le SOMMAIRE de l'aide, plutôt que de l'écrire à la
 * main dans le guide — un sommaire manuel dérive dès qu'une section est ajoutée
 * (celui de USAGE.md en oubliait huit).
 *
 * Le `#` de tête est laissé de côté : c'est le titre du document, pas une section.
 * Les titres à l'intérieur d'un bloc de code sont ignorés — un commentaire
 * Python ou une ligne de shell commencent souvent par `#`.
 *
 * Les ancres se numérotent comme dans `renderMarkdown` : TOUS les titres passent
 * par la même fabrique, y compris ceux qu'on ne garde pas au sommaire, sinon un
 * homonyme trop profond décalerait les suffixes et le sommaire viserait à côté.
 */
export function markdownOutline(src: string, maxLevel = 3): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const ancre = slugMaker();
  let inCode = false;
  for (const line of src.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const level = m[1].length;
    const brut = m[2].trim();
    const id = ancre(brut);
    if (level < 2 || level > maxLevel) continue;
    const text = brut.replace(/`/g, '');
    if (!text) continue;
    out.push({ level, text, id });
  }
  return out;
}

/** Titre (premier `# …`) d'une fiche, pour nommer l'onglet. */
export function markdownTitle(src: string): string | undefined {
  const m = src.match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim().replace(/`/g, '') : undefined;
}
