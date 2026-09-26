# Sonde logique

![Sonde logique](../../img/composants/sonde-logique.webp)

Petite pince crocodile de mesure. Elle ne se câble pas : on la **pose sur la pastille d'une broche** de la carte, et elle devient une **voie** de l'analyseur logique. Chaque pince prend une **couleur** à la pose : la pince bleue sur la planche est la voie bleue dans l'analyseur.

Catégorie de la palette : **Appareils de mesure**.

> **Expérimental.** L'analyseur logique est pour l'instant expérimental : il fonctionne, mais son interface et ses décodages peuvent encore changer d'une version à l'autre.

Elle n'écoute que du **tout ou rien** : 0 ou 1, et l'instant de chaque changement. Pour voir une tension qui varie, c'est l'[oscilloscope](oscillo.md) ; pour suivre une valeur calculée par le programme, le traceur de courbes.

## Broches

| Borne | Rôle                                                                     |
| ----- | ------------------------------------------------------------------------ |
| **G** | La **pointe** de la pince, en bas à gauche du dessin — l'unique pastille |

La pince ne consomme rien et n'impose rien : le montage se comporte exactement comme si elle n'était pas là. Aucun fil n'en part, jamais.

## La pose :

1. Glissez la pince depuis la palette.
2. Amenez son **crochet** sur la **pastille** de la broche à écouter.
3. Lâchez. La pince s'accroche, prend une couleur, et la broche apparaît dans l'analyseur.

## Propriétés

| Propriété   | Rôle                                                    | Défaut   |
| ----------- | ------------------------------------------------------- | -------- |
| `etiquette` | Nom de la voie dans l'analyseur (`horloge`, `donnees`…) | *(vide)* |

L'étiquette s'affiche **sur la planche, à côté de la pince**, dans la couleur de la voie. Vide, elle est masquée et la voie prend le **nom de la broche** (`Broche 8`, `A0`, `GP14`).

Un montage rouvert retrouve ses pinces là où elles étaient, avec leurs couleurs et leurs noms.

## L'onglet « Analyseur logique »

Il n'y a **rien à cliquer** : dès qu'au moins une pince est posée, le **lancement de la simulation** ouvre l'analyseur dans un **onglet séparé**, que l'on peut poser **à côté du schéma** — on lit les créneaux et le câblage en même temps. Pas de pince sur la planche, pas d'onglet. Onglet fermé par mégarde : un bouton **Analyseur** apparaît dans la barre de simulation et le rouvre, avec sa dernière mesure.

L'onglet montre une **piste par voie**, dans la couleur de sa pince, avec une règle de temps en haut. Dans la marge, face aux deux niveaux du créneau, sont écrites leurs **tensions** : celle de la carte pour l'état haut (`5 V` sur Uno et Mega, `3,3 V` sur Pico), `0 V` pour l'état bas. Une pince posée derrière l'émetteur d'une carte d'interface prend les tensions de cet émetteur : `3,7 V` et `1,1 V` sur les lignes `+` et `−` de la carte **Grove DMX512**.

Plusieurs pinces peuvent écouter le **même signal** : sur une carte DMX, une pince sur `SIG`, une sur `+` et une sur `−` montrent toutes la trame émise par la broche qui l'attaque — la pince du `−` à l'envers, comme sur la vraie paire différentielle.

- **Molette** : zoom, autour du point sous la souris.
- **Glisser** : se promener dans l'enregistrement.
- **Flèches ◀ ▶** de la barre, ou touches **←** **→** : recule ou avance d'une demi-fenêtre, sans changer le zoom.
- **Flèches ⏮ ⏭** de la barre : amènent le **début de la trame** décodée précédente ou suivante au bord gauche, sans changer le zoom. Elles sautent les trames qui répètent la précédente à l'identique : un programme qui renvoie la même trame en boucle (DmxSimple, toutes les 2 ms environ) passe d'un contenu à l'autre en un clic, et ⏮ revient au début de la série d'avant. Elles demandent au moins un décodage ; avec plusieurs, elles passent d'un bus à l'autre dans l'ordre du temps, chaque bus comparé à ses propres trames.
- **Survol** : un réticule donne l'instant, et le niveau (0 ou 1) de chaque voie à cet instant.
- **Marqueurs M1 et M2** : garés dans la bande sous la règle, ils se glissent sur les pistes et se collent au front le plus proche ; posés tous les deux, l'écart entre eux s'écrit. La flèche de rappel, à gauche de la bande, les ramène au garage.
- **Marqueurs de fenêtre F1 et F2** : garés juste sous M1 et M2, avec leur propre flèche de rappel. Posés, ils tendent entre eux un **cadre violet, vide**, qui couvre toutes les pistes : on y encadre ce qu'on veut vérifier. Le cadre reste à sa place à l'écran quand **⏮ ⏭** passent d'une trame à l'autre, et suit le **déclenchement** quand il tombe ailleurs : le même endroit se relit trame après trame. Ils se collent aux fronts comme M1 et M2, mais ne mesurent rien.
- **Toute la capture** : ramène toute la capture dans l'écran.
- **Suivre en direct** : recolle la vue à la fin de la capture, ce qu'elle fait d'elle-même pendant un run tant qu'on n'a pas zoomé.

Sous le nom de chaque voie, la **pastille de couleur** ouvre ses réglages : nom, inversion, vitesse, tolérance, et **masquer**. Une voie masquée quitte l'écran mais garde sa capture ; tant qu'il y en a une, la barre montre un bouton qui les **réaffiche** toutes, avec leur nombre.

Chaque bouton de la marge — pastille, **T**, **P**, marqueurs garés, flèches de rappel — dit ce qu'il fait dans une **bulle**, au survol. Celles de **T** et de **P** disent aussi leur état : le déclenchement armé sur la voie, le bus décodé.

Hors simulation, l'onglet montre la **dernière capture** de la session.

Cette capture s'écrit **au fur et à mesure** dans un fichier à part, pendant que la simulation tourne, et une simulation interrompue laisse quand même ce qu'elle a mesuré. Ce fichier est **supprimé à la fermeture du projet** — pour garder une mesure, exportez-la (menu **☰**, **Exporter CSV**).

Le projet, lui, garde les **réglages** de l'instrument (déclenchement, décodages, réglages de voie, profondeur).

## Profondeur et relance

Comme un analyseur du commerce, l'instrument a une **mémoire bornée** : la liste **Profondeur** de la barre fixe le nombre de fronts gardés **par voie** — `5 k`, `15 k`, `60 k` (par défaut), `250 k` ou `1 M`. Les deux plus petites servent à isoler un passage court sans garder des secondes de signal. Pendant la mesure, chaque choix affiche entre parenthèses la **durée qu'il couvre** (`60 k (≈ 6 s)`), estimée sur la voie la plus active : un bus DMX ou une horloge rapide remplit la mémoire bien plus vite qu'une LED qui clignote. Plus profond veut dire plus long, mais aussi plus lourd pour l'onglet.

Sans déclenchement, la capture garde les **derniers** fronts : les plus anciens sortent au fur et à mesure, l'écran suit la fin. Avec un déclenchement, elle garde un dixième de la profondeur **avant** le front de déclenchement et remplit le reste **après** lui ; une fois pleine, elle s'arrête, et la barre dit la **durée de signal gardée** et la profondeur : `Capture pleine : 8,3 s gardées (60 k fronts par voie)`. Relancée, une capture pleine garde la même durée tant que le signal ne change pas d'allure.

Changer la profondeur pendant la simulation s'applique aussitôt : sur une capture pleine, une nouvelle acquisition démarre. Simulation arrêtée, le choix attend le prochain lancement.

La liste **Échantillonnage** ne change rien à cette durée. Un analyseur du commerce range des échantillons : sa durée vaut la profondeur divisée par la fréquence d'échantillonnage. Kablix range des **fronts**, datés au cycle près du processeur : sa durée dépend du rythme du signal, pas de l'échantillonnage. Celui-ci ne sert qu'à **montrer ce que verrait un vrai instrument** : chaque front est recalé sur le tic qui le suit, deux fronts dans le même tic se confondent, une impulsion plus courte qu'un tic disparaît, et un bus lu trop lentement se décode mal. La capture, elle, garde tous ses fronts exacts : revenir à **Illimité** les retrouve sans rien recapturer. Pour mesurer, laissez **Illimité**.

Le bouton **↻ Relancer la capture**, en tête de la barre, efface la mesure en cours et repart à zéro sans arrêter la simulation ; un déclenchement réglé se réarme et attend son prochain front. Il n'est actif que pendant la simulation.

## Exporter

Le bouton **☰** de la barre ouvre le menu des exports :

- **Exporter CSV** : enregistre la mesure dans un fichier `.csv`, **une colonne par voie** (`temps_ms,Sig,DMX-,DMX+`), la description des voies en tête. Chaque front tient sur **deux lignes au même instant** : le niveau d'avant, puis celui d'après. Tracées dans un tableur en « nuage de points reliés », les courbes sont donc des créneaux à fronts verticaux, comme à l'écran. Une voie lue à l'envers (patte `-` d'une paire DMX, réglage *Invert*) l'est aussi dans le fichier. Une case vide veut dire que la voie n'a pas encore bougé. Une mesure en cours s'exporte sans arrêter la simulation.
- **Copie SVG** : met les courbes au presse-papier **en image**, sous deux formes à la fois : un dessin vectoriel (SVG) que colle Inkscape, et une image ordinaire, deux fois plus fine que l'écran, que colle Word. Chaque logiciel prend celle qu'il sait lire.
- **Exporter SVG** : la même image, enregistrée dans un fichier `.svg`.

Pour n'exporter qu'un morceau, posez **M1** au début de ce qui vous intéresse et **M2** à la fin. Le CSV ne garde alors que les fronts compris entre les deux, encadrés par le niveau de chaque voie à M1 et à M2. Le SVG dessine cette plage **au zoom affiché** : un pixel de l'écran vaut un pixel de l'image, donc zoomer avant d'exporter l'allonge et dézoomer la resserre. Sans M1 ni M2, le CSV emporte toute la mesure et le SVG ce que montre l'écran.

L'image garde les couleurs du thème et son fond, les noms des voies, les décodages et les marqueurs, sans les boutons de l'onglet. Une plage qui ferait moins de 40 pixels de courbe à ce zoom, ou une image de plus de 50 000 pixels de large, est refusée par un message qui dit s'il faut zoomer ou dézoomer.

## Le déclenchement

Le menu **T** sous le nom d'une voie : choisissez le **sens** — front *montant* ou *descendant*. La capture reste alors **en attente** jusqu'au premier front de ce type, puis se **fige sur lui** : l'instant 0 de la règle devient ce front, et tout se lit en avance ou en retard par rapport à lui. Sans déclenchement, la règle part de l'instant du lancement de la simulation.

Changer de réglage **réarme** l'attente, tout comme le bouton **↻ Relancer la capture** : une capture pleine repart alors pour une nouvelle acquisition.

Sur une voie décodée en **DMX512**, le menu propose aussi **`START code 0x00`** : la capture se fige sur le **start bit du premier créneau** d'une trame d'éclairage, celui qui suit le `BREAK` et le `MAB`. Un canal qui vaut `0x00` ne déclenche pas, une trame à start code non nul (RDM, texte) non plus. Le bouton affiche alors `SC`. La durée d'un bit suit la **vitesse de la voie** (250 kbauds si rien n'est saisi) : une trame émise à une autre vitesse ne déclenche qu'une fois celle-ci réglée.

Sur une voie qui porte les données d'un autre décodage, le menu propose **Début de trame** : la capture se fige sur l'**ouverture de la première trame** qui suit l'armement. Ce qui ouvre une trame dépend du protocole :

- **I²C** : le `START` (un `START rep.` ne fait que continuer la trame en cours) ;
- **SPI** : `CS ↓` ; sans voie CS, le premier octet d'une salve d'horloge ;
- **UART** : le premier caractère qui suit un silence d'au moins un caractère ;
- **1-Wire** : le `RESET` ;
- **DHT11 / DHT22** : la demande du maître.

Le déclenchement lit le décodage tel qu'il est réglé : changer ses voies ou sa vitesse relance la recherche. Le bouton montre alors un trait suivi d'un créneau.

## Le décodage

Le menu **P** sous le nom d'une voie : `I²C / TWI`, `SPI`, `UART`, `1-Wire`, `DHT11 / DHT22` ou `DMX512`. Il faut ensuite dire **quelle voie joue quel rôle** :

| Protocole         | Rôles à désigner                                                                |
| ----------------- | ------------------------------------------------------------------------------- |
| **I²C / TWI**     | l'horloge (SCL) et la donnée (SDA)                                              |
| **SPI**           | l'horloge (SCK), MOSI, MISO, la sélection (CS), plus le **mode** 0 à 3          |
| **UART**          | la ligne série (TX ou RX), plus le **format** (`8N1`, `7E1`…) et la **vitesse** |
| **1-Wire**        | la ligne unique (DQ)                                                            |
| **DHT11 / DHT22** | la ligne unique (DATA), plus le **modèle** du capteur                           |
| **DMX512**        | la ligne de données                                                             |

Les octets et les repères de trame (`START`, `STOP`, `ACK`, `RESET`, numéros de canaux DMX) s'écrivent alors **sous la piste**, chacun à sa place dans le temps. Le décodage ne porte que sur la **partie visible** : zoomez sur la trame qui vous intéresse.

Les couleurs sont les mêmes pour tous les protocoles : le **départ** (bit de start, condition START, sélection CS) est en **vert**, l'**arrêt** (bits de stop, condition STOP, relâchement de CS) en **rouge**, les données en **bleu**, les repères de trame en **violet**, les contrôles (`ACK`, somme de contrôle) en **orange** et les erreurs en **magenta**. Les termes des normes (`Start`, `STOP`, `BREAK`, `MAB`…) ne sont jamais traduits : ce sont ceux des fiches techniques.

### Ce qui se règle

Le **modèle** d'un capteur DHT ne se devine pas. Le DHT11 et le DHT22 envoient exactement la même trame, avec les mêmes durées : **rien sur le fil ne permet de les distinguer**. Ce qui change est la façon de lire les quatre octets — le DHT22 code l'humidité et la température en dixièmes sur deux octets chacune, le DHT11 donne l'humidité en entier et la température en degrés puis dixièmes (`22,0 °C` : les premiers modèles envoient toujours un dixième nul). Choisir le mauvais modèle ne donne pas d'erreur, il donne des valeurs fausses.

La **vitesse** et le **format** d'une ligne UART non plus : deux vitesses voisines produisent les mêmes fronts et des octets différents, et un même signal lu en `8N1` ou en `7E1` ne donne pas les mêmes caractères. Des octets en charabia : c'est presque toujours la vitesse qu'il faut revoir en premier (elle se saisit dans les réglages de la **voie**, pas du décodage — deux lignes série d'un montage ne tournent pas forcément à la même allure).

La **base** des octets, elle, est un simple choix de lecture, commun à tous les protocoles : le réglage **Valeurs** du décodage les écrit en **hexadécimal** (`0x44`, par défaut — l'écriture des fiches techniques) ou en **décimal** (`68`, celle du programme qui compare une lecture à un nombre). Les repères de trame, les noms de commande (`CONVERT T`) et les mesures (`23,4 °C`) ne changent pas. Deux décodages d'une même capture gardent chacun leur base.

La case **Bits** ajoute, elle aussi pour tous les protocoles, l'**affichage binaire** : chaque bit lu s'écrit en `0` ou `1` juste sous le créneau qui le porte, dans l'ordre du fil, et un trait pointillé sépare deux bits voisins, pile sur les fronts. C'est la trame telle que le récepteur la lit : le bit de `Start` et les bits de `STOP` d'un caractère UART, les données envoyées **bit de poids faible d'abord** (UART, DMX, 1-Wire) ou **de poids fort d'abord** (I²C, SPI, DHT), le bit d'`ACK` d'un octet I²C. Les octets et les repères descendent d'une ligne pour laisser la place. De loin, quand un bit ne fait plus que quelques pixels, les chiffres disparaissent : zoomez pour les lire. Changer de protocole garde la case cochée.

### Ce que chaque décodage montre

- **UART** — chaque caractère se découpe comme sur le fil : le `Start` (un bit, vert), la valeur et, quand il est imprimable, le caractère lui-même (`0x48 'H'`), puis le `STOP` (rouge). Un bit d'arrêt manquant est signalé `cadrage` à la place du `STOP`, une parité fausse `parité` sur le bit de parité — la valeur reste affichée, à vous de juger.
- **DMX512** — chaque trame se lit dans l'ordre de la norme : le `BREAK` (ligne basse d'au moins 88 µs), le `MAB` (le repos haut qui le suit), puis des créneaux de onze bits. Chaque créneau montre son `Start` (vert, un bit), sa valeur en hexadécimal et son `STOP` (rouge, deux bits). Le premier créneau est le `START code 0x00` (éclairage), les suivants les canaux : `c1=0xC8`, `c2=0x32`… Une `PAUSE` marque un repos entre deux créneaux, le `MBB` celui entre le dernier créneau et le `BREAK` suivant. Un start code non nul (RDM, texte…) est annoncé tel quel, sans numéroter de canaux.
- **1-Wire** — une seule ligne, aucune horloge : c'est la **durée du creux** qui porte le bit. Le décodeur repère le `RESET` et nomme les commandes courantes en clair (`SKIP ROM`, `CONVERT T`, `READ SCRATCHPAD`…), parce que `0x44` ne dit rien alors que `CONVERT T` dit tout. Il ne distingue pas qui parle du maître ou de l'esclave : sur le fil, c'est le même creux, et un appareil du commerce ne fait pas mieux avec une seule pince. Seule exception : juste après le `RESET`, le capteur tient la ligne basse une centaine de microsecondes pour dire « je suis là » — c'est le `PRÉSENT` (violet). Sans lui, aucun capteur ne répond sur le fil.

  Avec un **DS18B20**, chaque mesure se lit en deux transactions, une par seconde environ :
  1. `RESET`, `PRÉSENT`, `SKIP ROM` (« je parle à tous les capteurs »), `CONVERT T` (« mesurez ») — puis la ligne reste au repos pendant la conversion (750 ms en 12 bits) ;
  2. `RESET`, `PRÉSENT`, `MATCH ROM` suivi des **8 octets de l'adresse** du capteur visé (le premier, `0x28`, est le code de la famille DS18B20, le dernier une somme de contrôle), puis `READ SCRATCHPAD` et les **9 octets** que le capteur renvoie : les deux premiers sont la température (poids faible d'abord, en seizièmes de degré : `0x90` `0x01` = 0x0190 = 400 → 25 °C), le dernier une somme de contrôle.

  Au démarrage, le programme cherche d'abord les capteurs présents (`SEARCH ROM`) : pour chaque bit de l'adresse, deux bits lus puis un bit écrit. Ces slots se suivent sans former d'octets, et ce qui s'écrit dessous n'a pas de sens — c'est normal, il ne sert qu'une fois.
- **DHT11 / DHT22** — un seul fil lui aussi, mais **ce n'est pas du 1-Wire** : ici le bit est porté par la durée du palier **HAUT** (environ 28 µs pour un `0`, 70 µs pour un `1`), et il n'y a ni ROM ni commande. Vous voyez d'abord le `DÉPART` du microcontrôleur, puis le `PRÉSENT` du capteur qui accuse réception, puis la mesure, sur **deux lignes** sous la courbe. La première découpe les cinq octets, chacun dans sa case, séparée de la suivante par un trait vertical : `0x02` `0x37` `0x00` `0xEA` `0x23`. La seconde donne, sous les octets qui les portent, l'humidité (`56,7 %HR`, sous les deux premiers), la température (`23,4 °C`, sous les deux suivants) et la somme de contrôle (`somme ✓`, sous le dernier). Quand la place manque, la somme se réduit à sa coche. Vue de loin, la trame ne fait que quelques pixels : la mesure s'écrit alors d'un bloc juste à sa droite, `56,7 %HR · 23,4 °C · somme ✓`, et reste lisible tant que le `DÉPART` l'est. La **somme de contrôle** est recalculée et annoncée : un `SOMME ✗` désigne une liaison douteuse — fil trop long, résistance de tirage absente — bien mieux que cinq octets en hexadécimal ne le feraient. Une trame coupée en route est signalée telle quelle (`17/40 bits`) plutôt que complétée au hasard.

---

*Dessin de la pince réalisé par Frank pour Kablix.*
