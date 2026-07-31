# Electrolytic capacitor

![Electrolytic capacitor](../../img/composants/condo-p-2.webp)

Aluminium electrolytic capacitor, **polarized**. The high-capacitance member of
the family: exponential charge and discharge, done after 5·R·C.

## Pins

| Pin | Role |
|--------|------|
| **+** | Positive terminal (pin `2`) |
| **−** | Negative terminal (pin `1`), marked by the light stripe on the body |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `ctype` | Type: non-polarized / polarized / electrolytic | electrolytic |
| `value` | Nominal value in farads (`m`, `µ`, `n`, `p` suffixes accepted) | 100µ |
| `vmax` | Maximum rated voltage (V) | 16 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Usage

- Mind the polarity: the light stripe marks the **−** terminal. Wired backwards,
  a real electrolytic swells then bursts.
- Supply filtering: 100 µF to 1000 µF at a regulator's output.
- Long time constant: with 10 kΩ, 100 µF gives τ = 1 s, so 5 s for a full
  charge — clearly visible in the plotter.

---

*Kablix in-house component — drawing by Frank Sauret.*
