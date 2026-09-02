# Grove light sensor

![Grove light sensor](grove-light-sensor.webp)

A small board with an electronic eye on it. The more light it gets, the more
current it lets through: the board turns that current into a voltage and hands
it over on a single wire. This is the sensor of night lights that come on when
darkness falls, and of screens that dim on their own in the dark.

Library part: it is installed through the component manager, it is not in the
stock palette.

## Pins

It is a four-wire Grove socket, in the order of the cable:

| Pin | Role |
|--------|------|
| **GND** (black) | Ground |
| **VCC** (red) | Supply, 3.3 V or 5 V |
| **NC** | Nothing at all — this wire is unused |
| **SIG** (yellow) | Output, to be wired to an **analog input** (A0, GP26…) |

The output is not an all-or-nothing one: it is a voltage that rises gently. It
must therefore go to an input able to measure, not to a plain digital pin.

## What the output is worth

| Light | Voltage on **SIG** |
|---------|---------------------|
| Complete darkness | close to **0 V** |
| A lit room | halfway |
| Full sunlight | close to the supply voltage |

On the program side, `analogRead(A0)` returns **0** in the dark and **1023** in
full light on an Arduino; `ADC.read_u16()` returns **0** to **65535** on a Pico.
A threshold is enough to switch a lamp on at nightfall:

```c
if (analogRead(A0) < 200) { /* it is getting dark: switch on */ }
```

## The “full-scale illuminance” property

The inspector shows a value in **lux** (**500 lx** by default). The lux is the
unit of the light received: a few lux for a candle, 500 for a well-lit desk,
more than 10,000 outside on a fine day.

That value says **at which illuminance the sensor reaches the end of its
travel**, that is, when its output voltage hits the maximum. Change it and the
simulation slider changes its graduation with it: set 10,000 lx and the slider
goes from 0 to 10,000.

## Simulation

In simulation, the part shows an **Illuminance** slider, graduated from **0** to
the full-scale value. Drag it: the voltage of the `SIG` pin follows at once, in
a straight line — 0 lx gives 0 V, full scale gives the supply voltage of the
board (5 V or 3.3 V). The program reads the change on the next round.

The real sensor does not answer in quite a straight line, and it sees green a
little better than red or blue. On a real circuit you therefore read the values
that matter (dark room, lit room) before picking your threshold.

## Careful

- The sensor does **not** give lux: it gives a voltage. To read real lux you
  need a direct-measurement sensor (a TSL2561 on the I²C bus, for instance).
- Do not put it facing the lamp it drives: the lamp would come on, light it up,
  it would switch the lamp off, and so on. That endless blinking is avoided by
  moving the two apart, or by keeping a gap between the threshold that switches
  on and the one that switches off.

---

*Drawing and sheet: Frank Sauret. Reference: [Grove - Light Sensor](https://wiki.seeedstudio.com/Grove-Light_Sensor/).*
