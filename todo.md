- Message d'avertissement si on lance la simulation sans fichier
# À faire
- ⏳ Refaire câblage interne pot → **base fournie** : [`svg/pot-schema.edit.svg`](svg/pot-schema.edit.svg) (corps + ronds VCC/SIG/GND, repère = coin haut-gauche). Dessiner le symbole IEC dans `#schema`, me le rendre → je remplace `potentiometer()` de [`internal-wiring.mts`](src/webview/diagram/internal-wiring.mts) (comme le clavier). Générateur : [`scripts/_gen-pot-schema.mjs`](scripts/_gen-pot-schema.mjs).
1. ✅ Schéma interne du clavier dessiné (3×4 et 4×4) → intégré (cf. v2026.6.45).
2. ⏳ La simulation est très lente. **Nécessite un profilage (la boucle AVR tourne déjà en temps réel `CLOCK_HZ/60`) — ne pas toucher la précision temporelle à l'aveugle.**
3. ⏳ Reprend le svg fournis dans svg retouche pour tous les composants → **changement d'approche v2026.6.48** : l'éditeur affiche le **dessin du SVG retouché** (broches = ronds, repère = coin haut-gauche feuille), élément Wokwi caché pour la simu. **Mega = test (dessin OK + simu corrigée v2026.6.50)** ; les autres à recréer pareil.
4. ✅ sur les composants qui ont des power et gnd, recentre les ronds rouge ou noir sur la pastille → désormais via les ronds du SVG retouché (v2026.6.48 ; le « sur pad » auto de 6.47 annulé).
5. ✅ Le clavier 4 x 3 a toujours les connexions en dehors du connecteur → v2026.6.46.
6. ✅ Le routage automatique est mieux : 2 fils peuvent se croiser mais pas se chevaucher, écart mini 5 px → v2026.6.46.
7. ✅ Afficheur LCD 16x2 et 20x4 à retoucher, sortis dans svg retouche → bases générées (v2026.6.46), à retoucher par Frank.

# v2026.6.52

1. ✅ **Pas-à-pas Mega : « par-dessus » (step over) + non bloquant** (`avr.mts`). Avant : le pas plafonnait à 4 M instructions/clic → un `delay()` demandait plusieurs clics et la ligne affichée retombait sans cesse sur celle du `delay()` (ex. « 12 ») car, pendant un appel au cœur Arduino, `lineForPc` renvoie une ligne périmée (la table DWARF ne contient que le sketch). Désormais le pas s'exécute **en arrière-plan via la boucle RAF** et ne s'arrête qu'à une **autre ligne du sketch revenue au niveau de pile de départ** (garde sur `SP`) : un `delay()`, un `Serial.print()` ou une fonction de l'élève est **franchi d'un bloc en un seul clic**, sans figer l'UI (déroulé au rythme de la simu). Validé en simulant blink2 : `L8 → 9 → 10 → 11 → 12 → 13 → 8 …` (un clic/ligne, `delay(500)` = 5,5 M instr en un pas). `paused` inclut désormais l'état `stepping` pour que l'UI reste « en pause » pendant le pas.
2. ✅ **PWM Mega corrigé** (point 3 de 6.51 / point 2 de 6.50). Les sorties `OCnx` du 2560 ne sont pas sur les mêmes broches que le 328P : `MEGA_TIMER0/1/2` reçoivent maintenant les bons `compPort/compPin` → `analogWrite` agit sur la **vraie broche Mega**. Couvert (timers 0-2 simulés) : **D13/OC0A=PB7, D4/OC0B=PG5, D11/OC1A=PB5, D12/OC1B=PB6, D10/OC2A=PB4, D9/OC2B=PH6**. Test ajouté à `verify-sim` ([`mega-pwm.mjs`](src/webview/programs/mega-pwm.mjs), `analogWrite` 25/75/50 % → rapport cyclique mesuré sur PB5/PH6/PB7). ℹ️ D2/3/5/6/7/8 et 44-46 dépendent des timers 3-5 **non simulés** → toujours sans PWM.

# v2026.6.51

1. ✅ **Blink Mega : la LED s'allumait sans jamais s'éteindre — corrigé** (`avr.mts`). Le blink *simple* marchait déjà (LED 13 = PB7 bascule), mais dès qu'on touchait à `Serial`/objets C++ la simu se figeait dans `delay()`. Diagnostic (firmwares réels compilés avec le core Arduino atmega2560 + sondes node) : avr8js **déduit la taille du PC de la taille du firmware** (`pc22Bits = progMem > 128 Ko`) → `false` pour un petit blink. Or l'**ATmega2560 a toujours un PC 22 bits** : avr-gcc émet des **`EICALL`** qui empilent une adresse de retour sur **3 octets**, alors que `CALL`/`RET`/`RCALL`/saut d'IRQ n'en (dé)pilent que **2** quand `pc22Bits` est faux. Désaccord push 3 / pop 2 → la **pile dérive dans la `.bss`**, les `push` écrasent `timer0_overflow_count` → `micros()` part à ~38 M → `delay()` boucle à l'infini (LED figée). Correctif : **`this.cpu.pc22Bits = true` si `isMega`**. ℹ️ Un blink sans EICALL passait (d'où le faux « presque bon » de 6.50).
2. ✅ **Test Mega ajouté à `verify-sim.mjs`** (point 3 du reste-à-faire 6.50). Firmware de démo précompilé [`src/webview/programs/mega-demo.mjs`](src/webview/programs/mega-demo.mjs) = **blink LED 13 + `Serial.println`** (core Arduino atmega2560, exerce les `EICALL`). Le test vérifie les bascules D13 **et** que la série contient « blink » — il échouerait sans le fix `pc22Bits` (la sortie resterait « b »). `npm run verify` : Uno + **Mega** + Pico ✅.
3. ⏳ **PWM Mega** (point 2 du reste-à-faire 6.50) : non traité. Les broches OC des `MEGA_TIMER*` sont encore celles du 328 (`compPortA/compPinA`…) → `analogWrite` sort sur les mauvaises broches. À corriger pour le 2560 (OC0A=PB7/pin13, OC0B=PG5/pin4, OC1A=PB5, OC1B=PB6, OC1C=PB7, OC2A=PB4, OC2B=PH6…).

# v2026.6.50

1. ✅ **Simulation Mega réparée** (`avr.mts`). Diagnostic (traces temporaires) : le CPU atmega2560 **tournait** (cycles 0→15,7 M/s, PC mobile) mais restait **bloqué dans `delay()`** car `millis()` ne s'incrémentait jamais. Cause : les configs avr8js (timers 0-2, USART0, SPI, TWI, ADC) sont celles du **328P** ; or sur le 2560 la **table de vecteurs d'interruption est plus grande** → l'ISR Timer0 overflow sautait à l'adresse du 328 (`0x20`) au lieu de celle du Mega (`0x2E`). Correctif : configs `MEGA_TIMER0/1/2`, `MEGA_USART0`, `MEGA_SPI`, `MEGA_TWI`, `MEGA_ADC_CONFIG` = copies des configs 328 avec **vecteurs corrigés** (datasheet ATmega2560, table 14-1, adresses en mots), branchées si `isMega`. Désormais `millis()`/`delay()`/`Serial`/interruptions fonctionnent sur le Mega. ℹ️ Restent non simulés : timers 3-5, USART1-3, ADC A8-A15, **PWM** (broches OC différentes du 328).

# v2026.6.49

1. ✅ **Masquage élément @wokwi** : `visibility:hidden` hors flux (classe `.part__src-el`) au lieu de `display:none`, qui empêchait le rendu du shadow DOM (clavier/canvas). Le composant à dessin retouché garde sa simulation.
2. ✅ **Broches mega câblables complétées** : `MEGA_PINS` + `mcuPinRole` reconnaissent `5V.1`/`5V.2` (2e 5 V), `AREF`, `IOREF`, `RESET`, `A4.2`/`A5.2` (sinon non câblables en simu → une LED sur ces broches restait éteinte).
3. ⏳ **Simulation mega (atmega2560) : le programme ne s'exécute pas** (PC bloqué, composants câblés inertes ; l'Uno marche). Chemin **jamais testé** (verify-sim ne couvre que l'Uno) et **indépendant** du dessin/des surcharges (fichiers `compiler.ts`/`sim.mts`/`avr.mts` non modifiés). À traiter en tâche dédiée (besoin du log de compilation d'un vrai run).

# v2026.6.48

1. ✅ **Le dessin du composant vient du SVG retouché** (test : mega). L'éditeur affiche [`src/webview/elements/boards/mega.svg`](src/webview/elements/boards/mega.svg) (dessin Wokwi repositionné sur grille par Frank, nettoyé : sans ronds/labels) au lieu du rendu @wokwi étiré par `pinScale`. Registre [`board-drawings.mts`](src/webview/diagram/board-drawings.mts) ; intégration dans `renderPart` ([editor.mts](src/webview/diagram/editor.mts)) ; corps dimensionné au viewBox du SVG ; broches prises **directement dans les surcharges** (`partPins`, indépendant du `pinInfo`). L'élément @wokwi reste **masqué** (`display:none`) pour `pinInfo`/simulation ; `applyPinScale` ignoré. Outil [`scripts/_clean-board-svg.mjs`](scripts/_clean-board-svg.mjs) (`node scripts/_clean-board-svg.mjs <type>`).
2. ✅ **Surcharge `mega` refaite** depuis les ronds, repère = coin haut-gauche feuille (sans marge). Validé : les ronds tombent pile sur chaque header du dessin.
3. ℹ️ **Limite** : l'élément @wokwi masqué ne montre plus son retour visuel de simulation (LED, écran…). OK pour une carte ; pour les composants **dynamiques** il faudra refléter `el.active`/`el.value`/`setLcd` sur le dessin (à faire au cas par cas).

# v2026.6.47

1. ✅ **Ronds power/gnd sur la pastille métal** : les broches d'alimentation (rouge VCC / noir GND) sont placées à leur position réelle `pinInfo × pinScale` (sans calage grille **ni** surcharge), donc le rond coloré tombe pile sur le pad dessiné par le composant. Les autres broches gardent la grille/surcharge. Helper [`pinPos`](src/webview/diagram/editor.mts) partagé par `makeHotspot` et `syncHotspots`.

# v2026.6.46

1. ✅ **Connecteur clavier 3 colonnes recalé** : `columns` ajouté à la liste de re-rendu de [`updatePartAttr`](src/webview/diagram/editor.mts) — en passant 4→3 colonnes l'élément Wokwi rétrécit, mais les pastilles restaient aux positions 4 col (x 100-167) → hors du connecteur 3 col (x 76-134). Le re-rendu ré-résout `overridesFor` → pastilles sur le connecteur.
2. ✅ **Routage : pas de chevauchement, écart 5 px** ([`autoRoute`](src/webview/diagram/editor.mts)) : les fils peuvent se croiser mais plus se superposer (coût de **recouvrement colinéaire** d'autres fils) ni se serrer (**pénalité de proximité < 5 px**). Candidats enrichis : coudes en L + détours en Z par la médiane **décalée par voies** (multiples de 5 px) → chaque fil trouve une voie libre ; un tracé droit qui se superposerait reçoit un **créneau** d'évitement. Helpers `collinearOverlap`/`parallelPenalty`/`polylineWireCost`.
3. ✅ **Bases LCD 16×2 et 20×4 (parallèle) à retoucher** : générées dans [`svg retouche/lcd.edit.svg`](svg%20retouche/lcd.edit.svg) (16×2) et [`lcd-parallel-20x4.edit.svg`](svg%20retouche/lcd-parallel-20x4.edit.svg) (20×4) — variante 16×2 ajoutée à [`scripts/build-retouche.mjs`](scripts/build-retouche.mjs). Anciens `.OK`/`.ok` retirés (à retoucher maintenant).

# v2026.6.45

1. ✅ **Câblage interne du clavier = schéma dessiné à la main** (3×4 et 4×4) : remplace le `keypad()` programmatique de [`internal-wiring.mts`](src/webview/diagram/internal-wiring.mts) par les tracés Inkscape nettoyés [`src/webview/elements/keypad-schema.svg`](src/webview/elements/keypad-schema.svg) / [`keypad-3col-schema.svg`](src/webview/elements/keypad-3col-schema.svg) (matrice rangées×colonnes, 1 poussoir par croisement, **bus de lignes bleus → R**, **bus de colonnes noirs → C**). Importés comme texte, mis à l'échelle du corps (`scale`). Nettoyage : [`scripts/_clean-keypad-schema.mjs`](scripts/_clean-keypad-schema.mjs) (retire corps/guides/repères/defs path-effects ; viewBox = repère interne).
2. ✅ **uno et 7seg-2dig recalés** (exclus en 6.44) → reportés dans [`pin-overrides.mts`](src/webview/diagram/pin-overrides.mts). uno : 31 broches (avec `A4.2`/`A5.2`). 7seg-2dig résolu par la formule `7seg-${digits}dig` d'`overridesFor`.

# v2026.6.44

1. ✅ **Brochages recalés sur grille depuis « svg retouche/ » (25 composants)** : report automatique des pastilles retouchées vers [`pin-overrides.mts`](src/webview/diagram/pin-overrides.mts). Extracteur [`scripts/_extract-overrides.mjs`](scripts/_extract-overrides.mjs) — résout les transforms Inkscape imbriqués via `getCTM` (Chrome headless), calcule `surcharge = centre pastille − origine grille inkscape − marge 20`, arrondit à la grille 10. **Formule validée** : reproduit à l'identique les surcharges connues du clavier. Composants surchargés : 7seg (1 et 4 chiffres), button, button-6mm, buzzer, dht22, dip-switch, gas-sensor, hcsr04, heartbeat, lcd-i2c, led, led-bar, mega, microsd, neopixel, ntc-temp, oled-ssd1306, photoresistor, pir, resistor, rgb-led, servo, slide-switch, sound, tilt.
2. ✅ **Variantes résolues par `overridesFor`** : 7 seg par `digits` (`7seg-1dig`/`7seg-4dig`), LCD par `pins` (`lcd-i2c` ; parallèle = auto).
3. ℹ️ **Exclus** : `*.OK`/`*.ok` (rien à changer, calage auto), `keypad*.PB` (déjà figé en 6.43), **uno** (non recalé : pastilles encore au pas brut, pas d'origine grille) et **7seg-2dig** (non calé sur grille) → laissés en calage automatique. Bases du schéma interne du clavier prêtes (cf. « À faire » nº 1).

# v2026.6.43

1. ✅ **Brochage du clavier en face des broches (3×4 et 4×4)** : le connecteur Wokwi sort au pas irrégulier ~9,6 px → le calage automatique sur la grille 10 px décalait les pastilles du connecteur dessiné. Surcharges figées (`pin-overrides.mts`, clés `keypad-3col`/`keypad-4col`) aux positions réelles lues dans `keypad*.edit.PB.svg` (centre des pastilles − marge). Sélection par variante via `overridesFor(type, attrs)` (le type `keypad` partage 3 et 4 colonnes). `makeHotspot` reçoit la carte de surcharge déjà résolue.
2. ℹ️ **Fichiers `svg retouche/` traités** : les `*.edit.OK.svg` (ili9341, joystick, lcd, lcd-parallel-20x4, led-ring, nano, neopixel-matrix, pot) sont validés tels quels → aucune surcharge. Les `*.edit.PB.svg` (claviers) corrigés via surcharges ci-dessus. Référence = **centre des pastilles rouges − marge du groupe `board`** (marge non supposée à 20).
1. - Tous les composants on été traités et sont dans le dossier "svg retouche". Cas particuliers - fichiers xxx.edit.OK.svg Tout bon je n'ai rien changé tu ne retouches rien - fichiers xxx.edit.PB.svg. La il y a un PB tu me les ressort en svg à moins que le calage des pastilles te suffise
 Attention c'est le centre de tes points rouges qui est la référence. Et je n'ai pas toujours laissé de marge.

ℹ️ **Générateur de SVG de retouche par variante** : [`scripts/build-retouche.mjs`](scripts/build-retouche.mjs) (`node scripts/build-retouche.mjs`, `--force` pour réécrire). Rend chaque variante via Chrome headless + esbuild, pose la grille 10 px et les pastilles `id="pin-<nom>"` à la position exacte de Kablix (marge 20 + `pinInfo × pinScale`, dessin scalé `96/25,4 × pinScale`). Variantes manquantes générées (broches différentes) : **clavier 3×4** (`keypad-3col.edit.svg`, 7 broches), **LCD I²C** (`lcd-i2c.edit.svg`, 4 broches à gauche), **LCD parallèle 20×4** (`lcd-parallel-20x4.edit.svg`, 16 broches plus bas), **7 segments 2 et 4 chiffres** (`7seg-2dig.edit.svg` 10 broches, `7seg-4dig.edit.svg` 14 broches en DIL). Formule validée : régénérer le 4×4 et le LCD 16×2 redonne pile les fichiers existants.
1. Remplace l'icone du bouton avancer d'un pas par media\step.png . Le plus grand possible dans le bouton
1. pas de grille en dehors du monde. La grille juste sur la feuille de dessin le reste est grisé
1. nommage : par défaut le nom du projet ouvert -  si pas de nom, le nom du fichier de code associé (sans chemin ni extension)
1. **Routage auto** : sortie perpendiculaire au bord le plus proche **de tout composant** (et plus seulement des cartes) sur **2 px****, puis on ne recouvre aucun composants ni celui d'ou pn part ni aucun autre. Si pas possible, on laisse le fil comme à l'origine.

# v2026.6.42

1. ✅ **Touches du clavier verrouillables (Ctrl+clic), comme les BP** : l'élément Wokwi du clavier n'a pas de Ctrl natif → reproduit au niveau simulation ([sim.mts](src/webview/sim.mts), binding clavier). Ctrl+clic verrouille la touche (reste enfoncée + rendu « pressed » persistant), un clic normal la libère ; l'état Ctrl est capté en phase de capture (`pointerdown`) car les événements de l'élément ne le portent pas. **Bulle** « Ctrl+clic… » affichée en simulation pour les claviers comme pour les BP (`isLockable`).

# v2026.6.41

1. ✅ **Bouton de pliage → menu** : appui sur le bouton (grande flèche de repliement `▾`) ouvre un menu ; on glisse jusqu'au mode (déplier `⊞` / replier `⊟` / auto `⇕`) et on relâche, ou simple clic puis clic sur le mode. ([editor.mts](src/webview/diagram/editor.mts) `openFoldMenu`, CSS `.palette__fold-menu`).
2. ✅ **Miniatures fiables** : recalage par `ResizeObserver` au lieu d'une boucle rAF → corrige les vignettes « trop grandes » au lancement et au dépliage d'une section repliée (taille nulle tant que `display:none`).
3. ✅ **Miniature 7 segments « 8. »** : tous les segments + point décimal allumés dans la couleur choisie (et barre de LED allumée), via `lightThumbnail`.
4. ✅ **Message de verrouillage rétabli** : le bandeau rouge sur jaune est réinséré dès qu'une reconstruction de palette le détache (`isConnected`), et re-affiché en fin de `buildPalette` si la simulation tourne.
5. ✅ **Vue de démarrage centrée** : l'origine du monde est posée au centre de la zone utile (sous les barres) — plus de zone morte en haut-gauche où un composant restait coincé. `resetView` centre l'origine, appelé au démarrage.
6. ✅ **Fils : héritage de couleur** : un fil branché sur le même point qu'un fil existant reprend sa couleur (même nœud → même couleur), `inheritedColor`.
7. ✅ **`.projix` : nom par défaut** = fichier de code associé (sans chemin ni extension), sinon nom du projet ouvert/enregistré, sinon `schema-kablix`. **Nom du projet affiché** à côté du bouton d'aide (message `projectName`).
8. ✅ **Appuis prolongés (BP, touches clavier, SEL joystick)** : durée d'appui minimale (`MIN_PRESS_MS` 150 ms) — un clic bref n'est plus manqué par le balayage du firmware. Relâcher différé par touche pour le clavier.
9. ✅ **Routage auto** : sortie perpendiculaire au bord le plus proche **de tout composant** (et plus seulement des cartes) sur **1 pas de grille**, puis 4 tracés candidats (2 coudes en L + 2 détours en Z médian) — on retient celui qui recouvre le moins les autres composants.

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


