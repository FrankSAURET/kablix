# microSD card (SPI)

![microSD card (SPI)](../../img/composants/microsd.webp)

microSD card reader over SPI: file storage.

## Pins

| Pin | Role |
|--------|------|
| **VCC / GND** | Power |
| **SCK** | SPI clock |
| **DI** | Data in (MOSI) |
| **DO** | Data out (MISO) |
| **CS** | Chip select |
| **CD** | Card detect |

## Usage

- SPI bus + CS. `SD` library.
- The simulated card ships **FAT16-formatted** (about 2 MB), just like a card off the shelf: `SD.begin()`, `SD.open()`, writing and reading files back all work with no preparation.
- Its contents live in memory: they are **lost when the simulation stops**, and the card starts out empty on the next run.

### Arduino

```cpp
#include <SD.h>
SD.begin(4);                              // CS on D4, hardware SPI bus D11/D12/D13
File f = SD.open("essai.txt", FILE_WRITE);
f.println("Hello from Kablix!");
f.close();
```

### Pico (MicroPython)

MicroPython ships no SD card driver: drop the `sdcard.py` file (from the official *micropython-lib*) into a `lib/` folder **next to your program** — Kablix injects it automatically.

```python
from machine import Pin, SPI
import os, sdcard

spi = SPI(0, baudrate=1_320_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))
os.mount(sdcard.SDCard(spi, Pin(17)), "/sd")   # CS on GP17
with open("/sd/essai.txt", "a") as f:
    f.write("Hello from Kablix!\n")
```

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-microsd-card) — © Wokwi. `@wokwi/elements` components (MIT license).*
