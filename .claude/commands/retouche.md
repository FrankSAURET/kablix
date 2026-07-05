---
description: Intègre un SVG retouché de « svg retouche/ » dans le fork du composant
argument-hint: <type> (ex. keypad-3col)
---
Intègre le SVG retouché du composant : $ARGUMENTS

Modèle en vigueur (depuis v2026.7.10) : FORK DIRECT — plus d'overlay, plus de pin-overrides.

1. Source : `svg retouche/<type>.edit.svg` (suffixes `.OK/.ok` acceptés). `svg retouche/Validé/` = déjà intégré, ne pas relire.
2. Cible : `src/webview/composants/<type>-element.mts` — remplacer le SVG rendu (`unsafeSVG`) et recaler `pinInfo` en dur. Modèle de référence : `slide-potentiometer-element.mts`.
3. Géométrie : repère = coin haut-gauche du viewBox « tel quel » ; le CENTRE de chaque pastille (ronds rouges de Frank) tombe sur un croisement de la grille 10 px ; power = rond rouge, gnd = rond noir.
4. Nettoyer les artefacts Inkscape : `id="board"` perdu, ids dupliqués suffixés (`pin-VSS-1`), attributs sodipodi/inkscape.
5. Composant interactif ou à sortie dynamique : le retour visuel vit DANS le fork (classes/ids du dessin), pas dans un élément séparé.
6. Vérifier AVANT de déclarer fini : `npm run typecheck` + `npm run verify:components` + `/preview <type>` (alignement pastilles↔grille).
7. Déplacer le `.edit.svg` intégré vers `svg retouche/Validé/`.
