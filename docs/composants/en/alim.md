# Bench power supply

![Bench power supply](../img/alim.png)

DC voltage source **adjustable from 0 to 30 V**, with current limiting.
It powers a circuit **without a microcontroller** (a LED lights up on the supply
alone) or provides the power the board cannot deliver: servo motors,
*Power In* terminal of the [PCA9685 PWM driver](pca9685.md), LED strips…

Palette category: **Instruments**.

## Pins

| Terminal | Role |
|-------|------|
| **V+** | **Red** banana jack — positive pole (high rail of the circuit) |
| **GND** | **Black** banana jack — ground (0 V, common to the whole circuit) |

The two jacks are 20 px apart (two grid steps). Wires connected to
V+ and GND automatically take the red and black colors.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `voltage` | **Startup voltage** (V), 0 to 30 in steps of 0.1 | `5` |
| `maxcurrent` | Maximum supplied current (A), 0.1 to 10 in steps of 0.1 | `1` |

> `voltage` is the value at simulation **start**: the knob then varies it
> freely, and the voltage restarts from this value at each new run.

## Setting the voltage during simulation

The panel knob is turned **with the mouse**, like on a real instrument:
press on it and rotate around its center.

- A **300°** clockwise travel goes from **0 V to 30 V**
  (i.e. 10° per volt); the remaining 60° is a **dead zone** — when entering it,
  the knob stays stuck to the nearest end (0 V or 30 V).
- The display shows the current voltage to the hundredth (`0.00` to `30.00`).
- The knob is **inert while editing**: it only turns once the simulation
  is running. Component zoom and rotation are taken into account.

## Current limiting

Kablix continuously estimates the current delivered by the supply (an
educational approximation, recomputed every frame):

- most direct resistive path from **V+ to ground** (Ohm's law; a wire directly
  connecting V+ to GND is a **short circuit**);
- each **LED** going back up to the supply's V+: `(V − Vf) / R`;
- **0.2 A per servo motor** powered by the V+ rail;
- the consumption declared by powered modules (PCA9685 terminal…).

When this current exceeds `maxcurrent`, the **"Current limit"** LED lights up
bright red with a halo — exactly like a real supply entering current
limiting. Increase the maximum current, or fix the circuit (missing series
resistor, short circuit).

## Usage

- Wire **V+** to the positive rail of the circuit and **GND** to ground — the
  ground must be **common** with the board's if both power the same circuit.
- Check the voltage **before** connecting: 30 V on a LED + 220 Ω burns it,
  2.5 V on a blue LED does not light it.
- For servos or a PCA9685: **~5 V** and a maximum current covering
  the load (0.2 A per servo). Below that, the outputs do not move.

---

*Instrument drawing made by Frank for Kablix.*
