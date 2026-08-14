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
| `pulsemin` | Impulsion correspondant à 0° (µs), pour les huit servos | `500` |
| `pulsemax` | Impulsion correspondant à 180° (µs), pour les huit servos | `2500` |
| `speed` | Temps d'un tour complet (360°) à pleine vitesse (s), 0 = mouvement instantané | `2` |
| `revcoxa0` … `revpatella3` | Servo monté **à l'envers** : la même consigne le fait tourner de l'autre côté | décoché |
| `zerocoxa0` … `zeropatella3` | Angle **dessiné** quand le programme envoie 0° à ce servo (−360 à +360°) | `0` |

L'adresse du PCA9685 embarqué se règle **comme sur la vraie carte**, en cochant les six pads **AD0 à AD5** ; elle s'affiche sous les cases. Tous cochés — le réglage d'usine du module Grove — donnent **0x7F**, l'adresse par défaut du robot. Le détail du calcul est dans la [fiche du PCA9685](pca9685.md).

Les huit articulations obéissent aux mêmes angles que la [patte seule](patte.md) : coxa 90° = repos (la patte part vers l'extérieur, dans l'axe de son coin de châssis), patella 90° = **tibia vertical, robot debout, les quatre pieds au sol**. 180° tend la patte dans le prolongement du fémur, 0° la replie de l'autre côté.

### L'impulsion des servos

Les huit servos sont les mêmes, donc **une seule échelle** pour les huit : `pulsemin` est l'impulsion qui vaut 0°, `pulsemax` celle qui vaut 180°, et tout ce qui est entre les deux s'interpole. Les valeurs par défaut sont celles des servos du robot (**500 – 2500 µs**, datasheet SG90) ; la bibliothèque `Servo` d'Arduino, elle, part de 544 – 2400 µs.

C'est ce réglage qui fait tomber juste les angles **intermédiaires**. Une échelle fausse ne se voit pas aux extrêmes — 1500 µs vaut 90° dans à peu près toutes les échelles, et les butées rattrapent les bouts — mais une consigne de 130° arrive alors 40° plus loin, et le robot ne prend pas la pose que le programme demande.

### Lire la hauteur d'un pied

Le robot est vu **de biais**. Deux pieds à la même hauteur réelle n'apparaissent donc **pas** à la même hauteur à l'écran : celui qui est plus loin est dessiné plus haut, c'est ce qui donne la profondeur. À angles de patella égaux, les quatre pointes sont pourtant rigoureusement au même niveau.

Le repère qui ne trompe pas est l'**ombre** : elle tombe à la verticale sous le pied, et l'écart entre le pied et son ombre est exactement sa hauteur. Pieds au sol, l'ombre les touche ; pattes levées, elle s'écarte et pâlit d'autant.

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
- L'électronique embarquée (Pico W, PCA9685, batterie) est **toujours dessinée** : le châssis de PMMA translucide la laisse voir, comme sur le vrai robot.
- Deux **yeux rouges** sont posés sur le nez : c'est le repère qui dit d'un coup d'œil **où est l'avant** du robot — utile dès qu'une patte se lève et qu'on cherche laquelle est l'avant-gauche.

Test d'exemple : `araignee-pico` (dossier `testkablix`). Pas de test Arduino : le robot est une Pico W, il ne se programme pas depuis une Uno.

---

*Robot dessiné par Frank (planche `Composants3D.svg`) et mis en volume par Kablix.*
