# L78SxxCV voltage regulator

![L78SxxCV voltage regulator](l78sxxcv.webp)

A positive linear regulator from STMicroelectronics, in a TO-220 package. It turns a higher input voltage into a **fixed output voltage** (the "xx" in the name), up to **2 A**.

Library part: it is installed through the component manager, it is not in the built-in palette.

## Pins

Seen from the front, marking facing you. The marking follows the voltage set: `78xx`, xx on two digits (5 V → 7805, 12 V → 7812):

| Pin | Role |
| --- | --- |
| **IN** | Input, at least 2 V above the output |
| **GND** | Common ground of input and output |
| **OUT** | Regulated output |

## Properties

- **Output voltage (V)**: 5, 6, 8, 8.5, 9, 12, 15, 18 or 24 V.
- **Max current (A)**: 2 A by default. Beyond that, the voltage collapses.
- **Heatsink (°C/W)**: 0 = none (free air, 50 °C/W). A 5 °C/W heatsink brings the thermal resistance down to 8 °C/W (3 °C/W for the case + 5).

## 2 V margin (dropout)

The regulator needs at least **2 V** more at its input than at its output. For an L78S05 (5 V), the input must therefore be 7 V.

Below this margin, the output no longer holds: it equals **the input minus 2 V**. A new 9 V battery (9.5 V) on an L78S12 only gives 7.5 V.

With no voltage at the input, the output is at 0 V.

## Limited current

If the load asks for more than the max current, the output voltage **collapses**: the regulator limits its current, and the voltage drops in proportion. A 1 Ω resistor on a 5 V regulator limited to 2 A gives 2 V, not 5 V.

## In simulation

The output voltage is recalculated whenever the circuit changes: setting, input voltage, load. The input can come from a bench power supply, a battery, another regulator in cascade, or a board rail (VIN, 5V…).

- A **diode** in series on the input takes away its threshold (0.6 V by default); fitted the wrong way round, nothing gets through.
- A **resistor** in series takes away `R × I`: the input current is the one the regulator delivers. Too much resistance, and the 2 V margin disappears: the output drops.
- The current delivered is **passed on to the input source** (power supply, battery or upstream regulator). A battery therefore drains faster, a power supply goes past its max current.

## Quiescent current

The regulator draws about **5 mA** from its input, even with no load. This current adds to the output current: it is passed on to the source (a battery drains a little faster) and it makes a resistor on the input drop voltage.

## Heating

A linear regulator turns into heat what it takes away from the voltage: **P = (Vin − Vout) × I + Vin × Iq**. The junction temperature is **25 °C + P × thermal resistance** (50 °C/W without a heatsink).

- Above **125 °C**: "too hot" warning, the output still holds.
- At **150 °C**: the thermal protection **cuts the output** (0 V) and the part gets a red frame.

Example: 12 V → 5 V at 0.5 A dissipates 3.6 W, that is 205 °C without a heatsink: cut-off. With a 5 °C/W heatsink, the junction stays at 53 °C.

Limit of the simulation: the capacitors recommended on the input and output are not needed.
