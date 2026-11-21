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
| 11  | [Créateur de projets mécatroniques 3D](#11-créateur-de-projets-mécatroniques-3d) | ★★★★★   | **XL** | Cadré ci-dessous, décisions attendues |
| 12  | [Cartes ESP32-C3 / S3](#12-cartes-esp32-c3--s3)                               | ★★★★☆   | **L** (MicroPython) · **XL** (tout) | Faisable depuis le 21/11/2026, sonde réussie |

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

## 11. Créateur de projets mécatroniques 3D

**La demande de Frank** (todo, 20/11/2026) : transformer Kompix Editor en créateur de projets info-méca, typiquement de la robotique, en 3D. Des composants existants (cartes, composants électroniques, moteur, servo, roue, engrenage, aimants…) ; des pièces fabriquées (découpe laser, impression 3D) et leur assemblage ; l'import d'assemblages faits ailleurs (SolidWorks, FreeCAD…) ; une dénomination standard des éléments qui leur donne un rôle de simulation ; le système monté doit être simulable dans Kablix.

Kompix Editor fabrique aujourd'hui **un composant**. La demande en fait l'outil qui monte **un système** : plusieurs composants, des pièces fabriquées, des liaisons entre eux, et un lien vers le schéma électrique et le programme de Kablix. Changement d'échelle, pas une fonction de plus.

### Appui

Côté Kompix Editor (dépôt séparé, `kompix_editor/`) :

- Visionneuse three.js, poses (déplacer, tourner, miroir, grille), emboîtement par **axes nommés** (famille d'axes, zéros confondus), contraintes ponctuelles (coaxial, plaqué, distance), collisions par prismes convexes : lots B1 à B3.
- Pièces **extrudées** (contour + épaisseur) et pièces **maillées** importées (`.glb`, `.stl`), format `model3d.json` v2 : lot B4, [format-v2.md](kompix_editor/docs/format-v2.md).
- Modèles de simulation **nommés** (`sim.model`), propriétés typées, forme calculée par script : lots C1 à C4. Le principe « le paquet désigne un modèle, le moteur le fournit » est exactement celui qu'il faut pour les rôles de simulation.

Côté Kablix :

- Servo (angle simulé), moteur DC, capteur à effet Hall, HC-SR04 déjà au catalogue, avec leurs moteurs de simulation.
- La piste 7 (associer des composants) pose le premier **lien mécanique** : transmettre une position d'une pièce à une autre. La piste 11 en est la généralisation ; la piste 7 en est donc le premier pas naturel.

### Ce qui manque

1. **Un document « système »** : la liste des composants et pièces posés, leurs poses, les liaisons. Aujourd'hui `model3d.json` décrit l'intérieur d'un composant, pas un montage de plusieurs composants.
2. **Des liaisons cinématiques durables** : pivot, glissière, encastrement, engrenage (rapport de dents), roue sur sol. Aujourd'hui les contraintes sont des gestes ponctuels, sans solveur (todo Kompix Editor, item 10).
3. **Une bibliothèque mécanique** : roue, engrenage, aimant, châssis, palier, entretoise… en `.kompix` 3D, avec leurs axes nommés.
4. **La fabrication** : sortir les pièces vers la découpeuse (contour SVG/DXF d'une pièce extrudée) et vers l'imprimante (STL pour Bambu Studio). Importer une pièce OpenSCAD (`.scad` → STL par l'outil `openscad` en ligne de commande, s'il est installé).
5. **L'import STEP** : SolidWorks et FreeCAD exportent tous deux en STEP, avec l'arbre d'assemblage et les noms des pièces. Lecture par OpenCascade compilé en WASM (lot B6, resté ⏳). FreeCAD `.FCStd` direct : pas utile, STEP suffit.
6. **La convention de nommage** : le nom d'une pièce (dans l'éditeur ou dans l'arbre STEP) lui donne un rôle. Esquisse : `rôle:repère`, le repère étant celui du composant dans le schéma Kablix — `servo:S1`, `moteur:M2`, `roue:M2` (roue entraînée par M2), `aimant:A1`, `hall:U3`, `sol`. Une pièce sans préfixe connu reste inerte (décor, structure).
7. **La simulation dans Kablix** : une vue 3D qui tourne pendant la simulation. Le moteur électrique fournit angles et vitesses (servo, moteur DC), le solveur cinématique pose les pièces, les capteurs lisent la scène (Hall : distance à l'aimant ; HC-SR04 : lancer de rayon jusqu'au premier obstacle ; fin de course : contact). iso3d ne sait ni tourner les pièces ni afficher un maillage (todo Kompix Editor, items 9 et 11) : il faut three.js dans la webview de Kablix.

### Lots proposés

| Lot | Contenu                                                                                                            | Coût   | Où              |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------ | --------------- |
| D0  | Piste 7 telle que chiffrée (servo + aimant + Hall, lien de montage, champ binaire), en 2D dans Kablix             | **S+** | Kablix          |
| D1  | Document système : composants posés, poses, liaisons ; lié au `.projix` (repères du schéma)                      | **M**  | les deux        |
| D2  | Liaisons durables et solveur cinématique en arbre (pivot, glissière, encastrement, engrenage, roue sur sol)      | **M**  | kompix-core     |
| D3  | Bibliothèque mécanique de départ (roue, engrenage, aimant, châssis 2 roues, palier) + servo et moteur DC en 3D    | **M**  | Kompix Editor   |
| D4  | Fabrication : export SVG/DXF des pièces extrudées, export STL, import `.scad`                                    | **S**  | Kompix Editor   |
| D5  | Convention de nommage : lecture, contrôle, rôle affiché dans l'inspecteur                                        | **S**  | kompix-core     |
| D6  | Vue 3D de simulation dans Kablix (three.js) pilotée par les moteurs : servo, moteur DC, solveur de D2            | **L**  | Kablix          |
| D7  | Capteurs dans la scène : Hall, HC-SR04 (rayon), fin de course (contact)                                          | **M**  | Kablix          |
| D8  | Import STEP (OpenCascade WASM), arbre d'assemblage et noms → convention D5                                       | **L**  | Kompix Editor   |

Total : **XL**, de l'ordre de 2 à 4 M jetons. Premier démonstrateur complet (bras servo + aimant + Hall, puis robot deux roues + HC-SR04) à la fin de D6–D7. D4 et D5 sont livrables seuls et utiles tout de suite.

### Pièges

- **Pas de moteur physique.** Cinématique seulement : positions et angles imposés, ni masse, ni frottement, ni chute. Un robot qui roule avance de `rayon × angle` de ses roues (cinématique différentielle), il ne glisse pas. Un moteur physique (Rapier en WASM) se discutera après, s'il manque vraiment.
- **Boucles fermées** (parallélogramme, bielle-manivelle) : un solveur en arbre ne les résout pas. Les refuser clairement en D2, les traiter plus tard.
- **OpenCascade WASM pèse 10 à 30 Mo** : à télécharger à la demande, jamais dans le `.vsix`.
- **three.js dans Kablix** : environ 600 Ko de plus dans la webview. Kompix Editor l'embarque déjà.
- **Règle de Kompix Editor** : rien ne se touche dans Kablix tant que Frank ne l'a pas demandé et que Kompix Editor n'est pas validé. Cinq validations l'attendent encore (todo Kompix Editor : items 1 à 4 et 24). Les lots marqués « Kablix » ou « les deux » attendent son feu vert explicite.
- **Deux dépôts** : les lots Kompix Editor se font par une session lancée dans `kompix_editor/`, pas depuis Kablix.

### Décisions attendues de Frank

1. **Où vit le système monté** : dans le `.projix` (un projet = schéma + programme + 3D, recommandé) ou dans un fichier à part ouvert par Kompix Editor ? 

   **dans le .projix**
2. **Cinématique seule** (recommandé) ou moteur physique dès le départ ?  
**Cinématique seule au départ**
3. **three.js dans Kablix** pour la vue de simulation (recommandé), ou vue 3D seulement dans Kompix Editor reliée à Kablix ?  
**three.js dans Kablix**
4. **Convention de nommage** : valider ou corriger l'esquisse `rôle:repère`.  
**rôle:repère**
5. **Import STEP** par OpenCascade WASM téléchargé à la demande (recommandé), ou par FreeCAD installé sur le poste (plus léger, mais FreeCAD obligatoire) ?  
**par OpenCascade WASM téléchargé à la demande**
6. **Ordre** : commencer par D0 (piste 7, petite, utile seule) puis D4–D5, ou attaquer directement D1–D2 ?  
D0 , D1 et D2
7. **Kompix Editor** : garde son nom et reste un outil à part, ou devient le module 3D de Kablix à terme ?  
**garde son nom et reste un outil à part. un composant créé doit pouvoir être utilisé dans kablix sans kompix editor. Kompix editor devra aussi pouvoir créer des composants 3d seulement élec sans méca (le type de composant actuel, mais en 3D).**  

**Les modifications dans kablix seront faites dans une branche (mecatronique)**

---

## 12. Cartes ESP32-C3 / S3

**Bilan du 21/11/2026**, après sonde. Il remplace celui d'août 2026 (anciennes pistes « Sonder l'émulateur Espressif » et « Ajouter la famille ESP32 »), qui butait sur l'absence d'accès aux broches.

### Ce qui a changé depuis août

Espressif publie **esp-emulator** ([dépôt](https://github.com/espressif/esp-emulator)) : un émulateur écrit en Rust, compilé en WASM, licence Apache-2.0, ROM des puces fournies. Versions 1.0 le 13/11, 1.1 le 16/11, 1.2 le 20/11/2026. Il expose ce qui manquait en août :

- horloge pilotée par l'hôte (`run_until(cycles)`), comme nos moteurs AVR et Pico ;
- état des broches (`gpio_state()`), entrées imposées (`gpio_set_input()`), console série (`uart_input()` et retour de `run_until()`) ;
- un protocole de co-simulation (protobuf, liaisons JS fournies) pour I²C, SPI, PWM, tension analogique, impulsions : de quoi brancher nos composants sans écrire de Rust.

Puces couvertes : C3, C5, C6, H2, P4 (RISC-V) et **S3** (Xtensa LX7). **L'ESP32 classique (WROOM, DevKit V1) n'y est pas.**

### Sonde (MicroPython 1.25 officiel, sous Node)

| Mesure                          | ESP32-C3 (160 MHz) | ESP32-S3 (240 MHz) |
| ------------------------------- | ------------------ | ------------------ |
| Invite `>>>`                    | ~100 ms émulées    | ~100 ms émulées    |
| Sortie vue par l'hôte           | oui                | oui                |
| Entrée imposée lue par `Pin`    | oui                | oui                |
| Vitesse en calcul pur           | 0,22× temps réel   | 0,14× temps réel   |
| Bascules de broche par seconde  | ~40 000            | ~40 000            |

`time.sleep()` est sauté : c'est l'hôte qui cadence, comme pour le Pico. Une liste en compréhension de 20 000 éléments sature la mémoire du C3. Non testé : ADC, I²C, PWM, WS2812 (tous par la co-simulation).

**Verdict technique** : faisable. 0,14 à 0,22× temps réel en calcul pur suffit pour les montages scolaires, qui passent leur temps à attendre (le Pico tourne aujourd'hui dans le même ordre de grandeur).

### Risques

- **Cœur fermé** : le dépôt ne publie que des binaires et de la doc. Un défaut de l'émulateur ne se corrige pas chez nous, contrairement à rp2040js et avr8js.
- **API jeune** : trois versions en huit jours. Figer une version dans le `.vsix`, ne monter qu'après essai.
- **Poids** : WASM de 6,1 Mo (5 Mo en archive), soit +2 à 3 Mo compressés dans le `.vsix` (7,3 Mo aujourd'hui). À mesurer.
- **Arduino C++** : le cœur Arduino-ESP32 pèse plusieurs centaines de Mo. Téléchargé à la demande, jamais dans le `.vsix`.
- **Débogage C++** : la lecture des variables est à refaire pour RISC-V et Xtensa.
- **Annonce** : dire « ESP32-C3 / S3 », jamais « ESP32 ». Les écoles ont surtout des DevKit V1 (ESP32 classique), que cette piste ne couvre pas.

### Lots proposés

| Lot | Contenu                                                                                                    | Coût    |
| --- | ---------------------------------------------------------------------------------------------------------- | ------- |
| 0   | Sonde (fait le 21/11/2026)                                                                                  | **S** ✅ |
| 1   | Troisième moteur `esp.mts` (interface `SimEngine`), MicroPython sur C3 : broches, console, cadencement, téléversement | **L**   |
| 2   | Cartes : ESP32-C3 SuperMini et DevKitM, dessin, brochage, tests `testkablix`, fiches d'aide                | **M**   |
| 3   | ESP32-S3 (même moteur, autre puce)                                                                         | **S**   |
| 4   | Arduino C++ : cœur ESP32 téléchargé à la demande, compilation, chargement du binaire                      | **M**   |
| 5   | Débogage C++ (variables, pas à pas) sur RISC-V puis Xtensa                                                 | **M–L** |
| 6   | Wi-Fi (NAT de l'émulateur) : requêtes HTTP, serveur web minimal                                            | **M**   |

MicroPython C3 + S3 (lots 1 à 3) : **L**, environ 1 M jetons. Tout (lots 1 à 6) : **XL**, 2 M jetons et plus.

### Et si on écrivait notre propre simulateur en Rust ?

La question se pose à cause du cœur fermé et de l'ESP32 classique absent. Chiffrage, en partant de rien et pour un firmware MicroPython ou Arduino qui démarre et pilote ses broches :

| Morceau                                                                                                                               | Coût                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Cœur RV32IMC (C3) : jeu d'instructions, interruptions, CSR                                                                            | **S–M**               |
| Périphériques C3 : chemin ROM et chargeur, matrice d'interruptions, SYSTIMER, matrice GPIO et IO_MUX, UART, USB série-JTAG, flash SPI et cache MMU, efuse, RTC_CNTL, timers, LEDC, ADC, I²C, SPI, RMT | **L–XL**              |
| Mise au point jusqu'au démarrage complet des firmwares réels (le gros du temps, registre par registre contre la doc technique)        | **L**                 |
| Cœur Xtensa LX6 / LX7 (fenêtres de registres, jeu d'instructions large, options par puce)                                             | **XL**                |
| Périphériques de l'ESP32 classique (deux cœurs, autre carte mémoire, autres blocs)                                                    | **XL**                |
| Wi-Fi et Bluetooth                                                                                                                    | hors de portée        |

Totaux : **C3 seul ≈ XL, 2 à 4 M jetons**. **ESP32 classique ≈ 4 à 8 M jetons et plus**, Wi-Fi exclu. C'est le prix de la piste 11 entière, pour une seule carte.

Ce qui pèse contre :

- **Vitesse** : notre cœur WASM maison pour le Pico n'a gagné que ×1,86 (objectif ×3) et a été abandonné. Rien ne dit qu'un cœur maison battrait celui d'Espressif, qui a la doc interne.
- **Fidélité** : Espressif connaît ses puces ; nous les découvririons par la doc publique, avec des registres non documentés.
- **ROM** : il faut les ROM des puces. Leur licence de redistribution est à vérifier avant tout lot.

Ce qui pèse pour : le code serait à nous (correctifs, débogage, pérennité), et c'est **la seule voie vers l'ESP32 classique** dans une extension MIT, puisque QEMU est sous GPL.

**Recommandation** : construire sur esp-emulator (lots 1 à 3). Le simulateur maison reste une voie de secours, à rouvrir seulement si Espressif ferme ou abandonne son émulateur, ou si l'ESP32 classique devient indispensable.

### Points à revoir

- **ESP32 classique** : toujours non. Seul QEMU l'émule, sous GPL, incompatible avec la licence MIT de l'extension. Seule autre voie : le simulateur maison ci-dessus, au prix fort.
- **ESP8266** : rien de sérieux à reprendre. Non.
- **Veille** : suivre les versions d'esp-emulator. Une ouverture du code source ou l'arrivée de l'ESP32 classique changerait le chiffrage.
