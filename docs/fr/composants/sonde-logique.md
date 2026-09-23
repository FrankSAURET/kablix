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

Cette capture fait partie du projet, comme le schéma : dès qu'une simulation se termine — ou qu'un réglage de l'analyseur change (déclenchement, décodage, fréquence) — l'onglet du projet passe **« à enregistrer »** (le point ●). Fermez sans enregistrer et VS Code vous le demandera, au lieu de jeter la mesure en silence.

### Première fois : le tour complet en cinq minutes

Le plus simple est de partir d'un montage déjà prêt. Ouvrez **`testkablix/sonde-logique-pico.projix`** : quatre pinces y sont posées sur un Pico, et le programme fait battre deux broches. Rien à câbler, rien à écrire.

**Ce qu'il y a sur la planche.** Quatre pinces, chacune d'une couleur, posées sur quatre broches différentes — et une LED sur `GP15`, qui donne un repère visible à l'œil nu pendant que l'analyseur, lui, mesure.

| Pince | Broche | Ce qu'elle va montrer |
|-------|--------|------------------------|
| **SD1** | `GP14` | Un créneau rapide, 200 µs de haut, 200 µs de bas. Elle est nommée **horloge** : c'est ce nom qui s'affichera, pas `GP14`. |
| **SD2** | `GP15` | Le même créneau **deux fois plus lent** — le programme ne la fait basculer qu'un tour sur deux. Sans étiquette : elle s'appellera `GP15`. |
| **SD3** | `GP17` | Rien. La broche existe mais le programme ne la pilote pas : la piste est tracée et reste **plate**. C'est le cas normal d'une pince posée au mauvais endroit. |
| **SD4** | `GP26` | L'entrée analogique `ADC0`. Elle est tracée, mais la légende **prévient** : d'une tension continue on ne verra jamais que 0 ou 1. |

**Le parcours.**

1. **Lancez la simulation** (le bouton ▶ de l'atelier). Vous n'avez rien à cliquer pour l'analyseur : l'onglet **« Analyseur logique »** s'ouvre tout seul parce qu'il y a des pinces sur la planche.
2. **Cliquez sur son titre** pour le mettre devant. Il naît derrière l'atelier exprès, pour ne pas vous voler le clavier pendant que la simulation démarre.
3. **Posez-le à côté du schéma** : tirez l'onglet vers la droite de la fenêtre. On voit alors la planche et les créneaux en même temps, et c'est là que l'instrument devient utile — la pince bleue sur le dessin est la piste bleue à l'écran.
4. **Lisez la légende**, sous la barre d'outils : quatre pastilles de couleur, **horloge**, `GP15`, `GP17`, `GP26`. C'est la carte de correspondance entre la planche et l'écran.
5. **Regardez les deux premières pistes.** `horloge` bat régulièrement ; `GP15` fait des créneaux deux fois plus longs. Placez-les côte à côte du regard : un front de `GP15` sur deux coïncide avec un front d'`horloge`. C'est exactement ce que dit le programme.
6. **Zoomez à la molette**, en plaçant la souris sur un créneau. Le zoom se fait **autour du point pointé** : vous restez sur ce qui vous intéresse. Descendez jusqu'à lire les 200 µs sur la règle du haut.
7. **Survolez une piste.** Un réticule suit la souris et affiche, à gauche, l'instant exact et le niveau (0 ou 1) de **chaque** voie à cet instant. C'est ainsi qu'on lit un décalage entre deux signaux.
8. **Cliquez sur « Ajuster »** pour revoir toute la capture d'un coup, puis sur **« Suivre »** pour recoller la vue à la fin — l'instrument redevient un moniteur en direct.

**Ce qu'il faut avoir compris en sortant.** La pince ne se câble pas, elle se **pose**. La couleur de la pince sur la planche **est** la couleur de sa piste. Une voie qui ne montre rien n'est pas une panne : l'analyseur **dit toujours pourquoi**, et `GP17` en est la démonstration, sur le même écran que les deux voies qui marchent.

**Pour aller plus loin, sur ce même montage.** Réglez le **Déclenchement** sur `horloge`, front montant : la règle se recale sur ce front et les deux créneaux cessent de glisser. Puis changez l'**étiquette** de SD2 dans les propriétés (sélectionnez la pince, tapez `lente`) : le nom change aussitôt dans la légende, sans relancer quoi que ce soit.

### L'onglet reste gris : le pas à pas

Six étapes, dans l'ordre. Chacune dit **ce qu'il faut voir** : la première qui ne donne pas le résultat annoncé désigne la cause.

1. **La pince est-elle accrochée ?** L'accrochage se décide **au lâcher**, par superposition des pastilles : la pointe de la pince doit tomber sur celle de la broche, à moins d'une graduation près. Une pince bien posée **garde sa couleur** ; une pince lâchée à côté se décroche, et c'est l'analyseur qui le dira à l'étape 4 (« posée dans le vide »). Dans le doute, reposez-la en visant la pastille, pas le corps de la broche.
2. **L'onglet s'ouvre-t-il tout seul ?** Lancez la simulation. Un onglet « Analyseur logique » doit apparaître **à côté** du schéma. Il ne s'ouvre pas : c'est qu'aucune pince n'est posée sur la planche — l'analyseur ne s'ouvre jamais à vide.
3. **L'onglet est-il au premier plan ?** Il naît **derrière** l'atelier pour ne pas vous voler le clavier. Cliquez sur son titre. Depuis la version 2026.9.4.102 il se peint tout seul en arrivant devant ; avant, il pouvait rester gris — c'est le défaut corrigé.
4. **La légende porte-t-elle des noms de voies ?** Juste sous la barre d'outils, une pastille de couleur et un nom (`8`, `GP14`, ou votre étiquette) par pince. Légende **vide** : les pinces ne sont pas arrivées jusqu'à l'analyseur — revoyez l'étape 1. Légende **grise et barrée** : la voie est là mais ne peut rien tracer, et le motif est écrit à côté (voir plus bas, « Ce qu'une pince ne peut pas montrer »).
5. **Y a-t-il des créneaux ?** Si la légende est bonne mais que les pistes restent plates, c'est que la broche **ne change pas d'état** : vérifiez que le programme la pilote vraiment, et qu'il tourne (la console doit vivre).
6. **Un message au milieu de la piste ?** Il y en a trois, et chacun se lit au pied de la lettre : « aucune sonde » (rien n'est posé), « aucun front capturé » (la broche est immobile), « en attente du déclenchement » (le front choisi au **Déclenchement** n'est jamais venu — changez de sens, ou retirez le déclenchement).

Si les six étapes passent et que l'image reste grise, c'est un défaut : **fermez l'onglet et relancez la simulation**, la capture repart de zéro.

> Sur une machine lente, un onglet mettant plus de trois secondes à s'ouvrir pouvait rester **vide pour toute la durée du run** : les voies se perdaient dans la file d'attente et l'analyseur ne savait plus à quelle piste rattacher ce qu'il recevait. Corrigé — si vous retrouvez ce comportement, il est utile de le signaler.

## Le déclenchement

Sélecteur **Déclenchement** : une voie, et un **sens** — front *montant* ou *descendant*. La capture reste alors **en attente** jusqu'au premier front de ce type, puis se **fige sur lui** : l'instant 0 de la règle devient ce front, et tout se lit en avance ou en retard par rapport à lui. Sans déclenchement, la règle part du début du run.

Changer de réglage **réarme** l'attente.

## Le décodage

Sélecteur **Décoder** : `I²C / TWI`, `SPI`, `UART`, `1-Wire`, `DHT11 / DHT22` ou `DMX512`. Il faut ensuite dire **quelle voie joue quel rôle** :

| Protocole | Rôles à désigner |
|-----------|------------------|
| **I²C / TWI** | l'horloge (SCL) et la donnée (SDA) |
| **SPI** | l'horloge (SCK), MOSI, MISO, la sélection (CS), plus le **mode** 0 à 3 |
| **UART** | la ligne série (TX ou RX), plus le **format** (`8N1`, `7E1`…) et la **vitesse** |
| **1-Wire** | la ligne unique (DQ) |
| **DHT11 / DHT22** | la ligne unique (DATA), plus le **modèle** du capteur |
| **DMX512** | la ligne de données |

`I²C` et `TWI` sont **le même bus** : seul le nom change d'une bibliothèque à l'autre. Un seul décodage suffit pour les deux.

Les octets et les repères de trame (`START`, `STOP`, `ACK`, `RESET`, numéros de canaux DMX) s'écrivent alors **sous la piste**, chacun à sa place dans le temps. Le décodage ne porte que sur la **partie visible** : zoomez sur la trame qui vous intéresse.

### Ce qui se règle et ne se devine pas

Le mode SPI ne se devine pas depuis les créneaux — deux modes donnent les mêmes fronts et des octets différents. C'est un réglage, comme sur un appareil du commerce.

Le **modèle** d'un capteur DHT non plus. Le DHT11 et le DHT22 envoient exactement la même trame, avec les mêmes durées : **rien sur le fil ne permet de les distinguer**. Ce qui change est la façon de lire les quatre octets — dixièmes de degré et température négative possible pour le DHT22, entiers seulement pour le DHT11. Choisir le mauvais modèle ne donne pas d'erreur, il donne des valeurs fausses.

La **vitesse** et le **format** d'une ligne UART non plus : deux vitesses voisines produisent les mêmes fronts et des octets différents, et un même signal lu en `8N1` ou en `7E1` ne donne pas les mêmes caractères. Des octets en charabia : c'est presque toujours la vitesse qu'il faut revoir en premier (elle se saisit dans les réglages de la **voie**, pas du décodage — deux lignes série d'un montage ne tournent pas forcément à la même allure).

### Ce que chaque décodage montre

- **UART** — chaque caractère sort avec sa valeur et, quand il est imprimable, le caractère lui-même : `0x48 'H'`. Un bit d'arrêt manquant est signalé `cadrage`, une parité fausse `parité` — l'octet reste affiché, à vous de juger.
- **1-Wire** — une seule ligne, aucune horloge : c'est la **durée du creux** qui porte le bit. Le décodeur repère le `RESET` et nomme les commandes courantes en clair (`SKIP ROM`, `CONVERT T`, `READ SCRATCHPAD`…), parce que `0x44` ne dit rien alors que `CONVERT T` dit tout. Il ne distingue pas qui parle du maître ou de l'esclave : sur le fil, c'est le même creux, et un appareil du commerce ne fait pas mieux avec une seule pince.
- **DHT11 / DHT22** — un seul fil lui aussi, mais **ce n'est pas du 1-Wire** : ici le bit est porté par la durée du palier **HAUT** (environ 28 µs pour un `0`, 70 µs pour un `1`), et il n'y a ni ROM ni commande. Vous voyez d'abord le `DÉPART` du microcontrôleur, puis le `PRÉSENT` du capteur qui accuse réception, puis les cinq octets, et enfin la mesure en clair : `56.7 %HR · 23.4 °C · somme ✓`. La **somme de contrôle** est recalculée et annoncée : un `SOMME ✗` désigne une liaison douteuse — fil trop long, résistance de tirage absente — bien mieux que cinq octets en hexadécimal ne le feraient. Une trame coupée en route est signalée telle quelle (`17/40 bits`) plutôt que complétée au hasard.

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
- Pour comprendre pourquoi un capteur DHT ne répond pas : une pince sur sa broche `DATA`, décodage `DHT11 / DHT22`. Un `DÉPART` seul, sans `PRÉSENT` derrière, et le capteur est muet — câblage ou alimentation. Un `SOMME ✗`, et il parle mais la liaison abîme ses octets.
- Pour attraper un événement rare : déclenchement sur son front, puis on zoome autour de l'instant 0.
- Créneau trop serré ou trop étalé : molette. La règle donne toujours l'échelle réelle (s, ms, µs, ns).

---

*Dessin de la pince réalisé par Frank pour Kablix.*
