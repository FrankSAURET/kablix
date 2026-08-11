// Point d'entrée du banc `verify:assemblage` : réexporte le VRAI moteur et les
// assemblages rangés, pour que le test s'exécute sur le code livré et non sur une
// copie. Bundlé par esbuild, importé tel quel par node — aucun navigateur, c'est
// du calcul pur.
export {
  slabFaces, assemblyFaces, planeNormal, project, signedArea, PLANES, MATIERES,
} from '../src/webview/composants/iso3d.mjs';
export { assemblage, hasAssemblage } from '../src/webview/composants/assemblages.mjs';
import { ASSEMBLAGE_NAMES } from '../src/webview/composants/assemblages.mjs';

/** Les noms rangés : le banc passe chaque assemblage dessiné en revue. */
export const ASSEMBLAGES = ASSEMBLAGE_NAMES;
