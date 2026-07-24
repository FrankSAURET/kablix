# Résistance

![Résistance](../img/resistor.png)

Résistance fixe. Limite le courant (LED) ou forme un pont diviseur / pull-up / pull-down.

## Broches

| Broche | Rôle |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (non polarisé) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `value` | Valeur en ohms | 220 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Utilisation

- Non polarisée : les deux bornes sont équivalentes.
- LED : 220 Ω–1 kΩ. Pull-up/pull-down : 10 kΩ typique.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-resistor) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
