---
name: kablix-zorder-pico-grove
description: "Z-order Pico/Grove Shield : le hissage pin-reachable du shield le passait devant la Pico enfichée — figé à z=0 par CSS."
metadata: 
  node_type: memory
  type: project
  originSessionId: b10e65ff-3839-494a-9de0-e43bb436c381
  modified: 2026-07-25T08:13:16.395Z
---

Z-order des composants dans l'éditeur Kablix (`media/styles.css`) : `.part` z=3, `.part--under-wires` (mcu/breadboard/grove) z=1, `.part--shield` (Grove Shield) z=0. Une Pico enfichée (mcu, z=1) doit donc rester DEVANT son Grove Shield (z=0).

Régression (corrigée v2026.7.177) : au survol d'une broche du shield, le hissage `.part--pin-reachable` (z=4, posé par `onPointerHover` dans editor.mts pour rendre une pastille masquée cliquable) faisait remonter le shield DEVANT la Pico — elle « disparaissait » sous le socle tant qu'on survolait une de ses broches. Fix CSS : `.part--shield.part--pin-reachable { z-index: 0 }` (le shield ne remonte jamais devant la Pico posée dessus).

Attention pour les autres états qui hissent (`.part--sim-active` z=60, `.part--pinout-shown` z=50) : si un jour le Grove Shield entre dans l'un d'eux il repasserait devant la Pico — même correctif ciblé à prévoir. Repro/validation via harnais headless (getComputedStyle du container + ordre DOM). Test : `verify:grove` (« empilement conservé shield z=0 sous Pico z=1 »). Voir [[kablix-webview-geometry-headless]].
