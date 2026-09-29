---
name: kablix-autoroute-headless-repro
description: "Reproduire un bug de routage (editor.mts) : VRAI éditeur en Chrome headless (bundle esbuild), schéma reconstruit au px depuis une capture ; pièges connus des stubs de broche"
metadata: 
  node_type: memory
  type: project
  originSessionId: 954cdb96-8e52-4a14-a1db-e30d16798f36
---

Méthode qui marche (v2026.7.13) : bundler avec esbuild (stdin/entry dans `node_modules/.cache-route/`, loader `.svg: 'text'`) les composants + `Editor` de `src/webview/diagram/editor.mjs`, page HTML avec `media/styles.css` inline, `new Editor(canvas, palette, svg, inspector)` + `loadDiagram(...)` + 2×120 ms d'attente + `autoRoute()` ; dumper `editor.diagram.wires[].points`, `rendered` (privé mais accessible après transpile), `.part__body` offsetW/H vs svg baseVal ; Chrome `--headless --dump-dom` via `execFileSync` (pattern `scripts/build-retouche.mjs`). Exécuter le script DEPUIS `node_modules/.cache-route/` (résolution ESM d'esbuild liée à l'emplacement du script, pas au cwd).

Reconstruire le schéma depuis une capture : échelle = largeur carte Pico mesurée / 208.663 (capture Frank = 3 px/monde) ; positions des fils/hotspots fiables, mais les PADS dessinés du Pico dérivent (pitch dessin ≈ 10.465 vs hotspots 10) — ne jamais caler sur les pads, toujours sur les fils/verticales.

**Causes racines corrigées (v2026.7.13)** — à connaître avant tout nouveau bug de routage :
1. `.part__body` est plus haut que le dessin (interligne du span d'étiquette : LED 30×54 vs svg 30×50) → `partObstacles()` doit mesurer le SVG (`svg.width.baseVal.value`, déjà scalé par `applyPinScale`), repli offsetWidth/Height.
2. Broches d'angle : dernier plot d'une rangée Pico (GP15/GP16 : bord droit 5,4 px < bord bas 6,4 px), coins des boutons 6 mm → une seule sortie perpendiculaire ne suffit pas. `pinStubs()` renvoie jusqu'à 2 candidats (±5 px) et `autoRoute()` compare les ≤ 4 combinaisons au score complet (comp×1000 + chevauchement×100 + proximité×0,6 + longueur + coudes×20, cf. `polyLenBends`).
3. Pénaliser le chevauchement colinéaire du fil AVEC LUI-MÊME (sinon la patte d'arrivée rebrousse chemin le long du tracé : ballon du jaune).

Pièges plus anciens (v2026.6.82, toujours vrais) : l'A\* interdit le chevauchement colinéaire → voies parallèles autour des bornes obligatoires ; le coût du repli L/Z doit compter TOUS les composants sur [pa..pb].

**Ajouts v2026.7.24** : directions A\* SIGNÉES (0=+x,1=−x,2=+y,3=−y, 4=départ), demi-tour interdit, `startDir`/`endDir` passés depuis les stubs (sinon aller-retour de 5 px stub↔tracé, invisible dans l'A\* seul) ; croisements transversaux pénalisés 1,5 coude (`segsCross`) dans l'A\* ET le score des combinaisons ; voies d'évitement au pas de GRILLE (10 px, plus jamais ±k·gap=5 px hors grille). GAP=5 reste l'écart minimal. Métriques de repro : chevauchement inter-fils en px + croisements comptés sur `wires[].points`.
