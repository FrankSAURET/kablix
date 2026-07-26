# NeoPixel

![NeoPixel](../../img/composants/neopixel.webp)

Addressable RGB LED (WS2812). Chainable: the output of one LED feeds the input of the next.

## Pins

| Pin | Role |
|--------|------|
| **VDD** | Power (+) |
| **VSS** | Ground |
| **DIN** | Data in |
| **DOUT** | Data out (to the next pixel) |

## Usage

- DIN to a digital pin (the first pixel).
- Adafruit_NeoPixel / FastLED libraries.

## In simulation: the chain is followed

Wire **DOUT** of one pixel to **DIN** of the next: Kablix follows the chain and
splits the frame. The first pixel wired to the microcontroller pin shows
`pixel[0]`, the next one `pixel[1]`, and so on. A ring or a matrix inserted in
the chain consumes as many colours as it has LEDs.

So declare the **total** number of LEDs of the chain in your program:

```python
import neopixel
from machine import Pin
chain = neopixel.NeoPixel(Pin(0), 3)   # 3 pixels wired in series on GP0
chain[2] = (0, 0, 255)                 # the THIRD pixel turns blue
chain.write()
```

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-neopixel) — © Wokwi. `@wokwi/elements` components (MIT license).*
