# À faire
1. (noté pour plus tard je dois préciser) Faire un visualisateur virtuel ou utiliser teleplot
2. (noté pour plus tard je dois préciser) ajouter une LDR, une CTN, une CTP avec paramètres + simulation qui prends en compte les résistances
3. un double clic sur le nom du fichier de simulation l'ouvre dans le volet de gauche (à gauche de kablix)
4. Le chargement d'un projix doit couper la simulation en cours
5. Le dht22 ne marche pas la commande capteur = dht.DHT22(Pin(13)) génère une erreur.
6. Anneau neopixel ne marche toujours pas. De plus les variables r,g,b ne sont jamais affichés en mode pas à pas. Demande moi mon programme de test.
7. vss de neopixel est une patte gnd qui doit passer le fil en noir
8. neopixel ne marche pas non plus (la led unique)
9. Matrice neopixel ne marche pas non plus.
10. oled display(ssd1306)  ne marche pas non plus. Rien d'affiché. je peux te passer le prg de test et la librairie. Testé en i2c.
11. TFT display ne marche pas non plus.


# v2026.7.77
1. ✅ Bulle du bouton REPL non traduite : `l10n.t('Start an interactive MicroPython REPL (no script)')` était déjà en place côté code (panel.ts:1004) mais la clé était absente de `l10n/bundle.l10n.fr.json` → retombait sur le texte anglais brut. Ajoutée (« Démarrer un REPL MicroPython interactif (sans script) »). Vérifié : c'était la seule clé `l10n.t(...)` de panel.ts manquante au bundle FR (62 clés utilisées, 1 manquante).

# v2026.7.76
1. ✅ Point de 2 px aux extrémités d'un fil sélectionné (signale qu'on peut débrancher) : le point existait bien dans le DOM (`.wire-endpoint`, `buildEndpointHandles`, editor.mts — code jamais cassé depuis son introduction v2026.6.29) mais avait perdu toute bordure/ombre en v2026.6.40 (réduit de 12px à 2px « discret »), le laissant visuellement invisible sur un fil de couleur proche (bleu/vert dupont) — d'où l'impression de disparition totale. Ajout d'une bordure blanche 1px + ombre portée (media/styles.css, `.wire-endpoint`), même traitement que `.wire-handle` (poignées de coude, déjà contrastées « sur n'importe quel fond »). Taille du point inchangée (2px), zone de clic élargie (`::after`) inchangée. Vérifié : `buildHandles`/`buildEndpointHandles` créent bien les 2 poignées en rendu réel (composants + editor bundlés ensemble) avec le nouveau style calculé (bordure blanche, box-shadow noire, 2px, z-index 8) — la capture visuelle headless synthétique n'a pas pu confirmer le rendu final des web components (Lit ne s'affiche pas dans cet environnement de test), à confirmer en usage réel.

# v2026.7.75
1. ✅ Bandeau « ⚠ Simulation en cours : édition désactivée » : était centré à la même hauteur (top:8px) que les 2 barres d'outils du canvas (« entre » elles), ce qui le faisait apparaitre à côté plutôt que rattaché à la barre de simulation. Repositionné en dessous de la barre de simulation (gauche) : `top: 46px` au lieu de `8px` (media/styles.css, `.sim-banner`). Vérifié en rendu Chrome headless : aucun chevauchement avec les boutons.

# v2026.7.74
1. ✅ Les éléments de simulation (curseur/bouton d'un capteur) doivent apparaitre par-dessus tout : en édition, les fils passent volontairement au-dessus des composants (z-index 5 vs 3, pour rester lisibles) — en simulation, cela pouvait cacher le curseur d'un capteur traversé par un fil, ou un composant voisin posé après lui dans le schéma pouvait le recouvrir. `setLocked()` (editor.mts) ajoute désormais la classe `part--sim-active` (z-index 60) sur tout composant à contrôle de simulation (`simControl`) pendant que la simulation tourne. Vérifié en rendu Chrome headless (capteur de pouls chevauché par un fil + un HC-SR04 voisin) : le curseur reste au premier plan.

# v2026.7.73
1. ✅ Capteur de pouls (heart-beat) : signal simulé irréaliste — ligne de base quasi nulle (0,08) avec un pic très étroit atteignant presque le plein échelle. Un vrai capteur KY-039 varie peu en valeur absolue (bruit + faible modulation autour d'une ligne de base élevée) ; avec une ligne de base proche de zéro, l'algorithme de détection par seuil relatif classique (`max_value -= 1000 // delay_msec`, tuto KY-039 fourni par Frank) perd le pic en 1-2 échantillons à 60 ms d'échantillonnage et redéclenche sur la même descente → BPM mesuré ~2× trop élevé (ex. 72 BPM réglé → ~140-166 BPM mesurés). Vérifié bout-en-bout avec le vrai script Python de Frank (`heartbeat_detected`) rejoué sur PicoEngine : ligne de base relevée à 0,6 + amplitude 0,15 + pic élargi (0,05→0,10) → BPM mesuré correct sur la plage 45-100 BPM (majorité des mesures exactes ±1), dégradation progressive au-delà de 110 BPM par nature de l'algo (pas d'échantillonnage fixe 60 ms trop grossier à haute fréquence — limite de l'algo, pas de la simulation). verify:all OK.
2. ✅ (déjà livré en v2026.7.72) Curseur du capteur de pouls resserré à la largeur du composant — confirmé toujours correct après ce lot.

# v2026.7.72
1. ✅ Curseurs de simulation trop gros/longs, texte trop loin : style partagé `utils/sim-control-styles.mts` (min-width du curseur 90→44px, gap texte↔curseur 4→2px, police 11→10px) appliqué à hc-sr04, dht22, capteur de pouls, NTC température et à la base commune flamme/gaz/son/lumière (`analog-digital-sensor.mts`) — un seul point de vérité au lieu de 5 copiés-collés divergents. Modificateur `.val--wide` (46px) gardé pour les valeurs longues (bpm, °C négatifs) afin de ne rien tronquer. Vérifié en rendu Chrome headless (hc-sr04 3 chiffres, bpm 180, dht22 humidité/température négative) : rien de coupé ni chevauché.

# v2026.7.71
1. ✅ Capteur à ultrason (HC-SR04) ne marchait pas sur Pico/MicroPython : `PicoEngine` n'implémentait pas du tout `setUltrasonic` (méthode optionnelle du moteur, ignorée en silence par `sim.mts`) — TRIG/ECHO n'était câblé que côté AVR (Uno/Mega). Ajout de l'implémentation Pico : ECHO programmé en TEMPS SIMULÉ (nanosecondes horloge RP2040) et non via `setTimeout` réel (un timer JS de 0,2 ms peut se déclencher après des dizaines de ms simulées vu le cadencement temps réel du simulateur — l'écho arrivait hors fenêtre d'attente du firmware). Bug additionnel corrigé au passage dans `KablixSimulator.execute()` : le budget d'un lot d'instructions était figé en début de lot et pouvait sauter par-dessus une échéance programmée en cours de lot (front TRIG survenant à mi-lot) — recalculé à chaque instruction désormais. Vérifié bout-en-bout (vrai firmware MicroPython, TRIG/ECHO réel) : largeur ECHO mesurée = 1160 µs pour 20 cm (exact, 58 µs/cm). verify:all OK.

# v2026.7.70
1. ✅ PIR : la bulle « Détecte les mouvements de la souris » prend l'apparence d'une bulle native du navigateur (jaune pâle, bordure grise, coins carrés) — distincte des 2 autres bulles (fond sombre, inchangées).

# v2026.7.69
1. ✅ Capteur d'inclinaison — refonte complète (item « ne provoque une inclinaison que quand incliné puis revient... »). Bouton « Incliner »/« Incliné » SUPPRIMÉ : un simple CLIC sur le composant EN SIMULATION bascule l'état immédiatement (tout ou rien). Ctrl+clic = maintien permanent (`sticky`, même pattern que le PIR) ; recliquer normalement annule le maintien. Bulle contextuelle au survol : « Cliquer pour incliner / Ctrl + clic pour maintenir incliné » (→ « ...pour arrêter le maintien » si déjà maintenu).
2. ✅ Déformation visuelle : ROTATION CSS remplacée par une bascule TRAPÉZOÏDALE (`transform: matrix()` approchant le lattice2 de `tilt-incline.svg` fourni par Frank — bord droit fixe, bord gauche resserré ~5px haut/bas). `tilt.svg` restructuré : le corps est isolé dans deux groupes `.tilt-shape` (déformables), les 3 groupes de broches (g71/g70/g69) restent HORS de ces groupes → jamais déformés. Vérifié en Chrome headless : delta broches avant/après bascule = (0.000,0.000) px exact sur les 3 pattes ; capture visuelle confirmant le trapèze.

# v2026.7.68
1. ✅ Bandeau simulation : « ⚠ Simulation en cours » → « ⚠ Simulation en cours : édition désactivée » (fr + clé i18n renommée dans `i18n.mts`).
2. ✅ Bulle du bouton ☢ (K, bascule câblage interne/brochage) traduite en français : ajout des 2 clés manquantes dans `l10n/bundle.l10n.fr.json` (bundle VS Code natif, distinct du dict webview) — restaient affichées en anglais faute d'entrée.
3. ✅ Changement de propriété d'attribut (ex. K/A commune) dynamique si le câblage interne est affiché : `editor.mts` régénère les bulles de pastille et redessine le câblage interne (`renderInternalWiring`) immédiatement sur `attr === 'common'`, au lieu de rester figé sur l'ancienne polarité.
4. ✅ Changement de taille (afficheur 2↔4 digits, colonnes clavier) alors que le câblage interne / brochage est affiché : `scheduleSettle()` redessine `renderInternalWiring`/`renderPinout` une fois le dessin externe stabilisé (au lieu de rester à l'ancienne taille).
5. ✅ Texte des broches du clavier trop épais : `stroke:none` ajouté aux 12 `<text>` chiffres/symboles (1-9,*,0,#) des SVG `keypad-3col`/`keypad-4col` (n'avaient que `stroke-width` sans `stroke:none`, contrairement aux lettres A-D) + `font-weight: 300` en CSS shadow DOM.
6. ✅ PIR : détection de mouvement réel (pas juste présence) avec tolérance 400 ms — `hovering` s'arme sur un déplacement de souris effectif et retombe après un délai de grâce (`MOTION_GRACE_MS`) sans mouvement, au lieu de suivre l'entrée/sortie du survol. Bulle contextuelle à 3 états : « Ctrl+clic pour un mouvement permanent » (simulation, hors survol actif) → « Détecte les mouvements de la souris » (mouvement en cours) → « Mouvement permanent (Ctrl+clic pour arrêter) » (sticky, toggle Ctrl+clic).
7. ✅ Pinout mega : retouche z-order de Frank réimportée (SVG déjà remplacé, importé tel quel par `pinout.mts` — aucun pipeline de génération à relancer).

# v2026.7.67
1. ✅ Posters de brochage nano/uno/mega : les 3 sont posés en surimpression **sans déformation** (fini l'étirement vertical `k` qui décalait uno et mega). Chaque poster porte des pastilles de calage aux positions exactes des pins ; pose via la transform mesurée `coord_carte = s·coord_poster + t` (échelle uniforme : nano/uno s=1, mega s≈3.78). Transforms mesurées au navigateur (Chrome headless, `getBoundingClientRect` des pastilles vs `pinInfo` du composant, régression, erreur max 0,15 u sous-pixel).
2. ✅ Nano réactivé (était désactivé). Alignement des 3 vérifié visuellement (rendu headless carte externe + poster superposés) : rangées haute/basse + blocs ICSP/digital pile sur les pins.
3. ✅ Pastilles rouges (`#ee0000`/`#aa0000`) + numéros de pin rouges (`#aa0000`) — repères de calage de Frank — retirés des 3 SVG posters (36 nano, 31 uno, 85 mega). Zéro rouge restant.
4. ✅ `pinout.mts` : deux modes de pose explicites — `stretch` (pico/picow, inchangé) et `align` (nano/uno/mega). `renderPinout` gère les deux. typecheck + build OK.

# v2026.7.66
1. ✅ Servo au degré près (item « aucune rotation pour 10-40°, 60→45°, 140→180° ») : le mapping impulsion→angle était figé sur 1000-2000 µs — tout programme SG90 en 500-2500 µs (dont celui de Frank) voyait ses angles écrasés/clampés. Nouvelles propriétés d'inspecteur « Impulsion à 0° (µs) » / « Impulsion à 180° (µs) », défaut 500/2500 (datasheet SG90) ; régler 544/2400 pour la lib Servo Arduino. Interpolation linéaire entre les deux.
2. ✅ Précision vérifiée moteur réel (UF2 v1.28, PWM 50 Hz) : angles 0/1/10/33/45/90/135/170/179/180° → écart max +0,05°. verify:all OK.

# v2026.7.65
1. ✅ Simulation Pico 4× trop lente (programme servo de Frank : sleep(0.5) durait ~2 s) — cause racine : quand MicroPython arme le endpoint USB OUT du CDC sans données côté hôte, rp2040js répondait « transfert vide » en 10 µs et TinyUSB réarmait aussitôt → une IRQ toutes les ~25 µs simulées qui avortait chaque WFE. time.sleep() était une boucle chaude (20 000 réveils par 0,5 s). Correctif : réponse à la cadence d'un vrai hôte USB full-speed (1 ms) → 500 réveils, le firmware dort vraiment.
2. ✅ Cadencement TEMPS RÉEL du simulateur Pico (KablixSimulator) : ancre temps réel ↔ temps simulé. Sans elle, les sleep (désormais de vrais sauts d'horloge) s'écouleraient quasi instantanément ; avec elle, sleep(0.5) dure ~0,5 s réelle (mesuré 0,47-0,51 s par pas sur le balayage servo). Le code calculatoire reste sous le temps réel (plafond interpréteur rp2040js) : retard > 50 ms → ré-ancrage sans dette (pas de rattrapage qui escamoterait les sleep suivants).
3. ✅ `core.cycles` avance maintenant pendant les sauts WFE (bump AVANT le tick d'horloge) : la mesure d'impulsions servo/PWM/WS2812 (horodatée en cycles) reste juste PENDANT les sleep — vérifié : impulsions 500→2500 µs mesurées pendant le balayage 0→180°. Bonus : verify:micropython passe à 0,6 s ; le REPL inactif ne brûle plus 100 % CPU. verify:all OK.

# v2026.7.64
1. ✅ Servo : les 3 palonniers dessinés par Frank (horn-single = 1 branche, horn-double = 2, horn-cross = 4) sont intégrés ; feuille figée à 160×140 (lue dans le SVG). Chaque forme tourne autour de l'axe (calé sur le rond central via le translate Inkscape). Rendu headless validé (3 formes × 0/90/180°).
1. ✅ Broches recalées : Frank a déplacé le groupe `pins` (translate −9,5 ; −20,25) → pinInfo passé à GND(10,60) / V+(10,70) / PWM(10,80), arrondi sur la grille 10 px.

# v2026.7.63
1. ✅ Servo : passage à TROIS palonniers dessinés à la main (`horn-single/double/cross`) au lieu de la duplication par le code. Les 3 groupes sont pré-remplis avec une copie du bras actuel de Frank (à compléter pour double/cross, cf. à faire n°3). Le composant affiche le groupe choisi et le tourne autour de l'axe selon l'angle simulé ; la taille de feuille (viewBox) reste lue dans le fichier (ajustable). Rendu headless validé (3 formes × angles).

# v2026.7.62
1. ✅ Servo : dessin de Frank intégré (servo.edit.svg retouché — corps bleu, palonnier réaliste dans `horn-arm`, axe `axis` posé sur le rond central). Le composant lit l'axe EN TENANT COMPTE du `translate` qu'Inkscape ajoute quand on déplace le groupe (readAxis corrigé). single/double/cross dupliquent le bras de Frank autour de l'axe ; rotation validée headless. Broches pinInfo inchangées (x=20, y=80/90/100 — non déplacées par Frank).

# v2026.7.61
1. ✅ Servo — structure « UN SEUL bras » : le .edit.svg ne contient plus qu'un bras (`horn-arm`, vers le haut) + un marqueur d'axe (`axis`, croix magenta). Le composant DUPLIQUE ce bras en 1/2/4 branches (single/double/cross) et tourne l'ensemble autour de l'axe LU dans le fichier. Frank ne retouche donc qu'un bras + l'axe. Feuille agrandie 180×180 (marge pour rotation complète, réduisible par Frank).
2. ✅ Le composant lit la TAILLE DE FEUILLE (viewBox/width/height) et l'AXE directement dans servo.edit.svg → Frank peut ajuster la feuille et déplacer l'axe sans toucher au code. Rendu headless validé (single 1 bras, double 2, cross 4 ; rotation 0/45/90/180/270° autour de l'axe).

# v2026.7.60
1. ✅ Message « Simulation en cours » revu (item « le message sur la souris ne va pas ») : bandeau PERMANENT rouge sur jaune, centré en haut du canvas ENTRE les deux barres d'outils (`#sim-banner`, même hauteur top:8px), visible pendant toute la simulation. Clignote 3× (inversion rouge↔jaune) sur tentative d'édition interdite (`onBlockedEdit`).
2. ✅ Supprimés : l'ancien message flottant qui suivait le curseur (v57) ET le bandeau d'avertissement de la palette (`showLockWarning` + propriété `lockWarning` retirés d'editor.mts, plus réinséré au rebuild de la palette).

# v2026.7.59
1. ✅ Servo : dessin sorti dans `externe/servo.edit.svg` (RETOUCHABLE par Frank), un seul fichier « tout compris » — groupes `body` + `horn-single/double/cross` + repères `grid`/`pins` (pastilles pin-GND/V+/PWM). Boîte agrandie 170×125 conservée. AXE (moyeu) RECENTRÉ au centre de la boîte (85 ; 62.5) : corps + palonniers décalés en conséquence. Généré par `scripts/make-servo-edit.mjs`.
2. ✅ Le composant lit désormais servo.edit.svg (fin du bras procédural) : extraction des groupes (comptage de profondeur `<g>`, `<g/>` auto-fermants et commentaires gérés), affiche body + le bon horn-* et le fait tourner autour de l'axe. Rendu Chrome headless validé (3 formes × 5 angles : corps visible, axe centré, rotation OK). NB : broches à recaler dans le .edit.svg (cf. à faire n°3).

# v2026.7.58
1. ✅ LED en PWM : ne clignote plus, elle VARIE en luminosité (item « en pwm la LED clignote »). Cause trouvée sans le programme : le rendu de la LED simple (case 'led') lisait le niveau INSTANTANÉ (`ledOn`, digital) — en PWM il alterne 0/1 à haute fréquence → clignotement au rythme du rafraîchissement. Correctif : si l'anode est pilotée par une broche MCU en PWM (`ledMcuPin` + `pulseActive`), on lit le rapport cyclique (`readPwmDuty`) et on le mappe sur `brightness` (halo plus ou moins opaque), comme la LED RGB et le 7 segments. Sinon, comportement digital inchangé.

# v2026.7.57
1. ✅ Message flottant « ⚠ Simulation en cours » : affiché près du curseur pendant toute la simulation (position fixe, suit la souris) et clignote 3× en rouge quand une action d'édition INTERDITE est tentée (clic gauche pour déplacer un composant passif, ou Suppr/Backspace sur une sélection — pendant le verrouillage). L'éditeur expose `onBlockedEdit` (appelé aux points de blocage : body pointerdown non-interactif, touche Suppr verrouillée) ; sim.mts gère le toast (`.sim-toast` / animation `.sim-toast--blink`). Ancrage « près souris » = choix de Frank. Déclenchement validé headless.

# v2026.7.56
1. ✅ Bouton ☢ (K) déplacé du composant vers la BARRE D'OUTILS droite (en haut à gauche, avant l'autoroutage). Il n'apparaît que lorsque le composant SÉLECTIONNÉ dispose d'un câblage interne ou d'un poster de brochage (`onSelectionChange` → `hidden`), et agit sur ce composant (`toggleSelectedSchema`) ; liseré bleu quand le schéma est affiché. Le badge par-composant (`.part__internal-toggle` dans le corps) est supprimé du rendu. Validé headless (uno → bouton visible, toggle actif).
2. ℹ️ 7 segments 2/4 chiffres (pinInfo centré) : décision de GARDER tel quel (ne pas étaler pinInfo). Étaler casserait les schémas déjà câblés par les utilisateurs pour un gain purement cosmétique (câblage interne resserré au centre au lieu d'étalé sous les chiffres). Point clos.

# v2026.7.55
1. ✅ PIR : détection au SURVOL de la souris sur le composant EN SIMULATION (OUT=1 tant que la souris est au-dessus). Ctrl+clic = mouvement PERMANENT (bulle « Mouvement permanent (Ctrl+clic pour arrêter) »), Ctrl+clic à nouveau pour arrêter. Point rouge de détection affiché. Plus de propriété d'état. Handlers dans le shadowRoot du composant (survol + Ctrl+clic avec stopPropagation, actifs même en mode verrouillé) ; le moteur lit `el.motion` (relu à chaque frame via `updateMotion`, setInput au changement). Validé headless.

# v2026.7.54
1. ✅ DHT22 : broche de données renommée SDA → DATA (composant + `dht22Bindings` qui la résout). Deux curseurs EN SIMULATION (💧 humidité 0-100 %, 🌡 température -40 → +80 °C) à la place des propriétés d'inspecteur ; le moteur relit `el.humidity`/`el.temperature` en direct (liste DHT22 re-poussée au moteur à chaque `input`). Binding DATA→D7 et curseurs validés headless.

# v2026.7.53
1. ✅ Capteur de pouls actif : EN SIMULATION, un curseur règle le pouls (0-200 bpm). La sortie analogique OUT reproduit une courbe de pulsation cardiaque (forme PPG : pic systolique + onde dicrotique, deux gaussiennes), régénérée à chaque frame selon le BPM (sim.mts `updatePulses`/`pulseWaveform`, appelé dans `renderTick`). BPM=0 → ligne de base.
2. ✅ Capteur de température NTC actif : curseur -55 → +125 °C en simulation. Sortie analogique de type thermistance NTC (R0=10 k, B=3950, série 10 k) : la tension DIMINUE quand la température monte (diviseur Rntc/(Rntc+Rsérie), monotone décroissant vérifié : -55→0.99, 25→0.50, 125→0.035). Plus de propriété d'inspecteur (choix Frank). Pilotée en direct via l'événement `input`.

# v2026.7.52
1. ✅ Capteurs flamme / gaz / son / lumière ACTIFS en simulation (items « capteur de flamme… » + « pareil pour gaz/son/lumière ») : nouvelle base commune `AnalogDigitalSensorElement` (utils/) — double sortie AOUT (analogique) + DOUT (tout ou rien). EN SIMULATION, un curseur d'intensité (0-100 %, libellé Flamme/Gaz/Son/Lumière) ; propriété `sensitivity` (0-100 %) dans l'inspecteur = seuil DOUT. Convention (choix Frank) : AOUT baisse quand l'intensité monte ; DOUT actif-BAS (LOW) quand intensité > sensibilité. LED de détection allumée quand détecté.
2. ✅ Nouveau kind catalog `ao-do-sensor` + `aoDoSensorBindings(diagram)` (résout séparément AOUT et DOUT câblés) ; binding live dans sim.mts (curseur → setAnalog/setInput à chaque `input`). Réutilise l'infra simControl/simulating.
3. ✅ Photorésistance rebaptisée « Capteur de lumière » (label i18n « Light sensor » → « Capteur de lumière »). Test verify-diagram mis à jour (photorésistance testée en double sortie AO→A2, DO non câblé).

# v2026.7.51
1. ✅ Capteur d'inclinaison : propriété d'état retirée de l'inspecteur. EN SIMULATION (attribut `simulating`), un bouton « Incliner »/« Incliné » bascule l'état (tout ou rien) directement sur le composant ; le capteur s'incline visuellement (rotation -22°). Le moteur lit `el.tilted` en direct via l'événement `input` (binding dédié dans sim.mts, séparé des autres digital-source qui restent sur `attrs.state`). Réutilise l'infra simControl/simulating (v50). Validé Chrome headless.

# v2026.7.50
1. ✅ Capteur à ultrason : « HC-SR04 » retiré du nom (« Ultrasonic sensor » / « Capteur à ultrason »). Propriétés `distancemin`/`distancemax` dans l'inspecteur (défaut 2 cm → 400 cm) à la place de `distance`.
2. ✅ Curseur de simulation ajouté (infra `simControl` + attribut `simulating` posé par l'éditeur en mode verrouillé) : en simulation, un curseur `range` borné min→max + une zone de saisie `number` (+ « cm ») choisissent la distance mesurée. Hors simulation, aucun contrôle visible. Clamp min/max validé (999→50 sur plage 10-50).
3. ✅ Distance mise à jour EN DIRECT pendant la simulation : chaque objet sensor est muté sur l'événement `input` du curseur (même référence de tableau relue par le moteur à chaque impulsion TRIG). Distance de départ = milieu de la plage.
4. ℹ️ Infra `simControl`/`simulating` réutilisable pour les prochains items (tilt, flamme, gaz, son, lumière, pouls, température) qui demandent aussi un contrôle en simulation.

# v2026.7.49
1. ✅ Servo — bras single/double/cross rétablis (item « les bras ne changent plus ») : l'ancien palonnier figé unique (path49, un seul galet très long) est RETIRÉ du dessin retouché au montage et remplacé par des palonniers dessinés en procédural (renderHorn), pilotés par la propriété `horn` (déjà exposée par le catalog). single = 1 bras, double = 2 opposés, cross = croix 4 branches.
2. ✅ Servo — bras qui « sortait de la zone d'affichage en bas » corrigé : boîte agrandie en hauteur (viewBox 0 0 170 125, étendu vers le BAS seulement → broches y=60/70/80 inchangées) + bras raccourci (rayon 34 px). Plus aucun débordement à 0° ni 180°. Validé Chrome headless (3 formes × 5 angles). NB : le volet « très lent » de l'item reste à faire (besoin du programme de test).

# v2026.7.48
1. ✅ Câblage interne 7 segments trop grand en hauteur à l'affichage (alors que les SVG externe/interne se superposaient parfaitement dans Inkscape) : la surimpression `.part__internal` était étirée sur `.part__body` (offsetWidth/offsetHeight), or ce corps DOM est plus HAUT que le dessin (span d'étiquette sous le SVG) et le dessin externe garde son ratio (letterbox). Correction (editor.mts `renderInternalWiring`) : on mesure le SVG externe réel (`svg.width/height.baseVal`) + sa marge de centrage (getBoundingClientRect) et on cale l'overlay dessus (left/top/width/height posés en JS ; `.part__internal` passe de `inset:0` à `top/left:0`). L'interne coïncide maintenant au pixel avec l'externe.

# v2026.7.47
1. ✅ Buzzer : dessin repris du schéma validé de Frank (`svg retouche/Validé/buzzer.edit.svg`) — disque noir, dôme central en dégradé radial, 2 pattes (noire = broche 1, rouge = broche 2). Pastilles de positionnement retirées ; broches calées à x=20/30, y=50 (grille 10 px), conformes au pinInfo du fork. Rendu Chrome headless validé (note de musique flottante conservée).

# v2026.7.46
1. ✅ Câblage interne 7 segments : retour au SCALE SIMPLE (comme v41) — le calage 2D (v44/45) écrasait le schéma quand pinInfo est resserré. Le schéma de Frank est juste mis à l'échelle de la boîte (box/viewBox), ses broches sont déjà bien posées dans son repère. 2/4 chiffres à nouveau étalés sous les chiffres.

# v2026.7.45
1. ✅ Schémas internes 7 segments repartis des fichiers d'origine `.edit.svg` de Frank (ronds de positionnement + trait couleur corrigé sur le 2 chiffres). Pipeline pointé sur *.edit.svg → clean → flip anode ; bbox du tracé inchangées (calage 2D conservé). Les *.edit.svg sont désormais LA source à retoucher.

# v2026.7.44
1. ✅ Câblage interne 7 segments : calage 2D (X + Y) sur les broches réelles. La boîte des broches du tracé dessiné (SCHEMA_PIN_BBOX, mesurée par variante) est envoyée sur la boîte des pinInfo — les fils tombent EXACTEMENT sur les pastilles (1 chiffre : parfait). Corrige v43 (calage Y seul + bornes fausses → décalage). NB : sur 2/4 chiffres, pinInfo étant centré, le câblage se resserre au centre (cf. « à faire » n°8).

# v2026.7.43
1. ✅ Câblage interne 7 segments : calage vertical sur les broches réelles (les fils du haut n'atteignaient pas les pattes, diodes décalées vers le bas). La rangée de broches du schéma [SCHEMA_PIN_TOP=9.55, SCHEMA_PIN_BOT=79.95] est étirée sur les broches du composant [min,max Y de pinInfo] — comme le poster de brochage. Remplace la compression fixe de 2 px (v42) qui décalait.
2. ✅ 4 chiffres : gros trait noir parasite supprimé (path1 stroke-width 11.3 sans couleur = doublon Inkscape d'un fil fin). Filtre « stroke-width > 5 » ajouté à _clean-7seg-schema.mjs ; clean + anode régénérés.

# v2026.7.42
1. ✅ Dessin 7 segments : contour des segments retiré (setSeg strokeWidth 0.05 au lieu de 0.96 — segments pleins, sans liseré épais, comme le modèle fourni par Frank).
2. ✅ Afficheur 4 chiffres : points gris parasites (ex-pattes CLN/COM) retirés — bandes de pastilles haut/bas réduites (width 70→60, 6 pastilles au lieu de 7).
3. ✅ Schéma interne 7 segments compressé de 2 px en hauteur (centré), il était trop haut de 2 px vs le corps (SEVEN_SEG_SHRINK dans internal-wiring.mts).

# v2026.7.41
1. ✅ Câblage interne 7 segments : abandon du générateur procédural, on branche désormais les VRAIS schémas dessinés à la main par Frank (interne/7seg-*.schema.svg) — nettoyés en *.clean.svg (scripts/_clean-7seg-schema.mjs) puis posés à l'échelle du corps (repère = viewBox). Épaisseurs et couleurs d'origine (traits fins), échelle correcte (les broches tombent sur les pastilles). Corrige v40 (échelle et traits gros du 1dig, 2/4dig faux).
2. ✅ Diodes retournables cathode↔anode pour les 3 (1/2/4 chiffres) : variante anode générée par retournement de chaque diode (triangle + barre, rotation 180°) via scripts/_flip-7seg-diodes.mjs → *.anode.svg. `attrs.common` choisit clean (cathode) ou anode. 8/16/32 diodes retournées.

# v2026.7.40
1. ✅ Câblage interne 7 segments restylé (bouton ☢) : traits fins (0.6) au lieu du gros trait noir 2px, réseau du commun en bleu (comme les SVG dessinés à la main). Diodes retournées selon cathode/anode commune (attrs.common) — déjà géré par le helper `diode`.
2. ✅ 2/4 chiffres allégés : une diode par segment posée près de sa broche (orientée selon common) mais NON reliée au segment (câblage segment non dessiné = lisible) ; seules les broches communes DIG1…DIGn reliées par un bus bleu.
3. ✅ Broches CLN et COM retirées de l'afficheur 4 chiffres (VARIANTS[4].pins dans 7segment-element.mts).

# v2026.7.39
1. ✅ Posters de brochage (bouton ☢) pour Arduino Uno et Mega 2560 : les SVG pinout (rangées haut/bas + pastilles power/gnd) sont posés en surimpression, calés au pixel sur la carte comme le Pico (bornes rTop/rBot mesurées sur les pastilles, validation Chrome headless). Uno pile aligné ; mega calé haut/bas (bloc de ports latéraux affiché sous la carte).
2. ⏳ Nano : poster écarté — sa bande de broches (0.489→0.646) est trop resserrée face au ratio de la carte, l'étirement (k≈1.6) déborde. Le SVG nano-pinout doit être retouché avant activation (import + entrée POSTERS commentés dans pinout.mts).

# v2026.7.38
1. ✅ LED allumée plus lumineuse : halo passé PAR-DESSUS le corps (z-order — `#g30` déplacé après `#g33` dans led.svg) et agrandi/intensifié (rayons 13/3/4.5 au lieu de 10/2/3, opacité du groupe 1 au lieu de 0.85). La LED rayonne au lieu d'un simple point lumineux masqué derrière le plastique.

# v2026.7.37
1. ✅ Corrige le scintillement de l'afficheur 7 segments multiplexé (2/4 digits) en simulation Pico : le rendu ~60 Hz échantillonne le balayage MicroPython à un instant quasi aléatoire par rapport au cycle de scan simulé, révélant parfois un digit fraîchement éteint avant que le suivant ne soit rallumé. Anti-scintillement temporel dans sim.mts (`SEVEN_SEG_SETTLE_MS`) : un nouvel état de segment n'est publié que s'il est resté identique un court délai réel (40 ms), absorbant ce battement.
2. ✅ Support PWM des segments (1 chiffre) : un segment piloté en rapport cyclique (variateur de luminosité) utilise la mesure de duty cycle (`readPwmDuty`, comme la LED RGB) plutôt que le niveau instantané.

# v2026.7.36
1. ✅ Corrige le scintillement de l'afficheur 7 segments 1 chiffre en simulation Pico (tentative initiale, insuffisante — cf. v2026.7.37) : anti-scintillement `sevenSegStable` basé sur la stabilité de l'état lu sur 2 frames.

# v2026.7.35
1. ✅ Retour arrière complet de la console xterm.js (v2026.7.34) : console maison restaurée (sim.mts, panel.ts, styles.css), dépendances @xterm retirées — le terminal ne fonctionnait pas en réel, et le bug de collage venait du presse-papier (résolu côté système, pas côté code).
2. ℹ️ Conservés : import keypad-4col.schema.svg réparé et travaux SVG en cours.

# v2026.7.34
1. ✅ Console série / REPL remplacée par un vrai émulateur de terminal xterm.js (le même que le terminal VS Code) embarqué dans la webview : séquences ANSI, \r\n, effacement de ligne, collage multi-lignes et flèches (historique MicroPython) gérés nativement — corrige définitivement les sauts de ligne parasites au collage.
2. ✅ Micro-émulation maison supprimée (processAnsi, verrous contentEditable, handler paste) ; Ctrl+C avec sélection = copie, sans sélection = interruption (0x03) ; curseur visible seulement en mode REPL ; hors REPL clavier désactivé (la ligne d'envoi reste pour Arduino).
3. ✅ CSS xterm extrait par esbuild dans dist/webview.css (chargé par le panel, ajouté au vsix).
4. ✅ Smoke test Chrome headless : xterm monté dans #serial sans erreur JS ; verify:all OK.
5. ℹ️ Import keypad-schema.svg → keypad-4col.schema.svg (fichier renommé à la main, build cassé sinon).
