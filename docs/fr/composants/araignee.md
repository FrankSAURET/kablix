# Robot araignée

![Robot araignée](../../img/composants/araignee.webp)

Robot **quadrupède complet** : un châssis et **4 pattes à 2 articulations** (coxa et patella), soit **8 servomoteurs**. Toute l'électronique est **embarquée dans le corps** — une carte **Pico W**, un [pilote PWM PCA9685](pca9685.md) et la batterie : les 8 servos sont câblés à l'intérieur, ils n'apparaissent pas sur la planche.

**Le robot n'a aucune broche : rien ne se câble.** Il *est* la carte. Le déposer sur la planche choisit la **Pico W** comme carte cible, et le programme que vous écrivez tourne dedans, exactement comme sur une Pico W posée seule. La carte est dessinée sur le dos du châssis — c'est le repère qui dit où va le code.

Le robot est dessiné **en volume** (vue isométrique) : les coxas balaient le sol, les patellas lèvent les pattes, et l'**ombre portée** sous chaque pied dit lesquelles touchent terre. Une patte arrière passe bien derrière le châssis, une patte avant devant.

C'est le **vrai robot** qui est représenté : ses pièces sont celles du PMMA découpé au laser — corps en sandwich, fémur et tibia de chaque patte, servos et cartes à leur place. Longueurs, écartement des coxas, hauteur du corps et débattement viennent tous du dessin ; le composant n'en fixe aucun. Redessiner une pièce change donc le robot à l'écran, sans toucher au code.

Catégorie de la palette : **Système**.

## Broches

**Aucune.** Le bus I²C, l'alimentation et les 8 servos sont internes au robot : il n'y a rien à relier à l'extérieur. Un schéma plus ancien qui câblait son ancien bornier I²C perd ces fils à l'ouverture — ils ne mènent plus nulle part.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `ad0` … `ad5` | État des six pads d'adresse du PCA9685 embarqué (coché = pad **haut**) | tous cochés |
| `speed` | Temps d'un tour complet (360°) à pleine vitesse (s), 0 = mouvement instantané | `2` |
| `boards` | Montrer l'électronique embarquée (PCA9685, batterie) | décoché |
| `revcoxa0` … `revpatella3` | Servo monté **à l'envers** : la même consigne le fait tourner de l'autre côté | décoché |
| `zerocoxa0` … `zeropatella3` | Angle **dessiné** quand le programme envoie 0° à ce servo (−360 à +360°) | `0` |

L'adresse du PCA9685 embarqué se règle **comme sur la vraie carte**, en cochant les six pads **AD0 à AD5** ; elle s'affiche sous les cases. Tous cochés — le réglage d'usine du module Grove — donnent **0x7F**, l'adresse par défaut du robot. Le détail du calcul est dans la [fiche du PCA9685](pca9685.md).

Les huit articulations obéissent aux mêmes angles que la [patte seule](patte.md) : coxa 90° = repos (la patte part vers l'extérieur, dans l'axe de son coin de châssis), patella 90° = **tibia vertical, robot debout, les quatre pieds au sol**. 180° tend la patte dans le prolongement du fémur, 0° la replie de l'autre côté.

### Servos montés à l'envers

Sur le châssis réel, les huit servos ne sont pas tous vissés du même côté : à consigne égale, certains partent dans l'autre sens. Cochez la case de l'articulation concernée (`revcoxa0` = coxa avant-gauche, `revpatella3` = patella arrière-droite…) et la simulation applique **180 − angle** à ce servo-là.

C'est un réglage de **montage**, pas de programme : le code continue d'envoyer « 30° », c'est la mécanique qui décide de quel côté ça part. Utile pour retrouver dans la simulation le comportement d'un robot déjà assemblé, sans réécrire son programme.

### Le zéro de chaque servo

Même histoire pour l'**origine**. Le palonnier se remonte cannelure par cannelure : sur huit servos, aucun n'est calé exactement comme son voisin, et le robot se retrouve de travers alors que le programme envoie les mêmes angles partout. `zerocoxa0 = 20` dit « quand le programme envoie 0° à la coxa avant-gauche, elle pointe déjà à 20° ».

Un tour complet est admis de chaque côté (**−360 à +360°**, au degré). Le décalage s'applique **après** l'inversion : la case donne le sens, le zéro donne l'origine, et les deux se cumulent sur la même articulation. Là encore, rien ne change dans le programme — c'est le châssis qu'on décrit.

## Canaux PWM

Le câblage interne est fixe : chaque articulation a son canal sur le PCA9685 embarqué.

| Canal | Articulation |
|-------|--------------|
| 0 / 1 | Coxa / patella **avant-gauche** |
| 2 / 3 | Coxa / patella **avant-droite** |
| 4 / 5 | Coxa / patella **arrière-gauche** |
| 6 / 7 | Coxa / patella **arrière-droite** |

Les pattes de droite sont montées **en miroir** de celles de gauche, comme sur le robot : le même angle de patella plie les deux côtés symétriquement.

## Utilisation

- Déposez le robot **seul** sur la planche : la carte passe automatiquement en **Pico W**, il n'y a rien à câbler.
- Ouvrez un bus I²C dans votre programme (`I2C(0, sda=Pin(0), scl=Pin(1))`) : c'est le bus **interne** du robot, il rejoint le PCA9685 embarqué quels que soient les numéros de broches choisis.
- Pilotez les canaux comme ceux d'un PCA9685 posé sur la planche : réglez le prescaler à 50 Hz, puis écrivez l'impulsion voulue (500 µs = 0°, 1500 µs = 90°, 2500 µs = 180°).
- Pour n'animer qu'une patte, il suffit d'écrire ses deux canaux : un canal jamais écrit laisse son articulation immobile.
- Cochez **Montrer l'électronique embarquée** pour voir le PCA9685 et la batterie dans le corps (utile pour expliquer le montage, inutile pour la simulation).

Test d'exemple : `araignee-pico` (dossier `testkablix`). Pas de test Arduino : le robot est une Pico W, il ne se programme pas depuis une Uno.

---

*Robot dessiné par Frank (planche `Composants3D.svg`) et mis en volume par Kablix.*
