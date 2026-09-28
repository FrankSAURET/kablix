# 气体传感器 (MQ)

![气体传感器 (MQ)](../../img/composants/gas-sensor.webp)

MQ 系列气体/烟雾传感器。带模拟（浓度）和数字（阈值）输出。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VCC** | 电源 (+) |
| **GND** | 地 |
| **AOUT** | 模拟输出 |
| **DOUT** | 数字输出（阈值） |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `value` | 模拟的气体浓度 (%) | 20 |

## 用法

- AOUT 接模拟输入。
- 真实传感器需要预热。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-gas-sensor) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
