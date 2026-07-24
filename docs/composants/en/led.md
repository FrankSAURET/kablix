# LED

![LED](../img/led.png)

5 mm light-emitting diode. Lights up when the anode is at + and the cathode at ground, through a limiting resistor.

## Pins

| Pin | Role |
|--------|------|
| **A** | Anode (+) |
| **C** | Cathode (–), to ground |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `color` | Case color | red |
| `lightColor` | Light color | based on color |

## Usage

- **Always** a series resistor (220 Ω–1 kΩ).
- Anode to + (output pin), cathode to ground.
- Variable brightness: drive the anode with **PWM** (`analogWrite`).

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-led) — © Wokwi. `@wokwi/elements` components (MIT license).*
