---
name: kablix-pico-regime-instrumentation
description: "v2026.8.11 — le régime Pico bas (0,33) venait de l'instrumentation de pas à pas, pas de l'émulateur ; garde `__kx_on and` + sonde Timer 50 ms → 0,78 ; plafond 1,00 sans instrumentation"
metadata: 
  node_type: memory
  type: project
  originSessionId: 21ddf968-74d0-4126-90b1-bd8bab7f0bba
  modified: 2026-08-07T09:22:13.595Z
---

Le « ralenti » du Pico (badge 0,33 sur `testkablix/Horloge.py`, l'heure avançant 3× trop lentement) ne venait **ni de l'émulateur ARM ni de l'USB** : il venait du débogueur. `instrumentPython` (`src/shared/pydebug.ts`) insère un appel avant CHAQUE ligne du script de l'élève, et cet appel s'exécutait même sans point d'arrêt.

Chiffres mesurés (v2026.8.11, `scripts/_ab-instrumentation.mjs`, une variante par processus sinon les moteurs zombies se polluent) :
- script brut **0,997** · instrumenté **0,30** ;
- décomposition en instructions ARM par ms simulée : brut 10 850 · garde seule 13 312 (**+23 %**) · garde + lambdas de locales 15 319 (**+18 %** de plus, cellules de fermeture imposées à toute la fonction).

Correctif livré : la ligne insérée est `__kx_on and __kx(N)` (court-circuit : ni appel ni lambda construite), et une **sonde `machine.Timer` 50 ms** arme la garde en lisant stdin à la place de chaque ligne. Elle se tait dès que la garde est armée — sinon deux lecteurs se volent les octets de `\x05`/`\x10`. Régime : **0,33 → 0,78**.

**Fausses pistes déjà payées, ne pas y revenir** : (a) l'USB — porter la réponse du endpoint CDC de 1 ms à 50 ms divise les IRQ USB par 38 et ne change PAS le régime (0,272) ; (b) amortir le sondage stdin à une ligne sur 200 ne rapporte rien (0,345), le coût est l'APPEL Python lui-même ; (c) v2026.8.4, ne plus avancer les PIO par instruction ne rapporte que 4,9 %.

**Suite v2026.8.12 — 1,00 atteint.** Le 1,00 exige un script non instrumenté : `loadPythonProgram` produit donc DEUX variantes (`payload.script` brut + `payload.scriptDebug` instrumenté) et `PicoEngine` exécute la brute par défaut. Arbitrage de Frank (7 août 2026) : **hybride avec rejeu silencieux** — point d'arrêt posé avant le lancement = démarrage direct en instrumenté (aucune relance) ; bouton Pause sur script brut = gel matériel du simulateur (pas de ligne ni de variables, assumé) ; point d'arrêt ou pas à pas demandé à chaud = Ctrl-C + réinjection par le raw REPL **sans redémarrer le firmware**, puis rejeu **silencieux** (sortie retenue, console effacée, `sim.speed = 100`) jusqu'au point d'arrêt. Garde-fous : 4 Ctrl-C, 20 s de délai maximum.

Voir aussi [[kablix-pico-temps-reel]].
