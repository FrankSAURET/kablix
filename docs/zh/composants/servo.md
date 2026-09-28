# 舵机

![舵机](../../img/composants/servo.webp)

由 PWM 信号控制的位置舵机（角度 0–180°）。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **PWM** | 控制信号 |
| **V+** | 电源 (+) |
| **GND** | 地 |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `horn` | 舵盘类型（单臂/双臂/十字） | 单臂 |

## 用法

- PWM 接引脚，V+ 接 +5 V，GND 接地。
- `Servo` 库：先 `attach()`，再 `write(角度)`。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-servo) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
