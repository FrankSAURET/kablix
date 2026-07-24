# Flame sensor

![Flame sensor](../img/flame.png)

Flame detector (infrared). Analog and digital outputs.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **GND** | Ground |
| **DOUT** | Digital output (1 = flame) |
| **AOUT** | Analog output |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `state` | Flame detected (0/1) | 0 |

## Usage

- DOUT to a digital input.
- Toggle the state in the inspector.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-flame-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
