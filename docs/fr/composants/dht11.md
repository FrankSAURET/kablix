# Capteur température/humidité DHT11

![Capteur température/humidité DHT11](../../img/composants/dht11.webp)

Capteur numérique 1-wire de température et d'humidité, le petit frère bleu du DHT22 : moins précis et de plage plus étroite, mais même protocole et même câblage.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **DATA** | Données (1-wire) |
| **NC** | Non connecté |
| **GND** | Masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `temperature` | Température (°C) | 22 |
| `humidity` | Humidité (%) | 50 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Utilisation

- DATA vers une broche numérique (pull-up 10 kΩ).
- Bibliothèque DHT : une lecture toutes les ~2 s. Sollicité plus vite, il renvoie sa **valeur en cache**, exactement comme un vrai capteur.
- En simulation, deux curseurs règlent la température et l'humidité **pendant** que le programme tourne : la lecture suivante renvoie la nouvelle valeur.
- Limites du DHT11, respectées par la simulation : température de 0 à +50 ℃, humidité de 20 à 90 %HR, le tout en **nombres entiers** (le DHT11 ne code pas les dixièmes ni les négatives). Un réglage hors plage est ramené aux bornes du capteur. Sur un vrai composant, ajoutez ±2,0 ℃ et ±5,0 %HR d'incertitude.
- Besoin de plus de précision, de températures négatives ou d'humidités extrêmes ? Prenez le [DHT22](dht22.md).

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-dht22) — © Wokwi. Composants `@wokwi/elements` (licence MIT). Dessin du boîtier : Frank Sauret.*
