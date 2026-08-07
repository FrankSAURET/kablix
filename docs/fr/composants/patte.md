# Patte de robot araignée

![Patte de robot araignée](../../img/composants/patte.webp)

Patte de robot articulée à **2 servomoteurs internes indépendants** : la **hanche** (axe de rotation vertical) et le **genou** (axe de rotation horizontal), imbriqués mécaniquement — à l'affichage, le genou suit la rotation de la hanche, comme sur une vraie patte. Pensée pour composer un robot hexapode ou araignée à plusieurs pattes, câblées sur les canaux d'un [pilote PWM PCA9685](pca9685.md).

> **Dessin provisoire.** Ce composant illustre une patte simplifiée (vue de dessus) le temps que le robot physique — une araignée en PMMA découpée au laser, assemblée par Frank dans SketchUp — soit visible. Le dessin sera probablement refait une fois le résultat observé.

Catégorie de la palette : **Système**.

## Broches

Chaque articulation a son propre bornier 3 fils, comme un servomoteur simple :

| Broche | Rôle |
|--------|------|
| **hanche.PWM** | Signal de commande de la hanche |
| **hanche.V+** | Alimentation (+) de la hanche |
| **hanche.GND** | Masse de la hanche |
| **genou.PWM** | Signal de commande du genou |
| **genou.V+** | Alimentation (+) du genou |
| **genou.GND** | Masse du genou |

Les deux articulations sont électriquement **indépendantes** : rien n'empêche de piloter la hanche depuis une broche du microcontrôleur et le genou depuis un canal du PCA9685, par exemple.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `pulsemin` | Impulsion correspondant à 0° (µs), pour les deux articulations | `500` |
| `pulsemax` | Impulsion correspondant à 180° (µs), pour les deux articulations | `2500` |
| `speed` | Temps d'un tour complet (360°) à pleine vitesse (s), 0 = mouvement instantané | `2` |

90° = patte tendue (les deux segments alignés).

## Utilisation

- Câblez `hanche.PWM` et `genou.PWM` chacune sur une broche PWM du microcontrôleur, ou sur un canal du PCA9685 (`hanche.V+`/`hanche.GND` et `genou.V+`/`genou.GND` sur le bornier servo correspondant).
- Bibliothèque `Servo` (Arduino) : un objet par articulation, `attach()` puis `write(angle)`.
- Pour une araignée à 4 pattes : placez 4 exemplaires du composant et câblez chacun sur 2 canaux du (ou des) PCA9685.

---

*Dessin PLACEHOLDER réalisé par Claude pour Kablix, en attendant le dessin définitif de Frank.*
