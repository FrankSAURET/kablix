# PTC thermistor

![PTC thermistor](../../img/composants/ptc.png)

**Positive** temperature coefficient thermistor: its resistance **rises** with
temperature. Used as a linear sensor (KTY-style probes) or as a resettable
overcurrent protection.

## Pins

| Pin | Role |
|--------|------|
| **1** | Terminal 1 |
| **2** | Terminal 2 (non-polarized) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `r25` | Resistance at 25 °C (Ω) | 2000 |
| `tc` | Temperature coefficient (%/°C) | 0.79 |
| `tmin` | Slider minimum temperature (°C) | -55 |
| `tmax` | Slider maximum temperature (°C) | 125 |

## In simulation

A **temperature slider** appears on the part while simulating, bounded by `tmin`
and `tmax`. Resistance follows a linear law:

```
R = r25 x ( 1 + (tc/100) x (T - 25) )
```

With the defaults: 2 kΩ at 25 °C, ~1.6 kΩ at 0 °C, ~2.4 kΩ at 50 °C.

## Usage

- Same wiring as the [NTC](ntc.md): voltage divider with a fixed resistor close
  to `r25`, midpoint going to an analog input.
- Unlike the NTC, the voltage read **increases** with temperature when the PTC
  sits on the high side of the divider.
- Non-polarized part: the two leads are equivalent.

---

*Kablix component — linear model `R = r25 x (1 + tc/100 x (T - 25))`.*
