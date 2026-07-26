# HC-SR04 ultrasonic sensor

![HC-SR04 ultrasonic sensor](../../img/composants/hcsr04.webp)

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
| `distancemin` / `distancemax` | Bounds of the distance slider (cm) | 2 / 400 |
| `temperature` | Air temperature at start-up (°C) | 20 |

## Usage

- 10 µs pulse on TRIG, measure the width of ECHO (`pulseIn`, `time_pulse_us`).
- distance_cm = duration_µs / 58.

## During simulation: two sliders

The part shows **two settings** while the simulation runs:

- the obstacle **distance** (slider + input, bounded by `distancemin`/`distancemax`);
- the **air temperature** (−20 to 60 °C), which sets the **speed of sound** — the tooltip shows the resulting speed.

The sensor never measures a distance: it measures a round-trip **flight time**. The program converts it by dividing by a constant — 58 µs/cm, correct **at 20 °C only**:

| Temperature | Speed of sound | Echo duration | 100 cm as read by a program dividing by 58 |
|---|---|---|---|
| −20 °C | 319.2 m/s | 62.7 µs/cm | 108 cm |
| 0 °C | 331.3 m/s | 60.4 µs/cm | 104 cm |
| 20 °C | 343.4 m/s | 58.2 µs/cm | 100 cm |
| 60 °C | 367.7 m/s | 54.4 µs/cm | 94 cm |

Moving the temperature slider during simulation makes the obstacle appear **closer or further away** although it did not move: that is the error to compensate for. Formula used: `c = 331.3 + 0.606 × T` (m/s), then `duration = 2 × distance / c`.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-hc-sr04) — © Wokwi. `@wokwi/elements` components (MIT license).*
