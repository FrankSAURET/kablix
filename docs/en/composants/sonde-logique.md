# Logic probe

![Logic probe](../../img/composants/sonde-logique.webp)

Small measuring crocodile clip. It is not wired: you **drop it on the pad of a pin** of the board, and it becomes a **channel** of the logic analyzer. Each clip takes a **colour** when it is dropped: the blue clip on the board is the blue channel in the analyzer.

Palette category: **Measuring instruments**.

It only listens to **all or nothing**: 0 or 1, and the instant of each change. To see a varying voltage, use the [oscilloscope](oscillo.md); to follow a value computed by the program, the plotter.

## Pins

| Terminal | Role                                                                      |
| -------- | ------------------------------------------------------------------------- |
| **G**    | The **tip** of the clip, at the bottom left of the drawing — the only pad |

The clip draws nothing and forces nothing: the circuit behaves exactly as if it were not there. No wire ever leaves it.

## Dropping it

1. Drag the clip from the palette.
2. Bring its **hook** onto the **pad** of the pin to listen to.
3. Let go. The clip hooks on, takes a colour, and the pin appears in the analyzer.

## Properties

| Property    | Role                                                   | Default   |
| ----------- | ------------------------------------------------------ | --------- |
| `etiquette` | Name of the channel in the analyzer (`clock`, `data`…) | *(empty)* |

The label shows **on the board, next to the clip**, in the colour of the channel. Empty, it is hidden and the channel takes the **name of the pin** (`Pin 8`, `A0`, `GP14`).

A reopened circuit finds its clips where they were, with their colours and names.

## The “Logic analyzer” tab

There is **nothing to click**: as soon as at least one clip is dropped, **starting the simulation** opens the analyzer in a **separate tab**, which you can place **next to the diagram** — you read the pulses and the wiring at the same time. No clip on the board, no tab. Tab closed by mistake: an **Analyzer** button appears in the simulation toolbar and reopens it, with its last measurement.

The tab shows **one track per channel**, in the colour of its clip, with a time ruler at the top. Its graduations follow the **zoom**: seconds for the whole capture, milliseconds or microseconds up close. Zoomed far into a long capture, the first graduation gives the full instant (`12.0016 s`) and the next ones their offset from it (`+50 µs`, `+100 µs`…); the crosshair, for its part, writes the instant with all its useful digits. In the margin, facing the two levels of the signal, their **voltages** are written: the board's for the high state (`5 V` on Uno and Mega, `3.3 V` on Pico), `0 V` for the low state. A clip placed behind the driver of an interface board takes the voltages of that driver: `3.7 V` and `1.1 V` on the `+` and `−` lines of the **Grove DMX512** board.

Several clips can listen to the **same signal**: on a DMX board, a clip on `SIG`, one on `+` and one on `−` all show the frame sent by the pin driving it — the `−` clip upside down, as on the real differential pair.

- **Wheel**: zoom, around the point under the mouse.
- **Drag**: move around the recording.
- **◀ ▶ arrows** of the toolbar, or the **←** **→** keys: move back or forward by half a window, without changing the zoom.
- **⏮ ⏭ arrows** of the toolbar: bring the **start of the previous or next decoded frame** to the left edge, without changing the zoom. They skip frames that repeat the previous one identically: a program sending the same frame over and over (DmxSimple, about every 2 ms) goes from one content to the next in one click, and ⏮ goes back to the start of the previous series. They need at least one decoding; with several, they go from one bus to the other in time order, each bus compared with its own frames.
- **Hover**: a crosshair gives the instant, and the level (0 or 1) of each channel at that instant.
- **M1 and M2 markers**: parked in the band under the ruler, they are dragged onto the tracks and snap to the nearest edge; with both placed, the time between them is written. The recall arrow, on the left of the band, brings them back to their parking place.
- **F1 and F2 window markers**: parked just under M1 and M2, with their own recall arrow. Once placed, they stretch an **empty purple frame** between them, covering all the tracks: frame whatever you want to check. The frame is set **relative to the trigger**: when **⏮ ⏭** go from one frame to another, it lands at the same distance from the start of the new frame, even if you have dragged the curve in the meantime, and it follows the trigger when the trigger falls elsewhere. The same spot can thus be read frame after frame. They snap to edges like M1 and M2, but measure nothing.
- **Whole capture**: brings the entire capture back into the window.
- **Follow live**: sticks the view back to the end of the capture, which it does by itself during a run as long as you have not zoomed.

Under the name of each channel, the **colour dot** opens its settings: name, invert, speed, tolerance, and **hide**. A hidden channel leaves the screen but keeps its capture; as long as there is one, the toolbar shows a button that **shows them all again**, with their count.

Every button of the margin — colour dot, **T**, **P**, parked markers, recall arrows — says what it does in a **tooltip**, on hover. Those of **T** and **P** also give their state: the trigger armed on the channel, the decoded bus.

Outside the simulation, the tab shows the **last capture** of the session.

This capture is written **as it goes** to a separate file while the simulation runs, and an interrupted simulation still leaves what it measured. This file is **deleted when the project is closed** — to keep a measurement, export it (**☰** menu, **Export CSV**).

The project itself keeps the **settings** of the instrument (trigger, decoders, channel settings, depth).

## Depth and restart

Like a commercial analyzer, the instrument has a **bounded memory**: the **Depth** list of the toolbar sets the number of edges kept **per channel** — `5 k`, `15 k`, `60 k` (default), `250 k` or `1 M`. The two smallest are for isolating a short passage without keeping seconds of signal. During the measurement, each choice shows in brackets the **duration it covers** (`60 k (≈ 6 s)`), estimated on the busiest channel: a DMX bus or a fast clock fills the memory much faster than a blinking LED. Deeper means longer, but also heavier for the tab.

Without a trigger, the capture keeps the **latest** edges: the oldest ones drop out as it goes, the screen follows the end. With a trigger, it keeps a tenth of the depth **before** the trigger edge and fills the rest **after** it; once full, it stops, and the toolbar gives the **duration of signal kept** and the depth: `Capture full: 8.3 s kept (60 k edges per channel)`. Restarted, a full capture keeps the same duration as long as the signal does not change its pace.

Changing the depth during the simulation applies at once: on a full capture, a new acquisition starts. With the simulation stopped, the choice waits for the next run.

The **Sampling** list changes nothing to that duration. A commercial analyzer stores samples: its duration is the depth divided by the sampling rate. Kablix stores **edges**, dated to the processor cycle: its duration depends on the pace of the signal, not on sampling. Sampling only serves to **show what a real instrument would see**: each edge is moved to the tick that follows it, two edges in the same tick merge, a pulse shorter than a tick disappears, and a bus read too slowly decodes badly. The capture itself keeps all its exact edges: going back to **Unlimited** finds them again without capturing anything anew. To measure, leave **Unlimited**.

The **↻ Restart capture** button, at the head of the toolbar, clears the current measurement and starts again from zero without stopping the simulation; a trigger that is set re-arms and waits for its next edge. It is only active during the simulation.

## Exporting

The **☰** button of the toolbar opens the export menu:

- **Export CSV**: saves the measurement to a `.csv` file, **one column per channel** (`temps_ms,Sig,DMX-,DMX+`), with the description of the channels at the top. Each edge takes **two lines at the same instant**: the level before, then the level after. Drawn in a spreadsheet as a “scatter with straight lines”, the curves are therefore square waves with vertical edges, as on screen. A channel read upside down (`-` leg of a DMX pair, *Invert* setting) is upside down in the file too. An empty cell means that the channel has not moved yet. A measurement in progress is exported without stopping the simulation.
- **Copy SVG**: puts the curves on the clipboard **as a picture**, in two forms at once: a vector drawing (SVG) that Inkscape pastes, and an ordinary image, twice as fine as the screen, that Word pastes. Each program takes the one it can read.
- **Export SVG**: the same picture, saved to an `.svg` file.

To export only a part, place **M1** at the start of what interests you and **M2** at the end. The CSV then keeps only the edges between the two, framed by the level of each channel at M1 and at M2. The SVG draws that span **at the current zoom**: one screen pixel is one picture pixel, so zooming in before exporting makes it longer and zooming out makes it shorter. Without M1 and M2, the CSV takes the whole measurement and the SVG what the screen shows.

The picture keeps the colours of the theme and its background, the channel names, the decodings and the markers, without the buttons of the tab. A span that would make less than 40 pixels of curve at that zoom, or a picture more than 50,000 pixels wide, is refused by a message that says whether to zoom in or out.

## The trigger

The **T** menu under a channel name: pick the **direction** — *rising* or *falling* edge. The capture then stays **waiting** until the first edge of that kind, then **locks on it**: instant 0 of the ruler becomes that edge, and everything reads as ahead of it or behind it. Without a trigger, the ruler starts at the instant the simulation was started.

Changing the setting **re-arms** the wait, as does the **↻ Restart capture** button: a full capture then starts a new acquisition.

On a channel decoded as **DMX512**, the menu also offers **`START code 0x00`**: the capture locks on the **start bit of the first slot** of a lighting frame, the one that follows the `BREAK` and the `MAB`. A channel worth `0x00` does not trigger, nor does a frame with a non-zero start code (RDM, text). The button then shows `SC`. The duration of a bit follows the **speed of the channel** (250 kbaud if nothing is typed): a frame sent at another speed only triggers once that speed is set.

On a channel that carries the data of another decoding, the menu offers **Frame start**: the capture locks on the **opening of the first frame** after arming. What opens a frame depends on the protocol:

- **I²C**: the `START` (a `START rep.` only continues the current frame);
- **SPI**: `CS ↓`; without a CS channel, the first byte of a clock burst;
- **UART**: the first character after a silence of at least one character;
- **1-Wire**: the `RESET`;
- **DHT11 / DHT22**: the master's request.

The trigger reads the decoding as it is set: changing its channels or its speed restarts the search. The button then shows a line followed by a pulse.

## Decoding

The **P** menu under a channel name: `I²C / TWI`, `SPI`, `UART`, `1-Wire`, `DHT11 / DHT22` or `DMX512`. You then have to say **which channel plays which role**:

| Protocol          | Roles to assign                                                                   |
| ----------------- | --------------------------------------------------------------------------------- |
| **I²C / TWI**     | the clock (SCL) and the data (SDA)                                                |
| **SPI**           | the clock (SCK), MOSI, MISO, the chip select (CS), plus the **mode** 0 to 3       |
| **UART**          | the serial line (TX or RX), plus the **format** (`8N1`, `7E1`…) and the **speed** |
| **1-Wire**        | the single line (DQ)                                                              |
| **DHT11 / DHT22** | the single line (DATA), plus the sensor **model**                                 |
| **DMX512**        | the data line                                                                     |

The bytes and the frame markers (`START`, `STOP`, `ACK`, `RESET`, DMX channel numbers) are then written **under the track**, each at its place in time. Decoding only covers the **visible part**: zoom in on the frame you are interested in.

The colours are the same for every protocol: the **start** (start bit, START condition, CS selection) is **green**, the **stop** (stop bits, STOP condition, CS release) **red**, the data **blue**, the frame markers **purple**, the checks (`ACK`, checksum) **orange**, the 1-Wire commands **pink** and the errors **magenta**. The terms of the standards (`Start`, `STOP`, `BREAK`, `MAB`…) are never translated: they are those of the datasheets.

### What you have to set

The **model** of a DHT sensor cannot be guessed. The DHT11 and the DHT22 send exactly the same frame, with the same timings: **nothing on the wire tells them apart**. What changes is the way the four bytes are read — the DHT22 codes humidity and temperature in tenths over two bytes each, the DHT11 gives the humidity as a whole number and the temperature in degrees then tenths (`22.0 °C`: the first models always send a zero tenth). Choosing the wrong model gives no error, it gives wrong values.

Nor can the **speed** and the **format** of a UART line: two neighbouring speeds produce the same edges and different bytes, and the same signal read as `8N1` or as `7E1` does not give the same characters. Gibberish bytes: it is almost always the speed that needs checking first (it is typed in the **channel** settings, not in the decoding — two serial lines of the same circuit do not necessarily run at the same pace).

The **base** of the bytes, on the other hand, is a mere reading choice, common to all protocols: the **Values** setting of the decoding writes them in **hexadecimal** (`0x44`, the default — the notation of datasheets) or in **decimal** (`68`, that of the program comparing a reading with a number). Frame markers, command names (`CONVERT T`) and measurements (`23.4 °C`) do not change. Two decodings of the same capture each keep their own base.

The **Bits** box adds, again for every protocol, the **binary display**: each bit read is written as `0` or `1` just under the pulse that carries it, in wire order, and a dotted line separates two neighbouring bits, right on the edges. In 1-Wire, the box of a bit runs from its low pulse to the one of the next bit, recovery included; the last bit of a burst keeps the 60 µs of the slot. This is the frame as the receiver reads it: the `Start` bit and the `STOP` bits of a UART character, the data sent **least significant bit first** (UART, DMX, 1-Wire) or **most significant bit first** (I²C, SPI, DHT), the `ACK` bit of an I²C byte. Bytes and markers move down one line to make room. From afar, when a bit is only a few pixels wide, the digits disappear: zoom in to read them. Changing protocol keeps the box ticked.

### What each decoding shows

- **UART** — each character is cut as on the wire: the `Start` (one bit, green), the value and, when it is printable, the character itself (`0x48 'H'`), then the `STOP` (red). A missing stop bit is flagged `framing` in place of the `STOP`, a wrong parity `parity` on the parity bit — the value stays displayed, up to you to judge.
- **DMX512** — each frame reads in the order of the standard: the `BREAK` (low line for at least 88 µs), the `MAB` (the high idle that follows it), then eleven-bit slots. Each slot shows its `Start` (green, one bit), its value in hexadecimal and its `STOP` (red, two bits). The first slot is the `START code 0x00` (lighting), the next ones the channels: `c1=0xC8`, `c2=0x32`… A `PAUSE` marks an idle between two slots, the `MBB` the one between the last slot and the next `BREAK`. A non-zero start code (RDM, text…) is announced as is, without numbering channels.
- **1-Wire** — a single line, no clock: the **length of the low pulse** carries the bit. Like the microcontroller, the decoder looks at the line **15 µs** after it falls: still low, it is a `0`; already back up, it is a `1`. The decoder spots the `RESET` and names the usual commands in plain words (`SKIP ROM`, `CONVERT T`, `READ SCRATCHPAD`…), because `0x44` says nothing whereas `CONVERT T` says it all. Commands have their own colour, **pink**: the ROM command that follows the `RESET` (`MATCH ROM`, `SKIP ROM`…) and the function command that comes next (`CONVERT T`, `READ SCRATCHPAD`…) stand out from the address and data bytes, in blue. An unknown byte in place of a command — that of a component other than the DS18B20 — stays pink, without a name. It always reads from the `RESET` of the transaction, even when it has left the view on the left: dragging the curve changes neither the bytes nor their names. It does not tell whether the master or the slave is talking: on the wire it is the same low pulse, and a commercial instrument does no better with a single clip. One exception: right after the `RESET`, the sensor holds the line low for about a hundred microseconds to say “I am here” — that is the `PRESENCE` (purple). Without it, no sensor answers on the wire.

  With a **DS18B20**, each measurement reads as two transactions, about one per second:
  1. `RESET`, `PRESENCE`, `SKIP ROM` (“I am talking to all sensors”), `CONVERT T` (“measure”) — then the line stays idle during the conversion (750 ms at 12 bits);
  2. `RESET`, `PRESENCE`, `MATCH ROM` followed by the **8 address bytes** of the targeted sensor (the first, `0x28`, is the DS18B20 family code, the last a checksum), then `READ SCRATCHPAD` and the **9 bytes** the sensor sends back: the first two are the temperature (least significant byte first, in sixteenths of a degree: `0x90` `0x01` = 0x0190 = 400 → 25 °C), the last a checksum.

  At start-up, the program first looks for the sensors present (`SEARCH ROM`): for each bit of the address, two bits read then one bit written. These slots follow one another without forming bytes, and what is written under them makes no sense — this is normal, it only happens once.
- **DHT11 / DHT22** — a single wire too, but **it is not 1-Wire**: here the bit is carried by the length of the **HIGH** level (about 28 µs for a `0`, 70 µs for a `1`), and there is neither ROM nor command. You first see the microcontroller's `REQUEST`, then the sensor's `PRESENCE` acknowledging it, then the measurement, on **two lines** under the curve. The first cuts out the five bytes, each in its own box, separated from the next by a vertical line: `0x02` `0x37` `0x00` `0xEA` `0x23`. The second gives, under the bytes that carry them, the humidity (`56.7 %RH`, under the first two), the temperature (`23.4 °C`, under the next two) and the checksum (`checksum ✓`, under the last). When room runs out, the checksum shrinks to its tick. Seen from afar, the frame is only a few pixels wide: the measurement is then written in one block just to its right, `56.7 %RH · 23.4 °C · checksum ✓`, and stays readable as long as the `REQUEST` is. The **checksum** is computed again and announced: a `CHECKSUM ✗` points to a doubtful link — wire too long, missing pull-up resistor — far better than five hexadecimal bytes would. A frame cut short is flagged as such (`17/40 bits`) rather than completed at random.

---

*Clip drawing made by Frank for Kablix.*
