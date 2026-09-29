---
name: npm-cache-node-modules-trompeur
description: npm audit fix peut mettre à jour package-lock.json sans toucher node_modules ; npm ls et npm audit mentent alors — lire les package.json sur disque.
metadata:
  node_type: memory
  type: project
  originSessionId: 2f85b21c-7d0a-4115-b46f-64b9ed42d93f
  modified: 2026-09-24T08:40:01.875Z
---

Le 24/09/2026 (v2026.9.5.136), `npm audit fix` a écrit les nouvelles versions dans `package-lock.json`, mais `node_modules` gardait les anciennes. Le cache `node_modules/.package-lock.json` annonçait déjà les nouvelles (écrit plus tôt par `npm audit fix --dry-run` ou un `npm install -D`), donc npm n'a rien réinstallé, et `npm ls` comme `npm audit` affichaient un état faux.

**Why:** sans contrôle direct, on aurait livré en annonçant « 0 faille » avec les paquets vulnérables toujours sur disque.

**How to apply:** après toute mise à jour npm, lire `node_modules/<paquet>/package.json` directement. Pour un écart, sans rien effacer : `touch node_modules/<paquet>` (npm ignore son cache quand un dossier est plus récent), puis `npm install`. Voir aussi [[ne-jamais-modifier-fichiers-sans-demander]].
