# Power bank

![Power bank](../../img/composants/powerbank.webp)

Portable USB battery: **fixed 5 V** voltage source, with no adjustment — unlike the [bench power supply](alim.md), it has no knob. It powers a circuit **without a microcontroller** (a LED lights up on the battery alone), provides the power the board cannot deliver — servo motors, *Power In* terminal of the [PCA9685 PWM driver](pca9685.md)… — or **powers the board itself**, and then drains with its consumption.

Palette category: **Misc**.

## Pins

| Terminal | Role |
|-------|------|
| **V+** | positive pole — fixed 5 V |
| **GND** | ground (0 V, common to the whole circuit) |

Wires connected to V+ and GND automatically take the red and black colors.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `maxcurrent` | Maximum supplied current (A), 0.1 to 10 in steps of 0.1 | `2` |
| `capacity` | Capacity (mAh), 1 to 50,000 | `10000` |

The voltage is not adjustable: unlike the bench power supply, the battery has neither a knob nor a display.

## Charge indicators

The four white LEDs on the drawing form the **charge gauge**: full at start (all four lit, with a halo), it loses one LED per quarter of charge used — one LED per **started** quarter stays lit, as on a real battery. Empty, no LED at all: its output falls to 0 V and everything it powers goes off. Each start makes it full again.

## Discharge and battery life

The battery drains by what it delivers, in **program time** (slowed down or sped up, one second of program uses the same amount):

- its direct loads — LEDs, resistors, servos wired to **V+**;
- **the whole board** when it is the one powering it: **V+** on a board power input (**5V** of an Arduino, **VSYS** or **VBUS** of a Pico — on **VIN**, 5 V is not enough for the regulator: the board refuses to start) and **GND** on a board ground. The board then draws nothing from USB: its consumption — itself, plus what its pins power — comes out of the battery (see *Board consumption* in the user guide).

The [plotter](../USAGE.md) shows two curves per battery: **`Bat1: charge`** (%) and **`Bat1: battery life`** (hours left at the present current). When the battery powering the board is empty, **the board switches off**: the simulation stops and the status bar says after how long of program.

> A real 10,000 mAh battery runs an Uno for more than nine days: to watch it drain during a session, set `capacity` to **1 mAh**. The `consommation-uno` test project does so.

## Current limiting

Same mechanism as the bench power supply: Kablix continuously estimates the delivered current (most direct resistive path from V+ to ground, LEDs going back up to V+, 0.2 A per servo motor, declared consumption of powered modules…). Beyond `maxcurrent`, the circuit behaves as under-powered (a PCA9685's outputs stop moving, for example).

## Usage

- Wire **V+** to the positive rail of the circuit and **GND** to ground — the ground must be **common** with the board's if both power the same circuit.
- Handy for powering servo motors or a PCA9685 without setting a voltage: the battery always outputs 5 V.
- Check that `maxcurrent` covers the load (0.2 A per servo): otherwise the outputs do not move.
- To measure a circuit's **battery life**, have the board powered by the battery (V+ on 5V or VSYS, GND on GND) and read the battery-life curve on the plotter: putting the microcontroller to sleep makes it climb — a lot on a Pico, a little on an Uno.

---

*Instrument drawing made by Frank for Kablix.*
