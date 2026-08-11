# Hall effect sensor

![Hall effect sensor](../../img/composants/hall.webp)

**On/off** magnetic field detector in a TO-92 package (A3144, A3141, US1881…). With no magnet nearby its output is released; as soon as the field passes its threshold, the output **pulls to ground**. This is the sensor behind tachometers, contactless end stops and door-closed detection.

## Pins

| Pin | Role |
|--------|------|
| **V+** | Power (+) |
| **GND** | Ground |
| **S** | Digital output, **open drain** and **active low** |

Pinout varies from one part number to the next: the `V+`, `GND` and `S` properties say which **leg** (1, 2 or 3) each electrode sits on. The names never move — changing the pinout never orphans a wire.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `text` | Package marking (one line per line break) | Hall |
| `V+` | Power leg number | 1 |
| `GND` | Ground leg number | 2 |
| `S` | Output leg number | 3 |
| `trigger` | Trigger distance (mm) | 10 |

## Simulation

- A **magnet** appears next to the sensor as soon as the simulation runs: **drag it with the mouse** to move it closer or further away. The dimension above it gives the distance; the line turns **green** when the sensor switches.
- Below the trigger distance (`trigger`), the output goes **low**. Beyond it, the output is released — the pull-up is what brings it back high.
- **A pull-up resistor is mandatory**: either the microcontroller's own (`pinMode(pin, INPUT_PULLUP)` or `Pin.IN, Pin.PULL_UP`), or a 10 kΩ resistor between S and the + rail. Without it, message *"The Hall effect sensor output is open drain"*, a red frame around the culprit, and the output stays low.
- The output wired **straight to the + rail** (0 Ω) is a short circuit: the sensor pulls to ground a rail it cannot hold. Same message and red frame.
- **Unpowered** sensor (V+ or GND left floating): same report, no detection at all.

## Usage

- Arduino wiring: V+ to +5 V, GND to ground, S to a digital input, 10 kΩ resistor between S and +5 V. Read `digitalRead(pin) == LOW` for "magnet present".
- Pico wiring: V+ to 3V3, GND to ground, S to a GPIO declared `Pin(n, Pin.IN, Pin.PULL_UP)` — no resistor to wire.
- A **unipolar** sensor (A3144) only answers one pole: if a real magnet triggers nothing, flip it over.

---

*Kablix in-house component — drawing by Frank Sauret.*
