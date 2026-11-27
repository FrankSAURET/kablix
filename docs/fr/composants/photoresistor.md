# Photorésistance (LDR)

![Photorésistance (LDR)](../../img/composants/photoresistor.webp)

Capteur de lumière : sa résistance varie avec l'éclairement. Sortie analogique et numérique.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **GND** | Masse |
| **AO** | Sortie analogique (tension qui baisse quand la lumière augmente) |
| **DO** | Sortie numérique (LOW = seuil dépassé) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `sensitivity` | Seuil de détection (%) : DO passe à LOW quand la luminosité dépasse ce seuil | 50 |

## Utilisation

- AO vers une entrée analogique, lecture `analogRead()`.
- En simulation, régler la luminosité avec le curseur du composant.
- Sur le vrai module, le seuil se règle au potentiomètre.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
