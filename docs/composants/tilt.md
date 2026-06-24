# Capteur d'inclinaison

![Capteur d'inclinaison](img/tilt.png)

Interrupteur à bille : se ferme/ouvre selon l'inclinaison.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **OUT** | Sortie numérique |
| **GND** | Masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `state` | Incliné (0/1) | 0 |

## Utilisation

- OUT vers une entrée numérique (souvent `INPUT_PULLUP`).
- Basculer l'état dans l'inspecteur.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-tilt-switch) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
