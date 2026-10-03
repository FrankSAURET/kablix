# LiPo battery 1S

![LiPo battery 1S](batterie-lipo.webp)

A single lithium-polymer cell, the kind found in drones and smartwatches. Charged, it gives **4.2 V**; empty, only **3.0 V** is left. Capacity: **1000 mAh**.

Library part: it is installed through the component manager, it is not in the original palette.

## Pins

| Pin | Role |
|--------|------|
| **+** | Positive pole, to be wired to the board's power input |
| **−** | Negative pole, to be wired to a board **GND** ground |

## Where to wire it

| Board | Input | Result |
|-------|--------|----------|
| Pico | **VSYS** or **VBUS** (1.8 to 5.5 V) | Starts and runs until the battery is empty |
| Uno, Nano, Mega | **VIN** (6.2 to 20 V) | Refused: 4.2 V is too low |
| Uno, Nano, Mega | **5V** (4.5 to 5.5 V) | Refused: 4.2 V is too low |

On a real circuit, a LiPo is never drained below 3.0 V: it would be damaged. Protection boards cut off before that.

## The “capacity” property

The inspector shows the capacity in **mAh** (default **1000**). Lower it to see the end of the story without waiting for hours.

## Simulation

The battery drains at the pace of what it powers, the board included. Its voltage falls in a straight line, from 4.2 V full to 3.0 V empty. The plotter shows three curves: the **charge** (%), the **voltage** (V) and the remaining **battery life** (h).

The simulation stops with a message when the board cannot start, when the voltage leaves the range of the input, or when the battery is empty.

---

*Drawing and sheet: Frank Sauret.*
