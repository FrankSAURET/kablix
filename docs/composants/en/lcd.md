# Character LCD

![Character LCD](../img/lcd.png)

Character LCD display (HD44780). 16×2 or 20×4, in I²C (4 wires) or parallel.

## Pins

| Pin | Role |
|--------|------|
| **GND / VCC** | Power (I²C mode) |
| **SDA / SCL** | I²C bus (I²C mode) |
| **RS, RW, E, D0–D7** | Parallel bus (parallel mode) |
| **V0** | Contrast |
| **A / K** | Backlight |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `pins` | Interface (I²C / parallel) | i2c |
| `lcdSize` | Size (16×2 / 20×4) | 16x2 |

## Usage

- I²C: only 4 wires (GND, VCC, SDA, SCL) + address (often 0x27).
- The text is only simulated in **I²C**; in parallel the display is visual only.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-lcd1602) — © Wokwi. `@wokwi/elements` components (MIT license).*
