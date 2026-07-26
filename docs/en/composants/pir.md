# PIR motion sensor

![PIR motion sensor](../../img/composants/pir.webp)

Passive infrared motion detector. Digital output goes high on detection.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **OUT** | Digital output (1 = motion) |
| **GND** | Ground |

## Properties

None: during simulation the motion is triggered **with the mouse** (see below).

## Usage

- OUT to a digital input.

## During simulation: the mouse creates the motion

- **Move the mouse over the sensor** → OUT goes to 1. What counts is the *motion*, not the mere presence of the pointer: the output falls back to 0 shortly after the mouse stops.
- **Ctrl+click** on the sensor → **permanent** motion (OUT stays at 1, even with the mouse away). Ctrl+click again to stop it.
- A **hint bubble** recalls those gestures: it shows up **just below the pointer** (5 px), centred on it, so that it never hides the sensor.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
