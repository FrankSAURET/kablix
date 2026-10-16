# Ruban de LED

![Ruban de LED](../../img/composants/led-strip.webp)

Ruban de LED RGB adressables, **extensible** : le nombre de LED est une propriété. Pour tenir sur la feuille, le ruban est dessiné **enroulé en spirale**, son entrée à l'extérieur, reliée par trois ou quatre fils à la connectique. La **connectique est fixe**, en haut à gauche : quand le nombre de LED change, la spirale grandit vers le bas et la droite, la connectique ne bouge pas.

## Broches

La connectique dépend du protocole.

| Broche | Rôle | Protocole |
|--------|------|-----------|
| **GND** | Masse | tous |
| **5V** | Alimentation (+) | tous |
| **DIN** | Données entrantes (un seul fil) | WS2811, WS2812(B) / SK6812 |
| **DI** | Données | APA102, WS2801 |
| **CI** | Horloge | APA102, WS2801 |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `leds` | Nombre de LED (1 au minimum, pas de maximum) | 10 |
| `protocol` | Protocole du ruban, voir ci-dessous | WS2812(B) / SK6812 |
| `colorOrder` | Ordre des couleurs sur le fil : RVB, BRV, VRB (WS2801 seulement) | RVB |

Les quatre protocoles proposés :

- **Un fil — WS2811** : 3 broches (GND, 5V, DIN). Ordre des couleurs **RVB**, pause de **300 µs** en fin de trame.
- **Un fil — WS2812(B) / SK6812 (NeoPixel)** : 3 broches (GND, 5V, DIN). Ordre des couleurs **VRB** (GRB), pause de **300 µs** en fin de trame.
- **SPI — APA102 (DotStar)** : 4 broches (GND, 5V, DI, CI). SPI mode 0 : trame de début (32 bits à 0), puis 32 bits par LED (`111` + luminosité 5 bits, bleu, vert, rouge), puis trame de fin.
- **SPI — WS2801** : 4 broches (GND, 5V, DI, CI). SPI mode 0 : 24 bits par LED, sans trame de début. Une pause d'horloge **> 500 µs** verrouille les couleurs. L'ordre des couleurs se règle (RVB par défaut, BRV, VRB).

Changer de protocole change la connectique : les fils déjà posés sur une broche qui disparaît sont perdus.

## Utilisation

- DIN vers une broche numérique de la carte, 5V et GND vers l'alimentation.
- En simulation, une LED **éteinte reste blanche** et une LED **allumée porte un halo** de sa couleur, d'autant plus large qu'elle est lumineuse.
- Les LED sont numérotées depuis l'**entrée** (extérieur de la spirale) jusqu'au **bout** (centre) : la LED 0 est la plus extérieure.
- **Un fil** : bibliothèques NeoPixel (`Adafruit_NeoPixel`, `neopixel`), sur n'importe quelle broche numérique.
- **SPI** : le ruban écoute le **bus SPI matériel** de la carte (DI sur MOSI, CI sur SCK), par exemple `machine.SPI` en MicroPython ou `SPI.transfer` sous Arduino. Un SPI émulé par logiciel (broches agitées à la main) n'est pas décodé. Pas de chaînage de rubans SPI.
- Le ruban se **chaîne** comme un anneau : il consomme `leds` couleurs dans la trame commune.
