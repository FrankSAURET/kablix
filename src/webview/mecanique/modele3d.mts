// Volume d'un composant : format v2, fichier `model3d.json` du paquet.
//
// Les structures sont CELLES d'`iso3d.mts` / `assemblages.mts` de Kablix
// (décision B.3 : « l'éditeur lit et écrit les mêmes structures »), à trois
// ajouts près, tous facultatifs :
//   • `rot`  : rotation d'une pièce, en degrés, que l'étiquette de pose de la
//              planche ne savait pas dire (poignées de l'éditeur, lot B2) ;
//   • `mesh` : pièce MAILLÉE importée (glTF/STL, lot B4) au lieu d'un contour
//              extrudé — chemin du fichier dans l'archive ;
//   • `width`: la largeur du dessin fini en pixels de la grille, qui vivait à
//              part dans `SYSTEMES` (« système : araignee largeur : 800 »).
//
// Tout est en MILLIMÈTRES, sauf `width`. Repère monde : X à droite, Y à
// l'arrière, Z en haut.
// Kablix : COPIE de `model3d.ts` de kompix-core (v2026.10.0.19), imports
// Kablix : seuls changés. Ne rien modifier ici : corriger dans kompix-core,
// Kablix : puis recopier (`npm run verify:vue3d` compare les deux).

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

/** Comment le dessin à plat d'une pièce se pose (voir `PLANES` d'iso3d). */
export type Plane = 'dessus' | 'flanc' | 'face';
export const PLANES_3D: readonly Plane[] = ['dessus', 'flanc', 'face'];

export type AxisDir = 'x' | 'y' | 'z';

/** Axe d'articulation : une droite de direction `dir`, le point est son ZÉRO. */
export type Axis = Vec3 & { dir?: AxisDir };

/** Image plaquée sur une pièce (photo d'une carte), repère du contour. */
export type PieceImage = { href: string; o: Vec2; u: Vec2; v: Vec2; alpha: number };

export type AssemblyPiece = {
  name: string;
  plan: Plane;
  mat: string;
  /** Couleur lue sur le dessin, `#rrggbbaa` ; prime sur `mat`. */
  fill?: string;
  ep: number;
  pos: Vec3;
  /** v2 : rotation en degrés autour de X, Y puis Z, appliquée AVANT `pos`. */
  rot?: Vec3;
  w: number;
  h: number;
  /** Axe de symétrie : la pièce est posée DEUX fois. */
  miroir?: string;
  /** Contour extrudé, centré sur sa boîte. Vide pour une pièce maillée. */
  poly: Vec2[];
  holes?: Vec2[][];
  img?: PieceImage;
  /** v2 : maillage importé, chemin dans l'archive (`meshes/servo.glb`). Le
   *  centre de sa boîte est posé en `pos` ; `w`, `h`, `ep` = taille de la boîte
   *  en X, Y, Z (mm), `plan` = `dessus`. */
  mesh?: string;
  /** v2 : millimètres par unité du fichier maillé (1 = mm, 1000 = m). */
  meshScale?: number;
  /** v2 : axe vertical du fichier maillé (glTF : `y`) ; `z` par défaut. */
  meshUp?: MeshUp;
  /** v2 : pièce d'habillage (aspect seulement) : hors collisions. */
  habillage?: boolean;
  /** v2 : rang de la LED que montre cette pièce dans la chaîne (0 = première) ;
   *  elle s'allume de sa couleur (lot C4). */
  pixel?: number;
};

export type MeshUp = 'y' | 'z';

export type Assembly = {
  /** D'où vient le dessin (`Composants3D.svg`, `editor`…). */
  source: string;
  box: Vec3;
  axes: Record<string, Axis>;
  pieces: AssemblyPiece[];
};

/** Contenu de `model3d.json`. */
export interface Model3D {
  /** Les sous-ensembles du composant, par nom (`araignee-corps`, `araignee-patte-femur`…).
   *  Ils se montent les uns sur les autres par famille d'axes (`montage` d'iso3d). */
  assemblies: Record<string, Assembly>;
  /** Largeur du dessin fini, en pixels de la grille de Kablix. */
  width?: number;
}

/** Nom de fichier conventionnel du volume dans l'archive. */
export const MODEL3D_FILE = 'model3d.json';

/**
 * Axes nommés d'un composant, tous ensembles confondus (repère du composant) :
 * ce que `buildKinematics` attend pour une pièce `kompix` d'un document système.
 * Un nom présent dans deux ensembles garde le premier.
 */
export function modelAxes(model: Model3D | undefined): Record<string, Axis> {
  const out: Record<string, Axis> = {};
  for (const a of Object.values(model?.assemblies ?? {})) {
    for (const [name, axis] of Object.entries(a.axes ?? {})) if (!(name in out)) out[name] = { ...axis };
  }
  return out;
}
