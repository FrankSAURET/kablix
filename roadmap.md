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

**Ce que ça règle** : l'écart ×1,7 avec le miroir JS du §13 ne vient pas de la boucle mais de l'intérieur de `executeInstruction`, déjà retourné deux fois pour +30 % cumulés (§9, §10). La marge restante est en points, pas en facteurs. La piste 7 (`rp2350js`) reste la seule à promettre un facteur — et se mesurera avec ce banc.

---

## Nouvelles cartes : Pico 2 et Pico 2 W

Le Pico 2 n'est pas un Pico plus rapide : c'est un **autre processeur** (Cortex-M33, ou RISC-V au choix). La bibliothèque qu'utilise Kablix n'en simule rien, et le MicroPython du Pico 2 ne tournera jamais sur notre cœur actuel. Écrire ça de zéro serait plus gros que la piste 6. **Mais quelqu'un l'a déjà écrit.**

### 7. **Évaluer `rp2350js`, la bibliothèque qui simule déjà le Pico 2**

Un fork libre (licence MIT, compatible avec Kablix), très actif, qui simule les deux processeurs du Pico 2 **et** garde l'ancien Pico. Une seule bibliothèque pour les quatre cartes. Ils annoncent MicroPython qui tourne dans les deux variantes.  
L'évaluation se fait **hors de Kablix** : lancer leur émulateur avec le MicroPython officiel du Pico 2, faire clignoter une LED, mesurer la vitesse.  
Coût : 2-3 jours. Priorité : 1

### 8. **Vérifier leurs manques AVANT de s'emballer**

Leur documentation liste ~30 fonctions non implémentées, dont **les minuteries et les interruptions**. Or Kablix repose entièrement là-dessus : c'est ce qui fait avancer le temps, les alarmes, l'affichage 7 segments, le NeoPixel.  
Si ces manques sont réels et profonds, la piste 7 s'arrête là, quelle que soit sa qualité par ailleurs. **C'est LA question du jour 1.**  
Coût : compris dans la piste 7. Priorité : 2

### 9. **Intégrer le Pico 2 et le Pico 2 W dans Kablix**

Si les pistes 7 et 8 passent. Leur bibliothèque n'est pas remplaçable telle quelle (leur façon de l'appeler a changé) et n'est pas publiée sur npm : il faut la copier dans le projet et écrire une couche d'adaptation. Notre optimisation maison (+30 %) tombe : leurs 686 modifications ont les leurs, à re-mesurer.  
Ensuite : dessiner les deux nouvelles cartes, ajouter leurs firmwares, leurs tests, leurs fiches d'aide.  
Coût : 10-20 jours. Bloqué par les pistes 7 et 8. Priorité : 3

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
