# Robot araignée

![Robot araignée](../../img/composants/araignee.webp)

Robot **quadrupède complet** : un châssis et **4 pattes à 2 articulations** (hanche et genou), soit **8 servomoteurs**. Toute l'électronique est **embarquée dans le corps** — un [pilote PWM PCA9685](pca9685.md), la carte microcontrôleur et la batterie : les 8 servos sont câblés à l'intérieur, ils n'apparaissent pas sur la planche.

Sur la planche, l'araignée n'a donc que **4 fils** : le bus I²C. Tout le mouvement passe par lui.

> **Dessin provisoire.** Ce composant illustre une araignée simplifiée (vue de dessus) le temps que le robot physique — une araignée en PMMA découpée au laser, assemblée par Frank dans SketchUp — soit visible. Le dessin sera probablement refait une fois le résultat observé.

Catégorie de la palette : **Système**.

## Broches

| Broche | Rôle |
|--------|------|
| **SCL** | Horloge du bus I²C |
| **SDA** | Données du bus I²C |
| **V+** | Alimentation (+) de l'électronique de commande |
| **GND** | Masse commune |

Les servos sont alimentés par la **batterie embarquée** : `V+`/`GND` ne servent qu'à la logique et à la masse commune du bus.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `address` | Adresse I²C du PCA9685 embarqué (`0x40` … `0x47`) | `0x40` |
| `speed` | Temps d'un tour complet (360°) à pleine vitesse (s), 0 = mouvement instantané | `2` |
| `boards` | Montrer l'électronique embarquée (Pico, PCA9685, batterie) | décoché |

90° = patte tendue (les deux segments alignés), comme sur la [patte seule](patte.md).

## Canaux PWM

Le câblage interne est fixe : chaque articulation a son canal sur le PCA9685 embarqué.

| Canal | Articulation |
|-------|--------------|
| 0 / 1 | Hanche / genou **avant-gauche** |
| 2 / 3 | Hanche / genou **avant-droite** |
| 4 / 5 | Hanche / genou **arrière-gauche** |
| 6 / 7 | Hanche / genou **arrière-droite** |

Les pattes de droite sont montées **en miroir** de celles de gauche, comme sur le robot : le même angle de genou plie les deux côtés symétriquement.

## Utilisation

- Câblez `SDA`/`SCL` sur le bus I²C de la carte (A4/A5 sur Uno, GP0/GP1 sur Pico), plus `V+` et `GND`.
- Pilotez les canaux comme ceux d'un PCA9685 posé sur la planche : réglez le prescaler à 50 Hz, puis écrivez l'impulsion voulue (500 µs = 0°, 1500 µs = 90°, 2500 µs = 180°).
- Pour n'animer qu'une patte, il suffit d'écrire ses deux canaux : un canal jamais écrit laisse son articulation immobile.
- Cochez **Montrer l'électronique embarquée** pour voir les cartes dans le corps (utile pour expliquer le montage, inutile pour la simulation).

Tests d'exemple : `araignee-uno` et `araignee-pico` (dossier `testkablix`).

---

*Dessin PLACEHOLDER réalisé par Claude pour Kablix, en attendant le dessin définitif de Frank.*
