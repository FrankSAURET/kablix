---
name: kablix-rp2350js-verdict
description: rp2350js évalué 21-22/08/2026 — leur Cortex-M33 tourne à 60-70 % de notre moteur (le « ÷14 » venait de tsx) ; cache de décodage M33 écrit et mesuré : +3 %, piste fermée.
metadata:
  type: project
---

Pistes 7/8 de la roadmap tranchées le 21 août 2026, **chiffres corrigés le 22**
(v2026.8.102.7). Régimes en JS **compilé**, même charge, même machine, meilleure de
3 passes : notre `rp2040js` patché ×0,156 · leur RP2040 ×0,149 · leur RISC-V ×0,107
· leur **Cortex-M33 ×0,109**. Rapport mesuré **en entrelacé** (seul valable) :
**60-70 % de notre vitesse**, utilisable. Piste 9 (intégration) **débloquée**.

Le verdict du 21/08 (« M33 ÷14, inutilisable ») était faux : les bancs tournaient
sous `tsx`, qui **divise le M33 par 8** à lui seul (fichiers importés + keepNames →
V8 n'inline plus) et **ne touche pas le M0+** (fichier unique) — piège invisible
sans comparer deux cœurs. Corollaire corrigé : leur RP2040 n'est pas 20 % plus
lent que le nôtre, mais 5 %.

Manques du README (« Timer and System Interrupts », « Exceptions ») = fausse
alerte : timers et IRQ marchent sur les deux cœurs. Deux bugs corrigés pendant
l'éval (patch dans `scripts/rp2350js-eval/`) : IRQ GPIO du RP2350 (2 lignes) et CSR
`mcycle` absent en RISC-V (NeoPixel figeait, 15 lignes).

**Why:** la marge par le décodage est **fermée, mesurée** : le cache M33 a été
écrit (cascade de 74 `else if` → table Uint8Array(65536) + switch dense,
`optim-thumb16-table.patch`, 898 tests verts) et ne rapporte que **×1,03**.
Décoder du Thumb est bon marché (16 bits, champs contigus) ; leur cache RISC-V
(×1,44, pas ×1,93) paie pour des immédiats éclatés qui n'existent pas en Thumb.
Profil M33 = le nôtre : executeInstruction 27 %, boucle 20 %, mémoire 5 %.

**How to apply:** ne jamais mesurer un moteur sous `tsx` — bundler esbuild comme le
code livré (`scripts/rp2350js-eval/banc-compile.mjs`). Et **ne jamais comparer deux
mesures de fenêtres différentes** : la machine dérive de ±40 % en une soirée, ce
qui a gonflé deux chiffres publiés (×1,93 et ×1,43, faux tous les deux). Tout
rapport passe par `ab.mjs` : deux bundles figés, relancés en alternance, 3 passes,
meilleure de chaque côté. Voir [[kablix-vitesse-pico-plan]] et
[[kablix-vitesse-pico-diagnostic]].
