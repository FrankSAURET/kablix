# LED

![LED](../img/led.png)

Diode électroluminescente 5 mm. S'allume quand l'anode est au + et la cathode à la masse, via une résistance de limitation.

## Broches

| Broche | Rôle |
|--------|------|
| **A** | Anode (+) |
| **C** | Cathode (–), vers la masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `color` | Couleur du boîtier | red |
| `lightColor` | Couleur de la lumière | selon color |

## Utilisation

- **Toujours** une résistance en série (220 Ω–1 kΩ).
- Anode au + (broche de sortie), cathode à la masse.
- Luminosité variable : piloter l'anode en **PWM** (`analogWrite`).

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-led) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
