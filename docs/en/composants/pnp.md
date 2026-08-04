# Transistor PNP (generic)

![Generic PNP transistor](../../img/composants/pnp.webp)

Prototype of a **PNP** bipolar transistor: everything is reversed compared to the NPN. The emitter goes to the supply **+**, the load sits on the collector side, and it is driven by **pulling the base low**.

## Pins

The legs are named **1**, **2** and **3**, in drawing order — never E/B/C. Changing the electrode assignment therefore renames no pin, and **no wire is ever orphaned**.

| Pin | Role |
|--------|------|
| **1** | First leg (emitter by default) |
| **2** | Second leg (base by default) |
| **3** | Third leg (collector by default) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `pkg` | Component package | TO-92 |
| `e` | Leg carrying the emitter (1, 2 or 3) | 1 |
| `b` | Leg carrying the base (1, 2 or 3) | 2 |
| `c` | Leg carrying the collector (1, 2 or 3) | 3 |
| `gain` | Current gain β (1 decimal) | 100 |
| `text` | Package marking (one line per typed line) | PNP |
| `vcemax` | Max Vce (V) | 40 |
| `icmax` | Max Ic (A) | 0.6 |

A leg carries **one** electrode only: assigning the emitter to the leg already taken by the collector **swaps** the two.

## Simulation

- Conducts when its **base is low and its emitter high** (emitter to +).
- The current it passes is capped at **Gain × Ib**, just like the NPN.
- Wired as a high-side switch: it feeds a load whose other end is grounded.

## Usage

- Mind the drive from a 5 V board: a 0 V output does pull the base low, but a "high" 3.3 V output does not turn off a PNP whose emitter sits at 5 V. The NPN is simpler to start with.
- To import your own drawing, use the **part creator** (simulation model "Bipolar transistor").

---

*Kablix in-house component — drawing by Frank Sauret.*
