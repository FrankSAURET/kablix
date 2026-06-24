# À faire

1. ⬜ Bouton de pliage 3 états (tout déplier / replier / auto) peu clair → en faire un **menu** (clic → glisser jusqu'à la valeur → relâcher = mode choisi). Icône = la même flèche de repliement, la plus grosse possible.
2. ⬜ Miniatures (palette composants) : images parfois fausses ou trop grandes ; après 1 clic dans chaque catégorie elles reviennent à la bonne taille, mais sélectionner un composant d'une autre catégorie les refait partir mal.
3. ⬜ Miniature des afficheurs 7 seg (et composants à câblage) : afficher « 8. » dans la couleur sélectionnée.
4. ⬜ Retoucher le schéma interne du clavier → sortir en SVG (comme les autres) ; il doit y en avoir 2 (3 ou 4 colonnes).
5. ⬜ Message de verrouillage (simulation) rouge sur jaune : **n'apparaît plus** → le rétablir.
6. ⬜ Zone morte en haut-gauche du canvas où l'on ne peut pas déplacer un composant → centrer la vue de démarrage sur le centre, au zoom le plus petit.
7. ⬜ Le brochage ne tombe pas en face des broches pour le modèle clavier 3×4.
8. ⬜ Touches du clavier verrouillables comme les BP ; la bulle doit l'indiquer en simulation.
9. ⬜ Appuis sur les touches (et BP) prolongés pour être pris en compte.
10. ⬜ Des fils connectés à un fil prennent la même couleur.
11. ⬜ À l'enregistrement d'un `.projix` : nom par défaut = celui du code associé (sinon nom existant) ; nom (sans chemin) affiché à côté du bouton aide.
12. ⬜ La simulation est très lente.
13. ⬜ Routage auto : ne jamais traverser un composant — sortir par le bord le plus proche + 1 pas de grille perpendiculaire, puis router.
14. ⏳ Retouche fine des pattes : en attente des SVG retouchés (`svg retouche/`).

# v2026.6.40

1. ✅ **Alignement des pattes (échelle correcte par composant)** : `pinScale` = 10/pas natif appliqué à chaque composant à pas régulier — 9,5 px (servo, LCD, DHT22, inter. à glissière), 9,6 px (joystick, ILI9341, microSD, NeoPixel matrice/anneau, NTC, PIR, tilt, flamme) ; pot/HC-SR04/buzzer déjà à 10 px. Snap relatif conservé. Infra d'**override de broches** ([`pin-overrides.mts`](src/webview/diagram/pin-overrides.mts)) pour les positions retouchées.
2. ✅ **SVG de retouche de tous les composants** dans [`svg retouche/`](svg%20retouche/) (dessin réel + grille 10 px + pastilles nommées `id="pin-<nom>"`) → je relis les positions retouchées vers `pin-overrides`.
3. ✅ **Câblage interne du buzzer supprimé** (plus de bouton K).
4. ✅ **Catégorie « Divers »** (carte microSD dedans) ; **« Discrets » remontée** juste sous « Cartes & platines ».
5. ✅ **Point de câble** réduit à ~1 px (zone de clic élargie invisible).
6. ✅ **Avertissement variables** : lien et mention « cliquer pour l'aide » retirés.
7. ✅ **Clic sur « Kablix vX »** (haut-gauche) → ouvre le dépôt GitHub.
8. ✅ **Broches du clavier** : lignes affichées « **L** » (Ligne, traduit), colonnes « C ».

# v2026.6.39

1. ✅ **Aide locale des composants** : dossier [`docs/composants/`](docs/composants/) — **38 fiches** Markdown en français (une par composant), avec **broches**, **propriétés**, **utilisation** et crédit Wokwi. Faciles à retoucher.
2. ✅ **Images des composants** : une image par fiche, **rendue à partir du vrai composant** (`@wokwi/elements` via Chrome headless, recadrée) ; cartes Uno/Nano/Mega capturées à l'échelle 2× ; Pico/Pico W depuis les SVG maison.
3. ✅ **Bouton « Aide du composant »** : l'ancien bouton « aide Wokwi » (lien en ligne) de l'inspecteur ouvre désormais la **fiche locale** (aperçu Markdown, hors-ligne) — `markdown.showPreviewToSide` sur `docs/composants/<type>.md`.
4. ⏳ **Alignement des pattes sur la grille** : toujours reporté (cartes à pas irrégulier ; nécessite validation visuelle).

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


