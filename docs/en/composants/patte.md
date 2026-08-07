# Spider leg

![Spider leg](../../img/composants/patte.webp)

Articulated robot leg with **2 independent internal servo motors**: the **hip**, which sweeps the leg **on the ground** (forward/backward), and the **knee**, which **raises and lowers** it. Both are mechanically nested — the knee follows the hip's rotation, like a real leg. Meant to build a hexapod or spider robot with several legs, wired to the channels of a [PCA9685 PWM driver](pca9685.md).

The leg is drawn **in 3D** (isometric view): that is the only way to show both movements, one in the ground plane and the other in the vertical plane. The **drop shadow** under the foot shows its height at a glance.

> **Placeholder drawing.** This component illustrates a simplified leg until the physical robot — a laser-cut PMMA spider, assembled by Frank in SketchUp — is visible. The drawing will likely be redone once the result is seen.

Palette category: **Systems**.

## Pins

Each joint has its own 3-wire terminal, like a plain servo motor:

| Pin | Role |
|--------|------|
| **hanche.PWM** | Hip control signal |
| **hanche.V+** | Hip supply (+) |
| **hanche.GND** | Hip ground |
| **genou.PWM** | Knee control signal |
| **genou.V+** | Knee supply (+) |
| **genou.GND** | Knee ground |

The two joints are electrically **independent**: nothing prevents driving the hip from a microcontroller pin and the knee from a PCA9685 channel, for instance.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `pulsemin` | Pulse width at 0° (µs), shared by both joints | `500` |
| `pulsemax` | Pulse width at 180° (µs), shared by both joints | `2500` |
| `speed` | Time for a full 360° turn at full speed (s), 0 = instant movement | `2` |

### What each angle draws

| Angle | Hip (ground sweep) | Knee (foot height) |
|-------|--------------------|--------------------|
| **0°** | A quarter turn one way | Leg **folded**, foot tucked up under the body |
| **90°** | Rest position | Shin **vertical**: the foot touches the ground, the robot stands |
| **180°** | A quarter turn the other way | Leg **stretched horizontally**, belly on the ground |

## Usage

- Wire `hanche.PWM` and `genou.PWM` each to a PWM-capable microcontroller pin, or to a PCA9685 channel (`hanche.V+`/`hanche.GND` and `genou.V+`/`genou.GND` to the matching servo terminal).
- `Servo` library (Arduino): one object per joint, `attach()` then `write(angle)`.
- For a 4-legged spider: place 4 instances of the component and wire each to 2 channels of the PCA9685(s).

---

*PLACEHOLDER drawing made by Claude for Kablix, pending Frank's final artwork.*
