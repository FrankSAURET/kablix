# Joystick analogique

![Joystick analogique](../../img/composants/joystick.webp)

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

## En simulation

- **Manche** : glissez-le à la souris pour des valeurs continues sur les deux axes. Au relâchement il revient au centre — sauf si vous tenez **Ctrl** (Cmd sur Mac), qui **verrouille** la position.
- **Flèches** : un clic sur l'une des quatre flèches donne la déflexion maximale, le temps de l'appui. Les touches fléchées du clavier font la même chose.
- **Bouton SEL** : cliquez le centre du manche. **Ctrl+clic** (Cmd sur Mac) **verrouille** l'appui — pratique pour tester un maintien sans garder le doigt sur la souris ; un clic simple le libère.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-analog-joystick) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
