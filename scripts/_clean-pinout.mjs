// Outil ponctuel : retire des groupes <g> (par sous-chaîne d'id) d'un SVG de
// pinout, en respectant l'imbrication des <g>. Sert à supprimer le rappel des
// broches de debug (SWCLK/GND/SWDIO) du poster.
import { readFileSync, writeFileSync } from 'node:fs';

/** Retire le groupe <g …id contient `idPart`…> … </g> équilibré (1re occurrence). */
function removeGroup(svg, idPart) {
  const open = new RegExp(`<g[^>]*id="[^"]*${idPart}[^"]*"[^>]*>`);
  const m = open.exec(svg);
  if (!m) return { svg, removed: false };
  let i = m.index + m[0].length;
  let depth = 1;
  const tag = /<\/?g\b[^>]*>/g;
  tag.lastIndex = i;
  let t;
  while ((t = tag.exec(svg))) {
    if (t[0].startsWith('</g')) {
      if (--depth === 0) {
        const end = t.index + t[0].length;
        return { svg: svg.slice(0, m.index) + svg.slice(end), removed: true };
      }
    } else if (!t[0].endsWith('/>')) {
      depth++;
    }
  }
  return { svg, removed: false };
}

/** Retire le groupe <g>…</g> équilibré qui commence à/après `from`. */
function removeBalancedAt(svg, from) {
  const open = /<g\b[^>]*>/g;
  open.lastIndex = from;
  const m = open.exec(svg);
  if (!m) return { svg, removed: false };
  let depth = 1;
  const tag = /<\/?g\b[^>]*>/g;
  tag.lastIndex = m.index + m[0].length;
  let t;
  while ((t = tag.exec(svg))) {
    if (t[0].startsWith('</g')) {
      if (--depth === 0) {
        return { svg: svg.slice(0, m.index) + svg.slice(t.index + t[0].length), removed: true };
      }
    } else if (!t[0].endsWith('/>')) depth++;
  }
  return { svg, removed: false };
}

/**
 * Retire le rappel debug d'une broche dont l'étiquette est un <rect> vertical aux
 * coords données : le <g> du rect + le <g> du texte qui suit (2 groupes frères).
 */
function removeDebugLabel(svg, x, y) {
  const re = new RegExp(`<g>\\s*<rect x="${x}" y="${y}"[^>]*/>\\s*</g>`);
  const m = re.exec(svg);
  if (!m) return { svg, removed: false };
  let s = svg.slice(0, m.index) + svg.slice(m.index + m[0].length); // retire le <g> du rect
  const after = removeBalancedAt(s, m.index); // retire le <g> du texte qui suit
  return { svg: after.removed ? after.svg : s, removed: true };
}

/** Retire le plus petit <g …>…</g> contenant le littéral `lit`. */
function removeGroupWith(svg, lit) {
  const at = svg.indexOf(lit);
  if (at < 0) return { svg, removed: false };
  const start = svg.lastIndexOf('<g', at); // <g> ouvrant qui précède le littéral
  return start < 0 ? { svg, removed: false } : removeBalancedAt(svg, start);
}

/** Comme removeGroupWith mais retire le <g> parent (un cran au-dessus). */
function removeOuterWith(svg, lit) {
  const at = svg.indexOf(lit);
  if (at < 0) return { svg, removed: false };
  const inner = svg.lastIndexOf('<g', at);
  const outer = svg.lastIndexOf('<g', inner - 1);
  return outer < 0 ? { svg, removed: false } : removeBalancedAt(svg, outer);
}

const [, , file, op, ...args] = process.argv;
let svg = readFileSync(file, 'utf8');
if (op === 'outer') {
  for (const lit of args) {
    const r = removeOuterWith(svg, lit);
    console.log(`outer ${lit}: ${r.removed ? 'removed' : 'NOT FOUND'}`);
    svg = r.svg;
  }
} else if (op === 'with') {
  for (const lit of args) {
    const r = removeGroupWith(svg, lit);
    console.log(`with ${lit}: ${r.removed ? 'removed' : 'NOT FOUND'}`);
    svg = r.svg;
  }
} else if (op === 'group') {
  for (const id of args) {
    const r = removeGroup(svg, id);
    console.log(`group ${id}: ${r.removed ? 'removed' : 'NOT FOUND'}`);
    svg = r.svg;
  }
} else if (op === 'rect') {
  for (let i = 0; i < args.length; i += 2) {
    const r = removeDebugLabel(svg, args[i], args[i + 1]);
    console.log(`rect ${args[i]},${args[i + 1]}: ${r.removed ? 'removed' : 'NOT FOUND'}`);
    svg = r.svg;
  }
}
writeFileSync(file, svg);
console.log(`written ${file} (${svg.length} bytes)`);
