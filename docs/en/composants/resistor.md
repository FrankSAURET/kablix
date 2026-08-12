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
  so both terminals come out side by side (30 px apart instead of 60). Handy to
  fit a resistor into a tight spot on the board.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-resistor) — © Wokwi. `@wokwi/elements` components (MIT license).*
