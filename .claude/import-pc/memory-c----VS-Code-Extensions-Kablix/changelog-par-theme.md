---
name: changelog-par-theme
description: "CHANGELOG : à l'intérieur de Nouveauté / Modification / Correction, les entrées d'un même thème se suivent (pas de sous-titre)."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 306a72ce-3679-4714-a0da-ddace1d138e3
  modified: 2026-09-26T10:45:28.580Z
---

Dans chaque partie d'une version du CHANGELOG (Nouveauté, Modification, Correction), les entrées sont rangées **par thème** : deux entrées qui parlent du même sujet (analyseur logique, DMX, Pico, marqueurs…) se suivent. Pas de séparation particulière (ni sous-titre, ni ligne vide) ; chaque entrée reste dans sa catégorie.

**Why:** Frank, 26/09/2026, todo.md : « Désormais tu organisera le changelog par thème. Pas de séparation particulière mais 2 nouveautés (ou correction ou modification) sur le même thème se suivent (en restant dans leur catégorie nouveautés ou correction ou modification) ». Le même jour il avait lui-même regroupé les entrées DMX de la 2026.9.6.

**How to apply:** une entrée nouvelle ne s'ajoute pas en bas de sa partie : elle s'insère à côté des entrées de son thème. Complète [[changelog-style-concis]].
