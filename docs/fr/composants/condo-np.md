# Condensateur non polarisé

![Condensateur non polarisé](../../img/composants/condo-np.webp)

Condensateur film plastique, sans polarité. En série avec une résistance, il forme un circuit RC : la tension à ses bornes monte et descend exponentiellement, pleine charge (ou décharge complète) au bout de 5·R·C.

## Broches

| Broche | Rôle |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (non polarisé : les deux sont équivalentes) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `ctype` | Type : non polarisé / polarisé / chimique | non polarisé |
| `value` | Valeur nominale en farads (suffixes `m`, `µ`, `n`, `p` acceptés) | 100n |
| `vmax` | Tension maximale admissible (V) | 400 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Utilisation

- La valeur saisie est **inscrite sur le corps** du composant (`10µ`, `100n`…).
- Découplage d'alimentation : 100 nF au plus près de la broche VCC du circuit.
- Mesure RC : chargez par une broche mise à `HIGH` à travers une résistance, lisez la montée sur une entrée analogique. τ = R·C, et 5τ = pleine charge.
- Fonctionne aussi sur une entrée à **pull-up interne** (Arduino ou Pico) : le pull-up (65 kΩ dans Kablix ; la doc RP2040 annonce 50 à 80 kΩ) tient lieu de résistance de charge, aucune résistance externe n'est nécessaire. Sur le Pico, le **pull-down** interne décharge le condensateur de la même façon.
- La bibliothèque ne propose qu'un seul **Condensateur** : le type (film, tantale, chimique) se choisit dans la propriété `ctype`.
- Changer `ctype` ne renomme pas les broches : les fils déjà tracés restent en place.
- Le **traceur de courbes** montre l'exponentielle **sans une ligne de code** : toute tension posée sur une entrée analogique y est tracée par une sonde interne, sous le nom du canal et de la broche (`ADC0 (A0)`, `ADC0 (GP26)`…). Mettez plusieurs branches RC en parallèle sur la même broche de commande et leurs courbes se comparent sur le même graphe.

---

*Composant maison Kablix — dessin de Frank Sauret.*
