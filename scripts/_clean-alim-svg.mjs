// TEMP — nettoie media/parts/alim.svg (dessin Frank, alim de laboratoire)
// vers src/webview/composants/externe/alim.svg :
//   - retire métadonnées / namedview (grille incluse) / path-effect / attributs
//     inkscape-sodipodi ;
//   - préfixe TOUS les ids `alim-` et réécrit url(#…) / href (l'export SVG de
//     l'éditeur fusionne les shadow DOM : sans préfixe, collision d'ids — même
//     piège que grove gvp- et claviers kpt3-/kpt4-) ;
//   - enveloppe le groupe du bouton dans <g id="alim-bouton-rot"> : la rotation
//     CSS s'applique au wrapper SANS écraser le translate() du groupe dessiné ;
//   - normalise la taille rendue (280×110 px exacts).
// À supprimer après intégration.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let svg = readFileSync(join(ROOT, 'media/parts/alim.svg'), 'utf8');

svg = svg
  .replace(/<\?xml[^>]*\?>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
  .replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/g, '')
  .replace(/<sodipodi:namedview[\s\S]*?\/>/g, '')
  .replace(/<inkscape:path-effect[\s\S]*?(?:<\/inkscape:path-effect>|\/>)/g, '')
  .replace(/\s+(inkscape|sodipodi):[\w.-]+="[^"]*"/g, '')
  .replace(/\s+xmlns:(inkscape|sodipodi|rdf|cc|dc)="[^"]*"/g, '')
  .replace(/-inkscape-font-specification:[^;"']*;?/g, '');

// Préfixe des ids et de leurs références.
svg = svg
  .replace(/\bid="([^"]+)"/g, 'id="alim-$1"')
  .replace(/url\(#/g, 'url(#alim-')
  .replace(/(xlink:href|href)="#/g, '$1="#alim-');

// Enveloppe de rotation du bouton (transform CSS du wrapper, translate du groupe intact).
const btn = svg.indexOf('<g\n     id="alim-bouton-tension"') >= 0
  ? svg.indexOf('<g\n     id="alim-bouton-tension"')
  : svg.search(/<g[^>]*id="alim-bouton-tension"/);
if (btn < 0) throw new Error('groupe bouton-tension introuvable');
let depth = 0;
let end = btn;
for (let j = btn; j < svg.length; j++) {
  if (svg.startsWith('<g', j) && /[\s>]/.test(svg[j + 2])) depth++;
  if (svg.startsWith('</g>', j)) {
    depth--;
    if (depth === 0) { end = j + 4; break; }
  }
}
svg = svg.slice(0, btn) + '<g id="alim-bouton-rot">' + svg.slice(btn, end) + '</g>' + svg.slice(end);

// Taille rendue exacte (viewBox mm 74.083382×29.10413 → ×96/25,4 = 280×110).
svg = svg
  .replace(/\swidth="280\.00018"/, ' width="280"')
  .replace(/\sheight="109\.99986"/, ' height="110"');

svg = svg.replace(/>\s+</g, '><').trim();

const out = join(ROOT, 'src/webview/composants/externe/alim.svg');
writeFileSync(out, svg);
console.log(`Écrit ${out} (${(svg.length / 1024).toFixed(0)} Ko)`);
// Contrôles rapides.
const ids = svg.match(/\bid="(?!alim-)[^"]*"/g);
console.log('ids non préfixés :', ids ? ids.slice(0, 5) : 'aucun');
console.log('inkscape restant :', /inkscape|sodipodi/.test(svg));
console.log('taille :', /width="280" height="110"/.test(svg) || (svg.includes('width="280"') && svg.includes('height="110"')));
for (const id of ['alim-bouton-rot', 'alim-bouton-tension', 'alim-prise-plus', 'alim-prise-gnd', 'alim-Text-Affichage', 'alim-LED-courant-limite', 'alim-text-tension', 'alim-text-courant-limite']) {
  if (!svg.includes(`id="${id}"`)) console.log('MANQUANT :', id);
}
