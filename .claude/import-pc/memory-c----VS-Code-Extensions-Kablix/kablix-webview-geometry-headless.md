---
name: kablix-webview-geometry-headless
description: Reproduire les bugs de géométrie/grille de la webview dans Chrome headless (vrai éditeur + vrai CSS + --dump-dom)
metadata: 
  node_type: memory
  type: project
  originSessionId: 02171073-2913-4bfe-82ec-8d441dbc0ce1
---

Les bugs de géométrie du canvas (grille magnétique, positions gBCR) ne se reproduisent pas en Node/jsdom (pas de layout) : bundler un test qui importe le VRAI `diagram/editor.mjs` + l'élément concerné via esbuild `stdin` (`resolveDir` = `src/webview`, loader `.svg: 'text'`), page HTML avec le VRAI `media/styles.css` inline (géométrie dépendante : bordure 1 px de `.canvas`, `transform-origin: 0 0` du monde, marges des `.pin`), puis `chrome.exe --headless=new --no-sandbox --virtual-time-budget=15000 --dump-dom` **via `cmd /c` avec redirection** (sinon stdout vide sous PowerShell/Windows).

Pièges : le headless ne pompe que ~3 frames rAF → séquencer le test sur `setTimeout` et appeler les méthodes privées directement (`(editor as any).snapPartToGrid(...)`) ; journal écrit AU FIL DE L'EAU dans un `<pre>` (le dump peut arriver avant la fin). Vérité terrain = mesurer les pastilles contre le gBCR de `.canvas__sheet` (la grille peinte), pas via `canvasPoint`. Repro utilisée pour le bug v2026.7.0 (bordure 1 px non soustraite dans `canvasPoint`). Voir [[kablix-autoroute-headless-repro]] pour la variante sans DOM.

Pièges de banc découverts en v2026.7.103-112 (les bancs permanents verify-selection/align/route/keypad suivent ce modèle) : (a) `addPart` SÉLECTIONNE le composant posé et `autoRoute` ne route QUE la sélection quand elle existe → `editor.select(null)` avant chaque autoRoute sinon faux verts/rouges ; (b) `addPart` brut ne snappe PAS sur la grille (seuls la pose palette et le drop le font) → appeler `snapPartToGrid` explicitement ; (c) la taille d'un dessin Lit peut bouger APRÈS les frames du settle (police chargée tard → gap sous le dessin, centre de rotation déplacé) : mesures de position à faire après `updateComplete` + `wait(40-60)` ; (d) les événements souris se dispatchent bien sur des éléments hors viewport ; (e) `--screenshot` : donner un width explicite aux wrappers de SVG sans width/height sinon page vide.
