# Condensateur polarisé (tantale)

![Condensateur polarisé (tantale)](../../img/composants/condo-p-1.webp)

Condensateur tantale goutte, **polarisé**. Même comportement RC que le modèle non polarisé — charge et décharge exponentielles, terminées à 5·R·C — mais il ne supporte pas d'être branché à l'envers.

## Broches

| Broche | Rôle |
|--------|------|
| **+** | Borne positive (broche `2`) |
| **−** | Borne négative (broche `1`), vers la masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `ctype` | Type : non polarisé / polarisé / chimique | polarisé |
| `value` | Valeur nominale en farads (suffixes `m`, `µ`, `n`, `p` acceptés) | 10µ |
| `vmax` | Tension maximale admissible (V) | 16 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Utilisation

- Posez le **Condensateur** de la bibliothèque puis mettez `ctype` sur « polarisé » : le tantale n'a pas d'entrée à lui dans la palette.
- Respectez la polarité : **+** au potentiel le plus haut, **−** à la masse.
- La valeur saisie est inscrite sur le corps du composant.
- Réservoir d'énergie près d'une charge qui appelle des pointes de courant (servo, moteur), en complément d'un 100 nF de découplage.
- Le tantale tient mal la surtension : gardez une bonne marge sur `vmax`.

---

*Composant maison Kablix — dessin de Frank Sauret.*
