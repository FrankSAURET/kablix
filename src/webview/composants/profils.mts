// FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Produit par `node scripts/_extract-profils.mjs <nom>…` à partir des contours
// dessinés dans Composants3D.svg (mode d'emploi : docs/fr/Drawing-systems.md).
// Le module est sa propre archive : l'outil le RELIT avant de le réécrire, donc
// extraire un seul profil ne fait pas disparaître les autres.
//
// Coordonnées en pixels de la grille 10 px, centrées sur le milieu de la boîte
// englobante de la pièce. `holes` : les perçages, dans le même repère.
// `axes` : les pastilles rouges nommées — patellas, coxas, points de pivot. Deux
// pastilles de même préfixe (`patella-h`, `patella-b`) font un axe de rotation.
import type { Profile } from './iso3d.mjs';

const DATA = {
  "chassis-demo": {
    "w": 106.01,
    "h": 105.99,
    "source": "docs/exemples/chassis-demo.svg#chassis-demo-profil",
    "poly": [
      { "x": 39.28, "y": 7.61 }, { "x": 52.95, "y": 34.72 }, { "x": 34.64, "y": 53 }, { "x": 7.49, "y": 39.25 },
      { "x": -7.56, "y": 39.25 }, { "x": -34.69, "y": 52.96 }, { "x": -53, "y": 34.65 }, { "x": -39.26, "y": 7.51 },
      { "x": -39.26, "y": -7.54 }, { "x": -53, "y": -34.68 }, { "x": -34.69, "y": -53 }, { "x": -7.89, "y": -39.43 },
      { "x": -3.46, "y": -39.8 }, { "x": 0.03, "y": -27.07 }, { "x": 3.54, "y": -39.87 }, { "x": 7.69, "y": -39.31 },
      { "x": 34.79, "y": -52.92 }, { "x": 53, "y": -34.59 }, { "x": 39.35, "y": -7.77 }, { "x": 39.28, "y": 7.26 }
    ],
    "holes": [
    [
      { "x": -8.99, "y": -0.02 }, { "x": -8.32, "y": 3.38 }, { "x": -6.41, "y": 6.28 }, { "x": -3.55, "y": 8.25 },
      { "x": -0.16, "y": 8.98 }, { "x": 3.26, "y": 8.38 }, { "x": 6.19, "y": 6.53 }, { "x": 8.21, "y": 3.7 },
      { "x": 9.01, "y": 0.33 }, { "x": 8.47, "y": -3.1 }, { "x": 6.68, "y": -6.07 }, { "x": 3.9, "y": -8.14 },
      { "x": 0.54, "y": -9.01 }, { "x": -2.9, "y": -8.54 }, { "x": -5.9, "y": -6.8 }, { "x": -8.18, "y": -3.75 },
      { "x": -8.98, "y": -0.37 }
    ],
    [
      { "x": -22.99, "y": -12.02 }, { "x": -22.29, "y": -10.09 }, { "x": -20.16, "y": -9.03 }, { "x": -18.2, "y": -9.61 },
      { "x": -17.01, "y": -11.67 }, { "x": -17.48, "y": -13.67 }, { "x": -19.47, "y": -14.98 }, { "x": -21.78, "y": -14.43 },
      { "x": -22.97, "y": -12.37 }
    ],
    [
      { "x": 17.01, "y": -12.02 }, { "x": 17.71, "y": -10.09 }, { "x": 19.84, "y": -9.03 }, { "x": 21.8, "y": -9.61 },
      { "x": 22.99, "y": -11.67 }, { "x": 22.52, "y": -13.67 }, { "x": 20.53, "y": -14.98 }, { "x": 18.22, "y": -14.43 },
      { "x": 17.03, "y": -12.37 }
    ],
    [
      { "x": -22.99, "y": 13.98 }, { "x": -22.29, "y": 15.91 }, { "x": -20.16, "y": 16.97 }, { "x": -18.2, "y": 16.39 },
      { "x": -17.01, "y": 14.33 }, { "x": -17.48, "y": 12.33 }, { "x": -19.47, "y": 11.02 }, { "x": -21.78, "y": 11.57 },
      { "x": -22.97, "y": 13.63 }
    ],
    [
      { "x": 17.01, "y": 13.98 }, { "x": 17.71, "y": 15.91 }, { "x": 19.84, "y": 16.97 }, { "x": 21.8, "y": 16.39 },
      { "x": 22.99, "y": 14.33 }, { "x": 22.52, "y": 12.33 }, { "x": 20.53, "y": 11.02 }, { "x": 18.22, "y": 11.57 },
      { "x": 17.03, "y": 13.63 }
    ]
    ]
  },
  "femur-demo": {
    "w": 73.83,
    "h": 13.98,
    "source": "docs/exemples/femur-demo.svg#femur-demo-profil",
    "poly": [
      { "x": -29.93, "y": -6.99 }, { "x": -22.37, "y": -5.58 }, { "x": -15.08, "y": -4.74 }, { "x": -0.06, "y": -4.19 },
      { "x": 14.96, "y": -4.71 }, { "x": 22.6, "y": -5.6 }, { "x": 29.82, "y": -6.94 }, { "x": 31.55, "y": -6.82 },
      { "x": 33.2, "y": -6.25 }, { "x": 35.6, "y": -4.26 }, { "x": 36.9, "y": -1.42 }, { "x": 36.91, "y": 1.36 },
      { "x": 36.39, "y": 3.02 }, { "x": 34.44, "y": 5.47 }, { "x": 32.96, "y": 6.37 }, { "x": 30.24, "y": 6.99 },
      { "x": 15.04, "y": 4.74 }, { "x": 0.03, "y": 4.21 }, { "x": -14.99, "y": 4.74 }, { "x": -22.29, "y": 5.59 },
      { "x": -29.85, "y": 6.99 }, { "x": -31.24, "y": 6.86 }, { "x": -33.2, "y": 6.17 }, { "x": -35.36, "y": 4.41 },
      { "x": -36.74, "y": 1.61 }, { "x": -36.91, "y": -0.12 }, { "x": -36.31, "y": -2.84 }, { "x": -35.17, "y": -4.58 },
      { "x": -32.98, "y": -6.3 }, { "x": -30.28, "y": -6.95 }
    ],
    "holes": [
    [
      { "x": -32.33, "y": 0.01 }, { "x": -31.74, "y": 1.58 }, { "x": -30.27, "y": 2.39 }, { "x": -28.63, "y": 2.03 },
      { "x": -27.55, "y": 0.35 }, { "x": -27.91, "y": -1.29 }, { "x": -29.59, "y": -2.37 }, { "x": -31.23, "y": -2.01 },
      { "x": -32.31, "y": -0.33 }
    ],
    [
      { "x": 27.67, "y": 0.01 }, { "x": 28.26, "y": 1.58 }, { "x": 29.73, "y": 2.38 }, { "x": 31.37, "y": 2.03 },
      { "x": 32.45, "y": 0.35 }, { "x": 32.09, "y": -1.29 }, { "x": 30.41, "y": -2.37 }, { "x": 28.77, "y": -2.01 },
      { "x": 27.69, "y": -0.33 }
    ]
    ],
    "axes": {
      "coxa": { "x": -29.93, "y": 0.01 },
      "patella": { "x": 30.07, "y": 0.01 }
    }
  }
} as const;

export type ProfileName = keyof typeof DATA;

/** Tous les profils dessinés, dans l'ordre alphabétique. Le banc `verify:profils`
 *  les passe tous en revue : un contour qui se croise ou dont le découpage laisse
 *  un trou doit tomber au test, pas à l'image. */
export const PROFIL_NAMES = Object.keys(DATA) as ProfileName[];

/** Profil dessiné, prêt pour `prismFaces` (plaque) ou `extrudeProfile` (pièce). */
export function profile(name: ProfileName): Profile & {
  holes: { x: number; y: number }[][];
  axes: Record<string, { x: number; y: number }>;
} {
  const p = DATA[name] as { poly: readonly { x: number; y: number }[]; w: number; h: number;
    holes?: readonly (readonly { x: number; y: number }[])[];
    axes?: Readonly<Record<string, { readonly x: number; readonly y: number }>> };
  return {
    poly: p.poly.map((q) => ({ x: q.x, y: q.y })),
    w: p.w,
    h: p.h,
    holes: (p.holes ?? []).map((h) => h.map((q) => ({ x: q.x, y: q.y }))),
    axes: Object.fromEntries(Object.entries(p.axes ?? {}).map(([k, v]) => [k, { x: v.x, y: v.y }])),
  };
}

/** Vrai si ce profil a été dessiné et extrait (les composants gardent une forme
 *  de repli codée en dur tant que le dessin n'existe pas). */
export function hasProfile(name: string): name is ProfileName {
  return Object.prototype.hasOwnProperty.call(DATA, name);
}
