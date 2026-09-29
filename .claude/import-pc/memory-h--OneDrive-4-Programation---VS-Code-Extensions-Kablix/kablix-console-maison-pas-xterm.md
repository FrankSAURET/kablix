---
name: kablix-console-maison-pas-xterm
description: La console série/REPL reste la version maison — xterm.js essayé et rejeté (v2026.7.34 → revert v2026.7.35)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cc6c05ad-6717-4d40-b1c1-04593ce8918c
---

Juillet 2026 : la console série/REPL de Kablix a été remplacée par xterm.js embarqué dans la webview (v2026.7.34), puis **entièrement annulée** (v2026.7.35) — « ça ne marche pas du tout » en conditions réelles (le smoke test headless passait pourtant : montage DOM sans erreur ≠ terminal fonctionnel).

**Why:** le bug de sauts de ligne au collage ne venait pas du code mais du presse-papier système de Frank (résolu côté Windows). La classe de bugs qui justifiait xterm n'existait plus.

**How to apply:** ne pas re-proposer xterm.js ni le terminal natif (Pseudoterminal) pour la console Kablix. La console maison (`<pre>` contentEditable + micro-émulation ANSI dans [[kablix-fork-wokwi-elements]] sim.mts) est la solution retenue ; la corriger au cas par cas. Pour valider un changement de console, test en conditions réelles par Frank obligatoire — le rendu headless ne suffit pas pour l'interactivité clavier/collage.
