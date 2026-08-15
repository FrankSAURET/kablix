# Spider leg

![Spider leg](../../img/composants/patte.webp)

Articulated robot leg with **2 independent internal servo motors**: the **coxa**, which sweeps the leg **on the ground** (forward/backward), and the **patella**, which **raises and lowers** it. Both are mechanically nested — the patella follows the coxa's rotation, like a real leg. Meant to build a hexapod or spider robot with several legs, wired to the channels of a [PCA9685 PWM driver](pca9685.md).

This is **exactly the leg of the [spider robot](araignee.md)**: the femur and the shin are the same parts, mounted on their own and seen **in 3D** (isometric view) — the only way to show both movements, one in the ground plane and the other in the vertical plane. The **drop shadow** under the foot shows its height at a glance.

Palette category: **Systems**.

## Pins

On the left of the drawing, the **connector** carries two 3-wire terminals, one per joint — **Coxa** (purple) and **Patella** (green) — like a plain servo motor. The three **golden squares** of each terminal are the connection points; their name is not written on the drawing, it shows in the **tooltip** on hover:

| Pin             | Role                    |
| --------------- | ----------------------- |
| **coxa.GND**    | Coxa ground             |
| **coxa.V+**     | Coxa supply (+)         |
| **coxa.PWM**    | Coxa control signal     |
| **patella.GND** | Patella ground          |
| **patella.V+**  | Patella supply (+)      |
| **patella.PWM** | Patella control signal  |

(in drawing order, top to bottom)

The two joints are electrically **independent**: nothing prevents driving the coxa from a microcontroller pin and the patella from a PCA9685 channel, for instance.

## Properties

| Property      | Role                                                                                 | Default   |
| ------------- | ------------------------------------------------------------------------------------ | --------- |
| `pulsemin`    | Pulse width at 0° (µs), shared by both joints                                        | `500`     |
| `pulsemax`    | Pulse width at 180° (µs), shared by both joints                                      | `2500`    |
| `speed`       | Time for a full 360° turn at full speed (s), 0 = instant movement                    | `2`       |
| `revcoxa`     | Coxa servo mounted **the other way round**: the same setpoint turns it the other way | unchecked |
| `revpatella`  | Patella servo mounted **the other way round**                                        | unchecked |
| `zerocoxa`    | Angle **drawn** when the program sends 0° to the coxa (−360 to +360°)                | `0`       |
| `zeropatella` | Same for the patella                                                                 | `0`       |

Both reverse boxes are a **mounting** setting, not a program one: depending on the side the servo is screwed on, the same setpoint goes the other way. Tick the box and the simulation applies **180 − angle** to that joint — the code keeps sending "30°".

The two **zeros** are the other half of the same setting: the horn goes back on splines, it rarely lands exactly where you would like. `zerocoxa = 20` means "when the program sends 0°, the leg already points at 20°". The offset is added **after** the reversal: both add up, one gives the direction, the other the origin.

### What each angle draws

| Angle    | Coxa (ground sweep)        | Patella (foot height)                                       |
| -------- | -------------------------- | ----------------------------------------------------------- |
| **0°**   | A quarter turn one way     | Leg **folded**, foot tucked up under the body               |
| **90°**  | Rest position              | Shin **vertical**: the foot touches the ground, robot stands |
| **180°** | A quarter turn the other way | Leg **stretched horizontally**, belly on the ground         |

## Usage

- Wire `coxa.PWM` and `patella.PWM` each to a PWM-capable microcontroller pin, or to a PCA9685 channel (`coxa.V+`/`coxa.GND` and `patella.V+`/`patella.GND` to the matching servo terminal).
- `Servo` library (Arduino): one object per joint, `attach()` then `write(angle)`.
- For a 4-legged spider: place 4 instances of the component and wire each to 2 channels of the PCA9685(s). The complete robot also exists ready-built: see [spider robot](araignee.md).

Example tests: `patte-uno` and `patte-pico` (`testkablix` folder).

---

*Leg and connector drawn by Frank (*`Composants3D.svg`* and *`Composants2D.svg`* boards), turned into 3D by Kablix.*
