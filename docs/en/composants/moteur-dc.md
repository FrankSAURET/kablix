# DC motor

![DC motor](../../img/composants/moteur-dc.webp)

Small DC motor with its output pinion. It spins faster as the applied voltage
rises; it can also be driven by **PWM**. Unlike the fan it is **not polarised**:
swapping its two wires simply reverses the direction of rotation.

## Pins

| Pin | Role |
|--------|------|
| **1** | First terminal |
| **2** | Second terminal |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `voltage` | Rated voltage (V) | 5 |
| `current` | No-load current (A) | 0.2 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Simulation

- Speed follows the **voltage** actually applied: `voltage` = full speed, half
  of it = half speed.
- **Strict** physics: the motor is seen as its no-load resistance
  (`voltage` / `current`, i.e. 25 Ω for a 5 V / 0.2 A motor). If it draws more
  current than the source can deliver it **does not start** — message *"The
  supply cannot deliver the motor current"*.
- Below **30 % of its rated voltage** it stays still: a real motor hums without
  turning.
- Above **1.5 times its rated voltage** it **burns out**: explosion on the
  diagram and message *"Motor overvoltage: it burned out"*. Stopping and
  restarting the simulation brings it back as new.
- **An MCU pin is not enough**: it gives 40 mA at best, against the 200 mA
  required. Use an external supply switched by a transistor or a MOSFET.
- **A flyback diode is mandatory** as soon as the motor is switched by a
  transistor, **cathode towards the +**. Without it the **transistor** is the
  one that explodes (message *"A flyback diode is mandatory"*); fitted the wrong
  way round, message *"Diode reversed"*. A MOSFET whose internal schematic
  already carries its **body diode** (BS170, IRF530) needs none.
- Every message **names the culprit** and **draws a red frame** around it on the
  diagram, with a yellow-on-red label next to it explaining the problem. The
  frame disappears once the fault is fixed, and when the simulation stops.

## Usage

- Typical circuit: MCU pin → 1 kΩ resistor → base of a PN2222A; emitter to
  ground; collector on motor terminal **2**; terminal **1** to the supply +;
  diode between terminal 1 (cathode) and terminal 2 (anode).
- PWM control: `analogWrite()` (Arduino) or `PWM` (MicroPython) on the control
  pin; speed follows the duty cycle.
- **Reading the speed on screen**: a monitor only shows one frame every 1/60 s.
  Past a few turns per second the pinion would seem to slow down and then spin
  backwards (the wagon-wheel effect seen in westerns). The displayed rotation is
  therefore capped just below that point, and above it the **blur of the
  pinion** carries the speed — exactly what the eye sees on a real motor.

---

*Kablix in-house component — drawing by Frank Sauret.*
