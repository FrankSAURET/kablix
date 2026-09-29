---
name: kablix-plotter-traceur
description: "Traceur de courbes v2026.7.94 — protocole Teleplot retenu (pas l'extension), filtre série à retenue, sondes setAnalog en escalier, palette fixe validée"
metadata: 
  node_type: memory
  type: project
  originSessionId: 056d6e61-34bc-4b56-8aca-a46bee3716f8
---

Traceur de courbes (v2026.7.94, `src/webview/plotter.mts`) : les 2 pistes « Teleplot vs outil maison » ont été explorées (14 juillet 2026) → **outil maison retenu, avec le protocole Teleplot comme format** (`>nom:valeur`, `§unité`, `|drapeaux`) pour que les sketchs restent compatibles avec le vrai Teleplot sur matériel réel. Ne pas re-proposer l'extension Teleplot : dépendance externe refusée (public scolaire, hors-ligne) ; un relais UDP opt-in vers localhost:47269 reste l'extension possible (~20 lignes, réseau = opt-in obligatoire, règle v2026.7.92).

**Pièges à retenir :**
- Filtre série à RETENUE : une ligne commençant par `>` est retenue jusqu'à dénouement (fin de ligne / motif invalidé / 500 ms). L'invite REPL `>>>` s'invalide dès le 2e `>`. Ne pas « simplifier » en parse après affichage.
- Sondes internes = monkey-patch de `engine.setAnalog` dans `startRun` (volts via Vref 5/3,3) ; tracé en `step` (escalier, valeur tenue prolongée au dessin, points dédupliqués — un potentiomètre immobile = 0 point/s). Télémétrie série = `line`.
- Palette 8 teintes ordre FIXE (jamais recyclée, 9e+ = gris), deux variantes light/dark validées par le validateur dataviz contre #fff/#1f1f1f ; le thème se lit sur `body.vscode-light` (défaut sombre), MutationObserver pour le suivi en direct.
- `hidden` + `display:flex` : tout élément du panneau avec un display CSS doit avoir sa règle `[hidden]{display:none}` (bug réel corrigé sur `.plotter__empty`).
- rAF ne tourne PAS en Chrome headless `--dump-dom` (les timers si) → `verify-plotter.mjs` appelle `p.draw()` directement ; voir [[kablix-webview-geometry-headless]].
- Auto-ouverture : préférence `plotterVisible` dans uiState — `undefined` = auto-ouverture à la 1re donnée, `false` = fermé explicitement (respecté), panneau toujours fermé au chargement.
- Capture visuelle : `node scripts/view-plotter.mjs` (PNG dark/light dans le scratchpad).
