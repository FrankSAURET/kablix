# À faire
1. rendre les LED allumées plus brillante mettre le halo par dessus la LED
2. Ajoute les schéma pinout des uno, mega et nano (Les schémas pinout sont dans src\webview\composants\interne )
3. Aff 7 seg, sur les dessins des composants comme sur son schéma interne les lignes semblent avoir grossis et les couleurs disparus
1. Suprime les broches CLN et COM de l'afficheur 4 digit
1. Les schéma interne des afficheurs doivent avoir les diodes qui se retournent selon cathode ou anode commune
1. Les schémas interne des afficheurs et des claviers sont dans src\webview\composants\interne

# v2026.7.36
1. ✅ Corrige le scintillement de l'afficheur 7 segments 1 chiffre en simulation Pico : MicroPython (interprété, donc lent face à l'AVR compilé) écrit ses broches de segment une par une ; le rendu ~60 Hz pouvait surprendre un état transitoire (segments à moitié à jour). Anti-scintillement dans sim.mts (`sevenSegStable`) : le nouvel état n'est publié que s'il est resté identique deux frames de suite. Sans effet sur l'Uno (jamais surpris en état intermédiaire) ni sur le 4 digits multiplexé (déjà latché par ailleurs).

# v2026.7.35
1. ✅ Retour arrière complet de la console xterm.js (v2026.7.34) : console maison restaurée (sim.mts, panel.ts, styles.css), dépendances @xterm retirées — le terminal ne fonctionnait pas en réel, et le bug de collage venait du presse-papier (résolu côté système, pas côté code).
2. ℹ️ Conservés : import keypad-4col.schema.svg réparé et travaux SVG en cours.

# v2026.7.34
1. ✅ Console série / REPL remplacée par un vrai émulateur de terminal xterm.js (le même que le terminal VS Code) embarqué dans la webview : séquences ANSI, \r\n, effacement de ligne, collage multi-lignes et flèches (historique MicroPython) gérés nativement — corrige définitivement les sauts de ligne parasites au collage.
2. ✅ Micro-émulation maison supprimée (processAnsi, verrous contentEditable, handler paste) ; Ctrl+C avec sélection = copie, sans sélection = interruption (0x03) ; curseur visible seulement en mode REPL ; hors REPL clavier désactivé (la ligne d'envoi reste pour Arduino).
3. ✅ CSS xterm extrait par esbuild dans dist/webview.css (chargé par le panel, ajouté au vsix).
4. ✅ Smoke test Chrome headless : xterm monté dans #serial sans erreur JS ; verify:all OK.
5. ℹ️ Import keypad-schema.svg → keypad-4col.schema.svg (fichier renommé à la main, build cassé sinon).
