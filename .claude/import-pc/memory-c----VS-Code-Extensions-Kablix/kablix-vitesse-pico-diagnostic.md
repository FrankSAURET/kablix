---
name: kablix-vitesse-pico-diagnostic
description: "Pourquoi l'horloge Pico retarde — l'émulateur est 11× plus lent que la puce et ne tient le temps réel qu'à 6 % de marge ; ni le firmware ni la webview ne sont en cause"
metadata: 
  node_type: memory
  type: project
  originSessionId: 871780c4-18ea-41fd-b3d3-2210b8ec8647
  modified: 2026-08-07T12:28:31.136Z
---

Mesuré le 7 août 2026 (Ryzen 5 2600, `Horloge.py`) : le moteur Pico tient le
régime **1,00 hors webview**, mais en occupant **82-94 % d'un cœur**. La marge de
6-18 % est plus petite que la variation normale d'une machine — d'où l'horloge qui
retarde certains jours et pas d'autres. Le PC de Frank n'a pas ralenti.

Le calcul central : 10 943 instructions ARM par ms **simulée** contre un débit de
11 600 instr/ms réelle. Une instruction émulée coûte 86 ns contre 8 ns sur la puce
(**×11**) ; le temps réel n'est tenu que parce que MicroPython dort 91 % du temps.
Seuil : **le programme Pico ne doit pas dépasser ~9 % de son propre CPU** sur
cette machine.

Écartés par la mesure, ne pas y revenir : la webview Chromium (identique à Node),
la version du firmware (1.20 → 1.28, Pico et Pico W : tous 0,99-1,00), le latch
7 segments, le regroupement de `clock.tick` (mesuré **contre-productif**, piste
close). Le GPU est hors sujet : l'émulation est séquentielle.

**Piège de mesure** : un moteur `stop()` laisse vivre ses périphériques — mesurer
plusieurs variantes dans un même processus divise par deux tout ce qui suit la
première, et fait « prouver » des conclusions fausses. Tous les bancs
(`scripts/_mesure-*`, `_ab-boucle-pico.mjs`) relancent un processus par variante.

Suite : [[kablix-vitesse-pico-plan]]. Voir aussi
[[kablix-pico-regime-instrumentation]].
