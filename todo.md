# À faire
1. Nano : retoucher nano-pinout.svg (module central redimensionné) puis réactiver le poster dans pinout.mts
2. En pwm la LED clignote. Demande moi mon programme.
3. Le message "Simulation en cours : ..." doit toujours rester visible (flottant) et clignoter 3 fois si on essaye de faire qqc d'interdit
4. Le bouton ☢ (K) apparaîtra en haut à gauche de la barre d'outils de dessin (celle de droite). Uniquement pour les composants en disposant.
5. 7 seg 2/4 chiffres : pinInfo est CENTRÉ (broches x resserrées au milieu, ex 4dig 70-120 sur 200) → le câblage interne calé dessus se resserre au centre au lieu de s'étaler sous les chiffres. À décider : étaler pinInfo (casse les schémas déjà câblés) ou garder ainsi.
6. Le capteur de pouls doit reproduire une courbe de pulsation cardiaque sur la sortie analogique OUT. Un curseur permettra de régler le pouls de 0 à 200 Hz
7. Le capteur de température doit avoir un curseur -55°C à +125°C et une sortie analogique. La variation est celle d'une CBT normale (exponentielle inverse) si la T° augmente la tension diminue.
8. DHT22 : 2 curseur Humidité 0  à 100 % et température -40 à + 80°C. La pin SDA doit s'appeler DATA. 
9. Pour le PIR détecte les mouvements de la souris au dessu de lui. CTRL + clic = mouvement prrmanent indiqué dans la bulle lors de la siumulation.
10. Servo : test qui s'exécute très lentement (perf de simulation — nécessite ton programme de test pour diagnostiquer la cause : delay/refresh/avr8js).

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
