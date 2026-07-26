# NeoPixel

![NeoPixel](../../img/composants/neopixel.webp)

LED RGB adressable (WS2812). Chaînable : la sortie d'une LED alimente l'entrée de la suivante.

## Broches

| Broche | Rôle |
|--------|------|
| **VDD** | Alimentation (+) |
| **VSS** | Masse |
| **DIN** | Données entrantes |
| **DOUT** | Données sortantes (vers le pixel suivant) |

## Utilisation

- DIN vers une broche numérique (le premier pixel).
- Bibliothèques Adafruit_NeoPixel / FastLED.

## En simulation : le chaînage est suivi

Reliez **DOUT** d'un pixel au **DIN** du suivant : Kablix suit la chaîne et
distribue la trame. Le premier pixel câblé sur la broche du microcontrôleur
affiche `pixel[0]`, le suivant `pixel[1]`, etc. Un anneau ou une matrice inséré
dans la chaîne consomme autant de couleurs qu'il a de LED.

Déclarez donc dans le programme le nombre **total** de LED de la chaîne :

```python
import neopixel
from machine import Pin
chaine = neopixel.NeoPixel(Pin(0), 3)   # 3 pixels câblés en série sur GP0
chaine[2] = (0, 0, 255)                 # le TROISIÈME pixel passe au bleu
chaine.write()
```

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-neopixel) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
