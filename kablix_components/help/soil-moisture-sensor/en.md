# Soil moisture sensor

![Soil moisture sensor](soil-moisture-sensor.webp)

Two prongs you push into the soil of a pot. Dry soil lets the current through
badly, wet soil lets it through well: the sensor measures that flow and hands it
over on a single wire, as a voltage. This is the sensor of automatic watering.

Library part: it is installed through the component manager, it is not in the
stock palette.

## Pins

| Pin | Role |
|--------|------|
| **+** (red) | Supply, 5 V on an Arduino, 3.3 V on a Pico |
| **−** (black) | Ground |
| **S** (signal) | Output, to be wired to an **analog input** (A0, GP26…) |

The output is not an all-or-nothing one: it is a voltage that rises gently. It
must therefore go to an input able to measure, not to a plain digital pin.

## What the output is worth

| Soil | Current flow | Voltage on **S** |
|-------|--------------------|-------------------|
| Dry | poor | close to **0 V** |
| Damp | middling | halfway |
| Soaked | good | close to the supply voltage |

On the program side, `analogRead(A0)` returns **0** for dry and **1023** for
soaked on an Arduino; `ADC.read_u16()` returns **0** to **65535** on a Pico. A
threshold is enough to decide to water:

```c
if (analogRead(A0) < 350) { /* too dry: water it */ }
```

## Simulation

In simulation, the part shows a **Soil moisture** slider, graduated from
**0 to 100 %**. Drag it: the voltage of the `S` pin follows at once, in a
straight line — 0 % gives 0 V, 100 % gives the supply voltage of the board (5 V
or 3.3 V). The program reads the change on the next round.

The real sensor never quite goes down to zero and never quite up to the maximum:
every unit has its own range. On a real circuit you therefore read both extreme
values (prongs in open air, prongs in a glass of water) before picking your
threshold.

## Careful

- Do not leave the prongs **permanently powered** in the soil: the current going
  through them eats them away (they oxidize). On a real circuit, the sensor is
  powered just for the time of the reading, from an output pin.
- Soil is not a reliable measure of watering on its own: two different soils do
  not conduct the same at equal moisture.

---

*Drawing and sheet: Frank Sauret. Reference: [DFRobot SEN0114](https://www.dfrobot.com/product-599.html).*
