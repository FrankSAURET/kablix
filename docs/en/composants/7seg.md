# 7-segment display

![7-segment display](../../img/composants/7seg.webp)

Seven-segment display (+ decimal point) for digits and simple symbols. 1 to 4 digits, common cathode or common anode.

## Pins

| Pin | Role |
|--------|------|
| **A–G** | The 7 segments |
| **DP** | Decimal point |
| **COM / COM.1 / COM.2** | Common (cathode or anode) |
| **DIG1–DIG4** | Per-digit commons (multi-digit) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `color` | Color | red |
| `common` | Common (cathode/anode) | cathode |
| `digits` | Number of digits (1/2/4) | 1 |
| `colon` | Clock colon | — |

## Usage

- One resistor per segment.
- Common cathode: COM to ground, segments to +; common anode: the opposite.
- Multi-digit: multiplexing (light one digit at a time, quickly).
- **Clock mode** (`colon`, 4 digits): the decimal points give way to the two central dots, which light up as soon as any DP is driven. To keep them lit permanently, wire DP to the board **+ rail** (3.3 V or 5 V) through a resistor — no MCU pin needed: the simulation takes it into account.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-7segment) — © Wokwi. `@wokwi/elements` components (MIT license).*
