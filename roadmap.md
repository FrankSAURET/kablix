# Feuille de route Kablix — pistes explorées

Chaque piste de [Pistes.md](Pistes.md) a été confrontée au code existant : ce qui est déjà là, ce qu'il faut construire, ce qui bloque. L'objectif retenu est **pédagogique** — une piste qui fait briller la démonstration mais n'apprend rien descend dans le classement.

**Comment lire les colonnes**

- **Intérêt** : gain pédagogique réel, de ★ à ★★★★★.
- **Coût** : jetons de conversation nécessaires pour livrer la fonction testée et documentée (fiche d'aide comprise). Ordre de grandeur, pas un devis : **S** ≈ 50–150 k, **M** ≈ 150–400 k, **L** ≈ 400 k–1 M, **XL** > 1 M.
- **Appui** : ce qui existe déjà et qu'on réutilise. C'est le vrai facteur de coût : une piste sans appui coûte trois fois plus qu'une piste qui se greffe.

L'ordre des numéros est celui **choisi par Frank**, pas un classement par intérêt.

---

## Le classement

| #   | Piste                                                                         | Intérêt | Coût  | Verdict                        |
| --- | ----------------------------------------------------------------------------- | ------- | ----- | ------------------------------ |
| 1   | [Consommation en temps réel](#1-consommation-énergétique-en-temps-réel)       | ★★★★☆   | **M** | **À faire**                    |
| 2   | [Batterie et durée de vie](#2-batterie-et-durée-de-vie)                       | ★★★★☆   | **S** | **À faire** après le n°1       |
| 3   | [Linter électronique](#3-linter-électronique--relire-le-code-face-au-schéma)  | ★★★★★   | **M** | **À faire**                    |
| 4   | [Pièges à code](#4-pièges-à-code--les-mauvaises-habitudes)                    | ★★★★☆   | **S** | **À faire** (extension du n°3) |
| 5   | [Dégradation thermique](#5-dégradation-thermique-effet-joule-visuel)          | ★★★☆☆   | **S** | Bon rapport, à glisser         |
| 6   | [Succès / badges](#6-succès-badges)                                           | ★★★☆☆   | **S** | Proposition chiffrée ci-dessous |
| 7   | [Associer des composants](#7-associer-des-composants-entre-eux)               | ★★★★☆   | **M** | Chiffré ci-dessous             |
| 8   | [Schéma verrouillé (TP à trous)](#8-schéma-verrouillé--le-tp-à-trous)         | ★★★★★   | **S** | **Le moins cher de la liste**  |
| 9   | [Notation automatique](#9-notation-automatique-par-assertions)                | ★★★★☆   | **L** | À faire, plus tard             |
| 10  | [Vue des périphériques internes](#10-vue-des-périphériques-internes-timer-adc) | ★★★★☆   | **L** | À faire, plus tard             |

Cinq pistes ont quitté cette feuille : **l'analyseur logique** et **les variables locales sur AVR** sont **livrés** (v2026.9.5) ; la **comparaison visuelle de schémas**, le **rembobinage de la simulation** et le **mode Time Attack** ont été écartés.

---

## 1. Consommation énergétique en temps réel

Compétence réellement demandée dans l'industrie, et presque jamais enseignée faute d'instrument. Kablix peut la rendre visible.

**Appui décisif** : `psuLoadAmps()` dans [model.mts](src/webview/diagram/model.mts) **somme déjà le courant tiré d'une** **alimentation**, en tenant compte des diodes, des seuils et des ponts résistifs. Le calcul physique n'est pas à écrire — il existe et il est testé.

**Reste à faire** : intégrer dans le temps (mA → mAh), un affichage permanent, et la consommation propre du microcontrôleur selon son état (actif / veille). Ce dernier point est le seul vrai travail : il faut une table par carte, et savoir quand la puce dort.

**Sans les modes de veille, la démonstration tombe à plat** — c'est précisément le contraste actif/veille qui porte la leçon. À chiffrer ensemble.

---

## 2. Batterie et durée de vie

Suite directe du n°1, et c'est là que la leçon devient concrète : « ta pile CR2032 sera vide dans 14 heures » puis, après optimisation, « 2,4 ans ». Le retour est immédiat et gratifiant.

**Appui** : le n°1 fait tout le calcul ; le composant « batterie externe » existe déjà au catalogue. Il faut lui ajouter une capacité en mAh et trois modèles (AA, LiPo, CR2032).

**Ne pas le faire avant le n°1** : sans mesure de consommation, une batterie n'est qu'une alimentation avec une étiquette.

---

## 3. Linter électronique — relire le code face au schéma

Le concept est juste : Kablix est le seul outil qui voit **le code ET le** **circuit**. Aucun compilateur ne peut dire « tu lis la broche 2 mais rien n'y est branché » — il ne connaît pas le circuit. Kablix, si.

**Appui** :

- Le schéma est un modèle complet et interrogeable (nets, broches, composants — [model.mts](src/webview/diagram/model.mts)).
- Les capacités de chaque broche sont déjà connues du catalogue (PWM, analogique, I²C) : le contrôle `analogWrite` sur une broche non-PWM est presque gratuit.
- Le moteur sait déjà accuser une pièce nommée (`blame()` dans [sim.mts](src/webview/sim.mts)) avec message et cadre rouge — c'est exactement le canal de sortie du linter.

**Reste à faire** : une lecture du source. Pas d'analyse syntaxique complète — des motifs sur le texte suffisent pour `pinMode`, `digitalRead`, `analogWrite`, `attachInterrupt`. Côté Python, c'est encore plus simple (`Pin(n, Pin.IN)`).

**Le vrai risque, c'est le faux positif.** Un avertissement qui se trompe sur un code correct fait perdre confiance à l'élève. Règle à tenir : **en cas de doute,** **on se tait**. Un contrôle ne sort que s'il est certain.

**Contrôles de départ** (par ordre de sûreté) :

1. `analogWrite` sur une broche sans PWM → certain, le catalogue le sait.
2. Broche lue sans `pinMode` → sûr si le `setup()` est lisible en entier.
3. Broche lue, rien de branché, pas de rappel interne → certain, le schéma le dit.
4. Broche utilisée dans le code mais absente du schéma (et l'inverse).

---

## 4. Pièges à code — les mauvaises habitudes

Même machinerie que le n°3, mais les contrôles portent sur **l'exécution** et non plus sur le texte. C'est donc une extension, à faire juste après.

**Appui** : le moteur voit tout passer — état des broches à chaque cycle, points d'arrêt, lignes exécutées ([avr.mts](src/webview/engines/avr.mts), [pico.mts](src/webview/engines/pico.mts)).

**Deux contrôles à forte valeur** :

- **Broche en l'air** : détectable à coup sûr, c'est le schéma qui répond. Mieux : on peut FAIRE osciller la valeur lue, pour que l'élève voie le problème au lieu de le lire.
- **Boucle bloquante** (`while (digitalRead(2) == LOW);`) : détectable à l'exécution — même ligne pendant des millions de cycles, aucune écriture de broche. Ça mène aux interruptions, notion difficile à motiver autrement.

---

## 5. Dégradation thermique (effet Joule visuel)

Petit coût, vraie notion. Le montant du travail est faible parce que **tout le** **calcul est déjà là** : le courant de branche est connu, la résistance aussi, `P = R × I²` est une multiplication. Et la mécanique d'affichage existe — une résistance sait déjà rougir et exploser ([resistor-element.mts](src/webview/composants/resistor-element.mts), `burned`, `BOUM_PX`).

**Ce qu'il faut ajouter** : la zone AVANT la destruction — une coloration progressive, et un seuil par boîtier (la ¼ W chauffe à 0,25 W, la 10 W non). La propriété **puissance** existe déjà depuis la v2026.9.4 : les seuils sont donc déjà saisis.

**Piège** : l'échauffement réel dépend du temps et de la dissipation. Ne pas simuler une thermique fine — un indicateur « puissance dissipée / puissance admissible » suffit et reste honnête.

---

## 6. Succès (badges)

Frank demande deux familles précises : des badges **preuve de maîtrise** et des badges qui **récompensent l'effort ou le processus**. C'est exactement ce qui sauve l'idée du gadget : un badge décerné pour avoir cliqué ne vaut rien, un badge qui atteste d'une compétence se montre.

**Appui** : les événements existent déjà — composant grillé, interruption utilisée, mesure lue, capture d'analyseur, résistance en fumée, carte détruite par surtension. Il n'y a **rien à instrumenter**, seulement à écouter, à stocker et à afficher.

### Preuve de maîtrise

Décerné une seule fois, sur un fait **mesurable dans la simulation**. Il atteste que l'élève a fait fonctionner quelque chose, pas qu'il a essayé.

| Badge                   | Ce qui le déclenche                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------- |
| **Loi d'Ohm**           | Une LED allumée avec la bonne résistance série, du premier montage, sans destruction. |
| **Niveau logique**      | Un capteur 5 V lu par un Pico **à travers un pont diviseur** — la carte survit.      |
| **Bus maîtrisé**        | Une trame I²C ou SPI décodée par l'analyseur, adresse et accusé de réception lisibles. |
| **Sans attendre**       | Un montage qui clignote **sans un seul `delay()`** dans la boucle (millis / timer).  |
| **Interruption**        | Une entrée traitée par `attachInterrupt` au lieu d'une boucle d'attente.             |
| **Économe**             | Un montage dont la consommation moyenne descend sous 1 mA (dépend du n°1).           |
| **Le bon calibre**      | Un moteur alimenté sans que le transistor sature ni que le régulateur s'effondre.    |
| **Trois protocoles**    | Avoir fait tourner I²C, SPI et une liaison série dans trois projets différents.       |

### Effort et processus

Décerné sur la **manière de travailler**, pas sur le résultat. C'est la famille qui dédramatise l'erreur — celle qui manque partout ailleurs.

| Badge                        | Ce qui le déclenche                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| **Premier nuage de fumée**   | Le premier composant grillé. On le décerne **avec** l'explication : l'erreur est l'outil. |
| **Deux fois vaut mieux**     | Un montage qui a grillé, puis le même montage qui tourne : la correction est comptée.    |
| **Chercheur de panne**       | Trois défauts différents corrigés dans la même séance.                                   |
| **Au pas à pas**             | Un point d'arrêt posé et dix pas exécutés — l'élève a **lu** son programme.              |
| **À l'instrument**           | Une mesure au voltmètre ou à l'oscilloscope **avant** de changer le montage.             |
| **Persévérant**             | Cinq lancements de simulation sur le même projet dans la journée.                        |
| **Au propre**                | Un schéma de plus de dix composants dont tous les fils sont propres (autoroutage vert).  |
| **Documenté**                | Un projet portant au moins trois étiquettes de texte.                                    |

**Reste à faire** : un journal de badges dans le manifeste `.projix` (ou mieux, dans les réglages de l'utilisateur, pour qu'ils survivent au changement de projet), un panneau qui les montre, et une petite animation à l'obtention.

**Coût : S.** Aucune règle nouvelle à calculer, aucune physique à écrire. Le vrai travail est la **rédaction** : chaque badge a besoin d'une phrase qui explique ce qu'il atteste, sinon on retombe sur le gadget.

**Piège à éviter** : ne jamais décerner un badge pour du temps passé seul. « Une heure dans Kablix » ne prouve rien et pousse à rester devant l'écran.

---

## 7. Associer des composants entre eux

**La demande de Frank** : associer physiquement des composants, par exemple coller un aimant sur un servomoteur ; un capteur à effet Hall posé sur la feuille est alors déclenché quand l'aimant passe à portée.

C'est plus riche qu'il n'y paraît : cela introduit une **liaison mécanique** dans un simulateur qui ne connaît aujourd'hui que des liaisons électriques. Le fil transporte une tension ; ici, ce qui se transmet est une **position**.

**Appui** :

- Les composants portent déjà une position et une rotation dans le schéma ([model.mts](src/webview/diagram/model.mts)), et le servomoteur expose déjà son angle en simulation.
- Le mécanisme de « grandeur physique ambiante » existe pour les capteurs : lumière, température, gaz, son se règlent déjà au curseur et sont lus par le composant ([sim.mts](src/webview/sim.mts), `simControl`).
- Poser un composant **sur** un autre est déjà fait pour le shield Grove (z-order figé, cf. la mémoire correspondante) : l'idée d'un composant porté n'est pas neuve dans le projet.

**Reste à faire, et c'est là qu'est le coût** :

1. Un **lien de montage** dans le modèle : « cette pièce est fixée sur celle-là », avec son décalage et son orientation, enregistré dans le `.projix`.
2. Le **suivi de position** : quand le porteur tourne ou se déplace, la pièce portée suit. Pour un servo, c'est l'angle simulé qui commande, pas la souris.
3. Un **champ de portée** : l'aimant émet, le capteur à effet Hall lit selon la distance et l'angle. Un seul type de champ pour commencer (magnétique), avec une loi simple et honnête — présence/absence sur un rayon, puis dégressif.
4. Le **geste** : comment on colle et on décolle, et comment on le voit.
5. Le capteur à effet Hall lui-même, qui n'existe pas encore au catalogue.

**Chiffrage : M** (≈ 150–400 k jetons), à répartir en deux lots. Le premier lot (points 1, 2 et 5, avec un champ binaire) donne déjà la démonstration complète aimant/servo/Hall et coûte un **S+**. Le second lot (champ dégressif, autres types de champ, geste soigné) est ce qui fait monter à M.

**Ce qui le rend intéressant malgré le prix** : c'est la porte d'entrée vers tout un pan d'exercices que Kablix ne sait pas poser aujourd'hui — capteur de fin de course, compte-tours, codeur incrémental, détection de passage. Aucun de ces montages n'est simulable sans lien mécanique.

**Piège** : ne pas partir vers un moteur physique. Il ne s'agit pas de simuler la mécanique, seulement de **transmettre une position** d'une pièce à une autre.

---

## 8. Schéma verrouillé — le TP à trous

**Le meilleur rapport de toute la liste.** C'est la seule piste qui change la vie de l'enseignant AVANT le cours, pas pendant.

Deux sens d'usage, tous deux utiles : circuit figé / code à écrire, ou code fourni / circuit à câbler.

**Appui** — presque tout est déjà là :

- Le verrou d'édition existe et fonctionne : `setLocked()` dans [editor.mts](src/webview/diagram/editor.mts), armé pendant la simulation. Il interdit déjà déplacement, suppression et câblage.
- Le manifeste `.projix` est versionné et extensible ([projix.ts](src/projix.ts), `ProjixManifest`) : un champ `verrou` s'y pose sans casser les fichiers existants.
- Le retour « édition interdite » est déjà écrit (`onBlockedEdit`).

**Reste à faire** : un verrou **persistant** distinct du verrou de simulation (trois niveaux : tout figé / câblage libre / code libre), l'interface pour le poser, et un bandeau qui dit à l'élève ce qui est figé et pourquoi.

**Piège** : un verrou que l'élève lève en éditant le JSON n'est pas un verrou. Il ne faut pas prétendre à une sécurité qui n'existe pas — c'est un garde-fou pédagogique, à annoncer comme tel.

---

## 9. Notation automatique par assertions

Le gain enseignant est énorme (30 copies), mais c'est une **infrastructure**, pas une fonction : format de fichier de test, injection d'événements, horloge accélérée, rapport, et toutes les questions de confiance qui vont avec (un test faux note faux).

**Appui partiel** : les 115 bancs de vérification du projet font déjà tourner des montages sans interface et vérifient des états — le savoir-faire existe, il faudrait l'ouvrir à l'utilisateur.

**Bloquant réel** : l'injection d'événements datés (« appuie sur le bouton 1 pendant 2 s ») n'existe pas comme mécanisme public. C'est le gros morceau.

**À faire après le n°8** : un TP verrouillé sans notation reste utile ; une notation sans TP cadré n'a rien à corriger.

---

## 10. Vue des périphériques internes (Timer, ADC)

Pédagogiquement, c'est la plus belle idée de la liste : montrer la rampe du compteur et la ligne de comparaison, c'est rendre visible ce qui ne l'est jamais. Les registres PWM sont le mur contre lequel butent tous les débutants.

**Appui** : avr8js expose les timers ; `AvrEngine.timers` ([avr.mts](src/webview/engines/avr.mts)) les tient déjà.

**Pourquoi c'est cher malgré ça** : il faut une vue animée **par périphérique et** **par famille de puce**. Un timer AVR et un PWM RP2040 n'ont rien en commun — c'est deux fois le travail, et le RP2040 est moins bien exposé par l'émulateur.

**Recommandation** : commencer par **le seul Timer1 de l'Uno**, la vue la plus demandée, et juger sur pièce avant d'étendre.

---

## Ce que je ferais, dans l'ordre

L'ordre des numéros est celui de Frank. Si l'ordre technique devait primer, deux remarques :

1. **Le n°8 (schéma verrouillé) est le moins cher et le plus utile** — tout est en place, c'est un **S**.
2. **Les n°1 et n°2 vont ensemble** et le n°2 n'a aucun sens avant le n°1.
3. **Le n°4 suit le n°3** sans discussion : c'est la même machinerie.
4. Le n°9 attend le n°8 : une notation sans TP cadré n'a rien à corriger.
