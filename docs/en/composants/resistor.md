# Resistor

![Resistor](../../img/composants/resistor.webp)

Fixed resistor. Limits current (LED) or forms a divider / pull-up / pull-down.

## Pins

| Pin | Role |
|--------|------|
| **1** | Terminal 1 |
| **2** | Terminal 2 (non-polarized) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `value` | Value in ohms | 220 |
| `orientation` | Mounting: `h` horizontal (lying flat) or `v` vertical (standing) | `h` |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Usage

- Non-polarized: the two terminals are equivalent.
- LED: 220 Ω–1 kΩ. Pull-up/pull-down: 10 kΩ typical.
- Vertical mounting: the body stands upright with one lead folded over the top,
  so both terminals come out side by side (20 px apart instead of 60). Handy to
  fit a resistor into a tight spot on the breadboard. Standing, the resistor is
  seen at an angle: its bands are drawn as ellipses, the golden band (tolerance)
  at the bottom, the first value band at the top.
- Standing, it fits in **30 × 30 px** instead of 30 × 60: the drawing is halved
  in height, the way perspective does it when you look at the part from higher
  up — the bands flatten, the diameter of the body does not change. It really is
  the same resistor, seen differently, and the room gained is the one you were
  after when you stood it up.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-resistor) — © Wokwi. `@wokwi/elements` components (MIT license).*
