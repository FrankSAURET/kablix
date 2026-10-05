# Feuille de route Kablix — pistes restantes

Chaque piste de [Pistes.md](Pistes.md) a été confrontée au code existant : ce qui est déjà là, ce qu'il faut construire, ce qui bloque. L'objectif retenu est **pédagogique** — une piste qui fait briller la démonstration mais n'apprend rien descend dans le classement. Les pistes déjà livrées (n°1 à 6) ont été retirées : leur historique est dans [todo.md](todo.md) et le [CHANGELOG](CHANGELOG.md).

**Comment lire les colonnes**

- **Intérêt** : gain pédagogique réel, de ★ à ★★★★★.
- **Coût** : jetons de conversation nécessaires pour livrer la fonction testée et documentée (fiche d'aide comprise). Ordre de grandeur, pas un devis : **S** ≈ 50–150 k, **M** ≈ 150–400 k, **L** ≈ 400 k–1 M, **XL** > 1 M.
- **Appui** : ce qui existe déjà et qu'on réutilise. C'est le vrai facteur de coût : une piste sans appui coûte trois fois plus qu'une piste qui se greffe.

L'ordre des numéros est celui **choisi par Frank**, pas un classement par intérêt. Les numéros ne sont pas renumérotés après retrait.

---

## Le classement

| #   | Piste                                                                         | Intérêt | Coût  | Verdict                        |
| --- | ----------------------------------------------------------------------------- | ------- | ----- | ------------------------------ |
| 7   | [Associer des composants](#7-associer-des-composants-entre-eux)               | ★★★★☆   | **M** | Chiffré ci-dessous             |
| 8   | [Schéma verrouillé (TP à trous)](#8-schéma-verrouillé--le-tp-à-trous)         | ★★★★★   | **S** | **Le moins cher de la liste**  |
| 9   | [Notation automatique](#9-notation-automatique-par-assertions)                | ★★★★☆   | **L** | À faire, plus tard             |
| 10  | [Vue des périphériques internes](#10-vue-des-périphériques-internes-timer-adc) | ★★★★☆   | **L** | À faire, plus tard             |

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
