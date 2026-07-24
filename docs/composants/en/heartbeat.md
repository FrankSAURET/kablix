# Heart-rate sensor

![Heart-rate sensor](../img/heartbeat.png)

Optical heart-rate sensor. Analog output (pulse).

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **OUT** | Analog output |
| **GND** | Ground |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `value` | Simulated pulse (%) | 50 |

## Usage

- OUT to an analog input.
- Filter the signal to extract the beats.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-heart-beat-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
