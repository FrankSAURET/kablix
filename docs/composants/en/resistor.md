# Resistor

![Resistor](../img/resistor.png)

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
| `angle` | Orientation (0/90/180/270°) | 0 |

## Usage

- Non-polarized: the two terminals are equivalent.
- LED: 220 Ω–1 kΩ. Pull-up/pull-down: 10 kΩ typical.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-resistor) — © Wokwi. `@wokwi/elements` components (MIT license).*
