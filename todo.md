# v2026.6.36

1. ✅ **Poster de brochage en surimpression** : le bouton ☢ affiche désormais le poster (réduit aux seules étiquettes) **par dessus la carte**, à sa largeur exacte, comme le symbole interne de la résistance. La bande centrale vide laisse transparaître la carte réelle (broches, LED). Posé dans le corps → suit rotation/retournement ; la boîte de sélection reste circonscrite à la carte. **Pose auto-alignée par mesure du SVG réel de la carte** (`getBoundingClientRect` du SVG, ramené dans le repère local du corps) : largeur = largeur réelle de la carte, bande vide calée sur son centre — insensible à la taille/position effective de `.part__body` (corrige le décalage Pico/Pico W). Repli sur la taille nominale si la carte est tournée. Validé par rendu Chrome headless (corps sur-dimensionné et décalé). SVG `svg/{pico,picow}-pinout.svg` retouchés puis recopiés dans `src/webview/elements/`.
2. ✅ **Autoroutage qui évite les composants** : des deux orientations du coude en L, l'autoroutage retient celle qui recouvre le moins les *autres* composants (mesure du recouvrement segment↔rectangle ; on tolère le passage sur les composants portant les deux extrémités du fil, inévitable pour atteindre la patte).
3. ✅ **« Passifs » renommé « Divers »** dans la palette Composants (catégorie fourre-tout par défaut).
4. ✅ **Catégories repliables** : clic sur l'en-tête d'une section de la palette (catégories, derniers utilisés, personnalisés) la replie/déplie (chevron ▾/▸) ; état persisté. Une recherche active ignore le repli (les résultats restent visibles).
# v2026.6.35

1. ✅ **Noms de broches Pico/Pico W retirés de la carte** : plus d'étiquettes verticales en permanence ; l'élément `<kablix-pico-board>` fait désormais exactement la taille de la carte (suppression des marges hautes/basses).
2. ✅ **Boîte de sélection circonscrite au composant** : conséquence du point 1 — le contour de sélection épouse la carte, plus les anciennes marges des noms.
3. ✅ **Bouton ☢ = brochage complet** : sur une carte Pico/Pico W, le bouton radioactif du bandeau affiche/masque un **poster de brochage complet** (toutes les fonctions + légende) en **calque flottant ancré** à droite de la carte. Visible quand la carte est sélectionnée ; n'intercepte pas les clics et ne déplace pas les broches. Posters `src/webview/elements/{pico,picow}-pinout.svg` importés comme texte.
4. ✅ **Rappel des broches debug retiré des posters** : barres SWCLK/GND/SWDIO + lignes de liaison supprimées des deux posters (les pastilles de debug restent dessinées sur le PCB). Outil de nettoyage : `scripts/_clean-pinout.mjs`.
5. ✅ **Pastilles d'alimentation à 6 px** : les pastilles VCC (rouge) / GND (noir) passent de 9 à **6 px de diamètre**, plus discrètes sur les trous.
6. ℹ️ **Posters non embarqués dans le .vsix** : `svg/**`, `*.vsix` et `todo*.md` ajoutés à `.vscodeignore` (les posters embarqués viennent de `dist/webview.js`).


