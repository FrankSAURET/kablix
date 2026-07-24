# Photoresistor (LDR)

![Photoresistor (LDR)](../img/photoresistor.png)

Light sensor: its resistance varies with illumination. Analog and digital outputs.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **GND** | Ground |
| **AO** | Analog output (brightness) |
| **DO** | Digital output (threshold) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `value` | Simulated brightness (%) | 50 |

## Usage

- AO to an analog input, read with `analogRead()`.
- DO toggles based on an adjustable threshold (on the real board).

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
