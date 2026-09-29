---
name: kablix-extraction-ecrase-boitier
description: Réextraire un schéma interne calé sur un boîtier partagé réécrit AUSSI le dessin externe du boîtier — restaurer ic14.svg après coup.
metadata: 
  node_type: memory
  type: project
  originSessionId: 2be93e0e-441e-4b8a-b800-c3c53e9ea90d
  modified: 2026-08-04T11:05:41.174Z
---

`node scripts/_extract-composants.mjs ic14 7414@ic14` exige de citer le boîtier hôte (son cadre sert de repère), et le script **réécrit alors `src/webview/composants/externe/ic14.svg`** — avec le texte « IC-14 » que Frank a laissé sur la planche depuis. Toutes les captures de fiches (`scripts/_capture-part.mjs`) sortent ensuite avec ce filigrane et en 368×154 au lieu de 368×163.

Réflexe après toute extraction `X@ic14` : `git checkout -- src/webview/composants/externe/ic14.svg`, puis (re)capturer.

Même piège pour les schémas internes déjà livrés : réextraire `CD40106@ic14` produit un fichier différent de celui commité (Frank a restructuré son dessin depuis) — même rendu, autre balisage. Ne réextraire QUE ce que le lot demande. Voir [[kablix-retouche-pipeline]].
