# Potentiometer

![Potentiometer](../../img/composants/pot.webp)

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
| `ohms` | Nominal value: total resistance between VCC and GND (Ω) | 10,000 |
| `value` | Initial position (0–100 %) | 50 |

## Usage

- SIG to an analog input (A0…), read with `analogRead()` (0–1023).
- Adjust in simulation: drag the knob, or arrows / Page ↑↓.
- While the simulation runs, a label above the part gives the position **and** the matching resistance — “Position : 25 % (1.175 kΩ)”: what an ohmmeter would read between the wiper and GND.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-potentiometer) — © Wokwi. `@wokwi/elements` components (MIT license).*
