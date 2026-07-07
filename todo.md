# À faire
1. rendre les LED allumées plus brillante mettre le halo par dessus la LED
2. Ajoute les schéma interne des uno, mega et nano (svg\Arduino-uno-pinout.svg, svg\mega pinout.svg et svg\nano pinout.svg)
3. Aff 7 seg, sur les dessins des composants comme sur son schéma interne les lignes semblent avoir grossis et les couleurs disparus

# v2026.7.34
1. ✅ Console série / REPL remplacée par un vrai émulateur de terminal xterm.js (le même que le terminal VS Code) embarqué dans la webview : séquences ANSI, \r\n, effacement de ligne, collage multi-lignes et flèches (historique MicroPython) gérés nativement — corrige définitivement les sauts de ligne parasites au collage.
2. ✅ Micro-émulation maison supprimée (processAnsi, verrous contentEditable, handler paste) ; Ctrl+C avec sélection = copie, sans sélection = interruption (0x03) ; curseur visible seulement en mode REPL ; hors REPL clavier désactivé (la ligne d'envoi reste pour Arduino).
3. ✅ CSS xterm extrait par esbuild dans dist/webview.css (chargé par le panel, ajouté au vsix).
4. ✅ Smoke test Chrome headless : xterm monté dans #serial sans erreur JS ; verify:all OK.
5. ℹ️ Import keypad-schema.svg → keypad-4col.schema.svg (fichier renommé à la main, build cassé sinon).
