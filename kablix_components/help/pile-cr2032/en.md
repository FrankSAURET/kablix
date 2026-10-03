# Coin cell CR2032

![Coin cell CR2032](pile-cr2032.webp)

The flat lithium cell of watches and motherboards. New, it gives **3.0 V**; flat, only **2.0 V** is left. Capacity: **220 mAh**.

Library part: it is installed through the component manager, it is not in the original palette.

## Pins

| Pin | Role |
|--------|------|
| **+** | Positive pole, to be wired to the board's power input |
| **−** | Negative pole, to be wired to a board **GND** ground |

## Where to wire it

| Board | Input | Result |
|-------|--------|----------|
| Pico | **VSYS** or **VBUS** (1.8 to 5.5 V) | Starts and runs until the cell is flat |
| Uno, Nano, Mega | **VIN** (6.2 to 20 V) | Refused: 3 V is too low |
| Uno, Nano, Mega | **5V** (4.5 to 5.5 V) | Refused: 3 V is too low |

A CR2032 suits a circuit that sleeps most of the time: a Pico in deep sleep draws about 1.3 mA, awake 21 mA.

## The “capacity” property

The inspector shows the capacity in **mAh** (default **220**). Lower it to see the end of the story without waiting for hours.

## Simulation

The cell drains at the pace of what it powers, the board included. Its voltage falls in a straight line, from 3.0 V full to 2.0 V empty. The plotter shows three curves: the **charge** (%), the **voltage** (V) and the remaining **battery life** (h).

The simulation stops with a message when the board cannot start, when the voltage leaves the range of the input, or when the cell is empty.

---

*Drawing and sheet: Frank Sauret.*
