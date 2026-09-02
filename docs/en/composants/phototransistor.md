# Phototransistor

![Phototransistor](../../img/composants/phototransistor.webp)

**Bare** two-pin phototransistor in a clear package: the more light it receives, the more current it lets through. Faster and more sensitive than an [LDR](ldr.md), but **polarized** — the collector goes to the plus side, the emitter to the minus side.

## Pins

| Pin | Role |
|--------|------|
| **c** | Collector — the higher-voltage side |
| **e** | Emitter — the ground side |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `eemax` | Maximum irradiance of the slider (mW/cm²) | 5 |
| `ron` | Resistance at maximum irradiance (Ω) | 200 |
| `rdark` | Resistance in complete darkness (Ω) | 10,000,000 |
| `ee` | Irradiance at the resting point (mW/cm²) | 1 |

## In simulation

A **brightness slider** appears on the part during the simulation: it goes from total darkness up to `eemax`. The current of a phototransistor follows the light received; seen as a resistor, that resistance therefore varies the other way round:

```
R = ron x eemax / ee
```

bounded between `ron` (full light) and `rdark` (complete darkness). With the default values: 200 Ω at 5 mW/cm², 1 kΩ at 1 mW/cm², 10 MΩ in the dark.

## Usage

- **A resistor is mandatory.** On its own, the phototransistor only passes more or less current: nothing turns that current into a readable voltage.
- Usual setup: `5V → 10 kΩ resistor → midpoint → c ... e → GND`, the midpoint going to an analog input. The voltage rises as the light falls.
- Reversed setup (`5V → c ... e → midpoint → resistor → GND`): the voltage rises as the light rises.
- The voltage read by the analog input follows the real voltage divider of the circuit.

## Faults reported

Kablix inspects the circuit when the simulation starts and flags the part in two cases:

- **No series resistor**: only one pin reaches a supply rail, or none. There is no voltage divider, so nothing to measure.
- **Wired straight across the supply**: both pins go directly to the plus and to the ground, with nothing in between. In full light, the circuit would short the supply out.

---

*Kablix part — model `R = ron x eemax / ee`, bounded between `ron` and `rdark`.*
