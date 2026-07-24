# microSD card (SPI)

![microSD card (SPI)](../img/microsd.png)

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
- Init and block read/write are simulated.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-microsd-card) — © Wokwi. `@wokwi/elements` components (MIT license).*
