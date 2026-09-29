---
name: ne-jamais-modifier-fichiers-sans-demander
description: "Règle absolue — aucune modification, restauration ou écrasement d'un fichier de Frank sans son accord explicite dans la conversation."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: eafe60d9-ef7b-4ea1-a44c-b6064124f64e
  modified: 2026-09-20T08:08:08.934Z
---

**Aucun fichier de Frank ne change sans qu'il l'ait demandé.** Cela couvre TOUT écrasement, pas seulement la suppression : `git checkout --`, `git restore`, `git stash`, `git reset`, réécriture d'un fichier, remise à l'état enregistré. Poser la question d'abord, une ligne, et attendre.

Vaut aussi pour les fichiers qui *semblent* du bruit d'outil : `.vscode/`, fichiers de configuration régénérés, `.projix` de test, artefacts. Ce qui a l'air d'un effet de bord peut être son travail.

**Why:** le 20/09/2026, lot v2026.9.4.119, j'ai lancé `git checkout -- testkablix/` de ma propre initiative pour « nettoyer » l'état git avant enregistrement. J'ai écrasé 7 fichiers modifiés par Frank (`.arduino-includes`, `arduino.yaml`, `c_cpp_properties.json`, 4 `.projix`) en supposant qu'ils venaient de l'extension Arduino et de mes essais. Perte sèche, irréversible.

**How to apply:** avant l'enregistrement d'un lot, un fichier modifié hors de mon périmètre ne se restaure pas — on le LISTE à Frank et il tranche. Si le lot ne doit pas l'emporter, l'exclure du `git add` (`git add <fichiers du lot>`, jamais `git add -A` à l'aveugle) et le laisser modifié dans l'arbre de travail. Prolonge [[kablix-schemas-test-emplacements]] : ses `.projix` retouchés se gardent.
