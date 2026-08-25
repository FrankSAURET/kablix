# Phototransistor

![Phototransistor](../../img/composants/phototransistor.webp)

Phototransistor **nu**, à deux pattes, dans un boîtier transparent : il laisse passer d'autant plus de courant qu'il reçoit de lumière. Plus rapide et plus sensible qu'une [LDR](ldr.md), mais **polarisé** — le collecteur va vers le plus, l'émetteur vers le moins.

## Broches

| Broche | Rôle |
|--------|------|
| **c** | Collecteur — côté tension la plus haute |
| **e** | Émetteur — côté masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `eemax` | Éclairement maximal du curseur (mW/cm²) | 5 |
| `ron` | Résistance sous l'éclairement maximal (Ω) | 200 |
| `rdark` | Résistance dans le noir complet (Ω) | 10 000 000 |
| `ee` | Éclairement du point de repos (mW/cm²) | 1 |

## En simulation

Un **curseur de luminosité** apparaît sur le composant pendant la simulation : il va de l'obscurité totale à `eemax`. Le courant d'un phototransistor suit l'éclairement reçu ; vu comme une résistance, celle-ci varie donc à l'inverse :

```
R = ron x eemax / ee
```

bornée entre `ron` (plein éclairement) et `rdark` (noir complet). Avec les valeurs par défaut : 200 Ω à 5 mW/cm², 1 kΩ à 1 mW/cm², 10 MΩ dans le noir.

## Utilisation

- **Une résistance est obligatoire.** Seul, le phototransistor ne fait que laisser passer plus ou moins de courant : rien ne transforme ce courant en tension lisible.
- Montage habituel : `5V → résistance 10 kΩ → point milieu → c ... e → GND`, le point milieu vers une entrée analogique. La tension monte quand la lumière baisse.
- Montage inversé (`5V → c ... e → point milieu → résistance → GND`) : la tension monte quand la lumière monte.
- La tension lue par l'entrée analogique suit le pont diviseur réel du montage.

## Erreurs signalées

Kablix examine le montage au lancement de la simulation et marque le composant en défaut dans deux cas :

- **Pas de résistance en série** : une seule patte rejoint un rail d'alimentation, ou aucune. Il n'y a pas de pont diviseur, donc rien à mesurer.
- **Branché en travers de l'alimentation** : les deux pattes vont directement au plus et à la masse, sans rien entre les deux. En plein soleil, le montage court-circuiterait l'alimentation.

---

*Composant Kablix — modèle `R = ron x eemax / ee`, borné entre `ron` et `rdark`.*
