# Gas sensor (MQ)

![Gas sensor (MQ)](../img/gas-sensor.png)

MQ-series gas/smoke sensor. Analog (concentration) and digital (threshold) outputs.

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
| `value` | Simulated gas level (%) | 20 |

## Usage

- AOUT to an analog input.
- Preheating required on the real sensor.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-gas-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
