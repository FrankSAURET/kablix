---
name: kablix-vitesse-pico-plan
description: "Vitesse du simulateur Pico — niveau 3 fait (+30 %), cœur WASM MORT (banc ×1,86 < seuil ×3), profil mesuré : plus rien de gros dans notre JS ; rapport dans scripts/vitesse-pico.md"
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

**#16 (cœur M0+ en WASM) est MORTE, v2026.8.102.4.** Banc écrit exprès
(`scripts/_banc-wasm.mjs`) : même code Thumb dans trois interpréteurs, dont un
miroir JS de même périmètre que le C pour ne pas confondre le gain du langage
avec celui de « faire moins de choses ». Gain **×1,86** (×1,98 sous Chrome +
CSP réelle), seuil posé d'avance **×3**. Le pont n'est pas le coupable : à K=64
instructions on est à 93 % du plafond. Piste `cts2c` déclassée dans la foulée.
La CSP `'wasm-unsafe-eval'` a quand même été ajoutée (v2026.8.102.4).

**Où part le temps, mesuré le 21 août 2026** (v2026.8.102.5,
`scripts/_banc-profil-pico.mjs`, §14 du rapport) : interpréteur 59-61 %, boucle
23-27 %, mémoire 11-13 %, périphériques ≤1 %, ramasse-miettes 0,1 %. **Trois
suspects écartés** : GC, périphériques, et la boucle (la vider entièrement ne
rend que +11 à +22 %, et ni sauter le PIO ni grouper l'horloge n'est gratuit).
Seul candidat au-dessus du bruit : **SRAM inlinée dans le cœur, +5 à +6 %**, non
fait. La marge restante est en points, pas en facteurs — **la piste 7
(`rp2350js`, leurs 686 modifications) est la seule à promettre un facteur**.

**Troisième leçon de méthode : chiffrer un candidat sans se mentir.** Patch posé
sur l'**instance** → la forme de l'objet change, V8 désoptimise, tous les
candidats sortent à −30/−45 % (on mesure la désoptimisation). **Deux processus**
patché/témoin → ±10 % selon où en est le firmware, l'étalon qui ne peut que
ralentir est sorti à +10,9 %. Ce qui tient : **un seul processus**, patch posé
pour de bon sur le **prototype** et activé par un booléen, les deux branches
chauffées, variantes en rond, meilleure gardée. Toujours embarquer un **étalon**
(un appel de méthode de plus par instruction) : il donne la barre de bruit.

Rapport complet (mesures, profil, catalogue niveaux 0→5, chiffrage) :
`scripts/vitesse-pico.md`. Voir aussi [[kablix-vitesse-pico-diagnostic]],
[[kablix-pico-regime-instrumentation]], [[kablix-pico-temps-reel]].
