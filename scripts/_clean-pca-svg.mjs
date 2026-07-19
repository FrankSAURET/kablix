// TEMP — nettoie media/parts/16-Channel PWM Driver(PCA9685).svg (dessin Fritzing
// retouché par Frank : pastilles connectorNNterminal) vers
// src/webview/composants/externe/pca9685.svg :
//   - retire namedview / attributs inkscape-sodipodi ;
//   - préfixe TOUS les ids `pca-` et réécrit url(#…) / href (l'export SVG de
//     l'éditeur fusionne les shadow DOM — même piège que grove gvp-) ; les
//     classes Fritzing portent déjà un hash unique, préfixées via le hash ;
//   - RECALE le bloc servo P11/P12 (groupe g659) décalé de +2,673 px dans le
//     dessin d'origine : ses trous retombent sur la grille de 10 px (x=100/110) ;
//   - normalise la taille rendue (300×200 px exacts).
// À supprimer après intégration.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let svg = readFileSync(join(ROOT, 'media/parts/16-Channel PWM Driver(PCA9685).svg'), 'utf8');

svg = svg
  .replace(/<\?xml[^>]*\?>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
  .replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/g, '')
  .replace(/<sodipodi:namedview[\s\S]*?\/>/g, '')
  .replace(/<inkscape:path-effect[\s\S]*?(?:<\/inkscape:path-effect>|\/>)/g, '')
  .replace(/\s+(inkscape|sodipodi):[\w.-]+="[^"]*"/g, '')
  .replace(/\s+xmlns:(inkscape|sodipodi|rdf|cc|dc)="[^"]*"/g, '')
  .replace(/-inkscape-font-specification:'[^']*';?/g, '')
  .replace(/-inkscape-font-specification:[^;"']*;?/g, '');

// Recalage du bloc P11/P12 : -2,673 px × 264,5833 unités/px = -707,23 en x local.
const G659 = 'transform="translate(44.464346,-4577.9215)"';
if (!svg.includes(G659)) throw new Error('translate du groupe g659 introuvable');
svg = svg.replace(G659, 'transform="translate(-662.769,-4577.9215)"');

// Préfixe des ids et de leurs références (les classes du <style> Fritzing
// gardent leur hash unique o-UjC… : pas de collision possible entre modules).
svg = svg
  .replace(/\bid="([^"]+)"/g, 'id="pca-$1"')
  .replace(/url\(#/g, 'url(#pca-')
  .replace(/(xlink:href|href)="#/g, '$1="#pca-');

// Taille rendue exacte (viewBox Fritzing 79375×52917 → 300×200 px).
svg = svg
  .replace(/\swidth="300"/, ' width="300"')
  .replace(/\sheight="199\.99998"/, ' height="200"');

svg = svg.replace(/>\s+</g, '><').trim();

const out = join(ROOT, 'src/webview/composants/externe/pca9685.svg');
writeFileSync(out, svg);
console.log(`Écrit ${out} (${(svg.length / 1024).toFixed(0)} Ko)`);
const ids = svg.match(/\bid="(?!pca-)[^"]*"/g);
console.log('ids non préfixés :', ids ? ids.slice(0, 5) : 'aucun');
console.log('inkscape restant :', /inkscape|sodipodi/.test(svg));
console.log('taille :', svg.includes('width="300"') && svg.includes('height="200"'));
console.log('recalage g659 :', svg.includes('translate(-662.769,-4577.9215)'));
