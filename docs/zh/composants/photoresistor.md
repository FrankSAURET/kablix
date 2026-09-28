# 光敏电阻 (LDR)

![光敏电阻 (LDR)](../../img/composants/photoresistor.webp)

光线传感器：其电阻随光照变化。带模拟和数字输出。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VCC** | 电源 (+) |
| **GND** | 地 |
| **AO** | 模拟输出（亮度） |
| **DO** | 数字输出（阈值） |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `value` | 模拟的亮度 (%) | 50 |

## 用法

- AO 接模拟输入，用 `analogRead()` 读取。
- DO 根据可调阈值翻转（在真实模块上调节）。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
