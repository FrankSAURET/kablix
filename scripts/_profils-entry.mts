// Point d'entrée du banc `verify:profils` : réexporte le VRAI moteur isométrique
// et les profils rangés, pour que le test s'exécute sur le code livré et non sur
// une copie. Bundlé par esbuild, importé tel quel par node — aucun navigateur
// n'est nécessaire, c'est du calcul pur.
export {
  triangulate, signedArea, prismFaces, extrudeProfile, decalFaces, project,
  shade, boxFaces, renderFaces, regularPoly,
} from '../src/webview/composants/iso3d.mjs';
export { profile, hasProfile } from '../src/webview/composants/profils.mjs';
import { PROFIL_NAMES } from '../src/webview/composants/profils.mjs';

/** Les noms rangés : le banc passe chaque profil dessiné en revue. */
export const PROFILS = PROFIL_NAMES;
