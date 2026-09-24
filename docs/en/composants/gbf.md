# Function generator

![Function generator](../../img/composants/gbf.webp)

The lab's function generator: it outputs a **signal that varies on its own**, where the [bench power supply](alim.md) outputs a fixed voltage. Three waveforms to choose from — **sine**, **triangle**, **square** — adjustable in frequency, amplitude, offset and duty cycle.

It is the instrument to bring out as soon as a circuit must be **driven by a signal** rather than by a voltage: measuring an RC filter, the response of an amplifier, counting pulses on an input, sampling a sine wave with the analog-to-digital converter.

Palette category: **Measuring instruments**.

## Pins

| Terminal | Role |
|-------|------|
| **Vs** | **Output** banana socket — the signal (red) |
| **GND** | **Black** banana socket — ground, shared with the whole circuit |

The two sockets are 20 px apart (two grid steps). Wire **Vs** to an **analog input** of the board (`A0`…) so the program reads the signal; **GND** must be tied to the board ground, otherwise the two instruments have no common reference and the reading makes no sense.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `waveform` | Waveform: sine, triangle or square | `sinus` |
| `frequency` | **Frequency** (Hz), 1 to 1,000,000 **to the Hz** | `1000` |
| `amplitude` | **Peak-to-peak amplitude** (V), 0 to 10 in steps of **0.1** | `5` |
| `offset` | **DC offset** (V), −5 to +5 in steps of **0.1** | `0` |
| `duty` | **Duty cycle** (%), 0 to 100 **to the percent** | `50` |

> These values are the **starting** state: they come back at every simulation start. The knobs turned during a session do not change the project — the exercise keeps its original settings.

The amplitude is **peak-to-peak**, as on a real function generator: it is the **total** height of the signal, from trough to peak. `amplitude = 5` and `offset = 0` therefore give a curve going from **−2.5 V to +2.5 V**; with `offset = 2.5`, it goes from **0 to 5 V**. Half the amplitude lies on each side of the offset.

Straight out of its box, the instrument has a **zero offset**: its signal is centred on ground, as on a lab bench. Plugged as is into an analog input, it is therefore **clipped** over its whole negative half-cycle (see below) — adding the offset is up to you.

## Adjusting the instrument during the simulation

The **four knobs** turn **with the mouse**, as on a real instrument: press a knob and turn around its centre. **300°** of travel clockwise; the remaining 60° are a **dead zone** where the knob stays stuck to the nearest end. Each display follows its knob, with its unit.

The **slider** on the right picks the waveform: **drag it** up and down — sine at the top, triangle in the middle, square at the bottom.

The knobs are **inert while editing**: they only respond once the simulation is running (while editing, a click moves the instrument). The zoom and the rotation of the part are taken into account.

### The frequency knob is logarithmic

It covers **six decades** (1 Hz → 1 MHz) over 300°: the travel is therefore **logarithmic**, like the decades engraved on the dial of a real function generator. Every fifty degrees or so multiplies the frequency by ten. With a linear travel, a single degree would be worth 3,300 Hz and no fine setting would be possible at the bottom of the range.

The display writes the right unit: `1 Hz`, `250 Hz`, `12,5 kHz`, `1 MHz`.

### The duty cycle shapes the square AND the triangle

- **Square**: the duty cycle is the share of the period spent **high**. At 50 % the signal is symmetrical; at 10 % it is short pulses; at **0 %** it stays low all the time, at **100 %** high all the time — two ways to get a DC voltage.
- **Triangle**: the duty cycle sets the length of the **rise**. At 50 % the triangle is symmetrical (peak in the middle of the period); at 90 % the rise is slow and the fall steep — it is a **sawtooth**. At 10 %, the sawtooth is reversed.
- **Sine**: the duty cycle has **no effect** — a distorted sine would no longer be a sine.

## What the board really reads

The signal is computed **at the exact instant of the analog conversion**, not once per frame: at 1 MHz a period lasts one microsecond, and a value set once per frame would be thousands of periods late. A program reading `analogRead` in a loop does see the waveform.

Beware of **clipping**: an analog input reads neither negative voltages nor anything above its reference voltage (**5 V** on Arduino, **3.3 V** on Pico). A 10 V peak-to-peak signal with no offset (so from −5 V to +5 V) comes out **clipped** — full scale on the peaks, zero over the whole negative half-cycle, and the waveform read has nothing to do with the one on the dial any more. To stay within range, offset it: for instance `amplitude = 3` and `offset = 1.65` on a Pico (the curve then goes from 0.15 V to 3.15 V).

## Usage

- An **RC filter**: Vs on the filter input, the filter output on `A0`, common GND. Turn the frequency and read the attenuation — the [plotter](../USAGE.md) shows the cut-off.
- A **pulse counter**: square waveform, a few Hz, Vs on a digital input. The duty cycle changes the width of the pulses.
- **Sampling**: sine at a few tens of Hz, amplitude and offset centred within the board's range, and `analogRead` in a loop.

---

*Drawing of the instrument made by Frank for Kablix.*
