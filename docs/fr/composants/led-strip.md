# Ruban de LED

![Ruban de LED](../../img/composants/led-strip.webp)

Ruban de LED RGB adressables, **extensible** : le nombre de LED est une propriété. Pour tenir sur la feuille, le ruban est dessiné **enroulé en spirale**, son entrée à l'extérieur, reliée par trois ou quatre fils à la connectique.

## Broches

La connectique dépend du protocole.

| Broche | Rôle | Protocole |
|--------|------|-----------|
| **GND** | Masse | tous |
| **5V** | Alimentation (+) | tous |
| **DIN** | Données entrantes (un seul fil) | WS2811, WS2812, WS2812B |
| **DI** | Données | APA102, WS2801 |
| **CI** | Horloge | APA102, WS2801 |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `leds` | Nombre de LED (1 au minimum, pas de maximum) | 10 |
| `protocol` | Protocole du ruban, voir ci-dessous | WS2812 |

Les trois protocoles proposés :

- **Un fil — WS2811, WS2812, WS2812B (NeoPixel)** : 3 broches, une seule ligne de données (GND, 5V, DIN).
- **SPI — APA102 (DotStar)** : 4 broches, données et horloge (GND, 5V, DI, CI).
- **SPI — WS2801** : 4 broches, données et horloge (GND, 5V, DI, CI).

Changer de protocole change la connectique : les fils déjà posés sur une broche qui disparaît sont perdus.

## Utilisation

- DIN vers une broche numérique de la carte, 5V et GND vers l'alimentation.
- En simulation, une LED **éteinte reste blanche** et une LED **allumée porte un halo** de sa couleur, d'autant plus large qu'elle est lumineuse.
- Les LED sont numérotées depuis l'**entrée** (extérieur de la spirale) jusqu'au **bout** (centre) : la LED 0 est la plus extérieure.
- **Simulé : le protocole un fil seulement** (bibliothèques NeoPixel : `Adafruit_NeoPixel`, `neopixel`). Les protocoles SPI (APA102, WS2801) se câblent mais les LED restent éteintes.
- Le ruban se **chaîne** comme un anneau : il consomme `leds` couleurs dans la trame commune.
