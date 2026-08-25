# Photodiode

![Photodiode](../../img/composants/photodiode.webp)

Photodiode **nue**, à deux pattes, dans un boîtier transparent : elle laisse passer un courant proportionnel à la lumière reçue. Même principe que le [phototransistor](phototransistor.md), mais **sans son amplification** : à éclairement égal, une photodiode laisse passer environ cent fois moins de courant. En échange elle est plus rapide et plus fidèle.

Elle travaille **en inverse** : la cathode va vers le plus, l'anode vers le moins.

## Broches

| Broche | Rôle |
|--------|------|
| **K** | Cathode — côté tension la plus haute |
| **A** | Anode — côté masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `eemax` | Éclairement maximal du curseur (mW/cm²) | 5 |
| `ron` | Résistance sous l'éclairement maximal (Ω) | 20 000 |
| `rdark` | Résistance dans le noir complet (Ω) | 100 000 000 |
| `ee` | Éclairement du point de repos (mW/cm²) | 1 |

## En simulation

Un **curseur de luminosité** apparaît sur le composant pendant la simulation : il va de l'obscurité totale à `eemax`. Le courant suit l'éclairement reçu ; vue comme une résistance, celle-ci varie donc à l'inverse :

```
R = ron x eemax / ee
```

bornée entre `ron` (plein éclairement) et `rdark` (noir complet). Avec les valeurs par défaut : 20 kΩ à 5 mW/cm², 100 kΩ à 1 mW/cm², 100 MΩ dans le noir.

## Utilisation

- **Une résistance est obligatoire.** Seule, la photodiode ne fait que laisser passer plus ou moins de courant : rien ne transforme ce courant en tension lisible.
- Montage habituel : `5V → K ... A → point milieu → résistance 100 kΩ → GND`, le point milieu vers une entrée analogique. La tension monte quand la lumière monte.
- Montage inversé (`5V → résistance → point milieu → K ... A → GND`) : la tension monte quand la lumière baisse.
- La résistance de charge est **grande** (100 kΩ typique) : le courant est faible, il faut une forte résistance pour en tirer une tension.
- Attention au sens : cathode vers le plus. À l'envers, la diode conduit tout le temps et la lumière ne change plus rien.

## Erreurs signalées

Kablix examine le montage au lancement de la simulation et marque le composant en défaut dans deux cas :

- **Pas de résistance en série** : une seule patte rejoint un rail d'alimentation, ou aucune. Il n'y a pas de pont diviseur, donc rien à mesurer.
- **Branchée en travers de l'alimentation** : les deux pattes vont directement au plus et à la masse, sans rien entre les deux.

---

*Composant Kablix — modèle `R = ron x eemax / ee`, borné entre `ron` et `rdark`.*
