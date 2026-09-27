# PAR 38 DMX fixture

![PAR 38 DMX fixture](spot.webp)

PAR 38 LED fixture (Contest) driven over **DMX512**. It listens to the line and takes the color sent on its channels. Library part: it is installed through the component manager, it is not in the original palette.

## Pins

| Pin | Role |
|--------|------|
| **GND** | Shield of the XLR cable (pin 1) |
| **−** | Data− (pin 2) |
| **+** | Data+ (pin 3) |

**Both** wires of the pair must be run to the interface: connected by Data+ alone, the fixture is not driven — it is half wired, and the simulation leaves it dark.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `address` | DMX address, 1 to 512. The fixture reads four channels from there: red, green, blue, effects | 1 |

Several fixtures can share the same line, each at its own address: that is the whole point of DMX. Two fixtures at the same address make the same color.

## Channels

| Channel | Role | Values |
|-------|------|---------|
| address | Red | 0 to 255 |
| address + 1 | Green | 0 to 255 |
| address + 2 | Blue | 0 to 255 |
| address + 3 | Effects | **0 to 189**: brightness (0 = off, 189 = full); **190 to 250**: blinking, from 1 Hz (190) to 10 Hz (250); **251 to 255**: no change, the color as sent |

With the effects channel at 0, the fixture stays **dark** whatever the color: a program that only sends red, green and blue must also set this fourth channel.

## Wiring

Board → [Grove DMX512](dmx-grove.md) → XLR cable → fixture. The next fixtures are daisy-chained on the same pair.

## Simulation

Kablix decodes the frame sent by the board and lights the LEDs of the fixture in the color received, with its halo. Both ways are recognized:

- **hardware UART** — `Serial.begin(250000, SERIAL_8N2)` on the Arduino side, `machine.UART(0, 250000, stop=2)` on the Pico side, BREAK and MAB held by the program;
- **bit-bang library** — `DmxSimple`, which does not use the UART but produces the frame on an ordinary pin (3 by default): the line is decoded edge by edge.

A color channel at 0 turns the matching LED off; all three at 0 turn the fixture off. Blinking follows simulated time: it freezes while the simulation is paused.

---

*Drawing and sheet: Frank Sauret. Reference: [Contest](https://www.contest-lighting.com/).*
