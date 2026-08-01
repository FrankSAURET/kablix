// Inventaire du dessin du ventilateur : ce qui est DANS le groupe des pales et
// ce qui reste fixe autour (un contour resté dehors se voit dès que ça tourne).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(ROOT, 'src/webview/composants/externe/ventilo.svg'), 'utf8');

/** Bornes du groupe dont l'id est donné, en suivant la profondeur des <g>. */
function group(id) {
  const i = svg.indexOf(`id="${id}"`);
  if (i < 0) return null;
  const start = svg.lastIndexOf('<g', i);
  const re = /<g\b|<\/g>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(svg))) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return { start, end: m.index + 4 };
  }
  return null;
}

const h = group('ventilo-helices');
const dedans = svg.slice(h.start, h.end);
const dehors = svg.slice(0, h.start) + svg.slice(h.end);
const compte = (s) => Object.fromEntries(
  ['path', 'circle', 'ellipse', 'rect', 'polygon', 'g'].map((t) => [t, (s.match(new RegExp(`<${t}\\b`, 'g')) || []).length])
);
console.log('dans ventilo-helices :', compte(dedans));
console.log('hors du groupe       :', compte(dehors));

// Les ids des sous-groupes et la taille de chaque path (les pales sont les gros).
for (const m of dedans.matchAll(/<g\b[^>]*id="([^"]+)"/g)) console.log('  sous-groupe', m[1]);
const tailles = [...dedans.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map((m, i) => ({ i, n: m[1].length }));
console.log('  paths (longueur du d) :', tailles.map((t) => t.n).join(' '));
