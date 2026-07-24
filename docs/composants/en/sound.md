# Sound sensor

![Sound sensor](../img/sound.png)

Microphone with a comparator. Analog (level) and digital (threshold) outputs.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **GND** | Ground |
| **AOUT** | Analog output |
| **DOUT** | Digital output (threshold) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `state` | Sound detected (0/1) | 0 |

## Usage

- DOUT to a digital input, AOUT to an analog one.
- Set the threshold on the real module.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-small-sound-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
