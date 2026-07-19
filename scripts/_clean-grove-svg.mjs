// TEMP — nettoie media/parts/Grove pour Pico Pi.svg (dessin Frank, base Fritzing)
// vers src/webview/composants/externe/grove-pico.svg :
//   - retire métadonnées / namedview / path-effect / attributs inkscape-sodipodi ;
//   - préfixe TOUS les ids `gvp-` et réécrit url(#…) / xlink:href (l'export SVG
//     de l'éditeur fusionne les shadow DOM : sans préfixe, collision avec les
//     autres dessins Fritzing — même piège que les claviers kpt3-/kpt4-) ;
//   - préfixe les classes cls-N → gvp-cls-N (même raison, via la <style> embarquée) ;
//   - normalise la taille rendue (width/height exacts).
// À supprimer après intégration.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let svg = readFileSync(join(ROOT, 'media/parts/Grove pour Pico Pi.svg'), 'utf8');

svg = svg
  .replace(/<\?xml[^>]*\?>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
  .replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/g, '')
  .replace(/<sodipodi:namedview[\s\S]*?\/>/g, '')
  .replace(/<inkscape:path-effect[\s\S]*?(?:<\/inkscape:path-effect>|\/>)/g, '')
  .replace(/\s+(inkscape|sodipodi):[\w.-]+="[^"]*"/g, '')
  .replace(/\s+xmlns:(inkscape|sodipodi)="[^"]*"/g, '');

// Préfixe des ids et de leurs références.
svg = svg
  .replace(/\bid="([^"]+)"/g, 'id="gvp-$1"')
  .replace(/url\(#/g, 'url(#gvp-')
  .replace(/(xlink:href|href)="#/g, '$1="#gvp-')
  .replace(/\bcls-(\d+)\b/g, 'gvp-cls-$1')
  .replace(/#button\b/g, '#gvp-button');

// Taille rendue exacte (le viewBox est en mm : 58.208337×66.578796 → ×96/25.4).
svg = svg
  .replace(/\swidth="[^"]*"/, ' width="220"')
  .replace(/\sheight="[^"]*"/, ' height="251.64"');

svg = svg.replace(/>\s+</g, '><').trim();

const out = join(ROOT, 'src/webview/composants/externe/grove-pico.svg');
writeFileSync(out, svg);
console.log(`Écrit ${out} (${(svg.length / 1024).toFixed(0)} Ko)`);
// Contrôles rapides.
const ids = svg.match(/\bid="(?!gvp-)[^"]*"/g);
console.log('ids non préfixés :', ids ? ids.slice(0, 5) : 'aucun');
console.log('inkscape restant :', /inkscape|sodipodi/.test(svg));
console.log('curseur :', svg.includes('id="gvp-curseur-switch"'));
