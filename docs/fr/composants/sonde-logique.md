# Sonde logique

![Sonde logique](../../img/composants/sonde-logique.webp)

Petite pince crocodile de mesure. Elle ne se câble pas : on la **pose sur la pastille d'une broche** de la carte, et elle devient une **voie** de l'analyseur logique. Chaque pince prend une **couleur** à la pose : la pince bleue sur la planche est la voie bleue dans l'analyseur.

Catégorie de la palette : **Appareils de mesure**.

Elle n'écoute que du **tout ou rien** : 0 ou 1, et l'instant de chaque changement. Pour voir une tension qui varie, c'est l'[oscilloscope](oscillo.md) ; pour suivre une valeur calculée par le programme, le traceur de courbes.

## Broches

| Borne | Rôle |
|-------|------|
| **G** | La **pointe** de la pince, en bas à gauche du dessin — l'unique pastille |

La pince ne consomme rien et n'impose rien : le montage se comporte exactement comme si elle n'était pas là. Aucun fil n'en part, jamais.

## La pose : un geste, pas une case à cocher

1. Glissez la pince depuis la palette.
2. Amenez sa **pointe** sur la **pastille** de la broche à écouter — les deux pastilles se **superposent**, à moins d'une graduation près.
3. Lâchez. La pince s'accroche, prend une couleur, et la broche apparaît dans l'analyseur.

Ce qui compte est la **pointe**, pas le corps de la pince : posez la pointe sur la pastille, le reste du dessin peut dépasser où il veut.

Lâchée à côté d'une pastille, la pince **se décroche** — mais elle **garde sa couleur**. Reposez-la ailleurs, elle reste la même voie. Deux pinces empilées l'une sur l'autre ne servent à rien : la pose ignore les autres pinces.

Les couleurs ne se recyclent pas dans une séance : la voie 3 reste la voie 3 même si les pinces 1 et 2 sont enlevées. Huit couleurs, donc **huit voies au maximum**.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `etiquette` | Nom de la voie dans l'analyseur (`horloge`, `donnees`…) | *(vide)* |

L'étiquette s'affiche **sur la planche, à côté de la pince**, dans la couleur de la voie. Vide, elle est masquée et la voie prend le **nom de la broche** (`8`, `GP14`).

Deux attributs sont tenus par l'éditeur et n'ont pas de champ à remplir : `accroche` (quelle pastille est recouverte) et `voie` (l'indice de couleur). Ils sont enregistrés dans le `.projix` avec le schéma : un montage rouvert retrouve ses pinces là où elles étaient, avec leurs couleurs et leurs noms.

## L'onglet « Analyseur logique »

Il n'y a **rien à cliquer** : dès qu'au moins une pince est posée, le **lancement de la simulation** ouvre l'analyseur dans un **onglet séparé**, que l'on peut poser **à côté du schéma** — on lit les créneaux et le câblage en même temps. Pas de pince sur la planche, pas d'onglet.

L'onglet montre une **piste par voie**, dans la couleur de sa pince, avec une règle de temps en haut.

- **Molette** : zoom, autour du point sous la souris.
- **Glisser** : se promener dans l'enregistrement.
- **Survol** : un réticule donne l'instant, et le niveau (0 ou 1) de chaque voie à cet instant.
- **Ajuster** : ramène toute la capture dans l'écran.
- **Suivre** : recolle la vue à la fin de la capture, ce qu'elle fait d'elle-même pendant un run tant qu'on n'a pas zoomé.

Hors simulation, l'onglet montre la **dernière capture** enregistrée dans le `.projix`, pas du vide.

## Le déclenchement

Sélecteur **Déclenchement** : une voie, et un **sens** — front *montant* ou *descendant*. La capture reste alors **en attente** jusqu'au premier front de ce type, puis se **fige sur lui** : l'instant 0 de la règle devient ce front, et tout se lit en avance ou en retard par rapport à lui. Sans déclenchement, la règle part du début du run.

Changer de réglage **réarme** l'attente.

## Le décodage

Sélecteur **Décoder** : `I²C / TWI`, `SPI`, `UART`, `1-Wire` ou `DMX512`. Il faut ensuite dire **quelle voie joue quel rôle** :

| Protocole | Rôles à désigner |
|-----------|------------------|
| **I²C / TWI** | l'horloge (SCL) et la donnée (SDA) |
| **SPI** | l'horloge (SCK), MOSI, MISO, la sélection (CS), plus le **mode** 0 à 3 |
| **UART** | la ligne série (TX ou RX), plus le **format** (`8N1`, `7E1`…) et la **vitesse** |
| **1-Wire** | la ligne unique (DQ) |
| **DMX512** | la ligne de données |

`I²C` et `TWI` sont **le même bus** : seul le nom change d'une bibliothèque à l'autre. Un seul décodage suffit pour les deux.

Les octets et les repères de trame (`START`, `STOP`, `ACK`, `RESET`, numéros de canaux DMX) s'écrivent alors **sous la piste**, chacun à sa place dans le temps. Le décodage ne porte que sur la **partie visible** : zoomez sur la trame qui vous intéresse.

### Ce qui se règle et ne se devine pas

Le mode SPI ne se devine pas depuis les créneaux — deux modes donnent les mêmes fronts et des octets différents. C'est un réglage, comme sur un appareil du commerce.

La **vitesse** et le **format** d'une ligne UART non plus : deux vitesses voisines produisent les mêmes fronts et des octets différents, et un même signal lu en `8N1` ou en `7E1` ne donne pas les mêmes caractères. Des octets en charabia : c'est presque toujours la vitesse qu'il faut revoir en premier (elle se saisit dans les réglages de la **voie**, pas du décodage — deux lignes série d'un montage ne tournent pas forcément à la même allure).

### Ce que chaque décodage montre

- **UART** — chaque caractère sort avec sa valeur et, quand il est imprimable, le caractère lui-même : `0x48 'H'`. Un bit d'arrêt manquant est signalé `cadrage`, une parité fausse `parité` — l'octet reste affiché, à vous de juger.
- **1-Wire** — une seule ligne, aucune horloge : c'est la **durée du creux** qui porte le bit. Le décodeur repère le `RESET` et nomme les commandes courantes en clair (`SKIP ROM`, `CONVERT T`, `READ SCRATCHPAD`…), parce que `0x44` ne dit rien alors que `CONVERT T` dit tout. Il ne distingue pas qui parle du maître ou de l'esclave : sur le fil, c'est le même creux, et un appareil du commerce ne fait pas mieux avec une seule pince.

## Ce qu'une pince ne peut pas montrer

L'analyseur ne se tait jamais : une voie qui ne trace rien **dit pourquoi**, en gris barré dans la légende.

- **Posée dans le vide** : la pince n'est sur aucune pastille.
- **Pas une broche de carte** : elle est sur une patte de résistance, une borne de condensateur, la broche d'un capteur. L'analyseur écoute les broches du **microcontrôleur**, pas les nœuds du montage — pour regarder ailleurs dans le circuit, c'est l'[oscilloscope](oscillo.md).
- **Alimentation ou masse** : le niveau est constant, il n'y a aucun front à montrer.
- **Entrée analogique** (`A0`-`A5`, `GP26`-`GP28`) : la voie est **tracée quand même** — `digitalRead(A0)` est parfaitement licite — mais signalée : d'un signal continu, on ne verra jamais que 0 ou 1.

## Utilisation

- Une pince sur `8`, une sur `9`, étiquetées, et l'on voit d'un coup d'œil laquelle bat deux fois plus vite que l'autre.
- Pour un bus I²C : une pince sur `SDA`, une sur `SCL`, décodage `I²C / TWI`, et les adresses des composants s'écrivent en clair sous les créneaux.
- Pour voir ce que `Serial.print()` envoie vraiment : une pince sur la broche `TX`, décodage `UART`, vitesse réglée sur celle du `Serial.begin()`, et le texte apparaît caractère par caractère sous les créneaux.
- Pour attraper un événement rare : déclenchement sur son front, puis on zoome autour de l'instant 0.
- Créneau trop serré ou trop étalé : molette. La règle donne toujours l'échelle réelle (s, ms, µs, ns).

---

*Dessin de la pince réalisé par Frank pour Kablix.*
