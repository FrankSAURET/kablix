# Robot araignée

![Robot araignée](../../img/composants/araignee.webp)

Robot **quadrupède complet** : un châssis et **4 pattes à 2 articulations** (coxa et patella), soit **8 servomoteurs**. Toute l'électronique est **embarquée dans le corps** — une carte **Pico W**, un [pilote PWM PCA9685](pca9685.md) et la batterie : les 8 servos sont câblés à l'intérieur, ils n'apparaissent pas sur la planche.

**Le robot n'a aucune broche : rien ne se câble.** Il *est* la carte. Le déposer sur la planche choisit la **Pico W** comme carte cible, et le programme que vous écrivez tourne dedans, exactement comme sur une Pico W posée seule. La carte est dessinée sur le dos du châssis — c'est le repère qui dit où va le code.

Le robot est dessiné **en volume** (vue isométrique) : les coxas balaient le sol, les patellas lèvent les pattes.

> C'est presque le **vrai robot** qui est représenté : ses pièces sont celles du PMMA découpé au laser — corps en sandwich, fémur et tibia de chaque patte, servos et cartes à leur place. Longueurs, écartement des coxas, hauteur du corps et débattement viennent tous du dessin ; le composant n'en fixe aucun. Redessiner une pièce change donc le robot à l'écran, sans toucher au code.

Catégorie de la palette : **Système**.

## Broches

**Aucune.** Le bus I²C, l'alimentation et les 8 servos sont internes au robot : il n'y a rien à relier à l'extérieur.

## Propriétés

| Propriété                    | Rôle                                                                          | Défaut      |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------- |
| `ad0` … `ad5`                | État des six pads d'adresse du PCA9685 embarqué (coché = pad **haut**)        | tous cochés |
| `pulsemin`                   | Impulsion correspondant à 0° (µs), pour les huit servos                       | `500`       |
| `pulsemax`                   | Impulsion correspondant à 180° (µs), pour les huit servos                     | `2500`      |
| `speed`                      | Temps d'un tour complet (360°) à pleine vitesse (s), 0 = mouvement instantané | `2`         |
| `chcoxa0` … `chpatella3`     | Canal du PCA9685 sur lequel ce servo est **branché** (0 à 15)                 | **vide**    |
| `revcoxa0` … `revpatella3`   | Servo monté **à l'envers** : la même consigne le fait tourner de l'autre côté | décoché     |
| `zerocoxa0` … `zeropatella3` | Angle **dessiné** quand le programme envoie 0° à ce servo (−360 à +360°)      | `0`         |

### Trente-trois réglages en cinq tiroirs

Le robot en a plus qu'aucun autre composant : ils sont donc rangés en **cinq sections repliables**, **toutes fermées** à la sélection.

| Section                                 | Ce qu'on y règle                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paramétrer la carte 16 servomoteurs** | Les six pads d'adresse du PCA9685 embarqué                                                                                                           |
| **Câbler les servomoteurs**             | La sortie du PCA9685 où chacun des huit servos est branché — à remplir, il n'y a pas de câblage supposé                                              |
| **Inverser les servomoteurs**           | Les huit cases de sens de montage. Il est important que le sens de déplacement soit le même que sur la maquette réels pour que le code soit portable |
| **Régler le 0 des servomoteurs**        | Les huit calages de palonnier. Idem.                                                                                                                 |
| **Paramètres des servomoteurs**         | Impulsions à 0° et 180°, temps de rotation                                                                                                           |

Au-dessus des sections, hors tiroir, l'**adresse I²C** calculée : c'est le rappel qu'on vient chercher le plus souvent, il ne se mérite pas.

L'adresse du PCA9685 embarqué se règle **comme sur la vraie carte**, en cochant les six pads **AD0 à AD5**. Tous cochés — le réglage d'usine du module Grove — donnent **0x7F**, l'adresse par défaut du robot. Le détail du calcul est dans la [fiche du PCA9685](pca9685.md).

Les huit articulations obéissent aux mêmes angles que la [patte seule](patte.md) : coxa 90° = repos (la patte part vers l'extérieur, dans l'axe de son coin de châssis), patella 90° = **tibia vertical, robot debout, les quatre pieds au sol**. 180° tend la patte dans le prolongement du fémur, 0° la replie de l'autre côté.

### L'impulsion des servos

Les huit servos sont les mêmes, donc **une seule échelle** pour les huit : `pulsemin` est l'impulsion qui vaut 0°, `pulsemax` celle qui vaut 180°. Les valeurs par défaut sont celles des servos du robot (**500 – 2500 µs**, datasheet SF90) .

C'est ce réglage qui fait tomber juste les angles **intermédiaires**. Une échelle fausse ne se voit pas aux extrêmes — 1500 µs vaut 90° dans à peu près toutes les échelles, et les butées rattrapent les bouts — mais une consigne de 130° risque d'être fausse, et le robot ne prend pas la pose que le programme demande.

### Servos montés à l'envers

Sur le châssis réel, les huit servos ne sont pas tous vissés du même côté : à consigne égale, certains partent dans l'autre sens. Cochez la case de l'articulation concernée (`revcoxa0` = coxa avant-gauche, `revpatella3` = patella arrière-droite…) et la simulation applique **180 − angle** à ce servo-là.

C'est un réglage de **montage**, pas de programme : le code continue d'envoyer « 30° », c'est la mécanique qui décide de quel côté ça part.

> Indispensable pour retrouver dans la simulation le comportement d'un robot déjà assemblé, sans réécrire son programme.

### Le zéro de chaque servo

Même histoire pour l'**origine**. Sur la maquette réelle sur huit servos, aucun n'est calé exactement comme son voisin, et le robot se retrouve de travers alors que le programme envoie les mêmes angles partout.

Un tour complet est admis de chaque côté (**−360 à +360°**, au degré). Le décalage s'applique **après** l'inversion : la case à cocher donne le sens, le zéro donne l'origine, et les deux se cumulent sur la même articulation. Là encore, rien ne change dans le programme — c'est le châssis qu'on décrit.

## Canaux PWM

Chaque articulation dit sur **quelle sortie du PCA9685 embarqué** son servo est branché. Les huit cases sont **vides à la pose** : rien n'est supposé, c'est vous qui décrivez votre câblage.

| Articulation                      | Propriétés               |
| --------------------------------- | ------------------------ |
| Coxa / patella **avant-gauche**   | `chcoxa0` / `chpatella0` |
| Coxa / patella **avant-droite**   | `chcoxa1` / `chpatella1` |
| Coxa / patella **arrière-gauche** | `chcoxa2` / `chpatella2` |
| Coxa / patella **arrière-droite** | `chcoxa3` / `chpatella3` |

### Une petite case par servo, de 0 à 15

Le tiroir **Câbler les servomoteurs** aligne huit **petites cases de deux caractères** — ni molette, ni boutons **+** / **−** : un numéro de sortie ne se cherche pas en tâtonnant, on le lit sur la carte et on l'écrit.

> La valeur va de **0 à 15**, ce qui correspond au marquage **1 à 16** sur la carte : la sortie marquée **1** est le canal **0**.

**Un canal ne peut servir deux fois.** Un numéro déjà pris par une autre articulation est refusé à la frappe — la case clignote en rouge et revient à sa valeur précédente. Même chose au-dessus de 15.

Au **lancement de la simulation**, les cases restées vides sont signalées : message dans la barre d'état, cadre rouge sur le robot. La simulation démarre quand même — les articulations câblées bougent, celles laissées vides restent immobiles.

C'est le troisième réglage de **montage**, avec le sens et le zéro : le programme, lui, ne change pas. Écrivez le canal 0 dans votre code, et c'est l'articulation qui a `0` dans ses propriétés qui bouge, quelle qu'elle soit.

Les pattes de droite sont montées **en miroir** de celles de gauche, comme sur le robot : le même angle de patella plie les deux côtés symétriquement.

## Utilisation

- Déposez le robot **seul** sur la planche : la carte passe automatiquement en **Pico W**, il n'y a rien à câbler.
- Ouvrez un bus I²C dans votre programme (`I2C(0, sda=Pin(0), scl=Pin(1))`) : c'est le bus **interne** du robot, il rejoint le PCA9685 embarqué quels que soient les numéros de broches choisis.
- Pilotez les canaux comme ceux d'un PCA9685 posé sur la planche : réglez le prescaler à 50 Hz, puis écrivez l'impulsion voulue (500 µs = 0°, 1500 µs = 90°, 2500 µs = 180°).
- Pour n'animer qu'une patte, il suffit d'écrire ses deux canaux : un canal jamais écrit laisse son articulation immobile.

Test d'exemple : `araignee-pico` (dossier `testkablix`).

---

*Robot dessiné par Frank SAURET (planche *`Composants3D.svg`*) et mis en volume par Kablix.*
