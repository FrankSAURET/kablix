# Servomoteur

![Servomoteur](img/servo.png)

Servomoteur positionnel commandé par un signal PWM (angle 0–180°).

## Broches

| Broche | Rôle |
|--------|------|
| **PWM** | Signal de commande |
| **V+** | Alimentation (+) |
| **GND** | Masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `horn` | Type de palonnier (simple/double/croix) | single |

## Utilisation

- PWM vers une broche, V+ au +5 V, GND à la masse.
- Bibliothèque `Servo` : `attach()` puis `write(angle)`.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-servo) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
