# Joystick analogique

![Joystick analogique](img/joystick.png)

Manette 2 axes (X/Y) avec bouton poussoir intégré.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **VERT** | Axe vertical (analogique) |
| **HORZ** | Axe horizontal (analogique) |
| **SEL** | Bouton (appui) |
| **GND** | Masse |

## Utilisation

- VERT et HORZ vers deux entrées analogiques, SEL en `INPUT_PULLUP`.
- Au repos les axes sont à ~512 (milieu).

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-analog-joystick) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
