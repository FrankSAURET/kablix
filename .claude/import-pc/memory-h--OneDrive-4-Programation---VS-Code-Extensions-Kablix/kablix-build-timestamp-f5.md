---
name: kablix-build-timestamp-f5
description: "Pendant les tests F5, afficher l'heure de build sous le nom Kablix (repère visuel de version exécutée)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bc96e436-3170-4966-9450-6fef593fca15
  modified: 2026-07-23T14:13:11.908Z
---

Pendant les phases de test avec F5 (debug de l'extension), afficher l'HEURE de build à la suite du numéro de version, sous le nom « Kablix » dans la barre (renderProjectName / barre Kablix du webview).

**Why:** Frank a eu des faux négatifs de test parce qu'il exécutait une ancienne version compilée sans le savoir. Un repère visuel horodaté confirme qu'il teste bien le dernier build.

**How to apply:** injecter un timestamp de build (heure HH:MM:SS) au moment du `npm run build`, l'afficher sous la version dans la barre Kablix du webview. À retirer (ou garder discret) hors phase de test. Voir [[kablix-versioning-scheme]].
