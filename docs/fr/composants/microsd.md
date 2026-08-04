# Carte microSD (SPI)

![Carte microSD (SPI)](../../img/composants/microsd.webp)

Lecteur de carte microSD en SPI : stockage de fichiers.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC / GND** | Alimentation |
| **SCK** | Horloge SPI |
| **DI** | Données entrantes (MOSI) |
| **DO** | Données sortantes (MISO) |
| **CS** | Sélection puce |
| **CD** | Détection de carte |

## Utilisation

- Bus SPI + CS. Bibliothèque `SD`.
- La carte simulée est livrée **formatée en FAT16** (environ 2 Mo), comme une carte du commerce : `SD.begin()`, `SD.open()`, l'écriture et la relecture de fichiers fonctionnent sans rien préparer.
- Le contenu vit en mémoire : il est **perdu à l'arrêt de la simulation**, et la carte repart vide au démarrage suivant.

### Arduino

```cpp
#include <SD.h>
SD.begin(4);                              // CS sur D4, bus SPI matériel D11/D12/D13
File f = SD.open("essai.txt", FILE_WRITE);
f.println("Bonjour depuis Kablix !");
f.close();
```

### Pico (MicroPython)

MicroPython n'embarque pas de pilote de carte SD : posez le fichier `sdcard.py` (bibliothèque officielle *micropython-lib*) dans un dossier `lib/` **à côté de votre programme** — Kablix l'injecte automatiquement.

```python
from machine import Pin, SPI
import os, sdcard

spi = SPI(0, baudrate=1_320_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))
os.mount(sdcard.SDCard(spi, Pin(17)), "/sd")   # CS sur GP17
with open("/sd/essai.txt", "a") as f:
    f.write("Bonjour depuis Kablix !\n")
```

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-microsd-card) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
