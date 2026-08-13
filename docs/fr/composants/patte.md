# Patte de robot araignée

![Patte de robot araignée](../../img/composants/patte.webp)

Patte de robot articulée à **2 servomoteurs internes indépendants** : la **coxa**, qui balaie la patte **au sol** (avant/arrière), et la **patella**, qui la **lève et la baisse**. Les deux sont imbriqués mécaniquement — la patella suit la rotation de la coxa, comme sur une vraie patte. Pensée pour composer un robot hexapode ou araignée à plusieurs pattes, câblées sur les canaux d'un [pilote PWM PCA9685](pca9685.md).

La patte est dessinée **en volume** (vue isométrique) : c'est le seul moyen de montrer les deux mouvements, l'un dans le plan du sol et l'autre dans le plan vertical. L'**ombre portée** sous le pied donne la hauteur d'un coup d'œil.

> **Dessin provisoire.** Ce composant illustre une patte simplifiée le temps que le robot physique — une araignée en PMMA découpée au laser, assemblée par Frank dans SketchUp — soit visible. Le dessin sera probablement refait une fois le résultat observé.

Catégorie de la palette : **Système**.

## Broches

Chaque articulation a son propre bornier 3 fils, comme un servomoteur simple :

| Broche | Rôle |
|--------|------|
| **coxa.PWM** | Signal de commande de la coxa |
| **coxa.V+** | Alimentation (+) de la coxa |
| **coxa.GND** | Masse de la coxa |
| **patella.PWM** | Signal de commande de la patella |
| **patella.V+** | Alimentation (+) de la patella |
| **patella.GND** | Masse de la patella |

Les deux articulations sont électriquement **indépendantes** : rien n'empêche de piloter la coxa depuis une broche du microcontrôleur et la patella depuis un canal du PCA9685, par exemple.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `pulsemin` | Impulsion correspondant à 0° (µs), pour les deux articulations | `500` |
| `pulsemax` | Impulsion correspondant à 180° (µs), pour les deux articulations | `2500` |
| `speed` | Temps d'un tour complet (360°) à pleine vitesse (s), 0 = mouvement instantané | `2` |
| `revcoxa` | Servo de coxa monté **à l'envers** : la même consigne le fait tourner de l'autre côté | décoché |
| `revpatella` | Servo de patella monté **à l'envers** | décoché |

Les deux cases d'inversion sont un réglage de **montage**, pas de programme : selon le côté où le servo est vissé, la même consigne part dans l'autre sens. Cochez la case et la simulation applique **180 − angle** à cette articulation — le code, lui, continue d'envoyer « 30° ».

### Que dessine chaque angle

| Angle | Coxa (balayage au sol) | Patella (hauteur du pied) |
|-------|--------------------------|-------------------------|
| **0°** | Un quart de tour d'un côté | Patte **repliée**, pied relevé sous le corps |
| **90°** | Position de repos | Tibia **vertical** : le pied touche le sol, le robot est debout |
| **180°** | Un quart de tour de l'autre côté | Patte **tendue à l'horizontale**, ventre au sol |

## Utilisation

- Câblez `coxa.PWM` et `patella.PWM` chacune sur une broche PWM du microcontrôleur, ou sur un canal du PCA9685 (`coxa.V+`/`coxa.GND` et `patella.V+`/`patella.GND` sur le bornier servo correspondant).
- Bibliothèque `Servo` (Arduino) : un objet par articulation, `attach()` puis `write(angle)`.
- Pour une araignée à 4 pattes : placez 4 exemplaires du composant et câblez chacun sur 2 canaux du (ou des) PCA9685.

---

*Dessin PLACEHOLDER réalisé par Claude pour Kablix, en attendant le dessin définitif de Frank.*
