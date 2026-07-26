# Anneau NeoPixel

![Anneau NeoPixel](../../img/composants/led-ring.webp)

Anneau de LED RGB adressables (WS2812).

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **GND** | Masse |
| **DIN** | Données entrantes |
| **DOUT** | Données sortantes |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `pixels` | Nombre de LED | 16 |

## Utilisation

- DIN vers une broche numérique.
- Effets circulaires (rotation, jauge).
- En simulation, une LED **éteinte reste blanche** (comme sur la vraie carte) et une LED **allumée porte un halo** de sa couleur, d'autant plus large qu'elle est lumineuse.
- À **faible luminosité**, le boîtier reste **blanc teinté** et c'est le halo qui s'atténue : une WS2812 diffuse la lumière, elle ne devient jamais sombre.
- L'anneau se **chaîne** comme un pixel : DOUT vers le DIN du composant suivant, et il consomme `pixels` couleurs dans la trame commune.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-led-ring) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
