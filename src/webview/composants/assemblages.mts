// FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Produit par `node scripts/_extract-assemblage.mjs <nom>` à partir des pièces
// dessinées dans Composants.svg (mode d'emploi : docs/fr/Drawing-systems.md).
// Le module est sa propre archive : l'outil le RELIT avant de le réécrire.
//
// Un ASSEMBLAGE, ce sont plusieurs pièces plates posées les unes par rapport aux
// autres — deux flancs de PMMA de 3 mm, les servos pris en sandwich entre eux.
// Tout est en MILLIMÈTRES, cotes du dessin comprises : dans un assemblage, une
// épaisseur et un entrefer sont l'information même, pas une proportion.
//
//   • `plan`   : comment le dessin se pose (dessus / flanc / face) ;
//   • `pos`    : le centre de la pièce dans le repère de l'assemblage ;
//   • `miroir` : la pièce est posée DEUX fois, symétriquement (les deux flancs) ;
//   • `axes`   : les pastilles rouges nommées — hanches, genoux, points de pivot.
import type { Assembly } from './iso3d.mjs';

const DATA = {
  "corps-demo": {
    "source": "docs/exemples/corps-demo.svg",
    "box": { "x": 100, "y": 80, "z": 31 },
    "axes": {
      "hanche-g": { "x": -28, "y": 0, "z": 14 },
      "hanche-d": { "x": 28, "y": 0, "z": 14 }
    },
    "pieces": [
      {
        "name": "entretoise",
        "plan": "face",
        "mat": "pmma",
        "ep": 3,
        "pos": { "x": 0, "y": -36, "z": 0 },
        "w": 40,
        "h": 25,
        "poly": [
          { "x": -20, "y": -12.5 }, { "x": 20, "y": -12.5 }, { "x": 20, "y": 12.5 }, { "x": -20, "y": 12.5 },
          { "x": -20, "y": -12.3 }
        ]
      },
      {
        "name": "plaque",
        "plan": "dessus",
        "mat": "pmma",
        "ep": 3,
        "pos": { "x": 0, "y": 0, "z": 14 },
        "w": 100,
        "h": 80,
        "miroir": "z",
        "poly": [
          { "x": -38, "y": -40 }, { "x": 37.97, "y": -40 }, { "x": 50, "y": -28 }, { "x": 50, "y": 27.98 },
          { "x": 38, "y": 40 }, { "x": -37.97, "y": 40 }, { "x": -50, "y": 28 }, { "x": -50, "y": 27.8 },
          { "x": -50, "y": -27.98 }, { "x": -38.14, "y": -39.86 }
        ],
        "holes": [
          [
            { "x": -10, "y": 0 }, { "x": -9.8, "y": 1.98 }, { "x": -9.29, "y": 3.7 }, { "x": -8.37, "y": 5.47 },
            { "x": -7.12, "y": 7.02 }, { "x": -5.59, "y": 8.29 }, { "x": -3.84, "y": 9.24 }, { "x": -2.13, "y": 9.77 },
            { "x": -0.15, "y": 10 }, { "x": 1.84, "y": 9.83 }, { "x": 3.56, "y": 9.35 }, { "x": 5.34, "y": 8.46 },
            { "x": 6.91, "y": 7.23 }, { "x": 8.21, "y": 5.72 }, { "x": 9.18, "y": 3.98 }, { "x": 9.78, "y": 2.08 },
            { "x": 10, "y": 0.1 }, { "x": 9.82, "y": -1.88 }, { "x": 9.33, "y": -3.61 }, { "x": 8.43, "y": -5.38 },
            { "x": 7.19, "y": -6.95 }, { "x": 5.67, "y": -8.24 }, { "x": 3.93, "y": -9.2 }, { "x": 2.23, "y": -9.75 },
            { "x": 0.25, "y": -10 }, { "x": -1.74, "y": -9.85 }, { "x": -3.65, "y": -9.31 }, { "x": -5.43, "y": -8.4 },
            { "x": -6.98, "y": -7.16 }, { "x": -8.26, "y": -5.63 }, { "x": -9.22, "y": -3.89 }, { "x": -9.76, "y": -2.18 },
            { "x": -10, "y": -0.2 }
          ],
          [
            { "x": -31, "y": 0 }, { "x": -30.84, "y": 0.97 }, { "x": -30.24, "y": 2 }, { "x": -29.3, "y": 2.71 },
            { "x": -28.15, "y": 3 }, { "x": -26.98, "y": 2.82 }, { "x": -25.97, "y": 2.21 }, { "x": -25.27, "y": 1.25 },
            { "x": -25, "y": 0.1 }, { "x": -25.2, "y": -1.07 }, { "x": -25.69, "y": -1.92 }, { "x": -26.62, "y": -2.66 },
            { "x": -27.75, "y": -2.99 }, { "x": -28.93, "y": -2.85 }, { "x": -29.96, "y": -2.27 }, { "x": -30.68, "y": -1.34 },
            { "x": -30.99, "y": -0.2 }
          ],
          [
            { "x": 25, "y": 0 }, { "x": 25.16, "y": 0.97 }, { "x": 25.76, "y": 2 }, { "x": 26.7, "y": 2.71 },
            { "x": 27.85, "y": 3 }, { "x": 29.02, "y": 2.82 }, { "x": 30.03, "y": 2.21 }, { "x": 30.73, "y": 1.25 },
            { "x": 31, "y": 0.1 }, { "x": 30.8, "y": -1.07 }, { "x": 30.31, "y": -1.92 }, { "x": 29.38, "y": -2.66 },
            { "x": 28.25, "y": -2.99 }, { "x": 27.07, "y": -2.85 }, { "x": 26.04, "y": -2.27 }, { "x": 25.32, "y": -1.34 },
            { "x": 25.01, "y": -0.2 }
          ]
        ]
      },
      {
        "name": "servo",
        "plan": "flanc",
        "mat": "servo",
        "ep": 12,
        "pos": { "x": 28, "y": 0, "z": 0 },
        "w": 23,
        "h": 23,
        "miroir": "x",
        "poly": [
          { "x": -11.5, "y": -11.5 }, { "x": 11.5, "y": -11.5 }, { "x": 11.5, "y": 11.5 }, { "x": -11.5, "y": 11.5 },
          { "x": -11.5, "y": -11.3 }
        ],
        "holes": [
          [
            { "x": -3.5, "y": -5.5 }, { "x": -3.22, "y": -4.14 }, { "x": -2.44, "y": -2.99 }, { "x": -1.27, "y": -2.24 },
            { "x": -0.1, "y": -2 }, { "x": 1.08, "y": -2.17 }, { "x": 2.29, "y": -2.85 }, { "x": 3.14, "y": -3.96 },
            { "x": 3.49, "y": -5.3 }, { "x": 3.3, "y": -6.68 }, { "x": 2.71, "y": -7.72 }, { "x": 1.63, "y": -8.6 },
            { "x": 0.3, "y": -8.99 }, { "x": -1.08, "y": -8.83 }, { "x": -2.29, "y": -8.15 }, { "x": -3.14, "y": -7.04 },
            { "x": -3.49, "y": -5.7 }
          ]
        ]
      }
    ]
  }
} as const;

export type AssemblyName = keyof typeof DATA;

/** Tous les assemblages lus, dans l'ordre alphabétique. */
export const ASSEMBLAGE_NAMES = Object.keys(DATA) as AssemblyName[];

/** Un assemblage prêt pour `assemblyFaces` (iso3d.mts). */
export function assemblage(name: AssemblyName): Assembly {
  return JSON.parse(JSON.stringify(DATA[name])) as Assembly;
}

/** Vrai si cet assemblage a été dessiné et extrait (les composants gardent une
 *  forme de repli codée en dur tant que le dessin n'existe pas). */
export function hasAssemblage(name: string): name is AssemblyName {
  return Object.prototype.hasOwnProperty.call(DATA, name);
}
