# Spider robot

![Spider robot](../../img/composants/araignee.webp)

A complete **quadruped robot**: a chassis and **4 legs with 2 joints each** (coxa and patella), i.e. **8 servo motors**. All the electronics are **on board, inside the body** — a **Pico W**, a [PCA9685 PWM driver](pca9685.md) and the battery: the 8 servos are wired internally, they never appear on the sheet.

**The robot has no pins at all: there is nothing to wire.** It *is* the board. Dropping it on the sheet selects the **Pico W** as the target board, and the program you write runs inside it, exactly as on a bare Pico W. The board is drawn on the chassis's back — the landmark telling where the code goes.

The robot is drawn **in 3D** (isometric view): the coxas sweep the ground, the patellas lift the legs, and the **drop shadow** under each foot tells which ones are down. A rear leg passes behind the chassis, a front one in front of it.

> **Placeholder drawing.** This component illustrates a simplified spider until the physical robot — a laser-cut PMMA spider, assembled by Frank in SketchUp — is visible. The drawing will likely be redone once the result is seen.

Palette category: **Systems**.

## Pins

**None.** The I²C bus, the power supply and the 8 servos are internal to the robot: there is nothing to connect outside. An older sheet that wired its former I²C terminal loses those wires when opened — they no longer lead anywhere.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `ad0` … `ad5` | State of the six address pads of the on-board PCA9685 (ticked = pad **high**) | all ticked |
| `speed` | Time for a full 360° turn at full speed (s), 0 = instant movement | `2` |
| `boards` | Show the on-board electronics (PCA9685, battery) | unchecked |
| `revcoxa0` … `revpatella3` | Servo mounted **the other way round**: the same setpoint turns it the other way | unchecked |

The on-board PCA9685's address is set **as on the real board**, by ticking the six **AD0 to AD5** pads; it is displayed below the boxes. All ticked — the factory setting of the Grove module — give **0x7F**, the robot's default address. The full computation is in the [PCA9685 page](pca9685.md).

All eight joints follow the same angles as the [single leg](patte.md): coxa 90° = rest, patella 90° = shin vertical (robot standing), 180° = leg stretched horizontally, 0° = leg folded.

### Servos mounted the other way round

On the real chassis the eight servos are not all screwed on the same side: given the same setpoint, some turn the other way. Tick the box of the joint concerned (`revcoxa0` = front-left coxa, `revpatella3` = rear-right patella…) and the simulation applies **180 − angle** to that servo.

This is a **mounting** setting, not a program one: the code keeps sending "30°", the mechanics decide which way it goes. Handy to reproduce the behaviour of an already assembled robot in the simulation, without rewriting its program.

## PWM channels

The internal wiring is fixed: every joint has its own channel on the on-board PCA9685.

| Channel | Joint |
|-------|--------------|
| 0 / 1 | **Front-left** coxa / patella |
| 2 / 3 | **Front-right** coxa / patella |
| 4 / 5 | **Rear-left** coxa / patella |
| 6 / 7 | **Rear-right** coxa / patella |

The right-hand legs are **mirrored** with respect to the left-hand ones, as on the robot: the same patella angle bends both sides symmetrically.

## Usage

- Drop the robot **alone** on the sheet: the board switches to **Pico W** automatically, there is nothing to wire.
- Open an I²C bus in your program (`I2C(0, sda=Pin(0), scl=Pin(1))`): this is the robot's **internal** bus, it reaches the on-board PCA9685 whatever pin numbers you pick.
- Drive the channels exactly like those of a PCA9685 sitting on the sheet: set the prescaler to 50 Hz, then write the wanted pulse width (500 µs = 0°, 1500 µs = 90°, 2500 µs = 180°).
- To animate a single leg, just write its two channels: a channel that is never written leaves its joint still.
- Tick **Show on-board electronics** to reveal the PCA9685 and the battery inside the body (handy to explain the build, pointless for the simulation).

Example test: `araignee-pico` (`testkablix` folder). No Arduino test: the robot is a Pico W, it cannot be programmed from an Uno.

---

*PLACEHOLDER drawing made by Claude for Kablix, pending Frank's final artwork.*
