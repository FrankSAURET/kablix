# Fan

![Fan](../../img/composants/ventilo.webp)

DC fan. The blades spin faster as the applied voltage rises; it can also be
driven by **PWM**.

## Pins

| Pin | Role |
|--------|------|
| **+** | Supply (red wire) |
| **−** | Ground (black wire) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `voltage` | Rated voltage (V) | 5 |
| `current` | Current draw (A) | 0.85 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Usage

- **Strict** physics: the fan only starts if the source can actually deliver
  `current`. Below 30 % of its rated speed it stays still, like a real motor
  that hums without turning.
- **An MCU pin is not enough**: it gives 40 mA at best, against the 850 mA
  required. Use an external supply switched by a transistor or a MOSFET.
- PWM control: `analogWrite()` (Arduino) or `PWM` (MicroPython) on the control
  pin; blade speed follows the duty cycle.
- Add a flyback diode across the motor to absorb the switch-off spike.
- **Reading the speed on screen**: a monitor only shows one frame every 1/60 s.
  Past two or three turns per second, a 7-blade fan would seem to slow down and
  then spin backwards (the wagon-wheel effect seen in westerns). The displayed
  rotation is therefore capped just below that point, and above it the **blur of
  the blades** carries the speed — exactly what the eye sees on a real fan.

---

*Kablix in-house component — drawing by Frank Sauret.*
