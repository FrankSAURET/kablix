# Patte de robot araignée

![Patte de robot araignée](../../img/composants/patte.webp)

Patte de robot articulée à **2 servomoteurs internes indépendants** : la **coxa**, qui balaie la patte **au sol** (avant/arrière), et la **patella**, qui la **lève et la baisse**. Les deux sont imbriqués mécaniquement — la patella suit la rotation de la coxa, comme sur une vraie patte. Pensée pour composer un robot hexapode ou araignée à plusieurs pattes, câblées sur les canaux d'un [pilote PWM PCA9685](pca9685.md).

C'est **exactement la patte du [robot araignée](araignee.md)** : le fémur et le tibia sont les mêmes pièces, montées seules et vues **en volume** (vue isométrique) — le seul moyen de montrer les deux mouvements, l'un dans le plan du sol et l'autre dans le plan vertical. L'**ombre portée** sous le pied donne la hauteur d'un coup d'œil.

Catégorie de la palette : **Système**.

## Broches

À gauche du dessin, le **connecteur** porte deux borniers 3 fils, un par articulation — **Coxa** (violet) et **Patella** (vert) — comme sur un servomoteur simple. Les trois **carrés dorés** de chaque bornier sont les points de connexion ; leur nom n'est pas écrit sur le dessin, il apparaît dans la **bulle d'aide** au survol :

| Broche | Rôle |
|--------|------|
| **coxa.GND** | Masse de la coxa |
| **coxa.V+** | Alimentation (+) de la coxa |
| **coxa.PWM** | Signal de commande de la coxa |
| **patella.GND** | Masse de la patella |
| **patella.V+** | Alimentation (+) de la patella |
| **patella.PWM** | Signal de commande de la patella |

(dans l'ordre du dessin, de haut en bas)

Les deux articulations sont électriquement **indépendantes** : rien n'empêche de piloter la coxa depuis une broche du microcontrôleur et la patella depuis un canal du PCA9685, par exemple.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `pulsemin` | Impulsion correspondant à 0° (µs), pour les deux articulations | `500` |
| `pulsemax` | Impulsion correspondant à 180° (µs), pour les deux articulations | `2500` |
| `speed` | Temps d'un tour complet (360°) à pleine vitesse (s), 0 = mouvement instantané | `2` |
| `revcoxa` | Servo de coxa monté **à l'envers** : la même consigne le fait tourner de l'autre côté | décoché |
| `revpatella` | Servo de patella monté **à l'envers** | décoché |
| `zerocoxa` | Angle **dessiné** quand le programme envoie 0° à la coxa (−360 à +360°) | `0` |
| `zeropatella` | Idem pour la patella | `0` |

Les deux cases d'inversion sont un réglage de **montage**, pas de programme : selon le côté où le servo est vissé, la même consigne part dans l'autre sens. Cochez la case et la simulation applique **180 − angle** à cette articulation — le code, lui, continue d'envoyer « 30° ».

Les deux **zéros** sont l'autre moitié du même réglage : le palonnier se remonte sur des cannelures, il tombe rarement pile où on voudrait. `zerocoxa = 20` veut dire « quand le programme envoie 0°, la patte pointe déjà à 20° ». Le décalage s'ajoute **après** l'inversion : les deux se cumulent, l'un donne le sens, l'autre l'origine.

### Que dessine chaque angle

| Angle | Coxa (balayage au sol) | Patella (hauteur du pied) |
|-------|--------------------------|-------------------------|
| **0°** | Un quart de tour d'un côté | Patte **repliée**, pied relevé sous le corps |
| **90°** | Position de repos | Tibia **vertical** : le pied touche le sol, le robot est debout |
| **180°** | Un quart de tour de l'autre côté | Patte **tendue à l'horizontale**, ventre au sol |

## Utilisation

- Câblez `coxa.PWM` et `patella.PWM` chacune sur une broche PWM du microcontrôleur, ou sur un canal du PCA9685 (`coxa.V+`/`coxa.GND` et `patella.V+`/`patella.GND` sur le bornier servo correspondant).
- Bibliothèque `Servo` (Arduino) : un objet par articulation, `attach()` puis `write(angle)`.
- Pour une araignée à 4 pattes : placez 4 exemplaires du composant et câblez chacun sur 2 canaux du (ou des) PCA9685. Le robot complet existe aussi tout monté : voir [robot araignée](araignee.md).

Tests d'exemple : `patte-uno` et `patte-pico` (dossier `testkablix`).

---

*Patte et connecteur dessinés par Frank (planches `Composants3D.svg` et `Composants2D.svg`), mis en volume par Kablix.*
