# Transistor

![Transistor](../../img/composants/transistor.webp)

Bipolar transistor in a TO-92 package. In Kablix it acts as a **controlled
switch**: a small base current lets a much larger collector current through, in
the ratio given by the model's **gain**.

The library holds a single "Transistor": the **model is picked in the
properties**, from a list that narrows as you set criteria.

## Picking a model

When you drop the part, the inspector shows the **picker**:

| Criterion | Effect |
|-----------|--------|
| **Type** | NPN or PNP |
| **Package** | TO-92 (more to come) |
| **Max Ic at least** | keeps only models rated for that current |
| **Max Vce at least** | keeps only models rated for that voltage |
| **Gain at least** | keeps only models with at least that gain |

Below them, the list of **matching models**: one click sets the reference and
the inspector returns to its normal display. The **Change transistor…** button
reopens the picker at any time.

Models offered: PN2222A, 2N3904, 2N4401, 2N5551, BC337, S8050, BC547, BC548
(NPN); 2N2907A, 2N3906, 2N4403, 2N5401, BC327, S8550, BC557, BC558 (PNP).

The last entry of the list is always **Custom NPN** (or **Custom PNP**): the
criteria you already set are pre-filled, and **everything stays editable**
afterwards — gain, max Vce, max Ic, package marking, electrode assignment.

## Pins

| Pin | Role |
|-----|------|
| **E** | Emitter — to ground in the classic NPN circuit |
| **B** | Base — control, ALWAYS behind a resistor |
| **C** | Collector — the load to switch (relay, motor, LED) |

Pin names **never** change, whatever the model: switching reference therefore
leaves no orphan wire. What changes is the **physical leg** carrying each
electrode — the BC5xx family is wired C-B-E where the 2Nxxxx parts are E-B-C,
seen from the flat face. The inspector shows that pinout under the ratings, and
each wire follows its electrode.

## Properties

| Property | Role | Default |
|----------|------|---------|
| `ref` | Chosen model | *(empty: picker open)* |
| `gain` | Current gain (β) — custom model | 100 |
| `vcemax` | Max Vce (V) — custom model | 40 |
| `icmax` | Max Ic (A) — custom model | 0.6 |
| `text` | Package marking — custom model | NPN |
| `e` / `b` / `c` | Leg carrying each electrode — custom model | 1 / 2 / 3 |
| `angle` | Orientation (0/90/180/270°) | 0 |

On a commercial reference these values come from the manufacturer's datasheet
and cannot be edited: use the **custom model** to set them yourself.

## Simulation

- An NPN conducts when its **base is high and its emitter low**; a PNP, when the
  base is low and the emitter high.
- The current passed is capped at **Gain × Ib**: that is the whole model. So aim
  for **saturation** — if the load downstream asks for more, it does not work
  (the fan does not start, the relay does not pull in).
- Vbe = 0.7 V, Vce(sat) = 0.2 V. A base wired **without a resistor** saturates
  for sure… and would cook a real transistor: fit a base resistor.

## Usage

- Typical sizing: to drive a 40 mA relay coil with a gain of 35, you need
  Ib ≥ 40 / 35 ≈ 1.2 mA. At 5 V, a 1 kΩ base resistor gives
  (5 − 0.7) / 1000 ≈ 4.3 mA: well saturated.
- Too large a base resistor (100 kΩ) → Ib = 43 µA → max Ic ≈ 1.5 mA: the load
  never starts. That is the classic mistake to watch in simulation.
- With a relay, the **flyback diode is mandatory** (cathode to the +): without
  it, the switch-off spike would destroy the transistor.

---

*Kablix in-house part — drawing by Frank Sauret.*
