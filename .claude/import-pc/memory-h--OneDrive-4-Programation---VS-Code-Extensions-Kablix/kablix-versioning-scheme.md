---
name: kablix-versioning-scheme
description: "Numérotation Kablix = ANNÉE.MOIS.incrément — l'incrément repart à 0 à chaque nouveau mois"
metadata: 
  node_type: memory
  type: project
  originSessionId: f9b6285b-abfc-4de2-bd2d-85c43e9acf43
  modified: 2026-08-05T08:49:33.511Z
---

Le numéro de version Kablix suit le calendrier : `ANNÉE.MOIS.incrément` (ex. 2026.6.87). Au changement de mois, l'incrément **repart à 0** : le premier lot de juillet 2026 est **2026.7.0** (précisé par Frank le 2026-07-03), pas 2026.6.88.

**Why:** le mois fait partie du numéro ; continuer l'ancien compteur casse la convention.

**How to apply:** avant chaque bump dans package.json, comparer le mois courant à celui de la version en place — si différent, version = `année.mois.0`, sinon incrémenter le dernier chiffre. Journal todo.md : section `# vX` correspondante.

**Piège vécu (2026-08-05)** : oubli du passage de mois — 2026.7.267 et .268 livrées le 5 août alors qu'elles auraient dû être 2026.8.0 et 2026.8.1. Frank ne réécrit pas l'historique, il fixe la suivante : **le prochain lot est 2026.8.0**. Réflexe à prendre : lire la date du jour AVANT de bumper, jamais se contenter d'incrémenter la version en place.
