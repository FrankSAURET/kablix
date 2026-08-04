# Non-polarized capacitor

![Non-polarized capacitor](../../img/composants/condo-np.webp)

Plastic film capacitor, no polarity. In series with a resistor it forms an RC circuit: the voltage across it rises and falls exponentially, reaching full charge (or full discharge) after 5·R·C.

## Pins

| Pin | Role |
|--------|------|
| **1** | Terminal 1 |
| **2** | Terminal 2 (non-polarized: both are equivalent) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `ctype` | Type: non-polarized / polarized / electrolytic | non-polarized |
| `value` | Nominal value in farads (`m`, `µ`, `n`, `p` suffixes accepted) | 100n |
| `vmax` | Maximum rated voltage (V) | 400 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Usage

- The value you type is **printed on the body** of the part (`10µ`, `100n`…).
- Supply decoupling: 100 nF as close as possible to the chip's VCC pin.
- RC measurement: charge through a resistor from a pin driven `HIGH`, read the rise on an analog input. τ = R·C, and 5τ = full charge.
- Also works on an input with the **internal pull-up** (Arduino or Pico): the pull-up (65 kΩ in Kablix; the RP2040 datasheet gives 50 to 80 kΩ) acts as the charging resistor, no external resistor needed. On the Pico the internal **pull-down** discharges the capacitor the same way.
- The library lists a single **Capacitor**: the type (film, tantalum, electrolytic) is picked in the `ctype` property.
- Changing `ctype` does not rename the pins: wires already drawn stay put.
- The **plotter** shows the exponential **without a single line of code**: every voltage applied to an analog input is plotted by an internal probe, named after the converter channel and the pin (`ADC0 (A0)`, `ADC0 (GP26)`…). Put several RC branches in parallel on the same driving pin and their curves compare on one graph.

---

*Kablix in-house component — drawing by Frank Sauret.*
