---
name: kablix-testkablix-generate-ecrase
description: testkablix/_generate.mjs réécrit TOUS les tests et écrase les retouches manuelles ; schémas réaccordés en v2026.8.25, restent 18 programmes divergents
metadata:
  node_type: memory
  type: project
  originSessionId: 6f313411-2bbe-4f97-8cf7-41de39ba2180
  modified: 2026-08-08T16:01:53.434Z
---

`node testkablix/_generate.mjs` régénère tous les `.projix` + `.ino`/`.py` depuis
`_spec.mjs` : il **écrase les fichiers retouchés à la main**.

**Réglé le 2026-08-08 (v2026.8.25)** : les 26 échecs de `_verify.mjs` sont tombés
à 0 (2652 contrôles). La règle appliquée, à reprendre : sur un désaccord, c'est
**la spec qui a tort** — le `.projix` retouché et le programme du disque font foi
(voir [[kablix-schemas-test-emplacements]]).

**Ce qui reste (piège vivant) :** 18 programmes du disque ne sont plus ceux de la
spec (`heartbeat-*`, `ili9341-pico`, `microsd-*`, `neopixel-*`, `button-uno`,
`keypad-uno`, `relais-uno`, `dht22-uno`, `dip-switch-*`, `pot-pico`…). Le banc ne
s'en plaint pas — il compile le fichier réel — mais régénérer les perdrait.
Le plus coûteux : `7seg-pico.py` est **multiplexé** sur disque, et
`npm run verify:7seg-mux` (dans `verify:all`) tombe à ~17 % si la spec l'écrase.

**Comment faire :** régénérer puis restaurer tout ce qui ne relève pas du lot —
`git checkout HEAD -- testkablix ':!testkablix/_spec.mjs' ':!<fichiers du lot>'`.
`_verify.mjs` n'est pas dans `verify:all` (compilations arduino-cli + e2e, ~15 min)
donc sa dérive ne se voit pas : le lancer à la main après toute retouche de test.
