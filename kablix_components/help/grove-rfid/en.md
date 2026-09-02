# Grove 125 kHz RFID reader

![Grove 125 kHz RFID reader](grove-rfid.webp)

A board that reads badges without touching them. The big wire loop, at the
bottom, builds an invisible field. When a badge enters it, it draws just enough
energy from it to wake up — it has **no battery** — and it recites its number.
The board listens, and repeats that number to the microcontroller. This is the
reader of building badges and canteen cards.

Library part: it is installed through the component manager, it is not in the
stock palette.

## Pins

It is a four-wire Grove socket:

| Pin | Role |
|--------|------|
| **GND** (black) | Ground |
| **VCC** (red) | Supply, 3.3 V or 5 V |
| **Rx** | Module input — used as **DATA1** in Wiegand mode |
| **Tx** | Module output — the number, or **DATA0** in Wiegand mode |

The module **talks**, it does not wait to be asked. Its two data wires therefore
go to **inputs** of the board.

## The jumper: two languages

The small jumper, at the top left, picks how the board tells the number. Click
it to move it.

**Left — UART.** The number goes out in clear on **Tx**, as text, at
**9600 baud**, followed by a line break. A single wire is enough. On the Arduino
side, a software serial link reads it:

```c
#include <SoftwareSerial.h>
SoftwareSerial rfid(2, 3);   // 2 = Rx of the Arduino, wired to the Tx of the module

void setup() { Serial.begin(9600); rfid.begin(9600); }
void loop() {
  if (rfid.available()) Serial.write(rfid.read());
}
```

**Right — Wiegand.** The number goes out as **pulses** on two wires, **Tx** =
DATA0 and **Rx** = DATA1. Both wires stay high at rest; a **0** is a short dip
on DATA0, a **1** a short dip on DATA1 — 50 µs each, 2 ms between two. There are
**26 pulses**, from the most significant bit to the least significant one. You
count them with interrupts:

```c
volatile unsigned long word = 0;
volatile int count = 0;
void zero() { word = (word << 1);     count++; }
void one()  { word = (word << 1) | 1; count++; }

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP); pinMode(3, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), zero, FALLING);
  attachInterrupt(digitalPinToInterrupt(3), one,  FALLING);
}
void loop() {
  if (count >= 26) { Serial.println(word, HEX); count = 0; word = 0; }
}
```

Wiegand works everywhere. UART, on the other hand, needs a serial link on the
board side: on an Arduino a **software** link does the job, and it is the one
that reads the wire. **On a Pico, pick Wiegand**: the hardware serial link of
the chip does not listen to the pins in simulation, the UART mode would stay
mute there.

## Simulation

The green and blue **arrow**, under the loop, moves the badge. Click it: the
badge slides into the loop and the arrow flips over. Click again: it comes back
out.

As long as the badge is **in the loop**, the module repeats its number **once a
second**, exactly like the real one. The number sent is shown in the small
**CodeRFID** window of the drawing. It is drawn at random among three badges, as
if you had three of them in your pocket:

| Jumper | Badges |
|----------|--------|
| UART | `0F0034AB12` · `0F00A17C45` · `0F0059D3E8` |
| Wiegand | `1A34B12` · `0C71D9E` · `23F80A5` |

Once the badge is out of the loop, the window empties and the wires go mute
again.

The jumper can be moved **during** the simulation: the circuit is read again on
its own, without stopping the program.

## Careful

- The real module adds two framing characters and a checksum around the number.
  Here the number goes out on its own, followed by a line break: that is easier
  to read while learning, but a program written for the real module will look
  for those extra characters.
- Those badges are **read-only** and their number is copied without any trouble:
  good enough to open a drawer, not to keep a secret.
- A badge is only read a few centimetres from the loop, and metal right behind
  the loop hinders the reading.
- On an Arduino, only pins **2** and **3** can wake the program up through an
  interrupt: that is where the two Wiegand wires have to be plugged.

---

*Drawing and sheet: Frank Sauret. Reference: [Grove - 125KHz RFID Reader](https://wiki.seeedstudio.com/Grove-125KHz_RFID_Reader/).*
