# Battery 9 V

![Battery 9 V](pile-9v.webp)

The rectangular snap-connector battery (6LR61). New, it gives **9.5 V**; flat, only **6.0 V** is left. Capacity: **500 mAh**.

Library part: it is installed through the component manager, it is not in the original palette.

## Pins

| Pin | Role |
|--------|------|
| **+** | Positive pole, to be wired to the board's power input |
| **−** | Negative pole, to be wired to a board **GND** ground |

## Where to wire it

| Board | Input | Result |
|-------|--------|----------|
| Uno, Nano, Mega | **VIN** (6.2 to 20 V) | Starts, stops when the voltage drops below **6.2 V** |
| Uno, Nano, Mega | **5V** (4.5 to 5.5 V) | Refused: 9.5 V is too much |
| Pico | **VSYS** or **VBUS** (1.8 to 5.5 V) | **The board burns out**: these inputs have no regulator to absorb 9.5 V |

A 9 V battery has little reserve: a Uno drawing 46 mA drains it in about ten hours.

## The “capacity” property

The inspector shows the capacity in **mAh** (default **500**). Lower it to see the end of the story without waiting for hours.

## Simulation

The cell drains at the pace of what it powers, the board included. Its voltage falls in a straight line, from 9.5 V full to 6.0 V empty. The plotter shows three curves: the **charge** (%), the **voltage** (V) and the remaining **battery life** (h).

The simulation stops with a message when the board cannot start, when the voltage leaves the range of the input, or when the cell is empty.

---

*Drawing and sheet: Frank Sauret.*
