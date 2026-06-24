✅ Grossit le symbole déplier/replier des catégories (texte plus gros + gras) et bouton 3 états (tout déplier / tout replier / auto-accordéon) à côté de « derniers utilisés »
✅ Passe les titres des catégories en « première majuscule »
✅ Renomme « Affichage & LED » en « Afficheurs »
✅ Renomme « Divers » en « Discrets »
✅ Augmente zoom max jusqu'à 1000 %
✅ Le composant LCD 20 × 4 n'apparaît pas
✅ La miniature des afficheurs LCD doit être celle du 16×2 i2c
✅ La miniature du clavier (et d'autres) mauvaise au lancement
⬜ Importer l'aide wokwi dans un dossier d'aide (FR, images, 1 md/composant, crédit wokwi)
⬜ Change le bouton d'aide wokwi pour un bouton aide sur le composant
✅ Passe anneau neopixel, matrice neopixel, neopixel, oled, tft dans « Afficheurs »
✅ Passe LED et LED RGB dans « Discrets »
✅ Rajoute une catégorie « CI »
✅ Remplace le symbole nucléaire par le K inversé dans les .md (docs)
⬜ Pattes non parfaitement alignées sur la grille (conversion d'échelle approximative) — LED RGB, barreau LED, LCD, boutons, clavier, dip switch, mega, uno, joystick, potentiomètres…
✅ Schéma interne du clavier avec interrupteurs en biais (45°), toutes versions
✅ Le gros losange des câbles (déconnexion/reconnexion) disparaît ; recâblage sur power/gnd → couleur change
✅ Message de verrouillage en simulation : rouge sur jaune

# v2026.6.38

1. ✅ **Catégories** : « Affichage & LED » → **Afficheurs** (n'en contient plus les LED), « Divers » → **Discrets** (LED, LED RGB, résistance…), nouvelle catégorie **CI** (microSD, modules à puce). NeoPixel (anneau/matrice/strip), OLED et TFT déplacés dans Afficheurs.
2. ✅ **Titres de catégories** : `text-transform` retiré (« première majuscule »), texte plus grand et **gras**, chevron de pliage agrandi.
3. ✅ **Bouton de pliage 3 états** (à côté de 🕘) : tout déplier `⊞` / tout replier `⊟` / **auto-accordéon** `⇕` (déplier une section replie les autres). État persisté.
4. ✅ **Zoom max 1000 %** (`ZOOM_MAX` 5 → 10).
5. ✅ **LCD 20×4** : `numCols`/`numRows` (non réactifs en amont) fixés directement depuis cols/rows avant rendu → le format 20×4 s'affiche ; miniature forcée en 16×2 i2c.
6. ✅ **Miniatures fausses au lancement** : `fitThumbnail` réessaie quelques frames tant que l'élément Lit n'a pas rendu son shadow DOM (taille nulle).
7. ✅ **Câbles** : poignée d'extrémité = petit point discret (plus le gros losange) ; un recâblage sur une broche power/gnd repasse le fil en rouge/noir.
8. ✅ **Clavier** : schéma interne (bouton K) avec interrupteurs dessinés **en biais à 45°** (bornes diagonales + bras ouvert), pour les versions 3×4 et 4×4.
9. ✅ **Message de verrouillage** (simulation) : rouge sur fond jaune.
10. ✅ **Symbole nucléaire → K** dans la doc (`docs/Modifier svg composants.md`).
11. ⏳ **Alignement des pattes sur la grille** et **import de l'aide wokwi** : reportés (lots suivants).

# v2026.6.37

1. ✅ **Arduino Pro Mini retiré** : type `mini` supprimé du catalogue, du sélecteur de carte et des unions de types (compiler / projet / panel). Le Nano (même ATmega328P) le remplace.
2. ✅ **Bouton K déplacé** : posé en haut à droite du corps et **débordant à droite** (hors du poster, qui fait la largeur de la carte) → reste visible/cliquable quand le brochage est affiché ; la barre de nom (recouverte par le poster) s'efface alors, seul le K subsiste pour masquer le poster.
3. ✅ **Badge K centré** : le SVG remplit le bouton (width/height 100 %) → rond noir exactement concentrique au rond blanc (réglé le décalage bas-droite).
4. ✅ **« LCD Texte » unifié** : un seul composant remplace LCD 16×2 / 20×4 / 16×2 I²C, avec propriétés **Interface** (I²C 4 fils / Parallèle HD44780) et **Taille** (16×2 / 20×4). Un seul élément `wokwi-lcd1602` se dimensionne sur cols/rows et change ses broches via `pins`. Texte simulé en I²C (Lcd1602Device, 16×2 et 20×4) ; visuel seul en parallèle.
5. ✅ **Clavier matriciel** : connecteur (nappe) désormais affiché (`connector`), broches R/C visibles et câblables ; **câblage interne** (bouton K) = matrice rangées × colonnes avec un poussoir par intersection, posée sur les touches.
6. ✅ **Autoroutage amélioré** : chaque extrémité posée sur une carte **sort perpendiculairement au bord le plus proche** (le fil ne traverse plus la carte) ; entre les sorties, le coude en L de moindre recouvrement contourne les autres composants.

# v2026.6.36

1. ✅ **Poster de brochage en surimpression** : le bouton ☢ affiche désormais le poster (réduit aux seules étiquettes) **par dessus la carte**, à sa largeur exacte, comme le symbole interne de la résistance. La bande centrale vide laisse transparaître la carte réelle (broches, LED). Posé dans le corps → suit rotation/retournement ; la boîte de sélection reste circonscrite à la carte. **Pose auto-alignée par mesure du SVG réel de la carte** (`getBoundingClientRect` du SVG, ramené dans le repère local du corps) : largeur = largeur réelle de la carte, bande vide calée sur son centre — insensible à la taille/position effective de `.part__body` (corrige le décalage Pico/Pico W). Repli sur la taille nominale si la carte est tournée. Validé par rendu Chrome headless (corps sur-dimensionné et décalé). SVG `svg/{pico,picow}-pinout.svg` retouchés puis recopiés dans `src/webview/elements/`.
2. ✅ **Autoroutage qui évite les composants** : des deux orientations du coude en L, l'autoroutage retient celle qui recouvre le moins les *autres* composants (mesure du recouvrement segment↔rectangle ; on tolère le passage sur les composants portant les deux extrémités du fil, inévitable pour atteindre la patte).
3. ✅ **« Passifs » renommé « Divers »** dans la palette Composants (catégorie fourre-tout par défaut).
4. ✅ **Catégories repliables** : clic sur l'en-tête d'une section de la palette (catégories, derniers utilisés, personnalisés) la replie/déplie (chevron ▾/▸) ; état persisté. Une recherche active ignore le repli (les résultats restent visibles).
5. ✅ **Bouton brochage** : symbole nucléaire remplacé par un « K » (Kablix) gras et jaune **inversé** (miroir) dans un rond noir.
6. ✅ **Brochage vertical recalé (region-exact)** : la pose verticale mappe la bande vide du poster `[rTop, rBot]` **exactement** sur les bords de la carte (léger étirement `scaleY`) → la rangée du haut **et** celle du bas s'alignent (un simple centrage ne corrigeait pas une bande dissymétrique). `rTop` mesuré sur rendu **haute résolution** (les traits gris fins, invisibles en basse résolution, faussaient la mesure). Validé par l'utilisateur sur preview Pico/Pico W : les bouts de traits affleurent les pastilles, les carrés de numéro restent dégagés (pico/picow rTop 0.3897, rBot 0.6075).
# v2026.6.35

1. ✅ **Noms de broches Pico/Pico W retirés de la carte** : plus d'étiquettes verticales en permanence ; l'élément `<kablix-pico-board>` fait désormais exactement la taille de la carte (suppression des marges hautes/basses).
2. ✅ **Boîte de sélection circonscrite au composant** : conséquence du point 1 — le contour de sélection épouse la carte, plus les anciennes marges des noms.
3. ✅ **Bouton ☢ = brochage complet** : sur une carte Pico/Pico W, le bouton radioactif du bandeau affiche/masque un **poster de brochage complet** (toutes les fonctions + légende) en **calque flottant ancré** à droite de la carte. Visible quand la carte est sélectionnée ; n'intercepte pas les clics et ne déplace pas les broches. Posters `src/webview/elements/{pico,picow}-pinout.svg` importés comme texte.
4. ✅ **Rappel des broches debug retiré des posters** : barres SWCLK/GND/SWDIO + lignes de liaison supprimées des deux posters (les pastilles de debug restent dessinées sur le PCB). Outil de nettoyage : `scripts/_clean-pinout.mjs`.
5. ✅ **Pastilles d'alimentation à 6 px** : les pastilles VCC (rouge) / GND (noir) passent de 9 à **6 px de diamètre**, plus discrètes sur les trous.
6. ℹ️ **Posters non embarqués dans le .vsix** : `svg/**`, `*.vsix` et `todo*.md` ajoutés à `.vscodeignore` (les posters embarqués viennent de `dist/webview.js`).


