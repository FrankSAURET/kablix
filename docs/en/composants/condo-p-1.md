# Polarized capacitor (tantalum)

![Polarized capacitor (tantalum)](../../img/composants/condo-p-1.webp)

Tantalum bead capacitor, **polarized**. Same RC behaviour as the non-polarized
model — exponential charge and discharge, done after 5·R·C — but it must not be
wired backwards.

## Pins

| Pin | Role |
|--------|------|
| **+** | Positive terminal (pin `2`) |
| **−** | Negative terminal (pin `1`), to ground |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `ctype` | Type: non-polarized / polarized / electrolytic | polarized |
| `value` | Nominal value in farads (`m`, `µ`, `n`, `p` suffixes accepted) | 10µ |
| `vmax` | Maximum rated voltage (V) | 16 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Usage

- Drop the **Capacitor** from the library, then set `ctype` to "polarized":
  the tantalum has no entry of its own in the palette.
- Mind the polarity: **+** to the higher potential, **−** to ground.
- The value you type is printed on the body of the part.
- Energy reservoir next to a load that draws current spikes (servo, motor),
  alongside a 100 nF decoupling capacitor.
- Tantalum tolerates overvoltage poorly: keep a comfortable margin on `vmax`.

---

*Kablix in-house component — drawing by Frank Sauret.*
