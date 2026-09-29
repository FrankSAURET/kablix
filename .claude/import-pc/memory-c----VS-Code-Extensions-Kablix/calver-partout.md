---
name: calver-partout
description: Frank veut du calver (ANNÉE.MOIS.incrément) pour TOUS les numéros de version, y compris ceux des composants publiés, sur tous ses projets.
metadata:
  type: feedback
---

Décision du 21 août 2026 : tout numéro de version, dans tous les projets de Frank, est en calver `ANNÉE.MOIS.incrément` — pas seulement le manifeste du projet. Les composants de la bibliothèque publique Kablix (`kablix_components/_sources.json`), plugins, paquets et ressources versionnées suivent la même règle. Aucun semver `1.2.0`.

**Why:** un seul système de numérotation partout, la date de sortie se lit directement dans le numéro ; deux conventions cohabitant (semver pour les composants, calver pour l'extension) le trompait.

**How to apply:** avant chaque bump, comparer le mois courant à la date du jour ; mois différent → `ANNÉE.MOISDUJOUR.0`. Pour un composant Kablix : éditer `_sources.json`, puis `node scripts/build-kompix.mjs` et `node scripts/build-components-index.mjs` (le `.kompix` embarque la version dans son manifeste). Règle inscrite dans les deux CLAUDE.md (global et projet).
