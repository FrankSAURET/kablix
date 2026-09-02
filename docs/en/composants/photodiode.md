# Photodiode

![Photodiode](../../img/composants/photodiode.webp)

**Bare** two-pin photodiode in a clear package: it lets through a current proportional to the light it receives. Same principle as the [phototransistor](phototransistor.md), but **without its amplification**: for the same illumination, a photodiode passes about a hundred times less current. In exchange it is faster and more faithful.

It works **in reverse**: the cathode goes to the plus side, the anode to the minus side.

## Pins

| Pin | Role |
|--------|------|
| **K** | Cathode — the higher-voltage side |
| **A** | Anode — the ground side |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `eemax` | Maximum irradiance of the slider (mW/cm²) | 5 |
| `ron` | Resistance at maximum irradiance (Ω) | 20,000 |
| `rdark` | Resistance in complete darkness (Ω) | 100,000,000 |
| `ee` | Irradiance at the resting point (mW/cm²) | 1 |

## In simulation

A **brightness slider** appears on the part during the simulation: it goes from total darkness up to `eemax`. The current follows the light received; seen as a resistor, that resistance therefore varies the other way round:

```
R = ron x eemax / ee
```

bounded between `ron` (full light) and `rdark` (complete darkness). With the default values: 20 kΩ at 5 mW/cm², 100 kΩ at 1 mW/cm², 100 MΩ in the dark.

## Usage

- **A resistor is mandatory.** On its own, the photodiode only passes more or less current: nothing turns that current into a readable voltage.
- Usual setup: `5V → K ... A → midpoint → 100 kΩ resistor → GND`, the midpoint going to an analog input. The voltage rises as the light rises.
- Reversed setup (`5V → resistor → midpoint → K ... A → GND`): the voltage rises as the light falls.
- The load resistor is **large** (100 kΩ typically): the current is small, it takes a high resistance to draw a voltage from it.
- Mind the direction: cathode to the plus side. The other way round, the diode conducts all the time and light no longer changes anything.

## Faults reported

Kablix inspects the circuit when the simulation starts and flags the part in two cases:

- **No series resistor**: only one pin reaches a supply rail, or none. There is no voltage divider, so nothing to measure.
- **Wired straight across the supply**: both pins go directly to the plus and to the ground, with nothing in between.

---

*Kablix part — model `R = ron x eemax / ee`, bounded between `ron` and `rdark`.*
