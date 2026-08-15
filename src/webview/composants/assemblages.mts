// FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Produit par `node scripts/_extract-assemblage.mjs <nom>` à partir des pièces
// dessinées dans Composants3D.svg (mode d'emploi : docs/fr/Drawing-systems.md).
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
//   • `axes`   : les pastilles rouges nommées — coxas, patellas, points de pivot.
//               Chacune est une DROITE : `dir` dit son sens (l'épaisseur de la
//               pièce qui la porte), et le point rangé est son ZÉRO — le milieu
//               des deux exemplaires en miroir. Deux dessins s'emboîtent axes
//               superposés, zéros confondus.
import type { Assembly } from './iso3d.mjs';

const DATA = {
  "araignee-corps": {
    "source": "Composants3D.svg",
    "box": { "x": 65.86, "y": 129.92, "z": 43.05 },
    "axes": {
      "coxa-gh": { "x": -16.9, "y": -26, "z": 0, "dir": "z" },
      "coxa-dh": { "x": 16.9, "y": -26, "z": 0, "dir": "z" },
      "coxa-gb": { "x": -18.9, "y": 45, "z": 0, "dir": "z" },
      "coxa-db": { "x": 18.89, "y": 45, "z": 0, "dir": "z" }
    },
    "pieces": [
      {
        "name": "batterie",
        "plan": "dessus",
        "mat": "pmma",
        "fill": "#1a1a1aff",
        "ep": 10,
        "pos": { "x": 0, "y": 0, "z": -21.15 },
        "w": 35.31,
        "h": 54.95,
        "poly": [
          { "x": -17.66, "y": 22.86 }, { "x": -17.55, "y": 23.85 }, { "x": -17.33, "y": 24.62 }, { "x": -16.5, "y": 25.98 },
          { "x": -15.76, "y": 26.65 }, { "x": -15.07, "y": 27.06 }, { "x": -13.54, "y": 27.47 }, { "x": 13.44, "y": 27.47 },
          { "x": 14.42, "y": 27.31 }, { "x": 15.34, "y": 26.92 }, { "x": 16.15, "y": 26.33 }, { "x": 16.81, "y": 25.59 },
          { "x": 17.43, "y": 24.34 }, { "x": 17.66, "y": 22.96 }, { "x": 17.66, "y": -23 }, { "x": 17.47, "y": -24.18 },
          { "x": 17.1, "y": -25.1 }, { "x": 16.4, "y": -26.07 }, { "x": 15.65, "y": -26.72 }, { "x": 14.57, "y": -27.25 },
          { "x": 13.4, "y": -27.47 }, { "x": 13.39, "y": -27.27 }, { "x": 13.24, "y": -27.17 }, { "x": 8.24, "y": -27.17 },
          { "x": 8.04, "y": -27.17 }, { "x": 7.89, "y": -27.47 }, { "x": -13.3, "y": -27.47 }, { "x": -14.28, "y": -27.34 },
          { "x": -15.21, "y": -26.98 }, { "x": -16.04, "y": -26.42 }, { "x": -16.84, "y": -25.53 }, { "x": -17.44, "y": -24.28 },
          { "x": -17.66, "y": -22.9 }, { "x": -17.66, "y": 22.66 }
        ]
      },
      {
        "name": "pca9685",
        "plan": "dessus",
        "mat": "carte",
        "ep": 1,
        "pos": { "x": 0, "y": 0, "z": 15.75 },
        "w": 40,
        "h": 29.18,
        "img": {
          "o": { "x": 20, "y": 14.1 },
          "u": { "x": -40, "y": 0 },
          "v": { "x": 0, "y": -28.2 },
          "alpha": 1,
          "href": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAACNCAMAAADFE8VzAAAAAXNSR0IArs4c6QAAAARnQU1BAACx\njwv8YQUAAAMAUExURRIRCwQFBAoYFxcZGSMYFxckGykpHBIaKCobKhQrLxk4OjErMikpKSs0KzUz\nLSs2Nzc4N10aFVQxG3E6GFEZI2wcME8yLUY7OFY4OGwyNT5GHgBAPTBJNzlFOUtHHnlFGU9GL0dE\nOW1HMnhmPA84Tho6RgM7WC42Tyk7RTY7Rgo+cAQ7Zy89YlQ6SUc6RnA4Rw9ISwVIWhdJWAVUWxdU\nWjdSTShFSjdGRyhJVzdKVilUWjdUWR9iWz5pXQVMaRVLZwJTbBZVaQZNdxRMeANTcxZYeDBTbSdY\naTdYaCZbdg1mbRljawpkeRdkei10dydkazlkaihmeDdndzZ0eU5OUkdHRlRJSElWWFdYV2lTUVJk\nWmtlV0xXcEZYZ2tXblV2eEZlalhnaUZqeFZpdkl1eW5vbWhpZ2h4eHd4d4kxNqc2PIlHHpBIOLBe\nLJtmM69oMrlqN8VmFcRwNY82SrA6VJJKT69MU5JwVK52Tp9XYbNNZYZ5dap6Y8hLU8d3SMZSacF+\nZT6CdlaCfHuEe6qBV46Id6+Lb4iifteIV+uJTcmOZxFclARNghFOgAhTgxZYhSZbhxRwkBlnhghm\nmxdnlzdrlCdohzdrhip1ijh3iCdqlCh2lTh6lgtsqwRopzB5plpci2RfilZqikZrg0d4iFd5h0Z6\nlVZ6lmt3kWd5iEl7o359rYZ5joNsoxuFjzGEkDmDmC+EqzmFpFGUmkiEileFiUeFmFeGmG+Oj2eI\nl3WIl3ilnVaUrUmIpVeIpnOXsmeLpGiXqHiZp1amsnWls1Way3aZx3Oqyn7I3Y6SkYmKiJiZmKeW\nk4+kl7Gpl5KaroeZp6mbrZaqsYilqYent62ysaepqLi6uc62msm0lsW9uMy6p9S+pLvDuNXBnNjK\nucrCq9XBpcXGt/HRse7Lp/bTrfbWtt3jvfXgvZCbw5K1y4WoxKe6yYK85sS/xpvF1LjHyafF2pfM\n5q7P5rbw/NTUzsXHxurZx9zi2Ovm08fY6c7u9uzr6Pjz6/Pz8gAAAPGC7wkAAAEAdFJOU///////\n////////////////////////////////////////////////////////////////////////////\n////////////////////////////////////////////////////////////////////////////\n////////////////////////////////////////////////////////////////////////////\n////////////////////////////////////////////////////////////////////////////\n/////////////////////////////wBT9wclAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRT\nb2Z0d2FyZQBQYWludC5ORVQgNS4xLjEyEwFHdAAAANBlWElmSUkqAAgAAAAFABoBBQABAAAASgAA\nABsBBQABAAAAUgAAACgBAwABAAAAAgAAADEBAgARAAAAWgAAAGmHBAABAAAAbAAAAAAAAABgAAAA\nAQAAAGAAAAABAAAAUGFpbnQuTkVUIDUuMS4xMgAABQAAkAcABAAAADAyMzABoAMAAQAAAAEAAAAC\noAQAAQAAAMgAAAADoAQAAQAAAI0AAAAFoAQAAQAAAK4AAAAAAAAAAgABAAIABAAAAFI5OAACAAcA\nBAAAADAxMDAAAAAAnDtACb/Qjs0AADgtSURBVHhevb0NXBvXne+NwRjzJulJG4QTkyLXEAQxMBJG\nAiVnZqQZCwEySCAgtikgXn1vu8nGdZImvX2xk+7eNQaiGEmDtOtbIwnD9okJRoAwwkDY6weIE8Jr\nm41Tb7PNC/hxnHqN02xb3885MxJCOLHT2+5PH4Q0c+bM+c55/58Xhdy5tz49ffr06f8/+Oh/jW6O\n9rS3/+/go3dRSPCBzWpTpTU3K5Wnbwaf+C/QKK5KS0tNbVsNPrFJ9wbR4G1pJ1tSlWkdXwSf+qur\nC6dTT7ap7ofkniAulUrVs7IyknoyzRV87q+tlWQa2G/eXG1LU2mCzwXrniBtqtRL8P+KMjX1vzpK\n2kFqH/rQloqPB58M0r1AVppTT7Of+tJa7xm/f2G1NJ9kP0zSafbgk0FaB7n52Wbd/KxH2TzCnr94\nMtV789NPg518lT5dvw9U8Omv1qefrSibuYd4p03V8btgB0h+z30gn5loViRJkhRF0fRJmqbTVGmp\nSs6zEeVJZUtLy8kvU9AZmqZPqkb994GCfqtU7Ll7qqWQoJubT7FXrqjaQCtogVKy3qt87ny38IHY\n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\nrkJggg==\n"
        },
        "poly": [
          { "x": 12.52, "y": 14.59 }, { "x": 12.92, "y": 14.53 }, { "x": 13.41, "y": 14.2 }, { "x": 13.64, "y": 13.87 },
          { "x": 13.77, "y": 13.29 }, { "x": 13.94, "y": 13.23 }, { "x": 18.14, "y": 13.23 }, { "x": 18.51, "y": 13.12 },
          { "x": 18.69, "y": 12.77 }, { "x": 18.69, "y": 8.17 }, { "x": 18.63, "y": 8.01 }, { "x": 18.05, "y": 7.86 },
          { "x": 17.61, "y": 7.46 }, { "x": 17.44, "y": 7.1 }, { "x": 17.38, "y": 6.5 }, { "x": 17.47, "y": 6.12 },
          { "x": 17.8, "y": 5.62 }, { "x": 18.69, "y": 5.24 }, { "x": 18.69, "y": -5.16 }, { "x": 19.38, "y": -5.44 },
          { "x": 19.68, "y": -5.69 }, { "x": 19.89, "y": -6.03 }, { "x": 20, "y": -6.62 }, { "x": 19.96, "y": -7.02 },
          { "x": 19.68, "y": -7.54 }, { "x": 19.38, "y": -7.8 }, { "x": 18.69, "y": -8.08 }, { "x": 18.69, "y": -12.68 },
          { "x": 18.57, "y": -13.06 }, { "x": 18.22, "y": -13.23 }, { "x": 13.83, "y": -13.23 }, { "x": 13.67, "y": -12.67 },
          { "x": 13.33, "y": -12.19 }, { "x": 12.81, "y": -11.91 }, { "x": 12.21, "y": -11.89 }, { "x": 11.52, "y": -12.26 },
          { "x": 11.21, "y": -12.77 }, { "x": 11.15, "y": -13.16 }, { "x": 11, "y": -13.23 }, { "x": 1.4, "y": -13.23 },
          { "x": 1.14, "y": -13.94 }, { "x": 0.9, "y": -14.26 }, { "x": 0.38, "y": -14.55 }, { "x": -0.02, "y": -14.59 },
          { "x": -0.6, "y": -14.47 }, { "x": -0.92, "y": -14.23 }, { "x": -1.43, "y": -13.23 }, { "x": -11.03, "y": -13.23 },
          { "x": -11.54, "y": -12.23 }, { "x": -12.25, "y": -11.89 }, { "x": -12.84, "y": -11.92 }, { "x": -13.36, "y": -12.21 },
          { "x": -13.6, "y": -12.53 }, { "x": -13.86, "y": -13.23 }, { "x": -18.26, "y": -13.23 }, { "x": -18.66, "y": -12.94 },
          { "x": -18.68, "y": -13.29 }, { "x": -18.69, "y": -8.09 }, { "x": -19.68, "y": -7.55 }, { "x": -19.89, "y": -7.21 },
          { "x": -20, "y": -6.62 }, { "x": -19.9, "y": -6.04 }, { "x": -19.69, "y": -5.7 }, { "x": -19.39, "y": -5.44 },
          { "x": -18.69, "y": -5.16 }, { "x": -18.69, "y": 5.24 }, { "x": -17.8, "y": 5.62 }, { "x": -17.55, "y": 5.93 },
          { "x": -17.39, "y": 6.5 }, { "x": -17.44, "y": 7.09 }, { "x": -17.61, "y": 7.46 }, { "x": -18.05, "y": 7.86 },
          { "x": -18.62, "y": 8.01 }, { "x": -18.69, "y": 8.16 }, { "x": -18.69, "y": 12.76 }, { "x": -18.52, "y": 13.11 },
          { "x": -18.15, "y": 13.23 }, { "x": -13.95, "y": 13.23 }, { "x": -13.77, "y": 13.28 }, { "x": -13.64, "y": 13.87 },
          { "x": -13.27, "y": 14.33 }, { "x": -12.92, "y": 14.52 }, { "x": -12.33, "y": 14.59 }, { "x": -11.77, "y": 14.41 },
          { "x": -11.46, "y": 14.15 }, { "x": -11.11, "y": 13.24 }, { "x": -1.32, "y": 13.21 }, { "x": -1.2, "y": 12.63 },
          { "x": -0.84, "y": 12.16 }, { "x": -0.49, "y": 11.96 }, { "x": 0.1, "y": 11.88 }, { "x": 0.49, "y": 11.95 },
          { "x": 0.98, "y": 12.29 }, { "x": 1.19, "y": 12.63 }, { "x": 1.32, "y": 13.21 }, { "x": 1.51, "y": 13.23 },
          { "x": 11.11, "y": 13.24 }, { "x": 11.46, "y": 14.15 }, { "x": 11.94, "y": 14.5 }, { "x": 12.32, "y": 14.59 }
        ],
        "holes": [
          [
            { "x": 18.68, "y": -5.9 }, { "x": 18.31, "y": -6.01 }, { "x": 18, "y": -6.51 }, { "x": 18.16, "y": -7.07 },
            { "x": 18.68, "y": -7.32 }, { "x": 19.06, "y": -7.2 }, { "x": 19.36, "y": -6.71 }, { "x": 19.2, "y": -6.15 },
            { "x": 18.88, "y": -5.92 }
          ],
          [
            { "x": -12.45, "y": 13.96 }, { "x": -12.97, "y": 13.71 }, { "x": -13.13, "y": 13.14 }, { "x": -12.83, "y": 12.65 },
            { "x": -12.45, "y": 12.53 }, { "x": -12.08, "y": 12.65 }, { "x": -11.77, "y": 13.15 }, { "x": -11.93, "y": 13.71 },
            { "x": -12.25, "y": 13.93 }
          ],
          [
            { "x": 12.45, "y": 13.95 }, { "x": 12.07, "y": 13.83 }, { "x": 11.77, "y": 13.34 }, { "x": 11.93, "y": 12.78 },
            { "x": 12.45, "y": 12.53 }, { "x": 12.82, "y": 12.64 }, { "x": 13.13, "y": 13.14 }, { "x": 12.97, "y": 13.7 },
            { "x": 12.64, "y": 13.92 }
          ],
          [
            { "x": -18.69, "y": -5.92 }, { "x": -19.07, "y": -6.04 }, { "x": -19.37, "y": -6.53 }, { "x": -19.22, "y": -7.09 },
            { "x": -18.69, "y": -7.34 }, { "x": -18.32, "y": -7.22 }, { "x": -18.02, "y": -6.73 }, { "x": -18.17, "y": -6.17 },
            { "x": -18.5, "y": -5.95 }
          ],
          [
            { "x": -0.01, "y": -12.53 }, { "x": -0.39, "y": -12.65 }, { "x": -0.69, "y": -13.14 }, { "x": -0.53, "y": -13.7 },
            { "x": -0.01, "y": -13.96 }, { "x": 0.36, "y": -13.84 }, { "x": 0.67, "y": -13.34 }, { "x": 0.51, "y": -12.78 },
            { "x": 0.19, "y": -12.56 }
          ]
        ]
      },
      {
        "name": "picow",
        "plan": "dessus",
        "mat": "carte",
        "ep": 1,
        "pos": { "x": 0, "y": 25, "z": 15.75 },
        "w": 29.79,
        "h": 12.92,
        "img": {
          "o": { "x": -14.96, "y": -6.13 },
          "u": { "x": 29.92, "y": 0 },
          "v": { "x": 0, "y": 12.26 },
          "alpha": 1,
          "href": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABSCAMAAAAme2uJAAAAAXNSR0IArs4c6QAAAARnQU1BAACx\njwv8YQUAAAMAUExURQ8TCAYXBSwYEhIpFAInCQU6GRk0HSgoGSgeJBYzJBo3JjAsLCotKCk2KzM0\nLSo3MzU3M2UzF1A4LXA7NA9SFAVZGCxXERFnFC5uEApOMgZKJhhGKwNZKxRWLBlINAdcNBdbNzVR\nMyVDLSZHNSZaOQlzKgZmLBdmKAhoORVlOwVyOhZ0Oi9vNSRmOkxuFWBzD0pLOHRJN0l0Njo+QUU9\nQhNdRDNRQxdxVQtqQhdqQwlzQhd0RzFrUyZpRzdrSCZ0SzZ0TCl6Uzd5VjZvZ1BSTG9USFJrUEZp\nSkZ1S0h3V1V2WGtwV2dfZFB6Zm51a4w4NaU5PYdGNbZQPp8/S6g8TJFNSKtOTo5uU6V7VrVYYo56\na6J3bcxUVs1TYuBLYNFkcjOHEg6DNjqOOU6GGmSYG1+nDXeqHFGOM22VLnOvNBqIUSuKUiqFWDWG\nWzigXxyQZzGTbDiKYzqUaTyickuJWG6JWnOtTVWRb0eJZlaIaUeWbEmadFiYdW+SbWeIaXiIaniL\nc2eYeHiVd0mmb0qkeVSkfWiken3EU37DYIutNrK8O5XFMrDPOdLZF9vjGt/fNOndMtDlNOvtOYKO\nXIy3UaexR4qUbIiJapaJaIiKdpWJeIeVeZWVeKWOepCleZXOVq7OULbjVYvJba7YbbfkZ9fUUend\nVNbsUuvxTufqVvf6WNTZaundZNPxbOv0bDeOjDaLo0ibjGyXjXiZh1ixjFmrhHqukGWnhniniWa0\njGi6lHi3lEOZoFWrsmO6tW/Qn2nCmXTDnHnRq3jMpXLLyZGVj4ibhJiYhq2XjqWYiYKwg4iliZak\niompk5eqloe3mZm1m6qslaepmJavpZq5prK1sKe4prm4qMSzmsS3rozHmqbrjZPOr6/LsrrHtabU\nuIrkuq/mucjFn+PdldjqiOzskMrKs8fHuO3usKm4wcS6wprTwbbMx6jYxLjYxprxyLTmytHUzcjI\nxcXayNrd2ePZ2NDz28vn19ji2eLn2tPx6Nro5Nn55+z06/n+/AAAAM8wDSYAAAEAdFJOU///////\n////////////////////////////////////////////////////////////////////////////\n////////////////////////////////////////////////////////////////////////////\n////////////////////////////////////////////////////////////////////////////\n////////////////////////////////////////////////////////////////////////////\n/////////////////////////////wBT9wclAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRT\nb2Z0d2FyZQBQYWludC5ORVQgNS4xLjEyEwFHdAAAANBlWElmSUkqAAgAAAAFABoBBQABAAAASgAA\nABsBBQABAAAAUgAAACgBAwABAAAAAgAAADEBAgARAAAAWgAAAGmHBAABAAAAbAAAAAAAAABgAAAA\nAQAAAGAAAAABAAAAUGFpbnQuTkVUIDUuMS4xMgAABQAAkAcABAAAADAyMzABoAMAAQAAAAEAAAAC\noAQAAQAAAMgAAAADoAQAAQAAAFIAAAAFoAQAAQAAAK4AAAAAAAAAAgABAAIABAAAAFI5OAACAAcA\nBAAAADAxMDAAAAAAcGo00rzkvzYAACL9SURBVHherZsLfBPXne9lsKEYDGwax0YeccZGHp0jMb0E\najijYTQaldiWqWmz3bS3tLubPu6SUGkbGRo/JD8j5zZtdruhuTayTB59YJvE7rZg/GDT8NhYcS0/\nMMYOKdhJmsbZPNhgCI+A0f38ZyS/oJCw/X344Hlozpzv+Z/n//xH94f0zfWRSKSct5jJj7aci0Tq\nHdu3s/e9GolMBHhK+NyqSOSdmlyLFWfXRyJv/dwmWYizIhIZD7otZpzbFYmMlymileQGI5GRUst3\nMk1rn4lEIqWyaCV5wUgkErBbMMoNXolEqiRRFHY+cyUSKV/NmVZDeuPlNouF7KyC9GyEEmcwEnmn\narXFqh0FV1syTbmlkchbVbIo8DnBSGQi6MBW4gzDO1ZbLKbcmkgk8vPVKbqdGZu7Xzu+9RneYuaz\n60ODewLEzOg3v9rd/WoFgNhKa8L1P1rNcSS7fnf3np+v5glxVgVDoXKZM2NnV3AwVCGLlOQ9Uz9S\nW27JzDTl1tQfry+VrJjNCwQGtwbsBEBCoVAFL1Ahtyp4vL6c5yymnGDweF3AZjFzOyG9KMjPu2tK\n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\n"
        },
        "poly": [
          { "x": 14.9, "y": -6.46 }, { "x": 14.84, "y": 6.46 }, { "x": -14.9, "y": 6.46 }, { "x": -14.84, "y": -6.46 },
          { "x": 14.7, "y": -6.46 }
        ]
      },
      {
        "name": "supports",
        "plan": "dessus",
        "mat": "pmma",
        "fill": "#f6f6f6cc",
        "ep": 3,
        "pos": { "x": 0, "y": 0, "z": -13.75 },
        "w": 65.85,
        "h": 129.91,
        "miroir": "z",
        "poly": [
          { "x": 0, "y": -64.96 }, { "x": -2.59, "y": -64.77 }, { "x": -5.12, "y": -64.19 }, { "x": -7.36, "y": -63.33 },
          { "x": -9.63, "y": -62.06 }, { "x": -11.68, "y": -60.46 }, { "x": -13.47, "y": -58.58 }, { "x": -14.96, "y": -56.46 },
          { "x": -16.05, "y": -54.32 }, { "x": -16.83, "y": -52.05 }, { "x": -17.27, "y": -49.9 }, { "x": -17.43, "y": -47.51 },
          { "x": -17.29, "y": -45.31 }, { "x": -16.88, "y": -43.15 }, { "x": -16.12, "y": -40.88 }, { "x": -15.06, "y": -38.73 },
          { "x": -13.71, "y": -36.75 }, { "x": -15.88, "y": -34.98 }, { "x": -17.89, "y": -33.03 }, { "x": -19.75, "y": -30.94 },
          { "x": -21.57, "y": -28.55 }, { "x": -23.33, "y": -25.89 }, { "x": -24.92, "y": -23.11 }, { "x": -26.35, "y": -20.24 },
          { "x": -27.69, "y": -17.12 }, { "x": -28.86, "y": -13.93 }, { "x": -29.93, "y": -10.49 }, { "x": -30.83, "y": -7.01 },
          { "x": -31.59, "y": -3.28 }, { "x": -32.16, "y": 0.27 }, { "x": -32.58, "y": 4.05 }, { "x": -32.84, "y": 7.84 },
          { "x": -32.93, "y": 11.64 }, { "x": -32.77, "y": 16.83 }, { "x": -32.3, "y": 22.01 }, { "x": -31.51, "y": 27.15 },
          { "x": -30.43, "y": 32.03 }, { "x": -29.09, "y": 36.64 }, { "x": -27.43, "y": 41.14 }, { "x": -25.52, "y": 45.32 },
          { "x": -23.28, "y": 49.34 }, { "x": -20.8, "y": 52.97 }, { "x": -18.24, "y": 56.04 }, { "x": -15.51, "y": 58.68 },
          { "x": -12.66, "y": 60.87 }, { "x": -9.72, "y": 62.59 }, { "x": -6.59, "y": 63.89 }, { "x": -3.29, "y": 64.69 },
          { "x": -0.1, "y": 64.96 }, { "x": 3.09, "y": 64.73 }, { "x": 6.4, "y": 63.95 }, { "x": 9.55, "y": 62.68 },
          { "x": 12.49, "y": 60.99 }, { "x": 15.51, "y": 58.68 }, { "x": 18.24, "y": 56.04 }, { "x": 20.8, "y": 52.97 },
          { "x": 23.18, "y": 49.51 }, { "x": 25.34, "y": 45.68 }, { "x": 27.28, "y": 41.51 }, { "x": 28.96, "y": 37.02 },
          { "x": 30.38, "y": 32.22 }, { "x": 31.47, "y": 27.35 }, { "x": 32.28, "y": 22.21 }, { "x": 32.76, "y": 17.03 },
          { "x": 32.93, "y": 11.84 }, { "x": 32.62, "y": 4.45 }, { "x": 32.21, "y": 0.67 }, { "x": 31.63, "y": -3.09 },
          { "x": 30.83, "y": -7 }, { "x": 29.93, "y": -10.49 }, { "x": 28.86, "y": -13.93 }, { "x": 27.69, "y": -17.12 },
          { "x": 26.35, "y": -20.24 }, { "x": 24.92, "y": -23.11 }, { "x": 23.33, "y": -25.89 }, { "x": 21.57, "y": -28.55 },
          { "x": 19.75, "y": -30.93 }, { "x": 17.89, "y": -33.03 }, { "x": 15.88, "y": -34.98 }, { "x": 13.71, "y": -36.74 },
          { "x": 15.06, "y": -38.73 }, { "x": 16.12, "y": -40.88 }, { "x": 16.83, "y": -42.96 }, { "x": 17.29, "y": -45.31 },
          { "x": 17.43, "y": -47.51 }, { "x": 17.27, "y": -49.9 }, { "x": 16.83, "y": -52.05 }, { "x": 16.05, "y": -54.32 },
          { "x": 14.97, "y": -56.46 }, { "x": 13.47, "y": -58.58 }, { "x": 11.68, "y": -60.46 }, { "x": 9.63, "y": -62.06 },
          { "x": 7.36, "y": -63.33 }, { "x": 5.12, "y": -64.19 }, { "x": 2.79, "y": -64.73 }, { "x": 0.2, "y": -64.96 }
        ],
        "holes": [
          [
            { "x": 16.9, "y": -27.45 }, { "x": 17.48, "y": -27.33 }, { "x": 17.96, "y": -26.99 }, { "x": 18.27, "y": -26.49 },
            { "x": 18.35, "y": -25.9 }, { "x": 18.19, "y": -25.33 }, { "x": 17.82, "y": -24.87 }, { "x": 17.29, "y": -24.6 },
            { "x": 16.9, "y": -24.55 }, { "x": 16.32, "y": -24.67 }, { "x": 15.99, "y": -24.87 }, { "x": 15.61, "y": -25.33 },
            { "x": 15.45, "y": -25.9 }, { "x": 15.53, "y": -26.49 }, { "x": 15.72, "y": -26.84 }, { "x": 16.15, "y": -27.24 },
            { "x": 16.7, "y": -27.44 }
          ],
          [
            { "x": -16.9, "y": -27.45 }, { "x": -16.32, "y": -27.33 }, { "x": -15.84, "y": -26.99 }, { "x": -15.53, "y": -26.49 },
            { "x": -15.45, "y": -25.9 }, { "x": -15.61, "y": -25.33 }, { "x": -15.98, "y": -24.87 }, { "x": -16.51, "y": -24.6 },
            { "x": -16.9, "y": -24.55 }, { "x": -17.48, "y": -24.67 }, { "x": -17.81, "y": -24.87 }, { "x": -18.19, "y": -25.33 },
            { "x": -18.35, "y": -25.9 }, { "x": -18.27, "y": -26.49 }, { "x": -18.08, "y": -26.84 }, { "x": -17.65, "y": -27.24 },
            { "x": -17.1, "y": -27.44 }
          ],
          [
            { "x": -18.9, "y": 43.55 }, { "x": -18.51, "y": 43.6 }, { "x": -17.98, "y": 43.88 }, { "x": -17.61, "y": 44.33 },
            { "x": -17.45, "y": 44.9 }, { "x": -17.53, "y": 45.49 }, { "x": -17.72, "y": 45.84 }, { "x": -18.15, "y": 46.24 },
            { "x": -18.7, "y": 46.44 }, { "x": -19.29, "y": 46.4 }, { "x": -19.65, "y": 46.24 }, { "x": -20.08, "y": 45.84 },
            { "x": -20.32, "y": 45.3 }, { "x": -20.32, "y": 44.71 }, { "x": -20.08, "y": 44.16 }, { "x": -19.65, "y": 43.76 },
            { "x": -19.1, "y": 43.56 }
          ],
          [
            { "x": 18.89, "y": 43.55 }, { "x": 19.47, "y": 43.67 }, { "x": 19.95, "y": 44.01 }, { "x": 20.25, "y": 44.51 },
            { "x": 20.33, "y": 44.9 }, { "x": 20.25, "y": 45.49 }, { "x": 19.95, "y": 45.99 }, { "x": 19.47, "y": 46.33 },
            { "x": 18.89, "y": 46.45 }, { "x": 18.31, "y": 46.33 }, { "x": 17.97, "y": 46.12 }, { "x": 17.6, "y": 45.67 },
            { "x": 17.44, "y": 45.1 }, { "x": 17.52, "y": 44.51 }, { "x": 17.7, "y": 44.16 }, { "x": 18.13, "y": 43.76 },
            { "x": 18.69, "y": 43.56 }
          ]
        ]
      },
      {
        "name": "yeux",
        "plan": "dessus",
        "mat": "pmma",
        "fill": "#e01b24ff",
        "ep": 1.65,
        "pos": { "x": 5.84, "y": -56.8, "z": 16.08 },
        "w": 7.31,
        "h": 7.32,
        "miroir": "x",
        "poly": [
          { "x": 0, "y": -3.66 }, { "x": 1.36, "y": -3.4 }, { "x": 2.53, "y": -2.64 }, { "x": 3.33, "y": -1.5 },
          { "x": 3.65, "y": -0.15 }, { "x": 3.45, "y": 1.23 }, { "x": 2.74, "y": 2.42 }, { "x": 2.15, "y": 2.96 },
          { "x": 1.46, "y": 3.36 }, { "x": 0.1, "y": 3.66 }, { "x": -1.28, "y": 3.43 }, { "x": -2.46, "y": 2.71 },
          { "x": -3.3, "y": 1.6 }, { "x": -3.65, "y": 0.25 }, { "x": -3.48, "y": -1.13 }, { "x": -2.81, "y": -2.35 },
          { "x": -2.23, "y": -2.9 }, { "x": -1.55, "y": -3.32 }, { "x": -0.2, "y": -3.65 }
        ]
      }
    ]
  },
  "araignee-patte-femur": {
    "source": "Composants3D.svg",
    "box": { "x": 27.5, "y": 93.92, "z": 43.96 },
    "axes": {
      "patella-f": { "x": 0, "y": -36.1, "z": -21.01, "dir": "x" },
      "coxa": { "x": 0, "y": 25.26, "z": 0, "dir": "z" }
    },
    "pieces": [
      {
        "name": "cotes",
        "plan": "flanc",
        "mat": "pmma",
        "fill": "#f6f6f6cc",
        "ep": 3,
        "pos": { "x": -12.25, "y": 0, "z": -10.52 },
        "w": 93.71,
        "h": 42.38,
        "miroir": "x",
        "poly": [
          { "x": 16.6, "y": -21.13 }, { "x": 11.82, "y": -20.8 }, { "x": 7.67, "y": -20.17 }, { "x": 3.6, "y": -19.13 },
          { "x": -0.74, "y": -17.62 }, { "x": -7.55, "y": -14.75 }, { "x": -41.73, "y": 1.34 }, { "x": -43.47, "y": 2.67 },
          { "x": -44.8, "y": 4.16 }, { "x": -45.82, "y": 5.87 }, { "x": -46.56, "y": 7.94 }, { "x": -46.86, "y": 10.12 },
          { "x": -46.74, "y": 12.11 }, { "x": -46.25, "y": 14.04 }, { "x": -45.31, "y": 16.03 }, { "x": -44.25, "y": 17.48 },
          { "x": -43.12, "y": 18.61 }, { "x": -41.67, "y": 19.67 }, { "x": -40.24, "y": 20.39 }, { "x": -38.53, "y": 20.94 },
          { "x": -36.95, "y": 21.18 }, { "x": -35.36, "y": 21.19 }, { "x": -33.58, "y": 20.91 }, { "x": -31.51, "y": 20.18 },
          { "x": 1.61, "y": 4.66 }, { "x": 8.91, "y": 1.93 }, { "x": 12.75, "y": 0.84 }, { "x": 16.52, "y": 0.39 },
          { "x": 21.31, "y": 0.23 }, { "x": 36.3, "y": 0.24 }, { "x": 38.29, "y": 0.03 }, { "x": 40.38, "y": -0.61 },
          { "x": 42.47, "y": -1.79 }, { "x": 44.24, "y": -3.4 }, { "x": 45.61, "y": -5.36 }, { "x": 46.46, "y": -7.38 },
          { "x": 46.85, "y": -9.34 }, { "x": 46.86, "y": -11.54 }, { "x": 46.48, "y": -13.5 }, { "x": 45.75, "y": -15.35 },
          { "x": 44.55, "y": -17.19 }, { "x": 43.16, "y": -18.63 }, { "x": 41.36, "y": -19.88 }, { "x": 39.15, "y": -20.79 },
          { "x": 36.79, "y": -21.19 }, { "x": 16.8, "y": -21.13 }
        ],
        "holes": [
          [
            { "x": -36.11, "y": 8.45 }, { "x": -35.34, "y": 8.6 }, { "x": -34.68, "y": 9.02 }, { "x": -34.23, "y": 9.67 },
            { "x": -34.06, "y": 10.43 }, { "x": -34.19, "y": 11.21 }, { "x": -34.6, "y": 11.87 }, { "x": -35.24, "y": 12.33 },
            { "x": -36, "y": 12.52 }, { "x": -36.78, "y": 12.41 }, { "x": -37.45, "y": 12.02 }, { "x": -37.93, "y": 11.4 },
            { "x": -38.14, "y": 10.64 }, { "x": -38.05, "y": 9.86 }, { "x": -37.67, "y": 9.18 }, { "x": -37.06, "y": 8.69 },
            { "x": -36.31, "y": 8.46 }
          ]
        ]
      },
      {
        "name": "servo",
        "plan": "dessus",
        "mat": "pmma",
        "fill": "#c061cbcc",
        "ep": 24.5,
        "pos": { "x": 0, "y": 32.181, "z": 0 },
        "w": 11.87,
        "h": 21.87,
        "poly": [
          { "x": -5.93, "y": 10.93 }, { "x": -5.93, "y": -10.82 }, { "x": -5.84, "y": -10.93 }, { "x": 5.93, "y": -10.93 },
          { "x": 5.93, "y": 10.82 }, { "x": 5.84, "y": 10.93 }, { "x": -5.73, "y": 10.93 }
        ]
      },
      {
        "name": "supportservo",
        "plan": "dessus",
        "mat": "pmma",
        "fill": "#f6f6f6cc",
        "ep": 3,
        "pos": { "x": 0, "y": 32.181, "z": 0 },
        "w": 21.4,
        "h": 29.77,
        "poly": [
          { "x": -10.7, "y": -14.88 }, { "x": -10.69, "y": 14.88 }, { "x": 10.7, "y": 14.88 }, { "x": 10.69, "y": -14.88 },
          { "x": -10.5, "y": -14.88 }
        ],
        "holes": [
          [
            { "x": -6, "y": -11 }, { "x": 5.96, "y": -11 }, { "x": 6, "y": 10.9 }, { "x": 5.9, "y": 11 },
            { "x": -6, "y": 10.94 }, { "x": -6, "y": -10.8 }
          ]
        ]
      }
    ]
  },
  "araignee-patte-tibia": {
    "source": "Composants3D.svg",
    "box": { "x": 24.5, "y": 70.56, "z": 106.2 },
    "axes": {
      "patella-t": { "x": 0, "y": 27.03, "z": 45.15, "dir": "x" }
    },
    "pieces": [
      {
        "name": "cote",
        "plan": "flanc",
        "mat": "pmma",
        "fill": "#f6f6f6cc",
        "ep": 3,
        "pos": { "x": 0, "y": 0, "z": 0 },
        "w": 70.56,
        "h": 106.2,
        "poly": [
          { "x": 23.44, "y": -53.06 }, { "x": 21.87, "y": -52.77 }, { "x": 20.54, "y": -52.33 }, { "x": 19.29, "y": -51.72 },
          { "x": 18.12, "y": -50.95 }, { "x": 10.38, "y": -44.32 }, { "x": 3.72, "y": -37.99 }, { "x": -2.05, "y": -31.89 },
          { "x": -7.06, "y": -25.92 }, { "x": -10.58, "y": -21.07 }, { "x": -13.77, "y": -15.76 }, { "x": -16.66, "y": -10.05 },
          { "x": -19.37, "y": -3.82 }, { "x": -21.9, "y": 2.91 }, { "x": -24.36, "y": 10.52 }, { "x": -26.45, "y": 18.03 },
          { "x": -28.32, "y": 26.01 }, { "x": -29.81, "y": 33.66 }, { "x": -31.3, "y": 42.93 }, { "x": -32.29, "y": 45.33 },
          { "x": -34.74, "y": 48.97 }, { "x": -35.25, "y": 50.06 }, { "x": -35.28, "y": 50.65 }, { "x": -35.15, "y": 51.03 },
          { "x": -34.77, "y": 51.49 }, { "x": -34.11, "y": 51.93 }, { "x": -31.86, "y": 52.76 }, { "x": -30.1, "y": 53.1 },
          { "x": -28.92, "y": 52.93 }, { "x": -28.42, "y": 52.62 }, { "x": -28.03, "y": 52.16 }, { "x": -27.63, "y": 51.25 },
          { "x": -27.29, "y": 49.68 }, { "x": -26.81, "y": 43.71 }, { "x": -24.71, "y": 37.46 }, { "x": -22.21, "y": 31.36 },
          { "x": -19.52, "y": 25.78 }, { "x": -16.28, "y": 20.03 }, { "x": -12.61, "y": 14.32 }, { "x": -8.62, "y": 8.81 },
          { "x": -3.11, "y": 1.97 }, { "x": 3.8, "y": -5.8 }, { "x": 6.81, "y": -9 }, { "x": 32.3, "y": -34.96 },
          { "x": 33.2, "y": -36.03 }, { "x": 33.95, "y": -37.21 }, { "x": 34.54, "y": -38.48 }, { "x": 34.97, "y": -39.81 },
          { "x": 35.22, "y": -41.18 }, { "x": 35.28, "y": -42.78 }, { "x": 35.11, "y": -44.37 }, { "x": 34.76, "y": -45.72 },
          { "x": 34.24, "y": -47.02 }, { "x": 33.56, "y": -48.24 }, { "x": 32.72, "y": -49.36 }, { "x": 31.6, "y": -50.49 },
          { "x": 30.48, "y": -51.34 }, { "x": 29.27, "y": -52.04 }, { "x": 27.98, "y": -52.57 }, { "x": 26.63, "y": -52.92 },
          { "x": 25.24, "y": -53.1 }, { "x": 23.64, "y": -53.08 }
        ],
        "holes": [
          [
            { "x": 25.57, "y": -52.16 }, { "x": 33.97, "y": -43.9 }, { "x": 33.96, "y": -43.76 }, { "x": 18.71, "y": -28.24 },
            { "x": 10.31, "y": -36.5 }, { "x": 10.32, "y": -36.64 }, { "x": 25.43, "y": -52.02 }
          ]
        ]
      },
      {
        "name": "servo",
        "plan": "flanc",
        "mat": "pmma",
        "fill": "#26a269cc",
        "ep": 24.5,
        "pos": { "x": 0, "y": 22.182, "z": 40.211 },
        "w": 23.79,
        "h": 23.79,
        "poly": [
          { "x": -11.9, "y": 3.64 }, { "x": 3.35, "y": -11.88 }, { "x": 3.49, "y": -11.89 }, { "x": 11.9, "y": -3.64 },
          { "x": -3.35, "y": 11.88 }, { "x": -3.49, "y": 11.89 }, { "x": -11.75, "y": 3.78 }
        ]
      }
    ]
  },
  "corps-demo": {
    "source": "docs/exemples/corps-demo.svg",
    "box": { "x": 100, "y": 80, "z": 31 },
    "axes": {
      "coxa-g": { "x": -28, "y": 0, "z": 0, "dir": "z" },
      "coxa-d": { "x": 28, "y": 0, "z": 0, "dir": "z" }
    },
    "pieces": [
      {
        "name": "entretoise",
        "plan": "face",
        "mat": "pmma",
        "fill": "#bcdff08c",
        "ep": 3,
        "pos": { "x": 0, "y": -36, "z": 0 },
        "w": 40,
        "h": 25,
        "img": {
          "o": { "x": -15, "y": -8.5 },
          "u": { "x": 30, "y": 0 },
          "v": { "x": 0, "y": 18 },
          "alpha": 0.85,
          "href": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAUCAIAAABj86gYAAAAMElEQVR42mMQybOhKWKgqwVX1ptTl0F3H4xaQIYFkpIyBNGoBaMWjGa00eJ68AcRAJ3PzUjYr38/AAAAAElFTkSuQmCC"
        },
        "poly": [
          { "x": -20, "y": -12.5 }, { "x": 20, "y": -12.5 }, { "x": 20, "y": 12.5 }, { "x": -20, "y": 12.5 },
          { "x": -20, "y": -12.3 }
        ]
      },
      {
        "name": "plaque",
        "plan": "dessus",
        "mat": "pmma",
        "fill": "#bcdff08c",
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
        "fill": "#3f4750ff",
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

/** Taille du DESSIN FINI, en pixels de la grille, telle qu'elle est écrite sur
 *  la planche : une étiquette « système : araignee largeur : 800 » posée à côté
 *  des pièces. C'est le seul réglage d'échelle du composant, et il appartient au
 *  dessinateur — agrandir le robot se fait dans Inkscape, pas dans le code. */
const SYSTEMES = {
  "araignee": 800,
  "patte": 456
} as const;

/** La largeur voulue d'un système, ou `undefined` si la planche n'en dit rien
 *  (le composant garde alors sa taille de repli). */
export function systemeLargeur(nom: string): number | undefined {
  return (SYSTEMES as Record<string, number>)[nom];
}
