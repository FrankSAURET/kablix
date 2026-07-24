# Potentiometer

![Potentiometer](../img/pot.png)

Variable resistor with a rotary knob. The wiper provides a voltage proportional to its position.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **SIG** | Wiper → analog input |
| **GND** | Ground |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `value` | Initial position (0–100 %) | 50 |

## Usage

- SIG to an analog input (A0…), read with `analogRead()` (0–1023).
- Adjust in simulation: drag the knob, or arrows / Page ↑↓.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-potentiometer) — © Wokwi. `@wokwi/elements` components (MIT license).*
