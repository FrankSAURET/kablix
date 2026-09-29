---
name: kablix-vitesse-pico-plan
description: "Vitesse du simulateur Pico — niveau 3 TERMINÉ (+30 %, pistes restantes fermées) ; la suite est #16 (cœur M0+ en WASM) ; rapport chiffré dans scripts/vitesse-pico.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: 871780c4-18ea-41fd-b3d3-2210b8ec8647
  modified: 2026-08-07T15:19:57.013Z
---

Décision de Frank le 7 août 2026 : **niveau 3 d'abord, puis #16**. Niveau 3 fait
et **clos** le même jour.

**#5 (rattrapage borné), v2026.8.17.** Wokwi tient l'horloge parce que son moteur
de production est un cœur natif en WASM (rp2040js est le projet JS d'Uri Shaked,
pas ce que fait tourner wokwi.com) ET parce que son horloge affichée est le temps
simulé. Kablix jetait la dette au-delà de 50 ms : conservée (plafond 2 s),
remboursée à 1,25 au plus. Supprime la dérive accidentelle, ne crée aucune marge.

**Niveau 3 : 12,76 → 16,6 Minstr/s, +30 %, en ~1,5 j au lieu des 9-15 estimés.**
- lot 1, v2026.8.18, +12 % — #13 test d'intervalle dans `findPeripheral` (objet à
  clés éparses = mode dictionnaire V8) et #14 SRAM d'abord + opcode lu direct
  dans `flashView`.
- lot 2, v2026.8.19, +16 % — #12 cascade de 83 `else if` → `Uint8Array(65536)` +
  `switch` (table de saut). Dispersion 13,5 % → 3,9 %. Patch PRODUIT PAR SCRIPT
  (`scripts/_gen-decode-rp2040.mjs`, rejouable après `npm i rp2040js@X`),
  équivalence prouvée par exhaustion (`npm run verify:decode`, dans verify:all).
- v2026.8.20 : **fermetures**, aucun code changé. #11 sans objet (décodage déjà
  O(1)) ; **#8 nulle** (`StateMachine.advance` sortait déjà sur `!enabled` ; le
  « 3 % mesuré » initial était du bruit) ; **#15 fermée sans être codée**
  (plafond 3,3 % au profil, sous la résolution) ; accesseurs mémoire du cœur +
  `cyclesIO` inlinés → ±1 %, annulés ; **vues typées Uint32Array/Uint16Array sur
  le buffer SRAM : PLUS LENTES que DataView**, ne pas y revenir.

**Deux leçons de méthode, chèrement acquises :**
1. **Le profileur ment par inlining.** La boucle `execute` de `pico.mts` pesait
   25,6 % en temps propre ; neutraliser COMPLÈTEMENT `pio.advance()` ×2 et
   `clock.tick()` (`scripts/_ab-boucle-pico.mjs`) ne change rien (15,5 → 15,6).
   C'était `executeInstruction` inliné, remontant dans l'appelant. Vérifier au
   banc avant d'optimiser sur la foi d'un profil.
2. **La machine dérive de ~5 % par session** (même version : 16,80 puis 15,94 à
   20 min d'écart). Deux campagnes successives ne départagent rien sous ~6 %.
   Pour trancher plus fin : **A/B alterné** — les deux versions run après run
   dans la même campagne, ordre inversé une fois sur deux, comparer les
   meilleurs. Descend à ~2 %.

**La suite : #16** (25-38 j) — cœur Cortex-M0+ en WASM (Rust/C), périphériques
laissés en JS, gain ×2 à ×4. Le moteur JS reste la référence de conformité et ne
disparaît jamais. Deux points durs à vérifier AVANT de s'engager : la CSP de la
webview est `script-src 'nonce-…'` donc `WebAssembly.instantiate` y est bloqué
(ajouter `'wasm-unsafe-eval'`) ; et `clock.tick()` est appelé par instruction,
donc l'horloge doit tourner DANS le WASM sous peine d'annuler tout le gain à la
frontière.

Rapport complet (mesures, profil, catalogue niveaux 0→5, chiffrage) :
`scripts/vitesse-pico.md`. Voir aussi [[kablix-vitesse-pico-diagnostic]],
[[kablix-pico-regime-instrumentation]], [[kablix-pico-temps-reel]].
