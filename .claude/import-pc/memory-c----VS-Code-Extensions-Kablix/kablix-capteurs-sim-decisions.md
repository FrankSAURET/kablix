---
name: kablix-capteurs-sim-decisions
description: Décisions de Frank sur les contrôles de simulation des capteurs (flamme/gaz/son/lumière/temp/PIR/msg sim)
metadata: 
  node_type: memory
  type: project
  originSessionId: 4399a11b-7840-485c-9d88-83dc00070382
---

Décisions prises le 2026-07-08 pour le lot « capteurs actifs en simulation » (Kablix), à appliquer via l'infra `simControl`/`simulating` ([[kablix-siminfra-simcontrol]]).

**Flamme / gaz / son / lumière** (double sortie DOUT + AOUT, curseur d'intensité + propriété sensibilité 0-100 %) :
- Sens AOUT : **la tension BAISSE quand l'intensité monte** (repos = haut, détection = bas, comme modules KY).
- DOUT **actif-bas** : passe à l'état détecté quand intensité > sensibilité.

**Capteur de température** (item 9, NTC -55→+125 °C) : curseur **en simulation seulement**, plus de propriété dans l'inspecteur. Variation NTC inverse (T° ↑ → tension ↓).

**PIR** (item 11) : détection = **survol du composant** (souris au-dessus → OUT=1). Ctrl+clic = mouvement permanent affiché dans la bulle.

**Message « Simulation en cours »** (item 3) : ancré **près du curseur souris** (pas bandeau fixe), clignote 3× en rouge sur action interdite (édition pendant simulation verrouillée).

**Why:** ces choix conditionnent l'implémentation et ont été tranchés une fois pour tout le lot ; Frank a demandé de tout faire sans interruption après.
