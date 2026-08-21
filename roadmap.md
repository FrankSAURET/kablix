# Roadmap Kablix — pistes d'amélioration

Au 15 août 2026, pistes 1 et 2 closes le 21 août. Chaque piste : ce que c'est, pourquoi ça compte, ce que ça coûte.  

Détail technique : `scripts/vitesse-pico.md` §12 et `todo.md`.

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

### 3. **Autoriser le WASM dans la webview (une ligne)**

La webview de Kablix tourne sous une règle de sécurité stricte (CSP) qui interdit d'exécuter du code compilé. Vérifié le 15/08 : sans le mot-clé `'wasm-unsafe-eval'`, le navigateur refuse tout WASM — dans la page **et** dans le worker de simulation, qui hérite de la même règle.  
Une ligne dans [webview-html.ts:74](src/webview-html.ts#L74). À faire au **jour 1** de la piste 4, sinon le banc ne démarre même pas.  
Coût : 10 minutes. Priorité : 1

### 4. **Banc de vitesse WASM — le test qui décide de tout le reste**

Aujourd'hui le cœur du Pico est simulé en JavaScript, et c'est ~11 fois plus lent que la vraie puce. L'idée depuis des mois : réécrire ce cœur en **WASM** (du code compilé qui tourne dans le navigateur, beaucoup plus rapide que JavaScript). Problème : à chaque instruction simulée, le WASM doit repasser la main au JavaScript pour faire avancer l'horloge et les périphériques — et **ce passage de relais coûte cher**. Si le relais mange tout le gain, la réécriture ne sert à rien.  
Le banc mesure exactement ça : la même poignée d'instructions, une fois en rafale dans le WASM, une fois avec retour au JavaScript à chaque instruction. Le rapport des deux, c'est le prix du pont.  
**Verdict attendu : sous ×3 de gain brut, la piste 6 est morte** et on arrête d'y penser.  
Coût : 2-3 jours. À faire **avant** toute décision. Priorité : 2

### 5. **Regarder `cts2c` : le cœur WASM peut-être déjà écrit par quelqu'un d'autre**

Une équipe extérieure a écrit un outil qui **traduit automatiquement** le code de l'émulateur (TypeScript) en langage C, annoncé 2 à 4 fois plus rapide — exactement le gain visé par la piste 6. Leur but à eux est un programme classique, mais un fichier C se compile aussi en WASM.  
Si ça marche, c'est **cinq semaines de travail remplacées par quelques jours**. À sonder juste après le banc.  
Coût : sondage 2-3 jours. Priorité : 3

### 6. **Réécrire le cœur du Pico en WASM**

Le gros chantier. Réécrire le processeur Cortex-M0+ (celui du Pico) dans un langage compilé vers WASM, avec sa mémoire et ses interruptions. Gain espéré : ×2 à ×4 sur la vitesse de simulation Pico.  
C'est cinq semaines de travail sur un morceau très délicat (les interruptions et les exceptions du processeur), et **la piste 4 peut la tuer en 2 jours**. À ne lancer qu'après le banc, et seulement si le banc est bon.  
Coût : 25-38 jours. Bloqué par la piste 4. Priorité : 4

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
