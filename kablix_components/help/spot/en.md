# PAR 38 DMX fixture

![PAR 38 DMX fixture](spot.webp)

PAR 38 LED fixture (Contest) driven over **DMX512**. It listens to the line and
takes the color sent on its channels. Library part: it is installed through the
component manager, it is not in the original palette.

## Pins

| Pin | Role |
|--------|------|
| **GND** | Shield of the XLR cable (pin 1) |
| **−** | Data− (pin 2) |
| **+** | Data+ (pin 3) |

**Both** wires of the pair must be run to the interface: connected by Data+
alone, the fixture is not driven — it is half wired, and the simulation leaves
it dark.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `address` | DMX address, 1 to 512. The fixture reads three channels from there: red, green, blue | 1 |

Several fixtures can share the same line, each at its own address: that is the
whole point of DMX. Two fixtures at the same address make the same color.

## Wiring

Board → [Grove DMX512](dmx-grove.md) → XLR cable → fixture. The next fixtures
are daisy-chained on the same pair.

## Simulation

Kablix decodes the frame sent by the board and lights the LEDs of the fixture in
the color received, with its halo. Both ways are recognized:

- **hardware UART** — `Serial.begin(250000, SERIAL_8N2)` on the Arduino side,
  `machine.UART(0, 250000, stop=2)` on the Pico side, BREAK and MAB held by the
  program;
- **bit-bang library** — `DmxSimple`, which does not use the UART but produces
  the frame on an ordinary pin (3 by default): the line is decoded edge by edge.

A channel at 0 turns the matching LED off; all three at 0 turn the fixture off.

---

*Drawing and sheet: Frank Sauret. Reference: [Contest](https://www.contest-lighting.com/).*
