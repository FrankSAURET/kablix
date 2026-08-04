# Transistor

![Transistor](../../img/composants/transistor.webp)

Transistor in a TO-92 or TO-220 package. In Kablix it acts as a **controlled switch**: a small base current lets a much larger collector current through, in the ratio given by the model's **gain**. A MOSFET is driven by **voltage** instead: its gate is insulated and draws nothing.

The library holds a single "Transistor": the **model is picked in the properties**, from a list that narrows as you set criteria.

## Picking a model

When you drop the part, the inspector shows the **picker**:

| Criterion | Effect |
|-----------|--------|
| **Type** | NPN, PNP, NPN Darlington, PNP Darlington, N-channel MOSFET |
| **Package** | TO-92 or TO-220 |
| **Max Ic at least** (**Max Id** on a MOSFET) | keeps only models rated for that current |
| **Max Vce at least** (**Max Vds** on a MOSFET) | keeps only models rated for that voltage |
| **Gain at least** | keeps only models with at least that gain — bipolar |
| **Rds(on) at most** | keeps only models below that resistance — MOSFET |

Those last two never overlap: a MOSFET has no gain, a bipolar no Rds(on). The picker only shows the one that fits the chosen family.

Below them, the list of **matching models**: one click sets the reference and the inspector returns to its normal display. The **Change transistor…** button reopens the picker at any time. The **most recently added models** show up in **blue**.

| Family | Models |
|--------|--------|
| NPN | PN2222A, 2N3904, 2N4401, 2N5551, BC337, S8050, BC547, BC548, BC639, MPSA42, BD911 |
| PNP | 2N2907A, 2N3906, 2N4403, 2N5401, BC327, S8550, BC557, BC558, BC640, MPSA92, BD912 |
| NPN Darlington | BC517 |
| PNP Darlington | BC516 |
| N-channel MOSFET | BS170, IRF530 |

BD911, BD912 and IRF530 come in **TO-220**: a power package, up to 15 A.

The last entry of the list is always the **custom model** of the chosen family ("Custom NPN", "Custom N-channel MOSFET"…): the criteria you already set are pre-filled, and **everything stays editable** afterwards — gain or Rds(on), max voltage and current, package marking, electrode assignment.

## Pins

A bipolar part (NPN, PNP, Darlington) carries E, B and C:

| Pin | Role |
|-----|------|
| **E** | Emitter — to ground in the classic NPN circuit |
| **B** | Base — control, ALWAYS behind a resistor |
| **C** | Collector — the load to switch (relay, motor, LED) |

A MOSFET carries G, D and S:

| Pin | Role |
|-----|------|
| **G** | Gate — voltage control, insulated: no current flows in |
| **D** | Drain — the load to switch |
| **S** | Source — to ground on an N-channel part |

Pin names **never** change within a family: switching reference therefore leaves no orphan wire. What changes is the **physical leg** carrying each electrode — the BC5xx family is wired C-B-E where the 2Nxxxx parts are E-B-C, and a BD911 is B-C-E, seen from the flat face. The inspector shows that pinout under the ratings, and each wire follows its electrode.

## Properties

| Property | Role | Default |
|----------|------|---------|
| `ref` | Chosen model | *(empty: picker open)* |
| `pkg` | Package — TO-92 or TO-220 | to92 |
| `gain` | Current gain (β) — custom bipolar | 100 |
| `rdson` | Rds(on) (Ω) — custom MOSFET | 0.5 |
| `vcemax` | Max Vce (max Vds on a MOSFET), in V — custom model | 40 |
| `icmax` | Max Ic (max Id on a MOSFET), in A — custom model | 0.6 |
| `text` | Package marking — custom model | NPN |
| `e` / `b` / `c` | Leg carrying each electrode — custom bipolar | 1 / 2 / 3 |
| `g` / `d` / `s` | Leg carrying each electrode — custom MOSFET | 1 / 2 / 3 |
| `angle` | Orientation (0/90/180/270°) | 0 |

On a commercial reference these values come from the manufacturer's datasheet and cannot be edited: use the **custom model** to set them yourself.

## Simulation

- An NPN conducts when its **base is high and its emitter low**; a PNP, when the base is low and the emitter high. An N-channel MOSFET conducts like an NPN: gate high, source low.
- The current passed is capped at **Gain × Ib**: that is the whole model. So aim for **saturation** — if the load downstream asks for more, it does not work (the fan does not start, the relay does not pull in).
- Vbe = 0.7 V, Vce(sat) = 0.2 V. A base wired **without a resistor** saturates for sure… and would cook a real transistor: fit a base resistor.
- **Darlington**: two junctions in series, hence **Vbe = 1.4 V** and **Vce(sat) = 0.9 V**. Its huge gain (30,000) means a tiny base current is enough — that is the whole point.
- **MOSFET**: with an insulated gate there is **no base current and no gain**. Voltage alone opens the channel, which then passes up to its **max Id**. A gate resistor is therefore not required for it to work (on a real circuit it damps the switching edge).

## Usage

- Typical sizing: to drive a 40 mA relay coil with a gain of 35, you need Ib ≥ 40 / 35 ≈ 1.2 mA. At 5 V, a 1 kΩ base resistor gives (5 − 0.7) / 1000 ≈ 4.3 mA: well saturated.
- Too large a base resistor (100 kΩ) → Ib = 43 µA → max Ic ≈ 1.5 mA: the load never starts. That is the classic mistake to watch in simulation.
- With a relay, the **flyback diode is mandatory** (cathode to the +): without it, the switch-off spike would destroy the transistor.

---

*Kablix in-house part — drawing by Frank Sauret.*
