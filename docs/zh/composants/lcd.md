# 字符 LCD

![字符 LCD](../../img/composants/lcd.webp)

字符型 LCD 显示屏 (HD44780)。16×2 或 20×4，I²C（4 线）或并口接口。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **GND / VCC** | 电源（I²C 模式） |
| **SDA / SCL** | I²C 总线（I²C 模式） |
| **RS, RW, E, D0–D7** | 并行总线（并口模式） |
| **V0** | 对比度 |
| **A / K** | 背光 |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `pins` | 接口（I²C / 并口） | i2c |
| `lcdSize` | 尺寸（16×2 / 20×4） | 16x2 |

## 用法

- I²C：只需 4 根线（GND、VCC、SDA、SCL）+ 地址（通常为 0x27）。
- 只有 **I²C** 模式会仿真文字；并口模式下显示屏仅作外观展示。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-lcd1602) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
