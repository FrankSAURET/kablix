# À faire
1. Nano : retoucher nano-pinout.svg (module central redimensionné) puis réactiver le poster dans pinout.mts
2. Servo : test qui s'exécute très lentement — SI le problème persiste, m'envoyer ton programme de test (delay/refresh/avr8js à diagnostiquer). Le débordement du bras est déjà corrigé (v49).
3. Retoucher externe/servo.edit.svg (Inkscape) : marqueur `axis` (croix magenta) sur le vrai axe ; `horn-arm` (un seul bras) rendu beau ; corps recalé ; pastilles pin-* face aux fils ; réduire viewBox/width/height à la place de la rotation. Puis me le dire → je reporte axis + pin-* dans pinInfo.

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
