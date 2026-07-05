---
description: Rendu Chrome headless d'un composant — vérif géométrie/alignement sans logs console
argument-hint: <type> [pinout]
---
Produis un rendu headless et un contrôle géométrique du composant : $ARGUMENTS

Méthode (cf. mémoire kablix-webview-geometry-headless) :
1. Script jetable dans le scratchpad, pattern `scripts/build-retouche.mjs` : bundler via esbuild `stdin` (`resolveDir` = `src/webview`, loader `.svg: 'text'`) le vrai `diagram/editor.mjs` + l'élément concerné ; page HTML avec le vrai `media/styles.css` inline (bordure 1 px de `.canvas`, `transform-origin: 0 0`, marges `.pin` : géométrie dépendante).
2. `chrome.exe --headless=new --no-sandbox --virtual-time-budget=15000 --dump-dom` via `cmd /c` AVEC redirection (sinon stdout vide), ou `--screenshot=` pour une image.
3. Headless ≈ 3 frames rAF max → séquencer sur `setTimeout`, appeler les méthodes privées directement ; journal écrit AU FIL DE L'EAU dans un `<pre>`.
4. Vérité terrain = mesurer les pastilles contre le gBCR de `.canvas__sheet` (la grille peinte), pas via `canvasPoint`.
5. Livrer : capture (Read de l'image) ou tableau des écarts pastille↔grille en px. Ne JAMAIS demander à Frank de coller des logs console.
