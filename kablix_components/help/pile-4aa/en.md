# 4 × AA battery pack

![4 × AA battery pack](pile-4aa.webp)

Four AA alkaline cells in series in a holder. New, they give **6.4 V**; flat, only **4.4 V** is left. Capacity: **2500 mAh**.

Library part: it is installed through the component manager, it is not in the original palette.

## Pins

| Pin | Role |
|--------|------|
| **+** | Positive pole, to be wired to the board's power input |
| **−** | Negative pole, to be wired to a board **GND** ground |

## Where to wire it

| Board | Input | Result |
|-------|--------|----------|
| Uno, Nano, Mega | **VIN** (6.2 to 20 V) | Starts, but stops as soon as the voltage drops below **6.2 V** |
| Uno, Nano, Mega | **5V** (4.5 to 5.5 V) | Refused: 6.4 V is too much |
| Pico | **VSYS** or **VBUS** (1.8 to 5.5 V) | **The board burns out**: these inputs have no regulator to absorb 6.4 V |

On VIN, the board's regulator needs headroom: four new cells only just make it, and the board switches off well before the cells are flat. On a real circuit it is the same — which is why you often see six AA cells on a Uno.

## The “capacity” property

The inspector shows the capacity in **mAh** (default **2500**). Lower it to see the end of the story without waiting for hours.

## Simulation

The battery pack drains at the pace of what it powers, the board included. Its voltage falls in a straight line, from 6.4 V full to 4.4 V empty. The plotter shows three curves: the **charge** (%), the **voltage** (V) and the remaining **battery life** (h).

The simulation stops with a message when the board cannot start, when the voltage leaves the range of the input, or when the battery pack is empty.

---

*Drawing and sheet: Frank Sauret.*
