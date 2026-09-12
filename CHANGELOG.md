# Change Log

Format Calver : **ANNÉE.MOIS.incrément**, l'incrément repartant à 0 chaque mois.

## 2026.9.3 (prochaine publication)

### Nouveauté

- **Deux résistances de puissance.** La résistance ne se décline plus seulement en petit boîtier à anneaux : un **boîtier aluminium à ailettes** et un **boîtier céramique**, 10 W chacun, se choisissent dans ses propriétés. À cette taille la valeur n'est plus en couleurs, elle est **écrite** dessus en code d'atelier, puissance en tête : `10W 4R7` pour 4,7 Ω, `10W 4K7` pour 4,7 kΩ. Le boîtier céramique écrit l'unité avec un Ω (`10W 4Ω7`), comme dans la réalité. Ces deux-là sont trop massives pour tenir debout : la propriété de pose disparaît de leur inspecteur.
- **Une résistance peut partir en fumée.** Nouvelle propriété **puissance** sur toutes les résistances — ¼ W pour la petite (rien n'est inscrit dessus), 10 W pour les deux boîtiers de puissance. La simulation calcule ce que chaque résistance dissipe VRAIMENT au point de fonctionnement du montage, et au-delà de son boîtier elle explose, avec l'étiquette qui dit quoi corriger. Deux choses à savoir : une sortie de carte, avec ses ~25 Ω internes, ne peut pas griller une 10 W (il faut une alimentation de laboratoire — 12 V sur 4,7 Ω font 30 W) ; et en commande hachée c'est la **puissance** qui est moyennée, pas le courant, sinon l'échauffement serait sous-estimé.

### Modification

- **Le montage entier se mesure enfin au voltmètre.** Plusieurs composants existaient à l'écran sans exister dans le circuit : posez un voltmètre dessus, il lisait zéro. C'est fini pour le **potentiomètre** (les trois modèles : rotatif, glissière, ajustable — un pont de 10 kΩ sur 5 V donne 0 V, 1,25 V, 2,5 V, 5 V selon la position), le **ventilateur** et le **moteur à courant continu**. Un même modèle sert désormais la mesure et l'animation : la vitesse affichée et la tension mesurée ne peuvent plus se contredire.
- **Un transistor passant n'est plus un fil.** Ce qui reste à ses bornes dépend maintenant de sa nature : **chute fixe** pour un bipolaire saturé (nouvelle propriété **Vce(sat)**, de 0,2 à 0,7 V selon la référence, 0,9 V pour un darlington), **résistance** pour un canal MOSFET ouvert (**Rds(on)**, la chute suit donc le courant). Les 26 références du catalogue portent leur valeur de fiche technique.
- **La grille d'un MOSFET se juge en tension, plus en niveau logique** (nouvelle propriété **Vgs(th)**). Un pont diviseur ou une sortie 3,3 V donnent un « 1 » logique franc **sans** ouvrir un MOSFET de puissance — le piège que Kablix ignorait. Un IRF530 dont la grille est sur le curseur d'un potentiomètre s'allume désormais au bon endroit de la course, et pas avant.
- **Un variateur PWM à transistor donne enfin ses vraies mesures.** Jusqu'ici le rapport cyclique se perdait dès qu'un transistor s'interposait entre la broche et la charge — c'est-à-dire dans le seul montage réaliste. Le voltmètre lit maintenant la **valeur moyenne** exacte (0 %, 25 %, 50 %, 75 %, 100 % → 0 V, 1,11 V, 2,22 V, 3,33 V, 4,44 V), l'ampèremètre ne perd plus la mesure, et l'oscilloscope garde toute la hauteur du créneau : le multimètre moyenne, l'oscilloscope montre. Le **hachage d'un PNP par le haut** est traité aussi, commande active basse comprise.
- **Une carte n'a pas un seul rail** : un Pico donne 3,3 V sur 3V3 et 5 V sur VBUS, chaque broche d'alimentation porte la sienne. Et la **masse vaut zéro** — elle flottait de quelques millivolts, ce qui produisait des Vce négatifs et des tensions fausses un peu partout. Les appareils lisent maintenant juste : 5,000 V sur une alimentation de 5 V, 0,200 V de Vce sur un bipolaire, 3,300 V sur un rail 3,3 V.
- **Un moteur qui cale le dit.** Le seuil de démarrage descend à 15 % de la tension nominale, et sous ce seuil le moteur s'arrête en annonçant pourquoi — sauf en commande hachée, où passer par le bas de l'échelle est normal. Surtout, **le message accuse la bonne pièce** : un transistor qui sature (il ne transmet que gain × courant de base) n'est plus rangé avec « l'alimentation ne fournit pas assez ». Le moteur continue de tourner au ralenti sur ce courant plafonné, comme sur un vrai banc.
- **Un défaut corrigé s'efface de l'écran.** Un cadre rouge posé sur un moteur y restait à vie, même après que la cause avait disparu : remontez le bouton de l'alimentation, le message part maintenant avec le défaut. Un composant grillé, lui, garde bien son cadre.
- **Écrire sur la feuille : le mode texte.** Nouveau bouton « **T** » dans la barre : un clic sur la feuille pose une **étiquette** libre — titre de montage, remarque, nom d'une zone —, sur plusieurs lignes, déplaçable comme un composant, avec un curseur en T pour rappeler le mode actif. Une étiquette sélectionnée se règle dans l'inspecteur : **couleur du texte**, **couleur du fond**, **transparence du fond** (jusqu'à zéro, le texte reste seul sur la feuille), **taille** et **police**. Copier / coller acceptés, le texte arrivant toujours en clair. La simulation les ignore ; l'export SVG les emporte, réglages compris.
- **Ctrl + clic sur le bouton d'autoroutage = retracé complet** : les coudes sont effacés et le tracé repart de zéro. Le clic simple continue de **préserver** un fil déjà propre.
- **Une étiquette libre sur le multimètre et l'oscilloscope** (comme l'adhésif qu'on colle sur un appareil de banc) : elle s'affiche seule, sans passer par le menu Noms, et **reste visible pendant la simulation** — c'est justement là qu'on lit les mesures.
- **Le multimètre devient vert en ampèremètre** (bleu en voltmètre) : le calibre se lit à la couleur de la coque, sans regarder l'écran ni le levier.
- **Le bandeau de nom se cale sur le dessin, plus sur sa boîte** : il ne flotte plus au-dessus du vide sur un ventilateur ou une carte Uno, et il prend la largeur de son texte au lieu de celle du composant.
- **Un projet rouvert ne vire plus au gris** : l'atelier lu sur le disque n'est plus recouvert par un état plus ancien resté en mémoire.
- **Un projet n'emporte plus la bibliothèque entière** : un `.projix` ne grave que les composants qu'il pose. Les fichiers de mesure passent ainsi de 94 ko à 4 ko, à contenu identique.

## 2026.9.2 (6 septembre 2026)

- **Le poster de brochage de l'Uno retouché** : il devient cohérent avec ceux des autres cartes Arduino (source Arduino).
- **L'ouverture intempestive de la fenêtre de sortie** à l'ouverture d'une carte Arduino est corrigée (nécessite une mise à jour de l'extension Arduino pour VS Code).

## 2026.9.1 (3 septembre 2026)

- **Les LED comptent dans les calculs électriques** : une LED n'est plus un simple interrupteur pour le reste du montage, sa chute de tension et son courant entrent dans le calcul.
- **L'ampèremètre n'est plus un fil parfait** : il insère sa **résistance interne de 0,1 Ω**, comme un vrai appareil avec son shunt. La chute à ses bornes existe donc et se mesure au voltmètre, sans changer le courant du montage de façon visible. Posé en travers d'une alimentation, il reste détecté comme court-circuit.
- **Un bouton se câble dans les deux sens** : branché vers le plus ou vers la masse, il appuie dans les deux cas.
- **Plus rien n'est souligné en rouge dans le code.** Kablix déclare le croquis ouvert à l'extension Arduino et montre à Pylance les déclarations MicroPython de MicroPico. Nouvelle commande dans la palette — **Kablix : réparer l'analyse du code pour cette carte** — qui refait le travail à la demande et **dit ce qui manque** (extension à installer, croquis `.ino` à ouvrir, ou fenêtre à recharger).
- **Deux fils ne peuvent plus se recouvrir.**
- **Un quart de tour par clic** sur les deux boutons de rotation : quatre clics font le tour. Le pas fin de 45° reste sous les touches **+** et **−**.
- **Plus de point jaune sous la poignée d'un fil sélectionné** : on ne voit plus que le point blanc qu'on vient attraper. Le repère reste allumé pendant un câblage en cours, là où il sert.
- **Un atelier vierge ne réclame plus d'enregistrement.** 
- **Dessin de la carte Uno retouché** (décalages de texte repris à la main) et **`avr8js` en 0.21.1**.

## 2026.9.0 (2 septembre 2026)

- **Deux cartes de plus : Raspberry Pi Pico 2 et Pico 2 W.** Elles se choisissent dans la barre d'outils, se posent, se simulent et s'enregistrent comme les autres, avec leur dessin officiel et leur poster de brochage. Un **troisième moteur** est embarqué pour elles (`rp2350js`, cœurs Cortex-M33), à côté d'`avr8js` et de `rp2040js`.
- **Le Pico W fait serveur web** : la carte se déclare en point d'accès, sert une page ALLUMER/ÉTEINDRE, et **un téléphone du réseau allume la LED**. Le pont réseau accepte désormais les connexions entrantes, sans jamais interpréter ce qui passe : c'est le programme qui parle HTTP, exactement comme sur le matériel réel.
- **Un multimètre de table**, à brancher comme le vrai : deux prises banane, un levier pour choisir **tension continue** (en parallèle) ou **courant continu** (en série). Un ampèremètre posé en parallèle d'une alimentation est un court-circuit — Kablix le dit au lieu de le simuler en silence. Sur un signal haché, l'écran donne la **valeur moyenne**, comme un vrai appareil.
- **Un oscilloscope de table** qui dessine ce que le multimètre chiffre. Base de temps, volts par division, **déclenchement** sur front montant ou descendant avec son curseur de niveau.
- **Quatre composants de plus au catalogue** : **photodiode** et **phototransistor** (curseur de luminosité, et Kablix prévient quand la résistance de charge manque), plus les deux appareils de mesure — nouvelle famille **Appareils de mesure** dans la palette. La palette passe à **74 composants**.
- **Cinq composants de plus dans la bibliothèque téléchargeable** : **barrière optique infrarouge**, **carte fille Grove pour Uno** (seize prises, interrupteur 3,3 V / 5 V, emboîtement automatique sur la carte), **capteur d'humidité du sol**, **capteur de lumière Grove** (curseur en lux, pleine échelle réglable) et **lecteur de badges RFID 125 kHz** (cavalier UART ou Wiegand, badge qui entre et sort de la boucle d'antenne).

## 2026.8.99 (2026-08-21)

- **Les composants se téléchargent** : nouveau bouton **⚙ Gérer les composants** en bas de la palette. Il liste ce que proposent les dépôts (**Nouveaux**), ce qui est réellement installé (**Installés**) ou **Tous**, installe d'un clic et désinstalle avec confirmation. Un composant installé quitte aussitôt la palette ET les schémas ouverts. Le dossier est **partagé par tous les projets** de la machine, et le réglage *Kablix › Components Folder* affiche enfin son chemin par défaut.
- **Un composant tient dans UN fichier `.kompix**` : dessin externe, schéma interne, brochage, vignette, code de simulation et **fiche d'aide illustrée** voyagent ensemble dans le paquet. Déposé dans le dossier du projet, il est reconnu tout seul. Le bouton **❔ Aide du composant** ouvre la fiche embarquée — en français, en anglais, ou dans la première langue disponible.
- **Éclairage DMX512** : deux composants publiés dans la bibliothèque publique, la carte **Grove DMX512** (embase XLR 3 points) et le **projecteur PAR 38** à LED. L'univers est décodé depuis l'**UART matériel** (`SERIAL_8N2` à 250 kbit/s) **ou** depuis une broche **pilotée en logiciel** — un croquis `DmxSimple` fonctionne sans être modifié. L'adresse DMX se règle dans l'inspecteur, plusieurs projecteurs partagent la même paire, et les LED s'allument bombées, avec leur halo. Le trafic DMX n'inonde pas le moniteur série.
- **Envoyer le programme sur une vraie carte Pico** : bouton **⬆** dans la barre d'onglet d'un fichier `.py`. La carte est détectée toute seule sur l'USB, le programme part **renommé `main.py**` (il redémarre donc à chaque mise sous tension), et **seuls les modules réellement importés** l'accompagnent — la même liste que celle du simulateur. Un fichier inchangé n'est pas réécrit (comparaison sur l'empreinte, pas sur la date). Pour **Arduino**, la même fonction existe à condition d'installer mon extension Arduino-VsCode-IDE.
- **Un croquis inchangé ne se recompile plus** : le résultat d'une compilation est gardé sur le disque, classé sur l'empreinte du **contenu** des sources. Relancer un croquis inchangé dure donc quelques dizaines de millisecondes au lieu de plusieurs secondes.
- **« Enregistrer sous » ne perd plus rien** : les composants de bibliothèque sont regravés dans la nouvelle archive (le montage s'ouvre entier sur une machine qui ne les a pas installés) et le programme adopté est celui qui porte le nom du projet, à côté de lui.
- **Correctif `machine.UART` (Pico)** : la classe était inutilisable en MicroPython simulé. Corrigé dans le moteur — tout programme Pico qui ouvre un port série en bénéficie, pas seulement le DMX.
- **Un composant à comportement distant demande confiance** avant de s'exécuter, et un composant fraîchement téléchargé n'est plus considéré comme « local, donc approuvé d'office ».

## 2026.8.74 (2026-08-16)

- **Catégorie systéme fonctionnelle** avec une patte et un **robot araignée** : quadrupède à 8 servomoteurs, avec sa **Pico W, son PCA9685 et sa batterie embarqués** — rien à câbler, c'est LUI qu'on programme. Chaque servo se règle comme sur le vrai modèle : canal PCA9685 où il est branché, sens de montage, calage du zéro, largeur d'impulsion.
- Ajout d'**outil de dessin de systéme 3D** (en réalité 2d isométrique) : Dessin 2 D d'assemblages (svg) et viewer 3D iso.
- **Simulation en arrière-plan, activée par défaut** : déplacement, zoom et édition restent fluides pendant qu'un programme tourne, et une page chargée ne fait plus prendre de retard à l'horloge simulée. 
- **Deux nouveaux composants** : **potentiomètre ajustable** (la vis se tourne, la valeur s'écrit toute seule) et **capteur à effet Hall** (l'aimant se fait glisser). La bibliothèque passe à **73 composants**, toujours en 10 catégories, chacun avec sa fiche d'aide illustrée (FR + EN).
- **Résistance montée debout**, comme sur une vraie platine.
- **Démarrage deux fois plus rapide** : la bibliothèque de compression n'est chargée qu'à l'ouverture d'un projet.
- **Atelier** : la feuille a des bords des quatre côtés, la molette et le bouton *ajuster la vue* cadrent le **dessin** et non les cadres invisibles des composants, les trous de la platine s'allument avant la pose, la bibliothèque se cherche, et les composants très réglables rangent leurs propriétés en tiroirs repliables (en accordéon).
- **Corrections** : le bouton ferme éléctriquement le circuit, le REPL ne prend plus le firmware du Pico W quelle que soit la carte, `rp2040js` 1.3.3 (correction DMA).
- **Interface et aide entièrement traduites** en français et en anglais.

## 2026.8.22 (2026-08-08)

- **Bibliothèque de 71 composants** en 10 catégories, chacun avec sa fiche d'aide illustrée (FR + EN) et ses deux montages de test (Arduino et Pico disponibles uniquement su github).
- Nouvelle catégorie **Système** (en cours de développement) : ensembles déjà assemblés — patte articulée et robot araignée quadrupède, dessinés en volume.
- **Pico à l'heure** : émulateur ARM accéléré de 30 %, temps perdu rattrapé, chronomètre et vitesse réelle affichés sur le canvas.
- Simulation physique (résistance série des LED, courant débité, démarrage des servomoteurs), traceur de courbes avec sondes de tension, moniteur série bidirectionnel.
- Autoroutage des fils avec barre d'avancement et annulation, export SVG, import/export Wokwi.
- Créateur de composants intégré et format ouvert `.kablix-part.json`.

## 2026.7.226 (2026-07-30)

- publication initiale
