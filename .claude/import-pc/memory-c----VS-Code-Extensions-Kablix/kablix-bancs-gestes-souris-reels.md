---
name: kablix-bancs-gestes-souris-reels
description: Un geste de souris ne se teste pas avec des événements fabriqués ; Chrome en CDP (verify:souris) est le seul banc qui le prouve.
metadata: 
  node_type: memory
  type: project
  originSessionId: 13a5d5ce-9366-487e-8866-e8b5fb5bb7e4
  modified: 2026-09-12T15:41:20.663Z
---

Les bancs Kablix pilotent l'éditeur avec `new PointerEvent(...)` parce que `--dump-dom` n'offre aucune entrée. Ça suffit pour la logique, jamais pour un GESTE : un événement fabriqué porte les champs qu'on lui donne, le navigateur décide des siens. Deux lots ont été livrés verts sur un double-clic mort (v2026.9.3.71 et .72, 12/09/2026).

Mesuré dans Chrome avec une vraie souris (`Input.dispatchMouseEvent` en CDP) :
- un `preventDefault()` sur `pointerdown` supprime **tous** les événements souris de compatibilité — `mousedown`, `click`, `dblclick` compris. Un écouteur `dblclick` sur un nœud déplaçable n'est jamais appelé.
- un `pointerdown` porte **`detail = 0`**, jamais le compte des clics. `e.detail` ne sert qu'aux événements souris.
- d'où le compteur maison dans `onTextPointerDown` : horodatage + distance (`DOUBLE_CLIC_MS` 500, `DOUBLE_CLIC_PX` 6), remis à null dès qu'un double-clic est reconnu.

**Why:** sans banc à vraie souris, un geste peut être « vert » alors qu'il ne marche pas du tout dans la webview.

**How to apply:** tout nouveau geste de souris (double-clic, glisser, clic droit, molette) se vérifie dans `scripts/verify-souris.mjs` — Chrome headless piloté en CDP brut sur le port 9411, pas de puppeteer dans le projet. Contre-épreuve obligatoire : `git stash`, relancer le banc, il DOIT échouer sur l'ancien code. Voir [[kablix-webview-geometry-headless]] et [[kablix-autoroute-headless-repro]].
