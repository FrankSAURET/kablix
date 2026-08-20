# Grove DMX512

![Grove DMX512](dmx-grove.webp)

Grove DMX512 board (Seeed Studio): an **SP3485** line driver turning the UART of
the board into a DMX512 output on a **3-pin XLR** socket. Library part: it is
installed through the component manager.

## Pins

| Pin | Role |
|--------|------|
| **SIG** | Serial input, to be wired to the transmit pin of the board |
| **VCC** | +5 V supply |
| **GND.1** | Ground, Grove side |
| **NC** | Not connected |
| **+** | Data+ of the XLR (pin 3) |
| **−** | Data− of the XLR (pin 2) |
| **GND.2** | Shield of the XLR (pin 1) |

Two grounds, hence two names: the drawing says “GND” on both sides, the netlist
tells them apart with `GND.1` and `GND.2` — like the `Com.1` / `Com.2` of the
relay.

## Wiring

- **SIG** to a transmit pin: `1` (TX) on Uno, `1` / `18` / `16` / `14` on Mega,
  `GP0` on Pico. With `DmxSimple`, any pin will do (3 by default).
- **VCC** to +5 V, **GND.1** to ground.
- On the XLR side, `+` / `−` / `GND.2` to the [fixture](spot.md), daisy-chained
  for the next ones.

## Simulation

The board has no behavior of its own: it is a line driver. It is what gives the
circuit its meaning — Kablix goes up from the pin wired to **SIG** to the
fixtures sharing its pair, and applies to them the channels they listen to.
Unplugged from the board or from the fixture, nothing lights up any more.

DMX traffic does **not** reach the serial monitor: a frame is 513 binary bytes
per second, the console would be drowned.

---

*Drawing and sheet: Frank Sauret. Reference: [Seeed Studio](https://wiki.seeedstudio.com/Grove-DMX512/).*
