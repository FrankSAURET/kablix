---
name: kablix-schemas-test-emplacements
description: "Schéma de test testkablix retouché par Frank — garder les emplacements des composants lors d'une reprise"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2be93e0e-441e-4b8a-b800-c3c53e9ea90d
  modified: 2026-08-04T13:33:38.561Z
---

Quand un schéma de test `testkablix` a été retouché par Frank, une reprise (retouche ou refonte) doit **garder les emplacements des composants** (`x`/`y` dans `testkablix/_spec.mjs`). Exception : refaire le montage entièrement et différemment.

**Why:** Frank replace les composants à la main pour que la planche soit lisible ; une régénération qui redispose tout lui fait refaire ce travail à chaque lot. Demandé le 2026-08-04.

**How to apply:** avant `node testkablix/_generate.mjs`, relire les `x`/`y` de la spec et les conserver ; ne régénérer que les fichiers du lot (cf. [[kablix-testkablix-generate-ecrase]]). Consigne aussi inscrite dans le `CLAUDE.md` du projet.
