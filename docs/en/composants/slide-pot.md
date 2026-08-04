# Slide potentiometer

![Slide potentiometer](../../img/composants/slide-pot.webp)

Linear potentiometer with a sliding wiper. Same principle as the rotary one.

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

- SIG to an analog input, read with `analogRead()`.
- Adjust in simulation: **drag** the slider.
- While the simulation runs, a label above the part gives the position **and** the matching resistance — “Position : 25 % (1.175 kΩ)”: what an ohmmeter would read between the wiper and GND.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-slide-potentiometer) — © Wokwi. `@wokwi/elements` components (MIT license).*
