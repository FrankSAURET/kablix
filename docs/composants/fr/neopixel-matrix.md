# Matrice NeoPixel

![Matrice NeoPixel](../img/neopixel-matrix.png)

Matrice de LED RGB adressables (WS2812), pilotée par une seule broche de données.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **GND** | Masse |
| **DIN** | Données entrantes |
| **DOUT** | Données sortantes |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `rows` | Nombre de lignes | 8 |
| `cols` | Nombre de colonnes | 8 |

## Utilisation

- DIN vers une broche numérique.
- Indexation des pixels en serpentin selon le câblage.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-neopixel-matrix) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
