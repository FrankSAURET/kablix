---
name: kablix-fork-wokwi-elements
description: "v2026.6.87 : @wokwi/elements forké dans src/webview/composants (balises kablix-*, sans décorateurs, lit direct) — retouches désormais DANS les forks"
metadata: 
  node_type: memory
  type: project
  originSessionId: f9b6285b-abfc-4de2-bd2d-85c43e9acf43
---

Depuis v2026.6.87, `@wokwi/elements` n'est plus une dépendance : les 36 éléments utilisés + support (`pin.mts`, `utils/`, `types/rgb`, `patterns/pins-female`, `lcd1602-font-a00`) sont forkés de la v1.9.2 dans `src/webview/composants/*-element.mts`. `lit` 3.3.3 est en dépendance directe.

**Why:** décision utilisateur (2026-07-02) : l'overlay « dessin retouché par-dessus élément wokwi » n'était ni propre ni fiable ; tout est forké pour retoucher directement dans les composants.

**How to apply:**
- Format des forks : .mts **sans décorateurs** — `static properties = {…}` + `declare x: T;` + init dans le constructeur (tsconfig sans experimentalDecorators, target ES2022) ; `@query` → getter `renderRoot.querySelector` ; imports relatifs `.mjs` ; en-tête d'attribution MIT + `LICENSE-wokwi.md`.
- Balises `kablix-*` ↔ types Wokwi `wokwi-*` par échange de préfixe 1:1 (`wokwi.mts`) ; les `.kablix` stockent des types courts (`led`, `button`) — rien à migrer.
- Retoucher un composant = modifier son fork (modèle : `slide-potentiometer-element.mts`, ex-slide-pot.mts fusionné), pas d'overlay pour les nouveaux cas. Cf. [[kablix-retouche-pipeline]].
- Piège lit3 : accesseur existant (get/set `text` du lcd1602) → entrée `text: {}` dans static properties suffit, lit garde l'accesseur.
- Validation de référence : probe Chrome headless comparant fork ↔ amont (viewBox, taille, pinInfo, longueur SVG) — les deux jeux de balises coexistent dans une même page (script jetable dans le scratchpad, pattern `build-retouche.mjs`).

**Migration « dessin retouché → fork direct » terminée (v2026.7.10)** : les 26 composants dynamiques/interactifs de `svg retouche/` sont tous passés au modèle direct (`unsafeSVG` + `pinInfo` codé en dur), en 4 lots (A statiques, B dynamiques à retour visuel, C interactifs, D nettoyage final). `board-drawings.mts`, `drawing-feedback.mts`, `pin-overrides.mts` (résiduel) et toute la mécanique d'overlay (`boardDrawing`/`attachInteractiveFeedback`/`reflectButtonColor`/`alignLiveElement`/`part__src-el*`) supprimés d'`editor.mts`/`styles.css`. Hors périmètre : `flame` (jamais retouché, garde `pinScale`) et les 2 claviers (`keypad-3col`/`keypad-4col`, attendent une retouche manuelle utilisateur — cf. `svg retouche/keypad-*.edit.svg`).
