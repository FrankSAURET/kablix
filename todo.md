# À faire
- Utilise l'icone media\serialMonitor.svg pour l'icone qui ouvre et ferme le moniteur/console

1. ✅ Retoucher **NeoPixel**, les **4 LCD**, **matrice NeoPixel**, **OLED display**, **Bouton**, **bouton poussoir**, **DIP switch**, **joystick**, **potentiomètre** à partir des fichiers [`svg retouche/nnn.edit.svg`](svg%20retouche/). → v2026.6.83 (potentiomètre finalement retouché et intégré → v2026.7.4)
2. ✅ Pouvoir **fermer l'afficheur série**. Ajouter une icône (écran) dans la barre de simulation, tout à droite, pour l'ouvrir/fermer. → v2026.6.80
3. ✅ Renommer le **moniteur série en « Console »** pour les Pico. → v2026.6.80
4. ✅ Barre de simulation : mettre en **jaune sur rouge** le bouton qui affiche le nom du fichier de simulation si **aucun fichier n'est choisi**. Le faire **clignoter 3 fois** si on lance la simulation alors qu'il est jaune. Le repasser dans sa couleur actuelle quand un fichier est choisi. → v2026.6.80
5. ✅ **Bug** : les composants ne se positionnent pas sur la grille en fort zoom. → v2026.7.0
6. ✅ **Bug** : le routage passe toujours par-dessus les composants. → v2026.6.82 (récidive : l'A\* saturait dès le 3ᵉ fil et le repli en Z traversait les composants d'extrémité)
7. ✅ À l'**ouverture d'un projet**, centrer/ajuster la vue automatiquement (comme le bouton « recentrer et ajuster »). → v2026.6.80
8. ✅ À chaque **chargement d'un fichier Python** : effacer la console, éteindre la simulation, réinitialiser les composants. À l'**arrêt de la simulation** : effacer la console, réinitialiser les composants. → v2026.6.80
9. ⬜ Mettre à jour le **câblage interne du potentiomètre** → [`svg/pot-schema.edit.svg`](svg/pot-schema.edit.svg).

# v2026.7.8

1. ✅ **Migration dessin retouché → fork direct** pour `7segment` (1/2/4 chiffres) : un dessin retouché par nombre de chiffres (`./externe/7seg.svg`, `7seg-2dig.svg`, `7seg-4dig.svg`), sélectionné selon la propriété `digits` ; `pinInfo` codé en dur par variante (grille 10 px, positions reprises telles quelles de l'ancien `pin-overrides.mts`). Pas de broche POWER/GND dédiée sur ce composant (COM/DIGn font office de retour) — grille vérifiée sur l'ensemble des broches. `pins`/`colon`/`background`/`offColor` ne sont pas exposés dans l'inspecteur (`catalog.mts`) → dessin figé sur cette configuration, aucune perte.
2. ✅ **Retour visuel réimplémenté nativement** : `updated()` colore les 7 `polygon` + 1 `circle`/`ellipse` (DP) par chiffre, dans l'ordre A,B,C,D,E,F,G,DP déjà présent dans le dessin importé (mêmes formules que l'ancien `reflectSevenSeg` — couleur éteinte mémorisée au premier passage). Changement de `digits` en cours de vie (`pininfo-change` conservé) : dessin + broches + segments requêtés à neuf sur la nouvelle variante.
3. ✅ **Nettoyage** des 4 points de l'ancien mécanisme pour ce type : `board-drawings.mts` (imports + entrées `DRAWINGS` + branche `7seg` de `drawingKey` retirés), `pin-overrides.mts` (entrées `7seg-1/2/4dig` + branche `7seg` de `overridesFor` retirées), `sim.mts` (2 appels `reflectSevenSeg` retirés, `el.values=` inchangé pilote maintenant le dessin visible), `drawing-feedback.mts` (`reflectSevenSeg` supprimée).
4. ✅ Validation : `typecheck`/`build`/`verify`/`verify:diagram`/`verify:components` OK ; contrôle visuel/comportemental headless (bundle esbuild réel) — broches des 3 variantes sur la grille, coloration ciblée d'un segment/chiffre sans affecter les autres, couleur éteinte préservée, changement dynamique de `digits` (4→1) requêtant correctement la nouvelle variante.

# v2026.7.7

1. ✅ **Migration dessin retouché → fork direct** pour `neopixel`, `neopixel-matrix`, `led-ring` : chaque fork importe désormais son SVG retouché (`./externe/<type>.svg`) et le rend lui-même via `unsafeSVG`, `pinInfo` codé en dur (grille 10 px, broches POWER/GND vérifiées alignées : neopixel VDD 10,10/VSS 30,20 ; matrice GND 90,190/VCC 100,190 ; anneau GND 60,160/VCC 70,160). `neopixel-matrix` et `led-ring` : dessin capté à la taille par défaut (8×8 / 16 pixels) — `rows`/`cols`/`pixels`/`pixelSpacing` ne sont pas exposés dans l'inspecteur (`catalog.mts`), donc aucune perte de fonctionnalité.
2. ✅ **Retour visuel réimplémenté nativement** : neopixel simple, glow/spots RVB pilotés dans `updated()` (mêmes formules que l'ancien `reflectNeopixel`) sur les ids déjà présents dans le dessin retouché (`feGaussianBlur13`, `rect14`, `ellipse23..26`). Matrice et anneau : `setPixel()`/`reset()` interrogent nativement les groupes `g.pixel` (64, tag `circle` — le dessin retouché sérialise les anciens `<ellipse>` en `<circle>`) et les `rect.pixel` (16) déjà présents dans le dessin importé, au lieu de reconstruire les éléments.
3. ✅ **Nettoyage** des 4 points de l'ancien mécanisme pour ces 3 types : `board-drawings.mts` (imports + entrées `DRAWINGS` retirées), `pin-overrides.mts` (entrées retirées), `sim.mts` (appel `reflectNeopixel` retiré, `renderNeopixel` continue de piloter `el.r/g/b`/`el.setPixel()` inchangé), `drawing-feedback.mts` (`reflectNeopixel`/`colorPixel` supprimées).
4. ✅ Validation : `typecheck`/`build`/`verify`/`verify:diagram`/`verify:components` OK ; contrôle visuel/comportemental headless (bundle esbuild réel) — broches des 3 composants sur la grille, coloration ciblée d'un pixel sans affecter les autres (matrice et anneau), `reset()` fonctionnel.

# v2026.7.6

1. ✅ **Migration dessin retouché → fork direct** pour `uno` et `mega` : chaque fork importe désormais son SVG retouché (`./externe/uno.svg`, `./externe/mega.svg` — exports réalistes type Eagle/KiCad, pas les dessins procéduraux d'origine) et le rend lui-même via `unsafeSVG`, `pinInfo` codé en dur (grille 10 px, 6/10 broches POWER/GND vérifiées alignées pour uno/mega respectivement).
2. ✅ **Retour visuel réimplémenté nativement** : positions des 4 halos LED (L/TX/RX/ON) mesurées empiriquement sur le dessin retouché (Chrome headless, `getBoundingClientRect`) faute d'id exploitables dans cet export réaliste ; filtre `#ledFilter` déjà présent dans le dessin, réutilisé tel quel. Bouton reset : aucun élément cliquable dédié dans le dessin retouché (uno : juste le texte silkscreen ; mega : un capuchon visible mais sans id) → cercle transparent `#reset-button` calé à la position mesurée du bouton physique (même convention que les autres interactifs).
3. ✅ **Nettoyage** des 2 points de l'ancien mécanisme concernés par `uno`/`mega` : `board-drawings.mts` (imports + entrées `DRAWINGS` retirées), `pin-overrides.mts` (entrées `uno`/`mega` retirées, copiées dans les forks). `sim.mts`/`drawing-feedback.mts` : rien à retirer (LEDs déjà pilotées par affectation directe `el.led13=`/etc., pas de `reflect*` dédié à ces types).
4. ✅ Validation : `typecheck` OK ; `verify` (avr8js Uno/Mega, PWM, timers 3-5, Serial1) / `verify:diagram` / `verify:components` OK ; contrôle visuel headless (bundle esbuild réel) — 2 composants instanciés, broches (16 power/gnd au total) toutes sur la grille 10 px, halos LED aux bonnes couleurs/positions, bouton reset émettant `button-press`/`button-release`.

# v2026.7.5

1. ✅ **Migration dessin retouché → fork direct** pour `gas-sensor`, `photoresistor`, `pir`, `led`, `buzzer`, `rgb-led`, `led-bar`, `servo` : chaque fork importe désormais son SVG retouché (`./externe/<type>.svg`) et le rend lui-même via `unsafeSVG`, `pinInfo` codé en dur (grille 10 px, broches POWER/GND vérifiées alignées).
2. ✅ **Retour visuel réimplémenté nativement** dans chaque fork via `updated()` interrogeant les ids/classes déjà présents dans le dessin retouché (capté depuis le rendu Lit d'origine) : halo LED (`#g30`/`#ellipse28`/`#ellipse30`), halos RGB LED (`#circleNN`/`feGaussianBlurNN`, mêmes formules `r*5+2`/`r*3`/`min(r*20,0.3)`), barres `#g53 rect`, palonnier servo (rotation autour du hub `114.85249,80.182098` + couleur). `led` : bonus, le pin-swap `flip` (cassé sous l'ancien overlay) est de nouveau fonctionnel.
3. ✅ **Nettoyage** des 4 points de l'ancien mécanisme pour ces 8 types : `board-drawings.mts` (import + entrée `DRAWINGS`), `pin-overrides.mts` (entrée `PIN_OVERRIDES`), `sim.mts` (appel `reflect*`, les assignations `el.value=`/`el.values=`/`el.angle=`… restées en place pilotent maintenant le dessin visible), `drawing-feedback.mts` (`reflectLed`/`reflectGlow`/`reflectLedBar`/`reflectRgbLed`/`reflectServo` supprimées).
4. ✅ Fichiers `gas-sensor.edit.svg`, `photoresistor.edit.svg`, `pir.edit.svg`, `led.edit.svg`, `buzzer.edit.svg`, `rgb-led.edit.svg`, `led-bar.edit.svg`, `servo.edit.svg` déplacés vers `svg retouche/Validé/`.
5. ✅ Validation : `typecheck` OK ; `verify-diagram`/`verify-sim`/`verify-components` OK ; contrôle visuel headless (Chrome, bundle esbuild réel) — 8 composants instanciés, broches toutes sur la grille 10 px, retours dynamiques vérifiés (LED verte allumée opacity=1, RGB mix rgb(255,127.5,0) formules cohérentes, 10 barres led-bar rouge/éteint conformes au motif testé, palonnier servo tourné à 90° avec la bonne couleur).

# v2026.7.4

1. ✅ **Migration dessin retouché → fork direct** pour `pot` (potentiomètre) : le fork [`potentiometer-element.mts`](src/webview/composants/potentiometer-element.mts) importe désormais son SVG retouché (`./externe/pot.svg`) et le rend via `unsafeSVG`, `pinInfo` codé en dur GND/SIG/VCC (40/50/60, y=80 — grille 10 px). Corrige un défaut d'alignement historique : l'ancien `pinInfo` (29/39/49) n'était espacé de 10 que par rapport à sa propre 1ʳᵉ broche, jamais sur la grille absolue du canevas.
2. ✅ **Rotation du curseur réimplémentée nativement** (`getScreenCTM()` natif sur le `<svg>`, `pointerdown`/`pointermove`/`pointerup` globaux) — l'ancienne machinerie CTM workaround (`ctm-workaround.mjs`) retirée du composant, même principe que `slide-potentiometer-element.mts`. Calcul d'angle/min/max/step inchangé.
3. ✅ Fichier `pot.edit.OK.svg` déplacé/finalisé dans `svg retouche/Validé/`.
4. ✅ Validation : `typecheck` OK ; `verify-diagram`/`verify-sim`/`verify-components` OK ; contrôle visuel headless (Chrome) — broches sur la grille, indicateur de rotation réactif après un drag simulé (587/1023 pour un clic à 20°, cohérent avec le calcul d'angle).
5. ℹ️ **Lot A terminé** : `resistor`, `microsd`, `hcsr04`, `dht22`, `ntc-temp`, `heartbeat`, `sound`, `tilt`, `nano`, `slide-switch`, `dip-switch` (broches), `ili9341`, `pot` — tous migrés vers le modèle fork direct.

# v2026.7.3

1. ✅ **Migration dessin retouché → fork direct** pour `ili9341` (écran TFT SPI) : le fork [`ili9341-element.mts`](src/webview/composants/ili9341-element.mts) importe désormais son SVG retouché (`./externe/ili9341.svg`) et le rend lui-même via `unsafeSVG`, `pinInfo` codé en dur (9 broches, repère grille 10 px sur `y=300`). Retrait de l'entrée `ili9341` dans `DRAWINGS`/`PIN_OVERRIDES`/`pinScale` (catalog.mts).
2. ✅ **Canvas écran** repositionné en pixels CSS **exacts** (calculés depuis le `rect` « écran » du dessin retouché, repère 1:1 avec le viewBox 200×310) au lieu des décalages approximatifs d'origine — vérifié headless : le canvas colle pile sur la zone écran du dessin.
3. ✅ `sim.mts`/`drawing-feedback.mts` : retrait de l'appel `reflectTft(draw, …)` et de la fonction devenue inutile (le canvas natif de l'élément, déjà piloté par `renderTft`, est maintenant visible directement — plus de dessin caché à synchroniser).
4. ✅ Fichier `ili9341.edit.svg` déplacé vers `svg retouche/Validé/`.
5. ✅ Validation : `typecheck` OK ; `verify-diagram`/`verify-sim`/`verify-components` OK ; contrôle visuel headless (Chrome) — viewBox/canvas/pins alignés au pixel près.

# v2026.7.2

1. ✅ **Migration dessin retouché → fork direct** pour `nano` : le fork [`arduino-nano-element.mts`](src/webview/composants/arduino-nano-element.mts) importe désormais son SVG retouché (`./externe/nano.svg`) et le rend lui-même via `unsafeSVG`, `pinInfo` codé en dur (36 broches, repère grille 10 px), broches POWER/GND (5V/3.3V/VIN/GND×3) vérifiées alignées. Retrait de l'entrée `nano` dans `DRAWINGS`/`PIN_OVERRIDES`/`pinScale` (catalog.mts) devenue inutile.
2. ✅ Halos LED **TX/RX/Power/13** portés en cercles frères du dessin importé (coordonnées calculées depuis les transforms `matrix(3.937,…)` des groupes LED du dessin retouché), réutilisant le filtre `#ledFilter` du SVG.
3. ✅ **Bouton reset** : le cercle `#reset-button` du dessin importé sert de cible d'interaction, câblage évènementiel en `firstUpdated` (la liaison déclarative `@event=` de Lit ne peut pas cibler l'intérieur d'un `unsafeSVG`), même convention que `slide-potentiometer-element.mts`.
4. ✅ Fichier `nano.edit.svg` (sans silkscreen, caractéristique du dessin depuis v2026.6.54 — vérifié par archéologie git, aucune régression) déplacé vers `svg retouche/Validé/`.
5. ✅ Validation : `typecheck` OK ; `verify-diagram`/`verify-sim`/`verify-components` OK ; contrôle visuel headless (Chrome) — 4 halos LED aux bonnes couleurs, bouton reset présent, toutes les broches POWER/GND tombent sur la grille de 10 px.

# v2026.7.1

1. ✅ **Migration dessin retouché → fork direct** (fin de l'overlay `board-drawings.mts`/`pin-overrides.mts`) pour `resistor`, `hcsr04`, `dht22`, `ntc-temp`, `heartbeat`, `sound`, `tilt`, `microsd`, `slide-switch` : chaque fork importe désormais son SVG retouché (`./externe/<type>.svg`) et le rend lui-même via `unsafeSVG`, `pinInfo` codé en dur (repère grille 10 px), broches POWER/GND vérifiées alignées. Retrait des entrées `DRAWINGS`/`PIN_OVERRIDES`/`pinScale` devenues inutiles pour ces 9 types.
2. ✅ `small-sound-sensor` : halos LED PWR/DO (`ledPower`/`ledSignal`) reportés en cercles frères du dessin importé, réutilisant le filtre `#ledFilter` du SVG retouché.
3. ✅ `slide-switch` : animation du curseur 100 % CSS conservée (id `handle` du dessin retouché).
4. ✅ Fichiers `.edit.svg` migrés déplacés vers `svg retouche/Validé/`.
5. ✅ Validation : `typecheck` OK ; `verify-diagram`/`verify-sim`/`verify-components` OK.

# v2026.7.0

1. ✅ **Bug grille magnétique** : un composant posé (glisser-déposer ou clic palette) se calait **1 px monde hors grille** — flagrant en zoomant fort ensuite, alors qu'un déplacement à fort zoom collait « presque parfaitement ». Cause : [`canvasPoint`](src/webview/diagram/editor.mts) soustrayait `rect.left/top` (bord **extérieur** de la bordure 1 px du canvas) alors que l'origine du monde — et de la grille peinte — est au bord **intérieur** : toute conversion écran→monde était décalée de 1/zoom px monde (1 px à 100 %, 0,11 px à 876 %, d'où l'asymétrie pose/déplacement). Corrigé en soustrayant `clientLeft/clientTop` (épaisseur de bordure) dans `canvasPoint` et dans l'ancrage du zoom molette (`onWheel`).
2. ✅ **Validation** : repro headless (Chrome, vrai éditeur + vrai CSS) — pose drag-drop à 100 %, pose à 876 %, pose au centre visible : broche 1 **exactement** sur la grille (mod 10 = 0,000) dans tous les cas, contre 1 px d'écart avant correction ; maths du déplacement inchangées. `typecheck` OK ; `verify:diagram` OK ; build OK.

# v2026.6.87

1. ✅ **Fork complet de `@wokwi/elements` 1.9.2** : les 36 éléments utilisés + 9 fichiers support (`pin`, `utils/*`, `types/rgb`, `patterns/pins-female`, police LCD) sont copiés dans [`src/webview/composants/`](src/webview/composants/) au format maison (.mts, **sans décorateurs** : `static properties` + `declare` + constructeur, imports `.mjs`, en-tête d'attribution). Licence MIT conservée : [`LICENSE-wokwi.md`](src/webview/composants/LICENSE-wokwi.md). Les retouches se feront désormais **directement dans ces fichiers**.
2. ✅ **Balises renommées `wokwi-*` → `kablix-*`** (36 tags, catalogue mis à jour). Compat totale : les fichiers `.kablix` stockent des types courts (inchangés) ; l'import/export Wokwi (`wokwi.mts`) convertit par échange de préfixe 1:1.
3. ✅ **Dépendance `@wokwi/elements` supprimée** de `package.json` ; `lit` 3.3.3 passe en dépendance directe (surveillée par `updates.ts` à la place de `@wokwi/elements` ; aide mise à jour). Plus aucune référence directe à wokwi dans le code (seules restent l'attribution MIT et l'interop diagram.json).
4. ✅ **slide-pot.mts fusionné** dans le fork [`slide-potentiometer-element.mts`](src/webview/composants/slide-potentiometer-element.mts) (dessin retouché + broches sur grille + glisse réimplémentée) ; l'ancienne machinerie de drag d'origine (CTM workaround, zoom storybook) retirée avec son dessin.
5. ✅ Scripts de retouche/probe ([`build-retouche.mjs`](scripts/build-retouche.mjs), `_gen-pot-schema`, `_probe-mega`) rebranchés sur les forks locaux.
6. ✅ **Validation** : typecheck OK ; build OK ; `verify:all` 9 suites OK ; **comparaison headless fork ↔ amont** (Chrome, mêmes attributs) : 35/35 éléments **identiques** (viewBox, taille, `pinInfo`, SVG interne), slide-potentiometer retouché fonctionnel ; LCD `text` validé par propriété **et** par attribut.

# v2026.6.86

1. ✅ **Bug** : le bouton 6 mm affichait un cercle noir (repos) / blanc (appuyé) au lieu du dégradé teinté attendu. Cause : la retouche Inkscape avait figé les dégradés `grad-up/down-pushbutton0` en coordonnées absolues (`gradientUnits="userSpaceOnUse"`, vecteur minuscule) alors que le cercle avait été mis à l'échelle/déplacé — le dernier point du dégradé (sans couleur = noir) débordait sur tout le disque. Remis en `objectBoundingBox` (0→1, comme le composant Wokwi d'origine) dans [`button-6mm.svg`](src/webview/composants/externe/button-6mm.svg) : le bombé blanc→couleur→ombre s'affiche correctement, quelle que soit la couleur choisie. Bouton 12 mm non touché (déjà correct, coordonnées locales préservées).
2. ✅ `verify:all` : 9 suites OK ; build OK.

# v2026.6.85

1. ✅ **Bug** : sur le bouton 12 mm (`button`), le capuchon changeait de couleur seulement sur le dégradé (anneau) — le disque plein restait vert (`reflectButtonColor` accrochait à tort un point de fixation de coin, dont le `fill` hérité ne contient pas `url()`). Corrigé : le disque plein est repéré comme le frère suivant de `.button-active-circle` (ordre Wokwi), pas par recherche globale. Bouton 6 mm déjà correct.
2. ✅ `verify:all` : 9 suites OK ; typecheck OK ; build OK.

# v2026.6.84

1. ✅ **Bug** : la couleur du bouton (attribut `color`, inspecteur) restait figée sur le dessin retouché (`button`, `button-6mm`) — le SVG capté fige les dégradés/le capuchon à la couleur du moment de la retouche. Ajout de `reflectButtonColor` ([`drawing-feedback.mts`](src/webview/diagram/drawing-feedback.mts)), appliquée à la création et à chaque changement via l'inspecteur ([`updatePartAttr`](src/webview/diagram/editor.mts)). Le composant reste interactif (élément @wokwi transparent inchangé).
2. ✅ `verify:all` : 9 suites OK ; typecheck OK ; build OK.

# v2026.6.83

1. ✅ **Dessins retouchés intégrés : NeoPixel, matrice NeoPixel, OLED, les 4 LCD, bouton, bouton 6 mm, DIP switch, joystick** (depuis [`svg retouche/`](svg%20retouche/) via `_clean-board-svg.mjs` → [`externe/`](src/webview/composants/externe/), surcharges de broches recalées via `_probe-overrides.mjs`, convention « repère dessin, tel quel »). NeoPixel/matrice/OLED/LCD I²C inchangés (déjà à jour) ; `lcd` et `lcd-parallel-20x4` régénérés (retouches cosmétiques) ; **bouton, bouton 6 mm, DIP switch passés en convention dessin** et **joystick ajouté** ([`pin-overrides.mts`](src/webview/diagram/pin-overrides.mts), [`board-drawings.mts`](src/webview/diagram/board-drawings.mts)).
2. ✅ **Composants interactifs sur dessin retouché** : l'élément @wokwi n'est plus masqué mais rendu **transparent et cliquable par-dessus le dessin** (`part__src-el--live`, [`styles.css`](media/styles.css)), calé sur les pastilles par un **ajustement affine broches→surcharges** (`alignLiveElement`, [`editor.mts`](src/webview/diagram/editor.mts)) : clics, Ctrl+clic (verrou), glisser du manche passent par l'élément d'origine, y compris pendant la simulation (aucun changement dans [`sim.mts`](src/webview/sim.mts)).
3. ✅ **Retour visuel sur le dessin** (`attachInteractiveFeedback`, [`drawing-feedback.mts`](src/webview/diagram/drawing-feedback.mts)) : capuchon enfoncé des boutons (`.button-active-circle`, masqué au repos), leviers du DIP switch (`use #switch`, y = −7,2 si ON), manche du joystick (translation du `#knob`, échelle lue dans son transform) + SEL en blanc à l'appui.
4. ℹ️ **Potentiomètre : rien à intégrer** — seul fichier existant `Validé/pot.edit.OK.svg` = SVG généré non retouché (pastilles d'origine hors grille), validé « OK » tel quel. Pipeline prêt si un `pot.edit.svg` retouché apparaît dans `svg retouche/`.
5. ✅ `verify:all` : 9 suites OK ; typecheck OK ; build OK.
