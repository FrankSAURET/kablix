# PIR motion sensor

![PIR motion sensor](../img/pir.png)

Passive infrared motion detector. Digital output goes high on detection.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **OUT** | Digital output (1 = motion) |
| **GND** | Ground |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `state` | Motion detected (0/1) | 0 |

## Usage

- OUT to a digital input.
- Set "motion detected" in the inspector to simulate.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
