# NTC 温度传感器

![NTC 温度传感器](../../img/composants/ntc-temp.webp)

NTC 热敏电阻：电阻随温度变化。模拟输出。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VCC** | 电源 (+) |
| **OUT** | 模拟输出 |
| **GND** | 地 |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `value` | 模拟的温度 (%) | 50 |

## 用法

- OUT 接模拟输入。
- 用 Steinhart-Hart 方程把 ADC 值换算成 °C。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-ntc-temperature-sensor) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
