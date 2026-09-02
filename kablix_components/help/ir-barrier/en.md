# Through-beam infrared barrier

![Through-beam infrared barrier](ir-barrier.webp)

Two housings looking at each other. The right-hand one sends an infrared beam —
invisible to the eye — the left-hand one receives it. As long as the light gets
through, the barrier says “nothing is passing”. As soon as an object cuts the
beam, it says that too. This is the sensor of gates, lifts and part counters.

Library part: it is installed through the component manager, it is not in the
stock palette.

## Pins

| Pin | Role |
|--------|------|
| **Vcc.e** (red, emitter) | Emitter supply, 5 V |
| **GND.e** (black, emitter) | Emitter ground |
| **Vcc.r** (red, receiver) | Receiver supply, 5 V |
| **GND.r** (black, receiver) | Receiver ground |
| **Out** (yellow, receiver) | Output, to be wired to a digital pin |

**Both** housings must be powered. An emitter with no supply lights nothing: the
receiver then believes an obstacle is there all the time.

## A pull-up resistor is mandatory

The output is **open collector**: inside, there is only a switch to the ground.
It can pull the wire DOWN, never up. On its own, it therefore stays at 0
whatever happens.

Somebody has to pull it back up. Two ways:

- a **10 kΩ resistor** between `Out` and the 5 V (the “pull-up”);
- or the **internal** pull-up of the board, switched on by the program:
  `pinMode(2, INPUT_PULLUP)` on the Arduino side, `Pin(2, Pin.IN, Pin.PULL_UP)`
  on the Pico side.

Without either one, Kablix frames the part in red and says so. And above all,
never wire `Out` straight to the 5 V without a resistor: the moment the sensor
pulls, it is the supply that gets shorted out.

## What the output is worth

| Beam | Output transistor | `Out` |
|----------|----------------------|-------|
| Passing (nothing between the two housings) | conducts, it pulls to the ground | **0** |
| Cut (an object is there) | blocked, the pull-up brings the wire back up | **1** |

The output is therefore **active high** when an object goes past. A
`digitalRead()` returning 1 = obstacle.

## Simulation

In simulation, the part shows an **Obstacle** checkbox. Ticked, the yellow bar
rises between the two housings and cuts the beam: `Out` goes to 1. Unticked, the
bar goes back down, the light gets through again, `Out` falls back to 0.

Kablix checks the wiring: supply of both housings, presence of a pull-up
(external or internal), and absence of a short on the output. Every fault is
named.

---

*Drawing and sheet: Frank Sauret. Reference: [DFRobot SEN0499](https://www.dfrobot.com/product-2388.html).*
