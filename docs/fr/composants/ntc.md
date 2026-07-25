# Thermistance NTC

![Thermistance NTC](../../img/composants/ntc.webp)

Thermistance à coefficient **négatif** : sa résistance **baisse** quand la
température monte. Composant nu à deux pattes, à câbler soi-même en pont
diviseur. Variante à coefficient positif : la [PTC](ptc.md).

## Broches

| Broche | Rôle |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (non polarisé) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `r25` | Résistance à 25 °C (Ω) | 10 000 |
| `beta` | Coefficient Beta (K) | 3950 |
| `tmin` | Température mini du curseur (°C) | -55 |
| `tmax` | Température maxi du curseur (°C) | 125 |

## En simulation

Un **curseur de température** apparaît sur le composant pendant la simulation,
borné par `tmin` et `tmax`. La résistance suit la loi Beta :

```
R = r25 x exp( beta x (1/(T+273,15) - 1/298,15) )
```

Avec les valeurs par défaut : 10 kΩ à 25 °C, ~34 kΩ à 0 °C, ~3,6 kΩ à 50 °C.

## Utilisation

- Monter la NTC en **pont diviseur** avec une résistance fixe de même ordre de
  grandeur que `r25` (10 kΩ pour une NTC 10 kΩ), le point milieu vers une entrée
  analogique.
- `beta` se lit dans la fiche technique de la thermistance (3380, 3950, 4050…).
- Composant non polarisé : les deux pattes sont équivalentes.

---

*Composant Kablix — modèle Beta `R = r25 x exp(beta x (1/T - 1/T25))`.*
