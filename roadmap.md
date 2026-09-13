# Feuille de route Kablix — pistes explorées

Chaque piste de [Pistes.md](Pistes.md) a été confrontée au code existant : ce qui
est déjà là, ce qu'il faut construire, ce qui bloque. L'objectif retenu est
**pédagogique** — une piste qui fait briller la démonstration mais n'apprend rien
descend dans le classement.

**Comment lire les colonnes**

- **Intérêt** : gain pédagogique réel, de ★ à ★★★★★.
- **Coût** : jetons de conversation nécessaires pour livrer la fonction testée et
  documentée (fiche d'aide comprise). Ordre de grandeur, pas un devis :
  **S** ≈ 50–150 k, **M** ≈ 150–400 k, **L** ≈ 400 k–1 M, **XL** > 1 M.
- **Appui** : ce qui existe déjà et qu'on réutilise. C'est le vrai facteur de coût :
  une piste sans appui coûte trois fois plus qu'une piste qui se greffe.

---

## Le classement

| # | Piste | Intérêt | Coût | Verdict |
|---|-------|---------|------|---------|
| 1 | [Schéma verrouillé (TP à trous)](#1-schéma-verrouillé--le-tp-à-trous) | ★★★★★ | **S** | **À faire en premier** |
| 2 | [Linter électronique](#2-linter-électronique--relire-le-code-face-au-schéma) | ★★★★★ | **M** | **À faire** |
| 3 | [Pièges à code](#3-pièges-à-code--les-mauvaises-habitudes) | ★★★★☆ | **S** | **À faire** (extension du n°2) |
| 4 | [Analyseur logique](#4-analyseur-logique) | ★★★★☆ | **M** | **À faire** |
| 5 | [Consommation en temps réel](#5-consommation-énergétique-en-temps-réel) | ★★★★☆ | **M** | **À faire** |
| 6 | [Batterie et durée de vie](#6-batterie-et-durée-de-vie) | ★★★★☆ | **S** | **À faire** après le n°5 |
| 7 | [Notation automatique](#7-notation-automatique-par-assertions) | ★★★★☆ | **L** | À faire, plus tard |
| 8 | [Vue des périphériques internes](#8-vue-des-périphériques-internes-timer-adc) | ★★★★☆ | **L** | À faire, plus tard |
| 9 | [Dégradation thermique](#9-dégradation-thermique-effet-joule-visuel) | ★★★☆☆ | **S** | Bon rapport, à glisser |
| 10 | [Variables locales sur AVR](#10-hors-liste--les-variables-locales-manquent-sur-avr) | ★★★★☆ | **M** | **Manque, pas une évolution** |
| 11 | [Associer des composants](#11-associer-des-composants-entre-eux) | ★★★☆☆ | **S** | À préciser |
| 12 | [Succès / badges](#12-succès-badges) | ★★☆☆☆ | **S** | Optionnel |
| 13 | [Comparaison visuelle de schémas](#13-comparaison-visuelle-de-schémas-visual-diff) | ★★☆☆☆ | **M** | Faible pour l'élève |
| 14 | [Rembobinage de la simulation](#14-rembobinage-de-la-simulation) | ★★★☆☆ | **XL** | **Écartée** |
| 15 | [Mode Time Attack](#15-mode-time-attack) | ★☆☆☆☆ | **M** | Écartée |

---

## 1. Schéma verrouillé — le TP à trous

**Le meilleur rapport de toute la liste.** C'est la seule piste qui change la vie
de l'enseignant AVANT le cours, pas pendant.

Deux sens d'usage, tous deux utiles : circuit figé / code à écrire, ou code
fourni / circuit à câbler.

**Appui** — presque tout est déjà là :

- Le verrou d'édition existe et fonctionne : `setLocked()` dans
  [editor.mts](src/webview/diagram/editor.mts), armé pendant la simulation. Il
  interdit déjà déplacement, suppression et câblage.
- Le manifeste `.projix` est versionné et extensible
  ([projix.ts](src/projix.ts), `ProjixManifest`) : un champ `verrou` s'y pose
  sans casser les fichiers existants.
- Le retour « édition interdite » est déjà écrit (`onBlockedEdit`).

**Reste à faire** : un verrou **persistant** distinct du verrou de simulation
(trois niveaux : tout figé / câblage libre / code libre), l'interface pour le
poser, et un bandeau qui dit à l'élève ce qui est figé et pourquoi.

**Piège** : un verrou que l'élève lève en éditant le JSON n'est pas un verrou.
Il ne faut pas prétendre à une sécurité qui n'existe pas — c'est un garde-fou
pédagogique, à annoncer comme tel.

---

## 2. Linter électronique — relire le code face au schéma

Le concept est juste : Kablix est le seul outil qui voit **le code ET le
circuit**. Aucun compilateur ne peut dire « tu lis la broche 2 mais rien n'y est
branché » — il ne connaît pas le circuit. Kablix, si.

**Appui** :

- Le schéma est un modèle complet et interrogeable (nets, broches, composants —
  [model.mts](src/webview/diagram/model.mts)).
- Les capacités de chaque broche sont déjà connues du catalogue (PWM, analogique,
  I²C) : le contrôle `analogWrite` sur une broche non-PWM est presque gratuit.
- Le moteur sait déjà accuser une pièce nommée (`blame()` dans
  [sim.mts](src/webview/sim.mts)) avec message et cadre rouge — c'est exactement
  le canal de sortie du linter.

**Reste à faire** : une lecture du source. Pas d'analyse syntaxique complète —
des motifs sur le texte suffisent pour `pinMode`, `digitalRead`, `analogWrite`,
`attachInterrupt`. Côté Python, c'est encore plus simple (`Pin(n, Pin.IN)`).

**Le vrai risque, c'est le faux positif.** Un avertissement qui se trompe sur un
code correct fait perdre confiance à l'élève. Règle à tenir : **en cas de doute,
on se tait**. Un contrôle ne sort que s'il est certain.

**Contrôles de départ** (par ordre de sûreté) :

1. `analogWrite` sur une broche sans PWM → certain, le catalogue le sait.
2. Broche lue sans `pinMode` → sûr si le `setup()` est lisible en entier.
3. Broche lue, rien de branché, pas de rappel interne → certain, le schéma le dit.
4. Broche utilisée dans le code mais absente du schéma (et l'inverse).

---

## 3. Pièges à code — les mauvaises habitudes

Même machinerie que le n°2, mais les contrôles portent sur **l'exécution** et non
plus sur le texte. C'est donc une extension, à faire juste après.

**Appui** : le moteur voit tout passer — état des broches à chaque cycle, points
d'arrêt, lignes exécutées ([avr.mts](src/webview/engines/avr.mts),
[pico.mts](src/webview/engines/pico.mts)).

**Deux contrôles à forte valeur** :

- **Broche en l'air** : détectable à coup sûr, c'est le schéma qui répond.
  Mieux : on peut FAIRE osciller la valeur lue, pour que l'élève voie le
  problème au lieu de le lire.
- **Boucle bloquante** (`while (digitalRead(2) == LOW);`) : détectable à
  l'exécution — même ligne pendant des millions de cycles, aucune écriture de
  broche. Ça mène aux interruptions, notion difficile à motiver autrement.

---

## 4. Analyseur logique

La brique la plus classique, et elle manque. Le traceur de courbes trace des
**valeurs** ; un analyseur logique montre des **fronts** sur plusieurs voies
alignées dans le temps — ce n'est pas le même instrument, et c'est celui qu'il
faut pour comprendre I²C, SPI ou un protocole à créneaux.

**Appui solide** :

- [plotter.mts](src/webview/plotter.mts) donne déjà l'échelle de temps, le rendu,
  le zoom, les couleurs, le mode « escalier » (`probe()`) — la moitié du travail.
- Le moteur sait dater chaque changement de broche au cycle près.
- L'oscilloscope de table existe déjà comme composant
  ([oscillo-element.mts](src/webview/composants/oscillo-element.mts)) : le
  précédent d'interface est posé.

**Reste à faire** : la capture multi-voies (8 à 16), le déclenchement sur front,
et surtout le **décodage de protocole** — I²C et SPI d'abord, UART ensuite. C'est
le décodage qui fait la valeur pédagogique : voir l'adresse et l'accusé de
réception apparaître sous les créneaux vaut dix pages de cours.

Les périphériques I²C et SPI sont déjà simulés
([i2c-devices.mts](src/webview/engines/i2c-devices.mts)) : les trames existent,
il faut les présenter.

---

## 5. Consommation énergétique en temps réel

Compétence réellement demandée dans l'industrie, et presque jamais enseignée
faute d'instrument. Kablix peut la rendre visible.

**Appui décisif** : `psuLoadAmps()` dans
[model.mts](src/webview/diagram/model.mts) **somme déjà le courant tiré d'une
alimentation**, en tenant compte des diodes, des seuils et des ponts résistifs.
Le calcul physique n'est pas à écrire — il existe et il est testé.

**Reste à faire** : intégrer dans le temps (mA → mAh), un affichage permanent, et
la consommation propre du microcontrôleur selon son état (actif / veille). Ce
dernier point est le seul vrai travail : il faut une table par carte, et savoir
quand la puce dort.

**Sans les modes de veille, la démonstration tombe à plat** — c'est précisément
le contraste actif/veille qui porte la leçon. À chiffrer ensemble.

---

## 6. Batterie et durée de vie

Suite directe du n°5, et c'est là que la leçon devient concrète : « ta pile
CR2032 sera vide dans 14 heures » puis, après optimisation, « 2,4 ans ». Le
retour est immédiat et gratifiant.

**Appui** : le n°5 fait tout le calcul ; le composant « batterie externe » existe
déjà au catalogue. Il faut lui ajouter une capacité en mAh et trois modèles
(AA, LiPo, CR2032).

**Ne pas le faire avant le n°5** : sans mesure de consommation, une batterie
n'est qu'une alimentation avec une étiquette.

---

## 7. Notation automatique par assertions

Le gain enseignant est énorme (30 copies), mais c'est une **infrastructure**, pas
une fonction : format de fichier de test, injection d'événements, horloge
accélérée, rapport, et toutes les questions de confiance qui vont avec (un test
faux note faux).

**Appui partiel** : les 113 bancs de vérification du projet font déjà tourner des
montages sans interface et vérifient des états — le savoir-faire existe, il
faudrait l'ouvrir à l'utilisateur.

**Bloquant réel** : l'injection d'événements datés (« appuie sur le bouton 1
pendant 2 s ») n'existe pas comme mécanisme public. C'est le gros morceau.

**À faire après le n°1** : un TP verrouillé sans notation reste utile ; une
notation sans TP cadré n'a rien à corriger.

---

## 8. Vue des périphériques internes (Timer, ADC)

Pédagogiquement, c'est la plus belle idée de la liste : montrer la rampe du
compteur et la ligne de comparaison, c'est rendre visible ce qui ne l'est
jamais. Les registres PWM sont le mur contre lequel butent tous les débutants.

**Appui** : avr8js expose les timers ; `AvrEngine.timers`
([avr.mts](src/webview/engines/avr.mts)) les tient déjà.

**Pourquoi c'est cher malgré ça** : il faut une vue animée **par périphérique et
par famille de puce**. Un timer AVR et un PWM RP2040 n'ont rien en commun — c'est
deux fois le travail, et le RP2040 est moins bien exposé par l'émulateur.

**Recommandation** : commencer par **le seul Timer1 de l'Uno**, la vue la plus
demandée, et juger sur pièce avant d'étendre.

---

## 9. Dégradation thermique (effet Joule visuel)

Petit coût, vraie notion. Le montant du travail est faible parce que **tout le
calcul est déjà là** : le courant de branche est connu, la résistance aussi,
`P = R × I²` est une multiplication. Et la mécanique d'affichage existe — une
résistance sait déjà rougir et exploser ([resistor-element.mts](src/webview/composants/resistor-element.mts),
`burned`, `BOUM_PX`).

**Ce qu'il faut ajouter** : la zone AVANT la destruction — une coloration
progressive, et un seuil par boîtier (la ¼ W chauffe à 0,25 W, la 10 W non). La
propriété **puissance** existe déjà depuis la v2026.9.4 : les seuils sont donc
déjà saisis.

**Piège** : l'échauffement réel dépend du temps et de la dissipation. Ne pas
simuler une thermique fine — un indicateur « puissance dissipée / puissance
admissible » suffit et reste honnête.

---

## 10. Hors liste — les variables locales manquent sur AVR

Pas une piste de Frank : un **écart constaté** pendant l'exploration, et il
touche l'item 2 du todo (ce que fait Wokwi de mieux au débogage).

**L'état réel, mesuré dans le code** :

| | Arduino (AVR) | Pico (MicroPython) |
|---|---|---|
| Points d'arrêt | oui | oui |
| Points d'arrêt **conditionnels** | **non** | oui |
| Variables globales | oui | oui |
| Variables **locales** | **non** | oui |
| Tableaux, structures | **non** | partiellement |
| Pile d'appels | **non** | **non** |

Côté AVR, `readVariables()` ([avr.mts](src/webview/engines/avr.mts)) ne lit que
les **globales scalaires** : un `int`, un `float`, un `bool`. Une variable
déclarée dans `loop()` — c'est-à-dire la majorité de ce qu'écrit un élève — est
invisible. Côté Pico, l'instrumentation ([pydebug.ts](src/shared/pydebug.ts))
remonte locales et globales, avec conditions d'arrêt.

**C'est l'asymétrie la plus gênante du produit**, et c'est le point où Wokwi (qui
s'appuie sur avr-gdb pour la partie AVR) fait mieux : locales, tableaux,
structures et pile d'appels.

**Faisable ?** Oui. Les informations sont dans le DWARF du `.elf`, déjà produit
par la compilation et déjà lu en partie ([elf.ts](src/shared/elf.ts)). Il faut
lire `.debug_info` (emplacement des locales, relatif au pointeur de pile) et
`.debug_loc`. C'est un vrai morceau, mais borné et sans dépendance nouvelle.

**Recommandation** : le traiter avant les pistes d'agrément. Un débogueur qui ne
montre pas la variable du `loop()` déçoit à chaque séance.

---

## 11. Associer des composants entre eux

**Piste à préciser avant d'être chiffrée** — trois lectures possibles :

1. **Grouper** pour déplacer ensemble. Le plus proche de l'existant : la
   sélection multiple et les grappes d'enfichage font déjà ce travail
   ([editor.mts](src/webview/diagram/editor.mts)) ; un groupe nommé et persistant
   serait une petite extension.
2. **Composer** un sous-ensemble réutilisable (un « module » de plusieurs pièces
   posé d'un clic). Plus lourd, et le format `.kompix` couvre déjà une partie du
   besoin.
3. **Lier** deux composants logiquement (un capteur et son module).

La lecture 1 est un **S**. Les deux autres demandent une décision de conception.

---

## 12. Succès (badges)

Sympathique, dédramatise l'erreur — « Premier nuage de fumée » est une bonne
idée. Mais l'effet s'épuise vite et ça n'enseigne rien par soi-même.

**Coût faible** : les événements existent déjà (composant grillé, interruption
utilisée). C'est du stockage et de l'affichage.

**À garder pour un lot creux**, ou à glisser dans une autre livraison.

---

## 13. Comparaison visuelle de schémas (visual diff)

Utile à l'auteur du logiciel, beaucoup moins à l'élève. Un élève ne compare pas
deux versions de son circuit — il en a un seul.

L'usage enseignant existe (comparer la copie au corrigé), mais le n°7 y répond
mieux : une note vaut mieux qu'une image à interpréter.

**Coût moyen** : il faut apparier les composants entre deux schémas, ce qui n'est
pas trivial quand les identifiants changent.

---

## 14. Rembobinage de la simulation

**Écartée**, malgré un intérêt pédagogique réel.

Reculer suppose de **sauvegarder l'état complet de la machine** à intervalles
réguliers : toute la RAM, tous les registres, tous les périphériques, plus l'état
de chaque composant à l'écran. Rien de tel n'existe dans le projet — la recherche
n'a trouvé aucun mécanisme de capture d'état moteur, et l'architecture (moteur
dans un processus séparé, [worker-engine.mts](src/webview/engines/worker-engine.mts))
rendrait la chose encore plus coûteuse.

Ordre de grandeur : plusieurs millions de jetons, et un risque permanent de
divergence entre l'état rejoué et l'état réel — le pire défaut possible dans un
outil d'enseignement, où la confiance dans ce qui est montré est tout.

**L'alternative honnête** : le pas-à-pas existe déjà et va dans le bon sens. Un
enregistrement des **signaux** (n°4, l'analyseur logique) donne 80 % du bénéfice
— revoir ce qui s'est passé — pour 5 % du coût.

---

## 15. Mode Time Attack

Écartée. Le chronomètre encourage la précipitation, exactement le contraire de ce
qu'on veut apprendre en électronique. La détection « 3,14 Hz stable pendant 3
secondes » est en plus difficile à rendre fiable.

Si l'envie de jeu revient, le n°12 (succès) la sert mieux, sans pousser à la
vitesse.

---

## Ce que je ferais, dans l'ordre

1. **Schéma verrouillé** (n°1) — petit, énorme effet, tout est en place.
2. **Variables locales sur AVR** (n°10) — un manque, pas une évolution.
3. **Linter électronique** (n°2) puis **pièges à code** (n°3) — même machinerie,
   c'est l'atout que personne d'autre ne peut avoir.
4. **Analyseur logique** (n°4) — la brique instrument qui manque.
5. **Consommation** (n°5) puis **batterie** (n°6).
6. **Thermique** (n°9) à glisser dans un lot, c'est peu cher.

Le reste attend une décision : le n°7 quand le n°1 tournera en classe, le n°8
en commençant par le seul Timer1.
