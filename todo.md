# À faire
1. Quand on affiche un pinout il doit être par dessus tout (z-order)
2. Aff 7 seg, sur les dessins des composants comme sur son schéma interne les lignes semblent avoir grossis et les couleurs disparus
3. Suprime les broches CLN et COM de l'afficheur 4 digit
4. Les schéma interne des afficheurs doivent avoir les diodes qui se retournent selon cathode ou anode commune
5. Les schémas interne des afficheurs et des claviers sont dans src\webview\composants\interne
6. Nano : retoucher nano-pinout.svg (module central redimensionné) puis réactiver le poster dans pinout.mts
7. En pwm la LED clignote. Demande moi mon programme.

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
