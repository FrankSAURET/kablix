# Power bank

![Power bank](../../img/composants/powerbank.webp)

Portable USB battery: **fixed 5 V** voltage source, with no adjustment — unlike the [bench power supply](alim.md), it has no knob. It powers a circuit **without a microcontroller** (a LED lights up on the battery alone) or provides the power the board cannot deliver: servo motors, *Power In* terminal of the [PCA9685 PWM driver](pca9685.md)…

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

The voltage is not adjustable: unlike the bench power supply, the battery has neither a knob nor a display.

## Charge indicators

The four white LEDs on the drawing (charge gauge) light up **together, with a halo**, as soon as the simulation starts, and turn off when it stops. They indicate the battery is active — not a simulated charge level: Kablix does not model discharge.

## Current limiting

Same mechanism as the bench power supply: Kablix continuously estimates the delivered current (most direct resistive path from V+ to ground, LEDs going back up to V+, 0.2 A per servo motor, declared consumption of powered modules…). Beyond `maxcurrent`, the circuit behaves as under-powered (a PCA9685's outputs stop moving, for example).

## Usage

- Wire **V+** to the positive rail of the circuit and **GND** to ground — the ground must be **common** with the board's if both power the same circuit.
- Handy for powering servo motors or a PCA9685 without setting a voltage: the battery always outputs 5 V.
- Check that `maxcurrent` covers the load (0.2 A per servo): otherwise the outputs do not move.

---

*Instrument drawing made by Frank for Kablix.*
