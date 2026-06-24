# Capteur température/humidité DHT22

![Capteur température/humidité DHT22](img/dht22.png)

Capteur numérique 1-wire de température et d'humidité.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **SDA** | Données (1-wire) |
| **NC** | Non connecté |
| **GND** | Masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `temperature` | Température (°C) | 22 |
| `humidity` | Humidité (%) | 50 |

## Utilisation

- SDA vers une broche numérique (pull-up 10 kΩ).
- Bibliothèque DHT : une lecture toutes les ~2 s.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-dht22) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
