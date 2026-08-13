# Spider leg

![Spider leg](../../img/composants/patte.webp)

Articulated robot leg with **2 independent internal servo motors**: the **coxa**, which sweeps the leg **on the ground** (forward/backward), and the **patella**, which **raises and lowers** it. Both are mechanically nested — the patella follows the coxa's rotation, like a real leg. Meant to build a hexapod or spider robot with several legs, wired to the channels of a [PCA9685 PWM driver](pca9685.md).

The leg is drawn **in 3D** (isometric view): that is the only way to show both movements, one in the ground plane and the other in the vertical plane. The **drop shadow** under the foot shows its height at a glance.

> **Placeholder drawing.** This component illustrates a simplified leg until the physical robot — a laser-cut PMMA spider, assembled by Frank in SketchUp — is visible. The drawing will likely be redone once the result is seen.

Palette category: **Systems**.

## Pins

Each joint has its own 3-wire terminal, like a plain servo motor:

| Pin | Role |
|--------|------|
| **coxa.PWM** | Coxa control signal |
| **coxa.V+** | Coxa supply (+) |
| **coxa.GND** | Coxa ground |
| **patella.PWM** | Patella control signal |
| **patella.V+** | Patella supply (+) |
| **patella.GND** | Patella ground |

The two joints are electrically **independent**: nothing prevents driving the coxa from a microcontroller pin and the patella from a PCA9685 channel, for instance.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `pulsemin` | Pulse width at 0° (µs), shared by both joints | `500` |
| `pulsemax` | Pulse width at 180° (µs), shared by both joints | `2500` |
| `speed` | Time for a full 360° turn at full speed (s), 0 = instant movement | `2` |
| `revcoxa` | Coxa servo mounted **the other way round**: the same setpoint turns it the other way | unchecked |
| `revpatella` | Patella servo mounted **the other way round** | unchecked |

Both reverse boxes are a **mounting** setting, not a program one: depending on the side the servo is screwed on, the same setpoint goes the other way. Tick the box and the simulation applies **180 − angle** to that joint — the code keeps sending "30°".

### What each angle draws

| Angle | Coxa (ground sweep) | Patella (foot height) |
|-------|--------------------|--------------------|
| **0°** | A quarter turn one way | Leg **folded**, foot tucked up under the body |
| **90°** | Rest position | Shin **vertical**: the foot touches the ground, the robot stands |
| **180°** | A quarter turn the other way | Leg **stretched horizontally**, belly on the ground |

## Usage

- Wire `coxa.PWM` and `patella.PWM` each to a PWM-capable microcontroller pin, or to a PCA9685 channel (`coxa.V+`/`coxa.GND` and `patella.V+`/`patella.GND` to the matching servo terminal).
- `Servo` library (Arduino): one object per joint, `attach()` then `write(angle)`.
- For a 4-legged spider: place 4 instances of the component and wire each to 2 channels of the PCA9685(s).

---

*PLACEHOLDER drawing made by Claude for Kablix, pending Frank's final artwork.*
