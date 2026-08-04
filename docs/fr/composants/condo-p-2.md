# Condensateur chimique (électrolytique)

![Condensateur chimique (électrolytique)](../../img/composants/condo-p-2.webp)

Condensateur électrochimique aluminium, **polarisé**. Les fortes capacités du lot : charge et décharge exponentielles, terminées à 5·R·C.

## Broches

| Broche | Rôle |
|--------|------|
| **+** | Borne positive (broche `2`) |
| **−** | Borne négative (broche `1`), repérée par la bande claire du corps |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `ctype` | Type : non polarisé / polarisé / chimique | chimique |
| `value` | Valeur nominale en farads (suffixes `m`, `µ`, `n`, `p` acceptés) | 100µ |
| `vmax` | Tension maximale admissible (V) | 16 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Utilisation

- Posez le **Condensateur** de la bibliothèque puis mettez `ctype` sur « chimique » : le chimique n'a pas d'entrée à lui dans la palette.
- Respectez la polarité : la bande claire du corps marque le **−**. À l'envers, un vrai condensateur chimique gonfle puis explose.
- Filtrage d'alimentation : 100 µF à 1000 µF en sortie de régulateur.
- Constante de temps longue : avec 10 kΩ, 100 µF donne τ = 1 s, soit 5 s pour la charge complète — bien visible dans le traceur de courbes.

---

*Composant maison Kablix — dessin de Frank Sauret.*
