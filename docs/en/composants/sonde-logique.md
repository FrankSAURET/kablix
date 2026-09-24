# Logic probe

![Logic probe](../../img/composants/sonde-logique.webp)

Small measuring crocodile clip. It is not wired: you **drop it on the pad of a pin** of the board, and it becomes a **channel** of the logic analyzer. Each clip takes a **colour** when it is dropped: the blue clip on the board is the blue channel in the analyzer.

Palette category: **Measuring instruments**.

> **Experimental.** The logic analyzer is experimental for now: it works, but its interface and its decoders may still change from one version to the next.

It only listens to **all or nothing**: 0 or 1, and the instant of each change. To see a varying voltage, use the [oscilloscope](oscillo.md); to follow a value computed by the program, the plotter.

## Pins

| Terminal | Role                                                                   |
| -------- | ---------------------------------------------------------------------- |
| **G**    | The **tip** of the clip, at the bottom left of the drawing — the only pad |

The clip draws nothing and forces nothing: the circuit behaves exactly as if it were not there. No wire ever leaves it.

## Dropping it

1. Drag the clip from the palette.
2. Bring its **hook** onto the **pad** of the pin to listen to.
3. Let go. The clip hooks on, takes a colour, and the pin appears in the analyzer.

## Properties

| Property    | Role                                                     | Default   |
| ----------- | -------------------------------------------------------- | --------- |
| `etiquette` | Name of the channel in the analyzer (`clock`, `data`…)   | *(empty)* |

The label shows **on the board, next to the clip**, in the colour of the channel. Empty, it is hidden and the channel takes the **name of the pin** (`Pin 8`, `A0`, `GP14`).

A reopened circuit finds its clips where they were, with their colours and names.

## The “Logic analyzer” tab

There is **nothing to click**: as soon as at least one clip is dropped, **starting the simulation** opens the analyzer in a **separate tab**, which you can place **next to the diagram** — you read the pulses and the wiring at the same time. No clip on the board, no tab.

The tab shows **one track per channel**, in the colour of its clip, with a time ruler at the top.

- **Wheel**: zoom, around the point under the mouse.
- **Drag**: move around the recording.
- **◀ ▶ arrows** of the toolbar, or the **←** **→** keys: move back or forward by half a window, without changing the zoom.
- **Hover**: a crosshair gives the instant, and the level (0 or 1) of each channel at that instant.
- **Whole capture**: brings the entire capture back into the window.
- **Follow live**: sticks the view back to the end of the capture, which it does by itself during a run as long as you have not zoomed.

Under the name of each channel, the **colour dot** opens its settings: name, speed, tolerance, and **hide**. A hidden channel leaves the screen but keeps its capture; as long as there is one, the toolbar shows a button that **shows them all again**, with their count.

Outside the simulation, the tab shows the **last capture** of the session.

This capture is written **as it goes** to a separate file while the simulation runs, and an interrupted simulation still leaves what it measured. This file is **deleted when the project is closed** — to keep a measurement, export it (**Export CSV**).

The project itself keeps the **settings** of the instrument (trigger, decoders, channel settings).

## The trigger

The **T** menu under a channel name: pick the **direction** — *rising* or *falling* edge. The capture then stays **waiting** until the first edge of that kind, then **locks on it**: instant 0 of the ruler becomes that edge, and everything reads as ahead of it or behind it. Without a trigger, the ruler starts at the instant the simulation was started.

Changing the setting **re-arms** the wait.

## Decoding

The **P** menu under a channel name: `I²C / TWI`, `SPI`, `UART`, `1-Wire`, `DHT11 / DHT22` or `DMX512`. You then have to say **which channel plays which role**:

| Protocol          | Roles to assign                                                                |
| ----------------- | ------------------------------------------------------------------------------ |
| **I²C / TWI**     | the clock (SCL) and the data (SDA)                                             |
| **SPI**           | the clock (SCK), MOSI, MISO, the chip select (CS), plus the **mode** 0 to 3    |
| **UART**          | the serial line (TX or RX), plus the **format** (`8N1`, `7E1`…) and the **speed** |
| **1-Wire**        | the single line (DQ)                                                           |
| **DHT11 / DHT22** | the single line (DATA), plus the sensor **model**                              |
| **DMX512**        | the data line                                                                  |

The bytes and the frame markers (`START`, `STOP`, `ACK`, `RESET`, DMX channel numbers) are then written **under the track**, each at its place in time. Decoding only covers the **visible part**: zoom in on the frame you are interested in.

### What you have to set

The **model** of a DHT sensor cannot be guessed. The DHT11 and the DHT22 send exactly the same frame, with the same timings: **nothing on the wire tells them apart**. What changes is the way the four bytes are read — tenths of a degree and possibly negative temperatures for the DHT22, whole numbers only for the DHT11. Choosing the wrong model gives no error, it gives wrong values.

Nor can the **speed** and the **format** of a UART line: two neighbouring speeds produce the same edges and different bytes, and the same signal read as `8N1` or as `7E1` does not give the same characters. Gibberish bytes: it is almost always the speed that needs checking first (it is typed in the **channel** settings, not in the decoder — two serial lines of the same circuit do not necessarily run at the same pace).

### What each decoder shows

- **UART** — each character comes out with its value and, when it is printable, the character itself: `0x48 'H'`. A missing stop bit is flagged `framing`, a wrong parity `parity` — the byte stays displayed, up to you to judge.
- **1-Wire** — a single line, no clock: the **length of the low pulse** carries the bit. The decoder spots the `RESET` and names the usual commands in plain words (`SKIP ROM`, `CONVERT T`, `READ SCRATCHPAD`…), because `0x44` says nothing whereas `CONVERT T` says it all. It does not tell whether the master or the slave is talking: on the wire it is the same low pulse, and a commercial instrument does no better with a single clip.
- **DHT11 / DHT22** — a single wire too, but **it is not 1-Wire**: here the bit is carried by the length of the **HIGH** level (about 28 µs for a `0`, 70 µs for a `1`), and there is neither ROM nor command. You first see the microcontroller's `REQUEST`, then the sensor's `PRESENCE` acknowledging it, then the measurement, each value under the bits that carry it: the humidity (`0x02 0x37 · 56.7 %RH`), the temperature (`0x00 0xEA · 23.4 °C`) and the checksum (`0x23 · checksum ✓`). When room runs out, only the value remains (`56.7 %RH`). Seen from afar, the frame is only a few pixels wide: the measurement is then written in one block just to its right, `56.7 %RH · 23.4 °C · checksum ✓`, and stays readable as long as the `REQUEST` is. The **checksum** is computed again and announced: a `CHECKSUM ✗` points to a doubtful link — wire too long, missing pull-up resistor — far better than five hexadecimal bytes would. A frame cut short is flagged as such (`17/40 bits`) rather than completed at random.

---

*Clip drawing made by Frank for Kablix.*
