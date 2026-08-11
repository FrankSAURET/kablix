# Trimmer potentiometer

![Trimmer potentiometer](../../img/composants/pot-rot2.webp)

A small potentiometer **set with a screwdriver** (trimmer, preset): you adjust it once to tune a threshold, a contrast or a zero, then leave it alone. Electrically it is the same part as the rotary [potentiometer](pot.md) — a resistive track and a wiper running along it.

## Pins

The legs carry the markings of the drawing: **1** and **2** are the ends of the track, **V** is the wiper.

| Pin | Marking | Role |
|-----|---------|------|
| **GND** | 1 | Low end of the track (ground) |
| **SIG** | V | Wiper → analog input |
| **VCC** | 2 | High end of the track (+) |

## Properties

| Property | Role | Default |
|----------|------|---------|
| `ohms` | Nominal value: total resistance between legs 1 and 2 (Ω) | 10,000 |
| `value` | Initial position (0–100 %) | 50 |

## The code printed on the case

The nominal value is printed on the part by itself, as a **three-digit code**: the first two digits are the significant figures, the third one tells how many zeros to append.

| Value | Code |
|-------|------|
| 220 Ω | 221 |
| 4.7 kΩ | 472 |
| 10 kΩ | 103 |
| 100 kΩ | 104 |
| 1 MΩ | 105 |

Changing `ohms` rewrites the code: this is the real part you would pick from a drawer, not a sticker on top of it.

## Usage

- V to an analog input (A0…, GP26–GP28), read with `analogRead()` (0–1023) or `ADC.read_u16()` (0–65535).
- Adjust in simulation: **drag the screw** with the mouse, or arrows / Page ↑↓ after a click. Like the other interactive parts, **move it with the right click** (the left click turns the screw).
- While the simulation runs, the label above the part gives the position **and** both halves of the track; they always add up to the nominal value.
- Wired as a **variable resistor** (a single end used), it is just a rheostat: leaving the other end unconnected still means a floating input on the microcontroller side.

---

*Kablix in-house component — drawing by Frank Sauret.*
