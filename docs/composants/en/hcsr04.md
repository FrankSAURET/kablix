# HC-SR04 ultrasonic sensor

![HC-SR04 ultrasonic sensor](../img/hcsr04.png)

Ultrasonic rangefinder: measures a distance (2–400 cm) by time of flight.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+5 V) |
| **TRIG** | Trigger (pulse) |
| **ECHO** | Echo (duration ∝ distance) |
| **GND** | Ground |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `distance` | Simulated distance (cm) | 20 |

## Usage

- 10 µs pulse on TRIG, measure the width of ECHO (`pulseIn`).
- distance_cm = duration_µs / 58.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-hc-sr04) — © Wokwi. `@wokwi/elements` components (MIT license).*
