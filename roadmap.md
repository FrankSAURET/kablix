# Roadmap Kablix — pistes d'amélioration

Au 21 août 2026 : pistes 1, 2, 3 et 4 closes ; pistes 5 et 6 déclassées par le banc WASM. Chaque piste : ce que c'est, pourquoi ça compte, ce que ça coûte.  

Détail technique : `scripts/vitesse-pico.md` §12 et §13, et `todo.md`.

---

## Confort de développement

### 1. ✅ **Faire tourner les tests en parallèle** — *fait le 21 août 2026 (v2026.8.102.3)*

La suite complète (`verify:all`) enchaînait 93 bancs **l'un après l'autre** : 14 minutes sur une machine à 12 cœurs. Les bancs qui **mesurent du temps** (vitesse Pico, 7 segments multiplexé) devaient rester seuls pour ne pas fausser leurs chiffres, mais tout le reste pouvait tourner par paquets.

Résultat : **5 min 20**, 8 bancs en parallèle, les trois sentinelles de temps jouées seules à la fin. Un échec n'arrête plus la suite. Les 3-4 minutes visées ne sont pas atteintes et ne le seront pas ainsi : le plancher est le temps cumulé divisé par les cœurs, soit 3 min 20, et une bonne moitié des bancs pilote un Chrome headless qui consomme déjà plus d'un cœur. Détail dans `todo.md`.

### 2. ✅ **Alléger le bundle de la webview** — *mesuré, et clos : rien à faire (v2026.8.90)*

`dist/webview.js` pèse **3,31 Mo**, dont 2,55 Mo de dessins SVG inlinés (`pca9685.svg` à lui seul 468 Ko, 1 370 chemins — de vrais dessins, aucun bitmap caché, rien à récupérer par optimisation).

La mesure a été faite avant d'y toucher, dans un vrai Chrome : **117 à 310 ms** de chargement, contre 32 à 40 ms une fois les dessins retirés. V8 compile paresseusement, les grandes chaînes ne lui coûtent presque rien. Il n'y a pas de problème à résoudre — **chantier déclassé**.

---

## Vitesse de simulation

### 3. ✅ **Autoriser le WASM dans la webview (une ligne)** — *fait le 21 août 2026 (v2026.8.102.4)*

La webview tournait sous une règle de sécurité stricte (CSP) qui interdisait d'exécuter du code compilé — dans la page **et** dans le worker de simulation, qui hérite de la même règle. Un mot-clé ajouté dans [webview-html.ts:74](src/webview-html.ts#L74) : `'wasm-unsafe-eval'`, qui autorise la compilation WebAssembly **et elle seule** (pas `eval`, pas de script sans nonce).

Vérifié par le banc de la piste 4, dans un vrai Chrome, sous la CSP réelle relue depuis le code source : WASM instancié ✅ dans la page, ✅ dans un worker `blob:`. La porte est ouverte, quel que soit le sort des pistes suivantes.

### 4. ✅ **Banc de vitesse WASM** — *fait le 21 août 2026 (v2026.8.102.4) — verdict : ×1,9, la piste 6 est morte*

Le test qui devait décider de tout le reste. Il a décidé.

Trois interpréteurs exécutent **le même code Thumb, octet pour octet** : `rp2040js` (le moteur d'aujourd'hui), un **miroir JavaScript** écrit exprès (même jeu de 25 opérations, même table de décodage, même mémoire que le C) et un **cœur WASM**. Le miroir est le point de comparaison honnête : mesurer contre `rp2040js` aurait mélangé le gain du langage avec le gain de « faire moins de choses ». Le code exécuté n'est pas inventé non plus — il rejoue à 0,61 % près le mélange d'instructions relevé sur le **vrai firmware MicroPython** du Pico. Et avant tout chiffre, les trois moteurs sont vérifiés identiques : registres, drapeaux, cycles et empreinte de la SRAM après 254 161 instructions.

Résultat, Node comme Chrome : **gain brut ×1,86 à ×1,98**. Avec les périphériques, ×2,1 à ×2,2.

**Deux surprises**, et ce sont elles qui comptent :

- **Le pont n'est pas le coupable.** C'était la peur de départ. Dès **64 instructions** entre deux retours en JavaScript, on est à 93 % du plafond — un émulateur rend la main bien plus souvent que ça sans y perdre. Le relais ne coûte cher que si on repasse en JS à *chaque* instruction, ce qu'aucun portage sérieux ne ferait.
- **C'est le plafond du langage qui est bas.** V8 compile déjà très bien un interpréteur. Le même interpréteur en C ne rapporte que ×1,9 — pas les ×3 exigés, pas les ×2 à ×4 espérés.

Troisième chiffre, non demandé mais parlant : le **miroir JavaScript** va **×1,7 plus vite que `rp2040js`** — sans WASM. Il est incomplet (ni interruptions, ni périphériques, ni carte mémoire), donc l'écart n'est pas gratuit ; mais il invite à gratter dans le JS avant de changer de langage.

Détail complet, tables de mesures et méthode : `scripts/vitesse-pico.md` §13. Rejouer : `node scripts/_banc-wasm.mjs` (2 min).

### 5. ⛔ **Regarder `cts2c`** — *déclassée le 21 août 2026 par le banc*

Un outil extérieur qui **traduit automatiquement** l'émulateur TypeScript en C, annoncé 2 à 4 fois plus rapide. L'annonce reposait sur le même mécanisme que la piste 6 : passer du JavaScript à un langage compilé. Le banc vient de mesurer ce mécanisme, ici, sur ce code : **×1,9**, pas ×2-×4.

Une traduction automatique fera au mieux aussi bien qu'un cœur écrit à la main — et le cœur écrit à la main a été mesuré. **À ne rouvrir que sur argument nouveau** (par exemple une mesure publiée sur un émulateur ARM, pas sur du calcul pur).

### 6. ⛔ **Réécrire le cœur du Pico en WASM** — *morte le 21 août 2026*

Le gros chantier : réécrire le Cortex-M0+ dans un langage compilé vers WASM, avec sa mémoire et ses interruptions. Gain espéré ×2 à ×4, coût 25 à 38 jours.

La règle était posée d'avance (`scripts/vitesse-pico.md` §12) : **sous ×3 de gain brut, on arrête d'y penser.** Mesuré : **×1,86**. Deux jours de banc ont économisé cinq semaines de travail sur le morceau le plus délicat du projet — c'est exactement ce qu'on lui demandait.

Ce qui reste vrai : le WASM *fonctionne* dans la webview (piste 3), et le pont JS↔WASM n'est pas un obstacle. Si un jour un cœur ARM en WASM tombe du ciel tout écrit, rien n'empêche de le brancher. Mais on ne l'écrira pas.

### 12. ✅ **Où chercher la vitesse maintenant** — *mesuré le 21 août 2026 (v2026.8.102.5) — il n'y a plus de gros gain dans notre JS*

Le banc [`_banc-profil-pico.mjs`](scripts/_banc-profil-pico.mjs) profile le vrai moteur sur le vrai firmware, en quatre phases (où tombe le temps · combien d'appels par instruction · ce que coûte un service de la boucle · ce qu'un patch rapporterait), sur trois charges. Détail complet : [`vitesse-pico.md`](scripts/vitesse-pico.md) §14.

**Où part le temps** : interpréteur **59-61 %**, boucle de simulation **23-27 %**, mémoire **11-13 %**, périphériques ≤ 1 %, ramasse-miettes **0,1 %**. Deux fonctions font 85 % du travail.

**Trois suspects écartés avec un chiffre** : le ramasse-miettes (l'émulateur n'alloue pas dans sa boucle chaude), les périphériques (même en basculant une broche en continu), et la boucle elle-même — la **vider entièrement** (plus de `pio.advance`, plus d'horloge par instruction) ne rend que **+11 à +22 %**, et ni l'un ni l'autre n'est gratuit : sauter le PIO demande de savoir qu'aucune machine ne tourne, grouper l'horloge décale les alarmes (déjà refusé en v86, SysTick et NeoPixel décrochent).

**Un seul candidat dépasse le bruit** : inliner l'accès SRAM dans le cœur, comme le patch l'a déjà fait pour la lecture d'instruction — **+5 à +6 %** mesurés. Non fait : c'est une modification du patch `rp2040js`, à décider et à re-valider à part.

**Ce que ça règle** : l'écart ×1,7 avec le miroir JS du §13 ne vient pas de la boucle mais de l'intérieur de `executeInstruction`, déjà retourné deux fois pour +30 % cumulés (§9, §10). La marge restante est en points, pas en facteurs. La piste 7 (`rp2350js`) a été mesurée avec ce banc : leur Pico 2 tourne, à 60-70 % de notre vitesse (§15).

---

## Nouvelles cartes : Pico 2 et Pico 2 W

Le Pico 2 n'est pas un Pico plus rapide : c'est un **autre processeur** (Cortex-M33, ou RISC-V au choix). La bibliothèque qu'utilise Kablix n'en simule rien, et le MicroPython du Pico 2 ne tournera jamais sur notre cœur actuel. Écrire ça de zéro serait plus gros que la piste 6. **Mais quelqu'un l'a déjà écrit.**

### 7. ✅ **Évaluer `rp2350js`, la bibliothèque qui simule déjà le Pico 2** — *mesuré le 21 août, **corrigé le 22** (v2026.8.102.8) — leur Pico 2 marche, à 60-70 % de la vitesse du nôtre*

Évaluation faite comme prévu, hors de Kablix, avec les **vrais** MicroPython officiels des trois cartes, un REPL piloté au clavier virtuel et dix tests qui sont exactement ce dont Kablix a besoin : temporisations, LED qui bascule, minuterie, bouton, PWM, capteur analogique, NeoPixel, I²C. Détail complet : [`vitesse-pico.md`](scripts/vitesse-pico.md) §15 ; bancs rejouables : [`scripts/rp2350js-eval/`](scripts/rp2350js-eval/README.md).

**Leur Pico 2 fonctionne pour de bon** — MicroPython démarre, la LED clignote, tout répond. Et il est **utilisable** : sur la même machine et le même programme, il tourne à **60-70 % de la vitesse de notre Pico actuel** (la fourchette est celle de la machine, qui dérive de ±40 % d'une heure à l'autre). Une LED qui doit clignoter une fois par seconde clignote sept fois en dix secondes. C'est neuf fois plus lent que la vraie carte — exactement le même ordre que ce que Kablix fait déjà avaler au Pico 1.

> ⚠️ **Le verdict du 21 août disait l'inverse et il était faux.** Il annonçait « quatorze fois plus lent, inutilisable ». Les bancs tournaient sous `tsx`, un lanceur TypeScript qui, à lui seul, divise ce processeur-là par huit (et ne touche pas les autres — d'où le piège). Rejoués sur du JavaScript compilé, comme l'est le code livré dans Kablix, tous les chiffres changent. Leçon retenue : **un banc de vitesse se mesure sur le code tel qu'il sera livré.**

Deux effets de bord, eux aussi corrigés au passage : leur ancien Pico n'est **pas** 20 % plus lent que le nôtre, l'écart réel est de 5 % — dans le bruit. Nos optimisations maison (+30 %) ne sont donc plus une raison de garder notre moteur : leur bibliothèque pourrait porter les deux cartes.

La marge qu'on croyait tenir a été **essayée, pas estimée** — et elle n'y était pas. Ils ont écrit une **mémoire de décodage** (qui évite de réanalyser chaque instruction à chaque passage) uniquement pour la variante RISC-V ; elle vaut **×1,44** chez eux, mesuré en la débranchant. Écrite pour le processeur du Pico 2 — cascade de 74 tests remplacée par une table de 64 Ko couvrant tous les opcodes possibles, leurs 898 tests toujours verts — elle ne rapporte que **3 %**. Raison, et elle est structurelle : **décoder du Thumb est bon marché** (16 bits, champs contigus), alors que décoder du RISC-V est cher (nombres éclatés à recoller) — c'est ce travail-là que leur mémoire économise. Le motif ne se transpose pas.

Le temps du Pico 2 part donc là où part le nôtre : dans l'interpréteur (60 %) et la boucle d'appel (20 %). Pas de défaut ponctuel à corriger — il fait simplement plus de travail par instruction qu'un Pico 1, ce qui est normal pour son jeu d'instructions. Les 30-40 % se grignoteraient en points, pas en un coup.

**Verdict : oui, en acceptant 30 à 40 % de moins.** La table de décodage Thumb-16 est acquise et sans risque (patch archivé) ; le reste ne vaut pas un chantier.

### 8. ✅ **Vérifier leurs manques AVANT de s'emballer** — *21 août 2026 — fausse alerte : ce n'est pas là que ça casse*

La question du jour 1 a été posée à la machine, pas au README : les minuteries et les interruptions **marchent**. Une pause d'une demi-seconde dure bien une demi-seconde, une minuterie réglée sur 100 ms compte bien ses dix tours en une seconde — sur les deux processeurs du Pico 2. La liste de leur documentation concerne surtout la variante RISC-V et des registres de détail.

Trois vrais défauts trouvés en revanche, dont **deux corrigés sur place** pendant l'évaluation :

- le **bouton n'interrompait jamais le programme** (sur les deux processeurs du Pico 2) : erreur de recopie d'un calcul d'adresse quand ils ont porté le code de l'ancien Pico. **Deux lignes.**
- le **NeoPixel figeait** sur la variante RISC-V : le compteur de cycles du processeur n'existait pas et renvoyait toujours zéro — le programme l'interrogeait 14 millions de fois en attendant qu'il avance. **Quinze lignes.**
- l'**I²C fige** sur la variante RISC-V. Non élucidé : le verdict de la piste 7 ne dépendait plus de lui.

Les correctifs sont archivés dans [`scripts/rp2350js-eval/`](scripts/rp2350js-eval/README.md) — ils ne leur ont pas été proposés à ce jour.

### 9. ✅ **Intégrer le Pico 2 et le Pico 2 W dans Kablix** — *fait le 22 août 2026 (v2026.8.102.9, dessins et fiches en v2026.8.102.10)*

Les deux cartes sont dans le catalogue, se choisissent dans la barre d'outils, chargent leur firmware MicroPython (`RPI_PICO2`, `RPI_PICO2_W`) et tournent sur le cœur **Cortex-M33** de [`c1570/rp2350js`](https://github.com/c1570/rp2350js), vendorisé dans [`vendor/rp2350js/`](vendor/rp2350js/ORIGINE.md) et régénérable par script. Le Pico 1 garde `rp2040js` : leur RP2040 vaut le nôtre à 5 % près, mais changer de moteur sous une carte qui marche n'achetait rien.

Ce qu'il a fallu écrire en plus de la copie : le **coprocesseur GPIO du RP2350** (`patches/rp2350js/03-gpioc-mcrr.patch`). Le SDK y route `gpio_put`/`gpio_get` par des instructions `MCR`/`MCRR` que leur code ignorait ou décodait à l'envers — sans ça, **aucune broche ne bougeait**. Leurs deux correctifs (bouton, NeoPixel) sont embarqués dans les patchs 01 et 02.

Les **dessins de Frank** ont suivi en v2026.8.102.10 : cartes en portrait extraites de `Composants2D.svg` (90×220, les 40 pattes nommées à partir des deux pastilles de repère), poster de brochage propre à chaque modèle, fiches d'aide FR illustrées et tests dans `testkablix/pico2/`.

Reste ouvert, sans bloquer l'usage :
- **le C/C++ bare-metal**, refusé avec un message clair sur ces deux cartes (cortex-m33, éditeur de liens et vecteur de démarrage à porter) : MicroPython seulement ;
- **les versions EN** des deux fiches, comme toute traduction : avant publication.

---

## Nouvelles cartes : ESP32

Derrière le mot « ESP32 » il y a deux mondes de puces incompatibles. Une seule famille est atteignable.

### 10. **Sonder l'émulateur officiel Espressif pour l'ESP32-C3**

Espressif (le fabricant) publie son propre émulateur, sous une licence compatible, avec une version navigateur documentée. Il couvre les puces C3, C6, H2, P4. Et comme pour le Pico, **MicroPython existe en binaire prêt à charger** — rien à compiler.  
**Mais l'obstacle n°1 n'est pas le processeur, c'est la façon de lui parler.** Leur émulateur est conçu comme un outil autonome : on lui branche des périphériques par le réseau. Kablix a besoin de l'inverse — être prévenu instantanément quand une broche change, puisque nos LED sont des éléments de la page web. Sans ces crochets, aucune LED ne s'allume, même avec un cœur parfait.  
Attention aussi : projet annoncé en beta, très jeune (7 modifications). À sonder avec méfiance, à re-sonder plus tard s'il n'est pas prêt — c'est un projet officiel, il va probablement grossir.  
Coût : 3-5 jours. Priorité :

### 11. **Ajouter la famille ESP32 à Kablix**

Si les crochets de la piste 10 existent. Ce n'est **pas** une variante du Pico : c'est un **troisième moteur** à côté de l'AVR et du RP2040, avec son brochage, ses dessins, son catalogue, ses tests et ses fiches d'aide.  
Coût : 20-40 jours. Bloqué par la piste 10. Priorité :

---

## Points à revoir

1. **ESP32 classique (Xtensa) : bloqué par la licence, pas par la technique.** Les seuls émulateurs sérieux sont des dérivés de QEMU, donc sous licence GPL — incompatible avec la distribution d'une extension MIT comme Kablix. Wokwi le fait, mais eux ne distribuent pas un paquet installable. À ne pas engager sans avis clair.
2. **ESP8266 : rien de sérieux à émuler.** Ne pas le promettre.
