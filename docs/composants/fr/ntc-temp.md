# Capteur de température NTC

![Capteur de température NTC](../img/ntc-temp.png)

Thermistance NTC : résistance fonction de la température. Sortie analogique.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **OUT** | Sortie analogique |
| **GND** | Masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `value` | Température simulée (%) | 50 |

## Utilisation

- OUT vers une entrée analogique.
- Convertir la valeur ADC en °C selon l'équation de Steinhart-Hart.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-ntc-temperature-sensor) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
