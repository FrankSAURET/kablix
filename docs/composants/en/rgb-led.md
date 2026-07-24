# RGB LED

![RGB LED](../img/rgb-led.png)

Tricolor LED (red/green/blue) with a common cathode (or anode). Mix the three channels to get any color.

## Pins

| Pin | Role |
|--------|------|
| **R** | Red |
| **G** | Green |
| **B** | Blue |
| **COM** | Common (cathode or anode) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `common` | Common pin (cathode/anode) | cathode |

## Usage

- One resistor per R/G/B channel.
- Common cathode: COM to ground, channels to +. Common anode: the opposite.
- PWM on R/G/B to dose each color.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-rgb-led) — © Wokwi. `@wokwi/elements` components (MIT license).*
