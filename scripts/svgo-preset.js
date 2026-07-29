// Réglage SVGO commun au build (posters de brochage + SVG inlinés dans le bundle
// webview). Les sources Inkscape ne sont JAMAIS réécrites : l'optimisation a lieu
// à la volée pendant le build.
//
// Le préréglage est volontairement conservateur : les dessins Kablix sont pilotés
// au runtime (pastilles pin-*, groupes animés, éléments remplis par le JS), donc
// tout ce qui renomme, fusionne ou supprime des nœuds est désactivé :
//   - cleanupIds / collapseGroups / mergePaths : les ids et la hiérarchie servent
//     de points d'ancrage au code (pin-*, board, leds…) ;
//   (removeViewBox ne fait plus partie du préréglage depuis SVGO 4 : le viewBox est
//    conservé d'office, indispensable au calage des pastilles sur la grille 10 px)
//   - convertShapeToPath : les pastilles sont cherchées comme <circle>/<rect> ;
//   - removeEmptyContainers / removeHiddenElems : conteneurs peuplés à l'exécution ;
//   - inlineStyles : le JS cible des classes CSS déclarées dans <style>.
// Reste le gros du gain : indentation, métadonnées Inkscape/sodipodi, attributs par
// défaut et précision numérique excessive (~40 à 65 % du poids).
const svgoConfig = {
   multipass: true,
   js2svg: { indent: 0, pretty: false },
   plugins: [
      {
         name: 'preset-default',
         params: {
            overrides: {
               cleanupIds: false,
               removeHiddenElems: false,
               removeUselessDefs: false,
               removeEmptyContainers: false,
               removeUselessStrokeAndFill: false,
               convertShapeToPath: false,
               convertEllipseToCircle: false,
               mergePaths: false,
               collapseGroups: false,
               inlineStyles: false,
               removeUnknownsAndDefaults: { keepDataAttrs: true, keepAriaAttrs: true, keepRoleAttr: true },
               cleanupNumericValues: { floatPrecision: 3 },
               convertPathData: { floatPrecision: 3, transformPrecision: 5 },
               convertTransform: { floatPrecision: 5 },
            },
         },
      },
   ],
};

// Plusieurs SVG retouchés utilisent xlink: sans déclarer le namespace (Inkscape le
// tolère, pas le parseur de SVGO). On le rétablit avant l'optimisation.
function fixXlink(svg) {
   if (!svg.includes('xlink:') || svg.includes('xmlns:xlink')) return svg;
   return svg.replace(/<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
}

/**
 * Optimise un SVG. En cas d'échec (SVG hors norme), renvoie la source telle quelle
 * : un poster non optimisé vaut mieux qu'un build cassé.
 * @returns {{ data: string, ok: boolean }}
 */
function optimizeSvg(source, name) {
   try {
      const { optimize } = require('svgo');
      const out = optimize(fixXlink(source), { ...svgoConfig, path: name });
      return { data: out.data, ok: true };
   } catch (e) {
      console.warn(`[svgo] ${name} laissé tel quel (${e.message.split('\n')[0]})`);
      return { data: source, ok: false };
   }
}

module.exports = { svgoConfig, optimizeSvg };
