# Capteur de gaz (MQ)

![Capteur de gaz (MQ)](../../img/composants/gas-sensor.webp)

Capteur de gaz/fumée série MQ. Sorties analogique (concentration) et numérique (seuil).

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **GND** | Masse |
| **AOUT** | Sortie analogique (tension qui baisse quand le gaz augmente) |
| **DOUT** | Sortie numérique (LOW = seuil dépassé) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `sensitivity` | Seuil de détection (%) : DOUT passe à LOW quand le niveau de gaz dépasse ce seuil | 50 |

## Utilisation

- AOUT vers une entrée analogique, DOUT vers une numérique.
- En simulation, régler le niveau de gaz avec le curseur du composant.
- Préchauffage nécessaire sur le vrai capteur.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-gas-sensor) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
