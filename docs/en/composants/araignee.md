# Spider robot

![Spider robot](../../img/composants/araignee.webp)

A complete **quadruped robot**: a chassis and **4 legs with 2 joints each** (coxa and patella), i.e. **8 servo motors**. All the electronics are **on board, inside the body** — a **Pico W**, a [PCA9685 PWM driver](pca9685.md) and the battery: the 8 servos are wired internally, they never appear on the sheet.

**The robot has no pins at all: there is nothing to wire.** It *is* the board. Dropping it on the sheet selects the **Pico W** as the target board, and the program you write runs inside it, exactly as on a bare Pico W. The board is drawn on the chassis's back — the landmark telling where the code goes.

The robot is drawn **in 3D** (isometric view): the coxas sweep the ground, the patellas lift the legs.

> This is almost the **real robot**: its parts are the laser-cut PMMA ones — sandwich body, femur and shin of each leg, servos and boards in place. Lengths, coxa spacing, body height and travel all come from the drawing; the component fixes none of them. Redrawing a part therefore changes the robot on screen, without touching the code.

Palette category: **Systems**.

## Pins

**None.** The I²C bus, the power supply and the 8 servos are internal to the robot: there is nothing to connect outside.

## Properties

| Property                     | Role                                                                          | Default    |
| ---------------------------- | ----------------------------------------------------------------------------- | ---------- |
| `ad0` … `ad5`                | State of the six address pads of the on-board PCA9685 (ticked = pad **high**) | all ticked |
| `pulsemin`                   | Pulse width for 0° (µs), for the eight servos                                 | `500`      |
| `pulsemax`                   | Pulse width for 180° (µs), for the eight servos                               | `2500`     |
| `speed`                      | Time for a full 360° turn at full speed (s), 0 = instant movement             | `2`        |
| `chcoxa0` … `chpatella3`     | PCA9685 channel this servo is **plugged into** (0 to 15)                      | **empty**  |
| `revcoxa0` … `revpatella3`   | Servo mounted **the other way round**: the same setpoint turns it the other way | unchecked |
| `zerocoxa0` … `zeropatella3` | Angle **drawn** when the program sends 0° to that servo (−360 to +360°)       | `0`        |

### Thirty-three settings in five drawers

The robot has more of them than any other component, so they are filed into **five collapsible sections**, **all closed** when it is selected.

| Section                        | What it sets                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Configure the 16-servo board** | The six address pads of the on-board PCA9685                                                       |
| **Wire the servos**            | The PCA9685 output each of the eight servos is plugged into — to be filled in, nothing is assumed   |
| **Reverse the servos**         | The eight mounting-direction boxes. The direction of travel must match the real model for the code to be portable |
| **Set the servo zeros**        | The eight horn offsets. Same reason.                                                                |
| **Servo parameters**           | Pulse widths at 0° and 180°, rotation time                                                          |

Above the sections, outside any drawer, the computed **I²C address**: it is what you come looking for most often, it should not have to be earned.

The on-board PCA9685's address is set **as on the real board**, by ticking the six **AD0 to AD5** pads. All ticked — the factory setting of the Grove module — give **0x7F**, the robot's default address. The full computation is in the [PCA9685 page](pca9685.md).

All eight joints follow the same angles as the [single leg](patte.md): coxa 90° = rest (the leg points outwards, along the axis of its chassis corner), patella 90° = **shin vertical, robot standing, all four feet on the ground**. 180° stretches the leg in line with the femur, 0° folds it the other way.

### Servo pulse width

The eight servos are identical, so there is **a single scale** for all of them: `pulsemin` is the pulse that means 0°, `pulsemax` the one that means 180°. The defaults are those of the robot's servos (**500 – 2500 µs**, SF90 datasheet).

This setting is what makes the **intermediate** angles land right. A wrong scale does not show at the extremes — 1500 µs is 90° in just about any scale, and the end stops catch the ends — but a 130° setpoint is likely to be off, and the robot does not strike the pose the program asks for.

### Servos mounted the other way round

On the real chassis the eight servos are not all screwed on the same side: given the same setpoint, some turn the other way. Tick the box of the joint concerned (`revcoxa0` = front-left coxa, `revpatella3` = rear-right patella…) and the simulation applies **180 − angle** to that servo.

This is a **mounting** setting, not a program one: the code keeps sending "30°", the mechanics decide which way it goes.

> Essential to reproduce in the simulation the behaviour of an already assembled robot, without rewriting its program.

### The zero of each servo

Same story for the **origin**. On the real model, out of eight servos none is set exactly like its neighbour, and the robot ends up crooked while the program sends the same angles everywhere.

A full turn is allowed either way (**−360 to +360°**, to the degree). The offset is applied **after** the reversal: the tick box gives the direction, the zero gives the origin, and both add up on the same joint. Here again nothing changes in the program — it is the chassis you are describing.

## PWM channels

Each joint states **which output of the on-board PCA9685** its servo is plugged into. The eight boxes are **empty when the robot is dropped**: nothing is assumed, you describe your own wiring.

| Joint                          | Properties               |
| ------------------------------ | ------------------------ |
| **Front-left** coxa / patella  | `chcoxa0` / `chpatella0` |
| **Front-right** coxa / patella | `chcoxa1` / `chpatella1` |
| **Rear-left** coxa / patella   | `chcoxa2` / `chpatella2` |
| **Rear-right** coxa / patella  | `chcoxa3` / `chpatella3` |

### One small box per servo, from 0 to 15

The **Wire the servos** drawer lines up eight **two-character boxes** — no spinner, no **+** / **−** buttons: an output number is not something you hunt for by trial and error, you read it off the board and type it in.

> The value goes from **0 to 15**, which matches the **1 to 16** marking on the board: the output marked **1** is channel **0**.

**A channel cannot be used twice.** A number already taken by another joint is refused as you type — the box blinks red and reverts to its previous value. Same above 15.

When the **simulation starts**, the boxes left empty are reported: a message in the status bar and a red frame around the robot. The simulation still runs — the wired joints move, the ones left empty stay still.

This is the third **mounting** setting, along with direction and zero: the program itself does not change. Write channel 0 in your code, and whichever joint has `0` in its properties is the one that moves.

The right-hand legs are **mirrored** with respect to the left-hand ones, as on the robot: the same patella angle bends both sides symmetrically.

## Usage

- Drop the robot **alone** on the sheet: the board switches to **Pico W** automatically, there is nothing to wire.
- Open an I²C bus in your program (`I2C(0, sda=Pin(0), scl=Pin(1))`): this is the robot's **internal** bus, it reaches the on-board PCA9685 whatever pin numbers you pick.
- Drive the channels exactly like those of a PCA9685 sitting on the sheet: set the prescaler to 50 Hz, then write the wanted pulse width (500 µs = 0°, 1500 µs = 90°, 2500 µs = 180°).
- To animate a single leg, just write its two channels: a channel that is never written leaves its joint still.

Example test: `araignee-pico` (`testkablix` folder).

---

*Robot drawn by Frank SAURET (*`Composants3D.svg`* board) and turned into 3D by Kablix.*
