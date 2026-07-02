# À faire
- Utilise l'icone media\serialMonitor.svg pour l'icone qui ouvre et ferme le moniteur/console

1. ✅ Retoucher **NeoPixel**, les **4 LCD**, **matrice NeoPixel**, **OLED display**, **Bouton**, **bouton poussoir**, **DIP switch**, **joystick**, **potentiomètre** à partir des fichiers [`svg retouche/nnn.edit.svg`](svg%20retouche/). → v2026.6.83 (⏳ potentiomètre : pas de fichier retouché — `Validé/pot.edit.OK.svg` est le généré validé tel quel, rien à intégrer)
2. ✅ Pouvoir **fermer l'afficheur série**. Ajouter une icône (écran) dans la barre de simulation, tout à droite, pour l'ouvrir/fermer. → v2026.6.80
3. ✅ Renommer le **moniteur série en « Console »** pour les Pico. → v2026.6.80
4. ✅ Barre de simulation : mettre en **jaune sur rouge** le bouton qui affiche le nom du fichier de simulation si **aucun fichier n'est choisi**. Le faire **clignoter 3 fois** si on lance la simulation alors qu'il est jaune. Le repasser dans sa couleur actuelle quand un fichier est choisi. → v2026.6.80
5. ⬜ **Bug** : les composants ne se positionnent pas sur la grille en fort zoom.
6. ✅ **Bug** : le routage passe toujours par-dessus les composants. → v2026.6.82 (récidive : l'A\* saturait dès le 3ᵉ fil et le repli en Z traversait les composants d'extrémité)
7. ✅ À l'**ouverture d'un projet**, centrer/ajuster la vue automatiquement (comme le bouton « recentrer et ajuster »). → v2026.6.80
8. ✅ À chaque **chargement d'un fichier Python** : effacer la console, éteindre la simulation, réinitialiser les composants. À l'**arrêt de la simulation** : effacer la console, réinitialiser les composants. → v2026.6.80
9. ⬜ Mettre à jour le **câblage interne du potentiomètre** → [`svg/pot-schema.edit.svg`](svg/pot-schema.edit.svg).

# v2026.6.83

1. ✅ **Dessins retouchés intégrés : NeoPixel, matrice NeoPixel, OLED, les 4 LCD, bouton, bouton 6 mm, DIP switch, joystick** (depuis [`svg retouche/`](svg%20retouche/) via `_clean-board-svg.mjs` → [`externe/`](src/webview/composants/externe/), surcharges de broches recalées via `_probe-overrides.mjs`, convention « repère dessin, tel quel »). NeoPixel/matrice/OLED/LCD I²C inchangés (déjà à jour) ; `lcd` et `lcd-parallel-20x4` régénérés (retouches cosmétiques) ; **bouton, bouton 6 mm, DIP switch passés en convention dessin** et **joystick ajouté** ([`pin-overrides.mts`](src/webview/diagram/pin-overrides.mts), [`board-drawings.mts`](src/webview/diagram/board-drawings.mts)).
2. ✅ **Composants interactifs sur dessin retouché** : l'élément @wokwi n'est plus masqué mais rendu **transparent et cliquable par-dessus le dessin** (`part__src-el--live`, [`styles.css`](media/styles.css)), calé sur les pastilles par un **ajustement affine broches→surcharges** (`alignLiveElement`, [`editor.mts`](src/webview/diagram/editor.mts)) : clics, Ctrl+clic (verrou), glisser du manche passent par l'élément d'origine, y compris pendant la simulation (aucun changement dans [`sim.mts`](src/webview/sim.mts)).
3. ✅ **Retour visuel sur le dessin** (`attachInteractiveFeedback`, [`drawing-feedback.mts`](src/webview/diagram/drawing-feedback.mts)) : capuchon enfoncé des boutons (`.button-active-circle`, masqué au repos), leviers du DIP switch (`use #switch`, y = −7,2 si ON), manche du joystick (translation du `#knob`, échelle lue dans son transform) + SEL en blanc à l'appui.
4. ℹ️ **Potentiomètre : rien à intégrer** — seul fichier existant `Validé/pot.edit.OK.svg` = SVG généré non retouché (pastilles d'origine hors grille), validé « OK » tel quel. Pipeline prêt si un `pot.edit.svg` retouché apparaît dans `svg retouche/`.
5. ✅ `verify:all` : 9 suites OK ; typecheck OK ; build OK.
