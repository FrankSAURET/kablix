---
name: dire-les-tests-pas-la-suite
description: "Dire « les tests » ou « verify:all », jamais « la suite » seul — lu « par la suite » (ensuite) ; « disque saturé » = préciser occupé, pas plein."
metadata:
  node_type: memory
  type: feedback
  originSessionId: f1b459b3-429c-4302-a56c-734885df6d09
  modified: 2026-09-23T09:42:35.337Z
---

Écrire « les tests (`verify:all`) tournent », pas « la suite ». « Saturé par la suite » a été lu comme « plus tard ». Idem « disque saturé » : dire « disque occupé à 100 % par les tests » — sinon on comprend « disque plein ».

**Why:** le 23/09/2026 Frank a demandé ce que voulait dire « Le disque est saturé par la suite. J'attends sa fin avant de reprendre. » Calque de l'anglais *test suite*, ambigu en français.

**How to apply:** tout message d'attente nomme la chose attendue (quelle commande) et la cause (lecture/écriture, pas place). Voir [[changelog-style-concis]] pour l'esprit : court mais sans ambiguïté.
