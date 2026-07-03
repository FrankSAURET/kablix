# À faire
- Utilise l'icone media\serialMonitor.svg pour l'icone qui ouvre et ferme le moniteur/console

1. ✅ Retoucher **NeoPixel**, les **4 LCD**, **matrice NeoPixel**, **OLED display**, **Bouton**, **bouton poussoir**, **DIP switch**, **joystick**, **potentiomètre** à partir des fichiers [`svg retouche/nnn.edit.svg`](svg%20retouche/). → v2026.6.83 (⏳ potentiomètre : pas de fichier retouché — `Validé/pot.edit.OK.svg` est le généré validé tel quel, rien à intégrer)
2. ✅ Pouvoir **fermer l'afficheur série**. Ajouter une icône (écran) dans la barre de simulation, tout à droite, pour l'ouvrir/fermer. → v2026.6.80
3. ✅ Renommer le **moniteur série en « Console »** pour les Pico. → v2026.6.80
4. ✅ Barre de simulation : mettre en **jaune sur rouge** le bouton qui affiche le nom du fichier de simulation si **aucun fichier n'est choisi**. Le faire **clignoter 3 fois** si on lance la simulation alors qu'il est jaune. Le repasser dans sa couleur actuelle quand un fichier est choisi. → v2026.6.80
5. ✅ **Bug** : les composants ne se positionnent pas sur la grille en fort zoom. → v2026.7.0
6. ✅ **Bug** : le routage passe toujours par-dessus les composants. → v2026.6.82 (récidive : l'A\* saturait dès le 3ᵉ fil et le repli en Z traversait les composants d'extrémité)
7. ✅ À l'**ouverture d'un projet**, centrer/ajuster la vue automatiquement (comme le bouton « recentrer et ajuster »). → v2026.6.80
8. ✅ À chaque **chargement d'un fichier Python** : effacer la console, éteindre la simulation, réinitialiser les composants. À l'**arrêt de la simulation** : effacer la console, réinitialiser les composants. → v2026.6.80
9. ⬜ Mettre à jour le **câblage interne du potentiomètre** → [`svg/pot-schema.edit.svg`](svg/pot-schema.edit.svg).

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
