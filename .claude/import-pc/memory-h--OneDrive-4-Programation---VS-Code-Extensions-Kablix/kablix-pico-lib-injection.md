---
name: kablix-pico-lib-injection
description: Kablix Pico sim — les libs .py utilisateur sont injectées dans sys.modules (pas de filesystem)
metadata: 
  node_type: memory
  type: reference
  originSessionId: 4b38e090-1ceb-485f-819d-a8a586e7cce3
---

Le Pico simulé (rp2040js) n'a **aucun système de fichiers monté** : écrire un fichier `.py` échoue avec `OSError 19 ENODEV`. Donc les librairies utilisateur ne peuvent pas être copiées sur un VFS.

Solution (dans [src/compiler.ts] `loadPythonProgram` / `collectPythonLibs` / `pythonLibPreamble`) : chaque module `.py` est `exec()`-uté dans son espace de noms puis déposé dans `sys.modules` (via un préambule base64 → `ubinascii`). L'ordre des dépendances est résolu par réessais.

**Piège corrigé (v75) :** ne collecter QUE les modules réellement importés par le script (BFS sur `parsePyImports` : imports du main + dépendances transitives + paquets parents), résolus parmi les `.py` voisins et le dossier `lib/`. NE PAS exécuter tous les `.py` du dossier — sinon les autres programmes (blink.py…) tournent à tort et bloquent la simu.

Convention utilisateur : mettre les modules à côté du script ou dans `lib/`. Lié à [[pico-micropython-native-modules-readonly]].
