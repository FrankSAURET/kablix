# Fichiers inutiles — audit (2026-07-24)

> Rien n'est supprimé ici. Cette fiche liste les fichiers repérés comme inutiles
> ou obsolètes lors de l'audit, avec un lien et une brève explication. À toi de
> décider de la suppression. Les fichiers marqués **📦 dans le vsix** partaient
> réellement sur le marketplace et ont été exclus via `.vscodeignore` (lot v2026.7.171).

## Fichiers obsolètes (candidats à la suppression)

| Fichier | État | Explication |
|---|---|---|
| [README copy.md](../README%20copy.md) | 📦 dans le vsix (exclu v171) | Doublon obsolète du README (mentionne « v0.6.0 »). Jamais référencé par le code ni le README. |
| [ks.svg](../ks.svg) | 📦 dans le vsix (exclu v171) | Icône SVG à la racine, jamais référencée nulle part (ni code, ni CSS, ni manifeste). Doublon probable de `media/icon.png`. |
| [debug.log](../debug.log) | 📦 dans le vsix (exclu v171) | Journal de débogage (9,8 Ko) laissé à la racine. Aucun code ne le lit. Non suivi par git mais non ignoré → partait dans le paquet. |
| [src/webview/composants/interne/uno-pinout.svg.bak](../src/webview/composants/interne/uno-pinout.svg.bak) | source (hors vsix) | Sauvegarde `.bak` d'un pinout, jamais référencée. `src/` est déjà exclu du paquet — n'affecte pas le marketplace, mais encombre le dépôt. |

## Guides de développement (non requis à l'exécution)

Rangés par langue au lot v2026.7.171 : [docs/en/Editing-svg-components.md](en/Editing-svg-components.md)
(EN) et [docs/fr/Modifier-svg-composants.md](fr/Modifier-svg-composants.md) (FR). Guides de
retouche SVG, non chargés par l'extension (l'aide locale n'ouvre que les fiches `docs/composants/`).
Le guide EN est exclu du vsix (v171) mais reste sur GitHub.

## Sources d'assets non chargées à l'exécution (déjà hors vsix)

Déjà exclues par `.vscodeignore` — listées pour information, aucune action requise :

- `media/parts/*.svg` (`16-Channel PWM Driver(PCA9685).svg`, `HC-SR04.svg`, `LCD_16x2_I2C.svg`, `Pi.svg`) — SVG Fritzing sources, non chargés par le code.
- `media/icones.svg`, `media/Gomme.png`, `media/accroche2.png` — sources SVG/PNG non référencées à l'exécution.
- `images/`, `K.png`, `K2.png`, `k3.png`, `KN&B.png`, `Kablix.png`, `KablixMini.png`, `kablix.ico` (racine) — images sources ; l'icône packagée est `media/icon.png`.

## Recommandation

Les 3 premiers (`README copy.md`, `ks.svg`, `debug.log`) et `uno-pinout.svg.bak` sont
sûrs à supprimer si tu confirmes. Les guides et sources restent utiles dans le dépôt.
