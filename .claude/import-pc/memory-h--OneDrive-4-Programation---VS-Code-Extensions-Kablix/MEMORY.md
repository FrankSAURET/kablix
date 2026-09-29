# Mémoire — Kablix

- [Boum : WebP animé, pas MP4](kablix-boum-webp-anime.md) — H.264 sans alpha ; détourage additif, alpha WebP sans perte (gamma+paliers), loader dataurl dans les 36 scripts.

- [Vitesse Pico : le plan](kablix-vitesse-pico-plan.md) — niveau 3 TERMINÉ (+30 %, #8/#11/#15 fermées) ; suite = #16 (cœur M0+ WASM) ; le profileur ment par inlining, la machine dérive de 5 %/session.
- [Vitesse Pico : le diagnostic](kablix-vitesse-pico-diagnostic.md) — émulateur ×11 plus lent que la puce, 6 % de marge ; firmware, webview et regroupement de tick écartés ; un moteur par processus sinon mesures fausses.
- [Pico : régime et instrumentation](kablix-pico-regime-instrumentation.md) — le ralenti venait du débogueur ; v2026.8.12 : script brut par défaut (1,00) + bascule instrumentée à rejeu silencieux.
- [Pico : modules natifs read-only](pico-micropython-native-modules-readonly.md) — patcher machine.I2C etc. passe par sys.modules, pas par réassignation ; scan I²C fige sur adresse absente.
- [Pico : injection des libs](kablix-pico-lib-injection.md) — libs .py injectées dans sys.modules (pas de filesystem) ; n'injecter que les modules importés.
- [Pico : le régime bas venait du débogueur](kablix-pico-regime-instrumentation.md) — v2026.8.11 : `__kx` à chaque ligne coûtait ×3,3 ; garde `__kx_on and` + sonde Timer 50 ms → 0,78 ; USB et amortissement du poll = fausses pistes.
- [Autoroutage : repro headless](kablix-autoroute-headless-repro.md) — vrai éditeur en Chrome headless (bundle esbuild), schéma reconstruit au px depuis une capture ; causes racines v2026.7.13 (boîte svg vs part__body, stubs multi-candidats, anti aller-retour).
- [Définition « bon fil »](kablix-bon-fil-definition.md) — fil propre préservé par l'autoroutage : H/V, ≤4 coudes, ne survole ni composant ni broche étrangère ni autre fil ; sinon rerouté A*.
- [Géométrie webview : repro Chrome headless](kablix-webview-geometry-headless.md) — vrai éditeur + vrai CSS + --dump-dom via cmd /c ; rAF limité à ~3 frames ; mesurer contre .canvas__sheet.
- [Retouche : pipeline d'intégration](kablix-retouche-pipeline.md) — clean+probe (convention tel-quel) ; interactifs = élément transparent calé (v2026.6.83) ; pot jamais retouché.
- [Fork @wokwi/elements](kablix-fork-wokwi-elements.md) — v2026.6.87 : plus de dépendance @wokwi, forks kablix-* dans composants/ (sans décorateurs, lit direct) ; retoucher = modifier le fork.
- [Numérotation des versions](kablix-versioning-scheme.md) — ANNÉE.MOIS.incrément, repart à 0 chaque mois (juillet 2026 → 2026.7.0).
- [Outillage Claude 2026-07](claude-outillage-2026-07.md) — /reprend /tl globaux, /livre /retouche /preview Kablix, hook SessionStart, CLAUDE.md projets, qa_tl.py.
- [Console maison, pas xterm](kablix-console-maison-pas-xterm.md) — xterm.js essayé (v2026.7.34) et annulé (v2026.7.35) : ne pas re-proposer ; le bug de collage venait du presse-papier système.
- [Overlay interne calé sur SVG externe](kablix-overlay-interne-cale-svg-externe.md) — v2026.7.48 : caler `.part__internal` sur le SVG externe mesuré, pas sur `.part__body` (letterbox + étiquette) sinon interne trop haut.
- [Infra contrôles de simulation](kablix-siminfra-simcontrol.md) — v50+ : `simControl` (catalog) + attribut `simulating` (setLocked) + curseur/bouton dans le composant visible en sim, event `input` relu par sim.mts.
- [Décisions capteurs en simulation](kablix-capteurs-sim-decisions.md) — flamme/gaz/son/lumière (AOUT baisse, DOUT actif-bas), temp curseur-only, PIR survol, msg sim près souris clignote 3×.
- [Pico : simulation temps réel](kablix-pico-temps-reel.md) — tempête IRQ USB-CDC (NAK 1 ms) ; pacing temps réel ; cycles avancés pendant WFE ; v86 : clock.tick PAR instruction (SysTick/NeoPixel) + alarmes FIFO (SPI+DMA), ne pas re-grouper.
- [Traceur de courbes](kablix-plotter-traceur.md) — v2026.7.94 : protocole Teleplot retenu (pas l'extension) ; filtre série à retenue 500 ms ; sondes setAnalog en escalier (volts) ; palette fixe light/dark ; rAF mort en --dump-dom.
- [Physique LED/résistance série](kablix-led-resistance-physique.md) — v2026.7.99 : ledSeriesOhms (Dijkstra, netlist non fusionnée) + ledElectrical (35 mA flamme / 10 mA plein / 0,2 mA éteinte) ; extension RGB/7seg/barre à faire.
- [Timestamp build en test F5](kablix-build-timestamp-f5.md) — afficher l'heure de build sous le nom Kablix pendant les tests F5 (repère visuel de version exécutée).
- [testkablix : _generate écrase tout](kablix-testkablix-generate-ecrase.md) — schémas réaccordés en v2026.8.25 (0 échec) mais 18 programmes divergent encore ; sur désaccord c'est la spec qui a tort ; régénérer casse 7seg-pico.py multiplexé.
- [Z-order Pico/Grove Shield](kablix-zorder-pico-grove.md) — shield z=0 sous Pico z=1 ; le hissage pin-reachable (z=4) le passait devant → figé à z=0 (v2026.7.177).
- [Schémas de test : garder les emplacements](kablix-schemas-test-emplacements.md) — un test retouché par Frank garde ses x/y dans _spec.mjs, sauf refonte complète.
- [Extraction : X@ic14 écrase le boîtier](kablix-extraction-ecrase-boitier.md) — réextraire un interne réécrit aussi externe/ic14.svg (filigrane « IC-14 ») ; git checkout après, puis recapturer.
