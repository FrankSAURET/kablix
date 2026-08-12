// Point d'entrée du banc `verify:assemblage` : réexporte le VRAI moteur et les
// assemblages rangés, pour que le test s'exécute sur le code livré et non sur une
// copie. Bundlé par esbuild, importé tel quel par node — aucun navigateur, c'est
// du calcul pur.
export {
  slabFaces, assemblyFaces, planeNormal, project, signedArea, shade, renderFaces,
  assemblyAxis, axisFamily, articulations, montage,
  profileAxes, extrudeProfile, rotZ, add, sub, len,
  PLANES, MATIERES,
} from '../src/webview/composants/iso3d.mjs';
export { assemblage, hasAssemblage } from '../src/webview/composants/assemblages.mjs';
export { profile, hasProfile } from '../src/webview/composants/profils.mjs';
import { ASSEMBLAGE_NAMES } from '../src/webview/composants/assemblages.mjs';
import { PROFIL_NAMES } from '../src/webview/composants/profils.mjs';

/** Les noms rangés : le banc passe chaque assemblage dessiné en revue. */
export const ASSEMBLAGES = ASSEMBLAGE_NAMES;

/** Les profils rangés : leurs pastilles suivent la MÊME règle que celles d'un
 *  assemblage — un dessin de pièce isolée n'a pas de convention à part. */
export const PROFILS = PROFIL_NAMES;
