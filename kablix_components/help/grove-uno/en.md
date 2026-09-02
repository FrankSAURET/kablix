# Grove Shield (Uno)

![Grove Shield (Uno)](grove-uno.webp)

A board that sits **on top of the Arduino Uno**. It computes nothing: it
replaces the wires. Instead of poking wires one by one into the rows of the Uno,
you plug a four-wire Grove cable into a white socket, and it is wired. You
cannot get the direction wrong: the plug only fits one way.

Library part: it is installed through the component manager, it is not in the
stock palette.

## Placing it on the Uno

Grab the board and bring it over the Uno: when its pins fall opposite the rows,
they snap to them and Kablix lays the 31 wires in one go. The board then goes IN
FRONT of the Uno, as in real life, and moving the Uno takes it along.

## The 3.3 V / 5 V switch

At the bottom left of the board, a small switch picks the voltage sent into the
red wire of **every** Grove socket. Click it: the button slides one notch and
the setting is kept with the diagram.

- **5 V** (starting position): what most Grove modules expect.
- **3.3 V**: for the modules that cannot take 5 V.

Careful, the switch ONLY changes the supply. The signal wires stay at 5 V, since
they come from the Uno.

## The sockets and the pins of the Uno

Every socket carries two signal wires. The name of the socket is the one of its
first signal; the second one is the pin just above. Two neighbouring sockets
therefore always share a pin: **D4** uses 4 and 5, **D5** uses 5 and 6 —
plugging two modules side by side makes pin 5 work for both.

| Socket | Wire 1 | Wire 2 | Uno pins |
|-------|-------|-------|-----------------|
| **D2** | D2 | D3 | 2 and 3 |
| **D3** | D3 | D4 | 3 and 4 |
| **D4** | D4 | D5 | 4 and 5 |
| **D5** | D5 | D6 | 5 and 6 |
| **D6** | D6 | D7 | 6 and 7 |
| **D7** | D7 | D8 | 7 and 8 |
| **D8** | D8 | D9 | 8 and 9 |
| **A0** | A0 | A1 | A0 and A1 |
| **A1** | A1 | A2 | A1 and A2 |
| **A2** | A2 | A3 | A2 and A3 |
| **A3** | A3 | A4 | A3 and A4 |
| **UART** | TX | RX | 1 and 0 |
| **I2C0** to **I2C3** | SDA | SCL | A4 and A5 |

The four **I2C** sockets are wired in parallel: it is the same wire for all
four. That is normal — the I²C bus accepts several modules on the same two
wires, provided each one has a different address.

Two traps to know about:

- the **A3** socket and the **I2C** sockets share A4 (SDA). An I²C module and an
  analog sensor on A3 cannot work together;
- the **UART** socket is wired to pins 0 and 1, the ones the USB cable also
  uses. A module talking on that socket garbles the serial monitor.

Hover a pad: Kablix writes the real Uno pin on it. `I2C0.SDA.A4` means “the SDA
wire of the I2C0 socket arrives on A4” — it is **A4** that has to be written in
the program.

## What the board does not do

The **RESET** button and the small LED of the board are not simulated: they are
special cases and Kablix leaves them aside. Everything else — sockets, supply
rails, switch — works.
